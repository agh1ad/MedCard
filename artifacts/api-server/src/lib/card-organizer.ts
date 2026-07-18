import OpenAI from "openai";
import {
  emptySectionTrees,
  type FlowNode,
  type SectionTrees,
  type SidebarSections,
  type SourceBlock,
} from "@workspace/db";

const SECTION_KEYS = [
  "main",
  "high_yield",
  "risk_factors",
  "associations",
  "diagnosis",
  "treatment",
  "complications",
] as const;

const TONES = ["ink", "blue", "green", "pink", "violet", "amber"] as const;
const SIDE_SECTIONS = [
  "high_yield",
  "risk_factors",
  "associations",
  "diagnosis",
  "treatment",
  "complications",
] as const;

type SectionKey = (typeof SECTION_KEYS)[number];
type Tone = (typeof TONES)[number];

interface Placement {
  blockId: string;
  section: SectionKey;
  parentBlockId: string | null;
  order: number;
  tone: Tone;
}

export interface OrganizedCard {
  flow: FlowNode[];
  sidebar: SidebarSections;
  sectionTrees: SectionTrees;
  sourceBlocks: SourceBlock[];
}

const STRUCTURE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["placements"],
  properties: {
    placements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["blockId", "section", "parentBlockId", "order", "tone"],
        properties: {
          blockId: { type: "string" },
          section: { type: "string", enum: SECTION_KEYS },
          parentBlockId: { type: ["string", "null"] },
          order: { type: "integer" },
          tone: { type: "string", enum: TONES },
        },
      },
    },
  },
} as const;

const ORGANIZER_PROMPT = `Role: Organize immutable medical-note blocks into a visual memory card.

Goal: Assign every block to exactly one section and arrange causal or sequential blocks as trees.

Constraints:
- Return every supplied blockId exactly once.
- Never create a blockId.
- Use parentBlockId only for a direct cause, next step, diagnostic step, treatment step, or tightly related branch in the same section.
- Use null for roots and independent facts.
- Put the central pathophysiology sequence and its clinical manifestations in main.
- Use side sections for high-yield facts, risk factors, associations, diagnosis, treatment, and complications.
- Preserve parallel outcomes as siblings with the same parent.
- order controls visual reading order among roots or siblings.
- tone is only a visual-memory color. Use colors to separate adjacent mechanisms and outcomes.

Success means every input ID appears once, all parent IDs exist in the same section, and no cycles exist.`;

function cleanLine(line: string): string {
  return line.replace(/^\s+|\s+$/g, "");
}

export function splitSourceBlocks(rawText: string): SourceBlock[] {
  const normalized = rawText.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];

  const fragments: string[] = [];
  for (const line of normalized.split(/\n+/)) {
    const clean = cleanLine(line);
    if (!clean) continue;

    const arrowParts = clean.split(/\s*(?:→|--?>|=>|⟶)\s*/g);
    for (const arrowPart of arrowParts) {
      const sentenceParts = arrowPart.split(/(?<=[.!?;])\s+(?=[A-Z0-9([])/g);
      for (const sentence of sentenceParts) {
        const fragment = cleanLine(sentence);
        if (fragment) fragments.push(fragment);
      }
    }
  }

  return fragments.map((text, index) => ({ id: `b${index + 1}`, text }));
}

function isPlacement(value: unknown): value is Placement {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.blockId === "string" &&
    SECTION_KEYS.includes(item.section as SectionKey) &&
    (item.parentBlockId === null || typeof item.parentBlockId === "string") &&
    Number.isInteger(item.order) &&
    TONES.includes(item.tone as Tone)
  );
}

