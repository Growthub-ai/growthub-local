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
    { objectType: "api-registry", rows: [{ integrationId: "acme", authRef: "ACME" }, { integrationId: "open", authRef: "" }] },
    { objectType: "data-source", rows: [{ registryId: "acme", authRef: "STRIPE" }] },
    { objectType: "sandbox-environment", rows: [{ Name: "wf", envRefs: "ACME, NANGO_SECRET_KEY" }] },
  ] },
};

test("envKeyCandidates — canonical family", () => {
  assert.deepEqual(envKeyCandidates("acme"), ["ACME", "ACME_API_KEY", "ACME_TOKEN"]);
  assert.deepEqual(envKeyCandidates(""), []);
});

test("collectReferencedRefs — auth + env refs, deduped, plus always-referenced native inbound refs", () => {
  const refs = collectReferencedRefs(cfg).sort();
  // Native inbound input methods (webhook / api-request) are workspace-level
  // capabilities: their signing/invoke refs are always part of the signal.
  assert.deepEqual(refs, ["ACME", "GROWTHUB_API_INVOKE_TOKEN", "GROWTHUB_WEBHOOK_SIGNING_SECRET", "NANGO_SECRET_KEY", "STRIPE"]);
});

test("computeConfiguredEnvRefs — only refs that resolve in env, slugs only", () => {
  const env = { ACME_API_KEY: SECRET, NANGO_SECRET_KEY: "x" };
  const configured = computeConfiguredEnvRefs(cfg, env).sort();
  assert.deepEqual(configured, ["ACME", "NANGO_SECRET_KEY"]);
  assert.ok(!JSON.stringify(configured).includes(SECRET));
});

test("computeConfiguredEnvRefs — empty when nothing resolves", () => {
  assert.deepEqual(computeConfiguredEnvRefs(cfg, {}), []);
});

test("never throws on partial input", () => {
  assert.doesNotThrow(() => collectReferencedRefs(undefined));
  assert.doesNotThrow(() => computeConfiguredEnvRefs(undefined, undefined));
  // Even with no config, the native inbound refs remain referenced.
  assert.deepEqual(collectReferencedRefs({}).sort(), ["GROWTHUB_API_INVOKE_TOKEN", "GROWTHUB_WEBHOOK_SIGNING_SECRET"]);
});
