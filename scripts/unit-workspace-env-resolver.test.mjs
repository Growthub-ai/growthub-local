#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const kitLib = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib");
const mod = await import(pathToFileURL(path.join(kitLib, "workspace-env-resolver.js")).href);
const { readServerSecret, isEnvRefConfigured, resolveEnvRefMeta } = mod;

test("env resolver — configures from process.env", () => {
  const env = { LEADSHARK_API_KEY: "secret-value" };
  assert.equal(isEnvRefConfigured("leadshark", env), true);
  assert.equal(readServerSecret("leadshark", env).key, "LEADSHARK_API_KEY");
});

test("env resolver — meta never leaks value", () => {
  const env = { LEADSHARK_API_KEY: "secret-value" };
  const meta = resolveEnvRefMeta("leadshark", env);
  assert.equal(meta.configured, true);
  assert.equal(meta.resolvedKey, "LEADSHARK_API_KEY");
  assert.equal(JSON.stringify(meta).includes("secret-value"), false);
});

test("env resolver — missing ref is not configured", () => {
  assert.equal(isEnvRefConfigured("missing", {}), false);
});
