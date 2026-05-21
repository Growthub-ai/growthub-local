"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { WorkspaceRail } from "../workspace-rail.jsx";
import { findSandboxRowByWorkflowRef } from "@/lib/nav-workflows";
import {
  addCanonicalNodeToGraph,
  buildBlankOrchestrationGraphShell,
  buildDefaultOrchestrationGraphFromRegistry,
  getNextCanonicalNodeId,
  getOrchestrationGraphUiState,
  parseOrchestrationGraph,
  redactSecretsFromText,
  serializeOrchestrationGraph,
  updateGraphNode,
  validateOrchestrationGraph
} from "@/lib/orchestration-graph";
import { resolveConnectorAction } from "@/lib/orchestration-sidecar-routing";
import { OrchestrationGraphCanvas } from "../data-model/components/OrchestrationGraphCanvas.jsx";
import { OrchestrationGraphEmptyCanvas } from "../data-model/components/OrchestrationGraphEmptyCanvas.jsx";
import { OrchestrationNodeConfigPanel } from "../data-model/components/OrchestrationNodeConfigPanel.jsx";
import { OrchestrationRunTracePanel } from "../data-model/components/OrchestrationRunTracePanel.jsx";

function resolveRegistryRowForSandbox(workspaceConfig, sandboxRow) {
  const graph = parseOrchestrationGraph(sandboxRow?.orchestrationGraph);
  const apiNode = graph?.nodes?.find((n) => n?.type === "api-registry-call");
  const registryId = String(
    apiNode?.config?.registryId || apiNode?.config?.integrationId || sandboxRow?.schedulerRegistryId || ""
  ).trim();
  if (!registryId || !workspaceConfig) return null;
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  for (const objectItem of objects) {
    if (objectItem?.objectType !== "api-registry") continue;
    const rows = Array.isArray(objectItem.rows) ? objectItem.rows : [];
    const match = rows.find((r) => String(r?.integrationId || "").trim() === registryId);
    if (match) return match;
  }
  return null;
}

function patchSandboxRowInConfig(workspaceConfig, objectId, rowIndex, fields) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  return {
    ...workspaceConfig,
    dataModel: {
      ...workspaceConfig.dataModel,
      objects: objects.map((object) => {
        if (object?.id !== objectId) return object;
        const rows = Array.isArray(object.rows) ? object.rows : [];
        return {
          ...object,
          rows: rows.map((row, index) => (index === rowIndex ? { ...row, ...fields } : row)),
        };
      }),
    },
  };
}

