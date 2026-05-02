"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import WidgetRenderer from "./widgets/WidgetRenderer";

const ROW_COUNT = 16;
const MIN_W = 2;
const MIN_H = 2;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function WorkspaceGrid({ canvas, widgets, onMove, onResize, onAddWidgetClick, onRemoveWidget, onSelectWidget, selectedWidgetId }) {
  const columns = canvas.layout?.columns || 12;
  const gridRef = useRef(null);
  const [drag, setDrag] = useState(null);

  const computeMetrics = useCallback(() => {
    const node = gridRef.current;
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    const cellWidth = rect.width / columns;
    const cellHeight = rect.height / ROW_COUNT;
    return { rect, cellWidth, cellHeight };
  }, [columns]);

  useEffect(() => {
    if (!drag) return undefined;
    function handleMove(event) {
      const metrics = computeMetrics();
      if (!metrics) return;
      const { rect, cellWidth, cellHeight } = metrics;
      const widget = widgets.find((item) => item.id === drag.widgetId);
      if (!widget) return;
      const dxCells = Math.round((event.clientX - drag.startX) / cellWidth);
      const dyCells = Math.round((event.clientY - drag.startY) / cellHeight);
      if (drag.mode === "move") {
        const x = clamp(drag.startPos.x + dxCells, 0, columns - widget.position.w);
        const y = clamp(drag.startPos.y + dyCells, 0, ROW_COUNT - widget.position.h);
        if (x !== widget.position.x || y !== widget.position.y) {
          onMove(widget.id, { x, y });
        }
      } else if (drag.mode === "resize") {
        const w = clamp(drag.startPos.w + dxCells, MIN_W, columns - widget.position.x);
        const h = clamp(drag.startPos.h + dyCells, MIN_H, ROW_COUNT - widget.position.y);
        if (w !== widget.position.w || h !== widget.position.h) {
          onResize(widget.id, { w, h });
        }
      }
    }
    function handleUp() {
      setDrag(null);
    }
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [drag, widgets, columns, onMove, onResize, computeMetrics]);

  function startDrag(event, widget, mode) {
    event.stopPropagation();
    event.preventDefault();
    setDrag({
      widgetId: widget.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startPos: { ...widget.position }
    });
    onSelectWidget?.(widget.id);
  }

  return (
    <div
      ref={gridRef}
      className="workspace-grid"
      style={{ "--workspace-columns": columns, "--workspace-rows": ROW_COUNT }}
    >
      {widgets.length === 0 ? (
        <button className="workspace-add-widget" type="button" onClick={onAddWidgetClick}>
          <span className="workspace-widget-icon" aria-hidden="true"><span /></span>
          <strong>Add widget</strong>
          <small>Click to add your first widget</small>
        </button>
      ) : null}
      {Array.from({ length: columns * ROW_COUNT }).map((_, index) => (
        <span aria-hidden="true" className="workspace-grid-cell" key={index} />
      ))}
      {widgets.map((widget) => (
        <article
          className={`workspace-widget-preview${selectedWidgetId === widget.id ? " selected" : ""}`}
          key={widget.id}
          style={{
            gridColumn: `${widget.position.x + 1} / span ${widget.position.w}`,
            gridRow: `${widget.position.y + 1} / span ${widget.position.h}`
          }}
          onPointerDown={(event) => {
            if (event.target.closest(".workspace-widget-handle, .workspace-widget-remove")) return;
            startDrag(event, widget, "move");
          }}
        >
          <div className="workspace-widget-toolbar">
            <span className="workspace-widget-grip" aria-hidden="true">⠿</span>
            <button
              type="button"
              className="workspace-widget-remove"
              aria-label="Remove widget"
              onClick={(event) => {
                event.stopPropagation();
                onRemoveWidget(widget.id);
              }}
            >
              ×
            </button>
          </div>
          <div className="workspace-widget-body">
            <WidgetRenderer widget={widget} />
          </div>
          <span
            className="workspace-widget-handle"
            aria-label="Resize widget"
            role="button"
            onPointerDown={(event) => startDrag(event, widget, "resize")}
          />
        </article>
      ))}
    </div>
  );
}

export default WorkspaceGrid;
