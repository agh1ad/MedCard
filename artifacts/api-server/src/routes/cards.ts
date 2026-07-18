import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { cardsTable } from "@workspace/db";
import {
  ListCardsQueryParams,
  CreateCardBody,
  GenerateCardBody,
  GetCardParams,
  UpdateCardParams,
  UpdateCardBody,
  DeleteCardParams,
} from "@workspace/api-zod";
import { eq, desc } from "drizzle-orm";
import OpenAI from "openai";

const router = Router();

function getOpenAI(): OpenAI {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured. Please add it to your Replit Secrets.",
    );
  }
  return new OpenAI({ apiKey });
}

const SYSTEM_PROMPT = `You are a medical study note organizer. Your ONLY job is to restructure raw medical information into a structured format WITHOUT adding, inventing, or editorializing any information. You only reorganize what is explicitly provided in the input text.

Output a JSON object with exactly this structure:
{
  "flow": [
    { "label": "step text", "sublabel": null, "indent": 0 },
    ...
  ],
  "sidebar": {
    "high_yield": ["...", ...],
    "risk_factors": ["...", ...],
    "diagnosis": ["...", ...],
    "treatment": ["...", ...],
    "complications": ["...", ...]
  }
}

Rules for "flow":
- Represents the top-down pathophysiology or key mechanism chain (cause → effect → effect → clinical manifestations)
- Each step is a node in the chain. Use indent=0 for the main chain steps, indent=1 for sub-steps or branches off a main step
- Keep labels concise (one line ideally)
- Use sublabel for important detail about a step if present in the text

Rules for "sidebar":
- "high_yield": Key facts, important numbers, must-know points
- "risk_factors": Risk factors, predisposing conditions, associations, epidemiology
- "diagnosis": Diagnostic criteria, investigations, imaging, lab findings, clinical signs
- "treatment": Management, medications, doses if mentioned, procedures
- "complications": Complications, sequelae, prognosis

CRITICAL:
- Do NOT add any information not explicitly in the provided text
- If a section has no relevant information in the text, leave it as an empty array []
- Do NOT write "No information provided" or similar — just leave empty
- Only output the JSON object, no explanation, no markdown fencing`;

// GET /api/cards
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = ListCardsQueryParams.safeParse(req.query);
    const search = parsed.success ? parsed.data.search : undefined;
    const tag = parsed.success ? parsed.data.tag : undefined;

    let allCards = await db
      .select()
      .from(cardsTable)
      .orderBy(desc(cardsTable.createdAt));

    if (search) {
      const lower = search.toLowerCase();
      allCards = allCards.filter(
        (c) =>
          c.topic.toLowerCase().includes(lower) ||
          c.rawText.toLowerCase().includes(lower),
      );
    }

    if (tag) {
      allCards = allCards.filter((c) => c.tags?.includes(tag));
    }

    res.json(allCards);
  } catch (err) {
    req.log.error({ err }, "Error listing cards");
    res.status(500).json({ error: "Failed to list cards" });
  }
});

