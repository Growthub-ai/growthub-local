/**
 * Workspace Helper Apply — governed mutation layer.
 *
 * Takes accepted WorkspaceHelperProposal objects from the query step and
 * applies them to the live workspace config via the existing PATCH allowlist.
 *
 * Every accepted proposal writes a durable receipt. The receipts feed the
 * fine-tune loop: accepted workspace-building traces are the highest-weight
 * training signal for future distillation.
 *
 * Public functions:
 *
 *   applyProposalToConfig(currentConfig, proposal)
 *     Merge a single proposal payload into the relevant config section.
 *     Returns the updated config object (immutable — never mutates in place).
 *
 *   validateProposalForApply(proposal, currentConfig)
 *     Pre-apply guard: validates the merged result with validateWorkspaceConfig
 *     before any write. Returns { ok: boolean, error?: string }.
 *
 *   buildApplyReceipt(proposal, appliedAt, reviewedBy, sessionId)
 *     Builds the durable receipt object for trace.jsonl + source-records.
 *
 * Boundary:
 *   - Never writes to disk directly. Callers (the apply route) call
 *     writeWorkspaceConfig() after all proposals pass validation.
 *   - The PATCH allowlist (dashboards, widgetTypes, canvas, dataModel) is the
 *     hard ceiling. Any proposal with an unknown affectedField is rejected.
 */

import {
  CRM_SETTINGS_LABEL,
  CRM_SETTINGS_MIRROR_COLUMNS,
  CRM_SETTINGS_OBJECT_ID,
  CRM_SETTINGS_ROW_ID,
  buildDefaultCrmSettingsMirrorRow,
  normalizeCrmSettingsMirrorRow
} from "@/lib/data-model/crm-settings-contract";
import { validateWorkspaceConfig } from "@/lib/workspace-schema";

const ALLOWED_PATCH_FIELDS = new Set(["dashboards", "widgetTypes", "canvas", "dataModel"]);

// Re-declared locally so the apply layer stays leaf-agnostic and does not
// pull from workspace-helper.js's runtime exports. Must stay in sync with
// the same mapping in lib/workspace-helper.js and packages/api-contract.
const PROPOSAL_TYPE_TO_PATCH_FIELD = {
  "dashboard.create": "dashboards",
  "dashboard.update": "dashboards",
  "widgetType.bind": "widgetTypes",
  "canvas.widget.add": "canvas",
  "canvas.tab.create": "canvas",
  "dataModel.object.create": "dataModel",
  "dataModel.object.update": "dataModel",
  "dataModel.row.add": "dataModel",
  "repair.binding": "dataModel",
  "explain.object": "dataModel",
};

/**
 * Merge a proposal payload into the relevant section of currentConfig.
 * Returns a new config object — does not mutate.
 */
