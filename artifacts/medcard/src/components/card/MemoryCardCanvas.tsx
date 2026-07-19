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

function setCardScale(card: HTMLElement, fontSize: number) {
  const scale = fontSize / 12;
  card.style.setProperty("--memory-font", `${fontSize}px`);
  card.style.setProperty("--memory-gap", `${Math.max(4, 12 * scale)}px`);
  card.style.setProperty("--memory-node-width", `${Math.max(150, 190 * scale)}px`);
  card.style.setProperty("--memory-section-pad", `${Math.max(4, 7 * scale)}px`);
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
                style={{ flexGrow: compact ? 1 : countLeaves(child) }}
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

  if (!compact && nodes.length > 1) {
    return (
      <div className="memory-tree memory-tree-root-group">
        <div className="memory-tree-children memory-tree-root-children">
          {nodes.map((node) => (
            <div
              className="memory-tree-child"
              key={node.id}
              style={{ flexGrow: countLeaves(node) }}
            >
              <div className="memory-tree-drop" />
              <MemoryNode node={node} roleOverride={roleOverride} />
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
  const sectionColumns = SECTION_CONFIG.reduce<
    Array<Array<(typeof SECTION_CONFIG)[number]>>
  >(
    (columns, section) => {
      const weight = (sectionTrees[section.key] ?? []).reduce(
        (total, node) => total + countNodes([node]),
        0,
      );
      const imageWeight = imagesFor(section.key).length * 3;
      if (!weight && !imageWeight) return columns;
      const columnWeights = columns.map((column) =>
        column.reduce(
          (total, item) =>
            total +
            countNodes(sectionTrees[item.key] ?? []) +
            imagesFor(item.key).length * 3 +
            1,
          0,
        ),
      );
      const target = columnWeights[0] <= columnWeights[1] ? 0 : 1;
      columns[target].push(section);
      return columns;
    },
    [[], []],
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
        let low = MIN_FONT_SIZE;
        let high = MAX_FONT_SIZE;

        // Find the largest type size that keeps both card columns fully visible.
        for (let pass = 0; pass < 10; pass += 1) {
          const candidate = (low + high) / 2;
          setCardScale(card, candidate);
          if (contentFits(sidebar) && contentFits(main)) {
            low = candidate;
          } else {
            high = candidate;
          }
        }

        setCardScale(card, low);
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
          {sectionColumns.map((column, columnIndex) => (
            <div className="memory-sidebar-column" key={columnIndex}>
              {column.map(({ key, title, icon: Icon, accent }) => {
                const nodes = sectionTrees[key] ?? [];
                const sectionImages = imagesFor(key);
                return (
                  <section
                    className={`memory-section accent-${accent} ${countNodes(nodes) > 5 ? "is-dense" : ""}`}
                    key={key}
                  >
                    <header>
                      <Icon />
                      <h2>{title}</h2>
                    </header>
                    <MemoryTree
                      nodes={nodes}
                      compact
                      roleOverride={SECTION_ROLES[key]}
                    />
                    <SectionImages images={sectionImages} />
                  </section>
                );
              })}
            </div>
          ))}
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
