/**
 * Governed delete lifecycle — impact preview, config cascade, sidecar key collection.
 * Pure functions; sidecar writes happen via POST /api/workspace/cleanup-sidecar.
 */

import { deleteTableRow, sandboxRunSourceId } from "./workspace-data-model.js";
import { sandboxRowId } from "./nav-workflows.js";

const NAV_FOLDERS_OBJECT_ID = "nav-folders";

function safeString(value) {
  return String(value ?? "").trim();
}

function collectRowIdentifiers(table, row) {
  const objectId = safeString(table?.objectId);
  const objectType = safeString(table?.objectType);
  const integrationId = safeString(row?.integrationId);
  const name = safeString(row?.Name || row?.name);
  const rowId = objectType === "sandbox-environment" ? sandboxRowId(row) : integrationId || name;
  const sidecarKey = objectType === "sandbox-environment" && objectId && name
    ? sandboxRunSourceId(objectId, name)
    : null;
  return { objectId, objectType, integrationId, name, rowId, sidecarKey };
}

function scanDeleteImpacts(workspaceConfig, table, row) {
  const impacts = [];
  const { objectId, objectType, integrationId, name, rowId, sidecarKey } = collectRowIdentifiers(table, row);
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];

  if (sidecarKey) {
    impacts.push({ kind: "sidecar", label: `Run history key ${sidecarKey}` });
  }

  if (objectType === "api-registry" && integrationId) {
    for (const object of objects) {
      const rows = Array.isArray(object?.rows) ? object.rows : [];
      for (const target of rows) {
        if (safeString(target?.registryId) === integrationId) {
          impacts.push({
            kind: "fk-registryId",
            label: `Data Source registryId → ${integrationId}`,
            objectId: object.id,
            field: "registryId"
          });
        }
        if (safeString(target?.schedulerRegistryId) === integrationId) {
          impacts.push({
            kind: "fk-schedulerRegistryId",
            label: `Sandbox schedulerRegistryId → ${integrationId}`,
            objectId: object.id,
            field: "schedulerRegistryId"
          });
        }
        if (safeString(target?.authRef) === integrationId) {
          impacts.push({
            kind: "fk-authRef",
            label: `authRef → ${integrationId}`,
            objectId: object.id,
            field: "authRef"
          });
        }
      }
    }
  }

  if (objectType === "sandbox-environment" && objectId && rowId) {
    const navObject = objects.find((o) => o?.id === NAV_FOLDERS_OBJECT_ID);
    const navRows = Array.isArray(navObject?.rows) ? navObject.rows : [];
    for (const folder of navRows) {
      const items = Array.isArray(folder?.items) ? folder.items : [];
      for (const item of items) {
        if (item?.type === "workflow" && safeString(item?.objectId) === objectId && safeString(item?.rowId) === rowId) {
          impacts.push({
            kind: "nav-workflow",
            label: `Nav shortcut "${safeString(item?.label) || rowId}" in folder ${safeString(folder?.label || folder?.name || folder?.id)}`
          });
        }
      }
    }
  }

  const widgets = Array.isArray(workspaceConfig?.canvas?.widgets) ? workspaceConfig.canvas.widgets : [];
  for (const widget of widgets) {
    const sourceId = safeString(widget?.binding?.sourceId);
    if (sourceId && (sourceId === integrationId || sourceId === name || sourceId === sidecarKey)) {
      impacts.push({ kind: "widget-binding", label: `Widget "${safeString(widget?.title || widget?.id)}" binding.sourceId` });
    }
  }

  if (!integrationId && !name && !rowId) {
    impacts.push({ kind: "unknown", label: "Row has no stable identifier — sidecar cleanup may be incomplete" });
  }

  return impacts;
}

function previewDeleteRowsImpact(workspaceConfig, table, rowIndexes) {
  const indexes = [...new Set(rowIndexes)].filter((index) => Number.isInteger(index) && index >= 0);
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  const rowImpacts = indexes
    .filter((index) => rows[index])
    .map((index) => ({
      rowIndex: index,
      rowLabel: safeString(rows[index]?.Name || rows[index]?.integrationId || rows[index]?.id || `row ${index + 1}`),
      impacts: scanDeleteImpacts(workspaceConfig, table, rows[index])
    }));

  const allImpacts = rowImpacts.flatMap((entry) => entry.impacts);
  const sidecarKeys = rowImpacts
    .map((entry) => {
      const { sidecarKey } = collectRowIdentifiers(table, rows[entry.rowIndex]);
      return sidecarKey;
    })
    .filter(Boolean);

  return {
    rowCount: indexes.length,
    rowImpacts,
    impacts: allImpacts,
    sidecarKeys: [...new Set(sidecarKeys)],
    hasBlockingImpacts: allImpacts.some((item) => item.kind === "widget-binding")
  };
}

function clearForeignKeys(workspaceConfig, table, rowIndexes) {
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  const deletedIntegrationIds = new Set();
  const deletedSandboxRefs = [];

  for (const index of rowIndexes) {
    const row = rows[index];
    if (!row) continue;
    const { objectType, integrationId, objectId, rowId } = collectRowIdentifiers(table, row);
    if (objectType === "api-registry" && integrationId) deletedIntegrationIds.add(integrationId);
    if (objectType === "sandbox-environment" && objectId && rowId) {
      deletedSandboxRefs.push({ objectId, rowId });
    }
  }

  if (!deletedIntegrationIds.size && !deletedSandboxRefs.length) return workspaceConfig;

  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const nextObjects = objects.map((object) => {
    let rowsChanged = false;
    const nextRows = (Array.isArray(object?.rows) ? object.rows : []).map((row) => {
      let next = row;
      if (deletedIntegrationIds.has(safeString(row?.registryId))) {
        next = { ...next, registryId: "" };
        rowsChanged = true;
      }
      if (deletedIntegrationIds.has(safeString(row?.schedulerRegistryId))) {
        next = { ...next, schedulerRegistryId: "" };
        rowsChanged = true;
      }
      if (deletedIntegrationIds.has(safeString(row?.authRef))) {
        next = { ...next, authRef: "" };
        rowsChanged = true;
      }
      return next;
    });

    if (object?.id === NAV_FOLDERS_OBJECT_ID && deletedSandboxRefs.length) {
      const prunedRows = nextRows.map((folder) => {
        const items = Array.isArray(folder?.items) ? folder.items : [];
        const nextItems = items.filter((item) => {
          if (item?.type !== "workflow") return true;
          return !deletedSandboxRefs.some(
            (ref) => safeString(item?.objectId) === ref.objectId && safeString(item?.rowId) === ref.rowId
          );
        });
        if (nextItems.length === items.length) return folder;
        rowsChanged = true;
        return { ...folder, items: nextItems };
      });
      return rowsChanged ? { ...object, rows: prunedRows } : object;
    }

    return rowsChanged ? { ...object, rows: nextRows } : object;
  });

  return {
    ...workspaceConfig,
    dataModel: {
      ...workspaceConfig.dataModel,
      objects: nextObjects
    }
  };
}

function deleteTableRowsWithCascade(workspaceConfig, table, rowIndexes) {
  if (!table?.mutable) return workspaceConfig;
  const sorted = [...new Set(rowIndexes)].sort((a, b) => b - a);
  const cleared = clearForeignKeys(workspaceConfig, table, sorted);
  return sorted.reduce((config, rowIndex) => deleteTableRow(config, table, rowIndex), cleared);
}

export {
  NAV_FOLDERS_OBJECT_ID,
  clearForeignKeys,
  deleteTableRowsWithCascade,
  previewDeleteRowsImpact,
  scanDeleteImpacts
};
