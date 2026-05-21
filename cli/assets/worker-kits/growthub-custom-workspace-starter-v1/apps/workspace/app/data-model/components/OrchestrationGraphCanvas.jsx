"use client";

import { useMemo, useState } from "react";
import { orderedGraphNodes, parseOrchestrationGraph } from "@/lib/orchestration-graph";

const NODE_TYPE_LABELS = {
  input: "Input",
  "api-registry-call": "API Registry",
  "transform-filter": "Transform",
  "normalize-output": "Transform",
  "tool-result": "Result",
  "sandbox-adapter": "Adapter",
  "custom-webhook": "Webhook"
};

const CONNECTOR_OPTIONS = [
  { id: "filter", label: "Filter response" },
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
    return config.rootPath ? `root: ${config.rootPath}` : "Map fields and apply filters";
  }
  if (node?.type === "input") return "Manual run payload";
  if (node?.type === "tool-result") return "Save run output";
  return "";
}

function hoverHint(node) {
  const type = String(node?.type || "");
  if (type === "input") return "Configure input";
  if (type === "api-registry-call") return "Configure API request";
  if (type === "transform-filter" || type === "normalize-output") return "Map response fields";
  if (type === "tool-result") return "Result settings";
  return "Configure node";
}

export function OrchestrationGraphCanvas({
  graph,
  selectedNodeId,
  onSelectNode,
  onConnectorAction,
  showRunTest,
  onRunTest,
  runStatus
}) {
  const parsed = useMemo(() => parseOrchestrationGraph(graph) || graph, [graph]);
  const nodes = useMemo(() => orderedGraphNodes(parsed), [parsed]);
  const edges = useMemo(() => (Array.isArray(parsed?.edges) ? parsed.edges : []), [parsed]);
  const [internalSelected, setInternalSelected] = useState(null);
  const [connectorPopover, setConnectorPopover] = useState(null);
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
      {nodes.map((node, index) => {
        const id = String(node.id || "");
        const isSelected = activeId === id;
        const prevId = index > 0 ? String(nodes[index - 1].id || "") : "";
        const hasEdge = prevId && edgeBetween(prevId, id);

        return (
          <div key={id || index} className="dm-orchestration-canvas__step">
            {index > 0 && (
              <div className="dm-orchestration-connector">
                <div className="dm-orchestration-connector__line" aria-hidden="true" />
                <button
                  type="button"
                  className="dm-orchestration-connector__add"
                  title="Add a step between these nodes"
                  aria-label="Add step"
                  onClick={() => setConnectorPopover(connectorPopover === `${prevId}-${id}` ? null : `${prevId}-${id}`)}
                >
                  +
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
                  </div>
                )}
                {hasEdge && (
                  <span className="dm-orchestration-connector__passes">{edgeBetween(prevId, id)?.passes || ""}</span>
                )}
              </div>
            )}
            <button
              type="button"
              className={`dm-orchestration-node${isSelected ? " dm-orchestration-node--selected" : ""}`}
              title={hoverHint(node)}
              onClick={() => {
                setInternalSelected(id);
                onSelectNode?.(node);
              }}
            >
              <span className="dm-orchestration-node__type">{NODE_TYPE_LABELS[node.type] || node.type}</span>
              <span className="dm-orchestration-node__title">{node.label || id}</span>
              {nodeSubtitle(node) && (
                <span className="dm-orchestration-node__subtitle">{nodeSubtitle(node)}</span>
              )}
            </button>
          </div>
        );
      })}
      {showRunTest && (
        <div className="dm-orchestration-run-status">
          <button type="button" className="dm-btn-primary-sm" onClick={onRunTest}>
            Run test
          </button>
          {runStatus && <span className={`dm-orchestration-run-status__badge is-${runStatus}`}>{runStatus}</span>}
        </div>
      )}
    </div>
  );
}
