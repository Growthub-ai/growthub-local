/**
 * Workspace Env Resolver V1 — single server-side secret resolution surface.
 *
 * All execution routes (test-api-record, sandbox-run, orchestration-graph-runner,
 * sandbox-scheduler) and the env-key catalog MUST resolve secrets through this
 * module so `configured` in the catalog always matches what runners see.
 *
 * Contract: never log or return secret values to the browser. Server routes may
 * use `readServerSecret` internally; API responses expose booleans only.
 */

import { envKeyCandidates } from "./workspace-env-catalog.js";

/**
 * Resolve the first matching env value for a slug/authRef.
 * Returns empty string when unresolved — never throws.
 */
function readServerSecret(authRef, env = process.env) {
  const source = env && typeof env === "object" ? env : {};
  for (const key of envKeyCandidates(authRef)) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}

/**
 * Resolve with metadata for server-side runners that need the matched key name.
 * Value is for internal use only — never serialize to API responses.
 */
function readServerSecretEntry(authRef, env = process.env) {
  const source = env && typeof env === "object" ? env : {};
  for (const key of envKeyCandidates(authRef)) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) return { key, value };
  }
  return null;
}

/**
 * Batch-resolve env refs for sandbox rows. Returns slug names only.
 */
function resolveEnvRefStatuses(slugs, env = process.env) {
  const list = Array.isArray(slugs) ? slugs : String(slugs || "").split(",");
  const resolved = [];
  const missing = [];
  for (const raw of list) {
    const slug = String(raw || "").trim();
    if (!slug) continue;
    if (readServerSecret(slug, env)) resolved.push(slug);
    else missing.push(slug);
  }
  return { resolved, missing };
}

export {
  envKeyCandidates,
  readServerSecret,
  readServerSecretEntry,
  resolveEnvRefStatuses,
};
