import { type FlowNode } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Plus, ArrowDown } from "lucide-react";

// ── Tree helpers ─────────────────────────────────────────────────────────────

let _idSeq = 0;
function genId(): string {
  return `n${++_idSeq}-${Math.random().toString(36).slice(2, 5)}`;
}

function newNode(label = ""): FlowNode {
  return { id: genId(), label, sublabel: null, children: [] };
}

function flattenNodes(nodes: FlowNode[], result: FlowNode[] = []): FlowNode[] {
  for (const node of nodes) {
    result.push(node);
    flattenNodes(node.children ?? [], result);
  }
  return result;
}

function updateNodeInTree(
  tree: FlowNode[],
  id: string,
  fn: (n: FlowNode) => FlowNode,
): FlowNode[] {
  return tree.map((node) => {
    if (node.id === id) return fn(node);
    if (node.children?.length) {
      return { ...node, children: updateNodeInTree(node.children, id, fn) };
    }
    return node;
  });
}

function deleteNodeFromTree(tree: FlowNode[], id: string): FlowNode[] {
  return tree
    .filter((n) => n.id !== id)
    .map((n) =>
      n.children?.length
        ? { ...n, children: deleteNodeFromTree(n.children, id) }
        : n,
    );
}

function addChildToNode(
  tree: FlowNode[],
  parentId: string,
  child: FlowNode,
): FlowNode[] {
  return tree.map((node) => {
    if (node.id === parentId) {
      return { ...node, children: [...(node.children ?? []), child] };
    }
    if (node.children?.length) {
      return {
        ...node,
        children: addChildToNode(node.children, parentId, child),
      };
    }
    return node;
  });
}

function addSiblingAfter(
  tree: FlowNode[],
  sibId: string,
  sibling: FlowNode,
): FlowNode[] {
  const idx = tree.findIndex((n) => n.id === sibId);
  if (idx !== -1) {
    const next = [...tree];
    next.splice(idx + 1, 0, sibling);
    return next;
  }
  return tree.map((n) =>
    n.children?.length
      ? { ...n, children: addSiblingAfter(n.children, sibId, sibling) }
      : n,
  );
}

// ── Flatten tree to text (for clipboard copy) ────────────────────────────────
export function flattenFlowToText(nodes: FlowNode[], depth = 0): string {
  return nodes
    .map((n) => {
      const indent = "  ".repeat(depth);
      const line = `${indent}→ ${n.label}${n.sublabel ? ` (${n.sublabel})` : ""}`;
      const childrenText = n.children?.length
        ? "\n" + flattenFlowToText(n.children, depth + 1)
        : "";
      return line + childrenText;
    })
    .join("\n");
}

// ── Single tree node ─────────────────────────────────────────────────────────

interface NodeProps {
  node: FlowNode;
  allNodes: FlowNode[];
  isEditing: boolean;
  onTreeChange: (fn: (t: FlowNode[]) => FlowNode[]) => void;
}

