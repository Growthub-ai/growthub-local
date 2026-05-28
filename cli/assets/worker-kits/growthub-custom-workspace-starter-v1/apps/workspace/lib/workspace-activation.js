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

// ───────────────────────────────────────────────────────────────────────────
// Workspace State Lenses — generalize the activation derivation primitive
// ───────────────────────────────────────────────────────────────────────────
//
// The activation layer proved one idea: a delta in the workspace artifact is
// causal — it re-derives a typed, self-describing "what's next" state. A *lens*
// is the same primitive aimed at a different slice of the artifact. Every lens
// is a pure function over the same envelope and emits the same step shape the
// WorkspaceActivationPanel already renders, so new lenses cost no new UI.
//
// Lens output shape (sibling to the activation state):
//
//   {
//     kind:        "growthub-workspace-lens-state-v1"
//     lensId:      string
//     title:       string
//     headline:    string
//     subheadline: string
//     complete:    boolean
//     completedCount / totalCount / nextStepId
//     steps: [{ id, label, description, status, href, hint?, cta? }]
//   }
//
// Invariants are inherited verbatim from the activation layer: pure derivation,
// no secrets (booleans/counts only), never throws on partial input, and every
// `href` routes into an existing workspace surface.

const LENS_STATE_KIND = "growthub-workspace-lens-state-v1";
const WORKSPACE_STATE_KIND = "growthub-workspace-state-v1";
const SWARM_PACKET_KIND = "growthub-swarm-condition-packet-v1";

/** Shared step scoring convention used by every lens. */
function scoreLensSteps(steps) {
  const required = steps.filter((step) => step.status !== "optional");
  const totalCount = required.length;
  const completedCount = required.filter((step) => step.status === "complete").length;
  const complete = completedCount >= totalCount;
  const nextStep = steps.find((step) => step.status === "pending" || step.status === "blocked");
  return { totalCount, completedCount, complete, nextStepId: nextStep ? nextStep.id : null };
}

/** Collect every sandbox-environment workflow row across the data model. */
function collectSandboxRows(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects)
    ? workspaceConfig.dataModel.objects
    : [];
  const rows = [];
  for (const object of objects) {
    if (!isPlainObject(object) || object.objectType !== "sandbox-environment") continue;
    for (const row of listObjectRows(object)) {
      if (isPlainObject(row)) rows.push(row);
    }
  }
  return rows;
}

/**
 * Persistence & runtime-durability lens (roadmap Item 2 — derivation).
 *
 * Reads the resolved persistence mode/adapter (surfaced via
 * metadataGraph.runtime when the server provides it) and whether durable run
 * evidence exists, then nudges the workspace toward a store where workflow
 * runs, source records, and agent-swarm evidence survive restart/redeploy.
 *
 * The persistence adapters themselves already ship
 * (lib/adapters/persistence/{postgres,qstash-kv,provider-managed}.js); this
 * lens is the self-describing activation pathway over them.
 */
