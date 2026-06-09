#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const kitLib = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib");
const mod = await import(pathToFileURL(path.join(kitLib, "workspace-creation-readiness.js")).href);
const { deriveCreationReadiness } = mod;

test("creation readiness — fresh workspace points to register API", () => {
  const readiness = deriveCreationReadiness({
    workspaceConfig: { dataModel: { objects: [] } },
    workspaceSourceRecords: {},
    persistence: { canSave: true, mode: "filesystem" },
    env: {},
  });
  assert.equal(readiness.kind, "growthub-creation-readiness-v1");
  assert.equal(readiness.complete, false);
  assert.equal(readiness.nextAction?.id, "api-registry");
});

test("creation readiness — tested api advances checks", () => {
  const readiness = deriveCreationReadiness({
    workspaceConfig: {
      dataModel: {
        objects: [{
          objectType: "api-registry",
          id: "api-registry",
          rows: [{ integrationId: "leadshark", testStatus: "connected", authRef: "leadshark" }],
        }],
      },
    },
    workspaceSourceRecords: {},
    persistence: { canSave: true, mode: "filesystem" },
    env: { LEADSHARK_API_KEY: "x" },
  });
  const tested = readiness.checks.find((c) => c.id === "api-tested");
  assert.equal(tested.status, "complete");
});
