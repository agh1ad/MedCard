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
const PRESENTATIONS = ["bullets", "table", "diagram", "callout"] as const;
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
type Presentation = (typeof PRESENTATIONS)[number];

interface AiNode {
  nodeId: string;
  label: string;
  sublabel: string | null;
  sourceBlockIds: string[];
  origin: "source" | "enhanced" | "ai_added";
  semanticRole: SemanticRole;
  highlightTerms: string[];
  section: SectionKey;
  parentNodeIds: string[];
  presentation: Presentation;
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
          "parentNodeIds",
          "presentation",
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
          parentNodeIds: { type: "array", items: { type: "string" } },
          presentation: { type: "string", enum: PRESENTATIONS },
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
- You have full editorial authority over wording and organization. Correct spelling, grammar, abbreviations, terminology, and awkward phrasing; remove redundant headings; combine repetition; split dense ideas; and relocate any fact to the section or branch where it is most logical. Preserve every source assertion, qualifier, comparison, and clinical detail even when rewriting it. Use origin "source" only when wording is essentially unchanged and "enhanced" whenever wording or placement is improved.
- The original sourceOutline preserves the author's headings, newlines, indentation, arrows, and ordering. Use it to recover intended hierarchy and sequence; use blocks and blockId only for provenance. A standalone arrow is a connector, never medical content.
- Add only facts essential to understanding a missing causal bridge. Respect maxAiAddedNodes exactly as a hard ceiling. AI-created nodes use origin "ai_added" and an empty sourceBlockIds array. Never add optional presentation windows, alternate tests, confirmatory restatements, or long complication cascades unless supplied by the source.

VISUAL DENSITY
- Respect maxNodes as a hard ceiling. Merge related side-section wording when needed, but never merge distinct supplied main-path stages or manifestations; sourceBlockIds preserves all traceability.
- In main, every supplied arrow stage and every separately listed finding must have its own visual node. In side sections, freely choose the hierarchy, depth, grouping, comparisons, decision sequences, and concise explanations that produce the clearest clinical reference. Avoid nodes that merely repeat a section heading.
- Choose the number of sibling buds or sub-bullets from the actual medical relationships rather than a fixed template. Keep wording concise enough to fit while preserving useful qualifiers.
- A short source should produce a sparse visual structure that scales up to fill the card, not a textbook expansion or unused tiny text.

HANDWRITTEN TREE GRAMMAR
- Main normally starts from one disease trunk, but the AI may choose multiple roots when the source truly describes independent processes that later connect.
- Main contains pathophysiology and the manifestations produced by each mechanism. Use the closest cause/category/process as parent.
- A normal-physiology pathway, differential diagnosis, or comparison is a comparator, not an effect of the disease. Keep comparator pathways as separate labeled roots/branches under a neutral shared concept; never draw a causal arrow from the disease to normal physiology or from normal physiology to the disease.
- Treat an explicit source sequence A -> B -> C as mandatory descending parentage: A is the parent of B and B is the parent of C. Give every supplied stage its own bordered-cell node in the same order; never combine, skip, reorder, or place two stages in one label.
- Model main as a directed medical flow graph using parentNodeIds. Give the AI freedom to select any structure that best expresses the supplied medical logic: sequence, divergence, parallel paths, convergence, repeated split/merge stages, feedback loops, vicious cycles, homeostatic loops, or combinations of these.
- parentNodeIds[0] is the primary top-to-bottom layout parent and must maintain an acyclic readable backbone. Additional parentNodeIds are semantic connections and may converge from other branches, jump between stages, loop backward, or self-connect when a self-reinforcing process is medically justified. Use [] for a root.
- Every connection must express cause, progression, dependency, reinforcement, inhibition, recurrence, or a clearly stated condition. Never connect items merely because they are adjacent, and never add complexity for decoration. Create a backward edge or feedback cycle only when the source explicitly describes feedback, recurrence, or a vicious cycle; never infer one from an ordinary downstream consequence. Sequence and logical memorability are the primary goals.
- Represent a shared downstream result once with multiple parentNodeIds. Never duplicate the same manifestation or outcome just to preserve a tree shape. Parent connections must stay within the same section; move a fact to the best section rather than linking across sections. Side sections may use additional same-section parentNodeIds for meaningful cross-links, convergence, or feedback.
- A heading such as "Pathophysiology" or "Symptoms" establishes hierarchy. Continue the pathophysiology as a descending causal trunk. Place each separately listed symptom/sign in its own manifestation node beneath a shared "Clinical manifestations" hub.
- Every finding listed under Symptoms, Signs, Presentation, or Clinical manifestations belongs in section "main" with semanticRole "manifestation". Connect it to the closest mechanism or a shared Clinical manifestations hub at the end of the causal pathway. Never move symptoms into High Yield, Risk factors, or Associations merely to save space. High Yield may contain a concise distinguishing pearl, but must not duplicate the symptom list.
- True divergence creates sibling buds. Continue each sibling independently to its own outcomes. Same-level categories such as Skin/GI/Pulmonary or stable/unstable are siblings, never ancestors of one another.
- Choose direct children and organizational hubs according to genuine clinical categories and visual readability. Place every supplied manifestation in its own node; organizational grouping must not merge findings or invent arbitrary categories.
- Do not attach multiple organ-system manifestations directly to the disease root beside its mechanism. Route them through their causal mechanism or one shared manifestation hub so the tree grows vertically instead of becoming an unreadably wide row.
- Never turn adjacency or a plain list into a chain. Chain only when causality, arrows, or explicit sequence supports it. Findings beneath one heading are sibling buds.
- Diagnosis preserves the supplied clinical order: initial/exclusion test -> next test -> gold-standard/confirmatory test -> findings. Treatment groups modalities under their real indication (e.g. definitive therapy versus therapy for poor surgical candidates), with mechanisms/qualifiers as children of the correct modality. Do not make one sibling treatment the child of another.
- Diagnosis and treatment are decision trees: test/condition -> result -> next step. Other side sections may also branch. Build side trees with the same centered parent-to-sibling budding geometry as the main tree, not deep outline-style ladders.
- Never create a node whose label or sublabel is only an arrow, bullet, punctuation, section title such as "Symptoms"/"Treatment", or vague placeholder such as "Other symptoms". Use headings to organize their actual child facts, not as empty content cells.
- Keep labels concise enough for one A4 page. Put useful qualifiers in sublabel. Use consistent tone along a chain and contrasting tones between neighboring branches.

SIDE NOTES
- Side sections use the established AMBOSS-style clinical panels, but the AI controls their information architecture and each root group's presentation. Set presentation to "bullets", "table", "diagram", or "callout" on every node; only a root node's value controls rendering.
- Choose "bullets" for independent or nested clinical facts, "table" for true comparisons with parallel label/detail rows, "diagram" for a short causal or decision pathway where arrows add understanding, and "callout" for one compact must-remember pearl with optional supporting bullets. Mix modes across a card when that is clearer.
- Freely choose section placement, order, nesting, category hubs, paired label/explanation structure, decision pathways, comparisons, and cross-links to maximize rapid recall.
- Use a flat list when facts are independent, nesting when facts depend on a category or decision, and cross-links when one point logically depends on multiple others. Avoid decorative complexity: every structural choice must improve clinical logic or memorability.
- The panel already supplies its section title. Never prefix a node with "Diagnosis:", "Treatment:", "Complications:", "Risk factors:", "Associations:", "High yield:", or "Symptoms:". Never repeat a panel title as a node.

SEMANTIC COLOR ROLES
- semanticRole "core": only the highest-yield/core facts.
- "manifestation": symptoms, signs, examination findings, and systemic manifestations.
- "diagnosis", "treatment", and "complication": matching section content.
- "explanation": causal/mechanistic explanations. "fact": risk factors, associations, and other supporting facts.
- highlightTerms contains exact substrings from label or sublabel that are recognizable named concepts: anatomy/organs, diseases, syndromes, cells, antibodies, cytokines, genes, drugs, tests, named signs, and named procedures. Do not include ordinary verbs or whole sentences.

QUALITY GATE
Before returning JSON, internally draft, inspect, and revise the card. Trace every edge from parent to child and remove any connection that does not read as a true logical sentence. Verify comparator pathways are not represented as disease effects, diagnosis and treatment retain clinical order, and no connector-only or heading-only nodes remain. Score 10 only if: all source blocks are traceable; hierarchy is causal and correctly branched; wording is clear and memorable; added medical content is conservative and consistent; no node is duplicated; all parents are valid; and the result can fit one page. Return only the final revised structure and honest audit.`;

function cleanLine(line: string): string {
  return line.replace(/^\s+|\s+$/g, "");
}

function isConnectorOnly(line: string): boolean {
  return /^(?:[↓↑→←↔⇄⟶⟵⇢⇠⇧⇩=\-><\s]+)$/.test(line);
}

function isStructuralHeading(line: string): boolean {
  const heading = line.replace(/:$/, "").trim().toLocaleLowerCase();
  return [
    "pathophysiology",
    "symptoms",
    "other symptoms",
    "signs",
    "clinical manifestations",
    "risk factors",
    "associations",
    "diagnosis",
    "treatment",
    "complications",
  ].includes(heading);
}

function stripRedundantPanelPrefix(text: string): string {
  return text.replace(
    /^(?:high[ -]?yield|risk factors?|associations?|diagnosis|treatment|complications?|symptoms?)\s*:\s*/i,
    "",
  );
}

export function splitSourceBlocks(rawText: string): SourceBlock[] {
  const normalized = rawText.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];

  const fragments: string[] = [];
  for (const line of normalized.split(/\n+/)) {
    const clean = cleanLine(line);
    if (!clean || isConnectorOnly(clean) || isStructuralHeading(clean)) {
      continue;
    }

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
    Array.isArray(item.parentNodeIds) &&
    item.parentNodeIds.every((id) => typeof id === "string") &&
    PRESENTATIONS.includes(item.presentation as Presentation) &&
    Number.isInteger(item.order) &&
    TONES.includes(item.tone as Tone)
  );
}

function isScore(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 10;
}

function meaningfulWords(text: string): Set<string> {
  return new Set(
    text
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((word) => word.length > 2) ?? [],
  );
}

function sharedWordCount(left: string, right: string): number {
  const leftWords = meaningfulWords(left);
  return [...meaningfulWords(right)].filter((word) => leftWords.has(word))
    .length;
}

function visiblyRepresents(sourceText: string, visibleText: string): boolean {
  const sourceWords = meaningfulWords(sourceText);
  if (!sourceWords.size) return false;

  const sharedWords = sharedWordCount(sourceText, visibleText);
  const requiredWords = Math.min(2, sourceWords.size);
  return sharedWords >= requiredWords && sharedWords / sourceWords.size >= 0.5;
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

  for (const node of rawNodes) {
    node.label = stripRedundantPanelPrefix(node.label).trim();
    if (isStructuralHeading(node.label) && node.sublabel?.trim()) {
      node.label = node.sublabel.trim();
      node.sublabel = null;
    }
  }

  const nonContentNodes = new Map(
    rawNodes
      .filter(
        (node) =>
          isConnectorOnly(node.label) ||
          (isStructuralHeading(node.label) && !node.sublabel?.trim()),
      )
      .map((node) => [node.nodeId, node.parentNodeIds] as const),
  );
  if (nonContentNodes.size) {
    for (const node of rawNodes) {
      node.parentNodeIds = node.parentNodeIds.flatMap(
        (parentId) => nonContentNodes.get(parentId) ?? [parentId],
      );
    }
    for (let index = rawNodes.length - 1; index >= 0; index -= 1) {
      if (nonContentNodes.has(rawNodes[index].nodeId))
        rawNodes.splice(index, 1);
    }
  }
  if (!rawNodes.length) throw new Error("AI returned no medical card nodes");
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

  // Provenance is metadata. Repair a missing/invalid ID when the source text is
  // visibly present instead of discarding an otherwise complete card.
  const claimedBlockIds = new Set<string>();
  for (const node of rawNodes) {
    node.sourceBlockIds = [
      ...new Set(node.sourceBlockIds.filter((id) => expectedBlockIds.has(id))),
    ];
    for (const blockId of node.sourceBlockIds) claimedBlockIds.add(blockId);
    if (node.origin === "ai_added" && node.sourceBlockIds.length) {
      node.origin = "enhanced";
    }
  }

  for (const node of rawNodes) {
    if (node.origin === "ai_added" || node.sourceBlockIds.length) continue;
    const nodeText = `${node.label} ${node.sublabel ?? ""}`;
    const candidates = blocks.filter((block) => !claimedBlockIds.has(block.id));
    const match = candidates
      .map((block) => ({
        block,
        score: visiblyRepresents(block.text, nodeText)
          ? sharedWordCount(nodeText, block.text)
          : 0,
      }))
      .sort((a, b) => b.score - a.score)[0];
    if (match?.score) {
      node.sourceBlockIds = [match.block.id];
      claimedBlockIds.add(match.block.id);
    } else {
      node.origin = "ai_added";
    }
  }

  for (const node of rawNodes) {
    if (!node.nodeId || !node.label.trim() || nodeById.has(node.nodeId)) {
      throw new Error("AI returned duplicate or empty card nodes");
    }
    const visibleText =
      `${node.label} ${node.sublabel ?? ""}`.toLocaleLowerCase();
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

  // If a source block is not visibly represented, preserve it verbatim. This
  // guarantees source fidelity without paying for a second AI request.
  let recoveryOrder =
    rawNodes.reduce((highest, node) => Math.max(highest, node.order), 0) + 1;
  for (const block of blocks) {
    if (coveredBlockIds.has(block.id)) continue;

    const visibleMatch = rawNodes
      .filter((node) => node.origin !== "ai_added")
      .map((node) => ({
        node,
        score: visiblyRepresents(
          block.text,
          `${node.label} ${node.sublabel ?? ""}`,
        )
          ? sharedWordCount(`${node.label} ${node.sublabel ?? ""}`, block.text)
          : 0,
      }))
      .sort((a, b) => b.score - a.score)[0];
    if (visibleMatch?.score) {
      visibleMatch.node.sourceBlockIds.push(block.id);
      coveredBlockIds.add(block.id);
      continue;
    }

    const anchor = [...rawNodes]
      .filter((node) => node.origin !== "ai_added")
      .sort((left, right) => {
        const leftBlock = Number(left.sourceBlockIds[0]?.slice(1)) || 0;
        const rightBlock = Number(right.sourceBlockIds[0]?.slice(1)) || 0;
        const targetBlock = Number(block.id.slice(1)) || 0;
        return (
          Math.abs(leftBlock - targetBlock) - Math.abs(rightBlock - targetBlock)
        );
      })[0];
    const section = anchor?.section ?? "high_yield";
    const recoveryNode: AiNode = {
      nodeId: `source-recovery-${block.id}`,
      label: block.text,
      sublabel: null,
      sourceBlockIds: [block.id],
      origin: "source",
      semanticRole: anchor?.semanticRole ?? "fact",
      highlightTerms: [],
      section,
      parentNodeIds: anchor ? [anchor.nodeId] : [],
      presentation: anchor?.presentation ?? "bullets",
      order: recoveryOrder++,
      tone: anchor?.tone ?? "blue",
    };
    rawNodes.push(recoveryNode);
    nodeById.set(recoveryNode.nodeId, recoveryNode);
    coveredBlockIds.add(block.id);
  }

  // Keep model creativity from turning a recoverable cross-section link into a 500.
  for (const node of rawNodes) {
    const sameSectionParents = [
      ...new Set(
        node.parentNodeIds.filter((parentId) => {
          const parent = nodeById.get(parentId);
          return parent?.section === node.section;
        }),
      ),
    ];
    const primaryParent = sameSectionParents.find(
      (parentId) => parentId !== node.nodeId,
    );
    if (!primaryParent) {
      node.parentNodeIds = [];
      continue;
    }
    node.parentNodeIds = [
      primaryParent,
      ...sameSectionParents.filter((parentId) => parentId !== primaryParent),
    ];
  }

  for (const node of rawNodes) {
    if (new Set(node.parentNodeIds).size !== node.parentNodeIds.length) {
      throw new Error("AI returned duplicate flow connections");
    }
    for (const parentId of node.parentNodeIds) {
      const parent = nodeById.get(parentId);
      const isAllowedSelfLoop =
        node.section === "main" &&
        parentId === node.nodeId &&
        node.parentNodeIds.indexOf(parentId) > 0;
      if (
        !parent ||
        parent.section !== node.section ||
        (parent.nodeId === node.nodeId && !isAllowedSelfLoop)
      ) {
        throw new Error("AI returned an invalid cross-section parent");
      }
    }
    if (createsPrimaryCycle(node, nodeById)) {
      node.parentNodeIds = [];
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

function createsPrimaryCycle(node: AiNode, byId: Map<string, AiNode>): boolean {
  const visitPrimaryAncestors = (
    parentId: string,
    visited: Set<string>,
  ): boolean => {
    if (parentId === node.nodeId) return true;
    if (visited.has(parentId)) return false;
    visited.add(parentId);
    const primaryParentId = byId.get(parentId)?.parentNodeIds[0];
    return primaryParentId
      ? visitPrimaryAncestors(primaryParentId, visited)
      : false;
  };

  const primaryParentId = node.parentNodeIds[0];
  return primaryParentId
    ? visitPrimaryAncestors(primaryParentId, new Set<string>())
    : false;
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
      additionalParentIds: node.parentNodeIds.slice(1),
      presentation: node.presentation,
      children: [],
    });
  }

  const roots: FlowNode[] = [];
  for (const sourceNode of sectionNodes) {
    const flowNode = nodeById.get(sourceNode.nodeId);
    if (!flowNode) continue;
    const primaryParentId = sourceNode.parentNodeIds[0];
    if (primaryParentId) {
      nodeById.get(primaryParentId)?.children?.push(flowNode);
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
  const configuredReasoning = process.env.OPENAI_REASONING_EFFORT;
  const reasoningEffort =
    configuredReasoning === "low" || configuredReasoning === "medium"
      ? configuredReasoning
      : blocks.length >= 24
        ? "medium"
        : "low";
  const completion = await openai.chat.completions.create({
    model,
    service_tier: serviceTier,
    reasoning_effort: reasoningEffort,
    verbosity: "low",
    n: 1,
    messages: [
      { role: "system", content: ORGANIZER_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          topic: topic || null,
          sourceOutline: rawText,
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
      reasoningEffort,
      finishReason: completion.choices[0]?.finish_reason,
      promptTokens: usage.prompt_tokens,
      cachedPromptTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
    });
  }

  const choice = completion.choices[0];
  const content = choice?.message?.content;
  if (!content) {
    if (choice?.message?.refusal) {
      throw new Error(
        `AI could not organize this source: ${choice.message.refusal}`,
      );
    }

    const finishReason = choice?.finish_reason;
    throw new Error(
      finishReason === "length"
        ? "AI used its output budget before producing the card. Please try again."
        : `AI returned no card content${finishReason ? ` (finish reason: ${finishReason})` : ""}`,
    );
  }

  const result = validateResult(
    blocks,
    JSON.parse(content),
    maxNodes,
    maxAiAddedNodes,
  );
  return composeCard(blocks, result.nodes, result.quality);
}
