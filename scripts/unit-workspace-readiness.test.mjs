#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const kitLib = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib");
const mod = await import(pathToFileURL(path.join(kitLib, "workspace-readiness.js")).href);

const { deriveWorkspaceReadiness } = mod;

test("deriveWorkspaceReadiness — fresh workspace scenario", () => {
  const state = deriveWorkspaceReadiness({
    workspaceConfig: { dataModel: { objects: [] }, integrations: [] },
    persistence: { canSave: true, mode: "filesystem" },
  }, {});
  assert.equal(state.kind, "growthub-workspace-readiness-v1");
  assert.equal(state.scenario, "fresh");
  assert.ok(state.checks.length >= 6);
});

test("deriveWorkspaceReadiness — missing env keys", () => {
  const state = deriveWorkspaceReadiness({
    workspaceConfig: {
      integrations: [{ sourceType: "custom-api-webhooks", endpointRef: "leadshark" }],
      dataModel: { objects: [{ objectType: "api-registry", rows: [{ authRef: "leadshark", status: "" }] }] },
    },
    persistence: { canSave: true },
  }, {});
  assert.equal(state.scenario, "missing-env");
  assert.ok(state.nextBestAction);
});

test("deriveWorkspaceReadiness — never includes secret values in env catalog entries", () => {
  const state = deriveWorkspaceReadiness({
    workspaceConfig: { integrations: [{ sourceType: "custom-api-webhooks", endpointRef: "x" }] },
    persistence: { canSave: true },
  }, { X_API_KEY: "secret" });
  for (const entry of state.envCatalog.entries) {
    assert.equal("value" in entry, false);
    assert.equal("secret" in entry, false);
  }
});
