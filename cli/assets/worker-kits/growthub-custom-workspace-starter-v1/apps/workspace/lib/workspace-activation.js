/**
 * Growthub Workspace Customer Activation Layer V1 — derivation helpers.
 *
 * Reads the existing governed artifacts (workspaceConfig + sidecar
 * source records + workspace metadata graph store) and projects a typed,
 * read-only activation checklist:
 *
 *   - what template the workspace was scaffolded from (provenance)
 *   - which setup steps are still pending
 *   - what the next obvious action is
 *
 * Authority order:
 *
 *   1. growthub.config.json            (governed workspace artifact)
 *   2. growthub.source-records.json    (sidecar source/run state)
 *   3. derived metadata store          (workspace-metadata-store.js)
 *
 * Invariants:
 *
 *   - Pure derivation. No React. No fetch. No mutation of inputs.
 *   - Never includes secrets, OAuth tokens, provider credentials, or
 *     access/refresh tokens in the output. Connection IDs are surfaced
 *     as booleans only (`connectionConfigured: true/false`).
 *   - Activation state is NOT persisted — every checklist field is
 *     recomputable from inputs on every page load. Don't add hidden
 *     storage. Don't add localStorage. Don't add a separate sidecar.
 *   - Backwards-compatible: a workspace with no `provenance` block still
 *     produces a valid (generic) activation state.
 *
 * The output shape:
 *
 *   {
 *     kind:        "growthub-workspace-activation-state-v1"
 *     version:     1
 *     template:    "blank" | "project-management" | <slug>
 *     templateName:string
 *     headline:    string  // user-facing "what is this workspace for"
 *     subheadline: string  // user-facing "what's next"
 *     complete:    boolean
 *     completedCount: number
 *     totalCount:  number
 *     nextStepId:  string | null
 *     steps: [
 *       {
 *         id:         string                // stable; safe to use as key
 *         label:      string                // short title
 *         description:string                // one-line user-facing copy
 *         status:     "complete"|"pending"|"blocked"|"optional"
 *         href:       string                // deep link into existing surface
 *         hint?:      string                // why it's blocked (no secrets)
 *         cta?:       string                // button label override
 *       }
 *     ]
 *   }
 */

const ACTIVATION_KIND = "growthub-workspace-activation-state-v1";
const ACTIVATION_VERSION = 1;

const TEMPLATE_PROJECT_MANAGEMENT = "project-management";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeString(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

function findDataModelObject(workspaceConfig, predicate) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects)
    ? workspaceConfig.dataModel.objects
    : [];
  for (const object of objects) {
    if (!isPlainObject(object)) continue;
    if (predicate(object)) return object;
  }
  return null;
}

function listObjectRows(object) {
  return Array.isArray(object?.rows) ? object.rows : [];
}

function safeBoolean(value) {
  return Boolean(value);
}

function deriveProvenance(workspaceConfig) {
  const provenance = isPlainObject(workspaceConfig?.provenance) ? workspaceConfig.provenance : null;
  const template = safeString(provenance?.template).trim().toLowerCase();
  const templateKind = safeString(provenance?.templateKind).trim();
  const privacy = safeString(provenance?.privacy).trim();
  const note = safeString(provenance?.note).trim();
  const templateName = safeString(workspaceConfig?.name || provenance?.label || "").trim();
  return {
    hasProvenance: Boolean(provenance),
    template: template || "blank",
    templateKind,
    privacy,
    note,
    templateName,
  };
}

/**
 * Detect whether a string-or-list-of-strings field on an api-registry row
 * contains at least one configured connection ID. We surface this as a
 * boolean only — the connection identifier itself is never echoed into the
 * activation state (it can be PII-adjacent).
 */
function hasConnectionId(row) {
  if (!isPlainObject(row)) return false;
  const raw = row.connectionIds ?? row.connectionId;
  if (Array.isArray(raw)) {
    return raw.some((entry) => safeString(entry).trim().length > 0);
  }
  return safeString(raw).trim().length > 0;
}

/**
 * Detect whether the workspace source-records sidecar has any rows for
 * the given source id. Reads `recordCount` first (cheap) and falls back to
 * `records.length`. Never inspects the underlying records.
 */
