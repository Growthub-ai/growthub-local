"use client";

import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { HOST_AUTH_CATALOG } from "@/lib/sandbox-agent-host-catalog";

function getHostOptions() {
  return Object.entries(HOST_AUTH_CATALOG || {}).map(([slug, host]) => ({
    value: slug,
    label: host?.label || slug
  }));
}

function patchOrchestrator(graph, patch) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  return {
    ...graph,
    nodes: nodes.map((node) =>
      node?.type === "thinAdapter"
        ? { ...node, config: { ...(node.config || {}), ...patch } }
        : node
    )
  };
}

function patchSynthesis(graph, patch) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  return {
    ...graph,
    nodes: nodes.map((node) =>
      node?.type === "tool-result"
        ? { ...node, config: { ...(node.config || {}), ...patch } }
        : node
    )
  };
}

function patchSubagent(graph, nodeId, patch) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  return {
    ...graph,
    nodes: nodes.map((node) =>
      node?.type === "ai-agent" && String(node.id) === String(nodeId)
        ? {
            ...node,
            label: patch.role != null ? String(patch.role) : node.label,
            config: { ...(node.config || {}), ...patch }
          }
        : node
    )
  };
}

function addSubagent(graph, defaults = {}) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const existing = new Set(nodes.map((n) => String(n?.id || "")));
  let id = `subagent-${nodes.filter((n) => n?.type === "ai-agent").length + 1}`;
  let index = 2;
  while (existing.has(id)) {
    id = `subagent-${index}`;
    index += 1;
  }
  const node = {
    id,
    type: "ai-agent",
    label: defaults.role || "Subagent",
    subtitle: "Swarm subagent",
    config: {
      role: defaults.role || "Subagent",
      taskPrompt: defaults.taskPrompt || "",
      agentHost: defaults.agentHost || "",
      required: true,
      canReadWorkspace: true,
      canWriteDraft: false,
      networkAccess: false
    }
  };
  const nextEdges = [...edges];
  if (nodes.some((n) => n?.type === "thinAdapter")) {
    nextEdges.push({ from: "orchestrator", to: id, passes: "subtask-assignment" });
  }
  if (nodes.some((n) => n?.type === "tool-result")) {
    const synth = nodes.find((n) => n?.type === "tool-result");
    nextEdges.push({ from: id, to: synth.id, passes: "subtask-result" });
  }
  return { ...graph, nodes: [...nodes, node], edges: nextEdges };
}

function removeSubagent(graph, nodeId) {
  const id = String(nodeId);
  return {
    ...graph,
    nodes: (Array.isArray(graph?.nodes) ? graph.nodes : []).filter((n) => String(n.id) !== id),
    edges: (Array.isArray(graph?.edges) ? graph.edges : []).filter(
      (edge) => String(edge.from) !== id && String(edge.to) !== id
    )
  };
}

function patchSwarmConfig(graph, patch) {
  const base = graph?.swarm && typeof graph.swarm === "object" ? graph.swarm : {};
  return { ...graph, swarm: { ...base, ...patch } };
}

