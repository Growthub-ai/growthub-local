#!/usr/bin/env node
/**
 * Unit coverage for the API setup lens — the derived truth layer (Phase 2E).
 * Runs against the bundled kit sources via node:test (no npm install).
 *
 *   - lens is registered + composed into deriveWorkspaceState
 *   - secret-safe: never returns a value
 *   - derives real readiness from api-registry rows + env catalog + resolvers
 *   - resolver-required-but-missing blocks; unknown env => not fake-complete
 *   - never throws on empty input
 *
 * Run with:  node --test scripts/unit-workspace-api-setup-lens.test.mjs
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
const activation = await import(pathToFileURL(path.join(kitLib, "workspace-activation.js")).href);
const { deriveApiSetupLensState, deriveWorkspaceState, WORKSPACE_LENS_REGISTRY, LENS_STATE_KIND } = activation;

function statusById(state) {
  return Object.fromEntries(state.steps.map((s) => [s.id, s.status]));
}

const registeredConfig = {
  dataModel: {
    objects: [
      {
        id: "apis", objectType: "api-registry",
        rows: [{ integrationId: "leadshark", authRef: "leadshark", baseUrl: "https://api.leadshark.io", endpoint: "/v1/leads", method: "GET", status: "connected", connectorKind: "custom", resolverTemplateId: "custom-http-resolver" }],
      },
      { id: "src", objectType: "data-source", rows: [{ Name: "Leads", registryId: "leadshark" }] },
    ],
  },
};

test("api-setup lens is registered + composed", () => {
  assert.ok(WORKSPACE_LENS_REGISTRY.some((e) => e.id === "api-setup"));
  const state = deriveWorkspaceState({ workspaceConfig: registeredConfig, envCatalog: { entries: [{ slug: "leadshark", configured: true }] }, resolvers: ["leadshark"] });
  assert.ok(state.lenses["api-setup"]);
  assert.equal(state.lenses["api-setup"].kind, LENS_STATE_KIND);
});

test("empty workspace — nothing registered, never throws", () => {
  assert.doesNotThrow(() => deriveApiSetupLensState({}));
  const s = deriveApiSetupLensState({ workspaceConfig: {} });
  assert.equal(statusById(s)["api-registered"], "pending");
  assert.equal(s.complete, false);
});

test("fully wired — registered + auth resolves + resolver present + tested + source", () => {
  const s = deriveApiSetupLensState({
    workspaceConfig: registeredConfig,
    envCatalog: { entries: [{ slug: "leadshark", configured: true }] },
    resolvers: ["leadshark"],
  });
  const by = statusById(s);
  assert.equal(by["api-registered"], "complete");
  assert.equal(by["auth-resolves"], "complete");
  assert.equal(by["resolver-present"], "complete");
  assert.equal(by["api-tested"], "complete");
  assert.equal(by["data-source-linked"], "complete");
  assert.equal(s.complete, true);
});

test("resolver required but missing → blocked + lens incomplete", () => {
  const s = deriveApiSetupLensState({
    workspaceConfig: registeredConfig,
    envCatalog: { entries: [{ slug: "leadshark", configured: true }] },
    resolvers: [], // not registered
  });
  assert.equal(statusById(s)["resolver-present"], "blocked");
  assert.equal(s.complete, false);
});

test("auth unresolved → blocked; unknown env (no catalog) → not fake-complete", () => {
  const blocked = deriveApiSetupLensState({ workspaceConfig: registeredConfig, envCatalog: { entries: [{ slug: "leadshark", configured: false }] }, resolvers: ["leadshark"] });
  assert.equal(statusById(blocked)["auth-resolves"], "blocked");
  const unknown = deriveApiSetupLensState({ workspaceConfig: registeredConfig, resolvers: ["leadshark"] });
  assert.notEqual(statusById(unknown)["auth-resolves"], "complete");
});

test("secret-safe — lens never emits a value", () => {
  const cfg = JSON.parse(JSON.stringify(registeredConfig));
  const s = deriveApiSetupLensState({ workspaceConfig: cfg, envCatalog: { entries: [{ slug: "leadshark", configured: true }] }, resolvers: ["leadshark"] });
  const serialized = JSON.stringify(s);
  assert.equal(serialized.includes("sk_"), false);
  // every href routes into a real surface
  for (const step of s.steps) {
    assert.ok(/^\/(data-model|settings|workflows)/.test(step.href), `bad href ${step.href}`);
  }
});

test("serverless sandbox without scheduler → scheduler step blocked", () => {
  const cfg = JSON.parse(JSON.stringify(registeredConfig));
  cfg.dataModel.objects.push({ id: "flows", objectType: "sandbox-environment", rows: [{ Name: "Nightly", runLocality: "serverless", schedulerRegistryId: "" }] });
  const s = deriveApiSetupLensState({ workspaceConfig: cfg, envCatalog: { entries: [{ slug: "leadshark", configured: true }] }, resolvers: ["leadshark"] });
  assert.equal(statusById(s)["scheduler-configured"], "blocked");
});
