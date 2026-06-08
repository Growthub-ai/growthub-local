/**
 * Governed delete lifecycle — impact preview, config cascade, sidecar key collection.
 * Pure functions; sidecar writes happen via POST /api/workspace/cleanup-sidecar.
 */

import { parseOrchestrationGraph } from "./orchestration-graph.js";
import { sandboxRunSourceId } from "./workspace-data-model.js";

const NAV_FOLDERS_OBJECT_ID = "nav-folders";

function sandboxRowId(row) {
  return String(row?.Name || row?.name || row?.slug || row?.id || "").trim();
}

function rowIdentifier(row, objectType) {
  if (objectType === "api-registry") {
    return String(row?.integrationId || row?.id || row?.Name || "").trim();
  }
  return sandboxRowId(row);
}

function collectRegistryReferences(workspaceConfig, registryId) {
  const impacts = [];
  const id = String(registryId || "").trim();
  if (!id) return impacts;
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  for (const object of objects) {
    const rows = Array.isArray(object.rows) ? object.rows : [];
    rows.forEach((row, rowIndex) => {
      if (object.objectType === "data-source" && String(row?.registryId || "").trim() === id) {
        impacts.push({
          type: "data-source-registryId",
          objectId: object.id,
          objectLabel: object.label || object.source,
          rowIndex,
          rowLabel: String(row?.Name || row?.sourceId || rowIndex),
        });
      }
      if (object.objectType === "sandbox-environment") {
        if (String(row?.schedulerRegistryId || "").trim() === id) {
          impacts.push({
            type: "sandbox-schedulerRegistryId",
            objectId: object.id,
            objectLabel: object.label || object.source,
            rowIndex,
            rowLabel: sandboxRowId(row) || String(rowIndex),
          });
        }
        const graph = parseOrchestrationGraph(row?.orchestrationConfig || row?.orchestrationGraph);
        for (const node of graph?.nodes || []) {
          const nodeRegistry = String(node?.config?.registryId || node?.config?.integrationId || "").trim();
          if (nodeRegistry === id) {
            impacts.push({
              type: "workflow-node-registryId",
              objectId: object.id,
              objectLabel: object.label || object.source,
              rowIndex,
              rowLabel: sandboxRowId(row) || String(rowIndex),
              nodeId: String(node?.id || ""),
            });
          }
        }
      }
    });
  }
  return impacts;
}

function collectNavFolderImpacts(workspaceConfig, objectId, rowId) {
  const impacts = [];
  const navObject = (workspaceConfig?.dataModel?.objects || []).find((o) => o?.id === NAV_FOLDERS_OBJECT_ID);
  if (!navObject) return impacts;
  const folders = Array.isArray(navObject.rows) ? navObject.rows : [];
  for (const folder of folders) {
    const items = Array.isArray(folder?.items) ? folder.items : [];
    for (const item of items) {
      if (item?.type === "workflow" && String(item.objectId) === objectId && String(item.rowId) === rowId) {
        impacts.push({
          type: "nav-folder-workflow",
          folderId: String(folder?.id || folder?.name || ""),
          folderName: String(folder?.name || "Folder"),
          itemLabel: String(item?.label || rowId),
          objectId: String(item.objectId),
          rowId: String(item.rowId),
        });
      }
    }
  }
  return impacts;
}

function collectWidgetBindingImpacts(workspaceConfig, sourceId) {
  const impacts = [];
  const id = String(sourceId || "").trim();
  if (!id) return impacts;
  const widgets = Array.isArray(workspaceConfig?.canvas?.widgets) ? workspaceConfig.canvas.widgets : [];
  for (const widget of widgets) {
    const binding = widget?.config?.binding;
    if (binding?.sourceId === id || binding?.integrationId === id) {
      impacts.push({
        type: "widget-binding",
        widgetId: String(widget?.id || ""),
        widgetKind: String(widget?.kind || widget?.type || ""),
      });
    }
  }
  return impacts;
}

function sidecarKeyForRow(object, row) {
  if (object?.objectType !== "sandbox-environment") return null;
  const objectId = String(object?.id || "").trim();
  const name = sandboxRowId(row);
  return sandboxRunSourceId(objectId, name);
}

/**
 * Compute delete impact for selected row indexes in a table.
 */
function computeDeleteImpact(workspaceConfig, table, rowIndexes) {
  const warnings = [];
  const sidecarKeys = [];
  const fkImpacts = [];
  const navImpacts = [];
  const widgetImpacts = [];

  const rows = Array.isArray(table?.rows) ? table.rows : [];
  const objectType = table?.objectType || "custom";
  const objectId = String(table?.objectId || "").trim();

  for (const rowIndex of rowIndexes) {
    const row = rows[rowIndex];
    if (!row) continue;
    const rowId = rowIdentifier(row, objectType);

    if (objectType === "api-registry" && rowId) {
      fkImpacts.push(...collectRegistryReferences(workspaceConfig, rowId));
    }

    if (objectType === "sandbox-environment" && objectId && rowId) {
      navImpacts.push(...collectNavFolderImpacts(workspaceConfig, objectId, rowId));
      const sidecarKey = sidecarKeyForRow({ id: objectId, objectType }, row);
      if (sidecarKey) sidecarKeys.push(sidecarKey);
    }

    if (objectType === "data-source") {
      const sourceId = String(row?.sourceId || "").trim();
      widgetImpacts.push(...collectWidgetBindingImpacts(workspaceConfig, sourceId));
    }
  }

  const totalImpacts = fkImpacts.length + navImpacts.length + widgetImpacts.length;
  if (totalImpacts > 0) {
    warnings.push(`${totalImpacts} dependent reference(s) will become orphaned unless repaired.`);
  }
  if (sidecarKeys.length > 0) {
    warnings.push(`${sidecarKeys.length} sandbox run history bucket(s) can be pruned from the sidecar.`);
  }

  return {
    rowCount: rowIndexes.length,
    fkImpacts,
    navImpacts,
    widgetImpacts,
    sidecarKeys: [...new Set(sidecarKeys)],
    warnings,
    hasBlockingImpacts: false,
  };
}

function pruneNavFolderItems(workspaceConfig, navImpacts) {
  if (!navImpacts.length) return workspaceConfig;
  const removeSet = new Set(
    navImpacts.map((i) => `${i.objectId}::${i.rowId}`)
  );
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  return {
    ...workspaceConfig,
    dataModel: {
      ...workspaceConfig.dataModel,
      objects: objects.map((object) => {
        if (object?.id !== NAV_FOLDERS_OBJECT_ID) return object;
        return {
          ...object,
          rows: (Array.isArray(object.rows) ? object.rows : []).map((folder) => {
            const items = Array.isArray(folder?.items) ? folder.items : [];
            return {
              ...folder,
              items: items.filter((item) => {
                if (item?.type !== "workflow") return true;
                const key = `${String(item.objectId)}::${String(item.rowId)}`;
                return !removeSet.has(key);
              }),
            };
          }),
        };
      }),
    },
  };
}

/**
 * Apply config mutations after row deletion: prune nav-folders shortcuts.
 */
function applyDeleteCascade(workspaceConfig, impact) {
  let next = workspaceConfig;
  if (impact?.navImpacts?.length) {
    next = pruneNavFolderItems(next, impact.navImpacts);
  }
  return next;
}

export {
  NAV_FOLDERS_OBJECT_ID,
  applyDeleteCascade,
  collectRegistryReferences,
  computeDeleteImpact,
  sidecarKeyForRow,
};
