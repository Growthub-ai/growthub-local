"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildDefaultOrchestrationGraphFromRegistry,
  parseOrchestrationGraph,
  serializeOrchestrationGraph,
  validateOrchestrationGraph
} from "@/lib/orchestration-graph";
import { ApiRegistryReviewModal } from "./ApiRegistryReviewModal.jsx";
import { OrchestrationGraphCanvas } from "./OrchestrationGraphCanvas.jsx";

export function SandboxToolDraftPanel({
  registryRow,
  draftOptions,
  onDraftChange,
  onRequestConfirm,
  onCancel,
  disabled
}) {
  const integrationId = String(registryRow?.integrationId || "").trim();
  const defaultName = registryRow?.Name
    ? `${String(registryRow.Name).trim()} Tool`
    : `${integrationId} Tool`;

  const [name, setName] = useState(draftOptions?.name || defaultName);
  const [description, setDescription] = useState(draftOptions?.description || String(registryRow?.description || "").trim());
  const [runLocality, setRunLocality] = useState(draftOptions?.runLocality || "local");
  const [adapter, setAdapter] = useState(draftOptions?.adapter || "local-process");
  const [authRef, setAuthRef] = useState(draftOptions?.authRef || String(registryRow?.authRef || integrationId).trim());
  const [envRefs, setEnvRefs] = useState(draftOptions?.envRefs || "");
  const [networkAllow, setNetworkAllow] = useState(Boolean(draftOptions?.networkAllow));
  const [timeoutMs, setTimeoutMs] = useState(String(draftOptions?.timeoutMs || "30000"));
  const [rootPath, setRootPath] = useState(draftOptions?.rootPath || "data");
  const [instructions, setInstructions] = useState(draftOptions?.instructions || "");
  const [advancedOpen, setAdvancedOpen] = useState({ security: false, output: false, agent: false });
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [graphError, setGraphError] = useState("");

  const orchestrationGraph = useMemo(
    () => buildDefaultOrchestrationGraphFromRegistry(registryRow, {
      label: registryRow?.Name || integrationId,
      runLocality,
      adapter,
      authRef,
      rootPath
    }),
    [registryRow, integrationId, runLocality, adapter, authRef, rootPath]
  );

  const graphSerialized = useMemo(() => serializeOrchestrationGraph(orchestrationGraph), [orchestrationGraph]);

  useEffect(() => {
    const validation = validateOrchestrationGraph(orchestrationGraph);
    setGraphError(validation.ok ? "" : validation.errors[0] || "Invalid graph");
    onDraftChange?.({
      name,
      description,
      runLocality,
      adapter,
      authRef,
      envRefs,
      networkAllow,
      timeoutMs,
      rootPath,
      instructions,
      orchestrationGraph: graphSerialized
    });
  }, [
    name,
    description,
    runLocality,
    adapter,
    authRef,
    envRefs,
    networkAllow,
    timeoutMs,
    rootPath,
    instructions,
    graphSerialized,
    orchestrationGraph,
    onDraftChange
  ]);

  const selectedNode = useMemo(() => {
    const parsed = parseOrchestrationGraph(orchestrationGraph);
    if (!selectedNodeId || !parsed?.nodes) return null;
    return parsed.nodes.find((n) => String(n.id) === selectedNodeId) || null;
  }, [orchestrationGraph, selectedNodeId]);

  function toggleSection(key) {
    setAdvancedOpen((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <section className="dm-sandbox-tool-draft" aria-label="Sandbox tool draft">
      <ApiRegistryReviewModal registryRow={registryRow} onClose={onCancel} />

      <div className="dm-sandbox-tool-draft-grid">
        <div className="dm-sandbox-tool-draft-canvas-col">
          <p className="dm-sandbox-tool-draft-label">API → Sandbox → Output</p>
          <OrchestrationGraphCanvas
            graph={orchestrationGraph}
            selectedNodeId={selectedNodeId}
            onSelectNode={(node) => setSelectedNodeId(String(node?.id || ""))}
          />
          {selectedNode && (
            <div className="dm-orch-node-inspector">
              <span className="dm-orch-node-inspector-title">{selectedNode.label}</span>
              <pre>{JSON.stringify(selectedNode.config || {}, null, 2)}</pre>
            </div>
          )}
        </div>

        <div className="dm-sandbox-tool-draft-fields">
          <label className="dm-drawer-field">
            <span>Tool name</span>
            <input value={name} disabled={disabled} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="dm-drawer-field">
            <span>Description</span>
            <textarea
              rows={2}
              value={description}
              disabled={disabled}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="dm-drawer-field">
            <span>Run locality</span>
            <select
              value={runLocality}
              disabled={disabled}
              onChange={(e) => {
                const next = e.target.value;
                setRunLocality(next);
                if (next === "serverless") setAdapter("serverless");
                else setAdapter("local-process");
              }}
            >
              <option value="local">local</option>
              <option value="serverless">serverless</option>
            </select>
          </label>
          <label className="dm-drawer-field">
            <span>Adapter</span>
            <input value={adapter} disabled={disabled} onChange={(e) => setAdapter(e.target.value)} />
          </label>
          <label className="dm-drawer-field">
            <span>Auth reference</span>
            <input value={authRef} disabled={disabled} onChange={(e) => setAuthRef(e.target.value)} />
          </label>
          <label className="dm-drawer-field">
            <span>Output root path</span>
            <input value={rootPath} disabled={disabled} onChange={(e) => setRootPath(e.target.value)} />
          </label>

          <details className="dm-sandbox-tool-advanced" open>
            <summary>Basic</summary>
            <p className="dm-sandbox-tool-advanced-hint">
              Registry: <strong>{integrationId}</strong> · {String(registryRow?.method || "GET").toUpperCase()}{" "}
              {registryRow?.endpoint || ""}
            </p>
          </details>

          <details
            className="dm-sandbox-tool-advanced"
            open={advancedOpen.security}
            onToggle={(e) => setAdvancedOpen((c) => ({ ...c, security: e.target.open }))}
          >
            <summary>Security</summary>
            <label className="dm-drawer-field">
              <span>Env refs (comma-separated slugs)</span>
              <input value={envRefs} disabled={disabled} onChange={(e) => setEnvRefs(e.target.value)} />
            </label>
            <label className="dm-drawer-field dm-drawer-field-inline">
              <input
                type="checkbox"
                checked={networkAllow}
                disabled={disabled}
                onChange={(e) => setNetworkAllow(e.target.checked)}
              />
              <span>Network allowed</span>
            </label>
            <label className="dm-drawer-field">
              <span>Timeout (ms)</span>
              <input value={timeoutMs} disabled={disabled} onChange={(e) => setTimeoutMs(e.target.value)} />
            </label>
          </details>

          <details
            className="dm-sandbox-tool-advanced"
            open={advancedOpen.output}
            onToggle={(e) => setAdvancedOpen((c) => ({ ...c, output: e.target.open }))}
          >
            <summary>Output</summary>
            <p className="dm-sandbox-tool-advanced-hint">Saves lastResponse and source record on successful sandbox test.</p>
          </details>

          <details
            className="dm-sandbox-tool-advanced"
            open={advancedOpen.agent}
            onToggle={(e) => setAdvancedOpen((c) => ({ ...c, agent: e.target.open }))}
          >
            <summary>Agent instructions</summary>
            <label className="dm-drawer-field">
              <span>Usage guide</span>
              <textarea
                rows={4}
                value={instructions}
                disabled={disabled}
                placeholder={`When to call ${name}, expected input, and how to read normalized output at "${rootPath}".`}
                onChange={(e) => setInstructions(e.target.value)}
              />
            </label>
          </details>

          {graphError && <p className="dm-sandbox-tool-error">{graphError}</p>}
        </div>
      </div>

      <footer className="dm-sandbox-tool-draft-foot">
        <button type="button" className="dm-btn-outline" disabled={disabled} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="dm-btn-primary-sm"
          disabled={disabled || !name.trim() || Boolean(graphError)}
          onClick={onRequestConfirm}
        >
          Review & create
        </button>
      </footer>
    </section>
  );
}
