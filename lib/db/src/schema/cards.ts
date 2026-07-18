import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const FlowStepSchema = z.object({
  label: z.string(),
  sublabel: z.string().nullable().optional(),
  indent: z.number().int().default(0),
});

export const SidebarSectionsSchema = z.object({
  high_yield: z.array(z.string()),
  risk_factors: z.array(z.string()),
  diagnosis: z.array(z.string()),
  treatment: z.array(z.string()),
  complications: z.array(z.string()),
});

export type FlowStep = z.infer<typeof FlowStepSchema>;
export type SidebarSections = z.infer<typeof SidebarSectionsSchema>;

export const cardsTable = pgTable("cards", {
  id: serial("id").primaryKey(),
  topic: text("topic").notNull(),
  flow: jsonb("flow").notNull().$type<FlowStep[]>(),
  sidebar: jsonb("sidebar").notNull().$type<SidebarSections>(),
  rawText: text("raw_text").notNull(),
  tags: text("tags").array().notNull().default([]),
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
