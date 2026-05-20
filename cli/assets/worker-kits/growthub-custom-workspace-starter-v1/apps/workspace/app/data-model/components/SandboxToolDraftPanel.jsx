"use client";

import { useMemo } from "react";
import { OrchestrationGraphCanvas } from "./OrchestrationGraphCanvas.jsx";
import { SegmentedToggle } from "./ToggleField.jsx";
import { parseOrchestrationGraph } from "@/lib/orchestration-graph";

export function SandboxToolDraftPanel({
  registryRow,
  draft,
  onDraftChange,
  onGraphChange,
  selectedNodeId,
  onSelectNode,
  savedEnvRefs = [],
  disabled
}) {
  const graph = useMemo(() => parseOrchestrationGraph(draft.orchestrationGraph) || draft.orchestrationGraph, [draft.orchestrationGraph]);
  const selectedNode = (graph?.nodes || []).find((n) => n.id === selectedNodeId) || null;
  const envSlugs = useMemo(() => {
    const raw = draft.envRefs;
    if (Array.isArray(raw)) return raw;
    return String(raw || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }, [draft.envRefs]);

  function patch(partial) {
    onDraftChange({ ...draft, ...partial });
  }

  function patchNodeConfig(nodeId, configPatch) {
    if (!graph?.nodes) return;
    const nodes = graph.nodes.map((node) =>
      node.id === nodeId ? { ...node, config: { ...(node.config || {}), ...configPatch } } : node
    );
    onGraphChange({ ...graph, nodes });
  }

  function toggleEnvRef(slug) {
    const next = new Set(envSlugs);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    patch({ envRefs: [...next].join(",") });
  }

  const locality = String(draft.runLocality || "local").trim().toLowerCase() === "serverless" ? "serverless" : "local";

  return (
    <div className="dm-sandbox-tool-draft">
      <div className="dm-sandbox-tool-draft-layout">
        <section className="dm-sandbox-tool-draft-canvas-wrap">
          <h3 className="dm-sandbox-tool-section-title">Run plan</h3>
          <OrchestrationGraphCanvas
            graph={graph}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
          />
        </section>

        <section className="dm-sandbox-tool-draft-fields">
          <details className="dm-sandbox-tool-toggle" open>
            <summary>Basic</summary>
            <label className="dm-record-field">
              <span>Tool name</span>
              <input
                value={draft.name || ""}
                disabled={disabled}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </label>
            <label className="dm-record-field">
              <span>Description</span>
              <textarea
                rows={2}
                value={draft.description || ""}
                disabled={disabled}
                onChange={(e) => patch({ description: e.target.value })}
              />
            </label>
            <label className="dm-record-field">
              <span>Registry</span>
              <input value={registryRow?.integrationId || ""} readOnly disabled />
            </label>
            <label className="dm-record-field">
              <span>Test command (optional)</span>
              <input
                value={draft.command || ""}
                disabled={disabled}
                placeholder="curl-style hint for operators"
                onChange={(e) => patch({ command: e.target.value })}
              />
            </label>
          </details>

          <details className="dm-sandbox-tool-toggle">
            <summary>Execution</summary>
            <SegmentedToggle
              name="sandbox-tool-locality"
              label="Run locality"
              value={locality}
              options={["local", "serverless"]}
              disabled={disabled}
              onChange={(next) => {
                patch({
                  runLocality: next,
                  schedulerRegistryId: next === "serverless" ? registryRow?.integrationId || "" : ""
                });
                if (selectedNode?.type === "sandbox-adapter") {
                  patchNodeConfig(selectedNode.id, {
                    runLocality: next,
                    schedulerRegistryId: next === "serverless" ? registryRow?.integrationId || "" : ""
                  });
                }
              }}
            />
            <label className="dm-record-field">
              <span>Adapter</span>
              <select
                value={draft.adapter || "local-process"}
                disabled={disabled}
                onChange={(e) => {
                  patch({ adapter: e.target.value });
                  if (selectedNode?.type === "sandbox-adapter") patchNodeConfig(selectedNode.id, { adapter: e.target.value });
                }}
              >
                <option value="local-process">local-process</option>
                <option value="local-agent-host">local-agent-host</option>
                <option value="local-intelligence">local-intelligence</option>
              </select>
            </label>
          </details>

          <details className="dm-sandbox-tool-toggle">
            <summary>Security</summary>
            <label className="dm-record-field">
              <span>Auth ref</span>
              <input
                value={draft.authRef || ""}
                disabled={disabled}
                onChange={(e) => patch({ authRef: e.target.value })}
              />
            </label>
            {savedEnvRefs.length > 0 && (
              <div className="dm-record-field">
                <span>Env refs</span>
                <div className="dm-env-ref-chips">
                  {savedEnvRefs.map((ref) => (
                    <button
                      key={ref.endpointRef}
                      type="button"
                      className={`dm-env-ref-chip${envSlugs.includes(ref.endpointRef) ? " is-on" : ""}`}
                      disabled={disabled}
                      onClick={() => toggleEnvRef(ref.endpointRef)}
                    >
                      {ref.endpointRef}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <ToggleRow
              label="Network allowed"
              checked={["true", "1", "on", "yes"].includes(String(draft.networkAllow || "").toLowerCase())}
              disabled={disabled}
              onChange={(checked) => patch({ networkAllow: checked ? "true" : "" })}
            />
            <label className="dm-record-field">
              <span>Timeout (ms)</span>
              <input
                value={draft.timeoutMs || ""}
                disabled={disabled}
                onChange={(e) => patch({ timeoutMs: e.target.value })}
              />
            </label>
          </details>

          <details className="dm-sandbox-tool-toggle">
            <summary>Output</summary>
            <label className="dm-record-field">
              <span>Output root path</span>
              <input
                value={draft.outputRootPath || "data"}
                disabled={disabled}
                onChange={(e) => {
                  patch({ outputRootPath: e.target.value });
                  const normNode = (graph?.nodes || []).find((n) => n.type === "normalize-output");
                  if (normNode) patchNodeConfig(normNode.id, { rootPath: e.target.value });
                }}
              />
            </label>
            <ToggleRow label="Save lastResponse" checked disabled />
            <ToggleRow label="Save source record on run" checked disabled />
          </details>

          <details className="dm-sandbox-tool-toggle">
            <summary>Agent instructions</summary>
            <label className="dm-record-field">
              <span>Usage guide</span>
              <textarea
                rows={4}
                value={draft.instructions || ""}
                disabled={disabled}
                onChange={(e) => patch({ instructions: e.target.value })}
              />
            </label>
          </details>

          {selectedNode && (
            <div className="dm-sandbox-tool-node-inspector">
              <h4>Selected: {selectedNode.label}</h4>
              <pre>{JSON.stringify(selectedNode.config || {}, null, 2)}</pre>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ToggleRow({ label, checked, disabled, onChange }) {
  return (
    <label className="dm-sandbox-tool-toggle-row">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={Boolean(checked)}
        disabled={disabled || !onChange}
        onChange={(e) => onChange?.(e.target.checked)}
      />
    </label>
  );
}
