/**
 * CRM Settings Mirror — workspace helpers (ensure object, read snapshot).
 * Phase 3 background agent imports this module; Phase 1 stabilizes the contract.
 */

import {
  CRM_SETTINGS_LABEL,
  CRM_SETTINGS_OBJECT_ID,
  CRM_SETTINGS_OBJECT_TYPE,
  CRM_SETTINGS_ROW_COLUMNS,
  buildCrmSettingsSnapshot,
  defaultCrmSettingsRows,
  normalizeCrmSettingsRows
} from "./crm-settings-mirror-contract.js";

function normalizeManualObjects(workspaceConfig) {
  const dm = workspaceConfig?.dataModel;
  if (!dm || typeof dm !== "object" || Array.isArray(dm)) return [];
  return Array.isArray(dm.objects) ? dm.objects : [];
}

function ensureCrmSettingsMirrorObject(workspaceConfig) {
  const objects = normalizeManualObjects(workspaceConfig).slice();
  const idx = objects.findIndex((o) => o?.id === CRM_SETTINGS_OBJECT_ID);
  if (idx >= 0) {
    const existing = objects[idx];
    const rows = normalizeCrmSettingsRows(existing.rows);
    if (rows.length >= 20) {
      objects[idx] = {
        ...existing,
        objectType: CRM_SETTINGS_OBJECT_TYPE,
        columns: CRM_SETTINGS_ROW_COLUMNS,
        rows
      };
    } else {
      objects[idx] = {
        ...existing,
        objectType: CRM_SETTINGS_OBJECT_TYPE,
        columns: CRM_SETTINGS_ROW_COLUMNS,
        rows: normalizeCrmSettingsRows([...(existing.rows || []), ...defaultCrmSettingsRows()])
      };
    }
    return { ...workspaceConfig, dataModel: { ...workspaceConfig.dataModel, objects } };
  }
  const seeded = {
    id: CRM_SETTINGS_OBJECT_ID,
    label: CRM_SETTINGS_LABEL,
    source: CRM_SETTINGS_LABEL,
    objectType: CRM_SETTINGS_OBJECT_TYPE,
    icon: "SlidersHorizontal",
    pickerHidden: true,
    columns: CRM_SETTINGS_ROW_COLUMNS,
    rows: defaultCrmSettingsRows(),
    binding: { mode: "manual", source: CRM_SETTINGS_LABEL }
  };
  return {
    ...workspaceConfig,
    dataModel: {
      ...(workspaceConfig.dataModel && typeof workspaceConfig.dataModel === "object" ? workspaceConfig.dataModel : {}),
      objects: [...objects, seeded]
    }
  };
}

function getCrmSettingsMirrorObject(workspaceConfig) {
  return normalizeManualObjects(workspaceConfig).find((o) => o?.id === CRM_SETTINGS_OBJECT_ID) || null;
}

function readCrmSettingsSnapshot(workspaceConfig) {
  const object = getCrmSettingsMirrorObject(workspaceConfig);
  return buildCrmSettingsSnapshot(object?.rows);
}

function writeCrmSettingsRows(workspaceConfig, rows) {
  const withObject = ensureCrmSettingsMirrorObject(workspaceConfig);
  const dm = withObject.dataModel;
  const objects = dm.objects.slice();
  const idx = objects.findIndex((o) => o?.id === CRM_SETTINGS_OBJECT_ID);
  if (idx === -1) return withObject;
  objects[idx] = {
    ...objects[idx],
    rows: normalizeCrmSettingsRows(rows)
  };
  return { ...withObject, dataModel: { ...dm, objects } };
}

export {
  CRM_SETTINGS_OBJECT_ID,
  ensureCrmSettingsMirrorObject,
  getCrmSettingsMirrorObject,
  readCrmSettingsSnapshot,
  writeCrmSettingsRows
};
