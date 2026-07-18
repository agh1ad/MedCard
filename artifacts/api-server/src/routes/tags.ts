import { Router } from "express";
import { db } from "@workspace/db";
import { cardsTable } from "@workspace/db";

const router = Router();

// GET /api/tags
router.get("/", async (req, res) => {
  try {
    const allCards = await db.select({ tags: cardsTable.tags }).from(cardsTable);

    const tagSet = new Set<string>();
    for (const card of allCards) {
      for (const tag of card.tags ?? []) {
        tagSet.add(tag);
      }
    }

    const sortedTags = Array.from(tagSet).sort();
    res.json(sortedTags);
  } catch (err) {
    req.log.error({ err }, "Error listing tags");
    res.status(500).json({ error: "Failed to list tags" });
  }
});

export default router;
