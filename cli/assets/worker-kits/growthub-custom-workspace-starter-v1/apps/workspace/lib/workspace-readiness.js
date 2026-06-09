/**
 * Workspace Readiness V1 — operator-facing runtime capability projection.
 *
 * Answers: can this workspace create, connect, write files, save secrets, run
 * workflows, and deploy? Pure derivation — no secrets, no mutation.
 */

import { buildEnvKeyCatalog } from "./workspace-env-catalog.js";
import { deriveWorkspaceActivationState } from "./workspace-activation.js";

const READINESS_KIND = "growthub-workspace-readiness-v1";

const TESTED_STATUSES = new Set(["connected", "approved", "ok", "success", "tested"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function listObjects(workspaceConfig, objectType) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  return objects.filter((o) => !objectType || o?.objectType === objectType);
}

function countRows(objects) {
  return objects.reduce((sum, o) => sum + (Array.isArray(o?.rows) ? o.rows.length : 0), 0);
}

function apiRegistryHealth(workspaceConfig) {
  const objects = listObjects(workspaceConfig, "api-registry");
  const rows = objects.flatMap((o) => (Array.isArray(o.rows) ? o.rows : []));
  const tested = rows.filter((r) => TESTED_STATUSES.has(String(r?.status || "").toLowerCase()));
  return {
    objectCount: objects.length,
    rowCount: rows.length,
    testedCount: tested.length,
    untestedCount: rows.length - tested.length,
    healthy: rows.length > 0 && tested.length === rows.length,
  };
}

function dataSourceHealth(workspaceConfig, sourceRecords) {
  const objects = listObjects(workspaceConfig, "data-source");
  const rows = objects.flatMap((o) => (Array.isArray(o.rows) ? o.rows : []));
  let withRecords = 0;
  for (const row of rows) {
    const sourceId = String(row?.sourceId || row?.id || "").trim();
    if (!sourceId || !isPlainObject(sourceRecords)) continue;
    const sidecar = sourceRecords[sourceId];
    if (sidecar?.recordCount > 0 || (Array.isArray(sidecar?.records) && sidecar.records.length > 0)) {
      withRecords += 1;
    }
  }
  return {
    objectCount: objects.length,
    rowCount: rows.length,
    withSourceRecords: withRecords,
    healthy: rows.length > 0 && withRecords > 0,
  };
}

function sandboxHealth(workspaceConfig) {
  const objects = listObjects(workspaceConfig, "sandbox-environment");
  const rows = objects.flatMap((o) => (Array.isArray(o.rows) ? o.rows : []));
  const runnable = rows.filter((r) => String(r?.command || r?.orchestrationConfig || "").trim());
  const serverless = rows.filter((r) => String(r?.runLocality || "").toLowerCase() === "serverless");
  const withScheduler = serverless.filter((r) => String(r?.schedulerRegistryId || "").trim());
  return {
    objectCount: objects.length,
    rowCount: rows.length,
    runnableCount: runnable.length,
    serverlessCount: serverless.length,
    schedulerReadyCount: withScheduler.length,
    healthy: rows.length > 0 && runnable.length > 0,
  };
}

function deriveScenario(readiness) {
  const { persistence, env, apiRegistry, dataSource, sandbox, activation } = readiness;
  if (!persistence.canSave) return "read-only-deployed-runtime";
  if (env.summary.missing > 0 && env.summary.total > 0) return "missing-env-keys";
  if (apiRegistry.rowCount === 0) return "fresh-workspace";
  if (apiRegistry.untestedCount > 0) return "api-registered-but-untested";
  if (apiRegistry.testedCount > 0 && dataSource.rowCount === 0) return "api-tested-but-no-data-source";
  if (sandbox.rowCount > 0 && sandbox.runnableCount === 0) return "workflow-configured-but-not-runnable";
  if (activation.complete) return "fully-activated";
  return "writable-local-runtime";
}

function nextBestAction(scenario, readiness) {
  const actions = {
    "fresh-workspace": { label: "Register your first API", href: "/data-model?lane=register-api", surface: "register-api-wizard" },
    "read-only-deployed-runtime": { label: "Enable writable runtime or edit config locally", href: "/settings", surface: "settings" },
    "missing-env-keys": { label: "Save missing secrets in Settings", href: "/settings/apis-webhooks", surface: "settings-apis-webhooks" },
    "api-registered-but-untested": { label: "Test your API connection", href: "/data-model?objectType=api-registry", surface: "data-model" },
    "api-tested-but-no-data-source": { label: "Create a Data Source from your API", href: "/data-model?lane=create-source", surface: "data-source-creation" },
    "workflow-configured-but-not-runnable": { label: "Complete sandbox workflow configuration", href: "/workflows", surface: "workflow-cockpit" },
    "writable-local-runtime": { label: "Continue setup in Activation", href: "/workspace-lens", surface: "activation-lens" },
    "fully-activated": { label: "Run your live workflow", href: "/workflows", surface: "workflow-cockpit" },
  };
  return actions[scenario] || actions["writable-local-runtime"];
}

/**
 * @param {object} workspaceConfig
 * @param {object} sourceRecords
 * @param {object} persistence - from describePersistenceMode()
 * @param {object} env - process.env
 */
function deriveWorkspaceReadiness(workspaceConfig, sourceRecords = {}, persistence = {}, env = process.env) {
  const envCatalog = buildEnvKeyCatalog(workspaceConfig, env);
  const activation = deriveWorkspaceActivationState({ workspaceConfig, workspaceSourceRecords: sourceRecords });
  const apiRegistry = apiRegistryHealth(workspaceConfig);
  const dataSource = dataSourceHealth(workspaceConfig, sourceRecords);
  const sandbox = sandboxHealth(workspaceConfig);

  const readiness = {
    kind: READINESS_KIND,
    persistence: {
      mode: persistence.mode || "unknown",
      canSave: persistence.canSave === true,
      canWriteEnv: persistence.canSave === true,
      canWriteResolver: persistence.canSave === true,
      reason: persistence.reason || null,
      guidance: persistence.guidance || null,
    },
    env: envCatalog,
    resolverRegistry: {
      writable: persistence.canSave === true,
      note: "Resolver files live under lib/adapters/integrations/resolvers/",
    },
    apiRegistry,
    dataSource,
    sandbox,
    scheduler: {
      serverlessRows: sandbox.serverlessCount,
      configured: sandbox.schedulerReadyCount,
      healthy: sandbox.serverlessCount === 0 || sandbox.schedulerReadyCount === sandbox.serverlessCount,
    },
    activation: {
      complete: activation.complete === true,
      completedCount: activation.completedCount,
      totalCount: activation.totalCount,
      nextStepId: activation.nextStepId,
      blockers: (activation.steps || []).filter((s) => s.status === "blocked" || s.status === "pending"),
    },
  };

  const scenario = deriveScenario({ ...readiness, activation });
  return {
    ...readiness,
    scenario,
    nextAction: nextBestAction(scenario, readiness),
  };
}

export {
  READINESS_KIND,
  deriveWorkspaceReadiness,
  apiRegistryHealth,
  dataSourceHealth,
  sandboxHealth,
};
