/**
 * Workspace Creation Readiness V1 — governed creation loop derivation.
 *
 * Pure derivation over workspaceConfig + sidecar + env + persistence. Answers
 * the operator north-star questions without fake booleans:
 *
 *   1. What am I creating?
 *   2. Where does this state live?
 *   3. Is this portable config, server secret, server file, or runtime sidecar?
 *   4. Is it ready?
 *   5. What changed?
 *   6. What failed?
 *   7. What do I do next?
 *   8. Can I test it now?
 *   9. Can I safely activate it?
 *  10. Can I recover without guessing?
 *
 * Never includes secret values. Never mutates inputs.
 */

import { buildEnvKeyCatalog } from "./workspace-env-catalog.js";
import { isEnvRefConfigured } from "./workspace-env-resolver.js";
import {
  isApiRegistrySetupComplete,
  isApiRegistryTestSuccessful,
} from "./orchestration-graph.js";

const READINESS_KIND = "growthub-workspace-creation-readiness-v1";
const ACTIVATION_CHECKS_KIND = "growthub-creation-activation-checks-v1";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeString(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

function listObjects(workspaceConfig, objectType) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects)
    ? workspaceConfig.dataModel.objects
    : [];
  return objects.filter((o) => isPlainObject(o) && (!objectType || o.objectType === objectType));
}

function listRows(object) {
  return Array.isArray(object?.rows) ? object.rows : [];
}

function hasSourceRecords(workspaceSourceRecords, sourceId) {
  const key = safeString(sourceId).trim();
  if (!key || !isPlainObject(workspaceSourceRecords)) return false;
  const bucket = workspaceSourceRecords[key];
  if (!isPlainObject(bucket)) return false;
  if (Number.isFinite(bucket.recordCount) && bucket.recordCount > 0) return true;
  return Array.isArray(bucket.records) && bucket.records.length > 0;
}

function checkStatus(passed, blocked = false) {
  if (passed) return "ready";
  if (blocked) return "blocked";
  return "missing";
}

/**
 * Per-artifact activation checks derived from real workspace state.
 */
