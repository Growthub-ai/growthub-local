"use client";

import { useMemo, useState } from "react";
import { orderedGraphNodes, parseOrchestrationGraph } from "@/lib/orchestration-graph";

const NODE_TYPE_LABELS = {
  input: "Input",
  "api-registry-call": "API Registry",
  "sandbox-adapter": "Sandbox Adapter",
  "normalize-output": "Normalize Output",
  "tool-result": "Result",
  "custom-webhook": "Webhook"
};

function nodeSubtitle(node) {
  const config = node?.config || {};
  if (node?.type === "api-registry-call") {
    const id = String(config.registryId || "").trim();
    const endpoint = String(config.endpoint || "").trim();
    return endpoint ? `${id} ${endpoint}` : id;
  }
  if (node?.type === "sandbox-adapter") {
    return `${config.runLocality || "local"} · ${config.adapter || "local-process"}`;
  }
  if (node?.type === "normalize-output") {
    return config.rootPath ? `root: ${config.rootPath}` : "json";
  }
  return "";
}

export function OrchestrationGraphCanvas({ graph, selectedNodeId, onSelectNode }) {
  const parsed = useMemo(() => parseOrchestrationGraph(graph) || graph, [graph]);
  const nodes = useMemo(() => orderedGraphNodes(parsed), [parsed]);
  const [internalSelected, setInternalSelected] = useState(null);
  const activeId = selectedNodeId ?? internalSelected;

  if (!nodes.length) {
    return (
      <div className="dm-orch-canvas dm-orch-canvas-empty">
        <p>No orchestration nodes configured.</p>
      </div>
    );
  }

  return (
    <div className="dm-orch-canvas" aria-label="Orchestration graph preview">
      {nodes.map((node, index) => {
        const id = String(node.id || "");
        const isSelected = activeId === id;
        return (
          <div key={id || index} className="dm-orch-canvas-step">
            {index > 0 && <div className="dm-orch-canvas-arrow" aria-hidden="true" />}
            <button
              type="button"
              className={`dm-orch-node${isSelected ? " is-selected" : ""}`}
              onClick={() => {
                setInternalSelected(id);
                onSelectNode?.(node);
              }}
            >
              <span className="dm-orch-node-type">{NODE_TYPE_LABELS[node.type] || node.type}</span>
              <span className="dm-orch-node-label">{node.label || id}</span>
              {nodeSubtitle(node) && (
                <span className="dm-orch-node-meta">{nodeSubtitle(node)}</span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