function hasSourceRecords(workspaceSourceRecords, sourceId) {
  if (!isPlainObject(workspaceSourceRecords)) return false;
  const key = safeString(sourceId).trim();
  if (!key) return false;
  const sidecar = workspaceSourceRecords[key];
  if (!isPlainObject(sidecar)) return false;
  if (Number.isFinite(sidecar.recordCount) && sidecar.recordCount > 0) return true;
  if (Array.isArray(sidecar.records) && sidecar.records.length > 0) return true;
  return false;
}

/**
 * Pull the latest workflow + sandbox row status from the typed metadata
 * store when it's available, falling back to inspecting workspaceConfig
 * directly. The store path is preferred because it dedupes runs and tags
 * pipeline health, but neither path is required.
 */
function findWorkflowRow(workspaceConfig, predicate) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects)
    ? workspaceConfig.dataModel.objects
    : [];
  for (const object of objects) {
    if (!isPlainObject(object) || object.objectType !== "sandbox-environment") continue;
    const rows = listObjectRows(object);
    for (const row of rows) {
      if (!isPlainObject(row)) continue;
      if (predicate(row, object)) return { object, row };
    }
  }
  return null;
}

function parseSafe(value) {
  if (isPlainObject(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function deriveLatestRunStatus(workflowRow) {
  if (!isPlainObject(workflowRow)) return { status: "never", ok: false };
  const status = safeString(workflowRow.status).trim().toLowerCase();
  const lastResponse = parseSafe(workflowRow.lastResponse);
  if (!lastResponse) {
    if (status === "tested" || status === "ok" || status === "success") {
      return { status: "ok", ok: true };
    }
    if (status === "failed" || status === "error") {
      return { status: "failed", ok: false };
    }
    return { status: "never", ok: false };
  }
  const exitCode = Number.isFinite(lastResponse.exitCode) ? Number(lastResponse.exitCode) : null;
  const ok = exitCode === 0 && !safeString(lastResponse.error).trim();
  return { status: ok ? "ok" : "failed", ok };
}

function findDashboardByIdOrName(workspaceConfig, predicate) {
  const dashboards = Array.isArray(workspaceConfig?.dashboards) ? workspaceConfig.dashboards : [];
  for (const dashboard of dashboards) {
    if (!isPlainObject(dashboard)) continue;
    if (predicate(dashboard)) return dashboard;
  }
  return null;
}

// ───────────────────────────────────────────────────────────────────────────
// Project Management Workspace Template — adapter
// ───────────────────────────────────────────────────────────────────────────

/**
 * Derive the Project Management activation checklist.
 *
 * The seed config (`templates/seeded-configs/project-management.config.json`)
 * ships a Nango-backed api-registry row, a Project Task Source, a sandbox
 * workflow row, and a dashboard. This helper checks each one and builds
 * the deep-link checklist.
 */
function deriveProjectManagementActivationState({ workspaceConfig, workspaceSourceRecords, metadataGraph }) {
  const provenance = deriveProvenance(workspaceConfig);
  const registry = findDataModelObject(workspaceConfig, (o) => o.objectType === "api-registry");
  const registryRow = registry
    ? listObjectRows(registry).find((row) => safeString(row?.connectorKind).trim().toLowerCase() === "nango")
      || listObjectRows(registry)[0]
    : null;
  const providerConfigKey = safeString(registryRow?.providerConfigKey).trim()
    || safeString(registryRow?.integrationId).trim();
  const connectionConfigured = hasConnectionId(registryRow);

  const sourceObject = findDataModelObject(workspaceConfig, (o) => o.id === "project-task-source"
    || o.objectType === "data-source");
  const sourceRow = listObjectRows(sourceObject)[0] || null;
  const sourceId = safeString(sourceRow?.sourceId).trim();
  const sourceHasRecords = hasSourceRecords(workspaceSourceRecords, sourceId);

  const workflowMatch = findWorkflowRow(workspaceConfig, (row) => {
    const name = safeString(row?.Name || row?.name).trim();
    return name === "project-active-tasks-workflow"
      || name.toLowerCase().includes("project-active-tasks");
  });
  const workflowRow = workflowMatch?.row || null;
  const workflowObjectId = workflowMatch?.object?.id || "sandbox-environments";
  const workflowRowName = safeString(workflowRow?.Name || workflowRow?.name).trim();
  const workflowRun = deriveLatestRunStatus(workflowRow);

  const dashboard = findDashboardByIdOrName(workspaceConfig,
    (d) => d.id === "project-management-template"
      || safeString(d.name).trim().toLowerCase() === "project management");

  // NANGO_SECRET_KEY presence is impossible to detect in pure derivation
  // (it's an env var the browser can't read). The metadata graph exposes a
  // safe boolean via authority/runtime status if the server has surfaced it;
  // otherwise the step always asks the user to confirm.
  const integrationsRuntime = isPlainObject(metadataGraph?.runtime) ? metadataGraph.runtime : null;
  const nangoConfiguredHint = integrationsRuntime?.nangoConfigured;
  // If the runtime explicitly says configured, mark the env step as
  // complete. If it explicitly says not-configured OR we have no signal at
  // all, we don't claim it's complete — the user still needs to confirm.
  const nangoEnvComplete = nangoConfiguredHint === true;

  const steps = [];

  steps.push({
    id: "provider-env",
    label: "Configure provider auth",
    description: "Set NANGO_SECRET_KEY in your runtime environment so the workspace can talk to Nango.",
    status: nangoEnvComplete ? "complete" : "pending",
    href: "/settings/integrations",
    hint: nangoEnvComplete
      ? ""
      : "Set NANGO_SECRET_KEY in .env.local (or your hosted runtime), then restart the workspace server.",
    cta: nangoEnvComplete ? "Review integrations" : "Open integration settings",
  });

  const nangoStepHref = registry && registryRow
    ? `/data-model?object=${encodeURIComponent(registry.id)}&row=${encodeURIComponent(safeString(registryRow.integrationId).trim() || "asana-active-tasks")}`
    : "/data-model";

  steps.push({
    id: "nango-connection",
    label: "Connect provider through Nango",
    description: connectionConfigured
      ? `Connection configured for providerConfigKey "${providerConfigKey || "asana"}".`
      : "Open the API Registry row and run Create Connect Session, then paste the connectionId Nango returns.",
    status: connectionConfigured ? "complete" : (nangoEnvComplete ? "pending" : "blocked"),
    href: nangoStepHref,
    hint: connectionConfigured
      ? ""
      : nangoEnvComplete
        ? "Use the Nango panel in the API Registry row — your workspace never sees provider tokens."
        : "Finish the previous step first — Nango needs NANGO_SECRET_KEY to mint a Connect Session.",
    cta: connectionConfigured ? "Manage connection" : "Open Nango panel",
  });

  const workflowHref = workflowRowName
    ? `/workflows?object=${encodeURIComponent(workflowObjectId)}&row=${encodeURIComponent(workflowRowName)}&field=orchestrationConfig`
    : "/workflows";

  const workflowComplete = workflowRun.ok && sourceHasRecords;

  steps.push({
    id: "workflow-run",
    label: "Run the Active Tasks workflow",
    description: workflowComplete
      ? "Workflow has executed successfully and refreshed the Project Task Source."
      : workflowRun.status === "failed"
        ? "The last run failed — open the run trace to see what went wrong."
        : "Open the seeded workflow and click Test to pull active tasks from your project.",
    status: workflowComplete
      ? "complete"
      : connectionConfigured
        ? (workflowRun.status === "failed" ? "blocked" : "pending")
        : "blocked",
    href: workflowHref,
    hint: workflowComplete
      ? ""
      : connectionConfigured
        ? workflowRun.status === "failed"
          ? "Open the workflow's See Runs trace and check the failing node's response."
          : "Fill projectGid + workspaceGid in the input node, then click Test."
        : "Finish the Nango connection step first.",
    cta: workflowComplete ? "Open workflow" : workflowRun.status === "failed" ? "Open run trace" : "Open workflow",
  });

  const dashboardHref = dashboard
    ? `/?dashboard=${encodeURIComponent(dashboard.id)}`
    : "/";

  steps.push({
    id: "dashboard-view",
    label: "View the Active Tasks dashboard",
    description: workflowComplete
      ? "Open the dashboard to see the latest active project tasks."
      : "After the workflow runs successfully, hydrated tasks will appear in this dashboard.",
    status: workflowComplete ? "complete" : "pending",
    href: dashboardHref,
    cta: "Open dashboard",
  });

  steps.push({
    id: "customize",
    label: "Customize this workspace",
    description: "Duplicate the dashboard, add objects, schedule the workflow, or wire another provider through Nango.",
    status: "optional",
    href: "/data-model",
    cta: "Customize",
  });

  const completedCount = steps.filter((step) => step.status === "complete").length;
  const requiredCount = steps.filter((step) => step.status !== "optional").length;
  const complete = completedCount >= requiredCount;
  const nextStep = steps.find((step) => step.status === "pending" || step.status === "blocked");

  return {
    kind: ACTIVATION_KIND,
    version: ACTIVATION_VERSION,
    template: TEMPLATE_PROJECT_MANAGEMENT,
    templateName: provenance.templateName || "Project Management Workspace",
    headline: complete
      ? "Your Project Management workspace is live."
      : `You're ${requiredCount - completedCount} step${requiredCount - completedCount === 1 ? "" : "s"} from your first task dashboard.`,
    subheadline: complete
      ? "Inspect runs, customize objects, or wire another provider."
      : nextStep
        ? `Next: ${nextStep.label}.`
        : "Open the dashboard to see your latest tasks.",
    complete,
    completedCount,
    totalCount: requiredCount,
    nextStepId: nextStep ? nextStep.id : null,
    steps,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Blank governed workspace — adapter
// ───────────────────────────────────────────────────────────────────────────

/**
 * Generic activation checklist for blank governed workspaces. Drives the
 * user toward the first object → first dashboard → first widget → first
 * workflow → first run, using only routes that already exist.
 */
function deriveBlankWorkspaceActivationState({ workspaceConfig, workspaceSourceRecords, metadataGraph }) {
  const provenance = deriveProvenance(workspaceConfig);
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects)
    ? workspaceConfig.dataModel.objects
    : [];

  // Hidden helper objects don't count as "user-created".
  const HIDDEN_OBJECT_IDS = new Set([
    "workspace-helper-sandbox",
    "nav-folders",
    "helper-threads",
    "sandbox-environments",
    "workflow-api-registry",
    "workspace-ui-cache",
  ]);
  const userObjects = objects.filter((o) => isPlainObject(o)
    && safeString(o.id).trim()
    && !HIDDEN_OBJECT_IDS.has(o.id));
  const objectCreated = userObjects.length > 0;

  const dashboards = Array.isArray(workspaceConfig?.dashboards) ? workspaceConfig.dashboards : [];
  const dashboardCreated = dashboards.length > 0;
  const widgetCount = dashboards.reduce((acc, dashboard) => {
    const tabs = Array.isArray(dashboard?.tabs) ? dashboard.tabs : [];
    for (const tab of tabs) {
      const widgets = Array.isArray(tab?.widgets) ? tab.widgets : [];
      acc += widgets.length;
    }
    return acc;
  }, 0);
  const widgetAdded = widgetCount > 0;

  const workflowMatch = findWorkflowRow(workspaceConfig, () => true);
  const workflowCreated = Boolean(workflowMatch?.row);
  const workflowRun = deriveLatestRunStatus(workflowMatch?.row);

  const steps = [
    {
      id: "create-object",
      label: "Create your first object",
      description: objectCreated
        ? `${userObjects.length} object${userObjects.length === 1 ? "" : "s"} in your Data Model.`
        : "Start by adding a custom object or connecting a data source in Management.",
      status: objectCreated ? "complete" : "pending",
      href: "/data-model",
      cta: objectCreated ? "Open Data Model" : "Create object",
    },
    {
      id: "create-dashboard",
      label: "Create a dashboard",
      description: dashboardCreated
        ? `${dashboards.length} dashboard${dashboards.length === 1 ? "" : "s"} ready.`
        : "Add a dashboard from the Builder to visualize your data.",
      status: dashboardCreated ? "complete" : (objectCreated ? "pending" : "blocked"),
      href: "/",
      hint: dashboardCreated || objectCreated ? "" : "Add an object first so dashboards have data to bind to.",
      cta: dashboardCreated ? "Open Builder" : "New dashboard",
    },
    {
      id: "add-widget",
      label: "Add a widget",
      description: widgetAdded
        ? `${widgetCount} widget${widgetCount === 1 ? "" : "s"} placed.`
        : "Bind a chart or view widget to one of your objects.",
      status: widgetAdded ? "complete" : (dashboardCreated ? "pending" : "blocked"),
      href: "/",
      hint: widgetAdded || dashboardCreated ? "" : "Add a dashboard first.",
      cta: widgetAdded ? "Open Builder" : "Add widget",
    },
    {
      id: "create-workflow",
      label: "Create a workflow",
      description: workflowCreated
        ? "Sandbox workflow scaffolded."
        : "Open Workflows to assemble your first automation.",
      status: workflowCreated ? "complete" : "pending",
      href: "/workflows",
      cta: workflowCreated ? "Open Workflows" : "New workflow",
    },
    {
      id: "run-workflow",
      label: "Run your workflow",
      description: workflowRun.ok
        ? "Workflow has run successfully at least once."
        : workflowRun.status === "failed"
          ? "Last run failed — open the trace and fix the failing node."
          : "Click Test inside the workflow to do a first run.",
      status: workflowRun.ok ? "complete" : (workflowCreated ? "pending" : "blocked"),
      href: "/workflows",
      hint: workflowRun.ok || workflowCreated ? "" : "Create a workflow first.",
      cta: workflowRun.ok ? "View runs" : "Open workflow",
    },
  ];

  const completedCount = steps.filter((step) => step.status === "complete").length;
  const requiredCount = steps.length;
  const complete = completedCount >= requiredCount;
  const nextStep = steps.find((step) => step.status === "pending" || step.status === "blocked");

  return {
    kind: ACTIVATION_KIND,
    version: ACTIVATION_VERSION,
    template: "blank",
    templateName: provenance.templateName || "Governed Workspace",
    headline: complete
      ? "Your workspace is set up."
      : "Get started with your governed workspace.",
    subheadline: complete
      ? "Add more objects, widgets, or workflows as your needs grow."
      : nextStep
        ? `Next: ${nextStep.label}.`
        : "Pick the next step that fits what you want to build.",
    complete,
    completedCount,
    totalCount: requiredCount,
    nextStepId: nextStep ? nextStep.id : null,
    steps,
    // Silence unused-arg warnings — sidecar inputs are accepted by every
    // adapter so callers can pass the same envelope through.
    _sourceRecords: workspaceSourceRecords ? true : false,
    _metadata: metadataGraph ? true : false,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Public entry — template router
// ───────────────────────────────────────────────────────────────────────────

/**
 * Resolve the activation state for the current workspace.
 *
 * Templates are routed by `workspaceConfig.provenance.template`. Unknown
 * templates and workspaces without provenance fall back to the blank
 * adapter so existing workspaces never lose their UX.
 */
function deriveWorkspaceActivationState(input = {}) {
  const safeInput = {
    workspaceConfig: isPlainObject(input.workspaceConfig) ? input.workspaceConfig : {},
    workspaceSourceRecords: isPlainObject(input.workspaceSourceRecords) ? input.workspaceSourceRecords : {},
    metadataGraph: isPlainObject(input.metadataGraph) ? input.metadataGraph : null,
  };
  const provenance = deriveProvenance(safeInput.workspaceConfig);
  if (provenance.template === TEMPLATE_PROJECT_MANAGEMENT) {
    return deriveProjectManagementActivationState(safeInput);
  }
  return deriveBlankWorkspaceActivationState(safeInput);
}

export {
  ACTIVATION_KIND,
  ACTIVATION_VERSION,
  TEMPLATE_PROJECT_MANAGEMENT,
  deriveWorkspaceActivationState,
  deriveProjectManagementActivationState,
  deriveBlankWorkspaceActivationState,
  deriveProvenance,
  hasConnectionId,
  hasSourceRecords,
};
