/**
 * Governed workspace lifecycle — delete impact preview and cascade helpers.
 * Pure config transforms; sidecar pruning is returned as key lists for routes.
 */

import { parseOrchestrationGraph } from "./orchestration-graph.js";
import { deleteTableRow, parseSandboxEnvRefs, sandboxRunSourceId } from "./workspace-data-model.js";

const NAV_FOLDERS_OBJECT_ID = "nav-folders";

function sandboxRowId(row) {
  return String(row?.Name || row?.name || row?.slug || row?.id || "").trim();
}

function listObjects(workspaceConfig) {
  return Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
}

function findObject(workspaceConfig, objectId) {
  return listObjects(workspaceConfig).find((o) => o?.id === objectId) || null;
}

function scanRegistryReferences(workspaceConfig, integrationId) {
  const impacts = [];
  const id = String(integrationId || "").trim();
  if (!id) return impacts;

  for (const object of listObjects(workspaceConfig)) {
    const rows = Array.isArray(object?.rows) ? object.rows : [];
    rows.forEach((row, rowIndex) => {
      if (object.objectType === "data-source" && String(row?.registryId || "").trim() === id) {
        impacts.push({
          kind: "data-source-registryId",
          objectId: object.id,
          objectLabel: object.label || object.source,
          rowIndex,
          rowLabel: String(row?.Name || row?.name || row?.sourceId || rowIndex)
        });
      }
      if (object.objectType === "sandbox-environment") {
        if (String(row?.schedulerRegistryId || "").trim() === id) {
          impacts.push({
            kind: "sandbox-schedulerRegistryId",
            objectId: object.id,
            objectLabel: object.label || object.source,
            rowIndex,
            rowLabel: sandboxRowId(row) || String(rowIndex)
          });
        }
      }
      if (object.objectType === "sandbox-environment" || object.objectType === "api-registry") {
        const graph = parseOrchestrationGraph(row?.orchestrationConfig || row?.orchestrationGraph || row?.orchestrationDraftConfig || row?.orchestrationDraftGraph);
        for (const node of graph?.nodes || []) {
          const nodeRegistry = String(node?.config?.registryId || node?.config?.integrationId || "").trim();
          if (nodeRegistry === id) {
            impacts.push({
              kind: "workflow-node-registryId",
              objectId: object.id,
              objectLabel: object.label || object.source,
              rowIndex,
              rowLabel: sandboxRowId(row) || String(rowIndex),
              nodeId: String(node?.id || "")
            });
          }
        }
      }
    });
  }

  return impacts;
}

function scanNavFolderShortcuts(workspaceConfig, objectId, rowId) {
  const impacts = [];
  const navObject = findObject(workspaceConfig, NAV_FOLDERS_OBJECT_ID);
  if (!navObject) return impacts;
  const folders = Array.isArray(navObject.rows) ? navObject.rows : [];
  folders.forEach((folder, folderIndex) => {
    const items = Array.isArray(folder?.items) ? folder.items : [];
    items.forEach((item, itemIndex) => {
      if (item?.type === "workflow" && String(item?.objectId || "") === objectId && String(item?.rowId || "") === rowId) {
        impacts.push({
          kind: "nav-folder-workflow-shortcut",
          folderIndex,
          folderName: String(folder?.name || folder?.id || "Builder"),
          itemIndex,
          itemLabel: String(item?.label || rowId)
        });
      }
    });
  });
  return impacts;
}

function scanWidgetBindings(workspaceConfig, { sourceId, objectId }) {
  const impacts = [];
  const widgets = Array.isArray(workspaceConfig?.canvas?.widgets) ? workspaceConfig.canvas.widgets : [];
  widgets.forEach((widget, index) => {
    const binding = widget?.config?.binding;
    if (!binding || typeof binding !== "object") return;
    if (sourceId && String(binding?.sourceId || "").trim() === sourceId) {
      impacts.push({ kind: "widget-binding-sourceId", widgetId: widget?.id || `widget-${index}`, widgetTitle: widget?.title || widget?.kind || "Widget" });
    }
    if (objectId && String(binding?.objectId || "").trim() === objectId) {
      impacts.push({ kind: "widget-binding-objectId", widgetId: widget?.id || `widget-${index}`, widgetTitle: widget?.title || widget?.kind || "Widget" });
    }
  });
  return impacts;
}

/**
 * Compute delete impact for a single governed table row.
 */
