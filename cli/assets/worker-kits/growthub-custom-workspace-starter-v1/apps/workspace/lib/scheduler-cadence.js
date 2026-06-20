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
 * Cron contract (production semantics — finding 8):
 *   - Exactly 5 fields: minute hour day-of-month month day-of-week.
 *   - Numeric tokens only (no month/day names) — documented + enforced.
 *   - Seconds/year (6–7 field) cron is rejected on purpose.
 *   - Real per-field RANGE checks, including lists (a,b), ranges (a-b), steps
 *     (* / n, a-b/n).
 *   - A minimum-interval guard rejects accidental high-frequency schedules.
 *   - Timezones validated via Intl (IANA names).
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

const CADENCE_CRON = Object.freeze({
  manual: null,
  daily: "0 9 * * *",
  weekly: "0 9 * * 1",
  monthly: "0 9 1 * *",
});

// Default minimum interval between runs. QStash and pg_cron both support
// minute-granularity; we refuse anything that would fire more often than this
// so "recurring" can't become a hidden footgun (e.g. "* * * * *" = every minute).
const DEFAULT_MIN_INTERVAL_SEC = 300; // 5 minutes

const CRON_FIELD_BOUNDS = Object.freeze([
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "day-of-month", min: 1, max: 31 },
  { name: "month", min: 1, max: 12 },
  { name: "day-of-week", min: 0, max: 7 }, // 0 and 7 both = Sunday
]);

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeCadence(value) {
  const v = clean(value).toLowerCase();
  return KNOWN_SCHEDULE_CADENCES.includes(v) ? v : "manual";
}

/** Validate one numeric value against a field's [min,max]. */
function inRange(num, bounds) {
  return Number.isInteger(num) && num >= bounds.min && num <= bounds.max;
}

/**
 * Validate a single cron field token against its bounds, supporting:
 *   *            any
 *   * / n         step over the whole range
 *   a            literal
 *   a-b          range
 *   a-b/n        stepped range
 *   a,b,c        list (each element validated recursively)
 * Returns true only when every element is numeric and within range.
 */
function validateCronField(token, bounds) {
  const t = clean(token);
  if (!t) return false;
  if (t.includes(",")) {
    return t.split(",").every((part) => validateCronField(part, bounds));
  }
  // step: <base>/<n>
  let base = t;
  let step = null;
  if (t.includes("/")) {
    const [b, s] = t.split("/");
    base = clean(b);
    step = Number(s);
    if (!Number.isInteger(step) || step < 1 || step > bounds.max) return false;
  }
  if (base === "*") return true;
  // range a-b
  if (base.includes("-")) {
    const [a, b] = base.split("-");
    const lo = Number(a);
    const hi = Number(b);
    return inRange(lo, bounds) && inRange(hi, bounds) && lo <= hi;
  }
  // literal
  const n = Number(base);
  return inRange(n, bounds);
}

function isValidCron(expr) {
  const text = clean(expr);
  if (!text) return false;
  const fields = text.split(/\s+/);
  if (fields.length !== 5) return false; // 6/7-field (seconds/year) rejected on purpose
  return fields.every((field, index) => validateCronField(field, CRON_FIELD_BOUNDS[index]));
}

/**
 * Conservative lower bound (seconds) on how often a cron fires, used by the
 * min-interval guard. We only need to catch the dangerous high-frequency cases
 * driven by the MINUTE field; coarser fields only make the real interval larger.
 *   "* * * * *"     → 60s
 *   "* / 5 * * * *"  → 300s
 *   "0 * * * *"     → 3600s (specific minute, hourly at most)
 * Returns Infinity when it cannot be sure it's high-frequency (treated as safe).
 */
function cronApproxMinIntervalSeconds(expr) {
  const text = clean(expr);
  const fields = text.split(/\s+/);
  if (fields.length !== 5) return Infinity;
  const [minute, hour] = fields;
  if (minute === "*") {
    // fires every minute (unless hour restricts to a window, still 60s within it)
    return 60;
  }
  if (minute.startsWith("*/")) {
    const n = Number(minute.slice(2));
    if (Number.isInteger(n) && n > 0) return n * 60;
  }
  if (minute.includes("/")) {
    const n = Number(minute.split("/")[1]);
    if (Number.isInteger(n) && n > 0) return n * 60;
  }
  // A specific minute value (e.g. "0", "30", "0,30"). If hour is "*", at most hourly.
  if (minute.includes(",")) {
    // multiple minutes within the hour → smallest gap is at least... be safe: 60s*?
    // Treat as sub-hour but not per-minute; require ≥ our default by returning 60*1.
    return 60; // conservative: a dense minute-list can be frequent
  }
  return hour === "*" ? 3600 : Infinity;
}

/** IANA timezone validation via Intl. "UTC"/"" are always valid. */
function isValidTimezone(tz) {
  const t = clean(tz);
  if (!t || t.toUpperCase() === "UTC") return true;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: t });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the effective cron for a cadence + optional explicit cron override,
 * with range, timezone, and minimum-interval validation.
 * @returns { cron: string|null, requiresInvocation: boolean, error: string|null }
 */
function cadenceToCron(cadence, options = {}) {
  const c = normalizeCadence(cadence);
  const override = clean(options.cron);
  const minIntervalSec = Number.isFinite(options.minIntervalSec) ? options.minIntervalSec : DEFAULT_MIN_INTERVAL_SEC;

  if (options.timezone !== undefined && !isValidTimezone(options.timezone)) {
    return { cron: null, requiresInvocation: false, error: `invalid timezone: "${clean(options.timezone)}" (use an IANA name like "America/New_York" or "UTC")` };
  }

  if (c === "manual") {
    return { cron: null, requiresInvocation: true, error: null };
  }

  const guard = (cron) => {
    const interval = cronApproxMinIntervalSeconds(cron);
    if (interval < minIntervalSec) {
      return `cron "${cron}" fires about every ${interval}s, below the ${minIntervalSec}s minimum interval — widen the schedule`;
    }
    return null;
  };

  if (c === "recurring") {
    if (!override) {
      return { cron: null, requiresInvocation: false, error: "recurring cadence requires an explicit cron expression" };
    }
    if (!isValidCron(override)) {
      return { cron: null, requiresInvocation: false, error: `invalid cron expression: "${override}" (5 numeric fields: minute hour day-of-month month day-of-week)` };
    }
    const g = guard(override);
    if (g) return { cron: null, requiresInvocation: false, error: g };
    return { cron: override, requiresInvocation: false, error: null };
  }

  // Named cadence: an explicit valid override wins; otherwise the canonical cron.
  if (override) {
    if (!isValidCron(override)) {
      return { cron: null, requiresInvocation: false, error: `invalid cron expression: "${override}" (5 numeric fields: minute hour day-of-month month day-of-week)` };
    }
    const g = guard(override);
    if (g) return { cron: null, requiresInvocation: false, error: g };
    return { cron: override, requiresInvocation: false, error: null };
  }
  return { cron: CADENCE_CRON[c] || null, requiresInvocation: false, error: null };
}

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
  DEFAULT_MIN_INTERVAL_SEC,
  normalizeCadence,
  isValidCron,
  validateCronField,
  cronApproxMinIntervalSeconds,
  isValidTimezone,
  cadenceToCron,
  describeCadence,
};
