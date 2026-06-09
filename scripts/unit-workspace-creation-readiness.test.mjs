#!/usr/bin/env node
/**
 * Unit coverage for workspace-creation-readiness.js
 * Run: node --test scripts/unit-workspace-creation-readiness.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(here, "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib");

const mod = await import(pathToFileURL(path.join(kitLib, "workspace-creation-readiness.js")).href);

test("fresh workspace derives missing checks without secrets", () => {
  const state = mod.deriveWorkspaceCreationReadiness({
    workspaceConfig: {},
    workspaceSourceRecords: {},
    persistence: { mode: "filesystem", canSave: true },
    canWriteEnv: true,
    env: {},
  });
  assert.equal(state.kind, "growthub-workspace-creation-readiness-v1");
  assert.equal(state.scenario, "fresh-workspace");
  assert.ok(state.nextAction);
  const json = JSON.stringify(state);
  assert.ok(!json.includes("API_KEY"));
  assert.ok(!/"[A-Za-z0-9_]*SECRET[A-Za-z0-9_]*"\s*:\s*"/.test(json));
});

test("activation checks derive from real api-registry row state", () => {
  const checks = mod.deriveCreationActivationChecks({
    workspaceConfig: {
      dataModel: {
        objects: [{
          objectType: "api-registry",
          rows: [{
            Name: "LeadShark",
            integrationId: "leadshark",
            baseUrl: "https://api.example.com",
            endpoint: "/v1/leads",
            method: "GET",
            authRef: "leadshark",
            status: "connected",
          }],
        }],
      },
    },
    workspaceSourceRecords: {},
    persistence: { canSave: true },
    env: { LEADSHARK_API_KEY: "hidden" },
  });
  const authCheck = checks.checks.find((c) => c.id === "auth-ref-resolves");
  assert.equal(authCheck.status, "ready");
  assert.ok(!JSON.stringify(checks).includes("hidden"));
});
