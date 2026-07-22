import {
  pgTable,
  serial,
  text,
  timestamp,
  jsonb,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Recursive primary hierarchy with optional extra incoming DAG connections.
const FlowNodeSchemaBase = z.object({
  id: z.string(),
  label: z.string(),
  sublabel: z.string().nullable().optional(),
});

export type FlowNode = z.infer<typeof FlowNodeSchemaBase> & {
  children?: FlowNode[];
  additionalParentIds?: string[];
  presentation?: "bullets" | "table" | "diagram" | "callout";
  sourceBlockId?: string;
  sourceBlockIds?: string[];
  origin?: "source" | "enhanced" | "ai_added";
  semanticRole?:
    | "core"
    | "manifestation"
    | "diagnosis"
    | "treatment"
    | "complication"
    | "explanation"
    | "fact";
  highlightTerms?: string[];
  tone?: "ink" | "blue" | "green" | "pink" | "violet" | "amber";
  backgroundColor?: string;
  textColor?: string;
};

export const FlowNodeSchema: z.ZodType<FlowNode> = FlowNodeSchemaBase.extend({
  children: z.lazy(() => z.array(FlowNodeSchema)).optional(),
  additionalParentIds: z.array(z.string()).optional(),
  presentation: z.enum(["bullets", "table", "diagram", "callout"]).optional(),
  sourceBlockId: z.string().optional(),
  sourceBlockIds: z.array(z.string()).optional(),
  origin: z.enum(["source", "enhanced", "ai_added"]).optional(),
  semanticRole: z
    .enum([
      "core",
      "manifestation",
      "diagnosis",
      "treatment",
      "complication",
      "explanation",
      "fact",
    ])
    .optional(),
  highlightTerms: z.array(z.string()).optional(),
  tone: z.enum(["ink", "blue", "green", "pink", "violet", "amber"]).optional(),
  backgroundColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  textColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export const SidebarSectionsSchema = z.object({
  high_yield: z.array(z.string()),
  risk_factors: z.array(z.string()),
  diagnosis: z.array(z.string()),
  treatment: z.array(z.string()),
  complications: z.array(z.string()),
});

export type SidebarSections = z.infer<typeof SidebarSectionsSchema>;

export const SourceBlockSchema = z.object({
  id: z.string(),
  text: z.string(),
});

export type SourceBlock = z.infer<typeof SourceBlockSchema>;

export const SectionTreesSchema = z.object({
  high_yield: z.array(FlowNodeSchema),
  risk_factors: z.array(FlowNodeSchema),
  associations: z.array(FlowNodeSchema),
  diagnosis: z.array(FlowNodeSchema),
  treatment: z.array(FlowNodeSchema),
  complications: z.array(FlowNodeSchema),
});

export type SectionTrees = z.infer<typeof SectionTreesSchema>;

export const CardImageSchema = z.object({
  id: z.string(),
  name: z.string(),
  dataUrl: z.string(),
  caption: z.string().optional(),
  section: z
    .enum([
      "main",
      "high_yield",
      "risk_factors",
      "associations",
      "diagnosis",
      "treatment",
      "complications",
    ])
    .default("main"),
});

export type CardImage = z.infer<typeof CardImageSchema>;

export const CanvasElementSchema = z.object({
  id: z.string(),
  type: z.enum([
    "text",
    "note",
    "image",
    "rectangle",
    "ellipse",
    "line",
    "drawing",
  ]),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  content: z.string().optional(),
  dataUrl: z.string().optional(),
  backgroundColor: z.string().optional(),
  textColor: z.string().optional(),
  strokeColor: z.string().optional(),
  strokeWidth: z.number().optional(),
  points: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
});

export type CanvasElement = z.infer<typeof CanvasElementSchema>;

export const emptySectionTrees = (): SectionTrees => ({
  high_yield: [],
  risk_factors: [],
  associations: [],
  diagnosis: [],
  treatment: [],
  complications: [],
});

export const cardsTable = pgTable("cards", {
  id: serial("id").primaryKey(),
  topic: text("topic").notNull(),
  flow: jsonb("flow").notNull().$type<FlowNode[]>(),
  sidebar: jsonb("sidebar").notNull().$type<SidebarSections>(),
  rawText: text("raw_text").notNull(),
  tags: text("tags").array().notNull().default([]),
  sourceBlocks: jsonb("source_blocks")
    .notNull()
    .$type<SourceBlock[]>()
    .default([]),
  sectionTrees: jsonb("section_trees")
    .notNull()
    .$type<SectionTrees>()
    .default(emptySectionTrees()),
  images: jsonb("images").notNull().$type<CardImage[]>().default([]),
  canvasElements: jsonb("canvas_elements")
    .notNull()
    .$type<CanvasElement[]>()
    .default([]),
  notebookId: integer("notebook_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCardSchema = createInsertSchema(cardsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCard = z.infer<typeof insertCardSchema>;
export type Card = typeof cardsTable.$inferSelect;

export const foldersTable = pgTable("folders", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#2878e3"),
  parentId: integer("parent_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const notebooksTable = pgTable("notebooks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#2878e3"),
  folderId: integer("folder_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Folder = typeof foldersTable.$inferSelect;
export type Notebook = typeof notebooksTable.$inferSelect;

// ── Compat: convert old flat indent-based flow to new recursive tree ──────────
// Old format: { label, sublabel, indent } — stored before the tree migration
// New format: { id, label, sublabel, children[] }
function isOldFlatFormat(flow: unknown[]): boolean {
  if (!flow.length) return false;
  const first = flow[0] as Record<string, unknown>;
  return "indent" in first && !("children" in first) && !("id" in first);
}

let _compatIdCounter = 0;
function compatId() {
  return `compat-${++_compatIdCounter}-${Math.random().toString(36).slice(2, 6)}`;
}

export function convertFlatFlowToTree(flow: unknown[]): FlowNode[] {
  if (!flow?.length) return [];
  if (!isOldFlatFormat(flow)) return flow as FlowNode[];

  const roots: FlowNode[] = [];
  // Stack: array of { node, indent }
  const stack: { node: FlowNode; indent: number }[] = [];

  for (const raw of flow) {
    const step = raw as {
      label: string;
      sublabel?: string | null;
      indent?: number;
    };
    const indent = step.indent ?? 0;
    const node: FlowNode = {
      id: compatId(),
      label: step.label,
      sublabel: step.sublabel ?? null,
      children: [],
    };

    // Pop stack until we find a node at a strictly lower indent level
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(node);
    } else {
      const parent = stack[stack.length - 1].node;
      if (!parent.children) parent.children = [];
      parent.children.push(node);
    }

    stack.push({ node, indent });
  }

  return roots;
}
