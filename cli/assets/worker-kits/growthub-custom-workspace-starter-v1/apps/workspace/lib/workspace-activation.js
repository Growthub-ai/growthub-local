/**
 * Growthub Workspace Activation Layer V1 — pure derivation helper.
 *
 * Reduces the gap between "I exported a workspace" and "I got value from
 * the workspace" by translating the existing governed artifacts into a
 * goal-first checklist. The helper itself is read-only: no fetch, no
 * React, no config mutation, no secrets. It runs identically on the
 * server (route handlers) and the client (panel render).
 *
 * Authority order is preserved:
 *
 *   1. growthub.config.json              (governed artifact)
 *   2. growthub.source-records.json      (live-source sidecar state)
 *   3. workspace metadata graph          (derived, read-only)
 *   4. runtime status (env / adapter)    (optional, never persisted)
 *
 * Output shape:
 *
 *   {
 *     kind: "growthub-workspace-activation-v1",
 *     version: 1,
 *     template:    { id, name, kind, isBlank, privacy }
 *     title:        string,
 *     summary:      string,
 *     completedSteps: number,
 *     totalSteps:     number,
 *     progress:       number (0..1),
 *     done:           boolean,
 *     nextStepId:     string | null,
 *     steps:          ActivationStep[],
 *     warnings:       string[]
 *   }
 *
 *   ActivationStep:
 *   {
 *     id:          string,
 *     label:       string,
 *     description: string,
 *     status:      "complete" | "incomplete" | "blocked",
 *     help?:       string,
 *     link?:       { kind, pathname, query?, label }
 *   }
 *
 * Invariants:
 *   - Never throws. Returns warnings instead.
 *   - Never echoes secret values. The only signals consumed are presence
 *     booleans ("is NANGO_SECRET_KEY set?") never raw values.
 *   - Generic activation interface; template-specific logic only lives in
 *     the template adapter (deriveProjectManagementActivationState).
 */

const ACTIVATION_KIND = "growthub-workspace-activation-v1";
const ACTIVATION_VERSION = 1;

const PROJECT_MANAGEMENT_TEMPLATE_ID = "project-management";
const PROJECT_MANAGEMENT_REGISTRY_OBJECT_ID = "api-registry";
const PROJECT_MANAGEMENT_REGISTRY_ROW_ID = "asana-active-tasks";
const PROJECT_MANAGEMENT_SOURCE_OBJECT_ID = "project-task-source";
const PROJECT_MANAGEMENT_SANDBOX_OBJECT_ID = "sandbox-environments";
const PROJECT_MANAGEMENT_WORKFLOW_ROW_NAME = "project-active-tasks-workflow";
const PROJECT_MANAGEMENT_SOURCE_ID = "project-active-tasks";
const PROJECT_MANAGEMENT_DASHBOARD_ID = "project-management-template";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeString(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

function safeTrim(value) {
  return safeString(value).trim();
}

function findObjectById(workspaceConfig, objectId) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects)
    ? workspaceConfig.dataModel.objects
    : [];
  return objects.find((o) => isPlainObject(o) && safeTrim(o.id) === objectId) || null;
}

function findRowByName(object, rowName) {
  // Tolerate both `rows` (canonical, used post-init) and `records` (used by
  // seeded config files — merged into the workspace config at init time).
  const rows = Array.isArray(object?.rows)
    ? object.rows
    : Array.isArray(object?.records)
      ? object.records
      : [];
  return rows.find((r) => isPlainObject(r) && (
    safeTrim(r.Name) === rowName
    || safeTrim(r.name) === rowName
    || safeTrim(r.integrationId) === rowName
  )) || null;
}

function findDashboardById(workspaceConfig, dashboardId) {
  const dashboards = Array.isArray(workspaceConfig?.dashboards) ? workspaceConfig.dashboards : [];
  return dashboards.find((d) => isPlainObject(d) && safeTrim(d.id) === dashboardId) || null;
}

