import { Router, type Request, type Response } from "express";
import { db, cardsTable, foldersTable, notebooksTable } from "@workspace/db";
import {
  CreateFolderBody,
  CreateNotebookBody,
  DeleteFolderParams,
  DeleteNotebookParams,
  UpdateFolderBody,
  UpdateFolderParams,
  UpdateNotebookBody,
  UpdateNotebookParams,
} from "@workspace/api-zod";
import { asc, eq } from "drizzle-orm";

const router = Router();

router.get("/library", async (req: Request, res: Response) => {
  try {
    const [folders, notebooks] = await Promise.all([
      db.select().from(foldersTable).orderBy(asc(foldersTable.name)),
      db.select().from(notebooksTable).orderBy(asc(notebooksTable.name)),
    ]);
    res.json({ folders, notebooks });
  } catch (err) {
    req.log.error({ err }, "Error listing library");
    res.status(500).json({ error: "Failed to list library" });
  }
});

router.post("/folders", async (req: Request, res: Response) => {
  const parsed = CreateFolderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid folder", details: parsed.error.issues });
    return;
  }
  const [folder] = await db.insert(foldersTable).values(parsed.data).returning();
  res.status(201).json(folder);
});

router.patch("/folders/:id", async (req: Request, res: Response) => {
  const params = UpdateFolderParams.safeParse({ id: Number(req.params["id"]) });
  const body = UpdateFolderBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid folder update" });
    return;
  }
  const [folder] = await db.update(foldersTable).set({ ...body.data, updatedAt: new Date() }).where(eq(foldersTable.id, params.data.id)).returning();
  if (!folder) {
    res.status(404).json({ error: "Folder not found" });
    return;
  }
  res.json(folder);
});

router.delete("/folders/:id", async (req: Request, res: Response) => {
  const parsed = DeleteFolderParams.safeParse({ id: Number(req.params["id"]) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid folder ID" });
    return;
  }
  const [folder] = await db.select().from(foldersTable).where(eq(foldersTable.id, parsed.data.id));
  if (!folder) {
    res.status(404).json({ error: "Folder not found" });
    return;
  }
  await db.update(foldersTable).set({ parentId: folder.parentId }).where(eq(foldersTable.parentId, folder.id));
  await db.update(notebooksTable).set({ folderId: folder.parentId }).where(eq(notebooksTable.folderId, folder.id));
  await db.delete(foldersTable).where(eq(foldersTable.id, folder.id));
  res.status(204).send();
});

router.post("/notebooks", async (req: Request, res: Response) => {
  const parsed = CreateNotebookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid notebook", details: parsed.error.issues });
    return;
  }
  const [notebook] = await db.insert(notebooksTable).values(parsed.data).returning();
  res.status(201).json(notebook);
});

router.patch("/notebooks/:id", async (req: Request, res: Response) => {
  const params = UpdateNotebookParams.safeParse({ id: Number(req.params["id"]) });
  const body = UpdateNotebookBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid notebook update" });
    return;
  }
  const [notebook] = await db.update(notebooksTable).set({ ...body.data, updatedAt: new Date() }).where(eq(notebooksTable.id, params.data.id)).returning();
  if (!notebook) {
    res.status(404).json({ error: "Notebook not found" });
    return;
  }
  res.json(notebook);
});

router.delete("/notebooks/:id", async (req: Request, res: Response) => {
  const parsed = DeleteNotebookParams.safeParse({ id: Number(req.params["id"]) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid notebook ID" });
    return;
  }
  await db.update(cardsTable).set({ notebookId: null, updatedAt: new Date() }).where(eq(cardsTable.notebookId, parsed.data.id));
  const [deleted] = await db.delete(notebooksTable).where(eq(notebooksTable.id, parsed.data.id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Notebook not found" });
    return;
  }
  res.status(204).send();
});

export default router;
