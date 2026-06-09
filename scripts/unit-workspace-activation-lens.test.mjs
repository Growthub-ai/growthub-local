#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const kitLib = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib");
const mod = await import(pathToFileURL(path.join(kitLib, "workspace-activation-lens.js")).href);

const { deriveActivationLens } = mod;

test("deriveActivationLens — missing API registry", () => {
  const lens = deriveActivationLens({ workspaceConfig: { dataModel: { objects: [] } } }, {});
  assert.equal(lens.kind, "growthub-activation-lens-v1");
  assert.ok(lens.checks.some((c) => c.id === "api-registry-exists"));
  assert.ok(lens.nextAction);
});

test("deriveActivationLens — auth blocked when env missing", () => {
  const lens = deriveActivationLens({
    workspaceConfig: {
      dataModel: {
        objects: [{
          objectType: "api-registry",
          rows: [{ integrationId: "leadshark", authRef: "leadshark", status: "" }],
        }],
      },
    },
  }, {});
  assert.ok(lens.checks.some((c) => c.id === "auth-leadshark" && c.status === "blocked"));
});

test("deriveActivationLens — no secret values in output", () => {
  const lens = deriveActivationLens({
    workspaceConfig: {
      dataModel: {
        objects: [{
          objectType: "api-registry",
          rows: [{ integrationId: "x", authRef: "x", status: "connected" }],
        }],
      },
    },
  }, { X_API_KEY: "super-secret" });
  const json = JSON.stringify(lens);
  assert.equal(json.includes("super-secret"), false);
});
