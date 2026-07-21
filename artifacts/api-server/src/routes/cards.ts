import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  cardsTable,
  convertFlatFlowToTree,
  emptySectionTrees,
} from "@workspace/db";
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
import {
  getCardOrganization,
  startCardOrganization,
} from "../lib/card-organizer";

const router = Router();

function getOpenAI(): OpenAI {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured. Please add it to your Replit Secrets.",
    );
  }
  return new OpenAI({ apiKey, maxRetries: 0 });
}

function sendGenerationError(res: Response, err: unknown): void {
  if (err instanceof OpenAI.APIError) {
    if (err.code === "insufficient_quota") {
      res.status(402).json({
        error:
          "OpenAI API credit is unavailable. Check that billing is active for the project that owns this API key.",
      });
      return;
    }

    if (err.status === 429) {
      res.status(429).json({
        error:
          "OpenAI is temporarily rate-limited. Flex processing can be retried in a moment without switching to a more expensive model.",
      });
      return;
    }

    res.status(502).json({ error: `OpenAI request failed: ${err.message}` });
    return;
  }

  const message =
    err instanceof Error ? err.message : "Unknown generation error";
  res.status(500).json({ error: message });
}

// Apply compat conversion to a card coming from the DB
function normalizeCard(card: typeof cardsTable.$inferSelect) {
  const flow = Array.isArray(card.flow)
    ? convertFlatFlowToTree(card.flow as unknown[])
    : [];
  return {
    ...card,
    flow,
    sourceBlocks: card.sourceBlocks ?? [],
    sectionTrees: card.sectionTrees ?? emptySectionTrees(),
    images: card.images ?? [],
  };
}

const SYSTEM_PROMPT = `You are a medical study note organizer. Your ONLY job is to restructure raw medical information into a structured JSON format WITHOUT adding, inventing, or editorializing any information. Only reorganize what is explicitly in the text.

## Output format

Output a JSON object with EXACTLY this structure:
{
  "flow": [ <FlowNode>, ... ],
  "sidebar": {
    "high_yield": ["...", ...],
    "risk_factors": ["...", ...],
    "diagnosis": ["...", ...],
    "treatment": ["...", ...],
    "complications": ["...", ...]
  }
}

## FlowNode definition (RECURSIVE TREE)

Each FlowNode is:
{
  "id": "<unique string, e.g. '1', '2a', '3b'>",
  "label": "<concise text for this node>",
  "sublabel": "<optional extra detail, or null>",
  "children": [ <FlowNode>, ... ]
}

The "flow" array contains ROOT nodes only (usually just one — the first cause or main disease entity).

BRANCHING: When a node leads to MULTIPLE parallel outcomes or mechanisms, list all of them as children of that node. They will be displayed side-by-side horizontally. Do NOT flatten branches into a linear chain — preserve the true branching.

## Example (Hypertrophic Pyloric Stenosis)

Input text: "HPS — hypertrophy of pyloric circular smooth muscle → narrowed pyloric canal → gastric outlet obstruction → impaired gastric emptying → projectile non-bilious vomiting after feeding. Consequences: (1) hunger after vomiting, (2) dehydration, (3) HCl loss → alkalosis → Na/H exchange in kidney → hypokalemia → hypochloremic hypokalemic metabolic alkalosis, (4) on exam: visible peristalsis + palpable olive mass in epigastric region. Timing: 2–6 weeks after birth, first-born males. Diagnosis: ultrasound (target sign), GI contrast (string sign). Treatment: Ramstedt pyloromyotomy."

Correct output:
{
  "flow": [
    {
      "id": "1",
      "label": "Hypertrophy of pyloric circular smooth muscle",
      "sublabel": null,
      "children": [
        {
          "id": "2",
          "label": "Narrowed pyloric canal",
          "sublabel": null,
          "children": [
            {
              "id": "3",
              "label": "Gastric outlet obstruction",
              "sublabel": null,
              "children": [
                {
                  "id": "4",
                  "label": "Impaired gastric emptying",
                  "sublabel": null,
                  "children": [
                    {
                      "id": "5",
                      "label": "Projectile non-bilious vomiting after feeding",
                      "sublabel": null,
                      "children": [
                        {
                          "id": "5a",
                          "label": "Hunger after vomiting",
                          "sublabel": "\"Hungry vomiter\"",
                          "children": []
                        },
                        {
                          "id": "5b",
                          "label": "Dehydration",
                          "sublabel": null,
                          "children": []
                        },
                        {
                          "id": "5c",
                          "label": "HCl loss",
                          "sublabel": null,
                          "children": [
                            {
                              "id": "5c1",
                              "label": "Alkalosis",
                              "sublabel": null,
                              "children": [
                                {
                                  "id": "5c1a",
                                  "label": "Na\u207a/H\u207a exchange in kidney \u2192 \u2193K\u207a",
                                  "sublabel": null,
                                  "children": [
                                    {
                                      "id": "5c1a1",
                                      "label": "Hypochloremic hypokalemic metabolic alkalosis",
                                      "sublabel": null,
                                      "children": []
                                    }
                                  ]
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "id": "5d",
                          "label": "On exam",
                          "sublabel": null,
                          "children": [
                            {
                              "id": "5d1",
                              "label": "Visible peristalsis in upper abdomen",
                              "sublabel": null,
                              "children": []
                            },
                            {
                              "id": "5d2",
                              "label": "Palpable \u201colive\u201d mass in epigastric region",
                              "sublabel": null,
                              "children": []
                            }
                          ]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  "sidebar": {
    "high_yield": ["First-born males most affected", "Timing: 2–6 weeks after birth", "Ramstedt pyloromyotomy is curative"],
    "risk_factors": ["First-born male", "Exposure to macrolides (e.g. erythromycin) — stimulates peristalsis"],
    "diagnosis": ["Ultrasound: target sign (gold standard)", "GI contrast: string sign"],
    "treatment": ["Ramstedt pyloromyotomy"],
    "complications": ["Hypochloremic hypokalemic metabolic alkalosis from HCl loss"]
  }
}

## Rules

1. ONLY use information from the provided text. Do NOT add facts not present.
2. Build a true branching tree. If one step leads to multiple things, list them all as children (side-by-side). Do NOT force parallel branches into a linear chain.
3. If a section (high_yield, risk_factors, etc.) has no info in the text, leave it as [].
4. Keep node labels concise (one short phrase per node). Use sublabel for secondary detail.
5. IDs must be unique strings within the tree (e.g. "1", "2", "2a", "2b", "2b1").
6. Output ONLY the JSON object. No markdown, no explanation.`;

