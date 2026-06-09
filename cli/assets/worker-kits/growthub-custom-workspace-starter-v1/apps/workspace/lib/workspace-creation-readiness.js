/**
 * Governed Creation Readiness V1 — derived operator journey state.
 *
 * Answers the ten product questions across the creation loop without fake
 * booleans. Pure derivation over workspaceConfig, source records, env, and
 * persistence metadata.
 */

import { buildEnvKeyCatalog } from "./workspace-env-catalog.js";
import { isEnvRefConfigured, resolveEnvRefsMeta } from "./workspace-env-resolver.js";
import { deriveRuntimeDurability } from "./workspace-activation.js";

const READINESS_KIND = "growthub-creation-readiness-v1";

function clean(value) {
  return String(value ?? "").trim();
}

function listObjects(workspaceConfig, objectType) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  return objects.filter((o) => !objectType || o?.objectType === objectType);
}

function listRows(objects) {
  const rows = [];
  for (const object of objects) {
    for (const row of Array.isArray(object?.rows) ? object.rows : []) rows.push({ object, row });
  }
  return rows;
}

function hasSourceRecords(workspaceSourceRecords, sourceId) {
  const key = clean(sourceId);
  if (!key) return false;
  const sidecar = workspaceSourceRecords?.[key];
  if (!sidecar || typeof sidecar !== "object") return false;
  if (Number.isFinite(sidecar.recordCount) && sidecar.recordCount > 0) return true;
  return Array.isArray(sidecar.records) && sidecar.records.length > 0;
}

function deriveCheck(id, label, ok, source, missing, href, cta) {
  return {
    id,
    label,
    status: ok ? "complete" : "pending",
    sourceOfTruth: source,
    missingItem: ok ? "" : missing,
    href: href || "/",
    cta: cta || "Open",
  };
}