function TreeNode({ node, allNodes, isEditing, onTreeChange }: NodeProps) {
  const children = node.children ?? [];
  const n = children.length;
  const hasChildren = n > 0;

  const setLabel = (label: string) =>
    onTreeChange((t) =>
      updateNodeInTree(t, node.id, (nd) => ({ ...nd, label })),
    );

  const setSublabel = (sublabel: string) =>
    onTreeChange((t) =>
      updateNodeInTree(t, node.id, (nd) => ({
        ...nd,
        sublabel: sublabel || null,
      })),
    );

  const setColors = (backgroundColor: string, textColor: string) =>
    onTreeChange((tree) =>
      updateNodeInTree(tree, node.id, (current) => ({
        ...current,
        backgroundColor,
        textColor,
      })),
    );

  const handleDelete = () =>
    onTreeChange((t) => deleteNodeFromTree(t, node.id));

  const handleAddChild = () =>
    onTreeChange((t) => addChildToNode(t, node.id, newNode()));

  const handleAddSibling = () =>
    onTreeChange((t) => addSiblingAfter(t, node.id, newNode()));

  return (
    <div className="flex flex-col items-center">
      {/* ── Node box ── */}
      <div className="relative group/node">
        <div
          className="
            bg-card border border-border rounded-xl px-4 py-3 shadow-sm text-center
            transition-colors hover:border-primary/50
          "
          style={{
            minWidth: "130px",
            maxWidth: "210px",
            background: node.backgroundColor,
            color: node.textColor,
          }}
          data-node-background={node.backgroundColor}
          data-testid={`flow-node-${node.id}`}
        >
          {isEditing ? (
            <div className="flex flex-col gap-1.5">
              <Input
                value={node.label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Node label"
                className="text-sm font-medium text-center h-8 border-border/50 bg-background"
                data-testid={`input-node-label-${node.id}`}
              />
              <div className="flex items-center justify-center gap-2 pt-1 text-[10px] text-muted-foreground">
                <label
                  className="flex items-center gap-1"
                  title="Node background"
                >
                  Fill
                  <input
                    type="color"
                    value={node.backgroundColor ?? "#ffffff"}
                    onChange={(event) =>
                      setColors(event.target.value, node.textColor ?? "#172033")
                    }
                    className="h-5 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                </label>
                <label
                  className="flex items-center gap-1"
                  title="Node text color"
                >
                  Text
                  <input
                    type="color"
                    value={node.textColor ?? "#172033"}
                    onChange={(event) =>
                      setColors(
                        node.backgroundColor ?? "#ffffff",
                        event.target.value,
                      )
                    }
                    className="h-5 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                </label>
              </div>
              {allNodes.length > 1 && (
                <select
                  multiple
                  aria-label="Extra incoming connections"
                  title="Extra incoming connections (Cmd/Ctrl-click)"
                  value={node.additionalParentIds ?? []}
                  onChange={(event) =>
                    onTreeChange((tree) =>
                      updateNodeInTree(tree, node.id, (current) => ({
                        ...current,
                        additionalParentIds: Array.from(
                          event.target.selectedOptions,
                          (option) => option.value,
                        ),
                      })),
                    )
                  }
                  className="min-h-8 rounded border bg-background px-1 text-[10px] text-muted-foreground"
                >
                  {allNodes
                    .filter((candidate) => candidate.id !== node.id)
                    .map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        ↳ {candidate.label || "Untitled node"}
                      </option>
                    ))}
                </select>
              )}
              <Input
                value={node.sublabel ?? ""}
                onChange={(e) => setSublabel(e.target.value)}
                placeholder="Sublabel (optional)"
                className="text-xs text-center h-7 border-border/50 bg-background text-muted-foreground"
              />
            </div>
          ) : (
            <>
              <div className="font-semibold text-sm text-card-foreground leading-snug">
                {node.label}
              </div>
              {node.sublabel && (
                <div className="text-xs text-muted-foreground mt-1 leading-snug italic">
                  {node.sublabel}
                </div>
              )}
            </>
          )}
        </div>

        {/* Delete button */}
        {isEditing && (
          <button
            onClick={handleDelete}
            className="
              absolute -top-2 -right-2 h-5 w-5 rounded-full
              bg-destructive text-destructive-foreground
              flex items-center justify-center
              opacity-0 group-hover/node:opacity-100 transition-opacity
              hover:opacity-80
            "
            title="Delete node"
            data-testid={`button-delete-node-${node.id}`}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Edit action buttons */}
      {isEditing && (
        <div className="flex gap-1 mt-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-muted-foreground hover:text-primary px-2 py-0"
            onClick={handleAddChild}
            data-testid={`button-add-child-${node.id}`}
          >
            + child
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-muted-foreground hover:text-primary px-2 py-0"
            onClick={handleAddSibling}
            data-testid={`button-add-sibling-${node.id}`}
          >
            + sibling
          </Button>
        </div>
      )}

      {/* ── Children area ── */}
      {hasChildren && (
        <div className="flex flex-col items-center w-full">
          {/* Vertical line: node → horizontal bar */}
          <div className="w-px bg-border" style={{ height: "20px" }} />

          {/* Horizontal bar + child columns */}
          <div
            className="relative flex flex-row w-full"
            style={{ gap: "12px" }}
          >
            {/* Horizontal connector spanning center-of-first to center-of-last */}
            {n > 1 && (
              <div
                className="absolute bg-border"
                style={{
                  top: 0,
                  height: "1px",
                  left: `calc(100% / ${2 * n})`,
                  right: `calc(100% / ${2 * n})`,
                }}
              />
            )}

            {children.map((child) => (
              <div key={child.id} className="flex flex-col items-center flex-1">
                {/* Vertical drop from horizontal bar → child */}
                <div className="w-px bg-border" style={{ height: "20px" }} />
                <TreeNode
                  node={child}
                  allNodes={allNodes}
                  isEditing={isEditing}
                  onTreeChange={onTreeChange}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Single-child connector arrow (no horizontal bar needed) */}
      {!hasChildren && !isEditing && null}
    </div>
  );
}

// ── Public FlowTree component ─────────────────────────────────────────────────

export interface FlowTreeProps {
  nodes: FlowNode[];
  isEditing: boolean;
  onChange?: (nodes: FlowNode[]) => void;
}

export function FlowTree({ nodes, isEditing, onChange }: FlowTreeProps) {
  const allNodes = flattenNodes(nodes);
  const handleTreeChange = (fn: (t: FlowNode[]) => FlowNode[]) => {
    if (onChange) onChange(fn(nodes));
  };

  const handleAddRoot = () => {
    if (onChange) onChange([...(nodes ?? []), newNode()]);
  };

  if (!nodes?.length) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="text-center p-8 text-muted-foreground bg-muted/30 rounded-lg border border-dashed border-border/50 w-full max-w-xs">
          No flow nodes defined.
        </div>
        {isEditing && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddRoot}
            data-testid="button-add-first-node"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add First Node
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div
        className="flex flex-col items-center py-6"
        style={{
          minWidth: "max-content",
          paddingLeft: "48px",
          paddingRight: "48px",
        }}
      >
        {nodes.map((rootNode, i) => (
          <div key={rootNode.id} className="flex flex-col items-center w-full">
            {/* Separator between multiple root nodes */}
            {i > 0 && (
              <div className="flex flex-col items-center my-2 opacity-40">
                <div className="w-px h-6 bg-border border-dashed" />
                <ArrowDown className="w-4 h-4 text-muted-foreground" />
              </div>
            )}
            <TreeNode
              node={rootNode}
              allNodes={allNodes}
              isEditing={isEditing}
              onTreeChange={handleTreeChange}
            />
          </div>
        ))}

        {isEditing && (
          <Button
            variant="outline"
            size="sm"
            className="mt-6 border-dashed text-muted-foreground"
            onClick={handleAddRoot}
            data-testid="button-add-root-node"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Root Node
          </Button>
        )}
      </div>
    </div>
  );
}
