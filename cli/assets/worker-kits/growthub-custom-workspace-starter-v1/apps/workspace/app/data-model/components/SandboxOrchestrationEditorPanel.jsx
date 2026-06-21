"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import {
  addCanonicalNodeToGraph,
  buildBlankOrchestrationGraphShell,
  buildDefaultOrchestrationGraphFromRegistry,
  getNextCanonicalNodeId,
  getOrchestrationGraphUiState,
  parseOrchestrationGraph,
  serializeOrchestrationGraph,
  updateGraphNode,
  validateOrchestrationGraph
} from "@/lib/orchestration-graph";
import { resolveConnectorAction } from "@/lib/orchestration-sidecar-routing";
import { OrchestrationGraphCanvas } from "./OrchestrationGraphCanvas.jsx";
import { OrchestrationGraphEmptyCanvas } from "./OrchestrationGraphEmptyCanvas.jsx";
import { OrchestrationNodeConfigPanel } from "./OrchestrationNodeConfigPanel.jsx";

function resolveRegistryRowForSandbox(workspaceConfig, sandboxRow) {
  const graph = parseOrchestrationGraph(sandboxRow?.orchestrationGraph ?? sandboxRow?.orchestrationConfig);
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

export function SandboxOrchestrationEditorPanel({
  sandboxRow,
  workspaceConfig,
  disabled,
  onSaveGraph,
  onBack
}) {
  const registryRow = useMemo(
    () => resolveRegistryRowForSandbox(workspaceConfig, sandboxRow),
    [workspaceConfig, sandboxRow]
  );

  const [selectedNodeId, setSelectedNodeId] = useState("input");
  const [configTab, setConfigTab] = useState("node");
  const [graphError, setGraphError] = useState("");
  const savedGraph = sandboxRow?.orchestrationGraph ?? sandboxRow?.orchestrationConfig;
  const [orchestrationGraph, setOrchestrationGraph] = useState(() => parseOrchestrationGraph(savedGraph));

  const graphUiState = getOrchestrationGraphUiState(
    orchestrationGraph ?? savedGraph
  );
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
    setOrchestrationGraph(parseOrchestrationGraph(sandboxRow?.orchestrationGraph ?? sandboxRow?.orchestrationConfig));
  }, [sandboxRow?.orchestrationGraph, sandboxRow?.orchestrationConfig]);

  useEffect(() => {
    if (graphUnset) {
      setGraphError("");
      return;
    }
    if (graphBlankShell) {
      setGraphError("");
      onSaveGraph?.(serializeOrchestrationGraph(orchestrationGraph));
      return;
    }
    const validation = validateOrchestrationGraph(orchestrationGraph);
    setGraphError(validation.ok ? "" : validation.errors[0] || "Invalid graph");
    onSaveGraph?.(serializeOrchestrationGraph(orchestrationGraph));
  }, [orchestrationGraph, graphUnset, graphBlankShell, onSaveGraph]);

  function startFromRegistry() {
    if (!registryRow) return;
    setOrchestrationGraph(buildDefaultOrchestrationGraphFromRegistry(registryRow));
    setSelectedNodeId("input");
    setConfigTab("node");
  }

  function startBlank() {
    setOrchestrationGraph(buildBlankOrchestrationGraphShell());
    setSelectedNodeId("input");
    setConfigTab("node");
  }

  function applyPastedGraph(text) {
    const parsed = parseOrchestrationGraph(text);
    if (parsed) setOrchestrationGraph(parsed);
  }

  function addNextNode() {
    if (!nextNodeId) return;
    setOrchestrationGraph((g) => addCanonicalNodeToGraph(g || buildBlankOrchestrationGraphShell(), nextNodeId, registryRow || {}));
    setSelectedNodeId(nextNodeId);
    setConfigTab("node");
  }

  function handleConnectorAction(payload) {
    const { nodeId, tab } = resolveConnectorAction(payload);
    setSelectedNodeId(nodeId);
    setConfigTab(tab);
  }

  function handleNodeConfigChange(configPatch) {
    if (!selectedNodeId) return;
    setOrchestrationGraph((g) => updateGraphNode(g, selectedNodeId, configPatch));
  }

  return (
    <section className="dm-orchestration-sidecar" aria-label="Sandbox orchestration graph editor">
      <header className="dm-orchestration-header">
        <button type="button" className="dm-orchestration-header__back" onClick={onBack} aria-label="Back">
          <ArrowLeft size={16} />
        </button>
        <div className="dm-orchestration-header__titles">
          <h2>Orchestration graph</h2>
          <p>{sandboxRow?.Name || "Workflow"}</p>
        </div>
      </header>

      <div className="dm-orchestration-sidecar__body">
        <div className="dm-orchestration-sidecar__canvas-col">
          {graphUnset ? (
            <OrchestrationGraphEmptyCanvas
              disabled={disabled || !registryRow}
              onStartFromRegistry={registryRow ? startFromRegistry : undefined}
              onStartBlank={startBlank}
              onPasteGraph={applyPastedGraph}
            />
          ) : graphBlankShell ? (
            <div className="dm-orchestration-canvas dm-orchestration-canvas--blank-shell">
              <p className="dm-orchestration-canvas__blank-hint">Add first node</p>
              <button type="button" className="dm-btn-outline" disabled={disabled} onClick={addNextNode}>
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
                <button type="button" className="dm-btn-outline dm-orchestration-canvas__add-node" disabled={disabled} onClick={addNextNode}>
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
              disabled={disabled}
              activeTab={configTab}
              onTabChange={setConfigTab}
              onConfigChange={handleNodeConfigChange}
            />
            {graphError && <p className="dm-orchestration-config__error">{graphError}</p>}
          </div>
        )}
      </div>
    </section>
  );
}
