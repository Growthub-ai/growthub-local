/**
 * Env key catalog — name-only projection of config integrations[], in-use
 * authRef/envRefs slugs, and process.env matches. Never exposes secret values.
 *
 * Used by GET /api/workspace/env-key-catalog and Settings → .env.local writes.
 */

const ENV_SCAN_PREFIXES = ["NANGO_", "GROWTHUB_", "WORKSPACE_", "GOOGLE_", "OPENAI_", "ANTHROPIC_"];

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
    token ? `${token}_SECRET_KEY` : "",
  ].filter(Boolean)));
}

function isEnvSlugResolved(slug) {
  for (const key of envKeyCandidates(slug)) {
    if (process.env[key]) return true;
  }
  return false;
}

function collectConfigEnvSlugs(workspaceConfig) {
  const slugs = new Map();
  const integrations = Array.isArray(workspaceConfig?.integrations) ? workspaceConfig.integrations : [];
  for (const entry of integrations) {
    if (entry?.sourceType !== "custom-api-webhooks") continue;
    const endpointRef = String(entry?.endpointRef || "").trim();
    if (!endpointRef) continue;
    slugs.set(endpointRef, {
      endpointRef,
      source: "config",
      kind: entry.kind === "webhook" ? "webhook" : "api",
      hasSecret: entry.hasSecret === true,
    });
  }
  return slugs;
}

function collectInUseEnvSlugs(workspaceConfig) {
  const slugs = new Set();
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  for (const object of objects) {
    const rows = Array.isArray(object?.rows) ? object.rows : [];
    for (const row of rows) {
      const authRef = String(row?.authRef || "").trim();
      if (authRef) slugs.add(authRef);
      const envRefsRaw = row?.envRefs;
      const envRefs = Array.isArray(envRefsRaw)
        ? envRefsRaw
        : String(envRefsRaw || "").split(",").map((s) => s.trim()).filter(Boolean);
      for (const slug of envRefs) slugs.add(slug);
    }
    if (object?.objectType === "sandbox-environment") {
      for (const row of rows) {
        const graphRaw = row?.orchestrationConfig || row?.orchestrationGraph || row?.orchestrationDraftConfig || row?.orchestrationDraftGraph || "";
        if (!graphRaw) continue;
        try {
          const graph = typeof graphRaw === "string" ? JSON.parse(graphRaw) : graphRaw;
          for (const node of graph?.nodes || []) {
            const nodeAuth = String(node?.config?.authRef || "").trim();
            if (nodeAuth) slugs.add(nodeAuth);
          }
        } catch {
          /* skip malformed graph */
        }
      }
    }
  }
  return slugs;
}

function collectProcessEnvSlugs(knownSlugs) {
  const discovered = new Set();
  const envKeys = Object.keys(process.env || {});
  for (const envKey of envKeys) {
    if (!envKey || !process.env[envKey]) continue;
    const upper = envKey.toUpperCase();
    if (ENV_SCAN_PREFIXES.some((prefix) => upper.startsWith(prefix))) {
      discovered.add(upper);
      continue;
    }
    for (const slug of knownSlugs) {
      if (envKeyCandidates(slug).includes(upper)) {
        discovered.add(slug);
      }
    }
  }
  return discovered;
}

/**
 * Build merged env ref catalog. Returns { refs: [{ endpointRef, source, configured, kind?, hasSecret? }] }.
 * `configured` means at least one envKeyCandidates match resolves in process.env.
 */
function buildEnvKeyCatalog(workspaceConfig) {
  const configSlugs = collectConfigEnvSlugs(workspaceConfig);
  const inUseSlugs = collectInUseEnvSlugs(workspaceConfig);
  const allKnown = new Set([...configSlugs.keys(), ...inUseSlugs]);
  const processDiscovered = collectProcessEnvSlugs(allKnown);

  const merged = new Map();

  for (const [endpointRef, meta] of configSlugs) {
    merged.set(endpointRef, {
      endpointRef,
      source: meta.source,
      kind: meta.kind,
      hasSecret: meta.hasSecret,
      configured: isEnvSlugResolved(endpointRef),
    });
  }

  for (const slug of inUseSlugs) {
    if (merged.has(slug)) {
      const existing = merged.get(slug);
      if (existing.source === "config") existing.inUse = true;
      continue;
    }
    merged.set(slug, {
      endpointRef: slug,
      source: "in-use",
      configured: isEnvSlugResolved(slug),
      inUse: true,
    });
  }

  for (const slug of processDiscovered) {
    if (merged.has(slug)) {
      const existing = merged.get(slug);
      existing.configured = true;
      if (existing.source !== "config") existing.source = "process-env";
      continue;
    }
    merged.set(slug, {
      endpointRef: slug,
      source: "process-env",
      configured: true,
    });
  }

  for (const [endpointRef, entry] of merged) {
    entry.configured = isEnvSlugResolved(endpointRef);
  }

  const refs = Array.from(merged.values()).sort((a, b) => a.endpointRef.localeCompare(b.endpointRef));
  return { refs };
}

export {
  ENV_SCAN_PREFIXES,
  buildEnvKeyCatalog,
  collectInUseEnvSlugs,
  envKeyCandidates,
  isEnvSlugResolved,
};
