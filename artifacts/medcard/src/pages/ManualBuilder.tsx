import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  useCreateCard,
  type CanvasElement,
  type FlowNode,
  type NodeAttachment,
  type SectionTrees,
  type SideSection,
} from "@workspace/api-client-react";
import { MemoryCardCanvas } from "@/components/card/MemoryCardCanvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  CirclePlus,
  Copy,
  GitBranch,
  Highlighter,
  ImagePlus,
  Keyboard,
  Link2,
  Loader2,
  Minus,
  MousePointer2,
  Palette,
  PenLine,
  Plus,
  Save,
  SlidersHorizontal,
  Circle,
  Square,
  Sparkles,
  StickyNote,
  Type,
  Trash2,
  Undo2,
  X,
} from "lucide-react";

const EMPTY_TREES: SectionTrees = {
  high_yield: [],
  risk_factors: [],
  associations: [],
  diagnosis: [],
  treatment: [],
  complications: [],
};

const LEGACY_SECTIONS = [
  ["main", "Main flow"],
  ["high_yield", "High yield"],
  ["risk_factors", "Risk factors"],
  ["associations", "Associations"],
  ["diagnosis", "Diagnosis"],
  ["treatment", "Treatment"],
  ["complications", "Complications"],
] as const;

const LEGACY_SIDE_SECTIONS = LEGACY_SECTIONS.slice(1) as ReadonlyArray<
  readonly [keyof SectionTrees, string]
>;
type CardDraft = {
  topic: string;
  tags: string[];
  flow: FlowNode[];
  sectionTrees?: SectionTrees;
  sideSections?: SideSection[];
  canvasElements: CanvasElement[];
};

const DRAFT_KEY = "medcard-manual-draft-v1";
const PALETTE = [
  ["#ffffff", "#172033"],
  ["#dff4ff", "#12344d"],
  ["#dcfce7", "#14532d"],
  ["#fef3c7", "#713f12"],
  ["#fce7f3", "#831843"],
  ["#ede9fe", "#4c1d95"],
  ["#fee2e2", "#7f1d1d"],
  ["#16324f", "#ffffff"],
] as const;

let nodeSequence = 0;
function makeNode(label = "New node"): FlowNode {
  nodeSequence += 1;
  return {
    id: `manual-${Date.now().toString(36)}-${nodeSequence}`,
    label,
    sublabel: null,
    children: [],
    origin: "source",
  };
}

function mapNode(
  nodes: FlowNode[],
  id: string,
  update: (node: FlowNode) => FlowNode,
): FlowNode[] {
  return nodes.map((node) =>
    node.id === id
      ? update(node)
      : { ...node, children: mapNode(node.children ?? [], id, update) },
  );
}

function removeNode(nodes: FlowNode[], id: string): FlowNode[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => ({
      ...node,
      children: removeNode(node.children ?? [], id),
      additionalParentIds: (node.additionalParentIds ?? []).filter(
        (parentId) => parentId !== id,
      ),
    }));
}

function insertAfter(
  nodes: FlowNode[],
  id: string,
  nextNode: FlowNode,
): FlowNode[] {
  const index = nodes.findIndex((node) => node.id === id);
  if (index >= 0) {
    const next = [...nodes];
    next.splice(index + 1, 0, nextNode);
    return next;
  }
  return nodes.map((node) => ({
    ...node,
    children: insertAfter(node.children ?? [], id, nextNode),
  }));
}

function findNode(nodes: FlowNode[], id: string): FlowNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findNode(node.children ?? [], id);
    if (child) return child;
  }
  return undefined;
}

function flattenNodes(nodes: FlowNode[], result: FlowNode[] = []): FlowNode[] {
  for (const node of nodes) {
    result.push(node);
    flattenNodes(node.children ?? [], result);
  }
  return result;
}

function collectIds(nodes: FlowNode[], result = new Set<string>()) {
  for (const node of nodes) {
    result.add(node.id);
    collectIds(node.children ?? [], result);
  }
  return result;
}

