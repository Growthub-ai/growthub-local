/**
 * Env key catalog — name-only projection of config integrations, in-use
 * authRefs/envRefs, and server-resolved process.env slugs. Never exposes values.
 */

import { parseSandboxEnvRefs } from "./workspace-data-model.js";

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

function isEnvRefResolved(ref) {
  return envKeyCandidates(ref).some((key) => Boolean(process.env[key]));
}

function collectAuthRefsFromConfig(workspaceConfig) {
  const refs = new Set();
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  for (const object of objects) {
    const rows = Array.isArray(object?.rows) ? object.rows : [];
    for (const row of rows) {
      const authRef = String(row?.authRef || "").trim();
      if (authRef) refs.add(authRef);
      if (object?.objectType === "sandbox-environment") {
        for (const slug of parseSandboxEnvRefs(row?.envRefs)) refs.add(slug);
      }
    }
  }
  return refs;
}

function discoverProcessEnvSlugs() {
  const slugs = new Set();
  const allowPrefixes = ["NANGO_", "GROWTHUB_", "WORKSPACE_"];
  for (const [key, value] of Object.entries(process.env)) {
    if (!value || typeof value !== "string" || !value.trim()) continue;
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) continue;
    slugs.add(key);
    const base = key.replace(/_(API_KEY|TOKEN|SECRET|SECRET_KEY)$/, "");
    if (base && base !== key) slugs.add(base);
    if (allowPrefixes.some((prefix) => key.startsWith(prefix))) {
      slugs.add(key);
    }
  }
  return slugs;
}

/**
 * Build merged env ref catalog for GET /api/workspace/env-key-catalog.
 *
 * @returns {{ refs: Array<{ endpointRef: string, source: string, configured: boolean, kind?: string }> }}
 */
function buildEnvKeyCatalog(workspaceConfig) {
  const bySlug = new Map();

  const addSlug = (rawSlug, source, extra = {}) => {
    const endpointRef = String(rawSlug || "").trim();
    if (!endpointRef) return;
    const existing = bySlug.get(endpointRef) || {
      endpointRef,
      sources: new Set(),
      kind: extra.kind || "api",
      hasSecret: false
    };
    existing.sources.add(source);
    if (extra.kind) existing.kind = extra.kind;
    if (extra.hasSecret === true) existing.hasSecret = true;
    bySlug.set(endpointRef, existing);
  };

  const integrations = Array.isArray(workspaceConfig?.integrations) ? workspaceConfig.integrations : [];
  for (const entry of integrations) {
    if (entry?.sourceType !== "custom-api-webhooks") continue;
    const endpointRef = String(entry?.endpointRef || "").trim();
    if (!endpointRef) continue;
    addSlug(endpointRef, "config", {
      kind: entry.kind === "webhook" ? "webhook" : "api",
      hasSecret: entry.hasSecret === true
    });
  }

  for (const authRef of collectAuthRefsFromConfig(workspaceConfig)) {
    addSlug(authRef, "authRef-in-use");
  }

  for (const slug of discoverProcessEnvSlugs()) {
    addSlug(slug, "env");
  }

  const refs = Array.from(bySlug.values()).map((entry) => {
    const configured = isEnvRefResolved(entry.endpointRef);
    const sources = Array.from(entry.sources);
    const source = sources.includes("config")
      ? "config"
      : sources.includes("env")
        ? "env"
        : sources[0] || "config";
    return {
      endpointRef: entry.endpointRef,
      source,
      configured,
      resolved: configured,
      kind: entry.kind,
      hasSecret: entry.hasSecret === true || configured
    };
  });

  refs.sort((a, b) => a.endpointRef.localeCompare(b.endpointRef));
  return { refs };
}

export {
  buildEnvKeyCatalog,
  collectAuthRefsFromConfig,
  discoverProcessEnvSlugs,
  envKeyCandidates,
  isEnvRefResolved
};