function deriveCreationReadiness(input = {}) {
  const workspaceConfig = input.workspaceConfig && typeof input.workspaceConfig === "object" ? input.workspaceConfig : {};
  const workspaceSourceRecords = input.workspaceSourceRecords && typeof input.workspaceSourceRecords === "object"
    ? input.workspaceSourceRecords
    : {};
  const metadataGraph = input.metadataGraph && typeof input.metadataGraph === "object" ? input.metadataGraph : {};
  const persistence = input.persistence && typeof input.persistence === "object" ? input.persistence : {};
  const env = input.env && typeof input.env === "object" ? input.env : process.env;

  const catalog = buildEnvKeyCatalog(workspaceConfig, env);
  const dur = deriveRuntimeDurability(metadataGraph);
  const registryRows = listRows(listObjects(workspaceConfig, "api-registry"));
  const sourceRows = listRows(listObjects(workspaceConfig, "data-source"));
  const sandboxRows = listRows(listObjects(workspaceConfig, "sandbox-environment"));
  const testedApis = registryRows.filter(({ row }) => clean(row?.testStatus).toLowerCase() === "connected"
    || clean(row?.status).toLowerCase() === "connected");
  const missingEnv = catalog.entries.filter((e) => e.inUse && !e.configured);

  const checks = [
    deriveCheck(
      "persistence",
      "Config persistence",
      persistence.canSave === true || dur.durable,
      "describePersistenceMode",
      persistence.guidance || "Enable filesystem writes or connect durable persistence",
      "/settings",
      "Review persistence",
    ),
    deriveCheck(
      "env-write",
      "Env write capability",
      persistence.canSave === true,
      "describePersistenceMode.canSave",
      "Read-only runtime cannot write .env.local",
      "/settings/apis-webhooks",
      "Open APIs & Webhooks",
    ),
    deriveCheck(
      "env-resolution",
      "Env resolution",
      catalog.summary.missing === 0,
      "GET /api/workspace/env-key-catalog",
      missingEnv.map((e) => e.slug).join(", ") || "Configure referenced env keys",
      "/settings/apis-webhooks",
      "Save secrets",
    ),
    deriveCheck(
      "api-registry",
      "API Registry",
      registryRows.length > 0,
      "dataModel.objects[api-registry]",
      "No API Registry rows",
      "/data-model?lane=register-api",
      "Register API",
    ),
    deriveCheck(
      "api-tested",
      "API tested",
      testedApis.length > 0,
      "api-registry row testStatus",
      "Register and test an API",
      registryRows[0] ? `/data-model?object=${encodeURIComponent(registryRows[0].object.id)}` : "/data-model",
      "Test API",
    ),
    deriveCheck(
      "data-source",
      "Data Source",
      sourceRows.length > 0,
      "dataModel.objects[data-source]",
      "Create a Data Source from a tested API",
      "/data-model",
      "Connect source",
    ),
    deriveCheck(
      "source-records",
      "Source records",
      sourceRows.some(({ row }) => hasSourceRecords(workspaceSourceRecords, row?.sourceId || row?.id)),
      "growthub.source-records.json",
      "Refresh a Data Source to populate sidecar records",
      "/data-model",
      "Refresh source",
    ),
    deriveCheck(
      "sandbox",
      "Sandbox / workflow",
      sandboxRows.length > 0,
      "dataModel.objects[sandbox-environment]",
      "Wire a Sandbox Environment workflow",
      "/workflows",
      "Open workflows",
    ),
    deriveCheck(
      "scheduler",
      "Serverless scheduler",
      !sandboxRows.some(({ row }) => clean(row?.runLocality).toLowerCase() === "serverless")
        || sandboxRows.some(({ row }) => clean(row?.schedulerRegistryId)),
      "sandbox-environment.schedulerRegistryId",
      "Configure scheduler for serverless workflows",
      "/workflows",
      "Configure scheduler",
    ),
    deriveCheck(
      "activation",
      "Activation ready",
      testedApis.length > 0
        && (sourceRows.length === 0 || sourceRows.some(({ row }) => hasSourceRecords(workspaceSourceRecords, row?.sourceId || row?.id))),
      "derived creation checks",
      "Complete API test and source refresh",
      "/workspace-lens",
      "View activation",
    ),
  ];

  const blockers = checks.filter((c) => c.status !== "complete");
  const next = blockers[0] || null;
  const envChips = catalog.entries.map((entry) => ({
    slug: entry.slug,
    source: entry.source,
    configured: entry.configured,
    inUse: entry.inUse,
  }));

  return {
    kind: READINESS_KIND,
    headline: blockers.length === 0 ? "Creation loop is ready to activate." : `${blockers.length} creation step${blockers.length === 1 ? "" : "s"} remaining.`,
    subheadline: next ? `Next: ${next.label}` : "Run, publish, and monitor from Workflow Cockpit.",
    complete: blockers.length === 0,
    checks,
    nextAction: next,
    envChips,
    summary: {
      apiRegistryRows: registryRows.length,
      testedApis: testedApis.length,
      dataSources: sourceRows.length,
      sandboxWorkflows: sandboxRows.length,
      missingEnv: catalog.summary.missing,
      persistenceMode: persistence.mode || dur.mode || "unknown",
      canWriteFiles: persistence.canSave === true,
      canWriteEnv: persistence.canSave === true,
    },
  };
}

function deriveApiRowReadiness(row, workspaceConfig, env = process.env) {
  const authRef = clean(row?.authRef);
  const authConfigured = !authRef || isEnvRefConfigured(authRef, env);
  const tested = ["connected", "ok", "success"].includes(clean(row?.testStatus || row?.status).toLowerCase());
  return {
    authConfigured,
    tested,
    envMeta: authRef ? resolveEnvRefsMeta([authRef], env)[0] : null,
    nextAction: !authConfigured
      ? { label: "Save secret", href: "/settings/apis-webhooks" }
      : !tested
        ? { label: "Test API", href: null }
        : { label: "Create Data Source", href: "/data-model?lane=create-source" },
  };
}

export {
  READINESS_KIND,
  deriveCreationReadiness,
  deriveApiRowReadiness,
};