function applyProposalToConfig(currentConfig, proposal) {
  const field = proposal.affectedField;
  if (!ALLOWED_PATCH_FIELDS.has(field)) {
    throw new Error(`proposal affectedField "${field}" is not in the PATCH allowlist`);
  }

  const config = { ...currentConfig };

  switch (proposal.type) {
    case "dashboard.create": {
      const existing = Array.isArray(config.dashboards) ? config.dashboards : [];
      const newDash = {
        id: proposal.payload.id || `dash-${Date.now().toString(36)}`,
        name: proposal.payload.name || "Untitled Dashboard",
        status: proposal.payload.status || "draft",
        createdBy: proposal.payload.createdBy || "workspace-helper",
        updatedAt: new Date().toISOString(),
        ...(proposal.payload.tabs ? { tabs: proposal.payload.tabs } : {}),
        ...(proposal.payload.activeTabId ? { activeTabId: proposal.payload.activeTabId } : {}),
      };
      config.dashboards = [...existing, newDash];
      break;
    }

    case "dashboard.update": {
      const existing = Array.isArray(config.dashboards) ? config.dashboards : [];
      const targetId = proposal.payload.id;
      if (!targetId) throw new Error("dashboard.update requires payload.id");
      if (!existing.some((d) => d.id === targetId)) {
        throw new Error(`dashboard.update target dashboard "${targetId}" not found`);
      }
      config.dashboards = existing.map((d) =>
        d.id === targetId
          ? { ...d, ...proposal.payload, updatedAt: new Date().toISOString() }
          : d
      );
      break;
    }

    case "widgetType.bind": {
      const existing = Array.isArray(config.widgetTypes) ? config.widgetTypes : [];
      const newKind = proposal.payload.kind;
      if (!newKind) throw new Error("widgetType.bind requires payload.kind");
      const alreadyExists = existing.some((w) => w.kind === newKind);
      if (alreadyExists) {
        config.widgetTypes = existing.map((w) =>
          w.kind === newKind ? { ...w, ...proposal.payload } : w
        );
      } else {
        config.widgetTypes = [...existing, { kind: newKind, label: proposal.payload.label || newKind, icon: proposal.payload.icon || newKind[0].toUpperCase() }];
      }
      break;
    }

    case "canvas.widget.add": {
      const canvas = config.canvas ? { ...config.canvas } : {};
      const widgets = Array.isArray(canvas.widgets) ? [...canvas.widgets] : [];
      // Normalize either grammar — canonical {x,y,w,h} OR helper-spoken
      // {col,row,width,height}/{layout:{...}} — into the validator-expected
      // `position: {x, y, w, h}`. Also auto-pack to the first non-colliding
      // slot when the helper doesn't pick one so the widget actually lands
      // instead of hard-colliding at 0:0 with whatever existed first.
      const pl = proposal.payload || {};
      const layoutSrc = pl.position || pl.layout || pl;
      let pos = {
        x: Number.isFinite(layoutSrc.x) ? layoutSrc.x
          : Number.isFinite(layoutSrc.col) ? layoutSrc.col : undefined,
        y: Number.isFinite(layoutSrc.y) ? layoutSrc.y
          : Number.isFinite(layoutSrc.row) ? layoutSrc.row : undefined,
        w: Number.isFinite(layoutSrc.w) ? layoutSrc.w
          : Number.isFinite(layoutSrc.width) ? layoutSrc.width : 6,
        h: Number.isFinite(layoutSrc.h) ? layoutSrc.h
          : Number.isFinite(layoutSrc.height) ? layoutSrc.height : 4,
      };
      if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
        // Auto-pack: scan grid (12 cols × 16 rows) row-by-row for the first
        // empty rectangle of size w×h that doesn't overlap an existing widget.
        const GRID_COLS = 12;
        const GRID_ROWS = 16;
        const occupied = new Set();
        for (const w of widgets) {
          const p = w?.position;
          if (!p) continue;
          for (let dx = 0; dx < (p.w || 0); dx += 1) {
            for (let dy = 0; dy < (p.h || 0); dy += 1) {
              occupied.add(`${p.x + dx}:${p.y + dy}`);
            }
          }
        }
        const fits = (x, y) => {
          if (x + pos.w > GRID_COLS) return false;
          if (y + pos.h > GRID_ROWS) return false;
          for (let dx = 0; dx < pos.w; dx += 1) {
            for (let dy = 0; dy < pos.h; dy += 1) {
              if (occupied.has(`${x + dx}:${y + dy}`)) return false;
            }
          }
          return true;
        };
        outer: for (let y = 0; y < GRID_ROWS; y += 1) {
          for (let x = 0; x <= GRID_COLS - pos.w; x += 1) {
            if (fits(x, y)) { pos = { ...pos, x, y }; break outer; }
          }
        }
        if (!Number.isFinite(pos.x)) { pos.x = 0; pos.y = 0; }
      }
      // Bind the widget to a Data Model object. The kit's view/chart
      // widgets read their data INLINE from `config.source` (label),
      // `config.columns`, and `config.rows` (see lib/workspace-data-model.js
      // deriveWidgetTable). They do NOT dynamically resolve a runtime
      // `sourceObjectId` reference. So to make a widget actually render
      // real data the moment it lands, we SNAPSHOT the bound object's
      // columns + rows into the widget config at apply time. The top-level
      // `sourceObjectId` is preserved as provenance so the helper / future
      // refresh action can re-pull, and so listWorkspaceDataModelTables
      // can attribute widgetRefs back to the source object.
      const sourceObjectId = pl.sourceObjectId || pl.objectId || null;
      const incomingConfig = pl.config || {};
      let injectedConfig = incomingConfig;
      if (sourceObjectId) {
        const dmObj = (config.dataModel?.objects || []).find((o) => o?.id === sourceObjectId);
        if (dmObj) {
          const requestedCols = Array.isArray(incomingConfig.columns) && incomingConfig.columns.length
            ? incomingConfig.columns
            : (Array.isArray(dmObj.columns) ? dmObj.columns : []);
          const objectRows = Array.isArray(dmObj.rows) ? dmObj.rows : [];
          injectedConfig = {
            ...incomingConfig,
            source: incomingConfig.source || dmObj.label || dmObj.source || sourceObjectId,
            columns: requestedCols,
            rows: objectRows,
          };
        }
      }
      const newWidget = {
        id: pl.id || `widget-${Date.now().toString(36)}`,
        kind: pl.kind || "view",
        title: pl.title || "Untitled Widget",
        position: pos,
        config: injectedConfig,
        ...(sourceObjectId ? { sourceObjectId } : {}),
      };
      canvas.widgets = [...widgets, newWidget];
      config.canvas = canvas;
      break;
    }

    case "canvas.tab.create": {
      const canvas = config.canvas ? { ...config.canvas } : {};
      const tabs = Array.isArray(canvas.tabs) ? [...canvas.tabs] : [];
      const newTab = {
        id: proposal.payload.id || `tab-${Date.now().toString(36)}`,
        name: proposal.payload.name || "New Tab",
        widgets: Array.isArray(proposal.payload.widgets) ? proposal.payload.widgets : [],
      };
      canvas.tabs = [...tabs, newTab];
      if (!canvas.activeTabId) canvas.activeTabId = newTab.id;
      config.canvas = canvas;
      break;
    }

    case "dataModel.object.create": {
      const dm = config.dataModel ? { ...config.dataModel } : {};
      const objects = Array.isArray(dm.objects) ? [...dm.objects] : [];
      const newObj = {
        id: proposal.payload.id || `obj-${Date.now().toString(36)}`,
        label: proposal.payload.label || "Untitled Object",
        objectType: proposal.payload.objectType || "custom",
        columns: Array.isArray(proposal.payload.columns) ? proposal.payload.columns : [],
        rows: [],
        binding: proposal.payload.binding || { mode: "manual", source: "Data Model" },
        ...(proposal.payload.relations ? { relations: proposal.payload.relations } : {}),
        ...(proposal.payload.fieldSettings ? { fieldSettings: proposal.payload.fieldSettings } : {}),
      };
      dm.objects = [...objects, newObj];
      config.dataModel = dm;
      break;
    }

    case "dataModel.object.update": {
      const dm = config.dataModel ? { ...config.dataModel } : {};
      const objects = Array.isArray(dm.objects) ? dm.objects : [];
      const targetId = proposal.payload.id;
      if (!targetId) throw new Error("dataModel.object.update requires payload.id");
      if (!objects.some((obj) => obj.id === targetId)) {
        throw new Error(`dataModel.object.update target object "${targetId}" not found`);
      }
      dm.objects = objects.map((obj) =>
        obj.id === targetId
          ? {
              ...obj,
              ...proposal.payload,
              rows: Array.isArray(obj.rows) ? obj.rows : [],
            }
          : obj
      );
      config.dataModel = dm;
      break;
    }

    case "dataModel.row.add": {
      const dm = config.dataModel ? { ...config.dataModel } : {};
      const objects = Array.isArray(dm.objects) ? dm.objects : [];
      const targetId = proposal.payload.objectId;
      if (!targetId) throw new Error("dataModel.row.add requires payload.objectId");
      if (!objects.some((obj) => obj.id === targetId)) {
        throw new Error(`dataModel.row.add target object "${targetId}" not found`);
      }
      const newRow = proposal.payload.row || {};
      dm.objects = objects.map((obj) =>
        obj.id === targetId
          ? { ...obj, rows: [...(Array.isArray(obj.rows) ? obj.rows : []), newRow] }
          : obj
      );
      config.dataModel = dm;
      break;
    }

    case "repair.binding": {
      const dm = config.dataModel ? { ...config.dataModel } : {};
      const objects = Array.isArray(dm.objects) ? dm.objects : [];
      const targetId = proposal.payload.objectId;
      if (!targetId) throw new Error("repair.binding requires payload.objectId");
      if (!objects.some((obj) => obj.id === targetId)) {
        throw new Error(`repair.binding target object "${targetId}" not found`);
      }
      dm.objects = objects.map((obj) =>
        obj.id === targetId
          ? { ...obj, binding: { ...obj.binding, ...proposal.payload.binding } }
          : obj
      );
      config.dataModel = dm;
      break;
    }

    case "explain.object":
      // explain proposals carry no mutation — they are informational only
      break;

    default:
      throw new Error(`unknown proposal type: ${proposal.type}`);
  }

  return config;
}