export function AgentSwarmPanel({ graph, onGraphChange, disabled }) {
  const hostOptions = useMemo(getHostOptions, []);
  if (!graph || typeof graph !== "object") return null;

  const orchestrator = (Array.isArray(graph.nodes) ? graph.nodes : []).find((n) => n?.type === "thinAdapter") || null;
  const subagents = (Array.isArray(graph.nodes) ? graph.nodes : []).filter((n) => n?.type === "ai-agent");
  const synthesis = (Array.isArray(graph.nodes) ? graph.nodes : []).find((n) => n?.type === "tool-result") || null;
  const swarmCfg = graph.swarm && typeof graph.swarm === "object" ? graph.swarm : {};
  const weights = swarmCfg.rewardWeights || { parallel: 0.25, finish: 0.35, outcome: 0.4 };

  function patchGraph(updater) {
    if (typeof updater !== "function") return;
    onGraphChange?.(updater);
  }

  return (
    <div className="dm-agent-swarm-panel">
      <section className="dm-agent-swarm-panel__section">
        <h4>Orchestrator</h4>
        <label className="dm-orchestration-config__field">
          <span>Orchestrator prompt</span>
          <textarea
            rows={3}
            value={orchestrator?.config?.prompt || ""}
            disabled={disabled || !orchestrator}
            onChange={(e) => patchGraph((g) => patchOrchestrator(g, { prompt: e.target.value }))}
          />
        </label>
      </section>

      <section className="dm-agent-swarm-panel__section">
        <div className="dm-agent-swarm-panel__section-head">
          <h4>Subagents ({subagents.length})</h4>
          <button
            type="button"
            className="dm-btn-outline"
            disabled={disabled}
            onClick={() => patchGraph((g) => addSubagent(g))}
          >
            <Plus size={12} aria-hidden="true" /> Add subagent
          </button>
        </div>
        {subagents.length === 0 && (
          <p className="dm-orchestration-config__hint">No subagents yet. Add at least one for the swarm to do work.</p>
        )}
        {subagents.map((node) => {
          const cfg = node.config || {};
          return (
            <div key={node.id} className="dm-agent-swarm-panel__subagent">
              <div className="dm-agent-swarm-panel__subagent-head">
                <input
                  className="dm-agent-swarm-panel__role"
                  placeholder="Role"
                  value={cfg.role || node.label || ""}
                  disabled={disabled}
                  onChange={(e) => patchGraph((g) => patchSubagent(g, node.id, { role: e.target.value }))}
                />
                <button
                  type="button"
                  className="dm-btn-ghost"
                  disabled={disabled}
                  onClick={() => patchGraph((g) => removeSubagent(g, node.id))}
                  aria-label={`Remove ${cfg.role || node.id}`}
                >
                  <Trash2 size={12} aria-hidden="true" />
                </button>
              </div>
              <label className="dm-orchestration-config__field">
                <span>Task prompt</span>
                <textarea
                  rows={2}
                  value={cfg.taskPrompt || ""}
                  disabled={disabled}
                  onChange={(e) => patchGraph((g) => patchSubagent(g, node.id, { taskPrompt: e.target.value }))}
                />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Agent host (override)</span>
                <select
                  value={cfg.agentHost || ""}
                  disabled={disabled}
                  onChange={(e) => patchGraph((g) => patchSubagent(g, node.id, { agentHost: e.target.value }))}
                >
                  <option value="">Inherit row agent host</option>
                  {hostOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
              <label className="dm-orchestration-config__field dm-orchestration-config__field-inline">
                <input
                  type="checkbox"
                  checked={cfg.required !== false}
                  disabled={disabled}
                  onChange={(e) => patchGraph((g) => patchSubagent(g, node.id, { required: e.target.checked }))}
                />
                <span>Required for swarm success</span>
              </label>
              <label className="dm-orchestration-config__field dm-orchestration-config__field-inline">
                <input
                  type="checkbox"
                  checked={cfg.networkAccess === true}
                  disabled={disabled}
                  onChange={(e) => patchGraph((g) => patchSubagent(g, node.id, { networkAccess: e.target.checked }))}
                />
                <span>Allow network access</span>
              </label>
            </div>
          );
        })}
      </section>

      <section className="dm-agent-swarm-panel__section">
        <h4>Concurrency & reward</h4>
        <label className="dm-orchestration-config__field">
          <span>Max concurrency</span>
          <input
            type="number"
            min="1"
            value={swarmCfg.maxConcurrency ?? subagents.length}
            disabled={disabled}
            onChange={(e) => patchGraph((g) => patchSwarmConfig(g, { maxConcurrency: Math.max(1, Number(e.target.value) || 1) }))}
          />
        </label>
        <div className="dm-agent-swarm-panel__weights">
          {[
            ["parallel", "Parallel"],
            ["finish", "Finish"],
            ["outcome", "Outcome"]
          ].map(([key, label]) => (
            <label key={key} className="dm-orchestration-config__field">
              <span>{label}</span>
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={weights[key] ?? 0}
                disabled={disabled}
                onChange={(e) =>
                  patchGraph((g) =>
                    patchSwarmConfig(g, {
                      rewardWeights: { ...weights, [key]: Number(e.target.value) || 0 }
                    })
                  )
                }
              />
            </label>
          ))}
        </div>
        <label className="dm-orchestration-config__field">
          <span>Outcome criteria</span>
          <textarea
            rows={2}
            value={swarmCfg.outcomeCriteria || ""}
            disabled={disabled}
            onChange={(e) => patchGraph((g) => patchSwarmConfig(g, { outcomeCriteria: e.target.value }))}
          />
        </label>
      </section>

      {synthesis && (
        <section className="dm-agent-swarm-panel__section">
          <h4>Final synthesis</h4>
          <label className="dm-orchestration-config__field">
            <span>Synthesis prompt</span>
            <textarea
              rows={2}
              value={synthesis?.config?.outcomePrompt || ""}
              disabled={disabled}
              onChange={(e) => patchGraph((g) => patchSynthesis(g, { outcomePrompt: e.target.value }))}
            />
          </label>
        </section>
      )}
    </div>
  );
}
