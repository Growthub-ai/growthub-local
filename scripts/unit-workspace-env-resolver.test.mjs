#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const kitLib = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib");
const mod = await import(pathToFileURL(path.join(kitLib, "workspace-env-resolver.js")).href);

const { envKeyCandidates, readServerSecret, isEnvRefConfigured, resolveEnvRefStatus, listMissingEnvRefs } = mod;

test("envKeyCandidates expands slug variants", () => {
  assert.deepEqual(envKeyCandidates("leadshark"), ["LEADSHARK", "LEADSHARK_API_KEY", "LEADSHARK_TOKEN"]);
});

test("readServerSecret never exposed via resolveEnvRefStatus", () => {
  const env = { LEADSHARK_API_KEY: "hidden-value" };
  const status = resolveEnvRefStatus("leadshark", env);
  assert.equal(status.configured, true);
  assert.equal(status.resolvedKey, "LEADSHARK_API_KEY");
  assert.equal("value" in status, false);
  assert.equal(JSON.stringify(status).includes("hidden"), false);
});

test("listMissingEnvRefs reports unresolved slugs", () => {
  assert.deepEqual(listMissingEnvRefs(["a", "b"], { A: "ok" }), ["b"]);
});

test("isEnvRefConfigured matches readServerSecret", () => {
  const env = { TOKEN: "x" };
  assert.equal(isEnvRefConfigured("token", env), true);
  assert.equal(readServerSecret("token", env)?.key, "TOKEN");
});
