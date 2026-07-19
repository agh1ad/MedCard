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

function MemoryBulletList({
  nodes,
  roleOverride,
}: {
  nodes: FlowNode[];
  roleOverride?: SemanticRole;
}) {
  if (!nodes.length) return null;

  return (
    <ul className="memory-bullets">
      {nodes.map((node) => {
        const semanticRole = roleOverride ?? node.semanticRole ?? "fact";
        return (
          <li
            className={`role-${semanticRole} origin-${node.origin ?? "source"}`}
            key={node.id}
            title={
              node.origin === "ai_added" ? "Added by AI for context" : undefined
            }
          >
            <div>
              <strong>
                <HighlightedText text={node.label} terms={node.highlightTerms} />
              </strong>
              {node.sublabel && (
                <span className="memory-bullet-detail">
                  {" — "}
                  <HighlightedText
                    text={node.sublabel}
                    terms={node.highlightTerms}
                  />
                </span>
              )}
            </div>
            <MemoryBulletList
              nodes={node.children ?? []}
              roleOverride={roleOverride}
            />
          </li>
        );
      })}
    </ul>
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
            const nodeCount = countNodes(nodes);
            return (
              <section
                className={`memory-section accent-${accent} ${nodeCount > 3 ? "is-wide" : ""} ${nodeCount > 6 ? "is-dense" : ""}`}
                key={key}
              >
                <header>
                  <Icon />
                  <h2>{title}</h2>
                </header>
                <MemoryBulletList
                  nodes={nodes}
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
