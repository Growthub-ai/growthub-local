/**
 * Folder workflow shortcuts — discover sandbox-environment rows for nav-folders.
 * Shortcuts reference rows; they do not copy orchestrationGraph JSON.
 */

import { parseOrchestrationGraph } from "./orchestration-graph.js";

const HIDDEN_SANDBOX_OBJECT_IDS = new Set(["workspace-helper-sandbox"]);

function sandboxRowId(row) {
  return String(row?.Name || row?.name || row?.slug || row?.id || "").trim();
}

function listAvailableWorkflows(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const out = [];
  for (const object of objects) {
    if (object?.objectType !== "sandbox-environment") continue;
    if (HIDDEN_SANDBOX_OBJECT_IDS.has(String(object?.id || ""))) continue;
    const objectId = String(object?.id || "").trim();
    if (!objectId) continue;
    const objectLabel = String(object?.label || "Sandbox Environment").trim();
    const rows = Array.isArray(object?.rows) ? object.rows : [];
    for (const row of rows) {
      const rowId = sandboxRowId(row);
      if (!rowId) continue;
      const graph = parseOrchestrationGraph(row?.orchestrationGraph);
      const graphNodeCount = Array.isArray(graph?.nodes) ? graph.nodes.length : 0;
      out.push({
        objectId,
        rowId,
        label: rowId,
        status: String(row?.lifecycleStatus || row?.status || "draft").trim(),
        version: String(row?.version || "1").trim(),
        graphNodeCount,
        objectLabel,
      });
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

function findSandboxRowByWorkflowRef(workspaceConfig, objectId, rowId) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const object = objects.find((o) => o?.id === objectId && o?.objectType === "sandbox-environment");
  if (!object) return { object: null, row: null, rowIndex: -1 };
  const wanted = String(rowId || "").trim();
  const rows = Array.isArray(object.rows) ? object.rows : [];
  const rowIndex = rows.findIndex((row) => sandboxRowId(row) === wanted);
  if (rowIndex < 0) return { object, row: null, rowIndex: -1 };
  return { object, row: rows[rowIndex], rowIndex };
}

export { listAvailableWorkflows, findSandboxRowByWorkflowRef, sandboxRowId };
