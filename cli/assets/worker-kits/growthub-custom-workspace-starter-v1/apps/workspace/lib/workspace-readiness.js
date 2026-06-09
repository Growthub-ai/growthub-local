/**
 * Workspace Readiness V1 — operator-facing runtime capability projection.
 *
 * Pure derivation from workspace config + persistence mode + env catalog.
 * Answers: can this workspace create, connect, write files, save secrets,
 * run workflows, and deploy?
 */

import { buildEnvKeyCatalog } from "./workspace-env-catalog.js";
import { describeRegisteredResolvers } from "./adapters/integrations/source-resolver-registry.js";

const READINESS_KIND = "growthub-workspace-readiness-v1";

function safeString(value) {
  return value == null ? "" : String(value).trim();
}

function listApiRegistryRows(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const rows = [];
  for (const object of objects) {
    if (object?.objectType !== "api-registry") continue;
    for (const row of Array.isArray(object.rows) ? object.rows : []) rows.push(row);
  }
  return rows;
}

function listDataSourceRows(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const rows = [];
  for (const object of objects) {
    if (object?.objectType !== "data-source") continue;
    for (const row of Array.isArray(object.rows) ? object.rows : []) rows.push(row);
  }
  return rows;
}

function listSandboxRows(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const rows = [];
  for (const object of objects) {
    if (object?.objectType !== "sandbox-environment") continue;
    for (const row of Array.isArray(object.rows) ? object.rows : []) rows.push(row);
  }
  return rows;
}

