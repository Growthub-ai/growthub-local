/**
 * Scheduler Cadence V1 — the single source of truth for the no-code schedule
 * cadence vocabulary and its deterministic mapping to a cron expression.
 *
 * A non-technical user picks a named cadence (manual / daily / weekly / monthly
 * / recurring) in the sandbox drawer; the server maps it to canonical cron so
 * the user never types cron unless they explicitly choose "recurring". This
 * module is PURE + dependency-free so the schema validator, the proposal
 * generator, the provisioning derivation, and the provision route all agree on
 * exactly one cadence contract.
 *
 * Secret-safe by construction: cadence/cron/timezone are non-credential scalars.
 */

const KNOWN_SCHEDULE_CADENCES = Object.freeze([
  "manual",
  "daily",
  "weekly",
  "monthly",
  "recurring",
]);

// Canonical cron for each named cadence. Times are expressed in the schedule's
// timezone by the provider (QStash honors a cron TZ; Supabase Edge cron is UTC).
// Kept intentionally boring — a predictable 09:00 anchor non-technical users can
// reason about, overridable by an explicit cron for "recurring".
const CADENCE_CRON = Object.freeze({
  manual: null,
  daily: "0 9 * * *",
  weekly: "0 9 * * 1",
  monthly: "0 9 1 * *",
});

function clean(value) {
  return String(value == null ? "" : value).trim();
}

/** Normalize an arbitrary cadence input to a known cadence (default "manual"). */
function normalizeCadence(value) {
  const v = clean(value).toLowerCase();
  return KNOWN_SCHEDULE_CADENCES.includes(v) ? v : "manual";
}

/**
 * A permissive but real 5-field cron check (minute hour dom month dow). We are
 * not a full cron parser — we reject obviously malformed expressions so a bad
 * value never reaches a provider, and let the provider own the deep semantics.
 */
function isValidCron(expr) {
  const text = clean(expr);
  if (!text) return false;
  const fields = text.split(/\s+/);
  if (fields.length !== 5) return false;
  const fieldRe = /^(\*|(\*\/\d+)|(\d+(-\d+)?)(\/\d+)?(,(\d+(-\d+)?)(\/\d+)?)*)$/;
  return fields.every((f) => fieldRe.test(f));
}

/**
 * Resolve the effective cron for a cadence + optional explicit cron override.
 * Returns:
 *   { cron: string|null, requiresInvocation: boolean, error: string|null }
 *
 *   - "manual" → no cron; the workflow fires only when invoked (today's lane).
 *   - named cadence → canonical cron, unless a valid override is supplied.
 *   - "recurring" → the explicit cron is required and must validate.
 */
function cadenceToCron(cadence, options = {}) {
  const c = normalizeCadence(cadence);
  const override = clean(options.cron);

  if (c === "manual") {
    return { cron: null, requiresInvocation: true, error: null };
  }

  if (c === "recurring") {
    if (!override) {
      return { cron: null, requiresInvocation: false, error: "recurring cadence requires an explicit cron expression" };
    }
    if (!isValidCron(override)) {
      return { cron: null, requiresInvocation: false, error: `invalid cron expression: "${override}"` };
    }
    return { cron: override, requiresInvocation: false, error: null };
  }

  // Named cadence: an explicit valid override wins; otherwise the canonical cron.
  if (override) {
    if (!isValidCron(override)) {
      return { cron: null, requiresInvocation: false, error: `invalid cron expression: "${override}"` };
    }
    return { cron: override, requiresInvocation: false, error: null };
  }
  return { cron: CADENCE_CRON[c] || null, requiresInvocation: false, error: null };
}

/** Human, no-code description of a cadence for the cockpit/copy. */
function describeCadence(cadence, options = {}) {
  const c = normalizeCadence(cadence);
  const { cron } = cadenceToCron(c, options);
  switch (c) {
    case "manual": return "Runs only when invoked (no schedule).";
    case "daily": return `Runs every day${cron ? ` (${cron})` : ""}.`;
    case "weekly": return `Runs every week${cron ? ` (${cron})` : ""}.`;
    case "monthly": return `Runs every month${cron ? ` (${cron})` : ""}.`;
    case "recurring": return cron ? `Runs on a custom schedule (${cron}).` : "Custom schedule — set a cron expression.";
    default: return "Runs only when invoked (no schedule).";
  }
}

export {
  KNOWN_SCHEDULE_CADENCES,
  CADENCE_CRON,
  normalizeCadence,
  isValidCron,
  cadenceToCron,
  describeCadence,
};
