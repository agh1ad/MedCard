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
  { key: "high_yield", title: "High yield", icon: BookOpenCheck, accent: "amber" },
  { key: "risk_factors", title: "Risk factors", icon: AlertTriangle, accent: "rose" },
  { key: "associations", title: "Associations", icon: Link2, accent: "blue" },
  { key: "diagnosis", title: "Diagnosis", icon: Activity, accent: "cyan" },
  { key: "treatment", title: "Treatment", icon: Pill, accent: "emerald" },
  { key: "complications", title: "Complications", icon: HeartPulse, accent: "violet" },
];

function countNodes(nodes: FlowNode[]): number {
  return nodes.reduce(
    (total, node) => total + 1 + countNodes(node.children ?? []),
    0,
  );
}

const MIN_FONT_SIZE = 8.5;
const MAX_FONT_SIZE = 24;

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

function MemoryNode({ node, compact = false }: { node: FlowNode; compact?: boolean }) {
  const children = node.children ?? [];

  return (
    <div className={`memory-tree-branch ${compact ? "is-compact" : ""}`}>
      <div className={`memory-node tone-${node.tone ?? "ink"}`}>
        <span>{node.label}</span>
        {node.sublabel && <small>{node.sublabel}</small>}
      </div>
      {children.length > 0 && (
        <div className="memory-tree-descendants">
          <div className="memory-tree-stem" />
          <div className="memory-tree-children">
            {children.map((child) => (
              <div className="memory-tree-child" key={child.id}>
                <div className="memory-tree-drop" />
                <MemoryNode node={child} compact={compact} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MemoryTree({ nodes, compact = false }: { nodes: FlowNode[]; compact?: boolean }) {
  if (!nodes.length) return null;
  return (
    <div className={`memory-tree ${compact ? "is-compact" : ""}`}>
      {nodes.map((node) => (
        <MemoryNode key={node.id} node={node} compact={compact} />
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
          {SECTION_CONFIG.map(({ key, title, icon: Icon, accent }) => {
            const nodes = sectionTrees[key] ?? [];
            const sectionImages = imagesFor(key);
            if (!nodes.length && !sectionImages.length) return null;
            return (
              <section className={`memory-section accent-${accent}`} key={key}>
                <header>
                  <Icon />
                  <h2>{title}</h2>
                </header>
                <MemoryTree nodes={nodes} compact />
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
          <span>VERBATIM SOURCE</span>
          <span>{totalNodes} information blocks</span>
        </footer>
      </article>
    </div>
  );
}
