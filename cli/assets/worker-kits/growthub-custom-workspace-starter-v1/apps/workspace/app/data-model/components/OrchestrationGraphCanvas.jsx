"use client";

import { summarizeOrchestrationGraph } from "@/lib/orchestration-graph";

const NODE_ORDER = ["input", "api-registry-call", "sandbox-adapter", "normalize-output", "tool-result"];

function sortNodes(nodes) {
  const list = Array.isArray(nodes) ? [...nodes] : [];
  return list.sort((a, b) => {
    const ai = NODE_ORDER.indexOf(a.type);
    const bi = NODE_ORDER.indexOf(b.type);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
}

export function OrchestrationGraphCanvas({ graph, selectedNodeId, onSelectNode }) {
  const nodes = sortNodes(graph?.nodes);
  const summary = summarizeOrchestrationGraph(graph);

  if (!nodes.length) {
    return (
      <div className="dm-orch-canvas dm-orch-canvas-empty">
        <p>No orchestration nodes configured.</p>
      </div>
    );
  }

  return (
    <div className="dm-orch-canvas" aria-label="Orchestration graph preview">
      <p className="dm-orch-canvas-summary">{summary}</p>
      <div className="dm-orch-canvas-stack">
        {nodes.map((node, index) => (
          <div key={node.id} className="dm-orch-canvas-step">
            {index > 0 && <div className="dm-orch-canvas-arrow" aria-hidden="true">↓</div>}
            <button
              type="button"
              className={`dm-orch-node${selectedNodeId === node.id ? " is-selected" : ""}`}
              onClick={() => onSelectNode?.(node.id)}
              aria-pressed={selectedNodeId === node.id}
            >
              <span className="dm-orch-node-type">{formatNodeType(node.type)}</span>
              <strong>{node.label || node.id}</strong>
              {node.type === "api-registry-call" && node.config?.endpoint && (
                <span className="dm-orch-node-meta">
                  {node.config.method || "GET"} {node.config.endpoint}
                </span>
              )}
              {node.type === "sandbox-adapter" && (
                <span className="dm-orch-node-meta">
                  {node.config?.runLocality || "local"} / {node.config?.adapter || "local-process"}
                </span>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatNodeType(type) {
  const map = {
    input: "Input",
    "api-registry-call": "API Registry",
    "sandbox-adapter": "Sandbox Adapter",
    "normalize-output": "Normalize Output",
    "tool-result": "Tool Result"
  };
  return map[type] || type;
}
