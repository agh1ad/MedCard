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
const SEMANTIC_ROLES = [
  "core",
  "manifestation",
  "diagnosis",
  "treatment",
  "complication",
  "explanation",
  "fact",
] as const;
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
type SemanticRole = (typeof SEMANTIC_ROLES)[number];

interface AiNode {
  nodeId: string;
  label: string;
  sublabel: string | null;
  sourceBlockIds: string[];
  origin: "source" | "enhanced" | "ai_added";
  semanticRole: SemanticRole;
  highlightTerms: string[];
  section: SectionKey;
  parentNodeId: string | null;
  order: number;
  tone: Tone;
}

export interface QualityReview {
  score: number;
  coverage: number;
  hierarchy: number;
  readability: number;
  medicalConsistency: number;
  aiAddedFactsCount: number;
  summary: string;
}

export interface OrganizedCard {
  flow: FlowNode[];
  sidebar: SidebarSections;
  sectionTrees: SectionTrees;
  sourceBlocks: SourceBlock[];
  quality: QualityReview;
}

const STRUCTURE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["nodes", "quality"],
  properties: {
    nodes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "nodeId",
          "label",
          "sublabel",
          "sourceBlockIds",
          "origin",
          "semanticRole",
          "highlightTerms",
          "section",
          "parentNodeId",
          "order",
          "tone",
        ],
        properties: {
          nodeId: { type: "string" },
          label: { type: "string" },
          sublabel: { type: ["string", "null"] },
          sourceBlockIds: { type: "array", items: { type: "string" } },
          origin: {
            type: "string",
            enum: ["source", "enhanced", "ai_added"],
          },
          semanticRole: { type: "string", enum: SEMANTIC_ROLES },
          highlightTerms: { type: "array", items: { type: "string" } },
          section: { type: "string", enum: SECTION_KEYS },
          parentNodeId: { type: ["string", "null"] },
          order: { type: "integer" },
          tone: { type: "string", enum: TONES },
        },
      },
    },
    quality: {
      type: "object",
      additionalProperties: false,
      required: [
        "score",
        "coverage",
        "hierarchy",
        "readability",
        "medicalConsistency",
        "aiAddedFactsCount",
        "summary",
      ],
      properties: {
        score: { type: "integer", minimum: 0, maximum: 10 },
        coverage: { type: "integer", minimum: 0, maximum: 10 },
        hierarchy: { type: "integer", minimum: 0, maximum: 10 },
        readability: { type: "integer", minimum: 0, maximum: 10 },
        medicalConsistency: { type: "integer", minimum: 0, maximum: 10 },
        aiAddedFactsCount: { type: "integer", minimum: 0 },
        summary: { type: "string" },
      },
    },
  },
} as const;

