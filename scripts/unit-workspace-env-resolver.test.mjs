#!/usr/bin/env node
/**
 * Unit coverage for workspace-env-resolver.js
 * Run: node --test scripts/unit-workspace-env-resolver.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(here, "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib");

const mod = await import(pathToFileURL(path.join(kitLib, "workspace-env-resolver.js")).href);

test("readServerSecret resolves from env candidates without leaking through describe", () => {
  const env = { LEADSHARK_API_KEY: "secret-value" };
  assert.equal(mod.readServerSecret("leadshark", env), "secret-value");
  const described = mod.describeEnvRefResolution("leadshark", env);
  assert.equal(described.configured, true);
  assert.equal(described.resolvedKey, "LEADSHARK_API_KEY");
  assert.ok(!JSON.stringify(described).includes("secret-value"));
});

test("isEnvRefConfigured is boolean only", () => {
  assert.equal(mod.isEnvRefConfigured("missing", {}), false);
  assert.equal(mod.isEnvRefConfigured("foo", { FOO_TOKEN: "x" }), true);
});

test("envKeyCandidates matches catalog expansion", () => {
  assert.deepEqual(mod.envKeyCandidates("leadshark"), ["LEADSHARK", "LEADSHARK_API_KEY", "LEADSHARK_TOKEN"]);
});
