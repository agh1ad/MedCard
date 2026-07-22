import type {
  CanvasElement,
  CardImage,
  CardImageSection,
  FlowNode,
  NodeAttachment,
  SectionContentBlock,
  SectionTrees,
  SideSection,
} from "@workspace/api-client-react";
import {
  FreeformCanvasLayer,
  type FreeformTool,
} from "@/components/card/FreeformCanvasLayer";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpenCheck,
  CheckSquare,
  Copy,
  GitFork,
  HeartPulse,
  ImagePlus,
  Link2,
  ListChecks,
  MessageSquareText,
  Move,
  Plus,
  Pill,
  Table2,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import {
  createContext,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export interface DirectNodeEditing {
  selectedId: string | null;
  connectionSourceId: string | null;
  onSelect: (id: string) => void;
  onChange: (id: string, patch: Partial<FlowNode>) => void;
  onAddChild: (id: string) => void;
  onAddSibling: (id: string) => void;
  onDelete: (id: string) => void;
  onConnectionClick: (id: string) => void;
  onAttach: (id: string, attachment: NodeAttachment) => void;
  onDuplicate?: (node: FlowNode) => void;
  isSideNode?: (id: string) => boolean;
}

const DirectNodeContext = createContext<DirectNodeEditing | null>(null);

interface MemoryCardCanvasProps {
  topic: string;
  flow: FlowNode[];
  sectionTrees: SectionTrees;
  images?: CardImage[];
  className?: string;
  canvasElements?: CanvasElement[];
  onCanvasElementsChange?: (elements: CanvasElement[]) => void;
  freeformTool?: FreeformTool;
  freeformColor?: string;
  selectedCanvasId?: string | null;
  onSelectCanvasElement?: (id: string | null) => void;
  directNodeEditing?: DirectNodeEditing;
  sideSections?: SideSection[];
  onAttachToSection?: (id: string, attachment: NodeAttachment) => void;
  onRemoveSectionAttachment?: (sectionId: string, attachmentId: string) => void;
  selectedSectionId?: string | null;
  onRenameSideSection?: (id: string, title: string) => void;
  onDeleteSideSection?: (id: string) => void;
  onAddSideSectionAfter?: (id: string) => void;
  onSelectSideSection?: (id: string) => void;
  onAddFirstSideSection?: () => void;
  onAddRootNode?: () => void;
  onAddNodeToSection?: (sectionId: string) => void;
  onAddSectionBlock?: (
    sectionId: string,
    type: SectionContentBlock["type"],
  ) => void;
  onUpdateSectionBlock?: (
    sectionId: string,
    blockId: string,
    patch: Partial<SectionContentBlock>,
  ) => void;
  onDeleteSectionBlock?: (sectionId: string, blockId: string) => void;
  onDuplicateSectionBlock?: (sectionId: string, blockId: string) => void;
  onMoveSectionBlock?: (
    sectionId: string,
    blockId: string,
    direction: -1 | 1,
  ) => void;
}

const DIRECT_NODE_PALETTE = [
  ["#ffffff", "#172033"],
  ["#dff4ff", "#12344d"],
  ["#dcfce7", "#14532d"],
  ["#fef3c7", "#713f12"],
  ["#fce7f3", "#831843"],
  ["#ede9fe", "#4c1d95"],
  ["#fee2e2", "#7f1d1d"],
  ["#16324f", "#ffffff"],
] as const;

const QUICK_SECTION_NAMES = [
  "High yield",
  "Risk factors",
  "Associations",
  "Diagnosis",
  "Treatment",
  "Complications",
  "Clinical features",
  "Pathophysiology",
  "Investigations",
  "Differential diagnosis",
  "Prognosis",
] as const;

const SECTION_CONFIG: Array<{
  key: keyof SectionTrees;
  title: string;
  icon: typeof Activity;
  accent: string;
}> = [
  {
    key: "high_yield",
    title: "High yield",
    icon: BookOpenCheck,
    accent: "pink",
  },
  {
    key: "risk_factors",
    title: "Risk factors",
    icon: AlertTriangle,
    accent: "blue",
  },
  { key: "associations", title: "Associations", icon: Link2, accent: "blue" },
  {
    key: "diagnosis",
    title: "Diagnosis",
    icon: Activity,
    accent: "dark-green",
  },
  { key: "treatment", title: "Treatment", icon: Pill, accent: "bright-green" },
  {
    key: "complications",
    title: "Complications",
    icon: HeartPulse,
    accent: "red",
  },
];

type SemanticRole = NonNullable<FlowNode["semanticRole"]>;

const SECTION_ROLES: Partial<Record<keyof SectionTrees, SemanticRole>> = {
  high_yield: "core",
  diagnosis: "diagnosis",
  treatment: "treatment",
  complications: "complication",
};

function countNodes(nodes: FlowNode[]): number {
  return nodes.reduce(
    (total, node) => total + 1 + countNodes(node.children ?? []),
    0,
  );
}

function countLeaves(node: FlowNode): number {
  const children = node.children ?? [];
  return children.length
    ? children.reduce((total, child) => total + countLeaves(child), 0)
    : 1;
}

const MIN_FONT_SIZE = 11.5;
const MAX_FONT_SIZE = 28;

function setRegionScale(
  card: HTMLElement,
  region: "main" | "sidebar",
  fontSize: number,
) {
  card.style.setProperty(`--memory-${region}-font`, `${fontSize}px`);
}

function contentFits(element: HTMLElement) {
  return (
    element.scrollHeight <= element.clientHeight + 1 &&
    element.scrollWidth <= element.clientWidth + 1
  );
}

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightedText({
  text,
  terms = [],
}: {
  text: string;
  terms?: string[];
}) {
  const usableTerms = [
    ...new Set(terms.map((term) => term.trim()).filter(Boolean)),
  ].sort((a, b) => b.length - a.length);
  if (!usableTerms.length) return text;

  const pattern = new RegExp(
    `(${usableTerms.map(escapePattern).join("|")})`,
    "gi",
  );
  const lookup = new Set(usableTerms.map((term) => term.toLocaleLowerCase()));
  return text.split(pattern).map((part, index) =>
    lookup.has(part.toLocaleLowerCase()) ? (
      <mark className="memory-concept" key={`${part}-${index}`}>
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function MemoryNode({
  node,
  compact = false,
  roleOverride,
}: {
  node: FlowNode;
  compact?: boolean;
  roleOverride?: SemanticRole;
}) {
  const children = node.children ?? [];

  return (
    <div className={`memory-tree-branch ${compact ? "is-compact" : ""}`}>
      <MemoryNodeCell node={node} roleOverride={roleOverride} />
      {children.length > 0 && (
        <div className="memory-tree-descendants">
          <div className="memory-tree-stem" />
          <div className="memory-tree-children">
            {children.map((child) => (
              <div
                className="memory-tree-child"
                key={child.id}
                style={{ flexGrow: countLeaves(child) }}
              >
                <div className="memory-tree-drop" />
                <MemoryNode
                  node={child}
                  compact={compact}
                  roleOverride={roleOverride}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MemoryNodeCell({
  node,
  roleOverride,
}: {
  node: FlowNode;
  roleOverride?: SemanticRole;
}) {
  const semanticRole = roleOverride ?? node.semanticRole ?? "fact";
  const editor = useContext(DirectNodeContext);
  const isSelected = editor?.selectedId === node.id;
  const isConnectionSource = editor?.connectionSourceId === node.id;
  const visualStyle = {
    ...(node.backgroundColor || node.textColor
      ? {
          background: node.backgroundColor,
          color: node.textColor,
          borderColor: node.backgroundColor,
        }
      : {}),
    ...(node.position
      ? {
          transform: `translate3d(${node.position.x}px, ${node.position.y}px, 0)`,
        }
      : {}),
  };

  return (
    <div
      className={`memory-node role-${semanticRole} origin-${node.origin ?? "source"} ${editor ? "is-direct-editable" : ""} ${isSelected ? "is-direct-selected" : ""} ${isConnectionSource ? "is-connection-source" : ""}`}
      style={visualStyle}
      onClick={(event) => {
        if (!editor) return;
        event.stopPropagation();
        if (
          editor.connectionSourceId &&
          editor.connectionSourceId !== node.id
        ) {
          editor.onConnectionClick(node.id);
        } else {
          editor.onSelect(node.id);
        }
      }}
      title={node.origin === "ai_added" ? "Added by AI for context" : undefined}
      tabIndex={editor ? 0 : undefined}
      aria-label={editor ? `Node: ${node.label}` : undefined}
      onDragOver={(event) => editor && event.preventDefault()}
      onDrop={(event) => {
        if (!editor) return;
        event.preventDefault();
        attachFromDrop(event.dataTransfer, (attachment) =>
          editor.onAttach(node.id, attachment),
        );
      }}
    >
      {editor ? (
        <>
          <input
            className="memory-direct-label"
            value={node.label}
            aria-label="Node text"
            onFocus={() => editor.onSelect(node.id)}
            onChange={(event) =>
              editor.onChange(node.id, { label: event.target.value })
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                editor.onAddSibling(node.id);
              } else if (event.key === "Tab") {
                event.preventDefault();
                editor.onAddChild(node.id);
              }
            }}
          />
          {(isSelected || node.sublabel) && (
            <input
              className="memory-direct-detail"
              value={node.sublabel ?? ""}
              placeholder="Add side text…"
              aria-label="Node side text"
              onChange={(event) =>
                editor.onChange(node.id, {
                  sublabel: event.target.value || null,
                })
              }
            />
          )}
          <DirectNodeActions node={node} />
          <NodeAttachments node={node} />
        </>
      ) : (
        <>
          <span>
            <HighlightedText text={node.label} terms={node.highlightTerms} />
          </span>
          {node.sublabel && (
            <small
              style={node.textColor ? { color: node.textColor } : undefined}
            >
              <HighlightedText
                text={node.sublabel}
                terms={node.highlightTerms}
              />
            </small>
          )}
          <NodeAttachments node={node} />
        </>
      )}
    </div>
  );
}

function DirectNodeActions({ node }: { node: FlowNode }) {
  const editor = useContext(DirectNodeContext);
  if (!editor || editor.selectedId !== node.id) return null;
  const beginMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const container = handle.closest<HTMLElement>(
      ".memory-node, .memory-bullets li, .memory-side-callout, .memory-side-table tr, .memory-side-table-wrap h3",
    );
    if (!container) return;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = node.position ?? { x: 0, y: 0 };
    const move = (moveEvent: PointerEvent) => {
      container.style.transform = `translate3d(${origin.x + moveEvent.clientX - startX}px, ${origin.y + moveEvent.clientY - startY}px, 0)`;
    };
    const end = (endEvent: PointerEvent) => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      editor.onChange(node.id, {
        position: {
          x: Math.round(origin.x + endEvent.clientX - startX),
          y: Math.round(origin.y + endEvent.clientY - startY),
        },
      });
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
  };
  return (
    <>
      <button
        type="button"
        className="memory-add-handle add-child"
        aria-label="Add child below"
        title="Add child below"
        onClick={(event) => {
          event.stopPropagation();
          editor.onAddChild(node.id);
        }}
      >
        <Plus />
      </button>
      <button
        type="button"
        className="memory-add-handle add-sibling"
        aria-label="Add sibling beside"
        title="Add sibling beside"
        onClick={(event) => {
          event.stopPropagation();
          editor.onAddSibling(node.id);
        }}
      >
        <Plus />
      </button>
      <span
        className="memory-node-popover"
        role="toolbar"
        aria-label={`Edit ${node.label}`}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="memory-node-popover-title">Edit node</span>
        <span
          className="memory-node-popover-palette"
          aria-label="Node color presets"
        >
          {DIRECT_NODE_PALETTE.map(([backgroundColor, textColor]) => (
            <button
              type="button"
              key={backgroundColor}
              title={`Use ${backgroundColor}`}
              style={{ background: backgroundColor, color: textColor }}
              onClick={() =>
                editor.onChange(node.id, { backgroundColor, textColor })
              }
            >
              Aa
            </button>
          ))}
        </span>
        <label>
          Fill
          <input
            type="color"
            value={node.backgroundColor ?? "#ffffff"}
            aria-label="Node fill color"
            onChange={(event) =>
              editor.onChange(node.id, { backgroundColor: event.target.value })
            }
          />
        </label>
        <label>
          Text
          <input
            type="color"
            value={node.textColor ?? "#172033"}
            aria-label="Node text color"
            onChange={(event) =>
              editor.onChange(node.id, { textColor: event.target.value })
            }
          />
        </label>
        {editor.isSideNode?.(node.id) && (
          <select
            value={node.presentation ?? "bullets"}
            aria-label="Node layout"
            onChange={(event) =>
              editor.onChange(node.id, {
                presentation: event.target.value as NonNullable<
                  FlowNode["presentation"]
                >,
              })
            }
          >
            <option value="bullets">Bullets</option>
            <option value="callout">Callout</option>
            <option value="table">Table</option>
            <option value="diagram">Diagram</option>
          </select>
        )}
        {editor.onDuplicate && (
          <button
            type="button"
            title="Duplicate node"
            aria-label="Duplicate node"
            onClick={() => editor.onDuplicate?.(node)}
          >
            <Copy />
          </button>
        )}
        {node.position && (
          <button
            type="button"
            title="Return to automatic layout"
            aria-label="Reset node position"
            onClick={() => editor.onChange(node.id, { position: undefined })}
          >
            <Undo2 />
          </button>
        )}
      </span>
      <span className="memory-direct-actions">
        <button
          type="button"
          title="Move node"
          aria-label="Move node"
          onPointerDown={beginMove}
        >
          <Move />
        </button>
        <button
          type="button"
          className={editor.connectionSourceId === node.id ? "is-active" : ""}
          title={
            editor.connectionSourceId
              ? "Connect to this node"
              : "Start connection"
          }
          onClick={(event) => {
            event.stopPropagation();
            editor.onConnectionClick(node.id);
          }}
        >
          <Link2 />
        </button>
        <button
          type="button"
          title="Delete node"
          onClick={(event) => {
            event.stopPropagation();
            editor.onDelete(node.id);
          }}
        >
          <Trash2 />
        </button>
      </span>
    </>
  );
}

function attachFromDrop(
  transfer: DataTransfer,
  onAttachment: (attachment: NodeAttachment) => void,
) {
  const file = Array.from(transfer.files).find((item) =>
    item.type.startsWith("image/"),
  );
  if (file) {
    const reader = new FileReader();
    reader.onload = () =>
      onAttachment({
        id: `attachment-${crypto.randomUUID()}`,
        type: "image",
        content: file.name,
        dataUrl: String(reader.result),
      });
    reader.readAsDataURL(file);
    return;
  }
  const type = transfer.getData("application/x-medcard-attachment") as
    NodeAttachment["type"] | "";
  if (!type) return;
  onAttachment({
    id: `attachment-${crypto.randomUUID()}`,
    type,
    content: type === "note" ? "Quick note" : undefined,
    backgroundColor: type === "note" ? "#fff3a8" : "#dbeafe",
    textColor: "#26384e",
  });
}

function NodeAttachments({ node }: { node: FlowNode }) {
  const editor = useContext(DirectNodeContext);
  const attachments = node.attachments ?? [];
  if (!attachments.length) return null;
  return (
    <span className="memory-node-attachments">
      {attachments.map((attachment) => (
        <span className="node-attachment-wrap" key={attachment.id}>
          {attachment.type === "image" && attachment.dataUrl ? (
            <img
              src={attachment.dataUrl}
              alt={attachment.content ?? "Node attachment"}
            />
          ) : (
            <span
              className={`node-attachment type-${attachment.type}`}
              style={{
                background: attachment.backgroundColor,
                color: attachment.textColor,
              }}
            >
              {attachment.content ?? ""}
            </span>
          )}
          {editor && editor.selectedId === node.id && (
            <button
              type="button"
              aria-label={`Remove ${attachment.type} attachment`}
              title="Remove attachment"
              onClick={(event) => {
                event.stopPropagation();
                editor.onChange(node.id, {
                  attachments: attachments.filter(
                    (item) => item.id !== attachment.id,
                  ),
                });
              }}
            >
              <Trash2 />
            </button>
          )}
        </span>
      ))}
    </span>
  );
}

function MemoryTree({
  nodes,
  compact = false,
  roleOverride,
}: {
  nodes: FlowNode[];
  compact?: boolean;
  roleOverride?: SemanticRole;
}) {
  if (!nodes.length) return null;

  if (nodes.length > 1) {
    return (
      <div
        className={`memory-tree memory-tree-root-group ${compact ? "is-compact" : ""}`}
      >
        <div className="memory-tree-children memory-tree-root-children">
          {nodes.map((node) => (
            <div
              className="memory-tree-child"
              key={node.id}
              style={{ flexGrow: countLeaves(node) }}
            >
              <div className="memory-tree-drop" />
              <MemoryNode
                node={node}
                compact={compact}
                roleOverride={roleOverride}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`memory-tree ${compact ? "is-compact" : ""}`}>
      {nodes.map((node) => (
        <MemoryNode
          key={node.id}
          node={node}
          compact={compact}
          roleOverride={roleOverride}
        />
      ))}
    </div>
  );
}

interface FlowGraphEdge {
  from: string;
  to: string;
  kind: "primary" | "additional";
}

function buildFlowGraph(roots: FlowNode[]) {
  const nodes = new Map<
    string,
    { node: FlowNode; depth: number; order: number }
  >();
  const edges: FlowGraphEdge[] = [];
  let order = 0;

  const visit = (node: FlowNode, depth: number, parentId?: string) => {
    const existing = nodes.get(node.id);
    if (!existing) {
      nodes.set(node.id, { node, depth, order: order++ });
    } else if (depth > existing.depth) {
      existing.depth = depth;
    }
    if (parentId) edges.push({ from: parentId, to: node.id, kind: "primary" });
    (node.children ?? []).forEach((child) => visit(child, depth + 1, node.id));
  };

  roots.forEach((root) => visit(root, 0));
  for (const { node } of nodes.values()) {
    for (const parentId of node.additionalParentIds ?? []) {
      if (nodes.has(parentId)) {
        edges.push({ from: parentId, to: node.id, kind: "additional" });
      }
    }
  }

  const layers = [...nodes.values()].reduce<
    Array<Array<{ node: FlowNode; order: number }>>
  >((result, entry) => {
    result[entry.depth] ??= [];
    result[entry.depth].push({ node: entry.node, order: entry.order });
    return result;
  }, []);
  layers.forEach((layer) => layer.sort((a, b) => a.order - b.order));
  return { edges, layers };
}

function MemoryFlowGraph({ nodes }: { nodes: FlowNode[] }) {
  const graphRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLDivElement>());
  const markerId = `memory-arrow-${useId().replace(/:/g, "")}`;
  const [paths, setPaths] = useState<
    Array<FlowGraphEdge & { d: string; feedback: boolean }>
  >([]);
  const graph = buildFlowGraph(nodes);

  useLayoutEffect(() => {
    const graphElement = graphRef.current;
    if (!graphElement) return;
    let frame = 0;

    const drawConnections = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const graphBox = graphElement.getBoundingClientRect();
        const nextPaths = graph.edges.flatMap((edge, index) => {
          const source = nodeRefs.current
            .get(edge.from)
            ?.getBoundingClientRect();
          const target = nodeRefs.current.get(edge.to)?.getBoundingClientRect();
          if (!source || !target) return [];

          if (edge.from === edge.to) {
            const x = source.right - graphBox.left;
            const startY = source.top - graphBox.top + source.height * 0.32;
            const endY = source.top - graphBox.top + source.height * 0.72;
            const loopX = x + Math.max(18, source.width * 0.18);
            return [
              {
                ...edge,
                feedback: true,
                d: `M ${x} ${startY} C ${loopX} ${startY - 12}, ${loopX} ${endY + 12}, ${x} ${endY}`,
              },
            ];
          }

          const isFeedback = source.top >= target.top;
          if (isFeedback) {
            const startX = source.right - graphBox.left;
            const startY = source.top - graphBox.top + source.height / 2;
            const endX = target.right - graphBox.left;
            const endY = target.top - graphBox.top + target.height / 2;
            const routeX = Math.max(startX, endX) + 18 + (index % 3) * 7;
            return [
              {
                ...edge,
                feedback: true,
                d: `M ${startX} ${startY} C ${routeX} ${startY}, ${routeX} ${endY}, ${endX} ${endY}`,
              },
            ];
          }

          const startX = source.left - graphBox.left + source.width / 2;
          const startY = source.bottom - graphBox.top;
          const endX = target.left - graphBox.left + target.width / 2;
          const endY = target.top - graphBox.top;
          const bend = Math.max(8, (endY - startY) * 0.48);
          return [
            {
              ...edge,
              feedback: false,
              d: `M ${startX} ${startY} C ${startX} ${startY + bend}, ${endX} ${endY - bend}, ${endX} ${endY}`,
            },
          ];
        });
        setPaths(nextPaths);
      });
    };

    const observer = new ResizeObserver(drawConnections);
    observer.observe(graphElement);
    nodeRefs.current.forEach((element) => observer.observe(element));
    drawConnections();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [nodes]);

  if (!graph.layers.length) return null;

  return (
    <div className="memory-flow-graph" ref={graphRef}>
      <svg className="memory-flow-edges" aria-hidden="true">
        <defs>
          <marker
            id={markerId}
            markerHeight="6"
            markerWidth="6"
            orient="auto"
            refX="5"
            refY="3"
          >
            <path d="M 0 0 L 6 3 L 0 6 z" />
          </marker>
        </defs>
        {paths.map((path, index) => (
          <path
            className={`memory-flow-edge ${path.kind === "additional" ? "is-additional" : ""} ${path.feedback ? "is-feedback" : ""}`}
            d={path.d}
            key={`${path.from}-${path.to}-${index}`}
            markerEnd={`url(#${markerId})`}
          />
        ))}
      </svg>
      <div className="memory-flow-layers">
        {graph.layers.map((layer, depth) => (
          <div className="memory-flow-layer" key={depth}>
            {layer.map(({ node }) => (
              <div
                className="memory-flow-cell"
                data-flow-node-id={node.id}
                key={node.id}
                ref={(element) => {
                  if (element) nodeRefs.current.set(node.id, element);
                  else nodeRefs.current.delete(node.id);
                }}
              >
                <MemoryNodeCell node={node} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function MemoryBulletList({
  nodes,
  roleOverride,
  nodeLabels,
}: {
  nodes: FlowNode[];
  roleOverride?: SemanticRole;
  nodeLabels: Map<string, string>;
}) {
  const editor = useContext(DirectNodeContext);
  if (!nodes.length) return null;

  return (
    <ul className="memory-bullets">
      {nodes.map((node) => {
        const isSelected = editor?.selectedId === node.id;
        const semanticRole = roleOverride ?? node.semanticRole ?? "fact";
        const detailParts = (node.sublabel ?? "")
          .split(/\s*•\s*/)
          .map((part) => part.trim())
          .filter(Boolean);
        const hasDetailList = detailParts.length > 1;
        const linkedFrom = (node.additionalParentIds ?? [])
          .map((id) => nodeLabels.get(id))
          .filter((label): label is string => Boolean(label));
        return (
          <li
            className={`role-${semanticRole} origin-${node.origin ?? "source"} ${editor ? "is-direct-editable" : ""} ${isSelected ? "is-direct-selected" : ""} ${editor?.connectionSourceId === node.id ? "is-connection-source" : ""}`}
            style={
              node.backgroundColor || node.textColor || node.position
                ? {
                    background: node.backgroundColor,
                    color: node.textColor,
                    borderRadius: "0.35em",
                    padding: node.backgroundColor ? "0.18em 0.32em" : undefined,
                    transform: node.position
                      ? `translate3d(${node.position.x}px, ${node.position.y}px, 0)`
                      : undefined,
                  }
                : undefined
            }
            key={node.id}
            tabIndex={editor ? 0 : undefined}
            aria-label={editor ? `Node: ${node.label}` : undefined}
            onDragOver={(event) => editor && event.preventDefault()}
            onDrop={(event) => {
              if (!editor) return;
              event.preventDefault();
              event.stopPropagation();
              attachFromDrop(event.dataTransfer, (attachment) =>
                editor.onAttach(node.id, attachment),
              );
            }}
            onClick={(event) => {
              if (!editor) return;
              event.stopPropagation();
              if (
                editor.connectionSourceId &&
                editor.connectionSourceId !== node.id
              ) {
                editor.onConnectionClick(node.id);
              } else {
                editor.onSelect(node.id);
              }
            }}
            title={
              node.origin === "ai_added" ? "Added by AI for context" : undefined
            }
          >
            <div>
              <strong>
                {editor ? (
                  <input
                    className="memory-direct-label"
                    value={node.label}
                    aria-label="Node text"
                    onChange={(event) =>
                      editor.onChange(node.id, { label: event.target.value })
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        editor.onAddSibling(node.id);
                      } else if (event.key === "Tab") {
                        event.preventDefault();
                        editor.onAddChild(node.id);
                      }
                    }}
                  />
                ) : (
                  <HighlightedText
                    text={node.label}
                    terms={node.highlightTerms}
                  />
                )}
              </strong>
              {editor && (isSelected || node.sublabel) ? (
                <input
                  className="memory-direct-detail"
                  value={node.sublabel ?? ""}
                  placeholder="Add side text…"
                  aria-label="Node side text"
                  onChange={(event) =>
                    editor.onChange(node.id, {
                      sublabel: event.target.value || null,
                    })
                  }
                />
              ) : (
                detailParts.length === 1 && (
                  <span
                    className="memory-bullet-detail"
                    style={
                      node.textColor ? { color: node.textColor } : undefined
                    }
                  >
                    <HighlightedText
                      text={detailParts[0]}
                      terms={node.highlightTerms}
                    />
                  </span>
                )
              )}
              <DirectNodeActions node={node} />
              <NodeAttachments node={node} />
            </div>
            {!editor && hasDetailList && (
              <ul
                className="memory-bullet-detail-list"
                style={node.textColor ? { color: node.textColor } : undefined}
              >
                {detailParts.map((part, index) => (
                  <li key={`${node.id}-detail-${index}`}>
                    <HighlightedText text={part} terms={node.highlightTerms} />
                  </li>
                ))}
              </ul>
            )}
            {linkedFrom.length > 0 && (
              <span
                className="memory-bullet-links"
                style={node.textColor ? { color: node.textColor } : undefined}
              >
                Linked from: {linkedFrom.join(" + ")}
              </span>
            )}
            <MemoryBulletList
              nodes={node.children ?? []}
              nodeLabels={nodeLabels}
              roleOverride={roleOverride}
            />
          </li>
        );
      })}
    </ul>
  );
}

function collectNodeLabels(
  nodes: FlowNode[],
  labels = new Map<string, string>(),
) {
  for (const node of nodes) {
    labels.set(node.id, node.label);
    collectNodeLabels(node.children ?? [], labels);
  }
  return labels;
}

function MemorySideTable({
  root,
  nodeLabels,
}: {
  root: FlowNode;
  nodeLabels: Map<string, string>;
}) {
  const editor = useContext(DirectNodeContext);
  const rows = root.children?.length ? root.children : [root];
  return (
    <div className="memory-side-table-wrap">
      {root.children?.length ? (
        <h3
          className={editor?.selectedId === root.id ? "is-direct-selected" : ""}
          style={
            root.position
              ? {
                  transform: `translate3d(${root.position.x}px, ${root.position.y}px, 0)`,
                }
              : undefined
          }
          onClick={() => {
            if (!editor) return;
            if (
              editor.connectionSourceId &&
              editor.connectionSourceId !== root.id
            )
              editor.onConnectionClick(root.id);
            else editor.onSelect(root.id);
          }}
          onDragOver={(event) => editor && event.preventDefault()}
          onDrop={(event) => {
            if (!editor) return;
            event.preventDefault();
            attachFromDrop(event.dataTransfer, (attachment) =>
              editor.onAttach(root.id, attachment),
            );
          }}
        >
          {editor ? (
            <input
              className="memory-direct-label"
              value={root.label}
              onFocus={() => editor.onSelect(root.id)}
              onChange={(event) =>
                editor.onChange(root.id, { label: event.target.value })
              }
            />
          ) : (
            <HighlightedText text={root.label} terms={root.highlightTerms} />
          )}
          <DirectNodeActions node={root} />
          <NodeAttachments node={root} />
        </h3>
      ) : null}
      <table className="memory-side-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Key point</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={
                editor?.selectedId === row.id ? "is-direct-selected" : ""
              }
              style={
                row.position
                  ? {
                      transform: `translate3d(${row.position.x}px, ${row.position.y}px, 0)`,
                    }
                  : undefined
              }
              onClick={() => {
                if (!editor) return;
                if (
                  editor.connectionSourceId &&
                  editor.connectionSourceId !== row.id
                )
                  editor.onConnectionClick(row.id);
                else editor.onSelect(row.id);
              }}
              onDragOver={(event) => editor && event.preventDefault()}
              onDrop={(event) => {
                if (!editor) return;
                event.preventDefault();
                attachFromDrop(event.dataTransfer, (attachment) =>
                  editor.onAttach(row.id, attachment),
                );
              }}
            >
              <td>
                <strong>
                  {editor ? (
                    <input
                      className="memory-direct-label"
                      value={row.label}
                      onChange={(event) =>
                        editor.onChange(row.id, { label: event.target.value })
                      }
                    />
                  ) : (
                    <HighlightedText
                      text={row.label}
                      terms={row.highlightTerms}
                    />
                  )}
                </strong>
                <DirectNodeActions node={row} />
                <NodeAttachments node={row} />
              </td>
              <td>
                {editor ? (
                  <input
                    className="memory-direct-detail"
                    value={row.sublabel ?? ""}
                    placeholder="Add key point…"
                    onChange={(event) =>
                      editor.onChange(row.id, {
                        sublabel: event.target.value || null,
                      })
                    }
                  />
                ) : row.sublabel ? (
                  <HighlightedText
                    text={row.sublabel}
                    terms={row.highlightTerms}
                  />
                ) : null}
                <MemoryBulletList
                  nodes={row.children ?? []}
                  nodeLabels={nodeLabels}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MemorySideCallout({
  root,
  nodeLabels,
}: {
  root: FlowNode;
  nodeLabels: Map<string, string>;
}) {
  const editor = useContext(DirectNodeContext);
  return (
    <div
      className={`memory-side-callout ${editor ? "is-direct-editable" : ""} ${editor?.selectedId === root.id ? "is-direct-selected" : ""}`}
      style={
        root.backgroundColor || root.textColor || root.position
          ? {
              background: root.backgroundColor,
              color: root.textColor,
              transform: root.position
                ? `translate3d(${root.position.x}px, ${root.position.y}px, 0)`
                : undefined,
            }
          : undefined
      }
      onClick={() => {
        if (!editor) return;
        if (editor.connectionSourceId && editor.connectionSourceId !== root.id)
          editor.onConnectionClick(root.id);
        else editor.onSelect(root.id);
      }}
      onDragOver={(event) => editor && event.preventDefault()}
      onDrop={(event) => {
        if (!editor) return;
        event.preventDefault();
        attachFromDrop(event.dataTransfer, (attachment) =>
          editor.onAttach(root.id, attachment),
        );
      }}
    >
      <strong>
        {editor ? (
          <input
            className="memory-direct-label"
            value={root.label}
            onChange={(event) =>
              editor.onChange(root.id, { label: event.target.value })
            }
          />
        ) : (
          <HighlightedText text={root.label} terms={root.highlightTerms} />
        )}
      </strong>
      {editor ? (
        <input
          className="memory-direct-detail"
          value={root.sublabel ?? ""}
          placeholder="Add side text…"
          onChange={(event) =>
            editor.onChange(root.id, { sublabel: event.target.value || null })
          }
        />
      ) : (
        root.sublabel && (
          <p style={root.textColor ? { color: root.textColor } : undefined}>
            <HighlightedText text={root.sublabel} terms={root.highlightTerms} />
          </p>
        )
      )}
      <DirectNodeActions node={root} />
      <NodeAttachments node={root} />
      <MemoryBulletList nodes={root.children ?? []} nodeLabels={nodeLabels} />
    </div>
  );
}

function MemorySideGroup({
  root,
  nodeLabels,
  roleOverride,
}: {
  root: FlowNode;
  nodeLabels: Map<string, string>;
  roleOverride?: SemanticRole;
}) {
  switch (root.presentation) {
    case "table":
      return <MemorySideTable root={root} nodeLabels={nodeLabels} />;
    case "diagram":
      return (
        <div className="memory-side-diagram">
          <MemoryFlowGraph nodes={[root]} />
        </div>
      );
    case "callout":
      return <MemorySideCallout root={root} nodeLabels={nodeLabels} />;
    default:
      return (
        <MemoryBulletList
          nodes={[root]}
          nodeLabels={nodeLabels}
          roleOverride={roleOverride}
        />
      );
  }
}

function SectionImages({ images }: { images: CardImage[] }) {
  if (!images.length) return null;
  return (
    <div className="memory-images">
      {images.map((image) => (
        <figure key={image.id}>
          <img src={image.dataUrl} alt={image.caption || image.name} />
          {image.caption && <figcaption>{image.caption}</figcaption>}
        </figure>
      ))}
    </div>
  );
}

function SectionAttachments({
  sectionId,
  attachments = [],
  onRemove,
}: {
  sectionId: string;
  attachments?: NodeAttachment[];
  onRemove?: (sectionId: string, attachmentId: string) => void;
}) {
  if (!attachments.length) return null;
  return (
    <div className="memory-section-attachments">
      {attachments.map((attachment) => (
        <div className="section-attachment-wrap" key={attachment.id}>
          {attachment.type === "image" && attachment.dataUrl ? (
            <img
              src={attachment.dataUrl}
              alt={attachment.content ?? "Section attachment"}
            />
          ) : (
            <div
              className={`section-attachment type-${attachment.type}`}
              style={{
                background: attachment.backgroundColor,
                color: attachment.textColor,
              }}
            >
              {attachment.content ?? ""}
            </div>
          )}
          {onRemove && (
            <button
              type="button"
              aria-label={`Remove ${attachment.type} from ${sectionId}`}
              title="Remove section attachment"
              onClick={() => onRemove(sectionId, attachment.id)}
            >
              <Trash2 />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function SectionContentBlocks({
  sectionId,
  blocks = [],
  onUpdate,
  onDelete,
  onDuplicate,
  onMove,
}: {
  sectionId: string;
  blocks?: SectionContentBlock[];
  onUpdate?: (
    sectionId: string,
    blockId: string,
    patch: Partial<SectionContentBlock>,
  ) => void;
  onDelete?: (sectionId: string, blockId: string) => void;
  onDuplicate?: (sectionId: string, blockId: string) => void;
  onMove?: (sectionId: string, blockId: string, direction: -1 | 1) => void;
}) {
  if (!blocks.length) return null;
  const editable = Boolean(onUpdate);
  return (
    <div className="memory-section-blocks">
      {blocks.map((block) => {
        const update = (patch: Partial<SectionContentBlock>) =>
          onUpdate?.(sectionId, block.id, patch);
        const columns = block.columns?.length
          ? block.columns
          : ["Column 1", "Column 2"];
        const rows = block.rows?.length ? block.rows : [["", ""]];
        const items = block.items?.length ? block.items : [""];
        return (
          <article
            className={`memory-section-block type-${block.type}`}
            key={block.id}
            style={{
              background: block.backgroundColor,
              color: block.textColor,
            }}
            onDragOver={(event) => {
              if (editable && block.type === "image") event.preventDefault();
            }}
            onDrop={(event) => {
              if (!editable || block.type !== "image") return;
              const file = [...event.dataTransfer.files].find((item) =>
                item.type.startsWith("image/"),
              );
              if (!file) return;
              event.preventDefault();
              event.stopPropagation();
              const reader = new FileReader();
              reader.onload = () =>
                update({ dataUrl: String(reader.result), title: file.name });
              reader.readAsDataURL(file);
            }}
          >
            {editable && (
              <div className="memory-block-actions">
                <label title="Block color">
                  <input
                    type="color"
                    value={block.backgroundColor ?? "#ffffff"}
                    aria-label="Block color"
                    onChange={(event) =>
                      update({ backgroundColor: event.target.value })
                    }
                  />
                </label>
                <label title="Block text color">
                  <input
                    type="color"
                    value={block.textColor ?? "#26384e"}
                    aria-label="Block text color"
                    onChange={(event) =>
                      update({ textColor: event.target.value })
                    }
                  />
                </label>
                <button
                  type="button"
                  title="Move block up"
                  aria-label="Move block up"
                  onClick={() => onMove?.(sectionId, block.id, -1)}
                >
                  <ArrowUp />
                </button>
                <button
                  type="button"
                  title="Move block down"
                  aria-label="Move block down"
                  onClick={() => onMove?.(sectionId, block.id, 1)}
                >
                  <ArrowDown />
                </button>
                <button
                  type="button"
                  title="Duplicate block"
                  aria-label="Duplicate block"
                  onClick={() => onDuplicate?.(sectionId, block.id)}
                >
                  <Copy />
                </button>
                <button
                  type="button"
                  title="Delete block"
                  aria-label="Delete block"
                  onClick={() => onDelete?.(sectionId, block.id)}
                >
                  <Trash2 />
                </button>
              </div>
            )}

            {(block.type === "text" || block.type === "callout") &&
              (editable ? (
                <>
                  <input
                    className="memory-block-title"
                    value={block.title ?? ""}
                    placeholder={
                      block.type === "callout" ? "Callout title" : "Text title"
                    }
                    aria-label="Block title"
                    onChange={(event) => update({ title: event.target.value })}
                  />
                  <textarea
                    value={block.text ?? ""}
                    placeholder="Type or paste information…"
                    aria-label={`${block.type} content`}
                    onChange={(event) => update({ text: event.target.value })}
                  />
                </>
              ) : (
                <>
                  {block.title && <h3>{block.title}</h3>}
                  <p>{block.text}</p>
                </>
              ))}

            {block.type === "table" && (
              <div className="memory-block-table-wrap">
                {editable ? (
                  <input
                    className="memory-block-title"
                    value={block.title ?? ""}
                    placeholder="Table title"
                    aria-label="Table title"
                    onChange={(event) => update({ title: event.target.value })}
                  />
                ) : (
                  block.title && <h3>{block.title}</h3>
                )}
                <table>
                  <thead>
                    <tr>
                      {columns.map((column, columnIndex) => (
                        <th key={`${block.id}-column-${columnIndex}`}>
                          {editable ? (
                            <input
                              value={column}
                              aria-label={`Column ${columnIndex + 1}`}
                              onChange={(event) =>
                                update({
                                  columns: columns.map((value, index) =>
                                    index === columnIndex
                                      ? event.target.value
                                      : value,
                                  ),
                                })
                              }
                            />
                          ) : (
                            column
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, rowIndex) => (
                      <tr key={`${block.id}-row-${rowIndex}`}>
                        {columns.map((_, columnIndex) => (
                          <td
                            key={`${block.id}-cell-${rowIndex}-${columnIndex}`}
                          >
                            {editable ? (
                              <textarea
                                value={row[columnIndex] ?? ""}
                                aria-label={`Row ${rowIndex + 1}, column ${columnIndex + 1}`}
                                onChange={(event) =>
                                  update({
                                    rows: rows.map((currentRow, index) =>
                                      index === rowIndex
                                        ? columns.map((__, currentColumn) =>
                                            currentColumn === columnIndex
                                              ? event.target.value
                                              : (currentRow[currentColumn] ??
                                                ""),
                                          )
                                        : currentRow,
                                    ),
                                  })
                                }
                              />
                            ) : (
                              row[columnIndex]
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {editable && (
                  <div className="memory-block-add-row">
                    <button
                      type="button"
                      onClick={() =>
                        update({ rows: [...rows, columns.map(() => "")] })
                      }
                    >
                      <Plus /> Row
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        update({
                          columns: [...columns, `Column ${columns.length + 1}`],
                          rows: rows.map((row) => [...row, ""]),
                        })
                      }
                    >
                      <Plus /> Column
                    </button>
                  </div>
                )}
              </div>
            )}

            {(block.type === "flowchart" || block.type === "checklist") && (
              <div className={`memory-block-items type-${block.type}`}>
                {editable ? (
                  <input
                    className="memory-block-title"
                    value={block.title ?? ""}
                    placeholder={
                      block.type === "flowchart"
                        ? "Flowchart title"
                        : "Checklist title"
                    }
                    aria-label="Block title"
                    onChange={(event) => update({ title: event.target.value })}
                  />
                ) : (
                  block.title && <h3>{block.title}</h3>
                )}
                <div className="memory-block-item-list">
                  {items.map((item, itemIndex) => (
                    <div
                      className="memory-block-item"
                      key={`${block.id}-${itemIndex}`}
                    >
                      {block.type === "checklist" && <CheckSquare />}
                      {editable ? (
                        <input
                          value={item}
                          placeholder={
                            block.type === "flowchart"
                              ? `Step ${itemIndex + 1}`
                              : `Item ${itemIndex + 1}`
                          }
                          aria-label={`${block.type} item ${itemIndex + 1}`}
                          onChange={(event) =>
                            update({
                              items: items.map((value, index) =>
                                index === itemIndex
                                  ? event.target.value
                                  : value,
                              ),
                            })
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              update({ items: [...items, ""] });
                            }
                          }}
                        />
                      ) : (
                        <span>{item}</span>
                      )}
                    </div>
                  ))}
                </div>
                {editable && (
                  <button
                    type="button"
                    className="memory-block-add-item"
                    onClick={() => update({ items: [...items, ""] })}
                  >
                    <Plus /> {block.type === "flowchart" ? "Step" : "Item"}
                  </button>
                )}
              </div>
            )}

            {block.type === "image" &&
              (block.dataUrl ? (
                <figure>
                  <img
                    src={block.dataUrl}
                    alt={block.title || "Section image"}
                  />
                  {editable ? (
                    <input
                      value={block.title ?? ""}
                      placeholder="Image caption"
                      aria-label="Image caption"
                      onChange={(event) =>
                        update({ title: event.target.value })
                      }
                    />
                  ) : (
                    block.title && <figcaption>{block.title}</figcaption>
                  )}
                </figure>
              ) : editable ? (
                <label className="memory-block-image-picker">
                  <ImagePlus /> Choose or drop an image
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () =>
                        update({
                          dataUrl: String(reader.result),
                          title: file.name,
                        });
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
              ) : null)}
          </article>
        );
      })}
    </div>
  );
}

export function MemoryCardCanvas({
  topic,
  flow,
  sectionTrees,
  images = [],
  className = "",
  canvasElements = [],
  onCanvasElementsChange,
  freeformTool,
  freeformColor,
  selectedCanvasId,
  onSelectCanvasElement,
  directNodeEditing,
  sideSections,
  onAttachToSection,
  onRemoveSectionAttachment,
  selectedSectionId,
  onRenameSideSection,
  onDeleteSideSection,
  onAddSideSectionAfter,
  onSelectSideSection,
  onAddFirstSideSection,
  onAddRootNode,
  onAddNodeToSection,
  onAddSectionBlock,
  onUpdateSectionBlock,
  onDeleteSectionBlock,
  onDuplicateSectionBlock,
  onMoveSectionBlock,
}: MemoryCardCanvasProps) {
  const cardRef = useRef<HTMLElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const totalNodes =
    countNodes(flow) +
    (sideSections !== undefined
      ? sideSections.reduce(
          (total, section) =>
            total + countNodes(section.nodes) + (section.blocks?.length ?? 0),
          0,
        )
      : Object.values(sectionTrees).reduce(
          (total, nodes) => total + countNodes(nodes),
          0,
        ));
  const imagesFor = (section: CardImageSection) =>
    images.filter((image) => image.section === section);
  const visibleSections = SECTION_CONFIG.filter(
    ({ key }) =>
      (sectionTrees[key]?.length ?? 0) > 0 || imagesFor(key).length > 0,
  );
  const renderedSections =
    sideSections !== undefined
      ? sideSections.map((section, index) => ({
          id: section.id,
          title: section.title,
          nodes: section.nodes,
          attachments: section.attachments,
          blocks: section.blocks,
          Icon: SECTION_CONFIG[index % SECTION_CONFIG.length].icon,
          accent: SECTION_CONFIG[index % SECTION_CONFIG.length].accent,
          roleOverride: undefined as SemanticRole | undefined,
          images: [] as CardImage[],
          custom: true,
        }))
      : visibleSections.map(({ key, title, icon: Icon, accent }) => ({
          id: key,
          title,
          nodes: sectionTrees[key] ?? [],
          attachments: undefined,
          blocks: undefined,
          Icon,
          accent,
          roleOverride: SECTION_ROLES[key],
          images: imagesFor(key),
          custom: false,
        }));

  useLayoutEffect(() => {
    const card = cardRef.current;
    const sidebar = sidebarRef.current;
    const main = mainRef.current;
    if (!card || !sidebar || !main) return;
    if (directNodeEditing) {
      setRegionScale(card, "sidebar", 14);
      setRegionScale(card, "main", 14);
      card.dataset.fitted = "adaptive";
      let frame = 0;
      const adaptHeight = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          const contentHeight = Math.max(
            sidebar.scrollHeight,
            main.scrollHeight,
            540,
          );
          card.style.minHeight = `${contentHeight + 150}px`;
        });
      };
      const adaptiveObserver = new ResizeObserver(adaptHeight);
      adaptiveObserver.observe(sidebar);
      adaptiveObserver.observe(main);
      card.querySelectorAll("img").forEach((image) => {
        if (!image.complete) image.addEventListener("load", adaptHeight);
      });
      adaptHeight();
      return () => {
        cancelAnimationFrame(frame);
        adaptiveObserver.disconnect();
        card
          .querySelectorAll("img")
          .forEach((image) => image.removeEventListener("load", adaptHeight));
      };
    }

    let animationFrame = 0;
    const fitCard = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const fitRegion = (
          region: "main" | "sidebar",
          element: HTMLElement,
        ) => {
          let low = MIN_FONT_SIZE;
          let high = MAX_FONT_SIZE;
          for (let pass = 0; pass < 10; pass += 1) {
            const candidate = (low + high) / 2;
            setRegionScale(card, region, candidate);
            if (contentFits(element)) low = candidate;
            else high = candidate;
          }
          setRegionScale(card, region, low);
        };

        fitRegion("sidebar", sidebar);
        fitRegion("main", main);
        card.dataset.fitted = "true";
      });
    };

    const resizeObserver = new ResizeObserver(fitCard);
    resizeObserver.observe(card);
    card.querySelectorAll("img").forEach((image) => {
      if (!image.complete) image.addEventListener("load", fitCard);
    });
    fitCard();

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      card
        .querySelectorAll("img")
        .forEach((image) => image.removeEventListener("load", fitCard));
    };
  }, [topic, flow, sectionTrees, sideSections, images, directNodeEditing]);

  return (
    <DirectNodeContext.Provider value={directNodeEditing ?? null}>
      <div id="print-area" className={`memory-card-shell ${className}`}>
        <article
          id="memory-card-print"
          className={`memory-card ${directNodeEditing ? "is-direct-editing is-adaptive" : ""}`}
          ref={cardRef}
        >
          <div className="memory-card-title">
            <span className="memory-card-kicker">MEDCARD / VISUAL NOTE</span>
            <h1>{topic || "Untitled medical card"}</h1>
            <div className="memory-title-stem" />
          </div>

          <aside className="memory-sidebar" ref={sidebarRef}>
            {renderedSections.map(
              ({
                id,
                title,
                nodes,
                attachments,
                blocks,
                Icon,
                accent,
                roleOverride,
                images: sectionImages,
                custom,
              }) => {
                const nodeCount = countNodes(nodes);
                const nodeLabels = collectNodeLabels(nodes);
                const usesWidePresentation = nodes.some(
                  (node) =>
                    node.presentation === "table" ||
                    node.presentation === "diagram",
                );
                return (
                  <section
                    className={`memory-section accent-${accent} ${nodeCount > 3 || usesWidePresentation ? "is-wide" : ""} ${nodeCount > 6 ? "is-dense" : ""}`}
                    key={id}
                    tabIndex={directNodeEditing ? 0 : undefined}
                    aria-label={`${title} section`}
                    onClick={() => custom && onSelectSideSection?.(id)}
                    onDragOver={(event) =>
                      onAttachToSection && event.preventDefault()
                    }
                    onDrop={(event) => {
                      if (!onAttachToSection) return;
                      event.preventDefault();
                      attachFromDrop(event.dataTransfer, (attachment) =>
                        onAttachToSection(id, attachment),
                      );
                    }}
                  >
                    {custom && selectedSectionId === id && (
                      <div
                        className="memory-section-popover"
                        role="toolbar"
                        aria-label={`Edit ${title} section`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <label>
                          Section name
                          <input
                            value={title}
                            autoFocus
                            aria-label="Section name"
                            onChange={(event) =>
                              onRenameSideSection?.(id, event.target.value)
                            }
                          />
                        </label>
                        <select
                          value=""
                          aria-label="Use a common section name"
                          onChange={(event) => {
                            if (event.target.value)
                              onRenameSideSection?.(id, event.target.value);
                          }}
                        >
                          <option value="">Quick name…</option>
                          {QUICK_SECTION_NAMES.map((name) => (
                            <option key={name}>{name}</option>
                          ))}
                        </select>
                        <span
                          className="memory-section-block-tools"
                          aria-label="Add content to section"
                        >
                          <button
                            type="button"
                            title="Add node group"
                            aria-label="Add node to section"
                            onClick={() => onAddNodeToSection?.(id)}
                          >
                            <Plus />
                          </button>
                          <button
                            type="button"
                            title="Add text block"
                            aria-label="Add text block"
                            onClick={() => onAddSectionBlock?.(id, "text")}
                          >
                            <Type />
                          </button>
                          <button
                            type="button"
                            title="Add callout"
                            aria-label="Add callout"
                            onClick={() => onAddSectionBlock?.(id, "callout")}
                          >
                            <MessageSquareText />
                          </button>
                          <button
                            type="button"
                            title="Add table"
                            aria-label="Add table"
                            onClick={() => onAddSectionBlock?.(id, "table")}
                          >
                            <Table2 />
                          </button>
                          <button
                            type="button"
                            title="Add flowchart"
                            aria-label="Add flowchart"
                            onClick={() => onAddSectionBlock?.(id, "flowchart")}
                          >
                            <GitFork />
                          </button>
                          <button
                            type="button"
                            title="Add checklist"
                            aria-label="Add checklist"
                            onClick={() => onAddSectionBlock?.(id, "checklist")}
                          >
                            <ListChecks />
                          </button>
                          <button
                            type="button"
                            title="Add image block"
                            aria-label="Add image block"
                            onClick={() => onAddSectionBlock?.(id, "image")}
                          >
                            <ImagePlus />
                          </button>
                        </span>
                        <button
                          type="button"
                          title="Delete section"
                          aria-label={`Delete ${title} section`}
                          onClick={() => onDeleteSideSection?.(id)}
                        >
                          <Trash2 />
                        </button>
                      </div>
                    )}
                    <header>
                      <Icon />
                      <h2>{title}</h2>
                    </header>
                    <div className="memory-side-groups">
                      {nodes.map((root) => (
                        <MemorySideGroup
                          key={root.id}
                          nodeLabels={nodeLabels}
                          roleOverride={roleOverride}
                          root={root}
                        />
                      ))}
                    </div>
                    <SectionContentBlocks
                      sectionId={id}
                      blocks={blocks}
                      onUpdate={onUpdateSectionBlock}
                      onDelete={onDeleteSectionBlock}
                      onDuplicate={onDuplicateSectionBlock}
                      onMove={onMoveSectionBlock}
                    />
                    <SectionImages images={sectionImages} />
                    <SectionAttachments
                      sectionId={id}
                      attachments={attachments}
                      onRemove={onRemoveSectionAttachment}
                    />
                    {custom && onAddSideSectionAfter && (
                      <button
                        type="button"
                        className="memory-section-insert"
                        aria-label={`Add a section below ${title}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onAddSideSectionAfter(id);
                        }}
                      >
                        <Plus />
                        <span>Add section here</span>
                      </button>
                    )}
                  </section>
                );
              },
            )}
            {sideSections !== undefined && sideSections.length === 0 && (
              <button
                type="button"
                className="memory-empty-insert"
                onClick={onAddFirstSideSection}
              >
                <Plus />
                <span>Add first side section</span>
              </button>
            )}
          </aside>

          <main className="memory-main" ref={mainRef}>
            {flow.length ? (
              <MemoryFlowGraph nodes={flow} />
            ) : (
              <button
                type="button"
                className="memory-empty memory-empty-insert"
                onClick={onAddRootNode}
              >
                <Plus />
                <span>Add first node</span>
              </button>
            )}
            <SectionImages images={imagesFor("main")} />
          </main>

          <footer className="memory-card-footer">
            <span>SOURCE-TRACEABLE VISUAL CARD</span>
            <span>{totalNodes} information blocks</span>
          </footer>
          <FreeformCanvasLayer
            elements={canvasElements}
            onChange={onCanvasElementsChange}
            tool={freeformTool}
            strokeColor={freeformColor}
            selectedId={selectedCanvasId}
            onSelect={onSelectCanvasElement}
          />
        </article>
      </div>
    </DirectNodeContext.Provider>
  );
}