function computeRowDeleteImpact(workspaceConfig, table, rowIndex) {
  const row = Array.isArray(table?.rows) ? table.rows[rowIndex] : null;
  if (!row) {
    return { impacts: [], sidecarKeys: [], warnings: ["row not found"] };
  }

  const impacts = [];
  const sidecarKeys = [];
  const warnings = [];

  if (table.objectType === "api-registry") {
    const integrationId = String(row?.integrationId || row?.id || row?.Name || "").trim();
    impacts.push(...scanRegistryReferences(workspaceConfig, integrationId));
    const sourceId = String(row?.sourceId || "").trim();
    if (sourceId) sidecarKeys.push(sourceId);
  }

  if (table.objectType === "sandbox-environment") {
    const objectId = String(table.objectId || table.id || "").trim();
    const rowId = sandboxRowId(row);
    const sourceId = sandboxRunSourceId(objectId, rowId);
    if (sourceId) sidecarKeys.push(sourceId);
    impacts.push(...scanNavFolderShortcuts(workspaceConfig, objectId, rowId));
    impacts.push(...scanWidgetBindings(workspaceConfig, { sourceId }));
  }

  if (table.objectType === "data-source") {
    const sourceId = String(row?.sourceId || "").trim();
    if (sourceId) {
      sidecarKeys.push(sourceId);
      impacts.push(...scanWidgetBindings(workspaceConfig, { sourceId }));
    }
  }

  if (!impacts.length && !sidecarKeys.length) {
    warnings.push("No dependent references detected — config row only.");
  }

  return { impacts, sidecarKeys, warnings, rowLabel: sandboxRowId(row) || String(row?.integrationId || row?.Name || rowIndex) };
}

function removeNavFolderShortcuts(workspaceConfig, objectId, rowId) {
  const navObject = findObject(workspaceConfig, NAV_FOLDERS_OBJECT_ID);
  if (!navObject) return workspaceConfig;
  const objects = listObjects(workspaceConfig);
  return {
    ...workspaceConfig,
    dataModel: {
      ...workspaceConfig.dataModel,
      objects: objects.map((object) => {
        if (object?.id !== NAV_FOLDERS_OBJECT_ID) return object;
        return {
          ...object,
          rows: (Array.isArray(object.rows) ? object.rows : []).map((folder) => ({
            ...folder,
            items: (Array.isArray(folder?.items) ? folder.items : []).filter(
              (item) => !(item?.type === "workflow" && String(item?.objectId || "") === objectId && String(item?.rowId || "") === rowId)
            )
          }))
        };
      })
    }
  };
}

function clearBrokenRegistryReferences(workspaceConfig, integrationId) {
  const id = String(integrationId || "").trim();
  if (!id) return workspaceConfig;
  const objects = listObjects(workspaceConfig);
  return {
    ...workspaceConfig,
    dataModel: {
      ...workspaceConfig.dataModel,
      objects: objects.map((object) => {
        const rows = Array.isArray(object?.rows) ? object.rows : [];
        const nextRows = rows.map((row) => {
          const next = { ...row };
          if (object.objectType === "data-source" && String(row?.registryId || "").trim() === id) {
            next.registryId = "";
            next.status = "orphaned";
          }
          if (object.objectType === "sandbox-environment" && String(row?.schedulerRegistryId || "").trim() === id) {
            next.schedulerRegistryId = "";
          }
          if (object.objectType === "sandbox-environment") {
            for (const field of ["orchestrationConfig", "orchestrationGraph", "orchestrationDraftConfig", "orchestrationDraftGraph"]) {
              if (!row?.[field]) continue;
              const graph = parseOrchestrationGraph(row[field]);
              if (!graph?.nodes?.length) continue;
              let touched = false;
              const nodes = graph.nodes.map((node) => {
                const nodeRegistry = String(node?.config?.registryId || node?.config?.integrationId || "").trim();
                if (nodeRegistry !== id) return node;
                touched = true;
                return {
                  ...node,
                  config: { ...(node.config || {}), registryId: "", integrationId: "" }
                };
              });
              if (touched) {
                next[field] = JSON.stringify({ ...graph, nodes });
              }
            }
          }
          return next;
        });
        return { ...object, rows: nextRows };
      })
    }
  };
}

/**
 * Delete a table row with governed cascade: config patch + sidecar key list.
 */
function deleteTableRowWithCascade(workspaceConfig, table, rowIndex) {
  const impact = computeRowDeleteImpact(workspaceConfig, table, rowIndex);
  const row = table.rows[rowIndex];
  let nextConfig = deleteTableRow(workspaceConfig, table, rowIndex);

  if (table.objectType === "api-registry") {
    const integrationId = String(row?.integrationId || row?.id || row?.Name || "").trim();
    nextConfig = clearBrokenRegistryReferences(nextConfig, integrationId);
  }

  if (table.objectType === "sandbox-environment") {
    const objectId = String(table.objectId || table.id || "").trim();
    const rowId = sandboxRowId(row);
    nextConfig = removeNavFolderShortcuts(nextConfig, objectId, rowId);
  }

  return {
    workspaceConfig: nextConfig,
    impact
  };
}

function pruneSourceRecordKeys(allRecords, keys) {
  if (!allRecords || typeof allRecords !== "object" || Array.isArray(allRecords)) {
    return {};
  }
  const next = { ...allRecords };
  for (const key of keys || []) {
    if (key && Object.prototype.hasOwnProperty.call(next, key)) {
      delete next[key];
    }
  }
  return next;
}

export {
  NAV_FOLDERS_OBJECT_ID,
  clearBrokenRegistryReferences,
  computeRowDeleteImpact,
  deleteTableRowWithCascade,
  pruneSourceRecordKeys,
  removeNavFolderShortcuts,
  scanRegistryReferences
};