function parseOutline(source: string): FlowNode[] {
  type ParsedLine = { depth: number; label: string; detail: string | null };
  const lines: ParsedLine[] = [];

  for (const rawLine of source.replace(/\r/g, "").split("\n")) {
    if (!rawLine.trim()) continue;
    const whitespace = rawLine.match(/^[\t ]*/)?.[0] ?? "";
    const baseDepth = [...whitespace].reduce(
      (depth, character) => depth + (character === "\t" ? 1 : 0.5),
      0,
    );
    const cleaned = rawLine
      .trim()
      .replace(/^[-*•]\s*/, "")
      .replace(/^\d+[.)]\s*/, "");
    const chain = cleaned.split(/\s*(?:→|->|=>)\s*/).filter(Boolean);
    chain.forEach((part, index) => {
      const [label, ...detail] = part.split(/\s*::\s*/);
      if (label.trim()) {
        lines.push({
          depth: Math.max(0, Math.floor(baseDepth) + index),
          label: label.trim(),
          detail: detail.join(" :: ").trim() || null,
        });
      }
    });
  }

  const roots: FlowNode[] = [];
  const stack: FlowNode[] = [];
  for (const line of lines) {
    const node = { ...makeNode(line.label), sublabel: line.detail };
    const depth = Math.min(line.depth, stack.length);
    if (depth === 0) roots.push(node);
    else {
      const parent = stack[depth - 1];
      parent.children = [...(parent.children ?? []), node];
    }
    stack.splice(depth);
    stack[depth] = node;
  }
  return roots;
}

function nodesToText(nodes: FlowNode[], depth = 0): string {
  return nodes
    .map(
      (node) =>
        `${"  ".repeat(depth)}${node.label}${node.sublabel ? ` :: ${node.sublabel}` : ""}${
          node.children?.length
            ? `\n${nodesToText(node.children, depth + 1)}`
            : ""
        }`,
    )
    .join("\n");
}

function loadDraft(): CardDraft {
  try {
    const stored = localStorage.getItem(DRAFT_KEY);
    if (stored) return JSON.parse(stored) as CardDraft;
  } catch {
    // A malformed or unavailable local draft should never block the editor.
  }
  return {
    topic: "",
    tags: [],
    flow: [],
    sideSections: [],
    canvasElements: [],
  };
}

