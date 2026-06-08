/**
 * Env key catalog — name-only projection of config refs + in-use slugs + process.env resolution.
 * Never exposes secret values to callers; only slugs and resolved booleans.
 */

const SYSTEM_ENV_DENYLIST = new Set([
  "PATH",
  "HOME",
  "USER",
  "SHELL",
  "PWD",
  "OLDPWD",
  "LANG",
  "LC_ALL",
  "TERM",
  "TMPDIR",
  "NODE_ENV",
  "NODE_OPTIONS",
  "PORT",
  "HOSTNAME",
  "HOST",
  "npm_config_user_agent",
  "npm_lifecycle_event",
  "npm_node_execpath",
  "npm_execpath",
  "__NEXT_PRIVATE_ORIGIN",
  "NEXT_RUNTIME",
  "NEXT_DEPLOYMENT_ID",
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_REGION",
  "CI",
  "FORCE_COLOR",
  "NO_COLOR"
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
    token ? `${token}_SECRET` : "",
    token ? `${token}_SECRET_KEY` : ""
  ].filter(Boolean)));
}

function isEnvRefResolved(ref, env = process.env) {
  for (const key of envKeyCandidates(ref)) {
    if (env[key]) return true;
  }
  return false;
}

function collectInUseAuthRefs(workspaceConfig) {
  const slugs = new Set();
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  for (const object of objects) {
    const rows = Array.isArray(object?.rows) ? object.rows : [];
    for (const row of rows) {
      const authRef = String(row?.authRef || "").trim();
      if (authRef) slugs.add(authRef);
      if (object?.objectType === "sandbox-environment") {
        const envRefs = String(row?.envRefs || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
        envRefs.forEach((slug) => slugs.add(slug));
      }
      const registryId = String(row?.registryId || row?.schedulerRegistryId || "").trim();
      if (registryId) slugs.add(registryId);
    }
  }
  return slugs;
}

function listConfigEnvRefs(workspaceConfig) {
  const integrations = Array.isArray(workspaceConfig?.integrations) ? workspaceConfig.integrations : [];
  return integrations
    .filter((entry) => entry?.sourceType === "custom-api-webhooks" && typeof entry.endpointRef === "string" && entry.endpointRef.trim())
    .map((entry) => ({
      endpointRef: entry.endpointRef.trim(),
      kind: entry.kind === "webhook" ? "webhook" : "api",
      hasSecret: entry.hasSecret === true,
      source: "config"
    }));
}

function discoverProcessEnvSlugs(inUseSlugs, env = process.env) {
  const discovered = new Set();
  for (const slug of inUseSlugs) {
    for (const candidate of envKeyCandidates(slug)) {
      if (env[candidate]) discovered.add(slug);
    }
  }
  for (const key of Object.keys(env)) {
    if (!/^[A-Z][A-Z0-9_]{2,}$/.test(key)) continue;
    if (SYSTEM_ENV_DENYLIST.has(key)) continue;
    if (key.startsWith("npm_") || key.startsWith("__")) continue;
    discovered.add(key);
  }
  return discovered;
}

/**
 * Build merged env key catalog for GET /api/workspace/env-key-catalog.
 *
 * @returns {{ refs: Array<{ endpointRef: string, source: string, kind?: string, resolved: boolean, hasSecret?: boolean }> }}
 */
function buildEnvKeyCatalog(workspaceConfig, env = process.env) {
  const bySlug = new Map();
  const add = (endpointRef, meta) => {
    const slug = String(endpointRef || "").trim();
    if (!slug) return;
    const existing = bySlug.get(slug);
    const resolved = isEnvRefResolved(slug, env);
    if (!existing) {
      bySlug.set(slug, { endpointRef: slug, resolved, ...meta });
      return;
    }
    bySlug.set(slug, {
      ...existing,
      ...meta,
      endpointRef: slug,
      resolved: existing.resolved || resolved
    });
  };

  for (const entry of listConfigEnvRefs(workspaceConfig)) {
    add(entry.endpointRef, {
      source: "config",
      kind: entry.kind,
      hasSecret: entry.hasSecret
    });
  }

  const inUse = collectInUseAuthRefs(workspaceConfig);
  for (const slug of inUse) {
    add(slug, { source: bySlug.has(slug) ? bySlug.get(slug).source : "authRef-in-use" });
  }

  for (const slug of discoverProcessEnvSlugs(inUse, env)) {
    if (!bySlug.has(slug)) {
      add(slug, { source: "process-env" });
    } else {
      const row = bySlug.get(slug);
      if (row.source === "authRef-in-use") {
        bySlug.set(slug, { ...row, source: "process-env" });
      }
    }
  }

  for (const [slug, row] of bySlug) {
    bySlug.set(slug, { ...row, resolved: isEnvRefResolved(slug, env) });
  }

  const refs = [...bySlug.values()].sort((a, b) => a.endpointRef.localeCompare(b.endpointRef));
  return { refs };
}

export {
  SYSTEM_ENV_DENYLIST,
  buildEnvKeyCatalog,
  collectInUseAuthRefs,
  envKeyCandidates,
  isEnvRefResolved,
  listConfigEnvRefs
};
