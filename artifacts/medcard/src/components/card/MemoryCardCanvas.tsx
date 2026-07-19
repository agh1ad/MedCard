import type {
  CardImage,
  CardImageSection,
  FlowNode,
  SectionTrees,
} from "@workspace/api-client-react";
import {
  Activity,
  AlertTriangle,
  BookOpenCheck,
  HeartPulse,
  Link2,
  Pill,
} from "lucide-react";
import { useLayoutEffect, useRef } from "react";

interface MemoryCardCanvasProps {
  topic: string;
  flow: FlowNode[];
  sectionTrees: SectionTrees;
  images?: CardImage[];
  className?: string;
}

const SECTION_CONFIG: Array<{
  key: keyof SectionTrees;
  title: string;
  icon: typeof Activity;
  accent: string;
}> = [
  { key: "high_yield", title: "High yield", icon: BookOpenCheck, accent: "pink" },
  { key: "risk_factors", title: "Risk factors", icon: AlertTriangle, accent: "blue" },
  { key: "associations", title: "Associations", icon: Link2, accent: "blue" },
  { key: "diagnosis", title: "Diagnosis", icon: Activity, accent: "dark-green" },
  { key: "treatment", title: "Treatment", icon: Pill, accent: "bright-green" },
  { key: "complications", title: "Complications", icon: HeartPulse, accent: "red" },
];

type SemanticRole = NonNullable<FlowNode["semanticRole"]>;

const SECTION_ROLES: Partial<Record<keyof SectionTrees, SemanticRole>> = {
  high_yield: "core",
  diagnosis: "diagnosis",
  treatment: "treatment",
  complications: "complication",
};

const TABLE_HEADERS: Partial<
  Record<keyof SectionTrees, readonly [string, string]>
> = {
  high_yield: ["Item", "Key pearl"],
  risk_factors: ["Risk factor", "Mechanism"],
  associations: ["Association", "Key link"],
};

interface MemoryTableGroup {
  root?: FlowNode;
  rows: FlowNode[];
}

function splitTableGroups(
  section: keyof SectionTrees,
  nodes: FlowNode[],
): { tables: MemoryTableGroup[]; trees: FlowNode[] } {
  if (!TABLE_HEADERS[section]) return { tables: [], trees: nodes };

  const grouped = nodes.reduce<{ tables: MemoryTableGroup[]; trees: FlowNode[] }>(
    (result, root) => {
      const children = root.children ?? [];
      const isPairedComparison =
        children.length > 0 &&
        children.every(
          (child) =>
            Boolean(child.sublabel?.trim()) && !(child.children?.length ?? 0),
        );

      if (isPairedComparison) result.tables.push({ root, rows: children });
      else result.trees.push(root);
      return result;
    },
    { tables: [], trees: [] },
  );

  const directRows = grouped.trees.filter(
    (node) => Boolean(node.sublabel?.trim()) && !(node.children?.length ?? 0),
  );
  if (directRows.length === grouped.trees.length && directRows.length > 0) {
    grouped.tables.push({ rows: directRows });
    grouped.trees = [];
  }

  return grouped;
}

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

function HighlightedText({ text, terms = [] }: { text: string; terms?: string[] }) {
  const usableTerms = [...new Set(terms.map((term) => term.trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  if (!usableTerms.length) return text;

  const pattern = new RegExp(`(${usableTerms.map(escapePattern).join("|")})`, "gi");
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
  const semanticRole = roleOverride ?? node.semanticRole ?? "fact";

  return (
    <div className={`memory-tree-branch ${compact ? "is-compact" : ""}`}>
      <div
        className={`memory-node role-${semanticRole} origin-${node.origin ?? "source"}`}
        title={node.origin === "ai_added" ? "Added by AI for context" : undefined}
      >
        <span>
          <HighlightedText text={node.label} terms={node.highlightTerms} />
        </span>
        {node.sublabel && (
          <small>
            <HighlightedText text={node.sublabel} terms={node.highlightTerms} />
          </small>
        )}
      </div>
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

function MemoryTable({
  group,
  headers,
  roleOverride,
}: {
  group: MemoryTableGroup;
  headers: readonly [string, string];
  roleOverride?: SemanticRole;
}) {
  const { root } = group;
  return (
    <div className={`memory-table-group origin-${root?.origin ?? "source"}`}>
      {root && (
        <>
          <h3>
            <HighlightedText text={root.label} terms={root.highlightTerms} />
          </h3>
          {root.sublabel && (
            <p>
              <HighlightedText
                text={root.sublabel}
                terms={root.highlightTerms}
              />
            </p>
          )}
        </>
      )}
      <table className="memory-table">
        <thead>
          <tr>
            <th>{headers[0]}</th>
            <th>{headers[1]}</th>
          </tr>
        </thead>
        <tbody>
          {group.rows.map((row) => {
            const semanticRole = roleOverride ?? row.semanticRole ?? "fact";
            return (
              <tr
                className={`origin-${row.origin ?? "source"}`}
                key={row.id}
                title={
                  row.origin === "ai_added" ? "Added by AI for context" : undefined
                }
              >
                <td className={`role-${semanticRole}`}>
                  <HighlightedText text={row.label} terms={row.highlightTerms} />
                </td>
                <td>
                  <HighlightedText
                    text={row.sublabel ?? ""}
                    terms={row.highlightTerms}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
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
}: MemoryCardCanvasProps) {
  const cardRef = useRef<HTMLElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const totalNodes =
    countNodes(flow) +
    Object.values(sectionTrees).reduce((total, nodes) => total + countNodes(nodes), 0);
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
      card.querySelectorAll("img").forEach((image) =>
        image.removeEventListener("load", fitCard),
      );
    };
  }, [topic, flow, sectionTrees, images]);

  return (
    <div className={`memory-card-shell ${className}`}>
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
            const { tables, trees } = splitTableGroups(key, nodes);
            const tableHeaders = TABLE_HEADERS[key];
            return (
              <section
                className={`memory-section accent-${accent} ${tables.length ? "has-table" : ""} ${countNodes(nodes) > 5 ? "is-dense" : ""}`}
                key={key}
              >
                <header>
                  <Icon />
                  <h2>{title}</h2>
                </header>
                {tableHeaders &&
                  tables.map((group) => (
                    <MemoryTable
                      group={group}
                      headers={tableHeaders}
                      key={group.root?.id ?? `${key}-direct-table`}
                      roleOverride={SECTION_ROLES[key]}
                    />
                  ))}
                <MemoryTree
                  nodes={trees}
                  compact
                  roleOverride={SECTION_ROLES[key]}
                />
                <SectionImages images={sectionImages} />
              </section>
            );
          })}
        </aside>

        <main className="memory-main" ref={mainRef}>
          {flow.length ? (
            <MemoryTree nodes={flow} />
          ) : (
            <div className="memory-empty">No central mechanism was identified.</div>
          )}
          <SectionImages images={imagesFor("main")} />
        </main>

        <footer className="memory-card-footer">
          <span>SOURCE-TRACEABLE VISUAL CARD</span>
          <span>{totalNodes} information blocks</span>
        </footer>
      </article>
    </div>
  );
}
