import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Recursive FlowNode schema — a branching tree node
// Children are displayed side-by-side horizontally beneath the parent
const FlowNodeSchemaBase = z.object({
  id: z.string(),
  label: z.string(),
  sublabel: z.string().nullable().optional(),
});

export type FlowNode = z.infer<typeof FlowNodeSchemaBase> & {
  children?: FlowNode[];
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
};

export const FlowNodeSchema: z.ZodType<FlowNode> = FlowNodeSchemaBase.extend({
  children: z.lazy(() => z.array(FlowNodeSchema)).optional(),
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
  tone: z
    .enum(["ink", "blue", "green", "pink", "violet", "amber"])
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
  sourceBlocks: jsonb("source_blocks").notNull().$type<SourceBlock[]>().default([]),
  sectionTrees: jsonb("section_trees")
    .notNull()
    .$type<SectionTrees>()
    .default(emptySectionTrees()),
  images: jsonb("images").notNull().$type<CardImage[]>().default([]),
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
    const step = raw as { label: string; sublabel?: string | null; indent?: number };
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
