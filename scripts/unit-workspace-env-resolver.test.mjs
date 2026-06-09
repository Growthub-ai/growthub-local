#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const kitLib = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib");
const mod = await import(pathToFileURL(path.join(kitLib, "workspace-env-resolver.js")).href);

const { readServerSecret, readServerSecretEntry, resolveEnvRefStatuses } = mod;

test("readServerSecret resolves via envKeyCandidates expansion", () => {
  const env = { LEADSHARK_API_KEY: "secret-value" };
  assert.equal(readServerSecret("leadshark", env), "secret-value");
  assert.equal(readServerSecret("missing", env), "");
});

test("readServerSecret never returns value in catalog-style usage", () => {
  const env = { TOKEN: "x" };
  const value = readServerSecret("token", env);
  assert.ok(typeof value === "string");
});

test("readServerSecretEntry returns key metadata for runners", () => {
  const env = { STRIPE_TOKEN: "sk_test" };
  const entry = readServerSecretEntry("stripe", env);
  assert.equal(entry.key, "STRIPE_TOKEN");
  assert.equal(entry.value, "sk_test");
});

test("resolveEnvRefStatuses returns slug names only", () => {
  const env = { A: "1", B_TOKEN: "2" };
  const { resolved, missing } = resolveEnvRefStatuses(["a", "b", "c"], env);
  assert.deepEqual(resolved, ["a", "b"]);
  assert.deepEqual(missing, ["c"]);
});