const ORGANIZER_PROMPT = `You are MedCard's medical-education editor, visual knowledge architect, and final quality reviewer.

Create one accurate, memorable landscape study card in the author's handwritten grammar: central causal trunk -> branching processes -> consequences -> clinical manifestations, with diagnosis, treatment, risk factors, associations, high-yield facts, and complications as independent mini-trees.

SOURCE PRESERVATION
- Preserve every supplied source block's meaning. Every blockId must appear in sourceBlockIds on at least one node; never silently omit or contradict it.
- You may correct grammar, standardize terminology, clarify wording, combine repetition, and split dense ideas into clearer nodes. Use origin "source" only when wording is essentially unchanged and "enhanced" when edited.
- Add only facts essential to understanding a missing causal bridge. Respect maxAiAddedNodes exactly as a hard ceiling. AI-created nodes use origin "ai_added" and an empty sourceBlockIds array. Never add optional presentation windows, alternate tests, confirmatory restatements, or long complication cascades unless supplied by the source.

VISUAL DENSITY
- Respect maxNodes as a hard ceiling. Merge related side-section wording when needed, but never merge distinct supplied main-path stages or manifestations; sourceBlockIds preserves all traceability.
- A side-note node may contain one short causal phrase. In main, every supplied arrow stage and every separately listed finding must have its own visual node. Side-tree depth must not exceed 4. Avoid nodes that merely say "confirms", "risk profile", "typical presentation", or repeat a side-section heading.
- Prefer 2-5 memorable sibling buds beneath a mechanism/category. Keep labels under 7 words and sublabels under 10 words whenever medically possible.
- A short source should produce a sparse visual structure that scales up to fill the card, not a textbook expansion or unused tiny text.

HANDWRITTEN TREE GRAMMAR
- Main starts from one disease trunk. Its first level contains at most three major mechanism/category buds, never a row of unrelated manifestations.
- Main contains pathophysiology and the manifestations produced by each mechanism. Use the closest cause/category/process as parent.
- Treat an explicit source sequence A -> B -> C as mandatory descending parentage: A is the parent of B and B is the parent of C. Give every supplied stage its own bordered-cell node in the same order; never combine, skip, reorder, or place two stages in one label.
- A heading such as "Pathophysiology" or "Symptoms" establishes hierarchy. Continue the pathophysiology as a descending causal trunk. Place each separately listed symptom/sign in its own manifestation node beneath a shared "Clinical manifestations" hub.
- True divergence creates sibling buds. Continue each sibling independently to its own outcomes. Same-level categories such as Skin/GI/Pulmonary or stable/unstable are siblings, never ancestors of one another.
- Limit every parent to three direct children. When there are more findings, introduce meaningful organizational hubs beneath "Clinical manifestations" (for example local symptoms, systemic symptoms, and infant signs), then place every supplied finding in its own child node. Organizational grouping must not merge findings.
- Do not attach multiple organ-system manifestations directly to the disease root beside its mechanism. Route them through their causal mechanism or one shared manifestation hub so the tree grows vertically instead of becoming an unreadably wide row.
- Never turn adjacency or a plain list into a chain. Chain only when causality, arrows, or explicit sequence supports it. Findings beneath one heading are sibling buds.
- Diagnosis and treatment are decision trees: test/condition -> result -> next step. Other side sections may also branch. Build side trees with the same centered parent-to-sibling budding geometry as the main tree, not deep outline-style ladders.
- Keep labels concise enough for one A4 page. Put useful qualifiers in sublabel. Use consistent tone along a chain and contrasting tones between neighboring branches.

SIDE NOTES
- Side sections render as concise nested bullet points. Keep each bullet self-contained, put a short paired explanation or mechanism in its sublabel, and use children only for genuine subpoints or dependent next steps.
- Avoid decorative category nodes, repeated headings, and one-word ladders. Prefer a short parent bullet with 2-4 direct sub-bullets when hierarchy is useful.

SEMANTIC COLOR ROLES
- semanticRole "core": only the highest-yield/core facts.
- "manifestation": symptoms, signs, examination findings, and systemic manifestations.
- "diagnosis", "treatment", and "complication": matching section content.
- "explanation": causal/mechanistic explanations. "fact": risk factors, associations, and other supporting facts.
- highlightTerms contains exact substrings from label or sublabel that are recognizable named concepts: anatomy/organs, diseases, syndromes, cells, antibodies, cytokines, genes, drugs, tests, named signs, and named procedures. Do not include ordinary verbs or whole sentences.

QUALITY GATE
Before returning JSON, internally draft, inspect, and revise the card. Score 10 only if: all source blocks are traceable; hierarchy is causal and correctly branched; wording is clear and memorable; added medical content is conservative and consistent; no node is duplicated; all parents are valid; and the result can fit one page. Return only the final revised structure and honest audit.`;

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

