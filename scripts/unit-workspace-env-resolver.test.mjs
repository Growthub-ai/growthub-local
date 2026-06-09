#!/usr/bin/env node
/**
 * Unit coverage for the shared server-only env resolver — the single source of
 * truth for env-key-catalog, test-api-record, sandbox-run, the orchestration
 * runner, and the sandbox scheduler.
 *
 *   - candidate expansion is canonical UPPER_SNAKE, widest-first
 *   - readServerSecret / resolveServerSecretEntry resolve from the env map
 *   - resolveEnvRefs partitions resolved vs missing (name-only, no value leak)
 *   - IMMEDIATE VISIBILITY: a value set on process.env after import is seen
 *     without re-import (proves Settings -> .env.local -> process.env works
 *     with no restart)
 *
 * Run with:  node --test scripts/unit-workspace-env-resolver.test.mjs
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

const { envKeyCandidates, readServerSecret, resolveServerSecretEntry, isEnvRefResolved, resolveEnvRefs } =
  await import(pathToFileURL(path.join(kitLib, "workspace-env-resolver.js")).href);

test("envKeyCandidates — canonical UPPER_SNAKE, widest-first", () => {
  assert.deepEqual(envKeyCandidates("leadshark"), ["LEADSHARK", "LEADSHARK_API_KEY", "LEADSHARK_TOKEN"]);
  assert.deepEqual(envKeyCandidates("My-Key.v2"), ["MY_KEY_V2", "MY_KEY_V2_API_KEY", "MY_KEY_V2_TOKEN"]);
  assert.deepEqual(envKeyCandidates(""), []);
});

test("readServerSecret — resolves from an injected env map", () => {
  const env = { LEADSHARK_API_KEY: "sk_live" };
  assert.equal(readServerSecret("leadshark", env), "sk_live");
  assert.equal(readServerSecret("missing", env), "");
});

test("resolveServerSecretEntry — returns matched { key, value }", () => {
  const env = { STRIPE_TOKEN: "tok" };
  assert.deepEqual(resolveServerSecretEntry("stripe", env), { key: "STRIPE_TOKEN", value: "tok" });
  assert.equal(resolveServerSecretEntry("nope", env), null);
});

test("resolveEnvRefs — partitions resolved vs missing, name-only", () => {
  const env = { ALPHA: "1", BETA_API_KEY: "2" };
  const out = resolveEnvRefs(["alpha", "beta", "gamma"], env);
  assert.deepEqual(out.resolved, ["alpha", "beta"]);
  assert.deepEqual(out.missing, ["gamma"]);
  assert.equal(JSON.stringify(out).includes("1"), false);
});

test("immediate visibility — value set on process.env after import is seen now", () => {
  const slug = "probe_runtime_secret_" + Math.random().toString(36).slice(2, 8);
  const name = envKeyCandidates(slug)[0];
  assert.equal(isEnvRefResolved(slug), false);
  process.env[name] = "live-value";
  try {
    assert.equal(isEnvRefResolved(slug), true);
    assert.equal(readServerSecret(slug), "live-value");
  } finally {
    delete process.env[name];
  }
});

test("resolver — never throws on bad input", () => {
  assert.doesNotThrow(() => resolveEnvRefs(undefined));
  assert.doesNotThrow(() => readServerSecret(null, null));
  assert.deepEqual(resolveEnvRefs(null).resolved, []);
});