/**
 * Validate a proposal before applying. Returns { ok, error? }.
 * Merges the proposal into a copy of currentConfig and runs validateWorkspaceConfig.
 */
function validateProposalForApply(proposal, currentConfig) {
  if (!ALLOWED_PATCH_FIELDS.has(proposal.affectedField)) {
    return {
      ok: false,
      error: `affectedField "${proposal.affectedField}" is not in the PATCH allowlist`,
    };
  }

  const expectedField = PROPOSAL_TYPE_TO_PATCH_FIELD[proposal.type];
  if (expectedField && proposal.affectedField !== expectedField) {
    return {
      ok: false,
      error: `proposal type "${proposal.type}" requires affectedField "${expectedField}", got "${proposal.affectedField}"`,
    };
  }

  if (proposal.type === "explain.object") {
    return { ok: true };
  }

  let merged;
  try {
    merged = applyProposalToConfig(currentConfig, proposal);
  } catch (err) {
    return { ok: false, error: err.message || "failed to merge proposal" };
  }

  const patchFragment = {};
  patchFragment[proposal.affectedField] = merged[proposal.affectedField];

  try {
    validateWorkspaceConfig(patchFragment);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: Array.isArray(err.details) ? err.details.join("; ") : (err.message || "invalid proposal payload"),
    };
  }
}

