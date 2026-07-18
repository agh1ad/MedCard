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

const ORGANIZER_PROMPT = `Role: Organize immutable medical-note blocks using the author's handwritten tree grammar.

Goal: Assign every block once, then arrange each section as a top-down hierarchy: trunk -> process -> consequence -> manifestations.

Rules:
- Return every supplied blockId exactly once. Never create, duplicate, paraphrase, merge, or omit a block.
- A parent must be the closest explicit cause, category, process, decision, or step in the same section. Use null only for a genuine root or independent fact.
- Main contains the causal disease mechanism and the clinical manifestations produced by each mechanism.
- A shared cause that produces several mechanisms or outcomes must bud into sibling branches. Continue every sibling independently to its own consequences and manifestations; never flatten parallel branches into one chain.
- Preserve explicit headings and categories as intermediate parents. Group findings by their stated mechanism, organ system, test branch, treatment branch, or complication branch when the source provides that relationship.
- Categories at the same scope are siblings, never ancestors of one another: for example Skin/GI/Pulmonary, stable/unstable, or positive/negative branches. Repeated identical headings must remain adjacent peers, never a parent-child chain.
- Never turn adjacency or a plain list into a causal chain. Chain blocks only when arrows, causal/sequential wording, or explicit step order supports it. Consecutive findings beneath one heading are sibling buds until the next same-level heading.
- Diagnosis and treatment are independent mini-trees: decision/test -> result/condition -> next step. Risk factors, associations, high-yield facts, and complications use the same nested rule when relationships exist.
- Preserve source order when it expresses sequence. Otherwise place mechanisms before outcomes and general findings before specific examples.
- Do not invent a medical relationship. When the source does not support a parent, keep the block independent.
- order controls sibling/root reading order. tone is visual only; use one tone along a chain and contrasting tones for neighboring branches.

Success: all IDs appear once, parents exist in the same section, no cycles exist, and every true divergence remains visibly branched.`;

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

function validatePlacements(
  blocks: SourceBlock[],
  value: unknown,
): Placement[] {
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
  const placementById = new Map(
    sectionPlacements.map((item) => [item.blockId, item]),
  );
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
  return nodes.flatMap((node) => [
    node.label,
    ...flattenLabels(node.children ?? []),
  ]);
}

function composeCard(
  blocks: SourceBlock[],
  placements: Placement[],
): OrganizedCard {
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

  const model = process.env.OPENAI_MODEL ?? "gpt-5-nano";
  const serviceTier =
    process.env.OPENAI_SERVICE_TIER === "default" ? "default" : "flex";
  const completion = await openai.chat.completions.create({
    model,
    service_tier: serviceTier,
    reasoning_effort: "minimal",
    verbosity: "low",
    n: 1,
    max_completion_tokens: Math.min(
      12_000,
      Math.max(1_200, blocks.length * 80),
    ),
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

  const usage = completion.usage;
  if (usage) {
    console.info("MedCard AI usage", {
      model,
      serviceTier: completion.service_tier ?? serviceTier,
      promptTokens: usage.prompt_tokens,
      cachedPromptTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
    });
  }

  const placements = validatePlacements(blocks, JSON.parse(content));
  return composeCard(blocks, placements);
}
