"use client";

import { useMemo, useState } from "react";
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

export function OrchestrationGraphCanvas({
  graph,
  selectedNodeId,
  onSelectNode,
  onConnectorAction,
  showRunTest,
  onRunTest,
  runStatus,
  runMessage,
  statusLabel = "Draft",
}) {
  const parsed = useMemo(() => parseOrchestrationGraph(graph) || graph, [graph]);
  const nodes = useMemo(() => orderedGraphNodes(parsed), [parsed]);
  const edges = useMemo(() => (Array.isArray(parsed?.edges) ? parsed.edges : []), [parsed]);
  const [internalSelected, setInternalSelected] = useState(null);
  const [connectorPopover, setConnectorPopover] = useState(null);
  const [zoom, setZoom] = useState(1);
  const activeId = selectedNodeId ?? internalSelected;

  if (!nodes.length) {
    return (
      <div className="dm-orchestration-canvas dm-orchestration-canvas--empty">
        <p>No orchestration nodes configured.</p>
      </div>
    );
  }

  function edgeBetween(fromId, toId) {
    return edges.find((e) => String(e.from) === fromId && String(e.to) === toId);
  }

  return (
    <div className="dm-orchestration-canvas" aria-label="Orchestration graph field editor">
      <span className={`dm-orchestration-canvas__badge is-${String(statusLabel || "draft").toLowerCase()}`}>{statusLabel}</span>
      <div className="dm-orchestration-floating-tools" aria-label="Canvas tools">
        <button type="button" title="Add node" aria-label="Add node" onClick={() => onConnectorAction?.({ action: "add-step", from: String(nodes[nodes.length - 1]?.id || ""), to: "" })}>
          <Plus size={14} />
        </button>
        <button type="button" title="Tidy workflow" aria-label="Tidy workflow">
          <Settings size={14} />
        </button>
        <button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(1.4, Number((value + 0.1).toFixed(2))))}>
          <ZoomIn size={14} />
        </button>
        <button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.7, Number((value - 0.1).toFixed(2))))}>
          <ZoomOut size={14} />
        </button>
        <button type="button" title="Reset zoom" aria-label="Reset zoom" onClick={() => setZoom(1)}>
          <Maximize2 size={14} />
        </button>
      </div>
      <div className="dm-orchestration-canvas__viewport" style={{ transform: `scale(${zoom})` }}>
        {nodes.map((node, index) => {
          const id = String(node.id || "");
          const isSelected = activeId === id;
          const prevId = index > 0 ? String(nodes[index - 1].id || "") : "";
          const Icon = NODE_ICONS[node.type] || ArrowDownToLine;

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
