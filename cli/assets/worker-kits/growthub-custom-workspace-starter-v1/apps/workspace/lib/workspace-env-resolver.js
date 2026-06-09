/**
 * Workspace Env Resolver V1 — single server-side secret resolution surface.
 *
 * Every execution route that needs an env-backed authRef/envRef must import
 * from here instead of inlining `envKeyCandidates` / `readServerSecret`. This
 * keeps the catalog's `configured` flag, Settings `.env.local` writes
 * (`process.env` hot-update), and runtime probes in lockstep.
 *
 * Contract: never log or return secret values through helpers that are meant
 * for browser-facing responses. Use `isEnvRefConfigured` for booleans only.
 */

import { envKeyCandidates } from "./workspace-env-catalog.js";

/**
 * Resolve whether an envRef/authRef slug has a configured value in `env`.
 * Never returns the value — boolean only.
 */
function isEnvRefConfigured(ref, env = process.env) {
  const source = env && typeof env === "object" ? env : {};
  return envKeyCandidates(ref).some((key) => Boolean(source[key]));
}

/**
 * Return the first env key name that resolved for `ref`, or null.
 * Name-only — safe for receipts and operator guidance.
 */
function resolveEnvRefKeyName(ref, env = process.env) {
  const source = env && typeof env === "object" ? env : {};
  for (const key of envKeyCandidates(ref)) {
    if (source[key]) return key;
  }
  return null;
}

/**
 * Server-only secret read. Returns the raw value for outbound fetch/auth.
 * Callers must never forward this to the browser or persist it in config.
 */
function readServerSecret(authRef, env = process.env) {
  const entry = readServerSecretEntry(authRef, env);
  return entry?.value || "";
}

/**
 * Server-only secret read with resolved env key name (for env injection).
 * Never forward `value` to browser-facing responses.
 */
function readServerSecretEntry(authRef, env = process.env) {
  const source = env && typeof env === "object" ? env : {};
  for (const key of envKeyCandidates(authRef)) {
    if (source[key]) return { key, value: source[key] };
  }
  return null;
}

/**
 * Name-only resolution receipt for operator surfaces.
 */
function describeEnvRefResolution(ref, env = process.env) {
  const slug = String(ref || "").trim();
  const keyName = resolveEnvRefKeyName(slug, env);
  return {
    slug,
    configured: Boolean(keyName),
    resolvedKey: keyName,
    candidates: envKeyCandidates(slug),
  };
}

export {
  envKeyCandidates,
  isEnvRefConfigured,
  resolveEnvRefKeyName,
  readServerSecret,
  readServerSecretEntry,
  describeEnvRefResolution,
};
