"use client";

import { useMemo, useState } from "react";
import { parseOrchestrationGraph, summarizeOrchestrationGraph } from "@/lib/orchestration-graph";

const FALLBACK_ORDER = ["input", "api-registry-call", "sandbox-adapter", "normalize-output", "tool-result"];

function orderedNodes(graph) {
  const parsed = parseOrchestrationGraph(graph);
  if (!parsed) return [];
  const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
  const edges = Array.isArray(parsed.edges) ? parsed.edges : [];
  const byId = new Map(nodes.map((node) => [String(node.id), node]));
  const incoming = new Map(nodes.map((node) => [String(node.id), 0]));
  edges.forEach((edge) => {
    const to = String(edge?.to || "").trim();
    if (to && incoming.has(to)) incoming.set(to, (incoming.get(to) || 0) + 1);
  });
  const roots = nodes.filter((node) => !incoming.get(String(node.id)));
  const ordered = [];
  const seen = new Set();
  const walk = (node) => {
    const id = String(node?.id || "");
    if (!id || seen.has(id)) return;
    seen.add(id);
    ordered.push(node);
    edges
      .filter((edge) => String(edge?.from) === id)
      .forEach((edge) => {
        const next = byId.get(String(edge?.to || ""));
        if (next) walk(next);
      });
  };
  (roots.length ? roots : nodes).forEach(walk);
  nodes.forEach((node) => {
    if (!seen.has(String(node.id))) ordered.push(node);
  });
  if (!ordered.length) return nodes;
  return ordered.sort((a, b) => {
    const ai = FALLBACK_ORDER.indexOf(a.type);
    const bi = FALLBACK_ORDER.indexOf(b.type);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

function nodeSubtitle(node) {
  if (!node || typeof node !== "object") return "";
  const config = node.config && typeof node.config === "object" ? node.config : {};
  if (node.type === "api-registry-call") {
    const parts = [config.registryId, config.endpoint].filter(Boolean);
    return parts.join(" · ") || "API Registry";
  }
  if (node.type === "sandbox-adapter") {
    return [config.runLocality, config.adapter].filter(Boolean).join(" / ") || "Adapter";
  }
  if (node.type === "normalize-output") {
    return config.rootPath ? `root: ${config.rootPath}` : "json";
  }
  if (node.type === "tool-result") {
    return config.writeLastResponse ? "writes lastResponse" : "Result";
  }
  return node.type || "";
}

export function OrchestrationGraphCanvas({ graph, selectedNodeId, onSelectNode }) {
  const nodes = useMemo(() => orderedNodes(graph), [graph]);
  const summary = useMemo(() => summarizeOrchestrationGraph(graph), [graph]);
  const [activeId, setActiveId] = useState(selectedNodeId || null);

  function selectNode(node) {
    const id = String(node?.id || "");
    setActiveId(id);
    if (typeof onSelectNode === "function") onSelectNode(node);
  }

  return (
    <div className="dm-orch-canvas" data-testid="orchestration-graph-canvas">
      <header className="dm-orch-canvas-head">
        <p>Run plan</p>
        <span>{summary}</span>
      </header>
      <div className="dm-orch-canvas-track" role="list" aria-label="Orchestration steps">
        {nodes.map((node, index) => {
          const id = String(node.id || "");
          const active = (selectedNodeId || activeId) === id;
          return (
            <div key={id || index} className="dm-orch-canvas-step" role="listitem">
              <button
                type="button"
                className={`dm-orch-node${active ? " is-active" : ""}`}
                onClick={() => selectNode(node)}
                aria-pressed={active}
              >
                <span className="dm-orch-node-type">{node.label || node.type}</span>
                <span className="dm-orch-node-sub">{nodeSubtitle(node)}</span>
              </button>
              {index < nodes.length - 1 && <div className="dm-orch-connector" aria-hidden="true" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