function deriveCreationActivationChecks(input = {}) {
  const cfg = isPlainObject(input?.workspaceConfig) ? input.workspaceConfig : {};
  const sidecar = isPlainObject(input?.workspaceSourceRecords) ? input.workspaceSourceRecords : {};
  const env = input?.env && typeof input.env === "object" ? input.env : process.env;
  const persistence = isPlainObject(input?.persistence) ? input.persistence : {};
  const canSave = persistence.canSave === true;
  const canWriteEnv = input?.canWriteEnv === true || canSave;

  const apiObjects = listObjects(cfg, "api-registry");
  const apiRows = apiObjects.flatMap((o) => listRows(o));
  const dataSourceObjects = listObjects(cfg, "data-source");
  const dataSourceRows = dataSourceObjects.flatMap((o) => listRows(o));
  const sandboxObjects = listObjects(cfg, "sandbox-environment");
  const sandboxRows = sandboxObjects.flatMap((o) => listRows(o));

  const catalog = buildEnvKeyCatalog(cfg, env, { discover: true });

  const checks = [];

  checks.push({
    id: "persistence-writable",
    label: "Config persistence",
    status: checkStatus(canSave, !canSave),
    sourceOfTruth: "describePersistenceMode",
    missing: canSave ? null : "Writable runtime required to save config changes",
    nextAction: canSave ? null : "Set WORKSPACE_CONFIG_ALLOW_FS_WRITE=true or use local dev",
    href: "/",
    surface: "home",
    stateKind: "runtime",
  });

  checks.push({
    id: "env-write-capable",
    label: "Env secret writes",
    status: checkStatus(canWriteEnv, !canWriteEnv),
    sourceOfTruth: "persistence.canSave + .env.local gate",
    missing: canWriteEnv ? null : "Cannot write .env.local in this runtime",
    nextAction: canWriteEnv ? null : "Use local dev or enable filesystem writes",
    href: "/settings/apis-webhooks",
    surface: "settings",
    stateKind: "server-secret",
  });

  checks.push({
    id: "api-registry-exists",
    label: "API Registry row",
    status: checkStatus(apiRows.length > 0),
    sourceOfTruth: "dataModel.objects[api-registry].rows",
    missing: apiRows.length > 0 ? null : "No API Registry rows",
    nextAction: apiRows.length > 0 ? null : "Register an API",
    href: "/data-model?wizard=register-api",
    surface: "register-api-wizard",
    stateKind: "portable-config",
  });

  const completeApiRows = apiRows.filter((row) => isApiRegistrySetupComplete(row));
  checks.push({
    id: "api-registry-complete",
    label: "API identity + contract",
    status: checkStatus(completeApiRows.length > 0, apiRows.length > 0 && completeApiRows.length === 0),
    sourceOfTruth: "api-registry row fields",
    missing: completeApiRows.length > 0 ? null : "API row missing required fields",
    nextAction: "Complete API setup in Register API wizard",
    href: "/data-model?wizard=register-api",
    surface: "register-api-wizard",
    stateKind: "portable-config",
  });

  const authRefs = [...new Set(apiRows.map((r) => safeString(r?.authRef).trim()).filter(Boolean))];
  const unresolvedAuth = authRefs.filter((ref) => !isEnvRefConfigured(ref, env));
  checks.push({
    id: "auth-ref-resolves",
    label: "Auth references resolve",
    status: checkStatus(authRefs.length > 0 && unresolvedAuth.length === 0, authRefs.length > 0 && unresolvedAuth.length > 0),
    sourceOfTruth: "env-key-catalog + process.env",
    missing: unresolvedAuth.length > 0 ? `Missing env: ${unresolvedAuth.join(", ")}` : (authRefs.length === 0 ? "No authRef on API rows" : null),
    nextAction: unresolvedAuth.length > 0 ? "Save secrets in Settings → APIs & Webhooks" : (authRefs.length === 0 ? "Set authRef on API row" : null),
    href: "/settings/apis-webhooks",
    surface: "settings",
    stateKind: "server-secret",
  });

  const testedRows = apiRows.filter((row) => isApiRegistryTestSuccessful(row));
  checks.push({
    id: "api-test-passed",
    label: "API test passed",
    status: checkStatus(testedRows.length > 0, apiRows.some((r) => safeString(r?.status).toLowerCase() === "failed")),
    sourceOfTruth: "api-registry row.status",
    missing: testedRows.length > 0 ? null : "API not successfully tested",
    nextAction: "Test API from Register API wizard or row drawer",
    href: "/data-model",
    surface: "api-registry",
    stateKind: "receipt",
  });

  checks.push({
    id: "data-source-linked",
    label: "Data Source linked",
    status: checkStatus(dataSourceRows.length > 0),
    sourceOfTruth: "dataModel.objects[data-source].rows",
    missing: dataSourceRows.length > 0 ? null : "No Data Source rows",
    nextAction: "Create a Data Source from API Registry output",
    href: "/data-model?wizard=data-source",
    surface: "data-source-creation",
    stateKind: "portable-config",
  });

  const sourcesWithRecords = dataSourceRows.filter((row) => {
    const sourceId = safeString(row?.sourceId || row?.id || row?.Name).trim();
    return hasSourceRecords(sidecar, sourceId);
  });
  checks.push({
    id: "source-records-exist",
    label: "Source records populated",
    status: checkStatus(sourcesWithRecords.length > 0, dataSourceRows.length > 0 && sourcesWithRecords.length === 0),
    sourceOfTruth: "growthub.source-records.json",
    missing: sourcesWithRecords.length > 0 ? null : "Refresh source to populate sidecar",
    nextAction: "Test refresh on Data Source row",
    href: "/data-model",
    surface: "data-source",
    stateKind: "runtime-sidecar",
  });

  checks.push({
    id: "sandbox-exists",
    label: "Sandbox / Workflow row",
    status: checkStatus(sandboxRows.length > 0),
    sourceOfTruth: "dataModel.objects[sandbox-environment].rows",
    missing: sandboxRows.length > 0 ? null : "No sandbox-environment workflow",
    nextAction: "Create workflow from API or open Workflow Cockpit",
    href: "/workflows",
    surface: "workflow-cockpit",
    stateKind: "portable-config",
  });

  const serverlessRows = sandboxRows.filter((r) => safeString(r?.runLocality).toLowerCase() === "serverless");
  const serverlessMissingScheduler = serverlessRows.filter((r) => !safeString(r?.schedulerRegistryId).trim());
  checks.push({
    id: "scheduler-configured",
    label: "Serverless scheduler",
    status: checkStatus(serverlessRows.length === 0 || serverlessMissingScheduler.length === 0, serverlessMissingScheduler.length > 0),
    sourceOfTruth: "sandbox-environment.schedulerRegistryId",
    missing: serverlessMissingScheduler.length > 0 ? "Serverless row missing schedulerRegistryId" : null,
    nextAction: serverlessMissingScheduler.length > 0 ? "Configure scheduler on sandbox row" : null,
    href: "/workflows",
    surface: "workflow-cockpit",
    stateKind: "portable-config",
  });

  const successfulRuns = sandboxRows.filter((r) => safeString(r?.lastRunStatus || r?.status).toLowerCase() === "ok"
    || safeString(r?.lastRunStatus || r?.status).toLowerCase() === "success");
  checks.push({
    id: "last-run-succeeded",
    label: "Last run succeeded",
    status: checkStatus(successfulRuns.length > 0, sandboxRows.some((r) => safeString(r?.lastRunStatus).toLowerCase() === "failed")),
    sourceOfTruth: "sandbox row lastRunStatus / run sidecar",
    missing: successfulRuns.length > 0 ? null : "No successful sandbox run yet",
    nextAction: "Run workflow from Workflow Cockpit",
    href: "/workflows",
    surface: "workflow-cockpit",
    stateKind: "receipt",
  });

  const publishedRows = sandboxRows.filter((r) => safeString(r?.lifecycleStatus).toLowerCase() === "live"
    || safeString(r?.publishStatus).toLowerCase() === "live");
  checks.push({
    id: "workflow-published",
    label: "Workflow published live",
    status: checkStatus(publishedRows.length > 0),
    sourceOfTruth: "sandbox row lifecycleStatus",
    missing: publishedRows.length > 0 ? null : "Workflow not published live",
    nextAction: "Publish from Workflow Cockpit",
    href: "/workflows",
    surface: "workflow-cockpit",
    stateKind: "receipt",
  });

  const readyCount = checks.filter((c) => c.status === "ready").length;
  const blocked = checks.filter((c) => c.status === "blocked");
  const missing = checks.filter((c) => c.status === "missing");
  const next = blocked[0] || missing[0] || null;

  return {
    kind: ACTIVATION_CHECKS_KIND,
    checks,
    summary: {
      total: checks.length,
      ready: readyCount,
      blocked: blocked.length,
      missing: missing.length,
      activationReady: blocked.length === 0 && missing.length === 0,
    },
    nextCheck: next,
    envCatalogSummary: catalog.summary,
  };
}

