#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const kitLib = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib");
const mod = await import(pathToFileURL(path.join(kitLib, "workspace-readiness.js")).href);

const { deriveWorkspaceReadiness } = mod;

const persistence = { mode: "filesystem", canSave: true };

test("fresh workspace scenario", () => {
  const r = deriveWorkspaceReadiness({ dataModel: { objects: [] } }, {}, persistence, {});
  assert.equal(r.scenario, "fresh-workspace");
  assert.ok(r.nextAction?.href);
});

test("readiness never includes secret values", () => {
  const r = deriveWorkspaceReadiness({
    integrations: [{ sourceType: "custom-api-webhooks", endpointRef: "x" }],
    dataModel: { objects: [] },
  }, {}, persistence, { X: "secret" });
  assert.equal(JSON.stringify(r).includes("secret"), false);
});