/**
 * Build a durable apply receipt for source-records and trace.jsonl.
 */
function buildApplyReceipt(proposal, appliedAt, reviewedBy, sessionId) {
  const ts = appliedAt || new Date().toISOString();
  return {
    type: proposal.type,
    affectedField: proposal.affectedField,
    rationale: proposal.rationale,
    confidence: proposal.confidence,
    appliedAt: ts,
    ranAt: ts,
    reviewedBy: reviewedBy || "user",
    sessionId: sessionId || null,
  };
}

/**
 * Threads — governed conversation history compounded onto an EXISTING
 * custom-typed Data Model object.
 *
 * There is no new object type, no new schema namespace, no parallel chat
 * store, and no separate AI memory layer. Each helper turn upserts one
 * row inside a single custom-typed object identified by the well-known
 * id "helper-threads". The row is structurally identical to any other
 * row in dataModel.objects[]: it persists in growthub.config.json, is
 * validated by validateWorkspaceConfig on write, ships into the exported
 * runtime, and survives redeploy. The user can rename the label, add
 * fields, or delete the object entirely — the helper will re-seed it on
 * the next turn if missing.
 *
 * The legacy source-records audit trail (helper:<intent>:<runId>,
 * helper:apply:receipts) is preserved as-is and remains the long-tail
 * signal for the distillation pipeline.
 */

const HELPER_THREADS_OBJECT_ID = "helper-threads";
const HELPER_THREADS_LABEL = "Helper Threads";

function ensureHelperThreadsObject(config) {
  const dm = config?.dataModel && typeof config.dataModel === "object" ? config.dataModel : {};
  const objects = Array.isArray(dm.objects) ? dm.objects.slice() : [];
  const idx = objects.findIndex((o) => o?.id === HELPER_THREADS_OBJECT_ID);
  if (idx >= 0) {
    // Ensure rows is an array; never overwrite an existing object's fields.
    const existing = objects[idx];
    if (!Array.isArray(existing.rows)) {
      objects[idx] = { ...existing, rows: [] };
    }
    return { ...config, dataModel: { ...dm, objects } };
  }
  // Helper Threads is a normal custom-typed governed object. Identity
  // stays stable through the well-known id "helper-threads" so the cell
  // renderer in DataModelShell can opt the "open" column into the Reopen
  // hyperlink without inventing a new object type.
  const seeded = {
    id: HELPER_THREADS_OBJECT_ID,
    label: HELPER_THREADS_LABEL,
    source: HELPER_THREADS_LABEL,
    objectType: "custom",
    icon: "MessageSquare",
    columns: ["title", "intent", "model", "applied", "skipped", "updatedAt", "open"],
    rows: [],
    binding: { mode: "manual", source: HELPER_THREADS_LABEL },
  };
  return { ...config, dataModel: { ...dm, objects: [...objects, seeded] } };
}