function derivePersistenceLensState(input = {}) {
  const cfg = isPlainObject(input?.workspaceConfig) ? input.workspaceConfig : {};
  const graph = isPlainObject(input?.metadataGraph) ? input.metadataGraph : {};
  const rt = isPlainObject(graph?.runtime) ? graph.runtime : {};

  const persistenceMode = safeString(rt.persistenceMode).trim() || null; // filesystem|read-only|database
  const persistenceAdapter = safeString(rt.persistenceAdapter).trim() || null;
  const allowFsWrite = rt.allowFsWrite === true;

  // Run evidence lives in sandbox-environment object ROWS (canonical shape —
  // see findWorkflowRow / the project-management seed), not on the object.
  const sandboxRows = collectSandboxRows(cfg);
  const hasRunEvidence = sandboxRows.some(
    (row) => safeString(row.lastResponse).trim() !== "" || safeString(row.lastRunId).trim() !== "",
  );

  const isDurableDatabase = persistenceMode === "database" && persistenceAdapter !== null;
  const isDurableFilesystem = persistenceMode === "filesystem" && allowFsWrite;
  const isDurable = isDurableDatabase || isDurableFilesystem;
  const isReadOnly = persistenceMode === "read-only"
    || (persistenceMode === "filesystem" && !allowFsWrite);
  const modeResolved = persistenceMode !== null;

  const steps = [];

  steps.push({
    id: "choose-persistence",
    label: "Choose a persistence mode",
    description: "Resolve where the workspace stores run state, source records, and agent-swarm evidence.",
    status: modeResolved ? "complete" : "pending",
    href: "/settings",
    cta: modeResolved ? "Review persistence" : "Open persistence settings",
  });

  if (isDurable) {
    steps.push({
      id: "enable-durable-store",
      label: "Enable a durable store",
      description: "Runs and agent-swarm evidence are written to a persistent backing store and survive redeploy.",
      status: "complete",
      href: "/settings",
      hint: isDurableDatabase ? `Durable database adapter active (${persistenceAdapter}).` : "Filesystem writes enabled.",
      cta: "Review store",
    });
  } else if (!modeResolved) {
    steps.push({
      id: "enable-durable-store",
      label: "Enable a durable store",
      description: "Configure a database adapter or enable filesystem writes so run data persists across restarts.",
      status: "blocked",
      href: "/settings",
      hint: "Resolve the persistence mode first — the workspace can't persist runs until a store is chosen.",
      cta: "Configure persistence",
    });
  } else {
    steps.push({
      id: "enable-durable-store",
      label: "Enable a durable store",
      description: "Persistence is read-only: PATCH returns 409 and run data is held only in-process — it won't survive redeploy.",
      status: "blocked",
      href: "/settings",
      hint: `Mode "${persistenceMode}" is read-only. Switch to "database" or set WORKSPACE_CONFIG_ALLOW_FS_WRITE for filesystem.`,
      cta: "Switch to a durable store",
    });
  }

  if (hasRunEvidence && isDurable) {
    steps.push({
      id: "verify-run-durability",
      label: "Verify run durability",
      description: "Workflow runs are recorded and the store is durable — evidence will survive redeploy.",
      status: "complete",
      href: "/workflows",
      cta: "Review runs",
    });
  } else if (hasRunEvidence && !isDurable) {
    steps.push({
      id: "verify-run-durability",
      label: "Verify run durability",
      description: "Workflow runs exist but the store is read-only. This evidence is ephemeral and will be lost on redeploy.",
      status: "blocked",
      href: "/workflows",
      hint: "Enable a durable store to preserve the run records you've already produced.",
      cta: "Review affected runs",
    });
  } else {
    steps.push({
      id: "verify-run-durability",
      label: "Verify run durability",
      description: "After workflows run, this confirms run evidence is persisted to the durable store.",
      status: "optional",
      href: "/workflows",
      cta: "Open workflows",
    });
  }

  const { totalCount, completedCount, complete, nextStepId } = scoreLensSteps(steps);

  let headline;
  let subheadline;
  if (complete && steps.every((step) => step.status !== "blocked")) {
    headline = "Workspace persistence is durable.";
    subheadline = "Run evidence and source records will survive redeploy.";
  } else if (!modeResolved) {
    headline = "Persistence mode is not configured.";
    subheadline = "Next: choose a persistence mode in settings.";
  } else if (isReadOnly && hasRunEvidence) {
    headline = "Store is read-only — run evidence is ephemeral.";
    subheadline = "Next: switch to a durable store to preserve existing runs.";
  } else if (isReadOnly) {
    headline = "Store is read-only — runs won't survive redeploy.";
    subheadline = "Next: enable a durable adapter or allow filesystem writes.";
  } else {
    headline = "Durable store active.";
    subheadline = "Run a workflow to confirm end-to-end durability.";
  }

  return {
    kind: LENS_STATE_KIND,
    lensId: "persistence",
    title: "Runtime persistence",
    headline,
    subheadline,
    complete,
    completedCount,
    totalCount,
    nextStepId,
    steps,
  };
}

/**
 * Orchestration-health / observability lens (roadmap Item 3 — derivation).
 *
 * Rolls up run-state deltas across every sandbox-environment workflow row into
 * legible counts (healthy / failing / never-run) and points at the next action
 * — launch an idle workflow or fix a failing one. This is the surface that
 * makes an agent swarm's work steerable rather than opaque.
 */
