#!/usr/bin/env node
/**
 * Unit coverage for the Workspace Env Key Catalog V1 — roadmap Phase 1.1.
 *
 * Standalone — runs against the bundled growthub-custom-workspace-starter-v1
 * sources via node:test (no npm install).
 *
 *   - catalog merges config integrations[], in-use authRefs/envRefs, and
 *     discovered runtime env keys
 *   - `configured` reflects the same envKeyCandidates() expansion the runner uses
 *   - the catalog is secret-safe: it never returns a value, only slugs + booleans
 *   - discovery is filtered (no framework/system var names leak)
 *   - never throws on partial / empty input
 *
 * Run with:  node --test scripts/unit-workspace-env-catalog.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib",
);

const mod = await import(
  pathToFileURL(path.join(kitLib, "workspace-env-catalog.js")).href
);

const { envKeyCandidates, collectReferencedEnvSlugs, buildEnvKeyCatalog } = mod;

const sampleConfig = {
  integrations: [
    { sourceType: "custom-api-webhooks", endpointRef: "leadshark", kind: "api", hasSecret: true },
    { sourceType: "custom-api-webhooks", endpointRef: "notify_hook", kind: "webhook" },
    { sourceType: "other", endpointRef: "ignored" },
  ],
  dataModel: {
    objects: [
      { objectType: "api-registry", rows: [{ authRef: "leadshark" }, { authRef: "stripe" }] },
      { objectType: "sandbox-environment", rows: [{ envRefs: "stripe, custom_only" }] },
    ],
  },
};

test("env catalog — public API exports", () => {
  assert.equal(typeof envKeyCandidates, "function");
  assert.equal(typeof collectReferencedEnvSlugs, "function");
  assert.equal(typeof buildEnvKeyCatalog, "function");
});

test("envKeyCandidates — canonical UPPER_SNAKE expansion matches runner", () => {
  assert.deepEqual(envKeyCandidates("leadshark"), ["LEADSHARK", "LEADSHARK_API_KEY", "LEADSHARK_TOKEN"]);
  assert.deepEqual(envKeyCandidates("My-Key.v2"), ["MY_KEY_V2", "MY_KEY_V2_API_KEY", "MY_KEY_V2_TOKEN"]);
  assert.deepEqual(envKeyCandidates(""), []);
  assert.deepEqual(envKeyCandidates(null), []);
});

test("collectReferencedEnvSlugs — gathers config + reference slugs, tagged", () => {
  const refs = collectReferencedEnvSlugs(sampleConfig);
  assert.ok(refs.has("leadshark"));
  assert.ok(refs.get("leadshark").sources.has("config"));
  assert.ok(refs.get("leadshark").sources.has("reference"));
  assert.ok(refs.has("stripe"));
  assert.equal(refs.get("stripe").sources.has("config"), false);
  assert.ok(refs.has("custom_only"));
  assert.equal(refs.has("ignored"), false);
});

test("buildEnvKeyCatalog — merges sources and resolves configured booleans", () => {
  const env = {
    LEADSHARK_API_KEY: "secret-value",
    STRIPE: "sk_live_x",
    EXTRA_LOCAL_KEY: "abc",
    // framework/system noise that must NOT leak via discovery:
    PATH: "/usr/bin",
    NODE_ENV: "test",
    VERCEL_URL: "x",
  };
  const catalog = buildEnvKeyCatalog(sampleConfig, env);
  assert.equal(catalog.kind, "growthub-env-key-catalog-v1");

  const bySlug = Object.fromEntries(catalog.entries.map((e) => [e.slug, e]));

  // config slug, resolves via _API_KEY candidate
  assert.equal(bySlug.leadshark.source, "config");
  assert.equal(bySlug.leadshark.configured, true);

  // config slug, no env value present
  assert.equal(bySlug.notify_hook.source, "config");
  assert.equal(bySlug.notify_hook.configured, false);

  // reference-only slug, resolves directly
  assert.equal(bySlug.stripe.source, "reference");
  assert.equal(bySlug.stripe.configured, true);
  assert.equal(bySlug.stripe.inUse, true);

  // discovered raw env key
  assert.equal(bySlug.EXTRA_LOCAL_KEY.source, "env");
  assert.equal(bySlug.EXTRA_LOCAL_KEY.configured, true);

  // discovery must filter framework/system var names
  assert.equal(bySlug.PATH, undefined);
  assert.equal(bySlug.NODE_ENV, undefined);
  assert.equal(bySlug.VERCEL_URL, undefined);
});

test("buildEnvKeyCatalog — secret-safe: never returns a value", () => {
  const env = { LEADSHARK: "TOP-SECRET-DO-NOT-LEAK" };
  const catalog = buildEnvKeyCatalog(sampleConfig, env);
  const serialized = JSON.stringify(catalog);
  assert.equal(serialized.includes("TOP-SECRET-DO-NOT-LEAK"), false);
});

test("buildEnvKeyCatalog — discovery opt-out flag", () => {
  const env = { EXTRA_LOCAL_KEY: "abc", GROWTHUB_ENV_CATALOG_DISCOVER: "false" };
  const catalog = buildEnvKeyCatalog(sampleConfig, env);
  const slugs = catalog.entries.map((e) => e.slug);
  assert.equal(slugs.includes("EXTRA_LOCAL_KEY"), false);
});

test("buildEnvKeyCatalog — never throws on partial/empty input", () => {
  assert.doesNotThrow(() => buildEnvKeyCatalog(undefined, {}));
  assert.doesNotThrow(() => buildEnvKeyCatalog({}, undefined));
  assert.doesNotThrow(() => buildEnvKeyCatalog(null, null));
  const empty = buildEnvKeyCatalog({}, {});
  assert.equal(empty.entries.length, 0);
  assert.deepEqual(empty.summary, { total: 0, configured: 0, missing: 0 });
});

test("buildEnvKeyCatalog — summary counts are consistent", () => {
  const catalog = buildEnvKeyCatalog(sampleConfig, { LEADSHARK: "x", STRIPE: "y" });
  assert.equal(catalog.summary.total, catalog.entries.length);
  assert.equal(catalog.summary.configured + catalog.summary.missing, catalog.summary.total);
});