export default function WorkflowSurface() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const objectId = String(searchParams.get("object") || "").trim();
  const rowId = String(searchParams.get("row") || "").trim();
  const fieldName = String(searchParams.get("field") || "orchestrationGraph").trim();
  const runId = String(searchParams.get("run") || "").trim();

  const [workspaceConfig, setWorkspaceConfig] = useState(null);
  const [authority, setAuthority] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState("");
  const [sidecarMode, setSidecarMode] = useState(runId ? "trace" : "graph");

  const [selectedNodeId, setSelectedNodeId] = useState("input");
  const [configTab, setConfigTab] = useState("node");
  const [graphError, setGraphError] = useState("");
  const [orchestrationGraph, setOrchestrationGraph] = useState(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/workspace", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to load workspace");
      setWorkspaceConfig(payload.workspaceConfig);
      setAuthority(payload.adapters?.integrations?.authority || null);
    } catch (err) {
      setError(err.message || "Failed to load workspace");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resolved = useMemo(
    () => (workspaceConfig ? findSandboxRowByWorkflowRef(workspaceConfig, objectId, rowId) : { object: null, row: null, rowIndex: -1 }),
    [workspaceConfig, objectId, rowId]
  );

  const sandboxRow = resolved.row;
  const registryRow = useMemo(
    () => (sandboxRow && workspaceConfig ? resolveRegistryRowForSandbox(workspaceConfig, sandboxRow) : null),
    [workspaceConfig, sandboxRow]
  );

  useEffect(() => {
    setSidecarMode(runId ? "trace" : "graph");
  }, [runId]);

  useEffect(() => {
    if (!sandboxRow) return;
    const parsed = parseOrchestrationGraph(sandboxRow[fieldName] ?? sandboxRow.orchestrationGraph);
    setOrchestrationGraph(parsed);
    setDirty(false);
    setGraphError("");
  }, [sandboxRow, fieldName, objectId, rowId]);

  const graphUiState = getOrchestrationGraphUiState(orchestrationGraph);
  const graphUnset = graphUiState === "unset";
  const graphBlankShell = graphUiState === "blank-shell";
  const nextNodeId = useMemo(
    () => (orchestrationGraph ? getNextCanonicalNodeId(orchestrationGraph) : "input"),
    [orchestrationGraph]
  );

  const selectedNode = useMemo(() => {
    if (!orchestrationGraph?.nodes || !selectedNodeId) return null;
    return orchestrationGraph.nodes.find((n) => String(n.id) === selectedNodeId) || null;
  }, [orchestrationGraph, selectedNodeId]);

  useEffect(() => {
    if (graphUnset || graphBlankShell) {
      setGraphError("");
      return;
    }
    const validation = validateOrchestrationGraph(orchestrationGraph);
    setGraphError(validation.ok ? "" : validation.errors[0] || "Invalid graph");
  }, [orchestrationGraph, graphUnset, graphBlankShell]);

  async function persistWorkspace(nextConfig) {
    const res = await fetch("/api/workspace", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dataModel: nextConfig.dataModel }),
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error || "Failed to save workspace");
    setWorkspaceConfig(payload.workspaceConfig || nextConfig);
  }

  async function saveGraph() {
    if (resolved.rowIndex < 0 || !objectId) return;
    setSaving(true);
    setSaveMessage("");
    try {
      const serialized = graphUnset ? "" : serializeOrchestrationGraph(orchestrationGraph);
      const next = patchSandboxRowInConfig(workspaceConfig, objectId, resolved.rowIndex, {
        [fieldName]: serialized,
      });
      await persistWorkspace(next);
      setDirty(false);
      setSaveMessage("Saved orchestration graph on sandbox row.");
    } catch (err) {
      setSaveMessage(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function runSandbox() {
    if (!objectId || !rowId) return;
    setRunning(true);
    setRunMessage("");
    try {
      const res = await fetch("/api/workspace/sandbox-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objectId, name: rowId }),
      });
      const payload = await res.json();
      const responseText = redactSecretsFromText(JSON.stringify(payload.response ?? payload, null, 2));
      const status = payload.ok && String(payload.status || "").toLowerCase() === "connected" ? "connected" : "failed";
      const testedAt = payload.response?.ranAt || new Date().toISOString();
      const lastRunId = payload.runId || payload.response?.runId || "";
      const lastSourceId = payload.sourceId || payload.response?.sourceId || "";
      const next = patchSandboxRowInConfig(workspaceConfig, objectId, resolved.rowIndex, {
        status,
        lastTested: testedAt,
        lastRunId,
        lastSourceId,
        lastResponse: responseText,
      });
      await persistWorkspace(next);
      setRunMessage(status === "connected" ? "Sandbox run recorded." : redactSecretsFromText(payload.response?.error || payload.error || "Run failed"));
    } catch (err) {
      setRunMessage(redactSecretsFromText(err.message || "Sandbox run failed"));
    } finally {
      setRunning(false);
    }
  }

  function openTraceMode() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("run");
    router.push(`/workflows?${params.toString()}`);
    setSidecarMode("trace");
  }

  function openGraphMode() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("run");
    router.push(`/workflows?${params.toString()}`);
    setSidecarMode("graph");
  }

  function startFromRegistry() {
    if (!registryRow) return;
    setOrchestrationGraph(buildDefaultOrchestrationGraphFromRegistry(registryRow));
    setSelectedNodeId("input");
    setDirty(true);
  }

  function startBlank() {
    setOrchestrationGraph(buildBlankOrchestrationGraphShell());
    setSelectedNodeId("input");
    setDirty(true);
  }

  function applyPastedGraph(text) {
    const parsed = parseOrchestrationGraph(text);
    if (parsed) {
      setOrchestrationGraph(parsed);
      setDirty(true);
    }
  }

  function addNextNode() {
    if (!nextNodeId) return;
    setOrchestrationGraph((g) => addCanonicalNodeToGraph(
      g || buildBlankOrchestrationGraphShell(),
      nextNodeId,
      registryRow || {},
    ));
    setSelectedNodeId(nextNodeId);
    setDirty(true);
  }

  function handleNodeConfigChange(configPatch) {
    if (!selectedNodeId) return;
    setOrchestrationGraph((g) => updateGraphNode(g, selectedNodeId, configPatch));
    setDirty(true);
  }

  function handleConnectorAction(payload) {
    const { nodeId, tab } = resolveConnectorAction(payload);
    setSelectedNodeId(nodeId);
    setConfigTab(tab);
  }

  const label = sandboxRow?.Name || rowId || "Workflow";
  const lifecycle = String(sandboxRow?.lifecycleStatus || "draft").trim();
  const version = String(sandboxRow?.version || "1").trim();

  return (
    <main className="workspace-builder">
      <WorkspaceRail
        workspaceConfig={workspaceConfig}
        authority={authority}
        helperOpen={false}
        onConfigChange={(nextConfig) => setWorkspaceConfig(nextConfig)}
        onOpenHelper={() => router.push("/data-model?helper=open")}
        onOpenThread={(row) => router.push(`/data-model?thread=${encodeURIComponent(row.id)}`)}
      />
      <section className="workspace-surface dm-workflow-surface">
        <header className="workspace-toolbar dm-workflow-toolbar">
          <div>
            <p className="dm-workflow-eyebrow">Workflow</p>
            <h1>{label}</h1>
            <p className="dm-workflow-meta">
              Sandbox Environment · {lifecycle} · v{version}
            </p>
          </div>
          <div className="dm-workflow-toolbar-actions">
            <Link href={`/data-model?object=${encodeURIComponent(objectId)}`} className="dm-btn-outline">
              Back to Data Model
            </Link>
            <button type="button" className="dm-btn-outline" disabled={running || !sandboxRow} onClick={runSandbox}>
              {running ? "Running…" : "Run sandbox"}
            </button>
            <button type="button" className="dm-btn-outline" disabled={!sandboxRow} onClick={openTraceMode}>
              View traces
            </button>
            {sidecarMode === "trace" && (
              <button type="button" className="dm-btn-outline" onClick={openGraphMode}>
                Edit graph
              </button>
            )}
            <button
              type="button"
              className="dm-btn-primary-sm"
              disabled={saving || !dirty || Boolean(graphError) || graphUnset}
              onClick={saveGraph}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </header>

        {loading ? (
          <p className="dm-workflow-empty">Loading workflow…</p>
        ) : error ? (
          <p className="dm-workflow-empty dm-workflow-error">{error}</p>
        ) : !objectId || !rowId ? (
          <p className="dm-workflow-empty">Missing workflow object or row in the URL.</p>
        ) : !sandboxRow ? (
          <p className="dm-workflow-empty">
            Sandbox row not found. The workflow shortcut may reference a removed row.
          </p>
        ) : sidecarMode === "trace" ? (
          <OrchestrationRunTracePanel
            row={sandboxRow}
            objectId={objectId}
            fieldName="lastResponse"
            selectedRunId={runId}
            onBack={openGraphMode}
            onOpenGraph={openGraphMode}
          />
        ) : (
          <div className="dm-orchestration-sidecar dm-workflow-orchestration">
            <div className="dm-orchestration-sidecar__body">
              <div className="dm-orchestration-sidecar__canvas-col">
                {graphUnset ? (
                  <OrchestrationGraphEmptyCanvas
                    disabled={false}
                    onStartFromRegistry={registryRow ? startFromRegistry : undefined}
                    onStartBlank={startBlank}
                    onPasteGraph={applyPastedGraph}
                  />
                ) : graphBlankShell ? (
                  <div className="dm-orchestration-canvas dm-orchestration-canvas--blank-shell">
                    <p className="dm-orchestration-canvas__blank-hint">Add first node</p>
                    <button type="button" className="dm-btn-outline" onClick={addNextNode}>
                      + Add Input
                    </button>
                  </div>
                ) : (
                  <>
                    <OrchestrationGraphCanvas
                      graph={orchestrationGraph}
                      selectedNodeId={selectedNodeId}
                      onSelectNode={(node) => {
                        setSelectedNodeId(String(node?.id || ""));
                        setConfigTab("node");
                      }}
                      onConnectorAction={handleConnectorAction}
                    />
                    {nextNodeId && (
                      <button type="button" className="dm-btn-outline dm-orchestration-canvas__add-node" onClick={addNextNode}>
                        + Add {nextNodeId === "api-request" ? "API Registry" : nextNodeId}
                      </button>
                    )}
                  </>
                )}
              </div>
              {graphUiState === "populated" && (
                <div className="dm-orchestration-sidecar__config-col">
                  <OrchestrationNodeConfigPanel
                    node={selectedNode}
                    registryRow={registryRow}
                    disabled={false}
                    activeTab={configTab}
                    onTabChange={setConfigTab}
                    onConfigChange={handleNodeConfigChange}
                  />
                  {graphError && <p className="dm-orchestration-config__error">{graphError}</p>}
                </div>
              )}
            </div>
          </div>
        )}

        {(saveMessage || runMessage) && (
          <p className="dm-workflow-status-msg">{saveMessage || runMessage}</p>
        )}
      </section>
    </main>
  );
}
