/**
 * Canonical server-side secret resolver — the single "stored env token for the
 * run" entry point.
 *
 * The kit historically duplicated this UPPER_SNAKE candidate expansion in
 * several routes (`sandbox-run`, `test-api-record`, `orchestration-graph-runner`,
 * `env-status`). New governed add-on routes resolve credentials through THIS
 * module so the canonical entry is provably the same one the sandbox run loop
 * uses: a logical ref (`QSTASH`, `upstash-redis`) expands to `QSTASH`,
 * `QSTASH_API_KEY`, `QSTASH_TOKEN`, and the first present `process.env` key wins.
 *
 * Pure + env-injectable so the resolution is deterministically testable and so
 * secret *values* never have to travel through a route body to be proven — a
 * route asks this module "does the run have this token?" and gets back the
 * resolved key name (never logged value) plus the value to use server-side.
 */

/** Canonical UPPER_SNAKE candidate expansion for a logical ref. */
function envKeyCandidates(ref) {
  const token = String(ref || "")
    .trim()
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  if (!token) return [];
  return Array.from(new Set([token, `${token}_API_KEY`, `${token}_TOKEN`]));
}

/**
 * Resolve a logical ref to the first present env key. Returns `{ key, value }`
 * (the key NAME is safe to surface; the value must stay server-side) or null.
 */
function readServerSecret(authRef, env = process.env) {
  const source = env && typeof env === "object" ? env : {};
  for (const key of envKeyCandidates(authRef)) {
    if (source[key]) return { key, value: source[key] };
  }
  return null;
}

/**
 * Resolve an explicit env var name (already UPPER_SNAKE, e.g. `QSTASH_TOKEN`).
 * Unlike `readServerSecret` this does NOT expand candidates — it is used for the
 * concrete `requiredEnv` / `probe.tokenEnv` keys a product declares.
 */
function readEnvVar(name, env = process.env) {
  const source = env && typeof env === "object" ? env : {};
  const key = String(name || "").trim();
  if (!key) return null;
  const value = source[key];
  return value ? { key, value } : null;
}

/**
 * Resolve a product's declared `requiredEnv` against the run environment.
 * Returns slug-safe evidence only: which keys resolved, which are missing, and
 * a map of resolved values for server-side use. NEVER returns secret values in
 * `resolved` — that list is key NAMES only.
 */
function resolveRequiredEnv(requiredEnv, env = process.env) {
  const keys = Array.isArray(requiredEnv) ? requiredEnv : [];
  const resolvedKeys = [];
  const missing = [];
  const values = {};
  for (const name of keys) {
    const hit = readEnvVar(name, env);
    if (hit) {
      resolvedKeys.push(hit.key);
      values[hit.key] = hit.value;
    } else {
      missing.push(String(name || "").trim());
    }
  }
  return { resolvedKeys, missing, values, ok: missing.length === 0 };
}

export { envKeyCandidates, readServerSecret, readEnvVar, resolveRequiredEnv };
