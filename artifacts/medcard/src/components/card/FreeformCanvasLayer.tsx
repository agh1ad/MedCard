import { useRef, useState } from "react";
import type { CanvasElement } from "@workspace/api-client-react";
import { GripVertical, Trash2 } from "lucide-react";

export type FreeformTool = "select" | "draw" | "highlight";

interface Props {
  elements: CanvasElement[];
  onChange?: (elements: CanvasElement[]) => void;
  tool?: FreeformTool;
  strokeColor?: string;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function FreeformCanvasLayer({
  elements,
  onChange,
  tool = "select",
  strokeColor = "#d53b36",
  selectedId,
  onSelect,
}: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef<Array<{ x: number; y: number }> | null>(null);
  const [liveDrawing, setLiveDrawing] = useState<
    Array<{ x: number; y: number }>
  >([]);
  const editable = Boolean(onChange);

  const update = (id: string, patch: Partial<CanvasElement>) =>
    onChange?.(
      elements.map((element) =>
        element.id === id ? { ...element, ...patch } : element,
      ),
    );

  const pointFromEvent = (event: React.PointerEvent) => {
    const bounds = layerRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return {
      x: clamp(((event.clientX - bounds.left) / bounds.width) * 100, 0, 100),
      y: clamp(((event.clientY - bounds.top) / bounds.height) * 100, 0, 100),
    };
  };

  const beginDrawing = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!editable || (tool !== "draw" && tool !== "highlight")) {
      if (event.target === event.currentTarget) onSelect?.(null);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const first = pointFromEvent(event);
    drawingRef.current = [first];
    setLiveDrawing([first]);
  };

  const continueDrawing = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drawingRef.current) return;
    const next = [...drawingRef.current, pointFromEvent(event)];
    drawingRef.current = next;
    setLiveDrawing(next);
  };

  const finishDrawing = () => {
    const points = drawingRef.current;
    drawingRef.current = null;
    setLiveDrawing([]);
    if (!points || points.length < 2 || !onChange) return;
    const element: CanvasElement = {
      id: `canvas-${crypto.randomUUID()}`,
      type: "drawing",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      points,
      strokeColor: tool === "highlight" ? `${strokeColor}70` : strokeColor,
      strokeWidth: tool === "highlight" ? 2.2 : 0.45,
    };
    onChange([...elements, element]);
    onSelect?.(null);
  };

  const beginTransform = (
    event: React.PointerEvent,
    element: CanvasElement,
    kind: "move" | "resize",
  ) => {
    if (!editable || tool !== "select") return;
    event.preventDefault();
    event.stopPropagation();
    onSelect?.(element.id);
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const bounds = layerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const move = (moveEvent: PointerEvent) => {
      const dx = ((moveEvent.clientX - startX) / bounds.width) * 100;
      const dy = ((moveEvent.clientY - startY) / bounds.height) * 100;
      if (kind === "move") {
        update(element.id, {
          x: clamp(element.x + dx, 0, 100 - element.width),
          y: clamp(element.y + dy, 0, 100 - element.height),
        });
      } else {
        update(element.id, {
          width: clamp(element.width + dx, 2, 100 - element.x),
          height: clamp(element.height + dy, 2, 100 - element.y),
        });
      }
    };
    const end = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
  };

  return (
    <div
      ref={layerRef}
      className={`freeform-layer ${editable ? "is-editing" : ""} tool-${tool}`}
      onPointerDown={beginDrawing}
      onPointerMove={continueDrawing}
      onPointerUp={finishDrawing}
      onPointerCancel={finishDrawing}
    >
      {elements.map((element) => (
        <div
          key={element.id}
          className={`freeform-item type-${element.type} ${selectedId === element.id ? "is-selected" : ""}`}
          style={{
            left: `${element.x}%`,
            top: `${element.y}%`,
            width: `${element.width}%`,
            height: `${element.height}%`,
          }}
          onPointerDownCapture={() => editable && onSelect?.(element.id)}
          onPointerDown={(event) => beginTransform(event, element, "move")}
        >
          <ElementContent
            element={element}
            editable={editable}
            onUpdate={(patch) => update(element.id, patch)}
          />
          {editable && selectedId === element.id && tool === "select" && (
            <>
              <button
                type="button"
                className="freeform-move"
                aria-label="Move item"
                title="Drag to move"
                onPointerDown={(event) =>
                  beginTransform(event, element, "move")
                }
              >
                <GripVertical />
              </button>
              <button
                type="button"
                className="freeform-delete"
                title="Delete item"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() =>
                  onChange?.(elements.filter((item) => item.id !== element.id))
                }
              >
                <Trash2 />
              </button>
              <button
                type="button"
                className="freeform-resize"
                aria-label="Resize item"
                onPointerDown={(event) =>
                  beginTransform(event, element, "resize")
                }
              />
            </>
          )}
        </div>
      ))}
      {liveDrawing.length > 1 && (
        <svg
          className="freeform-live-drawing"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <polyline
            points={liveDrawing
              .map((point) => `${point.x},${point.y}`)
              .join(" ")}
            fill="none"
            stroke={strokeColor}
            strokeWidth={tool === "highlight" ? 2.2 : 0.45}
            opacity={tool === "highlight" ? 0.45 : 1}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
}

function ElementContent({
  element,
  editable,
  onUpdate,
}: {
  element: CanvasElement;
  editable: boolean;
  onUpdate: (patch: Partial<CanvasElement>) => void;
}) {
  if (element.type === "drawing") {
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline
          points={(element.points ?? [])
            .map((point) => `${point.x},${point.y}`)
            .join(" ")}
          fill="none"
          stroke={element.strokeColor ?? "#d53b36"}
          strokeWidth={element.strokeWidth ?? 0.45}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (element.type === "image")
    return (
      <img
        src={element.dataUrl}
        alt={element.content || "Freeform card image"}
      />
    );
  if (element.type === "line")
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <line
          x1="1"
          y1="50"
          x2="99"
          y2="50"
          stroke={element.strokeColor ?? "#26384e"}
          strokeWidth={element.strokeWidth ?? 2}
        />
      </svg>
    );
  if (element.type === "rectangle" || element.type === "ellipse")
    return (
      <div
        className="freeform-shape"
        style={{
          background: element.backgroundColor ?? "transparent",
          borderColor: element.strokeColor ?? "#d53b36",
          borderWidth: element.strokeWidth ?? 2,
          borderRadius: element.type === "ellipse" ? "50%" : ".4rem",
        }}
      />
    );
  const style = {
    background:
      element.type === "note"
        ? (element.backgroundColor ?? "#fff3a8")
        : element.backgroundColor,
    color: element.textColor ?? "#26384e",
  };
  return editable ? (
    <textarea
      value={element.content ?? ""}
      onPointerDown={(event) => event.stopPropagation()}
      onChange={(event) => onUpdate({ content: event.target.value })}
      style={style}
      aria-label={element.type === "note" ? "Sticky note" : "Free text"}
    />
  ) : (
    <div className="freeform-text" style={style}>
      {element.content}
    </div>
  );
}