/**
 * Workspace home / readiness surface — runtime + creation loop health.
 */
function deriveWorkspaceCreationReadiness(input = {}) {
  const activation = deriveCreationActivationChecks(input);
  const persistence = isPlainObject(input?.persistence) ? input.persistence : {};
  const cfg = isPlainObject(input?.workspaceConfig) ? input.workspaceConfig : {};

  const apiRows = listObjects(cfg, "api-registry").flatMap((o) => listRows(o));
  const dataSourceRows = listObjects(cfg, "data-source").flatMap((o) => listRows(o));
  const sandboxRows = listObjects(cfg, "sandbox-environment").flatMap((o) => listRows(o));

  let scenario = "fresh-workspace";
  if (!persistence.canSave) scenario = "read-only-runtime";
  else if (activation.envCatalogSummary?.missing > 0) scenario = "missing-env-keys";
  else if (apiRows.length > 0 && !apiRows.some((r) => isApiRegistryTestSuccessful(r))) scenario = "api-untested";
  else if (apiRows.some((r) => isApiRegistryTestSuccessful(r)) && dataSourceRows.length === 0) scenario = "api-tested-no-source";
  else if (sandboxRows.length > 0 && !sandboxRows.some((r) => safeString(r?.lastRunId).trim())) scenario = "workflow-not-runnable";
  else if (activation.summary.activationReady) scenario = "fully-activated";
  else if (persistence.canSave && (apiRows.length > 0 || dataSourceRows.length > 0 || sandboxRows.length > 0)) {
    scenario = "writable-local-runtime";
  }

  return {
    kind: READINESS_KIND,
    scenario,
    persistence: {
      mode: persistence.mode || "unknown",
      canSave: persistence.canSave === true,
      canWriteEnv: input?.canWriteEnv === true || persistence.canSave === true,
      guidance: persistence.guidance || null,
    },
    surfaces: {
      apiRegistry: { count: apiRows.length, tested: apiRows.filter((r) => isApiRegistryTestSuccessful(r)).length },
      dataSource: { count: dataSourceRows.length },
      sandbox: { count: sandboxRows.length },
      env: activation.envCatalogSummary,
    },
    activation,
    nextAction: activation.nextCheck
      ? { label: activation.nextCheck.nextAction || activation.nextCheck.label, href: activation.nextCheck.href, surface: activation.nextCheck.surface }
      : null,
  };
}

export {
  READINESS_KIND,
  ACTIVATION_CHECKS_KIND,
  deriveCreationActivationChecks,
  deriveWorkspaceCreationReadiness,
};
