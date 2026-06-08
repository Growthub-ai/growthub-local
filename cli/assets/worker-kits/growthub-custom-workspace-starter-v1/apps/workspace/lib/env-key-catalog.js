/**
 * Env key catalog — name-only projection of config integrations[], in-use
 * authRefs/envRefs, and server-resolved process.env slugs. Never exposes values.
 */

const ENV_SCAN_PREFIXES = Object.freeze([
  "GROWTHUB_",
  "NANGO_",
  "OLLAMA_",
  "LMSTUDIO_",
  "VLLM_",
  "OPENAI_",
  "ANTHROPIC_",
  "SUPABASE_",
  "QSTASH_",
  "VERCEL_"
]);

function envKeyCandidates(ref) {
  const token = String(ref || "")
    .trim()
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return Array.from(new Set([
    token,
    token ? `${token}_API_KEY` : "",
    token ? `${token}_TOKEN` : "",
    token ? `${token}_SECRET_KEY` : ""
  ].filter(Boolean)));
}

function isEnvRefResolved(slug, env = process.env) {
  return envKeyCandidates(slug).some((key) => Boolean(env[key]));
}

function collectInUseSlugs(workspaceConfig) {
  const slugs = new Set();
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  for (const object of objects) {
    const rows = Array.isArray(object.rows) ? object.rows : [];
    for (const row of rows) {
      if (object.objectType === "api-registry") {
        const authRef = String(row?.authRef || "").trim();
        if (authRef) slugs.add(authRef);
      }
      if (object.objectType === "sandbox-environment") {
        const envRefs = String(row?.envRefs || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
        envRefs.forEach((slug) => slugs.add(slug));
      }
      if (object.objectType === "data-source") {
        const registryId = String(row?.registryId || "").trim();
        if (registryId) slugs.add(registryId);
      }
    }
  }
  return slugs;
}

function scanProcessEnvSlugs(inUseSlugs, env = process.env) {
  const found = new Set();
  for (const key of Object.keys(env)) {
    if (!key || env[key] === undefined || env[key] === "") continue;
    const upper = key.toUpperCase();
    const prefixMatch = ENV_SCAN_PREFIXES.some((prefix) => upper.startsWith(prefix));
    const inUseMatch = [...inUseSlugs].some((slug) => envKeyCandidates(slug).includes(upper));
    if (prefixMatch || inUseMatch) found.add(upper);
  }
  return found;
}

/**
 * Build merged env ref catalog for GET /api/workspace/env-key-catalog.
 *
 * @returns {{ refs: Array<{ endpointRef: string, source: string, configured: boolean, kind?: string }> }}
 */
function buildEnvKeyCatalog(workspaceConfig, env = process.env) {
  const bySlug = new Map();
  const inUseSlugs = collectInUseSlugs(workspaceConfig);

  const integrations = Array.isArray(workspaceConfig?.integrations) ? workspaceConfig.integrations : [];
  for (const entry of integrations) {
    if (entry?.sourceType !== "custom-api-webhooks") continue;
    const endpointRef = String(entry?.endpointRef || "").trim();
    if (!endpointRef) continue;
    bySlug.set(endpointRef, {
      endpointRef,
      source: "config",
      configured: entry.hasSecret === true || isEnvRefResolved(endpointRef, env),
      kind: entry.kind === "webhook" ? "webhook" : "api"
    });
  }

  for (const slug of inUseSlugs) {
    if (!slug || bySlug.has(slug)) {
      if (slug && bySlug.has(slug)) {
        const existing = bySlug.get(slug);
        bySlug.set(slug, {
          ...existing,
          configured: existing.configured || isEnvRefResolved(slug, env)
        });
      }
      continue;
    }
    bySlug.set(slug, {
      endpointRef: slug,
      source: "authRef-in-use",
      configured: isEnvRefResolved(slug, env),
      kind: "api"
    });
  }

  for (const key of scanProcessEnvSlugs(inUseSlugs, env)) {
    if (bySlug.has(key)) {
      const existing = bySlug.get(key);
      bySlug.set(key, { ...existing, configured: true, source: existing.source === "config" ? "config" : "env" });
      continue;
    }
    bySlug.set(key, {
      endpointRef: key,
      source: "env",
      configured: true,
      kind: "api"
    });
  }

  const refs = [...bySlug.values()].sort((a, b) => a.endpointRef.localeCompare(b.endpointRef));
  return { refs };
}

export {
  ENV_SCAN_PREFIXES,
  buildEnvKeyCatalog,
  collectInUseSlugs,
  envKeyCandidates,
  isEnvRefResolved
};