// GET /api/cards
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = ListCardsQueryParams.safeParse(req.query);
    const search = parsed.success ? parsed.data.search : undefined;
    const tag = parsed.success ? parsed.data.tag : undefined;
    const notebookId = parsed.success ? parsed.data.notebookId : undefined;

    let allCards = (
      await db.select().from(cardsTable).orderBy(desc(cardsTable.createdAt))
    ).map(normalizeCard);

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

    if (notebookId !== undefined) {
      allCards = allCards.filter((c) => c.notebookId === notebookId);
    }

    res.json(allCards);
  } catch (err) {
    req.log.error({ err }, "Error listing cards");
    res.status(500).json({ error: "Failed to list cards" });
  }
});

// POST /api/cards/generate — start one durable background AI response
router.post("/generate", async (req: Request, res: Response): Promise<void> => {
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
    const progress = await startCardOrganization(openai, rawText, topic);
    res.status(progress.status === "completed" ? 200 : 202).json(progress);
  } catch (err) {
    req.log.error({ err }, "Error starting OpenAI card organization");
    sendGenerationError(res, err);
  }
});

// POST /api/cards/generate/:responseId — retrieve the same AI response
router.post(
  "/generate/:responseId",
  async (req: Request, res: Response): Promise<void> => {
    const rawResponseId = req.params.responseId;
    const responseId = Array.isArray(rawResponseId)
      ? rawResponseId[0]
      : rawResponseId;
    if (!responseId || !/^resp_[A-Za-z0-9_-]+$/.test(responseId)) {
      res.status(400).json({ error: "Invalid AI generation job ID" });
      return;
    }

    const parsed = GenerateCardBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.issues,
      });
      return;
    }

    let openai: OpenAI;
    try {
      openai = getOpenAI();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(503).json({ error: message });
      return;
    }

    const { rawText, topic } = parsed.data;
    try {
      const progress = await getCardOrganization(
        openai,
        responseId,
        rawText,
        topic,
      );
      res.status(progress.status === "completed" ? 200 : 202).json(progress);
    } catch (err) {
      req.log.error(
        { err, responseId },
        "Error retrieving OpenAI card organization",
      );
      sendGenerationError(res, err);
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
    const {
      topic,
      flow,
      sidebar,
      sectionTrees,
      sourceBlocks,
      images,
      rawText,
      tags,
      notebookId,
    } = parsed.data;

    const [card] = await db
      .insert(cardsTable)
      .values({
        topic,
        flow: flow as (typeof cardsTable.$inferInsert)["flow"],
        sidebar: sidebar as (typeof cardsTable.$inferInsert)["sidebar"],
        rawText,
        tags: tags ?? [],
        sectionTrees:
          sectionTrees as (typeof cardsTable.$inferInsert)["sectionTrees"],
        sourceBlocks,
        images,
        notebookId: notebookId ?? null,
      })
      .returning();

    res.status(201).json(normalizeCard(card));
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

    res.json(normalizeCard(card));
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
        ...(parsedBody.data.topic !== undefined && {
          topic: parsedBody.data.topic,
        }),
        ...(parsedBody.data.flow !== undefined && {
          flow: parsedBody.data
            .flow as (typeof cardsTable.$inferInsert)["flow"],
        }),
        ...(parsedBody.data.sidebar !== undefined && {
          sidebar: parsedBody.data
            .sidebar as (typeof cardsTable.$inferInsert)["sidebar"],
        }),
        ...(parsedBody.data.sectionTrees !== undefined && {
          sectionTrees: parsedBody.data
            .sectionTrees as (typeof cardsTable.$inferInsert)["sectionTrees"],
        }),
        ...(parsedBody.data.sourceBlocks !== undefined && {
          sourceBlocks: parsedBody.data.sourceBlocks,
        }),
        ...(parsedBody.data.images !== undefined && {
          images: parsedBody.data.images,
        }),
        ...(parsedBody.data.tags !== undefined && {
          tags: parsedBody.data.tags,
        }),
        ...(parsedBody.data.notebookId !== undefined && {
          notebookId: parsedBody.data.notebookId,
        }),
      })
      .where(eq(cardsTable.id, parsedParams.data.id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Card not found" });
      return;
    }

    res.json(normalizeCard(updated));
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