function truncateTitle(prompt, max = 72) {
  const text = String(prompt || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Upsert a thread row into the Helper Threads governed object.
 * If a row with matching id exists, merge fields onto it.
 * If not, append a new row.
 *
 * Returns the updated config. Caller writes via writeWorkspaceConfig.
 */
function upsertHelperThreadRow(config, threadPatch) {
  if (!threadPatch || typeof threadPatch !== "object" || !threadPatch.id) {
    throw new Error("upsertHelperThreadRow requires a thread patch with an id");
  }
  const withObject = ensureHelperThreadsObject(config);
  const dm = withObject.dataModel;
  const objects = dm.objects.slice();
  const idx = objects.findIndex((o) => o?.id === HELPER_THREADS_OBJECT_ID);
  if (idx === -1) {
    // Should be impossible after ensureHelperThreadsObject.
    return withObject;
  }
  const obj = objects[idx];
  const rows = Array.isArray(obj.rows) ? obj.rows.slice() : [];
  const rowIdx = rows.findIndex((r) => r && r.id === threadPatch.id);
  const nowIso = threadPatch.updatedAt || new Date().toISOString();
  const merged = {
    ...(rowIdx >= 0 ? rows[rowIdx] : {}),
    ...threadPatch,
    updatedAt: nowIso,
    open: "Reopen", // display-only string; the cell renderer turns it into a link
  };
  if (rowIdx >= 0) {
    rows[rowIdx] = merged;
  } else {
    rows.push(merged);
  }
  // Cap thread history so the config file does not grow unbounded.
  const capped = rows.length > 100 ? rows.slice(-100) : rows;
  objects[idx] = { ...obj, rows: capped };
  return { ...withObject, dataModel: { ...dm, objects } };
}

function nextThreadId() {
  return `thr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Custom Folders Navigation — governed end-user organization layer.
 *
 * Same well-known custom-typed Data Model object pattern as
 * `helper-threads`: one object (id = "nav-folders") whose `rows[]` carry
 * the user's folder structure. Each row is a folder. Folder items
 * (dashboard links, lightweight views of governed objects) are nested
 * inside the row as a JSON-serialisable `items[]` array.
 *
 * Persists through the existing PATCH allowlist on `/api/workspace`
 * (`dataModel`), is round-trip validated by `validateWorkspaceConfig`,
 * is hidden from the user-facing Data Model picker via
 * `HIDDEN_HELPER_OBJECT_IDS` in `lib/workspace-data-model.js`, and is
 * fully backwards compatible — if the object is missing the rail simply
 * shows zero folders and the user can add one with the `+` button.
 *
 * Row shape (validated in `lib/workspace-schema.js`):
 *
 *   {
 *     id: "fld_…",
 *     name: "Sales Pipeline",
 *     order: 0,
 *     collapsed: false,
 *     items: [
 *       { id: "item_…", type: "dashboard", refId: "dash-abc",
 *         label: "Revenue Overview" },
 *       { id: "item_…", type: "view", objectId: "prospects",
 *         label: "Active Prospects",
 *         viewConfig: { columns: [...], filters: [...], sort: {...} } }
 *     ]
 *   }
 */

const NAV_FOLDERS_OBJECT_ID = "nav-folders";
const NAV_FOLDERS_LABEL = "Custom Folders";
const NAV_FOLDER_NAME_MAX = 60;
const NAV_ITEM_LABEL_MAX = 80;
const NAV_ITEM_TYPES = new Set(["dashboard", "view"]);

function ensureNavFoldersObject(config) {
  const dm = config?.dataModel && typeof config.dataModel === "object" ? config.dataModel : {};
  const objects = Array.isArray(dm.objects) ? dm.objects.slice() : [];
  const idx = objects.findIndex((o) => o?.id === NAV_FOLDERS_OBJECT_ID);
  if (idx >= 0) {
    const existing = objects[idx];
    if (!Array.isArray(existing.rows)) {
      objects[idx] = { ...existing, rows: [] };
    }
    return { ...config, dataModel: { ...dm, objects } };
  }
  const seeded = {
    id: NAV_FOLDERS_OBJECT_ID,
    label: NAV_FOLDERS_LABEL,
    source: NAV_FOLDERS_LABEL,
    objectType: "custom",
    icon: "Folder",
    columns: ["name", "order", "collapsed", "items"],
    rows: [],
    binding: { mode: "manual", source: NAV_FOLDERS_LABEL },
  };
  return { ...config, dataModel: { ...dm, objects: [...objects, seeded] } };
}

function nextNavFolderId() {
  return `fld_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function nextNavItemId() {
  return `item_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function getNavFolderRows(config) {
  const obj = (config?.dataModel?.objects || []).find((o) => o?.id === NAV_FOLDERS_OBJECT_ID);
  return Array.isArray(obj?.rows) ? obj.rows : [];
}

function writeNavFolderRows(config, rows) {
  const withObject = ensureNavFoldersObject(config);
  const dm = withObject.dataModel;
  const objects = dm.objects.slice();
  const idx = objects.findIndex((o) => o?.id === NAV_FOLDERS_OBJECT_ID);
  if (idx === -1) return withObject;
  objects[idx] = { ...objects[idx], rows: rows.map((row, i) => ({ ...row, order: i })) };
  return { ...withObject, dataModel: { ...dm, objects } };
}

/**
 * CRM Settings Mirror — singleton governed object (Phase 1 contract).
 * Same PATCH / validate path as nav-folders; hidden from Data Model picker.
 */
function ensureCrmSettingsObject(config) {
  const dm = config?.dataModel && typeof config.dataModel === "object" ? config.dataModel : {};
  const objects = Array.isArray(dm.objects) ? dm.objects.slice() : [];
  const idx = objects.findIndex((o) => o?.id === CRM_SETTINGS_OBJECT_ID);
  if (idx >= 0) {
    const existing = objects[idx];
    const rows = Array.isArray(existing.rows) ? existing.rows : [];
    if (rows.length === 0) {
      objects[idx] = { ...existing, rows: [buildDefaultCrmSettingsMirrorRow()] };
    }
    return { ...config, dataModel: { ...dm, objects } };
  }
  const seeded = {
    id: CRM_SETTINGS_OBJECT_ID,
    label: CRM_SETTINGS_LABEL,
    source: CRM_SETTINGS_LABEL,
    objectType: "crm-settings",
    icon: "SlidersHorizontal",
    pickerHidden: true,
    columns: [...CRM_SETTINGS_MIRROR_COLUMNS],
    rows: [buildDefaultCrmSettingsMirrorRow()],
    binding: { mode: "manual", source: CRM_SETTINGS_LABEL }
  };
  return { ...config, dataModel: { ...dm, objects: [...objects, seeded] } };
}

function getCrmSettingsMirrorRow(config) {
  const obj = (config?.dataModel?.objects || []).find((o) => o?.id === CRM_SETTINGS_OBJECT_ID);
  const row = Array.isArray(obj?.rows) ? obj.rows.find((r) => r?.id === CRM_SETTINGS_ROW_ID) : null;
  return row ? normalizeCrmSettingsMirrorRow(row) : buildDefaultCrmSettingsMirrorRow();
}

function writeCrmSettingsMirrorRow(config, partialRow) {
  const withObject = ensureCrmSettingsObject(config);
  const dm = withObject.dataModel;
  const objects = dm.objects.slice();
  const idx = objects.findIndex((o) => o?.id === CRM_SETTINGS_OBJECT_ID);
  if (idx === -1) return withObject;
  const nextRow = normalizeCrmSettingsMirrorRow({
    ...getCrmSettingsMirrorRow(withObject),
    ...partialRow,
    id: CRM_SETTINGS_ROW_ID
  });
  objects[idx] = { ...objects[idx], rows: [nextRow] };
  return { ...withObject, dataModel: { ...dm, objects } };
}

export {
  applyProposalToConfig,
  validateProposalForApply,
  buildApplyReceipt,
  ensureHelperThreadsObject,
  upsertHelperThreadRow,
  nextThreadId,
  HELPER_THREADS_OBJECT_ID,
  ALLOWED_PATCH_FIELDS,
  NAV_FOLDERS_OBJECT_ID,
  NAV_FOLDERS_LABEL,
  NAV_FOLDER_NAME_MAX,
  NAV_ITEM_LABEL_MAX,
  NAV_ITEM_TYPES,
  ensureNavFoldersObject,
  nextNavFolderId,
  nextNavItemId,
  getNavFolderRows,
  writeNavFolderRows,
  CRM_SETTINGS_OBJECT_ID,
  CRM_SETTINGS_LABEL,
  ensureCrmSettingsObject,
  getCrmSettingsMirrorRow,
  writeCrmSettingsMirrorRow,
};
