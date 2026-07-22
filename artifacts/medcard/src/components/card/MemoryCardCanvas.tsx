import type {
  CanvasElement,
  CardImage,
  CardImageSection,
  FlowNode,
  SectionTrees,
} from "@workspace/api-client-react";
import {
  FreeformCanvasLayer,
  type FreeformTool,
} from "@/components/card/FreeformCanvasLayer";
import {
  Activity,
  AlertTriangle,
  BookOpenCheck,
  HeartPulse,
  Link2,
  Pill,
} from "lucide-react";
import { useId, useLayoutEffect, useRef, useState } from "react";

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
}

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

  return (
    <div
      className={`memory-node role-${semanticRole} origin-${node.origin ?? "source"}`}
      style={
        node.backgroundColor || node.textColor
          ? {
              background: node.backgroundColor,
              color: node.textColor,
              borderColor: node.backgroundColor,
            }
          : undefined
      }
      title={node.origin === "ai_added" ? "Added by AI for context" : undefined}
    >
      <span>
        <HighlightedText text={node.label} terms={node.highlightTerms} />
      </span>
      {node.sublabel && (
        <small style={node.textColor ? { color: node.textColor } : undefined}>
          <HighlightedText text={node.sublabel} terms={node.highlightTerms} />
        </small>
      )}
    </div>
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
  if (!nodes.length) return null;

  return (
    <ul className="memory-bullets">
      {nodes.map((node) => {
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
            className={`role-${semanticRole} origin-${node.origin ?? "source"}`}
            style={
              node.backgroundColor || node.textColor
                ? {
                    background: node.backgroundColor,
                    color: node.textColor,
                    borderRadius: "0.35em",
                    padding: node.backgroundColor ? "0.18em 0.32em" : undefined,
                  }
                : undefined
            }
            key={node.id}
            title={
              node.origin === "ai_added" ? "Added by AI for context" : undefined
            }
          >
            <div>
              <strong>
                <HighlightedText
                  text={node.label}
                  terms={node.highlightTerms}
                />
              </strong>
              {detailParts.length === 1 && (
                <span
                  className="memory-bullet-detail"
                  style={node.textColor ? { color: node.textColor } : undefined}
                >
                  <HighlightedText
                    text={detailParts[0]}
                    terms={node.highlightTerms}
                  />
                </span>
              )}
            </div>
            {hasDetailList && (
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
  const rows = root.children?.length ? root.children : [root];
  return (
    <div className="memory-side-table-wrap">
      {root.children?.length ? (
        <h3>
          <HighlightedText text={root.label} terms={root.highlightTerms} />
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
            <tr key={row.id}>
              <td>
                <strong>
                  <HighlightedText
                    text={row.label}
                    terms={row.highlightTerms}
                  />
                </strong>
              </td>
              <td>
                {row.sublabel ? (
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
  return (
    <div
      className="memory-side-callout"
      style={
        root.backgroundColor || root.textColor
          ? { background: root.backgroundColor, color: root.textColor }
          : undefined
      }
    >
      <strong>
        <HighlightedText text={root.label} terms={root.highlightTerms} />
      </strong>
      {root.sublabel && (
        <p style={root.textColor ? { color: root.textColor } : undefined}>
          <HighlightedText text={root.sublabel} terms={root.highlightTerms} />
        </p>
      )}
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
}: MemoryCardCanvasProps) {
  const cardRef = useRef<HTMLElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const totalNodes =
    countNodes(flow) +
    Object.values(sectionTrees).reduce(
      (total, nodes) => total + countNodes(nodes),
      0,
    );
  const imagesFor = (section: CardImageSection) =>
    images.filter((image) => image.section === section);
  const visibleSections = SECTION_CONFIG.filter(
    ({ key }) =>
      (sectionTrees[key]?.length ?? 0) > 0 || imagesFor(key).length > 0,
  );

  useLayoutEffect(() => {
    const card = cardRef.current;
    const sidebar = sidebarRef.current;
    const main = mainRef.current;
    if (!card || !sidebar || !main) return;

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
  }, [topic, flow, sectionTrees, images]);

  return (
    <div id="print-area" className={`memory-card-shell ${className}`}>
      <article id="memory-card-print" className="memory-card" ref={cardRef}>
        <div className="memory-card-title">
          <span className="memory-card-kicker">MEDCARD / VISUAL NOTE</span>
          <h1>{topic || "Untitled medical card"}</h1>
          <div className="memory-title-stem" />
        </div>

        <aside className="memory-sidebar" ref={sidebarRef}>
          {visibleSections.map(({ key, title, icon: Icon, accent }) => {
            const nodes = sectionTrees[key] ?? [];
            const sectionImages = imagesFor(key);
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
                key={key}
              >
                <header>
                  <Icon />
                  <h2>{title}</h2>
                </header>
                <div className="memory-side-groups">
                  {nodes.map((root) => (
                    <MemorySideGroup
                      key={root.id}
                      nodeLabels={nodeLabels}
                      roleOverride={SECTION_ROLES[key]}
                      root={root}
                    />
                  ))}
                </div>
                <SectionImages images={sectionImages} />
              </section>
            );
          })}
        </aside>

        <main className="memory-main" ref={mainRef}>
          {flow.length ? (
            <MemoryFlowGraph nodes={flow} />
          ) : (
            <div className="memory-empty">
              No central mechanism was identified.
            </div>
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
  );
}
