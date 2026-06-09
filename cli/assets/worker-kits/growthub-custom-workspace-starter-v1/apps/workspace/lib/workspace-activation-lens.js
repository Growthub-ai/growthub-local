/**
 * Activation Lens V1 — creation-loop truth layer derived from real state.
 *
 * Each check exposes status, source of truth, missing item, next action, and
 * linked surface. No fake readiness flags.
 */

import { buildEnvKeyCatalog } from "./workspace-env-catalog.js";
import { readServerSecret } from "./workspace-env-resolver.js";
import { getSourceResolver } from "./adapters/integrations/source-resolver-registry.js";

const LENS_KIND = "growthub-activation-lens-v1";

function safeString(v) {
  return v == null ? "" : String(v).trim();
}

function findApiRows(workspaceConfig) {
  const rows = [];
  for (const object of Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : []) {
    if (object?.objectType !== "api-registry") continue;
    for (const row of Array.isArray(object.rows) ? object.rows : []) rows.push({ object, row });
  }
  return rows;
}

function findSourceRows(workspaceConfig) {
  const rows = [];
  for (const object of Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : []) {
    if (object?.objectType !== "data-source") continue;
    for (const row of Array.isArray(object.rows) ? object.rows : []) rows.push({ object, row });
  }
  return rows;
}

function findSandboxRows(workspaceConfig) {
  const rows = [];
  for (const object of Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : []) {
    if (object?.objectType !== "sandbox-environment") continue;
    for (const row of Array.isArray(object.rows) ? object.rows : []) rows.push({ object, row });
  }
  return rows;
}

function hasSidecarRecords(workspaceSourceRecords, sourceId) {
  const key = safeString(sourceId);
  if (!key || !workspaceSourceRecords?.[key]) return false;
  const sidecar = workspaceSourceRecords[key];
  if (Number.isFinite(sidecar.recordCount) && sidecar.recordCount > 0) return true;
  return Array.isArray(sidecar.records) && sidecar.records.length > 0;
}

