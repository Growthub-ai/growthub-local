"use client";

import { useMemo } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { HOST_AUTH_CATALOG } from "@/lib/sandbox-agent-host-catalog";

function getHostOptions() {
  return Object.entries(HOST_AUTH_CATALOG || {}).map(([slug, host]) => ({
    value: slug,
    label: host?.label || slug
  }));
}

function nodeSandboxRecordRef(objectId, rowName, nodeId) {
  return {
    objectId: String(objectId || "").trim(),
    rowName: String(rowName || "").trim(),
    nodeId: String(nodeId || "").trim()
  };
}

function withRecordRef(patch, objectId, rowName, nodeId) {
  return {
    ...patch,
    sandboxRecordRef: nodeSandboxRecordRef(objectId, rowName, nodeId)
  };
}

function WorkflowCheckbox({ checked, disabled, onChange, children, title }) {
  return (
    <label className="dm-orchestration-config__field dm-orchestration-config__field-inline dm-workflow-check" title={title}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked)}
      />
      <span className="dm-workflow-check__box" aria-hidden="true">
        {checked ? <Check size={13} strokeWidth={2.4} /> : null}
      </span>
      <span>{children}</span>
    </label>
  );
}

function patchOrchestrator(graph, patch, objectId, rowName) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  return {
    ...graph,
    nodes: nodes.map((node) =>
      node?.type === "thinAdapter"
        ? { ...node, config: { ...(node.config || {}), ...withRecordRef(patch, objectId, rowName, node.id) } }
        : node
    )
  };
}

function patchSynthesis(graph, patch, objectId, rowName) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  return {
    ...graph,
    nodes: nodes.map((node) =>
      node?.type === "tool-result"
        ? { ...node, config: { ...(node.config || {}), ...withRecordRef(patch, objectId, rowName, node.id) } }
        : node
    )
  };
}

function patchSubagent(graph, nodeId, patch, objectId, rowName) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  return {
    ...graph,
    nodes: nodes.map((node) =>
      node?.type === "ai-agent" && String(node.id) === String(nodeId)
        ? {
            ...node,
            label: patch.role != null ? String(patch.role) : node.label,
            config: { ...(node.config || {}), ...withRecordRef(patch, objectId, rowName, node.id) }
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
      description: defaults.description || "",
      taskPrompt: defaults.taskPrompt || "",
      tools: Array.isArray(defaults.tools) ? defaults.tools : [],
      agentHost: defaults.agentHost || "",
      required: true,
      canReadWorkspace: true,
      canWriteDraft: false,
      networkAccess: false,
      maxTokens: 0,
      timeoutMs: 0
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

export function AgentSwarmPanel({ graph, objectId, rowName, onGraphChange, disabled }) {
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
    <div className="dm-orchestration-config dm-agent-swarm-panel">
      <div className="dm-orchestration-config__pane">
        <div className="dm-orchestration-config__section">
          <span>Orchestrator</span>
          <label className="dm-orchestration-config__field">
            <span>Prompt</span>
            <textarea
              rows={3}
              value={orchestrator?.config?.prompt || ""}
              disabled={disabled || !orchestrator}
              onChange={(e) => patchGraph((g) => patchOrchestrator(g, { prompt: e.target.value }, objectId, rowName))}
            />
          </label>
        </div>

        <div className="dm-orchestration-config__section">
          <div className="dm-agent-swarm-panel__row">
            <span>Subagents · {subagents.length}</span>
            <button
              type="button"
              className="dm-btn-outline"
              disabled={disabled}
              onClick={() => patchGraph((g) => addSubagent(g))}
            >
              <Plus size={12} aria-hidden="true" /> Add
            </button>
          </div>
          {subagents.length === 0 && (
            <p className="dm-orchestration-config__hint">Add at least one subagent.</p>
          )}
          {subagents.map((node) => {
            const cfg = node.config || {};
            return (
              <div key={node.id} className="dm-agent-swarm-panel__subagent">
                <div className="dm-agent-swarm-panel__row">
                  <input
                    className="dm-agent-swarm-panel__role"
                    placeholder="Role"
                    value={cfg.role || node.label || ""}
                    disabled={disabled}
                    onChange={(e) => patchGraph((g) => patchSubagent(g, node.id, { role: e.target.value }, objectId, rowName))}
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
                  <span>Description</span>
                  <input
                    placeholder="One-sentence charter"
                    value={cfg.description || ""}
                    disabled={disabled}
                    onChange={(e) => patchGraph((g) => patchSubagent(g, node.id, { description: e.target.value }, objectId, rowName))}
                  />
                </label>
                <label className="dm-orchestration-config__field">
                  <span>Task</span>
                  <textarea
                    rows={2}
                    value={cfg.taskPrompt || ""}
                    disabled={disabled}
                    onChange={(e) => patchGraph((g) => patchSubagent(g, node.id, { taskPrompt: e.target.value }, objectId, rowName))}
                  />
                </label>
                <label className="dm-orchestration-config__field">
                  <span>Tools</span>
                  <input
                    placeholder="read, summarize"
                    value={Array.isArray(cfg.tools) ? cfg.tools.join(", ") : ""}
                    disabled={disabled}
                    onChange={(e) => patchGraph((g) => patchSubagent(g, node.id, {
                      tools: e.target.value.split(",").map((t) => t.trim()).filter(Boolean)
                    }, objectId, rowName))}
                  />
                </label>
                <label className="dm-orchestration-config__field">
                  <span>Max tokens</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="0 = inherit"
                    value={cfg.maxTokens || 0}
                    disabled={disabled}
                    onChange={(e) => patchGraph((g) => patchSubagent(g, node.id, { maxTokens: Math.max(0, Number(e.target.value) || 0) }, objectId, rowName))}
                  />
                </label>
                <label className="dm-orchestration-config__field">
                  <span>Agent host</span>
                  <select
                    value={cfg.agentHost || ""}
                    disabled={disabled}
                    onChange={(e) => patchGraph((g) => patchSubagent(g, node.id, { agentHost: e.target.value }, objectId, rowName))}
                  >
                    <option value="">Inherit</option>
                    {hostOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </label>
                <WorkflowCheckbox
                  checked={cfg.required !== false}
                  disabled={disabled}
                  onChange={(checked) => patchGraph((g) => patchSubagent(g, node.id, { required: checked }, objectId, rowName))}
                >
                  Required
                </WorkflowCheckbox>
                <WorkflowCheckbox
                  checked={cfg.networkAccess === true}
                  disabled={disabled}
                  title="Network is granted only when both this and the row's networkAllow are on."
                  onChange={(checked) => patchGraph((g) => patchSubagent(g, node.id, { networkAccess: checked }, objectId, rowName))}
                >
                  Network
                </WorkflowCheckbox>
              </div>
            );
          })}
        </div>

        <div className="dm-orchestration-config__section">
          <span>Concurrency & reward</span>
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
          <p className="dm-orchestration-config__hint">
            Outcome is parsed from the synthesizer's last <code>OUTCOME_SCORE: 0–1</code>; otherwise falls back to required-completion.
          </p>
        </div>

        {synthesis && (
          <div className="dm-orchestration-config__section">
            <span>Synthesizer</span>
            <label className="dm-orchestration-config__field">
              <span>Prompt</span>
              <textarea
                rows={2}
                value={synthesis?.config?.outcomePrompt || ""}
                disabled={disabled}
                onChange={(e) => patchGraph((g) => patchSynthesis(g, { outcomePrompt: e.target.value }, objectId, rowName))}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
