/**
 * Governed Delete Impact V1 — roadmap Phase 1.4 / 2.6.
 *
 * Pure derivation (no fetch, no fs): given the workspace config, the
 * source-records sidecar map, and a delete target, compute the blast radius
 * BEFORE anything is mutated. The Data Model delete flow renders this as an
 * impact preview; the cleanup-sidecar route consumes `sidecarKeys` to prune
 * orphaned `growthub.source-records.json` buckets after the config PATCH.
 *
 * This never deletes anything itself and never touches secrets. It mirrors the
 * read-only `selectImpactedNodes` warning primitive but is keyed to the four
 * cross-references the topology cares about on delete:
 *
 *   - api-registry row     → data-source `registryId`, sandbox `schedulerRegistryId`
 *   - sandbox row          → `sandbox:<objectId>:<slug>` sidecar key, nav-folders shortcut
 *   - data-source row      → widget bindings, `sourceId` sidecar key
 *   - any object delete    → the union of the above for every row it contains
 *
 * Target shape:
 *   { kind: "object", objectId }
 *   { kind: "row", objectId, objectType, row }   // row = the row object being removed
 */

const NAV_FOLDERS_OBJECT_ID = "nav-folders";

function clean(value) {
  return String(value ?? "").trim();
}

function slugifyName(name) {
  return clean(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function sandboxRunSourceId(objectId, name) {
  const slug = slugifyName(name);
  const id = clean(objectId);
  if (!id || !slug) return null;
  return `sandbox:${id}:${slug}`;
}

function objectsOf(workspaceConfig) {
  return Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
}

function rowsOf(object) {
  return Array.isArray(object?.rows) ? object.rows : [];
}

function objectLabel(object) {
  return clean(object?.label || object?.name || object?.source || object?.id) || clean(object?.id);
}

/** The api-registry identity tokens a row exposes (data-source/sandbox FKs point here). */
function registryIdentities(row) {
  return Array.from(new Set([clean(row?.integrationId), clean(row?.id), clean(row?.Name)].filter(Boolean)));
}

/** Recursively test whether a JSON-ish value references any of the given ids. */
function referencesAnyId(value, ids, depth = 0) {
  if (depth > 6 || value == null) return false;
  if (typeof value === "string") return ids.has(value.trim());
  if (typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => referencesAnyId(item, ids, depth + 1));
  return Object.values(value).some((item) => referencesAnyId(item, ids, depth + 1));
}

/**
 * Sidecar keys that would be orphaned by removing a single row. Keys are
 * *predicted* from the row shape so the cleanup route can prune them even when
 * the browser was not handed the sidecar map; the route's removed/skipped
 * receipt is the source of truth for what actually existed.
 */
function sidecarKeysForRow(objectId, objectType, row) {
  const keys = new Set();
  if (objectType === "sandbox-environment") {
    const key = sandboxRunSourceId(objectId, row?.Name || row?.name);
    if (key) keys.add(key);
    const last = clean(row?.lastSourceId);
    if (last) keys.add(last);
  }
  if (objectType === "data-source") {
    const sourceId = clean(row?.sourceId);
    if (sourceId) keys.add(sourceId);
  }
  return Array.from(keys);
}

/** Collect the rows targeted by a delete operation. */
function targetedRows(workspaceConfig, target) {
  const objectId = clean(target?.objectId);
  const object = objectsOf(workspaceConfig).find((o) => clean(o?.id) === objectId) || null;
  const objectType = clean(object?.objectType) || clean(target?.objectType);
  if (target?.kind === "row") {
    return { object, objectType, rows: target?.row ? [target.row] : [] };
  }
  return { object, objectType, rows: object ? rowsOf(object) : [] };
}

/**
 * Compute the delete impact. Always returns a stable shape; never throws on
 * partial input.
 */
function computeDeleteImpact(workspaceConfig, sourceRecords, target) {
  const result = {
    kind: "growthub-delete-impact-v1",
    target: {
      kind: clean(target?.kind) || "object",
      objectId: clean(target?.objectId),
      objectType: "",
    },
    sidecarKeys: [],
    references: [],
    warnings: [],
    summary: { sidecarKeys: 0, references: 0, widgets: 0 },
  };
  if (!workspaceConfig || typeof workspaceConfig !== "object" || !result.target.objectId) {
    return result;
  }

  const { object, objectType, rows } = targetedRows(workspaceConfig, target);
  result.target.objectType = objectType || "";

  const sidecarKeys = new Set();
  for (const row of rows) {
    for (const key of sidecarKeysForRow(result.target.objectId, objectType, row)) {
      sidecarKeys.add(key);
    }
  }
  // When the caller threads in the live sidecar map, narrow to keys that
  // actually exist so the preview count is honest.
  if (sourceRecords && typeof sourceRecords === "object" && Object.keys(sourceRecords).length) {
    for (const key of Array.from(sidecarKeys)) {
      if (!Object.prototype.hasOwnProperty.call(sourceRecords, key)) sidecarKeys.delete(key);
    }
  }

  const references = [];

  // api-registry → who depends on this registry id?
  if (objectType === "api-registry") {
    const ids = new Set();
    for (const row of rows) for (const id of registryIdentities(row)) ids.add(id);
    if (ids.size) {
      for (const other of objectsOf(workspaceConfig)) {
        const otherType = clean(other?.objectType);
        const field = otherType === "data-source" ? "registryId"
          : otherType === "sandbox-environment" ? "schedulerRegistryId"
          : null;
        if (!field) continue;
        for (const row of rowsOf(other)) {
          if (ids.has(clean(row[field]))) {
            references.push({
              kind: "fk",
              field,
              fromObjectId: clean(other.id),
              fromObjectLabel: objectLabel(other),
              fromObjectType: otherType,
              value: clean(row[field]),
            });
          }
        }
      }
    }
  }

  // sandbox-environment → nav-folders shortcuts that point at the row(s).
  if (objectType === "sandbox-environment") {
    const rowIds = new Set(rows.map((r) => clean(r?.id)).filter(Boolean));
    const nav = objectsOf(workspaceConfig).find((o) => clean(o?.id) === NAV_FOLDERS_OBJECT_ID);
    for (const navRow of rowsOf(nav)) {
      const refObj = clean(navRow?.workflowObjectId || navRow?.objectId);
      const refRow = clean(navRow?.workflowRowId || navRow?.rowId);
      if ((refObj && refObj === result.target.objectId) && (!refRow || rowIds.has(refRow) || target?.kind === "object")) {
        references.push({
          kind: "nav-shortcut",
          field: "workflowRowId",
          fromObjectId: NAV_FOLDERS_OBJECT_ID,
          fromObjectLabel: "Folder navigation",
          fromObjectType: "nav-folders",
          value: refRow || refObj,
        });
      }
    }
  }

  // Widget bindings anywhere in canvas/dashboards referencing the object id.
  let widgetCount = 0;
  const objectIds = new Set([result.target.objectId]);
  const canvasScopes = [workspaceConfig.canvas, workspaceConfig.dashboards];
  for (const scope of canvasScopes) {
    const widgets = collectWidgets(scope);
    for (const widget of widgets) {
      const binding = widget?.config?.binding ?? widget?.binding ?? null;
      if (binding && referencesAnyId(binding, objectIds)) {
        widgetCount += 1;
        references.push({
          kind: "widget-binding",
          field: "binding",
          fromObjectId: clean(widget?.id) || clean(widget?.widgetId),
          fromObjectLabel: clean(widget?.title || widget?.label) || "Widget",
          fromObjectType: "widget",
          value: result.target.objectId,
        });
      }
    }
  }

  if (sidecarKeys.size) {
    result.warnings.push(`${sidecarKeys.size} sidecar run-history bucket(s) will be orphaned and can be pruned.`);
  }
  if (references.length) {
    result.warnings.push(`${references.length} cross-reference(s) point at this ${result.target.kind}. They will dangle until repaired.`);
  }

  result.sidecarKeys = Array.from(sidecarKeys).sort();
  result.references = references;
  result.summary = {
    sidecarKeys: result.sidecarKeys.length,
    references: references.length,
    widgets: widgetCount,
  };
  return result;
}

/** Pull widget-like entries out of a canvas/dashboards scope of unknown shape. */
function collectWidgets(scope) {
  if (!scope || typeof scope !== "object") return [];
  if (Array.isArray(scope.widgets)) return scope.widgets;
  const out = [];
  for (const value of Object.values(scope)) {
    if (Array.isArray(value?.widgets)) out.push(...value.widgets);
    else if (Array.isArray(value)) {
      for (const item of value) if (Array.isArray(item?.widgets)) out.push(...item.widgets);
    }
  }
  return out;
}

export { computeDeleteImpact, sandboxRunSourceId };