function deriveActivationLens(input = {}, env = process.env) {
  const workspaceConfig = input.workspaceConfig || {};
  const workspaceSourceRecords = input.workspaceSourceRecords || {};
  const envCatalog = buildEnvKeyCatalog(workspaceConfig, env);
  const checks = [];

  const apiEntries = findApiRows(workspaceConfig);
  if (!apiEntries.length) {
    checks.push({
      id: "api-registry-exists",
      label: "API Registry row",
      status: "missing",
      source: "dataModel.objects[api-registry].rows",
      missing: "No API Registry rows",
      nextAction: "Register an API",
      href: "/data-model?wizard=register-api",
    });
  } else {
    for (const { row } of apiEntries) {
      const id = safeString(row.integrationId || row.Name);
      checks.push({
        id: `api-row-${id}`,
        label: `API ${id}`,
        status: safeString(row.status).toLowerCase() === "connected" ? "ready" : "pending",
        source: `api-registry row ${id}`,
        missing: safeString(row.status).toLowerCase() === "connected" ? null : "API not tested",
        nextAction: safeString(row.status).toLowerCase() === "connected" ? null : "Test API connection",
        href: "/data-model",
      });

      const authRef = safeString(row.authRef || row.integrationId);
      if (authRef) {
        const configured = readServerSecret(authRef, env).length > 0;
        checks.push({
          id: `auth-${id}`,
          label: `Auth ${authRef}`,
          status: configured ? "ready" : "blocked",
          source: "env-key-catalog + process.env",
          missing: configured ? null : `Secret for ${authRef}`,
          nextAction: configured ? null : "Save secret in Settings → APIs & Webhooks",
          href: "/settings/apis-webhooks",
        });
      }

      const resolver = getSourceResolver(id);
      const needsResolver = Boolean(safeString(row.resolverTemplateId));
      if (needsResolver || resolver) {
        checks.push({
          id: `resolver-${id}`,
          label: `Resolver ${id}`,
          status: resolver ? "ready" : "blocked",
          source: "source-resolver-registry",
          missing: resolver ? null : `Resolver for ${id}`,
          nextAction: resolver ? null : "Apply resolver proposal or upload resolver file",
          href: "/data-model?studio=resolver",
        });
      }
    }
  }

  const sourceEntries = findSourceRows(workspaceConfig);
  if (apiEntries.some(({ row }) => safeString(row.status).toLowerCase() === "connected") && !sourceEntries.length) {
    checks.push({
      id: "data-source-linked",
      label: "Data Source",
      status: "missing",
      source: "dataModel.objects[data-source].rows",
      missing: "No Data Source rows",
      nextAction: "Create a Data Source from tested API",
      href: "/data-model?wizard=data-source",
    });
  }

  for (const { row } of sourceEntries) {
    const sourceId = safeString(row.sourceId || row.Name);
    const hasRecords = hasSidecarRecords(workspaceSourceRecords, sourceId);
    checks.push({
      id: `source-${sourceId}`,
      label: `Source ${sourceId}`,
      status: hasRecords ? "ready" : "pending",
      source: "growthub.source-records.json",
      missing: hasRecords ? null : "No source records yet",
      nextAction: hasRecords ? null : "Refresh source records",
      href: "/data-model",
    });
  }

  for (const { row } of findSandboxRows(workspaceConfig)) {
    const name = safeString(row.Name);
    const envRefs = String(row.envRefs || "").split(",").map((s) => s.trim()).filter(Boolean);
    const missing = envRefs.filter((slug) => !readServerSecret(slug, env));
    if (envRefs.length) {
      checks.push({
        id: `sandbox-env-${name}`,
        label: `Sandbox env ${name}`,
        status: missing.length === 0 ? "ready" : "blocked",
        source: "sandbox-environment row envRefs",
        missing: missing.length ? missing.join(", ") : null,
        nextAction: missing.length ? "Configure missing env keys" : null,
        href: "/settings/apis-webhooks",
      });
    }

    if (safeString(row.runLocality) === "serverless") {
      const sched = safeString(row.schedulerRegistryId);
      checks.push({
        id: `scheduler-${name}`,
        label: `Scheduler ${name}`,
        status: sched ? "ready" : "blocked",
        source: "sandbox-environment.schedulerRegistryId",
        missing: sched ? null : "schedulerRegistryId",
        nextAction: sched ? null : "Pick scheduler API Registry row",
        href: "/data-model",
      });
    }

    const lastOk = safeString(row.status).toLowerCase() === "connected";
    checks.push({
      id: `sandbox-run-${name}`,
      label: `Last run ${name}`,
      status: lastOk ? "ready" : row.lastResponse ? "failed" : "pending",
      source: "sandbox row lastResponse",
      missing: lastOk ? null : "No successful run",
      nextAction: lastOk ? null : "Test draft or run sandbox",
      href: `/workflows?object=${encodeURIComponent(row._objectId || "")}&row=${encodeURIComponent(name)}`,
    });
  }

  if (envCatalog.summary.missing > 0) {
    checks.push({
      id: "env-catalog",
      label: "Env catalog",
      status: "blocked",
      source: "GET /api/workspace/env-key-catalog",
      missing: `${envCatalog.summary.missing} unresolved keys`,
      nextAction: "Save secrets and re-check catalog",
      href: "/settings/apis-webhooks",
    });
  }

  const ready = checks.filter((c) => c.status === "ready").length;
  const blocked = checks.filter((c) => c.status === "blocked" || c.status === "failed");
  const next = checks.find((c) => c.nextAction && c.status !== "ready") || null;

  return {
    kind: LENS_KIND,
    complete: blocked.length === 0 && checks.length > 0 && checks.every((c) => c.status === "ready" || c.status === "optional"),
    summary: { total: checks.length, ready, blocked: blocked.length, pending: checks.length - ready - blocked.length },
    checks,
    nextAction: next ? { checkId: next.id, label: next.nextAction, href: next.href } : null,
  };
}

export { LENS_KIND, deriveActivationLens };
