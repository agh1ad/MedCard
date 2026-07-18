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
  const totalNodes =
    countNodes(flow) +
    Object.values(sectionTrees).reduce((total, nodes) => total + countNodes(nodes), 0);
  const density = totalNodes > 38 ? "dense" : totalNodes > 24 ? "compact" : "comfortable";
  const imagesFor = (section: CardImageSection) =>
    images.filter((image) => image.section === section);

  return (
    <div className={`memory-card-shell ${className}`}>
      <article id="memory-card-print" className={`memory-card density-${density}`}>
        <div className="memory-card-title">
          <span className="memory-card-kicker">MEDCARD / VISUAL NOTE</span>
          <h1>{topic || "Untitled medical card"}</h1>
          <div className="memory-title-stem" />
        </div>

        <aside className="memory-sidebar">
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

        <main className="memory-main">
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
