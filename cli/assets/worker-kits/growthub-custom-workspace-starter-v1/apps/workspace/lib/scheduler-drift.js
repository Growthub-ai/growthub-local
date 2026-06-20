/**
 * Scheduler Drift V1 — the security-critical "can this schedule still be
 * trusted?" derivation. A provisioned schedule must EARN its live status again
 * whenever the runtime it was provisioned into changes — the workspace can be
 * redeployed to a new Next.js app, flipped to read-only, or the local runtime
 * that holds the provider secret can disconnect. When any of those happen the
 * schedule is marked needs-reconfirm and is not trusted until a fresh 200.
 *
 * Pure + deterministic; never reads process.env, never throws. Secret-safe
 * (ref slugs / booleans only). The lifecycle route stamps scheduleStatus from
 * this verdict; the provisioning cockpit renders it.
 */

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
 * @param {object} [input.schedulerRow]        the api-registry scheduler row
 * @param {string} [input.currentBaseUrl]      the app's current base URL, when known
 */
function deriveSchedulerDriftState(input = {}) {
  const row = isPlainObject(input.sandboxRow) ? input.sandboxRow : {};
  const scheduleStatus = clean(row.scheduleStatus).toLowerCase();
  const wasProvisioned = scheduleStatus === "scheduled" || scheduleStatus === "needs-reconfirm";

  // Drift only applies to a schedule that was provisioned. Everything else is
  // simply "not scheduled yet" — not drift.
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
  const configuredRefs = new Set((Array.isArray(input.configuredEnvRefs) ? input.configuredEnvRefs : []).map((s) => clean(s).toUpperCase()));
  const persistenceMode = clean(input.persistenceMode).toLowerCase();

  const reasons = [];

  if (persistenceMode === "read-only") {
    reasons.push("This runtime is read-only — the workspace cannot durably own the schedule here.");
  }

  const authRef = clean(schedulerRow.authRef || row.scheduleProvider).toUpperCase();
  if (authRef && !configuredRefs.has(authRef)) {
    reasons.push(`Scheduler secret ${authRef} no longer resolves in this runtime.`);
  }

  const registeredBaseUrl = clean(schedulerRow.baseUrl || schedulerRow.endpoint);
  const currentBaseUrl = clean(input.currentBaseUrl);
  if (currentBaseUrl && registeredBaseUrl && !currentBaseUrl.includes(registeredBaseUrl) && !registeredBaseUrl.includes(currentBaseUrl)) {
    reasons.push("The deployed endpoint URL changed since the schedule was registered (redeploy detected).");
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

export { deriveSchedulerDriftState };