function deriveWorkspaceReadiness(input, env = process.env) {
  const workspaceConfig = input?.workspaceConfig || {};
  const persistence = input?.persistence || { mode: "filesystem", canSave: true };
  const envCatalog = buildEnvKeyCatalog(workspaceConfig, env);
  const apiRows = listApiRegistryRows(workspaceConfig);
  const sourceRows = listDataSourceRows(workspaceConfig);
  const sandboxRows = listSandboxRows(workspaceConfig);
  const resolvers = describeRegisteredResolvers?.() || [];
  const testedApis = apiRows.filter((r) => safeString(r?.status).toLowerCase() === "connected");
  const untestedApis = apiRows.filter((r) => r && safeString(r?.status).toLowerCase() !== "connected");
  const runnableSandboxes = sandboxRows.filter((r) => safeString(r?.Name));

  const checks = [
    {
      id: "persistence",
      label: "Config persistence",
      status: persistence.canSave ? "ready" : "blocked",
      detail: persistence.canSave ? persistence.saveLabel || "Writable runtime" : persistence.reason || "Read-only runtime",
      href: "/settings/workspace",
      nextAction: persistence.canSave ? null : "Set WORKSPACE_CONFIG_ALLOW_FS_WRITE=true or edit config locally",
    },
    {
      id: "env-write",
      label: "Secret storage",
      status: persistence.canSave ? "ready" : "blocked",
      detail: persistence.canSave ? "Settings can write .env.local" : "Cannot write secrets in read-only runtime",
      href: "/settings/apis-webhooks",
      nextAction: persistence.canSave ? null : "Use a writable runtime to save secrets",
    },
    {
      id: "env-resolution",
      label: "Env resolution",
      status: envCatalog.summary.missing === 0 && envCatalog.summary.total > 0 ? "ready"
        : envCatalog.summary.configured > 0 ? "partial" : envCatalog.summary.total > 0 ? "blocked" : "empty",
      detail: `${envCatalog.summary.configured}/${envCatalog.summary.total} keys configured`,
      href: "/settings/apis-webhooks",
      nextAction: envCatalog.summary.missing > 0 ? "Save missing secrets in Settings → APIs & Webhooks" : apiRows.length ? null : "Register an API to declare env keys",
    },
    {
      id: "resolver-registry",
      label: "Resolver registry",
      status: resolvers.length > 0 ? "ready" : apiRows.length > 0 ? "partial" : "empty",
      detail: `${resolvers.length} resolver${resolvers.length === 1 ? "" : "s"} registered`,
      href: "/data-model?helper=register_api",
      nextAction: resolvers.length === 0 && apiRows.length > 0 ? "Generate or upload a resolver when normalization is required" : null,
    },
    {
      id: "api-registry",
      label: "API Registry",
      status: testedApis.length > 0 ? "ready" : apiRows.length > 0 ? "partial" : "empty",
      detail: apiRows.length ? `${testedApis.length}/${apiRows.length} tested` : "No APIs registered",
      href: "/data-model?wizard=register-api",
      nextAction: untestedApis.length > 0 ? "Test registered APIs" : apiRows.length === 0 ? "Register your first API" : null,
    },
    {
      id: "data-sources",
      label: "Data Sources",
      status: sourceRows.length > 0 ? "ready" : testedApis.length > 0 ? "partial" : "empty",
      detail: `${sourceRows.length} source${sourceRows.length === 1 ? "" : "s"}`,
      href: "/data-model",
      nextAction: sourceRows.length === 0 && testedApis.length > 0 ? "Create a Data Source from a tested API" : null,
    },
    {
      id: "sandbox",
      label: "Sandbox / Workflow",
      status: runnableSandboxes.some((r) => safeString(r?.status).toLowerCase() === "connected") ? "ready"
        : runnableSandboxes.length > 0 ? "partial" : "empty",
      detail: `${runnableSandboxes.length} sandbox row${runnableSandboxes.length === 1 ? "" : "s"}`,
      href: "/workflows",
      nextAction: runnableSandboxes.length === 0 && sourceRows.length > 0 ? "Wire a Sandbox Environment workflow" : null,
    },
    {
      id: "scheduler",
      label: "Serverless scheduler",
      status: sandboxRows.some((r) => safeString(r?.runLocality) === "serverless" && safeString(r?.schedulerRegistryId)) ? "ready"
        : sandboxRows.some((r) => safeString(r?.runLocality) === "serverless") ? "blocked" : "optional",
      detail: sandboxRows.filter((r) => safeString(r?.runLocality) === "serverless").length
        ? `${sandboxRows.filter((r) => safeString(r?.runLocality) === "serverless" && safeString(r?.schedulerRegistryId)).length} scheduled`
        : "Local-only or not configured",
      href: "/data-model",
      nextAction: sandboxRows.some((r) => safeString(r?.runLocality) === "serverless" && !safeString(r?.schedulerRegistryId))
        ? "Pick a scheduler API Registry row for serverless sandboxes" : null,
    },
  ];

  const blockers = checks.filter((c) => c.status === "blocked");
  const next = checks.find((c) => c.nextAction && c.status !== "ready") || null;

  let scenario = "fresh";
  if (!persistence.canSave) scenario = "read-only";
  else if (apiRows.length === 0 && sourceRows.length === 0 && sandboxRows.length === 0) scenario = "fresh";
  else if (envCatalog.summary.missing > 0) scenario = "missing-env";
  else if (apiRows.length > 0 && testedApis.length === 0) scenario = "api-untested";
  else if (testedApis.length > 0 && sourceRows.length === 0) scenario = "no-data-source";
  else if (runnableSandboxes.length > 0 && !runnableSandboxes.some((r) => safeString(r?.status).toLowerCase() === "connected")) {
    scenario = "workflow-not-runnable";
  } else if (testedApis.length > 0 && sourceRows.length > 0) {
    scenario = "activated";
  } else if (persistence.canSave) {
    scenario = "writable";
  }

  return {
    kind: READINESS_KIND,
    scenario,
    persistence,
    envCatalog: {
      summary: envCatalog.summary,
      entries: envCatalog.entries.map((e) => ({ slug: e.slug, source: e.source, configured: e.configured, inUse: e.inUse })),
    },
    checks,
    blockers,
    nextBestAction: next ? { checkId: next.id, label: next.nextAction, href: next.href } : null,
    counts: {
      apiRegistry: apiRows.length,
      apiTested: testedApis.length,
      dataSources: sourceRows.length,
      sandboxes: sandboxRows.length,
      resolvers: resolvers.length,
    },
  };
}

export { READINESS_KIND, deriveWorkspaceReadiness };
