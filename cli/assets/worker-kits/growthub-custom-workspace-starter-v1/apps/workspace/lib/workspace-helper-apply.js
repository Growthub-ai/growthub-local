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

import { validateWorkspaceConfig } from "@/lib/workspace-schema";

const ALLOWED_PATCH_FIELDS = new Set(["dashboards", "widgetTypes", "canvas", "dataModel"]);

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
      const newWidget = {
        id: proposal.payload.id || `widget-${Date.now().toString(36)}`,
        kind: proposal.payload.kind || "view",
        title: proposal.payload.title || "Untitled Widget",
        position: proposal.payload.position || { x: 0, y: 0, w: 6, h: 4 },
        config: proposal.payload.config || {},
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

export { applyProposalToConfig, validateProposalForApply, buildApplyReceipt, ALLOWED_PATCH_FIELDS };