export function ManualBuilder() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const initial = useMemo(loadDraft, []);
  const [topic, setTopic] = useState(initial.topic);
  const [tags, setTags] = useState(initial.tags);
  const [tagInput, setTagInput] = useState("");
  const [flow, setFlow] = useState(initial.flow);
  const [sideSections, setSideSections] = useState<SideSection[]>(() => {
    if (initial.sideSections?.length) return initial.sideSections;
    return LEGACY_SIDE_SECTIONS.flatMap(([key, title]) =>
      initial.sectionTrees?.[key]?.length
        ? [{ id: `legacy-${key}`, title, nodes: initial.sectionTrees[key] }]
        : [],
    );
  });
  const [canvasElements, setCanvasElements] = useState(
    initial.canvasElements ?? [],
  );
  const [freeformTool, setFreeformTool] = useState<
    "select" | "draw" | "highlight"
  >("select");
  const [freeformColor, setFreeformColor] = useState("#d53b36");
  const [selectedCanvasId, setSelectedCanvasId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>("main");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connectionSourceId, setConnectionSourceId] = useState<string | null>(
    null,
  );
  const [outline, setOutline] = useState("");
  const [showBulk, setShowBulk] = useState(true);
  const [showStructurePanel, setShowStructurePanel] = useState(false);
  const createMutation = useCreateCard();

  const activeSideSection = sideSections.find(
    (section) => section.id === activeSection,
  );
  const activeNodes =
    activeSection === "main" ? flow : (activeSideSection?.nodes ?? []);
  const selectedNode = selectedId
    ? findNode(activeNodes, selectedId)
    : undefined;
  const allActiveNodes = flattenNodes(activeNodes);
  const invalidParentIds = selectedNode
    ? collectIds([selectedNode])
    : new Set<string>();
  const selectedCanvasElement = canvasElements.find(
    (element) => element.id === selectedCanvasId,
  );

  const updateCanvasElement = (id: string, patch: Partial<CanvasElement>) =>
    setCanvasElements((current) =>
      current.map((element) =>
        element.id === id ? { ...element, ...patch } : element,
      ),
    );

  const setActiveNodes = (nodes: FlowNode[]) => {
    if (activeSection === "main") setFlow(nodes);
    else
      setSideSections((current) =>
        current.map((section) =>
          section.id === activeSection ? { ...section, nodes } : section,
        ),
      );
  };

  const addSideSection = (title?: string) => {
    const section: SideSection = {
      id: `section-${crypto.randomUUID()}`,
      title: title || `New section ${sideSections.length + 1}`,
      nodes: [],
    };
    setSideSections((current) => [...current, section]);
    setActiveSection(section.id);
    setSelectedId(null);
  };

  const addSideSectionAfter = (afterId: string) => {
    const section: SideSection = {
      id: `section-${crypto.randomUUID()}`,
      title: `New section ${sideSections.length + 1}`,
      nodes: [],
    };
    setSideSections((current) => {
      const index = current.findIndex((item) => item.id === afterId);
      const next = [...current];
      next.splice(index < 0 ? current.length : index + 1, 0, section);
      return next;
    });
    setActiveSection(section.id);
    setSelectedId(null);
  };

  const renameSideSection = (id: string, title: string) =>
    setSideSections((current) =>
      current.map((section) =>
        section.id === id ? { ...section, title } : section,
      ),
    );

  const deleteSideSection = (id: string) => {
    const section = sideSections.find((item) => item.id === id);
    if (
      section &&
      (section.nodes.length || section.attachments?.length) &&
      !confirm(`Delete “${section.title}” and everything inside it?`)
    )
      return;
    setSideSections((current) =>
      current.filter((section) => section.id !== id),
    );
    if (activeSection === id) setActiveSection("main");
    setSelectedId(null);
  };

  const sectionForNode = (id: string): string | null => {
    if (findNode(flow, id)) return "main";
    for (const section of sideSections) {
      if (findNode(section.nodes, id)) return section.id;
    }
    return null;
  };

  const selectNodeAnywhere = (id: string) => {
    const section = sectionForNode(id);
    if (section) setActiveSection(section);
    setSelectedCanvasId(null);
    setSelectedId(id);
  };

  const updateNodeAnywhere = (id: string, patch: Partial<FlowNode>) => {
    setFlow((current) =>
      mapNode(current, id, (node) => ({ ...node, ...patch })),
    );
    setSideSections((current) =>
      current.map((section) => ({
        ...section,
        nodes: mapNode(section.nodes, id, (node) => ({ ...node, ...patch })),
      })),
    );
  };

  const addChildAnywhere = (parentId: string) => {
    const child = makeNode();
    updateNodeAnywhere(parentId, {
      children: [
        ...(findNode(flow, parentId)?.children ??
          sideSections
            .map((section) => findNode(section.nodes, parentId)?.children)
            .find(Boolean) ??
          []),
        child,
      ],
    });
    selectNodeAnywhere(child.id);
  };

  const addSiblingAnywhere = (nodeId: string) => {
    const sibling = makeNode();
    setFlow((current) => insertAfter(current, nodeId, sibling));
    setSideSections((current) =>
      current.map((section) => ({
        ...section,
        nodes: insertAfter(section.nodes, nodeId, sibling),
      })),
    );
    setSelectedId(sibling.id);
  };

  const deleteNodeAnywhere = (id: string) => {
    setFlow((current) => removeNode(current, id));
    setSideSections((current) =>
      current.map((section) => ({
        ...section,
        nodes: removeNode(section.nodes, id),
      })),
    );
    setSelectedId(null);
    if (connectionSourceId === id) setConnectionSourceId(null);
  };

  const handleConnectionClick = (id: string) => {
    if (!connectionSourceId) {
      setConnectionSourceId(id);
      selectNodeAnywhere(id);
      return;
    }
    if (connectionSourceId === id) {
      setConnectionSourceId(null);
      return;
    }
    if (sectionForNode(connectionSourceId) !== sectionForNode(id)) {
      toast({
        title: "Choose a node in the same section",
        description:
          "Connections stay readable inside one flow or side section.",
      });
      return;
    }
    const target =
      findNode(flow, id) ??
      sideSections.map((section) => findNode(section.nodes, id)).find(Boolean);
    updateNodeAnywhere(id, {
      additionalParentIds: [
        ...new Set([
          ...(target?.additionalParentIds ?? []),
          connectionSourceId,
        ]),
      ],
    });
    setConnectionSourceId(null);
    selectNodeAnywhere(id);
  };

  const attachToNode = (id: string, attachment: NodeAttachment) => {
    const node =
      findNode(flow, id) ??
      sideSections.map((section) => findNode(section.nodes, id)).find(Boolean);
    updateNodeAnywhere(id, {
      attachments: [...(node?.attachments ?? []), attachment],
    });
  };

  const attachToSection = (id: string, attachment: NodeAttachment) =>
    setSideSections((current) =>
      current.map((section) =>
        section.id === id
          ? {
              ...section,
              attachments: [...(section.attachments ?? []), attachment],
            }
          : section,
      ),
    );

  const removeSectionAttachment = (sectionId: string, attachmentId: string) =>
    setSideSections((current) =>
      current.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              attachments: (section.attachments ?? []).filter(
                (attachment) => attachment.id !== attachmentId,
              ),
            }
          : section,
      ),
    );

  const startAttachmentDrag = (
    event: React.DragEvent<HTMLElement>,
    type: NodeAttachment["type"],
  ) => {
    event.dataTransfer.setData("application/x-medcard-attachment", type);
    event.dataTransfer.effectAllowed = "copy";
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          topic,
          tags,
          flow,
          sideSections,
          canvasElements,
        } satisfies CardDraft),
      );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [topic, tags, flow, sideSections, canvasElements]);

  useEffect(() => {
    if (selectedId && !findNode(activeNodes, selectedId)) setSelectedId(null);
  }, [activeNodes, selectedId]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setConnectionSourceId(null);
      setSelectedCanvasId(null);
      setSelectedId(null);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  const addCanvasElement = (
    type: CanvasElement["type"],
    overrides: Partial<CanvasElement> = {},
  ) => {
    const element: CanvasElement = {
      id: `canvas-${crypto.randomUUID()}`,
      type,
      x: 48,
      y: 38,
      width: type === "line" ? 18 : type === "text" ? 18 : 14,
      height: type === "line" ? 3 : type === "text" ? 7 : 13,
      content:
        type === "note" ? "Quick note" : type === "text" ? "Text" : undefined,
      backgroundColor: type === "note" ? "#fff3a8" : "transparent",
      textColor: "#26384e",
      strokeColor: freeformColor,
      strokeWidth: 2,
      ...overrides,
    };
    setCanvasElements((current) => [...current, element]);
    setSelectedCanvasId(element.id);
    setFreeformTool("select");
  };

  const addCanvasImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Use an image smaller than 5 MB",
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      addCanvasElement("image", {
        dataUrl: String(reader.result),
        content: file.name,
        width: 20,
        height: 20,
      });
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const updateSelected = (update: (node: FlowNode) => FlowNode) => {
    if (!selectedId) return;
    setActiveNodes(mapNode(activeNodes, selectedId, update));
  };

  const addRoot = (label = "New node") => {
    const node = makeNode(label);
    setActiveNodes([...activeNodes, node]);
    setSelectedId(node.id);
  };

  const addChild = (parentId: string) => {
    const child = makeNode();
    setActiveNodes(
      mapNode(activeNodes, parentId, (node) => ({
        ...node,
        children: [...(node.children ?? []), child],
      })),
    );
    setSelectedId(child.id);
  };

  const addSibling = (nodeId: string) => {
    const sibling = makeNode();
    setActiveNodes(insertAfter(activeNodes, nodeId, sibling));
    setSelectedId(sibling.id);
  };

  const duplicate = (node: FlowNode) => {
    const cloneNode = (source: FlowNode): FlowNode => ({
      ...source,
      id: makeNode().id,
      label: `${source.label} copy`,
      additionalParentIds: [],
      children: (source.children ?? []).map(cloneNode),
    });
    const clone = cloneNode(node);
    setActiveNodes(insertAfter(activeNodes, node.id, clone));
    setSelectedId(clone.id);
  };

  const importOutline = () => {
    const parsed = parseOutline(outline);
    if (!parsed.length) {
      toast({ title: "Add at least one outline line", variant: "destructive" });
      return;
    }
    if (
      activeNodes.length &&
      !confirm(
        `Replace the current ${activeSection === "main" ? "Main flow" : (activeSideSection?.title ?? "section")}?`,
      )
    )
      return;
    setActiveNodes(parsed);
    setSelectedId(parsed[0].id);
    setShowBulk(false);
    toast({ title: `${flattenNodes(parsed).length} nodes created instantly` });
  };

  const save = () => {
    if (!topic.trim()) {
      toast({ title: "Give this MedCard a title", variant: "destructive" });
      return;
    }
    if (
      !flow.length &&
      !sideSections.some((section) => section.nodes.length) &&
      !canvasElements.length
    ) {
      toast({ title: "Add at least one node", variant: "destructive" });
      return;
    }
    const sourceText = [
      nodesToText(flow),
      ...sideSections.map((section) =>
        section.nodes.length
          ? `\n${section.title}\n${nodesToText(section.nodes)}`
          : "",
      ),
    ]
      .filter(Boolean)
      .join("\n");
    createMutation.mutate(
      {
        data: {
          topic: topic.trim(),
          tags,
          rawText: sourceText,
          flow,
          sectionTrees: EMPTY_TREES,
          sideSections,
          sourceBlocks: [],
          images: [],
          canvasElements,
          sidebar: {
            high_yield: [],
            risk_factors: [],
            diagnosis: [],
            treatment: [],
            complications: [],
          },
        },
      },
      {
        onSuccess: (card) => {
          localStorage.removeItem(DRAFT_KEY);
          setLocation(`/cards/${card.id}`);
        },
        onError: (error) =>
          toast({
            title: "Could not save the manual card",
            description: error instanceof Error ? error.message : undefined,
            variant: "destructive",
          }),
      },
    );
  };

  const addTag = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if ((event.key !== "Enter" && event.key !== ",") || !tagInput.trim())
      return;
    event.preventDefault();
    if (!tags.includes(tagInput.trim())) setTags([...tags, tagInput.trim()]);
    setTagInput("");
  };

  return (
    <div className="manual-page">
      <header className="manual-header">
        <div>
          <Badge variant="outline">
            <Sparkles className="mr-1 h-3.5 w-3.5" /> 2–5 minute builder
          </Badge>
          <h1>Build a MedCard manually—at typing speed.</h1>
          <p>
            Paste a whole outline, refine any node, and watch the finished card
            update live.
          </p>
        </div>
        <div className="manual-header-actions">
          <span className="manual-saved">
            <Check /> Draft autosaved
          </span>
          <Button
            variant="outline"
            onClick={() => setShowStructurePanel((value) => !value)}
          >
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            {showStructurePanel ? "Hide outline tools" : "Outline tools"}
          </Button>
          <Button onClick={save} disabled={createMutation.isPending}>
            {createMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save card
          </Button>
        </div>
      </header>

      <section className="manual-identity">
        <Input
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          placeholder="Card title (e.g. Heart failure)"
          aria-label="Card title"
        />
        <div className="manual-tags">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
              <X onClick={() => setTags(tags.filter((item) => item !== tag))} />
            </Badge>
          ))}
          <Input
            value={tagInput}
            onChange={(event) => setTagInput(event.target.value)}
            onKeyDown={addTag}
            placeholder="Tag + Enter"
            aria-label="Add tag"
          />
        </div>
      </section>

      <div
        className={`manual-workbench ${showStructurePanel ? "has-editor" : "is-preview-only"}`}
      >
        {showStructurePanel && (
          <section className="manual-editor">
            <div
              className="manual-section-tabs"
              role="tablist"
              aria-label="Card sections"
            >
              {[
                { id: "main", title: "Main flow", nodes: flow },
                ...sideSections,
              ].map((section) => {
                const count = flattenNodes(section.nodes).length;
                return (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeSection === section.id}
                    className={activeSection === section.id ? "is-active" : ""}
                    onClick={() => {
                      setActiveSection(section.id);
                      setSelectedId(null);
                    }}
                    key={section.id}
                  >
                    {section.title}
                    {count > 0 && <span>{count}</span>}
                  </button>
                );
              })}
              <button type="button" onClick={() => addSideSection()}>
                <Plus /> Section
              </button>
            </div>

            <div className="manual-fast-tools">
              <button
                type="button"
                onClick={() => setShowBulk((value) => !value)}
              >
                <Braces /> Bulk outline <span>Fastest</span>
                {showBulk ? <ChevronDown /> : <ChevronRight />}
              </button>
              {showBulk && (
                <div className="manual-bulk-body">
                  <Textarea
                    value={outline}
                    onChange={(event) => setOutline(event.target.value)}
                    placeholder={
                      "Inflammation -> capillary leak -> edema\n  Hypoxemia :: low oxygen\n  Reduced compliance\nTreatment\n  Oxygen\n  Diuretics"
                    }
                  />
                  <div>
                    <small>
                      Indent with spaces or Tab. Use → for chains and :: for
                      smaller detail text.
                    </small>
                    <Button size="sm" onClick={importOutline}>
                      <GitBranch className="mr-2 h-4 w-4" /> Build this section
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="manual-tree-heading">
              <div>
                <h2>
                  {activeSection === "main"
                    ? "Main flow"
                    : activeSideSection?.title}
                </h2>
                <p>Enter = sibling · Tab = child</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => addRoot()}>
                <Plus className="mr-1 h-4 w-4" /> Root node
              </Button>
            </div>

            <div className="manual-node-list">
              {activeNodes.length ? (
                activeNodes.map((node) => (
                  <NodeRow
                    key={node.id}
                    node={node}
                    depth={0}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    onChange={(id, update) =>
                      setActiveNodes(mapNode(activeNodes, id, update))
                    }
                    onAddChild={addChild}
                    onAddSibling={addSibling}
                    onDuplicate={duplicate}
                    onDelete={(id) =>
                      setActiveNodes(removeNode(activeNodes, id))
                    }
                  />
                ))
              ) : (
                <button
                  type="button"
                  className="manual-empty-nodes"
                  onClick={() => addRoot()}
                >
                  <CirclePlus />
                  <strong>Add the first node</strong>
                  <span>or paste an outline above</span>
                </button>
              )}
            </div>

            {selectedNode && (
              <aside className="manual-inspector">
                <div className="manual-inspector-title">
                  <div>
                    <Palette />
                    <span>
                      <strong>Selected node</strong>
                      <small>Full formatting & connections</small>
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedId(null)}
                  >
                    <X />
                  </Button>
                </div>
                <label>
                  Detail / side text
                  <Textarea
                    value={selectedNode.sublabel ?? ""}
                    onChange={(event) =>
                      updateSelected((node) => ({
                        ...node,
                        sublabel: event.target.value || null,
                      }))
                    }
                    placeholder="Optional explanation shown below the node"
                  />
                </label>
                <div className="manual-color-row">
                  <label>
                    Background
                    <input
                      type="color"
                      value={selectedNode.backgroundColor ?? "#ffffff"}
                      onChange={(event) =>
                        updateSelected((node) => ({
                          ...node,
                          backgroundColor: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    Text
                    <input
                      type="color"
                      value={selectedNode.textColor ?? "#172033"}
                      onChange={(event) =>
                        updateSelected((node) => ({
                          ...node,
                          textColor: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
                <div className="manual-palette" aria-label="Color presets">
                  {PALETTE.map(([background, textColor]) => (
                    <button
                      type="button"
                      key={background}
                      title={`${background} / ${textColor}`}
                      style={{ background, color: textColor }}
                      onClick={() =>
                        updateSelected((node) => ({
                          ...node,
                          backgroundColor: background,
                          textColor,
                        }))
                      }
                    >
                      Aa
                    </button>
                  ))}
                </div>
                {activeSection !== "main" && (
                  <label>
                    Side-note layout
                    <select
                      value={selectedNode.presentation ?? "bullets"}
                      onChange={(event) =>
                        updateSelected((node) => ({
                          ...node,
                          presentation: event.target.value as NonNullable<
                            FlowNode["presentation"]
                          >,
                        }))
                      }
                    >
                      <option value="bullets">Bullets</option>
                      <option value="callout">Callout box</option>
                      <option value="table">Two-column table</option>
                      <option value="diagram">Mini diagram</option>
                    </select>
                  </label>
                )}
                <label>
                  <span className="manual-label-icon">
                    <Link2 /> Extra incoming connections
                  </span>
                  <select
                    multiple
                    value={selectedNode.additionalParentIds ?? []}
                    onChange={(event) =>
                      updateSelected((node) => ({
                        ...node,
                        additionalParentIds: Array.from(
                          event.target.selectedOptions,
                          (option) => option.value,
                        ),
                      }))
                    }
                  >
                    {allActiveNodes
                      .filter((node) => !invalidParentIds.has(node.id))
                      .map((node) => (
                        <option key={node.id} value={node.id}>
                          {node.label}
                        </option>
                      ))}
                  </select>
                  <small>
                    Hold Cmd/Ctrl to select several. The normal parent
                    connection stays intact.
                  </small>
                </label>
              </aside>
            )}
          </section>
        )}

        <aside className="manual-preview">
          <div className="manual-preview-heading">
            <div>
              <strong>Live preview</strong>
              <span>
                {flattenNodes(flow).length +
                  sideSections.reduce(
                    (sum, section) => sum + flattenNodes(section.nodes).length,
                    0,
                  )}{" "}
                nodes
              </span>
            </div>
            <span>
              <Keyboard /> Keyboard-first
            </span>
          </div>
          <p className="sr-only" role="status" aria-live="polite">
            {connectionSourceId
              ? "Connection started. Select another node in this section."
              : selectedId
                ? "Node selected. Use the plus below for a child or the plus at the side for a sibling."
                : "Interactive card preview ready."}
          </p>
          <div className="freeform-toolbar" aria-label="Freeform page tools">
            <button
              type="button"
              className={freeformTool === "select" ? "is-active" : ""}
              onClick={() => setFreeformTool("select")}
              title="Select, move and resize"
            >
              <MousePointer2 />
              <span>Select</span>
            </button>
            <button
              type="button"
              onClick={() => addCanvasElement("text")}
              title="Add free text"
            >
              <Type />
              <span>Text</span>
            </button>
            <button
              type="button"
              draggable
              onDragStart={(event) => startAttachmentDrag(event, "note")}
              onClick={() => addCanvasElement("note")}
              title="Click for page note, or drag into a node/section"
            >
              <StickyNote />
              <span>Note</span>
            </button>
            <label title="Add an image">
              <ImagePlus />
              <span>Image</span>
              <input type="file" accept="image/*" onChange={addCanvasImage} />
            </label>
            <button
              type="button"
              draggable
              onDragStart={(event) => startAttachmentDrag(event, "rectangle")}
              onClick={() => addCanvasElement("rectangle")}
              title="Click for page box, or drag into a node/section"
            >
              <Square />
              <span>Box</span>
            </button>
            <button
              type="button"
              draggable
              onDragStart={(event) => startAttachmentDrag(event, "ellipse")}
              onClick={() => addCanvasElement("ellipse")}
              title="Click for page circle, or drag into a node/section"
            >
              <Circle />
              <span>Circle</span>
            </button>
            <button
              type="button"
              onClick={() => addCanvasElement("line")}
              title="Add line"
            >
              <Minus />
              <span>Line</span>
            </button>
            <button
              type="button"
              className={freeformTool === "draw" ? "is-active" : ""}
              onClick={() => setFreeformTool("draw")}
              title="Draw anywhere"
            >
              <PenLine />
              <span>Pen</span>
            </button>
            <button
              type="button"
              className={freeformTool === "highlight" ? "is-active" : ""}
              onClick={() => setFreeformTool("highlight")}
              title="Highlight anywhere"
            >
              <Highlighter />
              <span>Highlight</span>
            </button>
            <button
              type="button"
              onClick={() =>
                setCanvasElements((current) => current.slice(0, -1))
              }
              disabled={!canvasElements.length}
              title="Undo last page item"
            >
              <Undo2 />
              <span>Undo</span>
            </button>
            <input
              type="color"
              value={freeformColor}
              onChange={(event) => setFreeformColor(event.target.value)}
              title="Pen and shape color"
              aria-label="Freeform color"
            />
            {selectedCanvasElement &&
              selectedCanvasElement.type !== "drawing" && (
                <div className="freeform-selected-tools">
                  <label title="Selected item color">
                    Fill
                    <input
                      type="color"
                      value={
                        selectedCanvasElement.type === "line"
                          ? (selectedCanvasElement.strokeColor ?? "#d53b36")
                          : selectedCanvasElement.backgroundColor ===
                              "transparent"
                            ? "#ffffff"
                            : (selectedCanvasElement.backgroundColor ??
                              "#ffffff")
                      }
                      onChange={(event) =>
                        updateCanvasElement(
                          selectedCanvasElement.id,
                          selectedCanvasElement.type === "line" ||
                            selectedCanvasElement.type === "rectangle" ||
                            selectedCanvasElement.type === "ellipse"
                            ? {
                                strokeColor: event.target.value,
                                backgroundColor:
                                  selectedCanvasElement.type === "line"
                                    ? undefined
                                    : event.target.value,
                              }
                            : { backgroundColor: event.target.value },
                        )
                      }
                    />
                  </label>
                  {(selectedCanvasElement.type === "text" ||
                    selectedCanvasElement.type === "note") && (
                    <label title="Selected text color">
                      Text
                      <input
                        type="color"
                        value={selectedCanvasElement.textColor ?? "#26384e"}
                        onChange={(event) =>
                          updateCanvasElement(selectedCanvasElement.id, {
                            textColor: event.target.value,
                          })
                        }
                      />
                    </label>
                  )}
                  <button
                    type="button"
                    title="Duplicate selected item"
                    onClick={() =>
                      addCanvasElement(selectedCanvasElement.type, {
                        ...selectedCanvasElement,
                        id: `canvas-${crypto.randomUUID()}`,
                        x: selectedCanvasElement.x + 2,
                        y: selectedCanvasElement.y + 2,
                      })
                    }
                  >
                    <Copy />
                    <span>Copy</span>
                  </button>
                  <button
                    type="button"
                    title="Delete selected item"
                    onClick={() => {
                      setCanvasElements((current) =>
                        current.filter(
                          (element) => element.id !== selectedCanvasElement.id,
                        ),
                      );
                      setSelectedCanvasId(null);
                    }}
                  >
                    <Trash2 />
                    <span>Delete</span>
                  </button>
                </div>
              )}
            <small>
              {freeformTool === "select"
                ? "Drag items · resize from the corner"
                : "Draw directly on the page"}
            </small>
          </div>
          <MemoryCardCanvas
            topic={topic}
            flow={flow}
            sectionTrees={EMPTY_TREES}
            sideSections={sideSections}
            canvasElements={canvasElements}
            onCanvasElementsChange={setCanvasElements}
            freeformTool={freeformTool}
            freeformColor={freeformColor}
            selectedCanvasId={selectedCanvasId}
            onSelectCanvasElement={setSelectedCanvasId}
            directNodeEditing={{
              selectedId,
              connectionSourceId,
              onSelect: selectNodeAnywhere,
              onChange: updateNodeAnywhere,
              onAddChild: addChildAnywhere,
              onAddSibling: addSiblingAnywhere,
              onDelete: deleteNodeAnywhere,
              onConnectionClick: handleConnectionClick,
              onAttach: attachToNode,
              onDuplicate: duplicate,
              isSideNode: (id) => sectionForNode(id) !== "main",
            }}
            onAttachToSection={attachToSection}
            onRemoveSectionAttachment={removeSectionAttachment}
            selectedSectionId={
              activeSection === "main" || selectedId ? null : activeSection
            }
            onRenameSideSection={renameSideSection}
            onDeleteSideSection={deleteSideSection}
            onAddSideSectionAfter={addSideSectionAfter}
            onSelectSideSection={(id) => {
              setActiveSection(id);
              setSelectedId(null);
              setSelectedCanvasId(null);
            }}
            onAddFirstSideSection={() => addSideSection()}
            onAddRootNode={() => {
              const node = makeNode();
              setActiveSection("main");
              setFlow((current) => [...current, node]);
              setSelectedId(node.id);
            }}
          />
        </aside>
      </div>
    </div>
  );
}

function NodeRow({
  node,
  depth,
  selectedId,
  onSelect,
  onChange,
  onAddChild,
  onAddSibling,
  onDuplicate,
  onDelete,
}: {
  node: FlowNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange: (id: string, update: (node: FlowNode) => FlowNode) => void;
  onAddChild: (id: string) => void;
  onAddSibling: (id: string) => void;
  onDuplicate: (node: FlowNode) => void;
  onDelete: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = Boolean(node.children?.length);
  return (
    <>
      <div
        className={`manual-node-row ${selectedId === node.id ? "is-selected" : ""}`}
        style={{ marginLeft: `${Math.min(depth, 8) * 22}px` }}
        onClick={() => onSelect(node.id)}
      >
        <button
          type="button"
          className="manual-collapse"
          onClick={(event) => {
            event.stopPropagation();
            setCollapsed((value) => !value);
          }}
          disabled={!hasChildren}
        >
          {hasChildren ? (
            collapsed ? (
              <ChevronRight />
            ) : (
              <ChevronDown />
            )
          ) : (
            <span />
          )}
        </button>
        <span
          className="manual-node-swatch"
          style={{
            background: node.backgroundColor ?? "#ffffff",
            color: node.textColor ?? "#172033",
          }}
        >
          {depth ? "→" : "●"}
        </span>
        <Input
          value={node.label}
          onFocus={() => onSelect(node.id)}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) =>
            onChange(node.id, (current) => ({
              ...current,
              label: event.target.value,
            }))
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onAddSibling(node.id);
            }
            if (event.key === "Tab" && !event.shiftKey) {
              event.preventDefault();
              onAddChild(node.id);
            }
          }}
          placeholder="Type node text"
        />
        <div className="manual-node-actions">
          <button
            type="button"
            title="Add child (Tab)"
            onClick={(event) => {
              event.stopPropagation();
              onAddChild(node.id);
            }}
          >
            <GitBranch />
          </button>
          <button
            type="button"
            title="Duplicate"
            onClick={(event) => {
              event.stopPropagation();
              onDuplicate(node);
            }}
          >
            <Copy />
          </button>
          <button
            type="button"
            title="Delete"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(node.id);
            }}
          >
            <Trash2 />
          </button>
        </div>
      </div>
      {!collapsed &&
        (node.children ?? []).map((child) => (
          <NodeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedId={selectedId}
            onSelect={onSelect}
            onChange={onChange}
            onAddChild={onAddChild}
            onAddSibling={onAddSibling}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
          />
        ))}
    </>
  );
}