function isAiNode(value: unknown): value is AiNode {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.nodeId === "string" &&
    typeof item.label === "string" &&
    (item.sublabel === null || typeof item.sublabel === "string") &&
    Array.isArray(item.sourceBlockIds) &&
    item.sourceBlockIds.every((id) => typeof id === "string") &&
    ["source", "enhanced", "ai_added"].includes(item.origin as string) &&
    SEMANTIC_ROLES.includes(item.semanticRole as SemanticRole) &&
    Array.isArray(item.highlightTerms) &&
    item.highlightTerms.every((term) => typeof term === "string") &&
    SECTION_KEYS.includes(item.section as SectionKey) &&
    (item.parentNodeId === null || typeof item.parentNodeId === "string") &&
    Number.isInteger(item.order) &&
    TONES.includes(item.tone as Tone)
  );
}

function isScore(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 10;
}

function validateResult(
  blocks: SourceBlock[],
  value: unknown,
  maxNodes: number,
  maxAiAddedNodes: number,
): { nodes: AiNode[]; quality: QualityReview } {
  if (!value || typeof value !== "object") {
    throw new Error("AI returned an invalid card result");
  }

  const result = value as Record<string, unknown>;
  const rawNodes = result.nodes;
  const rawQuality = result.quality;
  if (
    !Array.isArray(rawNodes) ||
    !rawNodes.length ||
    !rawNodes.every(isAiNode)
  ) {
    throw new Error("AI returned invalid card nodes");
  }
  if (rawNodes.length > maxNodes) {
    throw new Error("AI exceeded the visual node budget");
  }
  if (!rawQuality || typeof rawQuality !== "object") {
    throw new Error("AI omitted its quality review");
  }

  const quality = rawQuality as Record<string, unknown>;
  if (
    !isScore(quality.score) ||
    !isScore(quality.coverage) ||
    !isScore(quality.hierarchy) ||
    !isScore(quality.readability) ||
    !isScore(quality.medicalConsistency) ||
    !Number.isInteger(quality.aiAddedFactsCount) ||
    Number(quality.aiAddedFactsCount) < 0 ||
    typeof quality.summary !== "string"
  ) {
    throw new Error("AI returned an invalid quality review");
  }

  const expectedBlockIds = new Set(blocks.map((block) => block.id));
  const coveredBlockIds = new Set<string>();
  const nodeById = new Map<string, AiNode>();
  for (const node of rawNodes) {
    if (!node.nodeId || !node.label.trim() || nodeById.has(node.nodeId)) {
      throw new Error("AI returned duplicate or empty card nodes");
    }
    if (node.origin === "ai_added" && node.sourceBlockIds.length) {
      throw new Error("AI mislabeled added content as source-backed");
    }
    if (node.origin !== "ai_added" && !node.sourceBlockIds.length) {
      throw new Error("AI omitted provenance for edited source content");
    }
    const visibleText = `${node.label} ${node.sublabel ?? ""}`.toLocaleLowerCase();
    node.highlightTerms = node.highlightTerms.filter(
      (term) => term.trim() && visibleText.includes(term.toLocaleLowerCase()),
    );
    for (const blockId of node.sourceBlockIds) {
      if (!expectedBlockIds.has(blockId)) {
        throw new Error("AI referenced an unknown source block");
      }
      coveredBlockIds.add(blockId);
    }
    nodeById.set(node.nodeId, node);
  }

  if (coveredBlockIds.size !== expectedBlockIds.size) {
    throw new Error("AI omitted source information");
  }

  for (const node of rawNodes) {
    if (!node.parentNodeId) continue;
    const parent = nodeById.get(node.parentNodeId);
    if (
      !parent ||
      parent.section !== node.section ||
      parent.nodeId === node.nodeId
    ) {
      throw new Error("AI returned an invalid cross-section parent");
    }
    if (createsCycle(node, nodeById)) {
      throw new Error("AI returned a cyclic card hierarchy");
    }
  }

  const aiAddedFactsCount = rawNodes.filter(
    (node) => node.origin === "ai_added",
  ).length;
  if (aiAddedFactsCount > maxAiAddedNodes) {
    throw new Error("AI exceeded the added-context budget");
  }

  return {
    nodes: rawNodes,
    quality: {
      score: Number(quality.score),
      coverage: 10,
      hierarchy: Number(quality.hierarchy),
      readability: Number(quality.readability),
      medicalConsistency: Number(quality.medicalConsistency),
      aiAddedFactsCount,
      summary: String(quality.summary),
    },
  };
}