function deriveObservabilityLensState(input = {}) {
  const cfg = isPlainObject(input?.workspaceConfig) ? input.workspaceConfig : {};
  const graph = isPlainObject(input?.metadataGraph) ? input.metadataGraph : {};

  const rows = collectSandboxRows(cfg);
  let healthy = 0;
  let failing = 0;
  let neverRun = 0;
  for (const row of rows) {
    const { status } = deriveLatestRunStatus(row);
    if (status === "ok") healthy += 1;
    else if (status === "failed") failing += 1;
    else neverRun += 1;
  }
  const workflowsTotal = rows.length;
  const agents = Array.isArray(graph?.runtime?.agents) ? graph.runtime.agents.length : 0;
  const rollup = { workflowsTotal, healthy, failing, neverRun, agents };

  const steps = [
    {
      id: "have-workflow",
      label: "Register a workflow",
      description: "Add at least one sandbox-environment workflow to begin orchestration.",
      status: workflowsTotal > 0 ? "complete" : "pending",
      href: "/workflows",
      cta: workflowsTotal > 0 ? "Open Workflows" : "New workflow",
    },
    {
      id: "first-healthy-run",
      label: "Land a healthy run",
      description: "At least one workflow must complete successfully.",
      status: healthy > 0 ? "complete" : (workflowsTotal === 0 ? "blocked" : "pending"),
      href: "/workflows",
      hint: workflowsTotal === 0 ? "Register a workflow first." : "",
      cta: healthy > 0 ? "View runs" : "Run a workflow",
    },
    {
      id: "resolve-failures",
      label: "Resolve failing runs",
      description: "Every failing workflow should be fixed or disabled.",
      status: workflowsTotal === 0 ? "pending" : (failing > 0 ? "blocked" : "complete"),
      href: "/workflows",
      hint: failing > 0 ? `${failing} workflow${failing === 1 ? " is" : "s are"} failing — open the run trace.` : "",
      cta: failing > 0 ? "Open failing runs" : "Review",
    },
    {
      id: "launch-next",
      label: "Launch idle workflows",
      description: "Kick off any workflow that has never run.",
      status: neverRun > 0 ? "pending" : (workflowsTotal > 0 ? "complete" : "optional"),
      href: "/workflows",
      hint: neverRun > 0 ? `${neverRun} workflow${neverRun === 1 ? " has" : "s have"} never run.` : "",
      cta: neverRun > 0 ? "Launch workflow" : "Review",
    },
  ];

  // Drop empty hints so the rendered panel stays clean.
  for (const step of steps) {
    if (!step.hint) delete step.hint;
  }

  const { totalCount, completedCount, complete, nextStepId } = scoreLensSteps(steps);

  let headline;
  let subheadline;
  if (workflowsTotal === 0) {
    headline = "No workflows registered yet.";
    subheadline = "Add a workflow to start tracking orchestration health.";
  } else {
    const parts = [];
    if (healthy > 0) parts.push(`${healthy} healthy`);
    if (failing > 0) parts.push(`${failing} failing`);
    if (neverRun > 0) parts.push(`${neverRun} never run`);
    headline = `${workflowsTotal} workflow${workflowsTotal === 1 ? "" : "s"}: ${parts.join(", ")}.`;
    if (failing > 0) {
      subheadline = `Next: fix ${failing} failing workflow${failing === 1 ? "" : "s"}.`;
    } else if (neverRun > 0) {
      subheadline = `Next: launch ${neverRun} idle workflow${neverRun === 1 ? "" : "s"}.`;
    } else {
      subheadline = "All workflows are healthy.";
    }
  }

  return {
    kind: LENS_STATE_KIND,
    lensId: "observability",
    title: "Orchestration health",
    headline,
    subheadline,
    complete,
    completedCount,
    totalCount,
    nextStepId,
    steps,
    rollup,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Lens registry + composed workspace state (roadmap Item 1 — the keystone)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Shared runtime-durability read used by the deploy + app-build lenses. Mirrors
 * the persistence lens truth table but as a small reusable descriptor.
 */
function deriveRuntimeDurability(metadataGraph) {
  const rt = isPlainObject(metadataGraph?.runtime) ? metadataGraph.runtime : {};
  const mode = safeString(rt.persistenceMode).trim();
  const adapter = safeString(rt.persistenceAdapter).trim();
  const allowFs = rt.allowFsWrite === true;
  return {
    mode,
    adapter,
    allowFs,
    resolved: mode !== "",
    durable: (mode === "database" && adapter !== "") || (mode === "filesystem" && allowFs),
    readOnly: mode === "read-only" || (mode === "filesystem" && !allowFs),
  };
}

/**
 * Deploy-readiness lens (roadmap Item 5 — derivation).
 *
 * Pure derivation over deploy-check-shaped runtime signals
 * (`metadataGraph.runtime.deploy`) + persistence durability + provenance. It
 * never shells out and never fetches; it reads whatever safe deploy signal the
 * runtime already exposes and otherwise emits a pending step into settings.
 */
function deriveDeployLensState(input = {}) {
  const cfg = isPlainObject(input?.workspaceConfig) ? input.workspaceConfig : {};
  const graph = isPlainObject(input?.metadataGraph) ? input.metadataGraph : {};
  const rt = isPlainObject(graph?.runtime) ? graph.runtime : {};
  const deploy = isPlainObject(rt.deploy) ? rt.deploy : {};
  const provenance = deriveProvenance(cfg);
  const dur = deriveRuntimeDurability(graph);

  const target = safeString(deploy.target || rt.deployTarget).trim();
  const surfaceResolved = Boolean(target) || provenance.hasProvenance;
  const hasEnvSignal = deploy.envReady !== undefined || Array.isArray(deploy.envVarsNeeded);
  const envReady = deploy.envReady === true
    || (Array.isArray(deploy.envVarsNeeded) && deploy.envVarsNeeded.length === 0);
  const checkPassed = deploy.checkPassed === true;
  const hasCheckSignal = deploy.checkPassed !== undefined;
  const deployed = deploy.deployed === true;

  const steps = [
    {
      id: "resolve-app-surface",
      label: "Resolve the app surface",
      description: surfaceResolved
        ? `Deploy surface resolved${target ? ` (target: ${target})` : ""}.`
        : "Identify the app surface and deploy target for this workspace.",
      status: surfaceResolved ? "complete" : "pending",
      href: "/settings",
      cta: surfaceResolved ? "Review" : "Open settings",
    },
    {
      id: "verify-env",
      label: "Verify required env vars",
      description: envReady
        ? "All required environment variables are present."
        : "Confirm the runtime has every required environment variable before deploy.",
      status: envReady ? "complete" : "pending",
      href: "/settings",
      hint: hasEnvSignal && !envReady && Array.isArray(deploy.envVarsNeeded)
        ? `Missing ${deploy.envVarsNeeded.length} required env var${deploy.envVarsNeeded.length === 1 ? "" : "s"}.`
        : "",
      cta: "Open settings",
    },
    {
      id: "verify-persistence",
      label: "Verify durable persistence",
      description: dur.durable
        ? "Persistence is durable — deployed runs will survive redeploy."
        : "A deploy needs durable persistence so run state isn't lost on redeploy.",
      status: dur.durable ? "complete" : (dur.readOnly ? "blocked" : "pending"),
      href: "/settings",
      hint: dur.durable
        ? ""
        : (dur.readOnly
          ? "Persistence is read-only — switch to a durable store before deploying."
          : "Resolve a persistence mode first."),
      cta: "Open persistence",
    },
    {
      id: "run-deploy-check",
      label: "Run the deploy check",
      description: checkPassed
        ? "Deploy check passed."
        : "Run the deploy check and resolve any missing steps before shipping.",
      status: checkPassed ? "complete" : (dur.durable ? "pending" : "blocked"),
      href: "/settings",
      hint: checkPassed
        ? ""
        : (dur.durable
          ? (hasCheckSignal ? "Deploy check reported missing steps." : "Run the deploy check to surface missing steps.")
          : "Make persistence durable first."),
      cta: "Open settings",
    },
    {
      id: "deploy-or-review",
      label: deployed ? "Review deployment" : "Deploy the app",
      description: deployed
        ? "The app is deployed — review the live deployment."
        : "Once checks pass, deploy the app to your target runtime.",
      status: deployed ? "complete" : "optional",
      href: "/settings",
      cta: deployed ? "Review" : "Deploy",
    },
  ];
  for (const step of steps) {
    if (!step.hint) delete step.hint;
  }

  const { totalCount, completedCount, complete, nextStepId } = scoreLensSteps(steps);
  const headline = complete
    ? "This workspace is deploy-ready."
    : (dur.readOnly
      ? "Deploy blocked — persistence is read-only."
      : "Get this workspace deploy-ready.");
  const nextStep = steps.find((s) => s.id === nextStepId);
  const subheadline = complete
    ? "Review the live deployment or ship an update."
    : (nextStep ? `Next: ${nextStep.label.toLowerCase()}.` : "Resolve the remaining deploy steps.");

  return {
    kind: LENS_STATE_KIND,
    lensId: "deploy",
    title: "Deploy readiness",
    headline,
    subheadline,
    complete,
    completedCount,
    totalCount,
    nextStepId,
    steps,
  };
}

/**
 * Task-management lens (roadmap Item 6 — derivation).
 *
 * Pure derivation over governed Data Model rows. Detects a governed task object
 * (objectType "task" or a task-named custom object) and/or source-backed task
 * rows (a "task"-named data-source, e.g. the project-management Project Task
 * Source). Never creates rows and never invents a schema.
 */
function deriveTaskLensState(input = {}) {
  const cfg = isPlainObject(input?.workspaceConfig) ? input.workspaceConfig : {};
  const objects = Array.isArray(cfg?.dataModel?.objects) ? cfg.dataModel.objects : [];
  const SYSTEM_TYPES = new Set(["api-registry", "sandbox-environment", "data-source"]);
  const nameBlob = (o) => `${safeString(o.id)} ${safeString(o.name)} ${safeString(o.label)}`.toLowerCase();

  const taskObject = objects.find((o) => isPlainObject(o) && safeString(o.objectType) === "task")
    || objects.find((o) => isPlainObject(o)
      && !SYSTEM_TYPES.has(safeString(o.objectType))
      && /\btask/.test(nameBlob(o)));
  const sourceTaskObject = objects.find((o) => isPlainObject(o)
    && safeString(o.objectType) === "data-source"
    && /\btask/.test(nameBlob(o)));

  const hasGoverned = Boolean(taskObject);
  const hasSourceBacked = Boolean(sourceTaskObject);
  const taskRows = taskObject ? listObjectRows(taskObject) : [];
  const sourceRows = sourceTaskObject ? listObjectRows(sourceTaskObject) : [];
  const rowsPresent = taskRows.length > 0 || sourceRows.length > 0;
  const ownersAssigned = taskRows.some((r) => isPlainObject(r)
    && safeString(r.owner || r.assignee || r.Assignee || r.status || r.Status).trim() !== "");
  const blockedTasks = taskRows.some((r) => isPlainObject(r) && /block/i.test(safeString(r.status || r.Status)));

  const taskBoundToView = (Array.isArray(cfg?.dashboards) ? cfg.dashboards : []).some((d) => {
    const tabs = Array.isArray(d?.tabs) ? d.tabs : [];
    return tabs.some((t) => (Array.isArray(t?.widgets) ? t.widgets : []).some((w) => {
      const binding = isPlainObject(w?.config?.binding) ? w.config.binding : {};
      return taskObject && safeString(binding.objectId).trim() === safeString(taskObject.id).trim();
    }));
  });

  const steps = [
    {
      id: "create-task-object",
      label: "Create or connect a task object",
      description: hasGoverned
        ? "A governed task object exists in your Data Model."
        : (hasSourceBacked
          ? "Source-backed task rows are present — model a governed task object to manage them."
          : "Add a governed task object (or connect a task source) in the Data Model."),
      status: hasGoverned ? "complete" : "pending",
      href: "/data-model",
      cta: hasGoverned ? "Open Data Model" : "Create task object",
    },
    {
      id: "add-task-rows",
      label: "Add active tasks",
      description: rowsPresent
        ? "Task rows are present."
        : "Add task rows (or refresh the task source) so there's work to manage.",
      status: rowsPresent ? "complete" : ((hasGoverned || hasSourceBacked) ? "pending" : "blocked"),
      href: "/data-model",
      hint: rowsPresent || hasGoverned || hasSourceBacked ? "" : "Create a task object first.",
      cta: rowsPresent ? "Review tasks" : "Add tasks",
    },
    {
      id: "assign-owners-status",
      label: "Assign owners and status",
      description: ownersAssigned
        ? "Tasks carry owner/status values."
        : "Set an owner and status on tasks so the swarm and humans can coordinate.",
      status: ownersAssigned ? "complete" : (rowsPresent ? "pending" : "blocked"),
      href: "/data-model",
      hint: ownersAssigned || rowsPresent ? "" : "Add task rows first.",
      cta: "Open Data Model",
    },
    {
      id: "resolve-blocked-tasks",
      label: "Resolve blocked tasks",
      description: blockedTasks
        ? "Some tasks are marked blocked — clear them."
        : "No blocked tasks. This stays quiet until a task is blocked.",
      status: blockedTasks ? "pending" : "optional",
      href: "/data-model",
      cta: blockedTasks ? "Review blocked" : "Review",
    },
    {
      id: "bind-task-view",
      label: "Bind a task view",
      description: taskBoundToView
        ? "A dashboard view is bound to the task object."
        : "Bind the task object to a View widget so tasks are visible on a dashboard.",
      status: taskBoundToView ? "complete" : (hasGoverned ? "pending" : "blocked"),
      href: "/",
      hint: taskBoundToView || hasGoverned ? "" : "Create a governed task object first.",
      cta: taskBoundToView ? "Open dashboard" : "Bind view",
    },
  ];
  for (const step of steps) {
    if (!step.hint) delete step.hint;
  }

  const { totalCount, completedCount, complete, nextStepId } = scoreLensSteps(steps);
  const headline = complete
    ? "Task management is set up."
    : (hasGoverned || hasSourceBacked ? "Finish wiring task management." : "Set up task management.");
  const nextStep = steps.find((s) => s.id === nextStepId);
  const subheadline = complete
    ? "Humans and the swarm manage tasks on the same surface."
    : (nextStep ? `Next: ${nextStep.label.toLowerCase()}.` : "Tasks are ready to manage.");

  return {
    kind: LENS_STATE_KIND,
    lensId: "tasks",
    title: "Task management",
    headline,
    subheadline,
    complete,
    completedCount,
    totalCount,
    nextStepId,
    steps,
  };
}

/**
 * Application-buildout lens (roadmap Item 7 — derivation).
 *
 * A readiness lens (it scaffolds nothing) that activates after the primary
 * activation loop has progress and points from "I have pieces" toward "I have
 * a deployable application": modeled object → dashboard → workflow → run
 * evidence → durable persistence → deploy readiness → packaged surface.
 */
function deriveAppBuildLensState(input = {}) {
  const cfg = isPlainObject(input?.workspaceConfig) ? input.workspaceConfig : {};
  const objects = Array.isArray(cfg?.dataModel?.objects) ? cfg.dataModel.objects : [];
  const HIDDEN = new Set([
    "workspace-helper-sandbox", "nav-folders", "helper-threads",
    "sandbox-environments", "workflow-api-registry", "workspace-ui-cache",
  ]);
  const userObjects = objects.filter((o) => isPlainObject(o)
    && safeString(o.id).trim()
    && !HIDDEN.has(o.id)
    && o.objectType !== "api-registry"
    && o.objectType !== "sandbox-environment");
  const dashboards = Array.isArray(cfg?.dashboards) ? cfg.dashboards : [];
  const widgetCount = dashboards.reduce((acc, d) => acc
    + (Array.isArray(d?.tabs) ? d.tabs : []).reduce((a, t) => a + (Array.isArray(t?.widgets) ? t.widgets : []).length, 0), 0);
  const sandboxRows = collectSandboxRows(cfg);
  const workflowCreated = sandboxRows.length > 0;
  const healthyRun = sandboxRows.some((r) => deriveLatestRunStatus(r).ok);

  const dur = deriveRuntimeDurability(input?.metadataGraph);
  const deployReady = deriveDeployLensState(input).complete;

  const steps = [
    {
      id: "model-object",
      label: "Model a business object",
      description: userObjects.length > 0 ? `${userObjects.length} object${userObjects.length === 1 ? "" : "s"} modeled.` : "Model the core business object your app revolves around.",
      status: userObjects.length > 0 ? "complete" : "pending",
      href: "/data-model",
      cta: userObjects.length > 0 ? "Open Data Model" : "Model object",
    },
    {
      id: "build-dashboard",
      label: "Build a dashboard surface",
      description: (dashboards.length > 0 && widgetCount > 0) ? "A dashboard with widgets is in place." : "Build a dashboard with at least one bound widget.",
      status: (dashboards.length > 0 && widgetCount > 0) ? "complete" : (userObjects.length > 0 ? "pending" : "blocked"),
      href: "/",
      hint: (dashboards.length > 0 && widgetCount > 0) || userObjects.length > 0 ? "" : "Model an object first.",
      cta: "Open Builder",
    },
    {
      id: "add-workflow",
      label: "Add a workflow runtime",
      description: workflowCreated ? "A workflow runtime is registered." : "Add a workflow so the app can act, not just display.",
      status: workflowCreated ? "complete" : "pending",
      href: "/workflows",
      cta: workflowCreated ? "Open Workflows" : "New workflow",
    },
    {
      id: "land-run",
      label: "Land run evidence",
      description: healthyRun ? "A workflow has run successfully." : "Run the workflow at least once to produce evidence.",
      status: healthyRun ? "complete" : (workflowCreated ? "pending" : "blocked"),
      href: "/workflows",
      hint: healthyRun || workflowCreated ? "" : "Add a workflow first.",
      cta: healthyRun ? "View runs" : "Run workflow",
    },
    {
      id: "durable-persistence",
      label: "Verify durable persistence",
      description: dur.durable ? "Persistence is durable." : "Make persistence durable so the app keeps its state.",
      status: dur.durable ? "complete" : (dur.readOnly ? "blocked" : "pending"),
      href: "/settings",
      hint: dur.durable ? "" : (dur.readOnly ? "Persistence is read-only — switch to a durable store." : "Resolve a persistence mode."),
      cta: "Open persistence",
    },
    {
      id: "deploy-ready",
      label: "Verify deploy readiness",
      description: deployReady ? "The app is deploy-ready." : "Clear the deploy-readiness checks.",
      status: deployReady ? "complete" : "pending",
      href: "/settings",
      cta: "Open deploy",
    },
    {
      id: "package-surface",
      label: "Package the app surface",
      description: "Export or package the workspace as a distributable application surface.",
      status: (userObjects.length > 0 && dashboards.length > 0 && workflowCreated && healthyRun && dur.durable && deployReady) ? "pending" : "optional",
      href: "/settings",
      cta: "Package app",
    },
  ];
  for (const step of steps) {
    if (!step.hint) delete step.hint;
  }

  const { totalCount, completedCount, complete, nextStepId } = scoreLensSteps(steps);
  const started = userObjects.length > 0 || dashboards.length > 0 || workflowCreated;
  const headline = complete
    ? "This workspace is a deployable application."
    : (started ? "Build this workspace into a full application." : "Start building a full application.");
  const nextStep = steps.find((s) => s.id === nextStepId);
  const subheadline = complete
    ? "Package or export the app surface."
    : (nextStep ? `Next: ${nextStep.label.toLowerCase()}.` : "Keep assembling the application.");

  return {
    kind: LENS_STATE_KIND,
    lensId: "app-build",
    title: "Application buildout",
    headline,
    subheadline,
    complete,
    completedCount,
    totalCount,
    nextStepId,
    steps,
  };
}

/**
 * The lens registry. The activation deriver is the `primary` lens (it keeps
 * its own v1 state kind for backwards compatibility); every other entry is a
 * secondary lens that plugs into the same panel and the same swarm packet.
 * Adding a roadmap item is "register a deriver" — no new surface.
 *
 * NB: a Fleet / multi-app lens (roadmap Item 4) is intentionally NOT registered
 * — the exported workspace runtime exposes no in-artifact multi-app surface
 * registry to derive from. See docs/ROADMAP_IMPACT_ITEMS_V1.md (it stays staged
 * until a runtime surface-metadata source exists).
 */
const WORKSPACE_LENS_REGISTRY = [
  { id: "activation", title: "Activation", primary: true, derive: deriveWorkspaceActivationState },
  { id: "persistence", title: "Runtime persistence", primary: false, derive: derivePersistenceLensState },
  { id: "observability", title: "Orchestration health", primary: false, derive: deriveObservabilityLensState },
  { id: "deploy", title: "Deploy readiness", primary: false, derive: deriveDeployLensState },
  { id: "tasks", title: "Task management", primary: false, derive: deriveTaskLensState },
  { id: "app-build", title: "Application buildout", primary: false, derive: deriveAppBuildLensState },
];

function getLensEntry(lensId) {
  return WORKSPACE_LENS_REGISTRY.find((entry) => entry.id === lensId) || null;
}

/**
 * Compose every registered lens into a single workspace state and resolve the
 * one highest-value next action across the whole workspace: prefer the primary
 * activation step, then fall back to the first incomplete secondary lens.
 */
function deriveWorkspaceState(input = {}) {
  const safeInput = {
    workspaceConfig: isPlainObject(input.workspaceConfig) ? input.workspaceConfig : {},
    workspaceSourceRecords: isPlainObject(input.workspaceSourceRecords) ? input.workspaceSourceRecords : {},
    metadataGraph: isPlainObject(input.metadataGraph) ? input.metadataGraph : null,
  };

  const primaryEntry = WORKSPACE_LENS_REGISTRY.find((entry) => entry.primary);
  const primary = primaryEntry.derive(safeInput);
  const lenses = {};
  for (const entry of WORKSPACE_LENS_REGISTRY) {
    if (entry.primary) continue;
    lenses[entry.id] = entry.derive(safeInput);
  }

  const stepFromState = (lensId, state) => {
    if (!state || !state.nextStepId) return null;
    const step = (state.steps || []).find((s) => s.id === state.nextStepId);
    if (!step) return null;
    return { lensId, stepId: step.id, label: step.label, status: step.status, href: step.href || "/" };
  };

  let nextAction = null;
  if (!primary.complete) nextAction = stepFromState("activation", primary);
  if (!nextAction) {
    for (const entry of WORKSPACE_LENS_REGISTRY) {
      if (entry.primary) continue;
      const state = lenses[entry.id];
      if (state && !state.complete) {
        nextAction = stepFromState(entry.id, state);
        if (nextAction) break;
      }
    }
  }

  const complete = primary.complete
    && WORKSPACE_LENS_REGISTRY.every((entry) => entry.primary || lenses[entry.id].complete);

  return {
    kind: WORKSPACE_STATE_KIND,
    version: 1,
    primary,
    lenses,
    nextAction,
    complete,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Swarm-assignable condition packet (roadmap Item 8)
// ───────────────────────────────────────────────────────────────────────────

/** Derive the safe tool surface available to an agent operating this workspace. */
function deriveAvailableTools(workspaceConfig) {
  const tools = [
    "workspace UI (same surfaces a human uses)",
    "PATCH /api/workspace (dashboards | widgetTypes | canvas | dataModel)",
  ];
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects)
    ? workspaceConfig.dataModel.objects
    : [];
  const hasRegistry = objects.some((o) => isPlainObject(o) && o.objectType === "api-registry");
  const hasSandbox = objects.some((o) => isPlainObject(o) && o.objectType === "sandbox-environment");
  if (hasRegistry) tools.push("Nango proxy (/api/workspace/integrations/nango/proxy)");
  if (hasSandbox) tools.push("sandbox-run (POST /api/workspace/sandbox-run)");
  return tools;
}

/**
 * Compose any registered lens into the swarm assignment shape: a single
 * read-only packet that hands an agent (or a swarm) a workspace *condition*
 * instead of a vague prompt — goal, current state, the blocked step, its
 * prerequisite, the tools available, and the evidence it must produce. The
 * human panel and this packet read the identical derived state.
 */
function deriveSwarmConditionPacket(input = {}, options = {}) {
  const safeInput = {
    workspaceConfig: isPlainObject(input.workspaceConfig) ? input.workspaceConfig : {},
    workspaceSourceRecords: isPlainObject(input.workspaceSourceRecords) ? input.workspaceSourceRecords : {},
    metadataGraph: isPlainObject(input.metadataGraph) ? input.metadataGraph : null,
  };
  const lensId = safeString(options.lensId).trim() || "activation";
  const entry = getLensEntry(lensId) || getLensEntry("activation");
  const state = entry.derive(safeInput);
  const steps = Array.isArray(state.steps) ? state.steps : [];

  const blocked = steps.find((s) => s.status === "blocked") || null;
  const nextStep = steps.find((s) => s.id === state.nextStepId) || null;
  const blockedStep = blocked || nextStep;
  // The prerequisite is the last completed step before the blocker, surfaced
  // as guidance (the blocker's own hint already explains *why*).
  const prerequisite = blockedStep
    ? (safeString(blockedStep.hint).trim() || "Complete the prior step to unblock this one.")
    : null;

  return {
    kind: SWARM_PACKET_KIND,
    version: 1,
    lensId: entry.id,
    goal: safeString(state.headline).trim() || `Activate the ${safeString(state.title || state.templateName).trim()} workspace.`,
    currentState: `${state.completedCount}/${state.totalCount}`,
    complete: Boolean(state.complete),
    nextAction: nextStep
      ? { stepId: nextStep.id, label: nextStep.label, href: nextStep.href || "/", status: nextStep.status }
      : null,
    blockedStep: blockedStep
      ? { stepId: blockedStep.id, label: blockedStep.label, status: blockedStep.status }
      : null,
    prerequisite,
    availableTools: deriveAvailableTools(safeInput.workspaceConfig),
    expectedEvidence: [
      "run record (sandbox-environment row lastResponse)",
      "hydrated source records",
      "dashboard rollup reflecting the new state",
    ],
  };
}

export {
  ACTIVATION_KIND,
  ACTIVATION_VERSION,
  TEMPLATE_PROJECT_MANAGEMENT,
  LENS_STATE_KIND,
  WORKSPACE_STATE_KIND,
  SWARM_PACKET_KIND,
  deriveWorkspaceActivationState,
  deriveProjectManagementActivationState,
  deriveBlankWorkspaceActivationState,
  deriveProvenance,
  hasConnectionId,
  hasSourceRecords,
  // Workspace State Lens registry (roadmap Item 1) + lenses (Items 2, 3, 5, 6, 7)
  WORKSPACE_LENS_REGISTRY,
  getLensEntry,
  deriveWorkspaceState,
  deriveRuntimeDurability,
  derivePersistenceLensState,
  deriveObservabilityLensState,
  deriveDeployLensState,
  deriveTaskLensState,
  deriveAppBuildLensState,
  // Swarm-assignable condition packet (roadmap Item 8)
  deriveSwarmConditionPacket,
};
