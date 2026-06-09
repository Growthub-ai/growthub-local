/**
 * Workspace Env Secret Resolver V1 — single server-only resolution surface.
 *
 * Every execution route (env-key-catalog, test-api-record, sandbox-run,
 * orchestration-graph-runner, sandbox-scheduler) must resolve secrets through
 * this module so Settings → .env.local writes are visible immediately via
 * process.env without a restart.
 *
 * Contract: callers that respond to the browser must never echo secret values.
 * Use `isEnvRefConfigured()` / `resolveEnvRefMeta()` for safe API payloads.
 */

import { envKeyCandidates } from "./workspace-env-catalog.js";

function cleanRef(ref) {
  return String(ref || "").trim();
}

/**
 * Resolve the first matching env key for a slug. Returns metadata only — the
 * `value` field is for server-side fetch/auth only and must not be serialized
 * to the browser.
 */
function readServerSecret(authRef, env = process.env) {
  const source = env && typeof env === "object" ? env : {};
  for (const key of envKeyCandidates(authRef)) {
    const value = source[key];
    if (value != null && String(value).length > 0) {
      return { key, value: String(value), configured: true };
    }
  }
  return { key: null, value: "", configured: false };
}

function isEnvRefConfigured(authRef, env = process.env) {
  return readServerSecret(authRef, env).configured;
}

/**
 * Browser-safe resolution metadata — never includes the secret value.
 */
function resolveEnvRefMeta(authRef, env = process.env) {
  const resolved = readServerSecret(authRef, env);
  return {
    slug: cleanRef(authRef),
    configured: resolved.configured,
    resolvedKey: resolved.key,
  };
}

function resolveEnvRefsMeta(refs, env = process.env) {
  const list = Array.isArray(refs)
    ? refs
    : String(refs || "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.map((slug) => resolveEnvRefMeta(slug, env));
}

export {
  envKeyCandidates,
  readServerSecret,
  isEnvRefConfigured,
  resolveEnvRefMeta,
  resolveEnvRefsMeta,
};