function validatePlacements(blocks: SourceBlock[], value: unknown): Placement[] {
  if (!value || typeof value !== "object") {
    throw new Error("AI returned an invalid organization result");
  }

  const raw = (value as Record<string, unknown>).placements;
  if (!Array.isArray(raw) || !raw.every(isPlacement)) {
    throw new Error("AI returned invalid placements");
  }

  const expected = new Set(blocks.map((block) => block.id));
  const seen = new Set<string>();
  for (const placement of raw) {
    if (!expected.has(placement.blockId) || seen.has(placement.blockId)) {
      throw new Error("AI changed or duplicated the source block ledger");
    }
    seen.add(placement.blockId);
  }

  if (seen.size !== expected.size) {
    throw new Error("AI omitted source information");
  }

  return raw;
}

function createsCycle(
  placement: Placement,
  byId: Map<string, Placement>,
): boolean {
  const visited = new Set([placement.blockId]);
  let parentId = placement.parentBlockId;

  while (parentId) {
    if (visited.has(parentId)) return true;
    visited.add(parentId);
    parentId = byId.get(parentId)?.parentBlockId ?? null;
  }

  return false;
}

function buildTrees(
  blocks: SourceBlock[],
  placements: Placement[],
  section: SectionKey,
): FlowNode[] {
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const sectionPlacements = placements
    .filter((placement) => placement.section === section)
    .sort((a, b) => a.order - b.order || a.blockId.localeCompare(b.blockId));
  const placementById = new Map(sectionPlacements.map((item) => [item.blockId, item]));
  const nodeById = new Map<string, FlowNode>();

  for (const placement of sectionPlacements) {
    const block = blockById.get(placement.blockId);
    if (!block) continue;
    nodeById.set(placement.blockId, {
      id: placement.blockId,
      sourceBlockId: placement.blockId,
      label: block.text,
      sublabel: null,
      tone: placement.tone,
      children: [],
    });
  }

  const roots: FlowNode[] = [];
  for (const placement of sectionPlacements) {
    const node = nodeById.get(placement.blockId);
    const parentPlacement = placement.parentBlockId
      ? placementById.get(placement.parentBlockId)
      : undefined;
    const validParent =
      parentPlacement &&
      parentPlacement.section === placement.section &&
      parentPlacement.blockId !== placement.blockId &&
      !createsCycle(placement, placementById);

    if (!node) continue;
    if (validParent) {
      nodeById.get(parentPlacement.blockId)?.children?.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function flattenLabels(nodes: FlowNode[]): string[] {
  return nodes.flatMap((node) => [node.label, ...flattenLabels(node.children ?? [])]);
}

function composeCard(blocks: SourceBlock[], placements: Placement[]): OrganizedCard {
  const flow = buildTrees(blocks, placements, "main");
  const sectionTrees = emptySectionTrees();

  for (const section of SIDE_SECTIONS) {
    sectionTrees[section] = buildTrees(blocks, placements, section);
  }

  return {
    flow,
    sectionTrees,
    sourceBlocks: blocks,
    sidebar: {
      high_yield: flattenLabels(sectionTrees.high_yield),
      risk_factors: [
        ...flattenLabels(sectionTrees.risk_factors),
        ...flattenLabels(sectionTrees.associations),
      ],
      diagnosis: flattenLabels(sectionTrees.diagnosis),
      treatment: flattenLabels(sectionTrees.treatment),
      complications: flattenLabels(sectionTrees.complications),
    },
  };
}

export async function organizeCard(
  openai: OpenAI,
  rawText: string,
  topic?: string | null,
): Promise<OrganizedCard> {
  const blocks = splitSourceBlocks(rawText);
  if (!blocks.length) throw new Error("No source information was provided");

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-5-nano",
    reasoning_effort: "minimal",
    max_completion_tokens: Math.min(12_000, Math.max(1_200, blocks.length * 80)),
    messages: [
      { role: "system", content: ORGANIZER_PROMPT },
      {
        role: "user",
        content: JSON.stringify({ topic: topic || null, blocks }),
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "medcard_organization",
        strict: true,
        schema: STRUCTURE_SCHEMA,
      },
    },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("AI returned an empty organization result");

  const placements = validatePlacements(blocks, JSON.parse(content));
  return composeCard(blocks, placements);
}
