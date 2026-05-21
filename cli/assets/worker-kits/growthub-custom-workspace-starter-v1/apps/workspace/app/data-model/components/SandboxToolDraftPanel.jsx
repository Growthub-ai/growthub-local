"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import {
  buildDefaultOrchestrationGraphFromRegistry,
  isApiRegistryTestSuccessful,
  parseOrchestrationGraph,
  serializeOrchestrationGraph,
  updateGraphNode,
  validateOrchestrationGraph
} from "@/lib/orchestration-graph";
import { resolveConnectorAction } from "@/lib/orchestration-sidecar-routing";
import { OrchestrationGraphCanvas } from "./OrchestrationGraphCanvas.jsx";
import { OrchestrationNodeConfigPanel } from "./OrchestrationNodeConfigPanel.jsx";

export function SandboxToolDraftPanel({
  registryRow,
  draftOptions,
  onDraftChange,
  onRequestConfirm,
  onCancel,
  disabled
}) {
  const integrationId = String(registryRow?.integrationId || "").trim();
  const registryName = String(registryRow?.Name || integrationId).trim();
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
  const [agentHost, setAgentHost] = useState(draftOptions?.agentHost || "");
  const [schedulerRegistryId, setSchedulerRegistryId] = useState(
    draftOptions?.schedulerRegistryId || (draftOptions?.runLocality === "serverless" ? integrationId : "")
  );
  const [selectedNodeId, setSelectedNodeId] = useState("input");
  const [configTab, setConfigTab] = useState("node");
  const [graphError, setGraphError] = useState("");
  const [orchestrationGraph, setOrchestrationGraph] = useState(() => {
    if (draftOptions?.orchestrationGraph) {
      return parseOrchestrationGraph(draftOptions.orchestrationGraph)
        || buildDefaultOrchestrationGraphFromRegistry(registryRow, { authRef, rootPath });
    }
    return buildDefaultOrchestrationGraphFromRegistry(registryRow, { authRef, rootPath });
  });

  const registryKey = `${integrationId}:${String(registryRow?.endpoint || "")}:${String(registryRow?.method || "")}`;

  useEffect(() => {
    setOrchestrationGraph((current) => {
      const base = buildDefaultOrchestrationGraphFromRegistry(registryRow, {
        label: registryName,
        authRef,
        rootPath
      });
      const parsed = parseOrchestrationGraph(current) || current;
      if (!parsed?.nodes?.length) return base;
      return {
        ...parsed,
        nodes: parsed.nodes.map((node) => {
          const template = base.nodes.find((n) => n.id === node.id);
          if (!template) return node;
          if (node.id === "api-request") {
            return {
              ...node,
              subtitle: template.subtitle,
              config: { ...template.config, ...node.config, authRef }
            };
          }
          if (node.id === "transform") {
            return { ...node, config: { ...node.config, rootPath } };
          }
          return node;
        })
      };
    });
  }, [registryKey, registryName, authRef, rootPath, registryRow, integrationId]);

  const selectedNode = useMemo(() => {
    const parsed = parseOrchestrationGraph(orchestrationGraph) || orchestrationGraph;
    if (!selectedNodeId || !parsed?.nodes) return null;
    return parsed.nodes.find((n) => String(n.id) === selectedNodeId) || null;
  }, [orchestrationGraph, selectedNodeId]);

  const graphSerialized = useMemo(
    () => serializeOrchestrationGraph(orchestrationGraph),
    [orchestrationGraph]
  );

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
      agentHost,
      schedulerRegistryId,
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
    agentHost,
    schedulerRegistryId,
    graphSerialized,
    orchestrationGraph,
    onDraftChange
  ]);

  function handleNodeConfigChange(configPatch) {
    if (!selectedNodeId) return;
    setOrchestrationGraph((g) => updateGraphNode(g, selectedNodeId, configPatch));
    if (selectedNodeId === "transform" && configPatch.rootPath) {
      setRootPath(String(configPatch.rootPath));
    }
  }

  function handleConnectorAction(payload) {
    const { nodeId, tab } = resolveConnectorAction(payload);
    setSelectedNodeId(nodeId);
    setConfigTab(tab);
  }

  const defaultInstructions = `Governed sandbox tool for ${registryName}. Calls ${String(registryRow?.method || "GET").toUpperCase()} ${registryRow?.endpoint || registryRow?.baseUrl || ""}. authRef ${authRef} only — secrets resolve server-side.`;
  const headerBadge = isApiRegistryTestSuccessful(registryRow) ? "connected" : "draft";

  return (
    <section className="dm-orchestration-sidecar" aria-label="Sandbox orchestration field editor">
      <header className="dm-orchestration-header">
        <button type="button" className="dm-orchestration-header__back" onClick={onCancel} aria-label="Back">
          <ArrowLeft size={16} />
        </button>
        <div className="dm-orchestration-header__titles">
          <h2>Sandbox tool draft</h2>
          <p>Created from {registryName}</p>
        </div>
        <span className={`dm-orchestration-header__badge is-${headerBadge}`}>{headerBadge}</span>
        <div className="dm-orchestration-header__actions">
          <button type="button" className="dm-btn-outline" disabled={disabled} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="dm-btn-primary-sm"
            disabled={disabled || !name.trim() || Boolean(graphError) || !isApiRegistryTestSuccessful(registryRow)}
            onClick={onRequestConfirm}
          >
            Create tool
          </button>
        </div>
      </header>

      <div className="dm-orchestration-sidecar__body">
        <div className="dm-orchestration-sidecar__canvas-col">
          <OrchestrationGraphCanvas
            graph={orchestrationGraph}
            selectedNodeId={selectedNodeId}
            onSelectNode={(node) => {
              setSelectedNodeId(String(node?.id || ""));
              setConfigTab("node");
            }}
            onConnectorAction={handleConnectorAction}
          />
        </div>

        <div className="dm-orchestration-sidecar__config-col">
          <OrchestrationNodeConfigPanel
            node={selectedNode}
            registryRow={registryRow}
            disabled={disabled}
            activeTab={configTab}
            onTabChange={setConfigTab}
            onConfigChange={handleNodeConfigChange}
          />

          <details className="dm-orchestration-runtime">
            <summary>Runtime (sandbox row)</summary>
            <div className="dm-orchestration-runtime__fields">
              <label className="dm-orchestration-config__field">
                <span>Name</span>
                <input value={name} disabled={disabled} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Description</span>
                <textarea rows={2} value={description} disabled={disabled} onChange={(e) => setDescription(e.target.value)} />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Run locality</span>
                <select
                  value={runLocality}
                  disabled={disabled}
                  onChange={(e) => {
                    const next = e.target.value;
                    setRunLocality(next);
                    setAdapter(next === "serverless" ? "serverless" : "local-process");
                    if (next === "serverless" && !schedulerRegistryId) {
                      setSchedulerRegistryId(integrationId);
                    }
                  }}
                >
                  <option value="local">local</option>
                  <option value="serverless">serverless</option>
                </select>
              </label>
              <label className="dm-orchestration-config__field">
                <span>Adapter</span>
                <select value={adapter} disabled={disabled} onChange={(e) => setAdapter(e.target.value)}>
                  <option value="local-process">local-process</option>
                  <option value="local-agent-host">local-agent-host</option>
                  <option value="serverless">serverless</option>
                </select>
              </label>
              {adapter === "local-agent-host" && (
                <label className="dm-orchestration-config__field">
                  <span>Agent host</span>
                  <input value={agentHost} disabled={disabled} onChange={(e) => setAgentHost(e.target.value)} />
                </label>
              )}
              {runLocality === "serverless" && (
                <label className="dm-orchestration-config__field">
                  <span>Scheduler registry ID</span>
                  <input
                    value={schedulerRegistryId}
                    disabled={disabled}
                    onChange={(e) => setSchedulerRegistryId(e.target.value)}
                  />
                </label>
              )}
              <label className="dm-orchestration-config__field">
                <span>Auth reference</span>
                <input value={authRef} disabled={disabled} onChange={(e) => setAuthRef(e.target.value)} />
              </label>
              <label className="dm-orchestration-config__field dm-orchestration-config__field-inline">
                <input
                  type="checkbox"
                  checked={networkAllow}
                  disabled={disabled}
                  onChange={(e) => setNetworkAllow(e.target.checked)}
                />
                <span>Network allowed</span>
              </label>
              <label className="dm-orchestration-config__field">
                <span>Env refs (comma-separated)</span>
                <input value={envRefs} disabled={disabled} onChange={(e) => setEnvRefs(e.target.value)} />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Timeout (ms)</span>
                <input value={timeoutMs} disabled={disabled} onChange={(e) => setTimeoutMs(e.target.value)} />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Instructions</span>
                <textarea
                  rows={3}
                  value={instructions || defaultInstructions}
                  disabled={disabled}
                  onChange={(e) => setInstructions(e.target.value)}
                />
              </label>
            </div>
          </details>

          {graphError && <p className="dm-orchestration-config__error">{graphError}</p>}
          <p className="dm-orchestration-sidecar__footnote">
            No secrets are stored. Nothing runs until you click Run sandbox after creation.
          </p>
        </div>
      </div>
    </section>
  );
}
