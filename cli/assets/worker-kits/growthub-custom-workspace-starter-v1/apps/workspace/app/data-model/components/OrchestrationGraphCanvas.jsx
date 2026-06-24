"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Bot,
  Filter,
  Globe,
  Maximize2,
  Minus,
  Plus,
  Settings,
  SlidersHorizontal,
  Target,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { orderedGraphNodes, parseOrchestrationGraph } from "@/lib/orchestration-graph";

const NODE_TYPE_LABELS = {
  input: "Input",
  "api-registry-call": "API Registry",
  "transform-filter": "Transform",
  "normalize-output": "Transform",
  "tool-result": "Result",
  thinAdapter: "Agent",
  "data-trigger": "Trigger",
  "data-action": "Action",
  "ai-agent": "AI",
  "flow-control": "Flow",
  "core-action": "Core",
  "human-input": "Input"
};

const NODE_ICONS = {
  input: SlidersHorizontal,
  "api-registry-call": Globe,
  "transform-filter": Filter,
  "normalize-output": Filter,
  "tool-result": Target,
  thinAdapter: Bot,
  "data-trigger": SlidersHorizontal,
  "data-action": Plus,
  "ai-agent": Bot,
  "flow-control": Settings,
  "core-action": Globe,
  "human-input": SlidersHorizontal
};

const CONNECTOR_OPTIONS = [
  { id: "filter", label: "Add filter" },
  { id: "map", label: "Map fields" },
  { id: "preview", label: "Preview output" }
];

const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.4;
const NODE_BLOCK_HEIGHT = 98;
const FIT_VIEW_PADDING = 128;

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))));
}

function nodeSubtitle(node) {
  const config = node?.config || {};
  if (node?.subtitle) return String(node.subtitle);
  if (node?.type === "api-registry-call") {
    const id = String(config.integrationId || config.registryId || "").trim();
    const method = String(config.method || "GET").trim().toUpperCase();
    const endpoint = String(config.endpoint || "").trim();
    return endpoint ? `${id} · ${method} ${endpoint}` : id;
  }
  if (node?.type === "transform-filter" || node?.type === "normalize-output") {
    return "Map fields and filter rows";
  }
  if (node?.type === "input") return "Manual or source payload";
  if (node?.type === "tool-result") return "Save status and response";
  if (node?.type === "thinAdapter") return node?.sandbox ? String(node.sandbox) : "Local agent step";
  return "";
}

function hoverHint(node) {
  const type = String(node?.type || "");
  if (type === "input") return "Configure input";
  if (type === "api-registry-call") return "Configure API request";
  if (type === "transform-filter" || type === "normalize-output") return "Map response fields";
  if (type === "tool-result") return "Result settings";
  if (type === "thinAdapter") return "Configure agent step";
  return "Configure node";
}

function normalizedNodeType(node) {
  const type = String(node?.type || "").trim();
  if (type === "thinAdapter") return "AI Model";
  return type || "node";
}

function nodeRecordName(node) {
  if (node?.type === "thinAdapter") return String(node?.sandbox || node?.id || "").trim();
  if (node?.config?.objectName) return String(node.config.objectName).trim();
  if (node?.config?.objectId) return String(node.config.objectId).trim();
  return "";
}

// Per-node run-status pill (Attio-style), docked outside the node top-right.
// Driven only by the real general-orchestration run signal passed in
// `nodeStatuses` — the streamed orchestration.node.* deltas and the persisted
// nodeTrace (see lib/orchestration-node-status.js). Never fabricated here.
const NODE_STATUS_CHIP = {
  completed: { cls: "is-ok", label: "Completed" },
  ok: { cls: "is-ok", label: "Completed" },
  running: { cls: "is-running", label: "Running" },
  executing: { cls: "is-running", label: "Running" },
  failed: { cls: "is-bad", label: "Failed" },
  skipped: { cls: "is-waiting", label: "Skipped" },
  pending: { cls: "is-waiting", label: "Waiting" },
  queued: { cls: "is-waiting", label: "Waiting" },
};

