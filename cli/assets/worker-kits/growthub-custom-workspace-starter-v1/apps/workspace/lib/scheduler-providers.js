/**
 * Scheduler Providers V1 — the single source of truth for provider CAPABILITIES,
 * auth-candidate resolution, and endpoint-URL normalization. Centralized so the
 * env-status signal, the cockpit derivation, the provision route, and the
 * lifecycle route never disagree about "can this provider create a real
 * schedule?", "does this auth ref resolve?", or "is this the same endpoint?".
 *
 * Pure + dependency-free. Secret-safe: returns ref NAMES and booleans, never a
 * secret value.
 */

const KNOWN_SCHEDULER_PROVIDERS = Object.freeze(["supabase-edge", "qstash-schedule"]);

/**
 * Provider capability matrix — the honest contract that prevents overclaiming.
 *
 *   createsProviderSchedule: the provision route can register a real recurring
 *     schedule with the provider (and obtain a providerScheduleId).
 *   schedulingMode: "provider" (we create it) | "external" (operator wires cron
 *     in the provider's own surface — e.g. Supabase pg_cron / dashboard).
 *   lifecycle: what pause/resume/cancel mean for this provider.
 *   minIntervalSec: smallest schedule interval we allow (footgun guard).
 */
const PROVIDER_CAPS = Object.freeze({
  "qstash-schedule": Object.freeze({
    label: "QStash Workflows schedule",
    createsProviderSchedule: true,
    schedulingMode: "provider",
    authRefDefault: "QSTASH",
    cronSupported: true,
    minIntervalSec: 60,
    lifecycle: Object.freeze({ pause: "delete-recreate", resume: "recreate", cancel: "delete" }),
  }),
  "supabase-edge": Object.freeze({
    label: "Supabase Edge Function",
    // We deploy/verify the Edge endpoint, but the recurring schedule is owned by
    // Supabase (pg_cron / dashboard). We do NOT call a Supabase scheduling API,
    // so we never claim a provider schedule was created — scheduling is external.
    createsProviderSchedule: false,
    schedulingMode: "external",
    authRefDefault: "SUPABASE_EDGE",
    cronSupported: true,
    minIntervalSec: 60,
    lifecycle: Object.freeze({ pause: "not-supported", resume: "not-supported", cancel: "not-supported" }),
  }),
});

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeProvider(value) {
  const v = clean(value).toLowerCase();
  return KNOWN_SCHEDULER_PROVIDERS.includes(v) ? v : "supabase-edge";
}

function providerCaps(provider) {
  return PROVIDER_CAPS[normalizeProvider(provider)];
}

/**
 * Canonical UPPER_SNAKE candidate expansion for a logical auth ref. Matches the
 * server-side readServerSecret() expansion EXACTLY so the cockpit's "auth
 * resolves" verdict can never disagree with the route that actually reads env.
 */
function authCandidates(ref) {
  const token = clean(ref).replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toUpperCase();
  if (!token) return [];
  return Array.from(new Set([token, `${token}_API_KEY`, `${token}_TOKEN`]));
}

/**
 * Resolve auth readiness against a set of configured ref slugs (env-status).
 * Returns { configured, resolvedVia } where resolvedVia is the candidate NAME
 * that resolved — never a value. configuredRefs is treated as the set of slugs
 * whose candidates resolve server-side (env-status already expanded them), so we
 * match the raw ref OR any candidate name.
 */
function resolveAuthReadiness(ref, configuredRefs) {
  const want = clean(ref);
  if (!want) return { configured: true, resolvedVia: null };
  const set = new Set((Array.isArray(configuredRefs) ? configuredRefs : []).map((s) => clean(s).toUpperCase()));
  for (const candidate of authCandidates(want)) {
    if (set.has(candidate)) return { configured: true, resolvedVia: candidate };
  }
  return { configured: false, resolvedVia: null };
}

/**
 * Normalize an endpoint URL to a canonical "origin + pathname" string for
 * deterministic drift comparison. Trailing slashes are ignored; query/hash are
 * dropped (documented: query params do NOT affect drift). Returns "" for an
 * unparseable URL so callers can flag an invalid-url state explicitly.
 */
function normalizeEndpointUrl(value) {
  const raw = clean(value);
  if (!raw) return "";
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return "";
  }
  const path = parsed.pathname.replace(/\/+$/, "") || "/";
  return `${parsed.protocol}//${parsed.host}${path}`.toLowerCase();
}

/**
 * Compare two endpoint URLs by canonical origin+pathname.
 * Returns { equivalent, aInvalid, bInvalid }.
 */
function endpointUrlsEquivalent(a, b) {
  const na = normalizeEndpointUrl(a);
  const nb = normalizeEndpointUrl(b);
  return {
    aInvalid: Boolean(clean(a)) && na === "",
    bInvalid: Boolean(clean(b)) && nb === "",
    equivalent: na !== "" && nb !== "" && na === nb,
  };
}

export {
  KNOWN_SCHEDULER_PROVIDERS,
  PROVIDER_CAPS,
  normalizeProvider,
  providerCaps,
  authCandidates,
  resolveAuthReadiness,
  normalizeEndpointUrl,
  endpointUrlsEquivalent,
};