function countSourceRecords(workspaceSourceRecords, sourceId) {
  if (!isPlainObject(workspaceSourceRecords) || !sourceId) return 0;
  const entry = workspaceSourceRecords[sourceId];
  if (!isPlainObject(entry)) return 0;
  if (Number.isFinite(entry.recordCount)) return Number(entry.recordCount);
  return Array.isArray(entry.records) ? entry.records.length : 0;
}

function parseConnectionIds(value) {
  if (Array.isArray(value)) {
    return value.map((v) => safeTrim(v)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

function deriveTemplateDescriptor(workspaceConfig) {
  const provenance = isPlainObject(workspaceConfig?.provenance) ? workspaceConfig.provenance : null;
  const id = safeTrim(provenance?.template);
  if (id === PROJECT_MANAGEMENT_TEMPLATE_ID) {
    return {
      id: PROJECT_MANAGEMENT_TEMPLATE_ID,
      name: safeTrim(workspaceConfig?.name) || "Project Management Workspace",
      kind: safeTrim(provenance?.templateKind) || "workspace-template",
      isBlank: false,
      privacy: safeTrim(provenance?.privacy) || ""
    };
  }
  return {
    id: id || "blank",
    name: safeTrim(workspaceConfig?.name) || "Workspace",
    kind: safeTrim(provenance?.templateKind) || "blank",
    isBlank: !id,
    privacy: safeTrim(provenance?.privacy) || ""
  };
}

function deriveNangoRuntimeStatus(runtimeStatus) {
  // Optional, never persisted. The activation panel may pass an enriched
  // status from the route handler (which reads describeNangoAdapter()
  // server-side). Absent → unknown.
  if (!isPlainObject(runtimeStatus)) return { nangoConfigured: null };
  if (isPlainObject(runtimeStatus.nango)) {
    return {
      nangoConfigured: typeof runtimeStatus.nango.hasSecretKey === "boolean"
        ? runtimeStatus.nango.hasSecretKey
        : null
    };
  }
  if (typeof runtimeStatus.nangoConfigured === "boolean") {
    return { nangoConfigured: runtimeStatus.nangoConfigured };
  }
  return { nangoConfigured: null };
}

function stepFromStatus(status) {
  return status === "complete";
}

function selectNextStep(steps) {
  const next = steps.find((step) => step.status !== "complete");
  return next ? next.id : null;
}

function summarize(template, completedSteps, totalSteps) {
  const remaining = Math.max(0, totalSteps - completedSteps);
  if (remaining === 0) {
    return template.isBlank
      ? "Your workspace is fully set up. Customize objects, widgets, or workflows next."
      : "You're all set. Run the workflow again or customize the dashboard to extend it.";
  }
  if (template.id === PROJECT_MANAGEMENT_TEMPLATE_ID) {
    return `You are ${remaining} step${remaining === 1 ? "" : "s"} away from your first task dashboard.`;
  }
  return `You are ${remaining} step${remaining === 1 ? "" : "s"} away from a running workspace.`;
}

/**
 * Activation state for a blank governed workspace.
 *
 * Generic starter actions — does not assume any seeded template, only the
 * primitives every workspace has.
 */
function deriveBlankWorkspaceActivationState({ workspaceConfig, workspaceSourceRecords } = {}) {
  const warnings = [];
  const safeConfig = isPlainObject(workspaceConfig) ? workspaceConfig : {};
  const template = deriveTemplateDescriptor(safeConfig);

  const objects = Array.isArray(safeConfig?.dataModel?.objects) ? safeConfig.dataModel.objects : [];
  const userObjects = objects.filter((o) => isPlainObject(o)
    && safeTrim(o.objectType) !== "sandbox-environment"
    && safeTrim(o.objectType) !== "api-registry"
    && safeTrim(o.objectType) !== "data-source"
    && safeTrim(o.id) !== "helper-threads"
    && safeTrim(o.id) !== "nav-folders"
    && safeTrim(o.id) !== "workspace-helper-sandbox");

  const dashboards = Array.isArray(safeConfig?.dashboards) ? safeConfig.dashboards : [];
  const dashboardWithWidgets = dashboards.find((d) => isPlainObject(d) && Array.isArray(d.tabs)
    && d.tabs.some((t) => Array.isArray(t?.widgets) && t.widgets.length > 0));
  const anyDashboard = dashboards.find((d) => isPlainObject(d));

  const sandboxObjects = objects.filter((o) => isPlainObject(o) && safeTrim(o.objectType) === "sandbox-environment");
  const workflowRow = sandboxObjects
    .flatMap((o) => (Array.isArray(o.rows) ? o.rows : []))
    .find((r) => isPlainObject(r) && safeTrim(r.orchestrationConfig || r.orchestrationGraph) !== "");
  const hasWorkflowRun = sandboxObjects
    .flatMap((o) => (Array.isArray(o.rows) ? o.rows : []))
    .some((r) => isPlainObject(r) && safeTrim(r.lastRunId) !== "");

  const steps = [
    {
      id: "create-object",
      label: "Create a Data Model object",
      description: "Start with a custom object to hold the rows your workspace will work with.",
      status: userObjects.length > 0 ? "complete" : "incomplete",
      link: { kind: "data-model", pathname: "/data-model", query: {}, label: "Open Data Model" }
    },
    {
      id: "create-dashboard",
      label: "Create a dashboard",
      description: "Dashboards visualize Data Model rows. Add one from the Builder.",
      status: anyDashboard ? "complete" : "incomplete",
      link: { kind: "builder", pathname: "/", query: {}, label: "Open Builder" }
    },
    {
      id: "add-widget",
      label: "Add a widget",
      description: "Bind a chart or table widget to your Data Model.",
      status: dashboardWithWidgets ? "complete" : "incomplete",
      link: anyDashboard
        ? { kind: "builder", pathname: "/", query: { dashboard: anyDashboard.id }, label: "Open dashboard" }
        : { kind: "builder", pathname: "/", query: {}, label: "Open Builder" }
    },
    {
      id: "create-workflow",
      label: "Create a workflow",
      description: "Workflows orchestrate API calls, transforms, and runs.",
      status: workflowRow ? "complete" : "incomplete",
      link: { kind: "workflows", pathname: "/workflows", query: {}, label: "Open Workflows" }
    },
    {
      id: "run-workflow",
      label: "Run a workflow",
      description: "Run the workflow to hydrate data and produce a result.",
      status: hasWorkflowRun ? "complete" : "incomplete",
      link: { kind: "workflows", pathname: "/workflows", query: {}, label: "Open Workflows" }
    }
  ];

  const completedSteps = steps.filter((s) => stepFromStatus(s.status)).length;
  const totalSteps = steps.length;

  return {
    kind: ACTIVATION_KIND,
    version: ACTIVATION_VERSION,
    template,
    title: template.name,
    summary: summarize(template, completedSteps, totalSteps),
    completedSteps,
    totalSteps,
    progress: totalSteps === 0 ? 0 : completedSteps / totalSteps,
    done: completedSteps === totalSteps,
    nextStepId: selectNextStep(steps),
    steps,
    warnings
  };
}

/**
 * Activation state for the Project Management Workspace Template.
 *
 * The five-step setup mirrors the customer journey described in the
 * Customer Activation Layer V1 spec:
 *
 *   1. Set runtime env / NANGO_SECRET_KEY
 *   2. Connect provider through Nango
 *   3. Paste / check connectionId
 *   4. Run active tasks workflow
 *   5. View active tasks dashboard
 *
 * Each step is derived purely from the workspace config + source-records
 * sidecar (plus an optional `runtimeStatus` envelope that exposes safe
 * server-side adapter booleans).
 */
function deriveProjectManagementActivationState({ workspaceConfig, workspaceSourceRecords, runtimeStatus } = {}) {
  const warnings = [];
  const safeConfig = isPlainObject(workspaceConfig) ? workspaceConfig : {};
  const template = deriveTemplateDescriptor(safeConfig);

  const registryObject = findObjectById(safeConfig, PROJECT_MANAGEMENT_REGISTRY_OBJECT_ID);
  const registryRow = registryObject ? findRowByName(registryObject, PROJECT_MANAGEMENT_REGISTRY_ROW_ID) : null;
  if (!registryRow) {
    warnings.push(`Missing API Registry row "${PROJECT_MANAGEMENT_REGISTRY_ROW_ID}" — template scaffolding may have been edited.`);
  }

  const sandboxObject = findObjectById(safeConfig, PROJECT_MANAGEMENT_SANDBOX_OBJECT_ID);
  const sandboxRow = sandboxObject ? findRowByName(sandboxObject, PROJECT_MANAGEMENT_WORKFLOW_ROW_NAME) : null;
  if (!sandboxRow) {
    warnings.push(`Missing seeded workflow row "${PROJECT_MANAGEMENT_WORKFLOW_ROW_NAME}".`);
  }

  const dashboard = findDashboardById(safeConfig, PROJECT_MANAGEMENT_DASHBOARD_ID);
  const { nangoConfigured } = deriveNangoRuntimeStatus(runtimeStatus);

  const connectionIds = parseConnectionIds(registryRow?.connectionIds);
  const hasConnectionId = connectionIds.length > 0;
  const rowStatus = safeTrim(registryRow?.status).toLowerCase();
  const isConnected = rowStatus === "connected";

  const sourceRowCount = countSourceRecords(workspaceSourceRecords, PROJECT_MANAGEMENT_SOURCE_ID);
  const lastRunId = safeTrim(sandboxRow?.lastRunId);
  const lifecycleStatus = safeTrim(sandboxRow?.lifecycleStatus).toLowerCase();
  const hasRun = Boolean(lastRunId) || sourceRowCount > 0;

  // Step 1 — runtime env. When the runtime status envelope is unavailable
  // (e.g. on the client before /api/workspace returns) we mark the step as
  // "incomplete" rather than "blocked" so the user still sees actionable
  // guidance.
  const envStatus = nangoConfigured === true
    ? "complete"
    : nangoConfigured === false ? "blocked" : "incomplete";

  const steps = [
    {
      id: "set-nango-secret",
      label: "Add NANGO_SECRET_KEY",
      description: "Nango is the integration backbone for this template. Set NANGO_SECRET_KEY in .env.local, then restart the workspace server.",
      status: envStatus,
      help: envStatus === "blocked"
        ? "Server reports NANGO_SECRET_KEY is missing. Workflows that depend on Nango will not run until it's set."
        : envStatus === "complete"
          ? "NANGO_SECRET_KEY is configured server-side."
          : "Set the secret before continuing.",
      link: {
        kind: "settings",
        pathname: "/settings/integrations",
        query: {},
        label: "Open integration settings"
      }
    },
    {
      id: "connect-provider",
      label: "Connect provider through Nango",
      description: "Create a Nango Connect Session for the api-registry row and complete OAuth with your provider.",
      status: registryRow ? (hasConnectionId ? "complete" : "incomplete") : "blocked",
      help: registryRow
        ? hasConnectionId
          ? "Provider connection is recorded on the API Registry row."
          : "Open the API Registry row and click Create Connect Session."
        : "Template API Registry row is missing.",
      link: {
        kind: "data-model",
        pathname: "/data-model",
        query: { object: PROJECT_MANAGEMENT_REGISTRY_OBJECT_ID, row: PROJECT_MANAGEMENT_REGISTRY_ROW_ID },
        label: "Open API Registry row"
      }
    },
    {
      id: "verify-connection",
      label: "Verify connection",
      description: "Run Check Connection on the Nango panel to confirm the provider returns a valid response.",
      status: isConnected ? "complete" : (hasConnectionId ? "incomplete" : "blocked"),
      help: isConnected
        ? "Last verification succeeded."
        : hasConnectionId
          ? "Paste the connectionId Nango returns, then click Check Connection."
          : "Complete the previous step first.",
      link: {
        kind: "data-model",
        pathname: "/data-model",
        query: { object: PROJECT_MANAGEMENT_REGISTRY_OBJECT_ID, row: PROJECT_MANAGEMENT_REGISTRY_ROW_ID },
        label: "Open Nango panel"
      }
    },
    {
      id: "run-workflow",
      label: "Run Active Tasks workflow",
      description: "Execute the seeded workflow to pull active tasks and persist them to the project-task-source.",
      status: hasRun ? "complete" : (isConnected ? "incomplete" : "blocked"),
      help: hasRun
        ? lastRunId
          ? `Last run id: ${lastRunId}.`
          : `${sourceRowCount} active task${sourceRowCount === 1 ? "" : "s"} hydrated.`
        : isConnected
          ? "Open the workflow and click Test."
          : "Verify the connection before running.",
      link: {
        kind: "workflows",
        pathname: "/workflows",
        query: {
          object: PROJECT_MANAGEMENT_SANDBOX_OBJECT_ID,
          row: PROJECT_MANAGEMENT_WORKFLOW_ROW_NAME,
          field: "orchestrationConfig"
        },
        label: "Open Active Tasks workflow"
      }
    },
    {
      id: "view-dashboard",
      label: "View Project Management dashboard",
      description: "Inspect active tasks on the seeded dashboard.",
      status: dashboard
        ? (sourceRowCount > 0 ? "complete" : "incomplete")
        : "blocked",
      help: dashboard
        ? sourceRowCount > 0
          ? `${sourceRowCount} row${sourceRowCount === 1 ? "" : "s"} available in project-task-source.`
          : "Dashboard exists. Run the workflow to hydrate rows."
        : "Template dashboard is missing.",
      link: dashboard
        ? { kind: "builder", pathname: "/", query: { dashboard: PROJECT_MANAGEMENT_DASHBOARD_ID }, label: "Open dashboard" }
        : { kind: "builder", pathname: "/", query: {}, label: "Open Builder" }
    }
  ];

  const completedSteps = steps.filter((s) => stepFromStatus(s.status)).length;
  const totalSteps = steps.length;

  // Lifecycle hint — if the seeded workflow is still a draft, surface a
  // gentle warning instead of mutating the row.
  if (sandboxRow && lifecycleStatus === "draft" && hasConnectionId) {
    warnings.push("Seeded workflow is still in draft. Publish it after the first successful test run.");
  }

  return {
    kind: ACTIVATION_KIND,
    version: ACTIVATION_VERSION,
    template,
    title: template.name,
    summary: summarize(template, completedSteps, totalSteps),
    completedSteps,
    totalSteps,
    progress: totalSteps === 0 ? 0 : completedSteps / totalSteps,
    done: completedSteps === totalSteps,
    nextStepId: selectNextStep(steps),
    steps,
    warnings
  };
}

/**
 * Top-level entrypoint. Dispatches to the template-specific adapter based on
 * the workspace's provenance. Unknown templates fall back to the blank
 * activation interface.
 */
function deriveWorkspaceActivationState({ workspaceConfig, workspaceSourceRecords, metadataGraph, runtimeStatus } = {}) {
  const safeConfig = isPlainObject(workspaceConfig) ? workspaceConfig : {};
  const template = deriveTemplateDescriptor(safeConfig);
  if (template.id === PROJECT_MANAGEMENT_TEMPLATE_ID) {
    return deriveProjectManagementActivationState({
      workspaceConfig: safeConfig,
      workspaceSourceRecords,
      metadataGraph,
      runtimeStatus
    });
  }
  return deriveBlankWorkspaceActivationState({
    workspaceConfig: safeConfig,
    workspaceSourceRecords,
    metadataGraph,
    runtimeStatus
  });
}

export {
  ACTIVATION_KIND,
  ACTIVATION_VERSION,
  PROJECT_MANAGEMENT_TEMPLATE_ID,
  PROJECT_MANAGEMENT_REGISTRY_OBJECT_ID,
  PROJECT_MANAGEMENT_REGISTRY_ROW_ID,
  PROJECT_MANAGEMENT_SANDBOX_OBJECT_ID,
  PROJECT_MANAGEMENT_WORKFLOW_ROW_NAME,
  PROJECT_MANAGEMENT_SOURCE_ID,
  PROJECT_MANAGEMENT_DASHBOARD_ID,
  deriveWorkspaceActivationState,
  deriveProjectManagementActivationState,
  deriveBlankWorkspaceActivationState,
  deriveTemplateDescriptor
};