function createsCycle(node: AiNode, byId: Map<string, AiNode>): boolean {
  const visited = new Set([node.nodeId]);
  let parentId = node.parentNodeId;

  while (parentId) {
    if (visited.has(parentId)) return true;
    visited.add(parentId);
    parentId = byId.get(parentId)?.parentNodeId ?? null;
  }

  return false;
}

function buildTrees(nodes: AiNode[], section: SectionKey): FlowNode[] {
  const sectionNodes = nodes
    .filter((node) => node.section === section)
    .sort((a, b) => a.order - b.order || a.nodeId.localeCompare(b.nodeId));
  const nodeById = new Map<string, FlowNode>();

  for (const node of sectionNodes) {
    nodeById.set(node.nodeId, {
      id: node.nodeId,
      sourceBlockId: node.sourceBlockIds[0],
      sourceBlockIds: node.sourceBlockIds,
      origin: node.origin,
      semanticRole: node.semanticRole,
      highlightTerms: node.highlightTerms,
      label: node.label.trim(),
      sublabel: node.sublabel?.trim() || null,
      tone: node.tone,
      children: [],
    });
  }

  const roots: FlowNode[] = [];
  for (const sourceNode of sectionNodes) {
    const flowNode = nodeById.get(sourceNode.nodeId);
    if (!flowNode) continue;
    if (sourceNode.parentNodeId) {
      nodeById.get(sourceNode.parentNodeId)?.children?.push(flowNode);
    } else {
      roots.push(flowNode);
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
  nodes: AiNode[],
  quality: QualityReview,
): OrganizedCard {
  const flow = buildTrees(nodes, "main");
  const sectionTrees = emptySectionTrees();

  for (const section of SIDE_SECTIONS) {
    sectionTrees[section] = buildTrees(nodes, section);
  }

  return {
    flow,
    sectionTrees,
    sourceBlocks: blocks,
    quality,
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
  // Dense source lists need enough cells to preserve every explicit main-tree point.
  const maxNodes = Math.min(48, Math.max(18, Math.ceil(blocks.length * 1.05)));
  const maxAiAddedNodes = Math.min(
    4,
    Math.max(2, Math.ceil(blocks.length / 12)),
  );

  const model = process.env.OPENAI_MODEL ?? "gpt-5.6-sol";
  const serviceTier =
    process.env.OPENAI_SERVICE_TIER === "default" ? "default" : "flex";
  const completion = await openai.chat.completions.create({
    model,
    service_tier: serviceTier,
    reasoning_effort: "medium",
    verbosity: "low",
    n: 1,
    max_completion_tokens: Math.min(
      24_000,
      Math.max(6_000, blocks.length * 240),
    ),
    messages: [
      { role: "system", content: ORGANIZER_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          topic: topic || null,
          maxNodes,
          maxAiAddedNodes,
          blocks,
        }),
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

  const usage = completion.usage;
  if (usage) {
    console.info("MedCard AI usage", {
      model,
      serviceTier: completion.service_tier ?? serviceTier,
      finishReason: completion.choices[0]?.finish_reason,
      promptTokens: usage.prompt_tokens,
      cachedPromptTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
    });
  }

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("AI returned an empty organization result");

  const result = validateResult(
    blocks,
    JSON.parse(content),
    maxNodes,
    maxAiAddedNodes,
  );
  return composeCard(blocks, result.nodes, result.quality);
}
