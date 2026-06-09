#!/usr/bin/env node
/**
 * Unit coverage for lib/env-status.js — the secret-safe signal that powers the
 * cockpit's auth-readiness ("which referenced env refs resolve right now").
 *
 *   - candidate expansion is the canonical UPPER_SNAKE family
 *   - collects authRef (api-registry + data-source) and envRefs (sandbox, csv)
 *   - configured set resolves through injected env; returns slugs only, no value
 *   - never throws on partial input
 *
 * Run with:  node --test scripts/unit-env-status.test.mjs
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
const mod = await import(pathToFileURL(path.join(kitLib, "env-status.js")).href);
const { envKeyCandidates, collectReferencedRefs, computeConfiguredEnvRefs } = mod;

const SECRET = "sk-never-7777";

const cfg = {
  dataModel: { objects: [
    { objectType: "api-registry", rows: [{ integrationId: "leadshark", authRef: "LEADSHARK" }, { integrationId: "open", authRef: "" }] },
    { objectType: "data-source", rows: [{ registryId: "leadshark", authRef: "STRIPE" }] },
    { objectType: "sandbox-environment", rows: [{ Name: "wf", envRefs: "LEADSHARK, NANGO_SECRET_KEY" }] },
  ] },
};

test("envKeyCandidates — canonical family", () => {
  assert.deepEqual(envKeyCandidates("leadshark"), ["LEADSHARK", "LEADSHARK_API_KEY", "LEADSHARK_TOKEN"]);
  assert.deepEqual(envKeyCandidates(""), []);
});

test("collectReferencedRefs — auth + env refs, deduped", () => {
  const refs = collectReferencedRefs(cfg).sort();
  assert.deepEqual(refs, ["LEADSHARK", "NANGO_SECRET_KEY", "STRIPE"]);
});

test("computeConfiguredEnvRefs — only refs that resolve in env, slugs only", () => {
  const env = { LEADSHARK_API_KEY: SECRET, NANGO_SECRET_KEY: "x" };
  const configured = computeConfiguredEnvRefs(cfg, env).sort();
  assert.deepEqual(configured, ["LEADSHARK", "NANGO_SECRET_KEY"]);
  assert.ok(!JSON.stringify(configured).includes(SECRET));
});

test("computeConfiguredEnvRefs — empty when nothing resolves", () => {
  assert.deepEqual(computeConfiguredEnvRefs(cfg, {}), []);
});

test("never throws on partial input", () => {
  assert.doesNotThrow(() => collectReferencedRefs(undefined));
  assert.doesNotThrow(() => computeConfiguredEnvRefs(undefined, undefined));
  assert.deepEqual(collectReferencedRefs({}), []);
});
