/**
 * Scheduler Drift V1 — the security-critical "can this schedule still be
 * trusted?" derivation. A provisioned schedule must EARN its trusted-live status
 * again whenever the runtime it was provisioned into changes: redeploy (endpoint
 * URL changed), read-only flip, auth secret gone, the registry row hand-edited
 * after confirmation, or a missing provider schedule id.
 *
 * URL comparison and auth resolution are single-sourced from
 * lib/scheduler-providers.js (canonical origin+pathname, candidate-aware) — no
 * substring matching, no duplicated candidate logic (findings 4 + 5).
 *
 * Pure + deterministic; never reads process.env, never throws. Secret-safe
 * (ref slugs / booleans only).
 */

import { resolveAuthReadiness, endpointUrlsEquivalent, providerCaps } from "./scheduler-providers.js";

const SCHEDULE_BEARING = new Set(["scheduled", "endpoint-confirmed", "schedule-created", "paused", "needs-reconfirm"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clean(value) {
  return String(value == null ? "" : value).trim();
}

/**
 * @param {object} input
 * @param {object} input.sandboxRow            the provisioned workflow row
 * @param {string} [input.persistenceMode]     "filesystem" | "read-only" | "database"
 * @param {string[]} [input.configuredEnvRefs] auth/env slugs that resolve (env-status)
 * @param {object} [input.schedulerRow]        the api-registry scheduler row (current config)
 * @param {string} [input.currentBaseUrl]      the app's current deployed base URL, when known
 */
function deriveSchedulerDriftState(input = {}) {
  const row = isPlainObject(input.sandboxRow) ? input.sandboxRow : {};
  const scheduleStatus = clean(row.scheduleStatus).toLowerCase();
  const wasProvisioned = SCHEDULE_BEARING.has(scheduleStatus);

  if (!wasProvisioned) {
    return {
      kind: "growthub-scheduler-drift-state-v1",
      version: 1,
      applicable: false,
      drifted: false,
      reasons: [],
      recommendedAction: "none",
      headline: "No provisioned schedule to verify.",
    };
  }

  const schedulerRow = isPlainObject(input.schedulerRow) ? input.schedulerRow : {};
  const persistenceMode = clean(input.persistenceMode).toLowerCase();
  const provider = clean(row.scheduleProvider || schedulerRow.schedulerProvider);
  const caps = providerCaps(provider);

  const reasons = [];

  if (persistenceMode === "read-only") {
    reasons.push("This runtime is read-only — the workspace cannot durably own the schedule here.");
  }

  // Auth — candidate-aware, single-sourced. Names only, never values.
  const authRef = clean(schedulerRow.authRef || row.scheduleProvider);
  const auth = resolveAuthReadiness(authRef, input.configuredEnvRefs);
  if (authRef && !auth.configured) {
    reasons.push(`Scheduler auth ${authRef.toUpperCase()} no longer resolves in this runtime.`);
  }

  // Endpoint URL drift — canonical origin+pathname against the LAST CONFIRMED
  // evidence (not merely the current, hand-editable registry row).
  const lastConfirmed = clean(row.scheduleLastConfirmedEndpointUrl);
  const registryUrl = clean(schedulerRow.endpoint) || clean(schedulerRow.baseUrl);
  const currentBaseUrl = clean(input.currentBaseUrl);

  if (lastConfirmed && registryUrl) {
    const cmp = endpointUrlsEquivalent(lastConfirmed, registryUrl);
    if (cmp.bInvalid) reasons.push("The registry endpoint URL is malformed since the last confirmation.");
    else if (!cmp.equivalent) reasons.push("The registry endpoint URL was edited since the schedule was last confirmed.");
  }
  if (currentBaseUrl) {
    const reference = lastConfirmed || registryUrl;
    const cmp = endpointUrlsEquivalent(reference, currentBaseUrl);
    if (cmp.bInvalid) reasons.push(`The current endpoint URL is malformed ("${currentBaseUrl}").`);
    else if (reference && !cmp.equivalent) reasons.push("The deployed endpoint URL changed since the schedule was registered (redeploy detected).");
  }

  // Provider schedule evidence — if this provider creates a real schedule and we
  // claim it's scheduled/created but have no provider schedule id, it's drifted.
  if (caps.createsProviderSchedule && (scheduleStatus === "scheduled" || scheduleStatus === "schedule-created") && !clean(row.scheduleProviderScheduleId)) {
    reasons.push("No provider schedule id on record — the provider schedule cannot be verified.");
  }

  const drifted = reasons.length > 0;
  return {
    kind: "growthub-scheduler-drift-state-v1",
    version: 1,
    applicable: true,
    drifted,
    reasons,
    recommendedAction: drifted ? "reconfirm" : "none",
    headline: drifted
      ? "Runtime changed — re-confirm the schedule before it is trusted live."
      : "Schedule verified against this runtime.",
  };
}

export { SCHEDULE_BEARING, deriveSchedulerDriftState };
