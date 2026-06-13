/**
 * App Registry — the runtime surface-metadata source of truth that roadmap
 * Item 4 (Multi-app / Fleet lens) was staged on. Contract:
 * `@growthub/api-contract/workspace-apps`.
 *
 * An application is a FIRST-CLASS GOVERNED ENTITY: one row of the well-known
 * Data Model object `workspace-app-registry` (objectType "app-surface"),
 * living in `growthub.config.json#dataModel.objects[]` like every other
 * governed object — same PATCH allowlist, same validator, same mutation
 * policy, same receipts. No parallel registry service, no new persistence.
 *
 * A row REFERENCES the app's governed parts (ids, never embedded copies):
 *   dashboardIds  — comma-separated dashboard ids
 *   workflowRefs  — comma-separated "objectId:RowName" sandbox-row refs
 *   dataSourceIds — comma-separated Data Model object ids (source-backed)
 *   registryIds   — comma-separated API Registry integrationIds
 * plus identity/operational columns (appId, surfacePath, framework, owner,
 * environment, deployTarget, status, exportStatus, description).
 *
 * Everything in this module is PURE derivation over workspaceConfig +
 * workspaceSourceRecords (+ optional precomputed runtime flags): no
 * mutation, no secrets, never throws on partial config. Mutations flow
 * through the existing governed routes only.
 */