export function OrchestrationGraphCanvas({
  graph,
  selectedNodeId,
  onSelectNode,
  onConnectorAction,
  showRunTest,
  onRunTest,
  runStatus,
  runMessage,
  nodeStatuses,
  statusLabel = "Draft",
}) {
  const parsed = useMemo(() => parseOrchestrationGraph(graph) || graph, [graph]);
  const nodes = useMemo(() => orderedGraphNodes(parsed), [parsed]);
  const edges = useMemo(() => (Array.isArray(parsed?.edges) ? parsed.edges : []), [parsed]);
  const [internalSelected, setInternalSelected] = useState(null);
  const [connectorPopover, setConnectorPopover] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const activeId = selectedNodeId ?? internalSelected;

  function edgeBetween(fromId, toId) {
    return edges.find((e) => String(e.from) === fromId && String(e.to) === toId);
  }

  const zoomBy = useCallback((delta) => {
    setZoom((value) => clampZoom(value + delta));
  }, []);

  const fitView = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const availableHeight = Math.max(240, (rect?.height || 720) - FIT_VIEW_PADDING);
    const graphHeight = Math.max(NODE_BLOCK_HEIGHT, nodes.length * NODE_BLOCK_HEIGHT);
    const nextZoom = clampZoom(Math.min(1, availableHeight / graphHeight));
    setZoom(nextZoom);
    setPan({ x: 0, y: 0 });
  }, [nodes.length]);

  const handleWheel = useCallback((event) => {
    event.preventDefault();
    const direction = event.deltaY > 0 ? -0.08 : 0.08;
    zoomBy(direction);
  }, [zoomBy]);

  const handlePointerDown = useCallback((event) => {
    if (event.button !== 0) return;
    if (event.target.closest("button, .dm-orchestration-node, .dm-orchestration-connector__popover")) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [pan.x, pan.y]);

  const handlePointerMove = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    setPan({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY
    });
  }, []);

  const endDrag = useCallback((event) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }, []);

  if (!nodes.length) {
    return (
      <div className="dm-orchestration-canvas dm-orchestration-canvas--empty">
        <p>No orchestration nodes configured.</p>
      </div>
    );
  }

  return (
    <div
      ref={canvasRef}
      className="dm-orchestration-canvas"
      aria-label="Orchestration graph field editor"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={endDrag}
    >
      <span className={`dm-orchestration-canvas__badge is-${String(statusLabel || "draft").toLowerCase()}`}>{statusLabel}</span>
      <div className="dm-orchestration-floating-tools" aria-label="Canvas tools">
        <button type="button" title="Add node" aria-label="Add node" onClick={() => onConnectorAction?.({ action: "add-step", from: String(nodes[nodes.length - 1]?.id || ""), to: "" })}>
          <Plus size={14} />
        </button>
        <button type="button" title="Tidy workflow" aria-label="Tidy workflow">
          <Settings size={14} />
        </button>
        <button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => zoomBy(0.1)}>
          <ZoomIn size={14} />
        </button>
        <button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => zoomBy(-0.1)}>
          <ZoomOut size={14} />
        </button>
        <button type="button" title="Fit view" aria-label="Fit view" onClick={fitView}>
          <Maximize2 size={14} />
        </button>
      </div>
      <div
        className="dm-orchestration-canvas__viewport"
        style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }}
      >
        {nodes.map((node, index) => {
          const id = String(node.id || "");
          const isSelected = activeId === id;
          const prevId = index > 0 ? String(nodes[index - 1].id || "") : "";
          const Icon = NODE_ICONS[node.type] || ArrowDownToLine;
          const nodeStatusChip = nodeStatuses
            ? NODE_STATUS_CHIP[String(nodeStatuses[id] || "").toLowerCase()] || null
            : null;

          return (
            <div key={id || index} className="dm-orchestration-canvas__step">
              {index > 0 && (
                <div className="dm-orchestration-connector">
                  <div className="dm-orchestration-connector__line" aria-hidden="true" />
                  <button
                    type="button"
                    className="dm-orchestration-connector__add"
                    aria-label="Add step"
                    onClick={() => {
                      onConnectorAction?.({ action: "add-step", from: prevId, to: id });
                      setConnectorPopover(null);
                    }}
                  >
                    <Plus size={14} />
                  </button>
                  {connectorPopover === `${prevId}-${id}` && (
                    <div className="dm-orchestration-connector__popover" role="menu">
                      <p>Add a step between these nodes</p>
                      {CONNECTOR_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            onConnectorAction?.({ from: prevId, to: id, action: opt.id });
                            setConnectorPopover(null);
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onConnectorAction?.({ action: "delete-edge-request", from: prevId, to: id });
                          setConnectorPopover(null);
                        }}
                      >
                        <Minus size={12} /> Delete edge
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div
                role="button"
                tabIndex={0}
                className={`dm-orchestration-node${isSelected ? " dm-orchestration-node--selected" : ""}`}
                title={hoverHint(node)}
                onClick={() => {
                  setInternalSelected(id);
                  onSelectNode?.(node);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  setInternalSelected(id);
                  onSelectNode?.(node);
                }}
              >
                {nodeStatusChip && (
                  <span className={`dm-status-chip ${nodeStatusChip.cls} dm-orchestration-node__status`}>
                    <span className="dm-status-dot" aria-hidden="true" />
                    {nodeStatusChip.label}
                  </span>
                )}
                <span className="dm-orchestration-node__icon" aria-hidden="true">
                  <Icon size={14} />
                </span>
                <span className="dm-orchestration-node__type">{NODE_TYPE_LABELS[node.type] || node.type}</span>
                <span className="dm-orchestration-node__title">{normalizedNodeType(node)}</span>
                <span className="dm-orchestration-node__gear" aria-hidden="true">
                  <Settings size={13} />
                </span>
                <span className="dm-orchestration-node__subtitle">{nodeSubtitle(node)}</span>
              </div>
            </div>
          );
        })}
      </div>
      {showRunTest && (
        <div className="dm-orchestration-run-status">
          <button type="button" className="dm-btn-primary-sm" onClick={onRunTest}>
            Run sandbox
          </button>
          {runStatus && <span className={`dm-orchestration-run-status__badge is-${runStatus}`}>{runStatus}</span>}
          {runMessage && <p className="dm-orchestration-run-status__message">{runMessage}</p>}
        </div>
      )}
    </div>
  );
}
