/**
 * Server-only env resolution — single source of truth for turning an authRef /
 * envRef slug into a real secret value from the runtime environment.
 *
 * Every execution + readiness path imports from here so they agree on what
 * "configured" means: env-key-catalog, test-api-record, sandbox-run, the
 * orchestration graph runner, and the sandbox scheduler. Because Settings
 * writes secrets to .env.local AND updates process.env, a freshly saved key is
 * resolvable here immediately, without a process restart.
 *
 * Never import into client code — it reads process.env. Callers expose slugs +
 * booleans, never the value.
 */

/** Canonical UPPER_SNAKE candidate names for a slug, widest-first match order. */
function envKeyCandidates(ref) {
  const token = String(ref || "")
    .trim()
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  if (!token) return [];
  return Array.from(new Set([token, `${token}_API_KEY`, `${token}_TOKEN`]));
}

/** Resolve a slug to its secret value (or "" when unset). */
function readServerSecret(authRef, env = process.env) {
  const source = env && typeof env === "object" ? env : {};
  for (const key of envKeyCandidates(authRef)) {
    if (source[key]) return source[key];
  }
  return "";
}

/**
 * Resolve a slug to the matched { key, value } pair, or null. The sandbox
 * runner needs the resolved env-var NAME (not just the value) to inject it into
 * the child process environment under its real key.
 */
function resolveServerSecretEntry(authRef, env = process.env) {
  const source = env && typeof env === "object" ? env : {};
  for (const key of envKeyCandidates(authRef)) {
    if (source[key]) return { key, value: source[key] };
  }
  return null;
}

/** Is the slug resolvable to a non-empty value right now? */
function isEnvRefResolved(authRef, env = process.env) {
  return readServerSecret(authRef, env) !== "";
}

/**
 * Partition env-ref slugs into resolved / missing, name-only. Used by
 * sandbox-run + scheduler pre-flight and the workflow cockpit readiness strip.
 */
function resolveEnvRefs(slugs, env = process.env) {
  const list = Array.isArray(slugs)
    ? Array.from(new Set(slugs.map((s) => String(s || "").trim()).filter(Boolean)))
    : [];
  const resolved = [];
  const missing = [];
  for (const slug of list) {
    if (isEnvRefResolved(slug, env)) resolved.push(slug);
    else missing.push(slug);
  }
  return { resolved, missing };
}

export { envKeyCandidates, readServerSecret, resolveServerSecretEntry, isEnvRefResolved, resolveEnvRefs };