const APP_REGISTRY_OBJECT_ID = "workspace-app-registry";
const APP_SURFACE_OBJECT_TYPE = "app-surface";
const APP_ASSIGNMENT_PACKET_KIND = "growthub-app-assignment-packet-v1";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeString(value) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function splitIds(value) {
  return safeString(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The registry object: matched by well-known id OR objectType. */
function findAppRegistryObject(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  return (
    objects.find((o) => isPlainObject(o) && o.id === APP_REGISTRY_OBJECT_ID) ||
    objects.find((o) => isPlainObject(o) && o.objectType === APP_SURFACE_OBJECT_TYPE) ||
    null
  );
}

function listAppSurfaceRows(workspaceConfig) {
  const object = findAppRegistryObject(workspaceConfig);
  const rows = Array.isArray(object?.rows) ? object.rows : [];
  return rows.filter((r) => isPlainObject(r) && safeString(r.Name).trim());
}

/** Resolve a row's references against the live config. Found vs missing — missing refs are themselves governance signal. */
function resolveAppLinks(workspaceConfig, workspaceSourceRecords, row) {
  const cfg = isPlainObject(workspaceConfig) ? workspaceConfig : {};
  const records = isPlainObject(workspaceSourceRecords) ? workspaceSourceRecords : {};
  const objects = Array.isArray(cfg?.dataModel?.objects) ? cfg.dataModel.objects : [];
  const dashboards = Array.isArray(cfg?.dashboards) ? cfg.dashboards : [];

  const links = {
    dashboards: { found: [], missing: [] },
    workflows: { found: [], missing: [] },
    dataSources: { found: [], missing: [] },
    apis: { found: [], missing: [] }
  };

  for (const id of splitIds(row?.dashboardIds)) {
    const hit = dashboards.find((d) => safeString(d?.id) === id);
    (hit ? links.dashboards.found : links.dashboards.missing).push({ id, name: safeString(hit?.name) || id });
  }

  for (const ref of splitIds(row?.workflowRefs)) {
    const at = ref.indexOf(":");
    const objectId = at === -1 ? "" : ref.slice(0, at).trim();
    const rowName = at === -1 ? "" : ref.slice(at + 1).trim();
    const object = objects.find((o) => o?.id === objectId && o?.objectType === "sandbox-environment");
    const wfRow = (Array.isArray(object?.rows) ? object.rows : [])
      .find((r) => safeString(r?.Name).trim() === rowName);
    if (wfRow) {
      const lifecycleStatus = safeString(wfRow.lifecycleStatus).trim().toLowerCase();
      links.workflows.found.push({
        ref,
        objectId,
        rowName,
        lifecycleStatus,
        live: lifecycleStatus === "live",
        lastRunOk: safeString(wfRow.status) === "connected" && Boolean(safeString(wfRow.lastRunId).trim()),
        hasDraft: Boolean(safeString(wfRow.orchestrationDraftConfig).trim() || safeString(wfRow.orchestrationDraftGraph).trim())
      });
    } else {
      links.workflows.missing.push({ ref, objectId, rowName });
    }
  }

  for (const id of splitIds(row?.dataSourceIds)) {
    const object = objects.find((o) => o?.id === id);
    if (object) {
      const sourceId = safeString(object.sourceId).trim();
      const hydrated = Boolean(sourceId && isPlainObject(records[sourceId]) &&
        (Array.isArray(records[sourceId].records) ? records[sourceId].records.length : 0) > 0);
      links.dataSources.found.push({ id, sourceId: sourceId || null, hydrated });
    } else {
      links.dataSources.missing.push({ id });
    }
  }

  const registryRows = objects
    .filter((o) => o?.objectType === "api-registry")
    .flatMap((o) => (Array.isArray(o.rows) ? o.rows : []));
  for (const id of splitIds(row?.registryIds)) {
    const hit = registryRows.find((r) => safeString(r?.integrationId).trim() === id);
    if (hit) {
      links.apis.found.push({ integrationId: id, connected: safeString(hit.status) === "connected" });
    } else {
      links.apis.missing.push({ integrationId: id });
    }
  }

  return links;
}

/**
 * Per-app health rollup. `runtimeFlags` ({ durable, readOnly, deployReady })
 * are precomputed by the caller from the safe runtime descriptor so this
 * module stays dependency-free.
 */
function deriveAppHealth(workspaceConfig, workspaceSourceRecords, row, runtimeFlags = {}) {
  const links = resolveAppLinks(workspaceConfig, workspaceSourceRecords, row);
  const blockers = [];

  const missingRefs =
    links.dashboards.missing.length + links.workflows.missing.length +
    links.dataSources.missing.length + links.apis.missing.length;
  if (missingRefs > 0) blockers.push(`${missingRefs} referenced object(s) do not resolve — fix the row's refs`);

  const apisDown = links.apis.found.filter((a) => !a.connected);
  if (apisDown.length > 0) blockers.push(`${apisDown.length} API integration(s) not connected — test via the API Registry cockpit`);

  const dry = links.dataSources.found.filter((s) => !s.hydrated);
  if (dry.length > 0) blockers.push(`${dry.length} data source(s) have no hydrated records — run refresh-sources`);

  const unpublished = links.workflows.found.filter((w) => !w.live);
  if (unpublished.length > 0) blockers.push(`${unpublished.length} workflow(s) not live — draft → useDraft proof → workflow/publish`);

  const unproven = links.workflows.found.filter((w) => w.live && !w.lastRunOk);
  if (unproven.length > 0) blockers.push(`${unproven.length} live workflow(s) without passing run evidence`);

  if (runtimeFlags.readOnly === true) blockers.push("persistence is read-only — mutations cannot land in this runtime");
  else if (runtimeFlags.durable === false) blockers.push("persistence is not durable — app state will not survive");
  if (runtimeFlags.deployReady === false) blockers.push("deploy readiness checks are not clear");

  const linkedCount =
    links.dashboards.found.length + links.workflows.found.length +
    links.dataSources.found.length + links.apis.found.length;

  // "empty" wins over runtime blockers: an app with nothing linked has one
  // first action (link its governed parts) regardless of runtime state.
  let status = "ready";
  if (linkedCount === 0 && links.dashboards.missing.length + links.workflows.missing.length + links.dataSources.missing.length + links.apis.missing.length === 0) {
    status = "empty";
  } else if (blockers.length > 0) {
    status = "blocked";
  }

  return { status, blockers, linkedCount, links };
}

/** The single next action for an app, in lifecycle order. */
function deriveAppNextAction(row, health) {
  if (health.linkedCount === 0) {
    return {
      label: "Link the app's governed parts",
      description: "Reference its dashboards, workflows, data sources, and APIs on the registry row.",
      href: `/data-model?object=${APP_REGISTRY_OBJECT_ID}`
    };
  }
  if (health.blockers.length > 0) {
    const first = health.blockers[0];
    let href = `/data-model?object=${APP_REGISTRY_OBJECT_ID}`;
    if (first.includes("API")) href = "/data-model";
    if (first.includes("workflow")) {
      const wf = health.links.workflows.found.find((w) => !w.live) || health.links.workflows.found[0];
      if (wf) href = `/workflows?object=${wf.objectId}&row=${encodeURIComponent(wf.rowName)}`;
    }
    if (first.includes("persistence") || first.includes("deploy")) href = "/settings";
    if (first.includes("data source")) href = "/data-model";
    return { label: first, description: "Clear this blocker to move the app forward.", href };
  }
  return {
    label: "App is healthy — package or extend it",
    description: "Export the workspace artifact, or assign the next capability to an agent.",
    href: "/settings"
  };
}

/**
 * Machine-readable, app-scoped swarm assignment. Mirrors the swarm-condition
 * packet shape and adds the governed scope: allowed routes, forbidden
 * actions, and the object refs the agent may touch. No secrets ever.
 */
function buildAppAssignmentPacket(workspaceConfig, workspaceSourceRecords, row, runtimeFlags = {}) {
  const health = deriveAppHealth(workspaceConfig, workspaceSourceRecords, row, runtimeFlags);
  const next = deriveAppNextAction(row, health);
  const appId = safeString(row.appId).trim() || safeString(row.Name).trim();
  return {
    kind: APP_ASSIGNMENT_PACKET_KIND,
    version: 1,
    appId,
    appName: safeString(row.Name).trim(),
    surfacePath: safeString(row.surfacePath).trim() || null,
    goal: `Move application "${safeString(row.Name).trim()}" to a healthy, published, proven state.`,
    currentState: health.status,
    blockers: health.blockers,
    nextAction: next,
    objectRefs: [
      { objectId: APP_REGISTRY_OBJECT_ID, rowName: safeString(row.Name).trim() },
      ...health.links.workflows.found.map((w) => ({ objectId: w.objectId, rowName: w.rowName })),
      ...health.links.dataSources.found.map((s) => ({ objectId: s.id }))
    ],
    allowedRoutes: [
      "GET /api/workspace",
      "GET /api/workspace/apps",
      "POST /api/workspace/patch/preflight",
      `PATCH /api/workspace with header x-growthub-app-scope: ${appId} (runtime-enforced app scope)`,
      "POST /api/workspace/test-source",
      "POST /api/workspace/refresh-sources",
      "POST /api/workspace/sandbox-run (useDraft:true for drafts)",
      "POST /api/workspace/workflow/publish",
      "GET /api/workspace/agent-outcomes"
    ],
    forbiddenActions: [
      "mutating objects not referenced by this app's registry row",
      "direct PATCH of live workflow fields, version bumps, or lifecycleStatus live",
      "writing secrets into rows, prompts, or PATCH bodies (authRef/envRef names only)",
      "writing growthub.config.json or growthub.source-records.json directly",
      "inventing routes outside the allowed list"
    ],
    expectedEvidence: [
      "outcome receipts in workspace:agent-outcomes citing this app's object refs",
      "run records under sandbox:<objectId>:<slug(Name)> for workflow proofs",
      "registry row health rollup improving (blockers shrinking)"
    ]
  };
}

/**
 * The set of Data Model object ids inside an app's governed scope:
 * the registry object itself, the app's workflow objects, its data-source
 * objects, and every api-registry object holding one of its integrationIds.
 * Returns null when the app is not registered.
 */
function resolveAppScopeObjectIds(workspaceConfig, appId) {
  const wanted = safeString(appId).trim();
  if (!wanted) return null;
  const row = listAppSurfaceRows(workspaceConfig)
    .find((r) => (safeString(r.appId).trim() || safeString(r.Name).trim()) === wanted);
  if (!row) return null;
  const registryObject = findAppRegistryObject(workspaceConfig);
  const scope = new Set();
  if (registryObject?.id) scope.add(safeString(registryObject.id));
  for (const ref of splitIds(row.workflowRefs)) {
    const at = ref.indexOf(":");
    if (at > 0) scope.add(ref.slice(0, at).trim());
  }
  for (const id of splitIds(row.dataSourceIds)) scope.add(id);
  const wantedIntegrations = new Set(splitIds(row.registryIds));
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  for (const object of objects) {
    if (object?.objectType !== "api-registry") continue;
    const rows = Array.isArray(object.rows) ? object.rows : [];
    if (rows.some((r) => wantedIntegrations.has(safeString(r?.integrationId).trim()))) {
      scope.add(safeString(object.id));
    }
  }
  return { row, objectIds: scope, dashboardIds: new Set(splitIds(row.dashboardIds)) };
}

function stable(value) {
  if (value === undefined) return "undefined";
  return JSON.stringify(value, (key, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const sorted = {};
      for (const k of Object.keys(v).sort()) sorted[k] = v[k];
      return sorted;
    }
    return v;
  });
}

/**
 * Runtime enforcement for app-scoped agents (claim: "agents cannot mutate
 * unrelated app infrastructure"). Opt-in: a harness working from an
 * AppAssignmentPacket sets `x-growthub-app-scope: <appId>` on PATCH; the
 * route then rejects any mutation outside the app's governed scope:
 *
 *   - dataModel objects that CHANGED (stable-compare vs persisted) or are
 *     NEW must be in the app's object-id scope;
 *   - dashboards that changed/appeared must be in the app's dashboardIds;
 *   - `canvas` / `widgetTypes` are workspace-global surfaces — always out
 *     of scope under an app-scoped mutation.
 *
 * Pure: (currentConfig, patch, appId) → { ok, violations[] }. Unscoped
 * PATCHes (no header) are untouched — scope is a tightening, never a
 * widening, of the mutation policy.
 */
function evaluateAppScope(currentConfig, patch, appId) {
  const violations = [];
  const scope = resolveAppScopeObjectIds(currentConfig, appId);
  if (!scope) {
    return {
      ok: false,
      violations: [{
        code: "app_scope_violation",
        path: "",
        message: `appId "${safeString(appId).trim()}" is not registered in ${APP_REGISTRY_OBJECT_ID} — register the app row before working app-scoped`
      }]
    };
  }
  if (!isPlainObject(patch)) return { ok: true, violations };

  for (const key of ["canvas", "widgetTypes"]) {
    if (patch[key] !== undefined && !sameStable(patch[key], currentConfig?.[key])) {
      violations.push({
        code: "app_scope_violation",
        path: key,
        message: `${key} is a workspace-global surface — out of scope for app "${safeString(appId).trim()}"`
      });
    }
  }

  if (patch.dashboards !== undefined && Array.isArray(patch.dashboards)) {
    const currentDashboards = Array.isArray(currentConfig?.dashboards) ? currentConfig.dashboards : [];
    const currentById = new Map(currentDashboards.map((d) => [safeString(d?.id), d]));
    patch.dashboards.forEach((dashboard, index) => {
      const id = safeString(dashboard?.id);
      if (sameStable(dashboard, currentById.get(id))) return;
      if (!scope.dashboardIds.has(id)) {
        violations.push({
          code: "app_scope_violation",
          path: `dashboards[${index}]`,
          message: `dashboard "${id}" is not referenced by app "${safeString(appId).trim()}" (dashboardIds)`
        });
      }
    });
  }

  if (patch.dataModel !== undefined && isPlainObject(patch.dataModel) && Array.isArray(patch.dataModel.objects)) {
    const currentObjects = Array.isArray(currentConfig?.dataModel?.objects) ? currentConfig.dataModel.objects : [];
    const currentById = new Map(currentObjects.map((o) => [safeString(o?.id), o]));
    patch.dataModel.objects.forEach((object, index) => {
      const id = safeString(object?.id);
      if (sameStable(object, currentById.get(id))) return;
      if (!scope.objectIds.has(id)) {
        violations.push({
          code: "app_scope_violation",
          path: `dataModel.objects[${index}]`,
          message: `object "${id}" is outside app "${safeString(appId).trim()}"'s governed scope — ` +
            "only the app's registry object, workflows, data sources, and API registry objects may change"
        });
      }
    });
  }

  return { ok: violations.length === 0, violations };
}

function sameStable(a, b) {
  return stable(a) === stable(b);
}

/**
 * Full scope context for the unified route gate (`requireAppScope`).
 * Superset of resolveAppScopeObjectIds: adds workflowRefs ("objectId:Name"),
 * dataSourceIds (registry-row references = Data Model object ids), the
 * derived sidecar sourceIds of those objects, and registryIds
 * (api-registry integrationIds). Null when the app is not registered.
 */
function resolveAppScopeContext(workspaceConfig, appId) {
  const base = resolveAppScopeObjectIds(workspaceConfig, appId);
  if (!base) return null;
  const { row } = base;
  const workflowRefs = new Set(splitIds(row.workflowRefs).map((r) => r.trim()));
  const dataSourceIds = new Set(splitIds(row.dataSourceIds));
  const registryIds = new Set(splitIds(row.registryIds));
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const sourceIds = new Set();
  for (const object of objects) {
    if (dataSourceIds.has(safeString(object?.id)) && safeString(object?.sourceId).trim()) {
      sourceIds.add(safeString(object.sourceId).trim());
    }
  }
  return {
    appId: safeString(row.appId).trim() || safeString(row.Name).trim(),
    row,
    objectIds: base.objectIds,
    dashboardIds: base.dashboardIds,
    workflowRefs,
    dataSourceIds,
    sourceIds,
    registryIds
  };
}

/**
 * Structured violation envelope (SDK: AppScopeViolation) — every scoped
 * route returns this shape so agents self-correct programmatically.
 */
function buildAppScopeViolation(appScope, violationType, offendingPaths, suggestedAction, context) {
  return {
    error: "app scope violation",
    appScope: safeString(appScope).trim(),
    violationType,
    offendingPaths: Array.isArray(offendingPaths) ? offendingPaths : [],
    suggestedAction,
    ...(context ? { allowedObjectIds: Array.from(context.objectIds) } : {})
  };
}

/**
 * The unified scope gate every governed mutation/execution route calls
 * (Next route handlers are functions, so the "middleware" is this shared
 * helper). Returns:
 *   { scoped: false }                          — no header; route proceeds unscoped
 *   { scoped: true, appId, context }           — verified scope context
 *   { scoped: true, violation, status: 422 }   — structured rejection body
 */
function requireAppScope(request, workspaceConfig) {
  const header = typeof request?.headers?.get === "function" ? request.headers.get("x-growthub-app-scope") : null;
  const appScope = safeString(header).trim();
  if (!appScope) return { scoped: false };
  const context = resolveAppScopeContext(workspaceConfig, appScope);
  if (!context) {
    return {
      scoped: true,
      status: 422,
      violation: buildAppScopeViolation(
        appScope,
        "app_not_registered",
        [],
        `Register appId "${appScope}" as a row of ${APP_REGISTRY_OBJECT_ID} before working app-scoped`,
        null
      )
    };
  }
  return { scoped: true, appId: context.appId, context };
}

/** Pure per-route access checks against a verified scope context. */
function checkScopedWorkflowAccess(context, objectId, rowName) {
  const ref = `${safeString(objectId).trim()}:${safeString(rowName).trim()}`;
  if (context.workflowRefs.has(ref) || context.objectIds.has(safeString(objectId).trim())) return null;
  return buildAppScopeViolation(
    context.appId,
    "workflow_outside_app",
    [ref],
    `Add "${ref}" to the app's workflowRefs on its ${APP_REGISTRY_OBJECT_ID} row, or work on a workflow the app references`,
    context
  );
}

function checkScopedSourceAccess(context, sourceIds) {
  const offending = (Array.isArray(sourceIds) ? sourceIds : [])
    .map((id) => safeString(id).trim())
    .filter((id) => id && !context.dataSourceIds.has(id) && !context.sourceIds.has(id));
  if (offending.length === 0) return null;
  return buildAppScopeViolation(
    context.appId,
    "data_source_outside_app",
    offending,
    "Reference these sources on the app's dataSourceIds before refreshing them app-scoped",
    context
  );
}

function checkScopedRegistryAccess(context, integrationId) {
  const id = safeString(integrationId).trim();
  if (context.registryIds.has(id)) return null;
  return buildAppScopeViolation(
    context.appId,
    "registry_outside_app",
    [id],
    "Reference this integrationId on the app's registryIds before testing it app-scoped",
    context
  );
}

function summarizeFleet(apps) {
  return {
    total: apps.length,
    ready: apps.filter((a) => a.health.status === "ready").length,
    blocked: apps.filter((a) => a.health.status === "blocked").length,
    empty: apps.filter((a) => a.health.status === "empty").length
  };
}

export {
  APP_ASSIGNMENT_PACKET_KIND,
  APP_REGISTRY_OBJECT_ID,
  APP_SURFACE_OBJECT_TYPE,
  buildAppAssignmentPacket,
  buildAppScopeViolation,
  checkScopedRegistryAccess,
  checkScopedSourceAccess,
  checkScopedWorkflowAccess,
  deriveAppHealth,
  deriveAppNextAction,
  evaluateAppScope,
  findAppRegistryObject,
  listAppSurfaceRows,
  requireAppScope,
  resolveAppLinks,
  resolveAppScopeContext,
  resolveAppScopeObjectIds,
  summarizeFleet
};
