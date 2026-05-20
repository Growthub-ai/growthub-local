"use client";

import { useMemo, useState } from "react";
import { summarizeOrchestrationGraph } from "@/lib/orchestration-graph";

const NODE_ORDER = ["input", "api-registry-call", "sandbox-adapter", "normalize-output", "tool-result"];

function orderedNodes(graph) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const byType = new Map(nodes.map((n) => [n.type, n]));
  const ordered = NODE_ORDER.map((type) => byType.get(type)).filter(Boolean);
  const rest = nodes.filter((n) => !NODE_ORDER.includes(n.type));
  return [...ordered, ...rest];
}

export function OrchestrationGraphCanvas({ graph, selectedNodeId, onSelectNode }) {
  const nodes = useMemo(() => orderedNodes(graph), [graph]);
  const [activeId, setActiveId] = useState(selectedNodeId || nodes[0]?.id || null);

  function selectNode(node) {
    setActiveId(node.id);
    onSelectNode?.(node);
  }

  return (
    <div className="dm-orch-canvas" aria-label="Orchestration graph preview">
      <p className="dm-orch-canvas-summary">{summarizeOrchestrationGraph(graph)}</p>
      <div className="dm-orch-canvas-stack">
        {nodes.map((node, index) => (
          <div key={node.id} className="dm-orch-canvas-step">
            <button
              type="button"
              className={`dm-orch-node${activeId === node.id ? " is-selected" : ""}`}
              onClick={() => selectNode(node)}
              aria-pressed={activeId === node.id}
            >
              <span className="dm-orch-node-type">{node.type}</span>
              <span className="dm-orch-node-label">{node.label || node.id}</span>
              {node.type === "api-registry-call" && node.config?.endpoint && (
                <span className="dm-orch-node-meta">
                  {node.config.registryId} {node.config.method} {node.config.endpoint}
                </span>
              )}
              {node.type === "sandbox-adapter" && (
                <span className="dm-orch-node-meta">
                  {node.config?.runLocality || "local"} · {node.config?.adapter || "local-process"}
                </span>
              )}
            </button>
            {index < nodes.length - 1 && <div className="dm-orch-canvas-arrow" aria-hidden="true">↓</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