// POST /api/cards/generate
router.post(
  "/generate",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = GenerateCardBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.issues,
      });
      return;
    }

    const { rawText, topic } = parsed.data;

    let openai: OpenAI;
    try {
      openai = getOpenAI();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(503).json({ error: message });
      return;
    }

    try {
      const userMessage = topic
        ? `Topic: ${topic}\n\nRaw medical information:\n${rawText}`
        : `Raw medical information:\n${rawText}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 4096,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        response_format: { type: "json_object" },
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        res.status(500).json({ error: "AI returned empty response" });
        return;
      }

      let aiData: Record<string, unknown>;
      try {
        aiData = JSON.parse(content) as Record<string, unknown>;
      } catch {
        res.status(500).json({ error: "AI returned invalid JSON" });
        return;
      }

      const sidebarRaw = aiData["sidebar"] as Record<string, unknown> | undefined;

      const result = {
        flow: Array.isArray(aiData["flow"]) ? aiData["flow"] : [],
        sidebar: {
          high_yield: Array.isArray(sidebarRaw?.["high_yield"])
            ? sidebarRaw["high_yield"]
            : [],
          risk_factors: Array.isArray(sidebarRaw?.["risk_factors"])
            ? sidebarRaw["risk_factors"]
            : [],
          diagnosis: Array.isArray(sidebarRaw?.["diagnosis"])
            ? sidebarRaw["diagnosis"]
            : [],
          treatment: Array.isArray(sidebarRaw?.["treatment"])
            ? sidebarRaw["treatment"]
            : [],
          complications: Array.isArray(sidebarRaw?.["complications"])
            ? sidebarRaw["complications"]
            : [],
        },
      };

      res.json(result);
    } catch (err) {
      req.log.error({ err }, "Error calling OpenAI");
      res.status(500).json({ error: "Failed to generate card" });
    }
  },
);

// POST /api/cards
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateCardBody.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid request body", details: parsed.error.issues });
    return;
  }

  try {
    const { topic, flow, sidebar, rawText, tags } = parsed.data;

    const [card] = await db
      .insert(cardsTable)
      .values({
        topic,
        flow: flow as typeof cardsTable.$inferInsert["flow"],
        sidebar: sidebar as typeof cardsTable.$inferInsert["sidebar"],
        rawText,
        tags: tags ?? [],
      })
      .returning();

    res.status(201).json(card);
  } catch (err) {
    req.log.error({ err }, "Error creating card");
    res.status(500).json({ error: "Failed to create card" });
  }
});

// GET /api/cards/stats
router.get("/stats", async (req: Request, res: Response): Promise<void> => {
  try {
    const allCards = await db.select().from(cardsTable);

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const recentCount = allCards.filter(
      (c) => new Date(c.createdAt) >= sevenDaysAgo,
    ).length;

    const tagCounts: Record<string, number> = {};
    for (const card of allCards) {
      for (const tag of card.tags ?? []) {
        tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
      }
    }

    const totalTags = Object.keys(tagCounts).length;
    const topTags = Object.entries(tagCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count }));

    res.json({
      totalCards: allCards.length,
      totalTags,
      recentCount,
      topTags,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching stats");
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// GET /api/cards/:id
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const parsed = GetCardParams.safeParse({ id: Number(req.params["id"]) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid card ID" });
    return;
  }

  try {
    const [card] = await db
      .select()
      .from(cardsTable)
      .where(eq(cardsTable.id, parsed.data.id));

    if (!card) {
      res.status(404).json({ error: "Card not found" });
      return;
    }

    res.json(card);
  } catch (err) {
    req.log.error({ err }, "Error fetching card");
    res.status(500).json({ error: "Failed to fetch card" });
  }
});

// PATCH /api/cards/:id
router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const parsedParams = UpdateCardParams.safeParse({
    id: Number(req.params["id"]),
  });
  if (!parsedParams.success) {
    res.status(400).json({ error: "Invalid card ID" });
    return;
  }

  const parsedBody = UpdateCardBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({
      error: "Invalid request body",
      details: parsedBody.error.issues,
    });
    return;
  }

  try {
    const [updated] = await db
      .update(cardsTable)
      .set({
        updatedAt: new Date(),
        ...(parsedBody.data.topic !== undefined && { topic: parsedBody.data.topic }),
        ...(parsedBody.data.flow !== undefined && {
          flow: parsedBody.data.flow as typeof cardsTable.$inferInsert["flow"],
        }),
        ...(parsedBody.data.sidebar !== undefined && {
          sidebar: parsedBody.data.sidebar as typeof cardsTable.$inferInsert["sidebar"],
        }),
        ...(parsedBody.data.tags !== undefined && { tags: parsedBody.data.tags }),
      })
      .where(eq(cardsTable.id, parsedParams.data.id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Card not found" });
      return;
    }

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Error updating card");
    res.status(500).json({ error: "Failed to update card" });
  }
});

// DELETE /api/cards/:id
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  const parsed = DeleteCardParams.safeParse({ id: Number(req.params["id"]) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid card ID" });
    return;
  }

  try {
    const [deleted] = await db
      .delete(cardsTable)
      .where(eq(cardsTable.id, parsed.data.id))
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "Card not found" });
      return;
    }

    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting card");
    res.status(500).json({ error: "Failed to delete card" });
  }
});

export default router;
