/**
 * Workspace Env Resolver V1 — single server-side secret resolution surface.
 *
 * Every execution route (`test-api-record`, `sandbox-run`, orchestration runner,
 * env-key-catalog, sandbox-scheduler pre-flight) MUST resolve env refs through
 * this module so Settings → `.env.local` writes are visible immediately after
 * `writeWorkspaceEnvLocalSecrets` patches `process.env`.
 *
 * Contract: public helpers return slugs + booleans only. `readServerSecret`
 * is for server-side fetch/auth only — never serialize its return value to the
 * browser, config, sidecar, or helper rows.
 */

function envKeyCandidates(ref) {
  const token = String(ref || "")
    .trim()
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  if (!token) return [];
  return Array.from(new Set([token, `${token}_API_KEY`, `${token}_TOKEN`]));
}

function readServerSecret(authRef, env = process.env) {
  const source = env && typeof env === "object" ? env : {};
  for (const key of envKeyCandidates(authRef)) {
    const value = source[key];
    if (value != null && String(value).length > 0) {
      return { key, value: String(value) };
    }
  }
  return null;
}

function isEnvRefConfigured(authRef, env = process.env) {
  return Boolean(readServerSecret(authRef, env));
}

/**
 * Safe status for API/UI — never includes the secret value.
 */
function resolveEnvRefStatus(authRef, env = process.env) {
  const slug = String(authRef || "").trim();
  const candidates = envKeyCandidates(slug);
  const source = env && typeof env === "object" ? env : {};
  const resolvedKey = candidates.find((key) => Boolean(source[key])) || null;
  return {
    slug,
    candidates,
    configured: Boolean(resolvedKey),
    resolvedKey,
  };
}

function listMissingEnvRefs(slugs, env = process.env) {
  const list = Array.isArray(slugs) ? slugs : String(slugs || "").split(",");
  return list
    .map((slug) => String(slug || "").trim())
    .filter(Boolean)
    .filter((slug) => !isEnvRefConfigured(slug, env));
}

export {
  envKeyCandidates,
  readServerSecret,
  isEnvRefConfigured,
  resolveEnvRefStatus,
  listMissingEnvRefs,
};
