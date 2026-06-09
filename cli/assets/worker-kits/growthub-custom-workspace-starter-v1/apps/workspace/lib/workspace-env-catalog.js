/**
 * Workspace Env Key Catalog V1 — name-only projection of the env-key surface.
 *
 * Roadmap Phase 1.1. Single source of truth for "which env keys exist and are
 * usable" without ever exposing a secret value. Three planes converge here:
 *
 *   1. config     — integrations[] custom-api-webhooks endpointRef slugs
 *                   (written via Settings -> APIs & Webhooks).
 *   2. reference   — slugs referenced by api-registry row authRefs and
 *                    sandbox-environment row envRefs, but not declared in
 *                    integrations[]. These are "in use" but undeclared.
 *   3. env         — UPPER_SNAKE keys discovered directly in the runtime
 *                    environment (e.g. a `LEADSHARK` line in `.env.local`)
 *                    that are not already represented by a config/reference
 *                    slug. This is what made local `.env.local` keys invisible
 *                    in the sandbox drawer before this catalog existed.
 *
 * `configured` is the honest runtime signal: does an env candidate actually
 * resolve to a value right now? It uses the same `envKeyCandidates(ref)`
 * expansion the execution routes use (`test-api-record`, `sandbox-run`,
 * `orchestration-graph-runner`) so the catalog never disagrees with the runner.
 *
 * Contract: this module returns slugs + booleans only. It never returns,
 * logs, or hashes a secret value. The browser sees names and `configured`.
 */

import { envKeyCandidates } from "./workspace-env-resolver.js";

/**
 * Env keys we never surface as bindable secrets: framework, runtime, OS, and
 * workspace control flags. Matched as exact names or `<PREFIX>*` prefixes.
 * Keeps `.env.local` discovery focused on operator-authored secrets without
 * leaking deploy/runtime infrastructure variable names to the browser.
 */
const ENV_DISCOVERY_DENY_PREFIXES = [
  "NODE_", "NPM_", "npm_", "NEXT_", "__NEXT", "TURBO", "VERCEL", "AWS_",
  "GROWTHUB_SANDBOX_NET_", "GITHUB_", "CI_",
];
const ENV_DISCOVERY_DENY_EXACT = new Set([
  "PATH", "HOME", "PWD", "OLDPWD", "SHELL", "SHLVL", "USER", "LOGNAME",
  "HOSTNAME", "LANG", "LC_ALL", "TERM", "TZ", "TMPDIR", "EDITOR", "PAGER",
  "CI", "PORT", "NODE", "INIT_CWD", "COLOR", "FORCE_COLOR",
  "WORKSPACE_CONFIG_ALLOW_FS_WRITE", "GROWTHUB_WORKSPACE_DEPLOY_TARGET",
  "AGENCY_PORTAL_DEPLOY_TARGET", "GROWTHUB_ENV_CATALOG_DISCOVER",
]);

function isDiscoverableEnvName(name) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) return false;
  if (ENV_DISCOVERY_DENY_EXACT.has(name)) return false;
  if (name.startsWith("LC_")) return false;
  return !ENV_DISCOVERY_DENY_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function cleanRef(value) {
  return String(value || "").trim();
}

/**
 * Collect every env-key slug referenced across the governed config, tagged by
 * where it came from. Returns a Map<slug, { sources:Set, kinds:Set, inUse }>.
 */
function collectReferencedEnvSlugs(workspaceConfig) {
  const refs = new Map();
  const note = (slug, source, kind) => {
    const key = cleanRef(slug);
    if (!key) return;
    const entry = refs.get(key) || { sources: new Set(), kinds: new Set(), inUse: false };
    entry.sources.add(source);
    if (kind) entry.kinds.add(kind);
    if (source !== "config") entry.inUse = true;
    refs.set(key, entry);
  };

  const integrations = Array.isArray(workspaceConfig?.integrations) ? workspaceConfig.integrations : [];
  for (const entry of integrations) {
    if (entry?.sourceType !== "custom-api-webhooks") continue;
    note(entry.endpointRef, "config", entry.kind === "webhook" ? "webhook" : "api");
  }

  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  for (const object of objects) {
    const rows = Array.isArray(object?.rows) ? object.rows : [];
    if (object?.objectType === "api-registry") {
      for (const row of rows) note(row?.authRef, "reference", "api");
    }
    if (object?.objectType === "sandbox-environment") {
      for (const row of rows) {
        const raw = row?.envRefs;
        const slugs = Array.isArray(raw)
          ? raw
          : String(raw || "").split(",");
        for (const slug of slugs) note(slug, "reference");
      }
    }
  }

  return refs;
}

/**
 * Build the env key catalog. Pure: `env` is injected so it is fully testable
 * (defaults to process.env). `discover` toggles raw env-key discovery.
 *
 * Returns:
 *   {
 *     kind: "growthub-env-key-catalog-v1",
 *     entries: [{ slug, source, configured, kinds, inUse }],
 *     summary: { total, configured, missing }
 *   }
 * never any secret value.
 */
function buildEnvKeyCatalog(workspaceConfig, env = process.env, { discover = true } = {}) {
  const source = env && typeof env === "object" ? env : {};
  const referenced = collectReferencedEnvSlugs(workspaceConfig);
  const entries = new Map();

  const resolves = (slug) => envKeyCandidates(slug).some((key) => Boolean(source[key]));

  for (const [slug, meta] of referenced) {
    // A slug declared in integrations[] is "config"; otherwise it is in use but
    // undeclared ("reference").
    const tier = meta.sources.has("config") ? "config" : "reference";
    entries.set(slug, {
      slug,
      source: tier,
      configured: resolves(slug),
      kinds: Array.from(meta.kinds).sort(),
      inUse: meta.inUse,
    });
  }

  if (discover && String(source.GROWTHUB_ENV_CATALOG_DISCOVER || "").trim().toLowerCase() !== "false") {
    // Surface operator-authored env keys (e.g. `.env.local` lines) that are not
    // already represented by a config/reference slug's candidate expansion.
    const claimed = new Set();
    for (const slug of entries.keys()) {
      for (const candidate of envKeyCandidates(slug)) claimed.add(candidate);
    }
    for (const name of Object.keys(source)) {
      if (!isDiscoverableEnvName(name)) continue;
      if (claimed.has(name)) continue;
      if (entries.has(name)) continue;
      entries.set(name, {
        slug: name,
        source: "env",
        configured: true,
        kinds: [],
        inUse: false,
      });
    }
  }

  const list = Array.from(entries.values()).sort((a, b) => a.slug.localeCompare(b.slug));
  const configured = list.filter((e) => e.configured).length;
  return {
    kind: "growthub-env-key-catalog-v1",
    entries: list,
    summary: {
      total: list.length,
      configured,
      missing: list.length - configured,
    },
  };
}

export { envKeyCandidates, collectReferencedEnvSlugs, buildEnvKeyCatalog };
