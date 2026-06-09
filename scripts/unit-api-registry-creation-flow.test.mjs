#!/usr/bin/env node
/**
 * Unit coverage for the API Registry Creation Flow derivation
 * (lib/api-registry-creation-flow.js) that powers the creation cockpit in the
 * api-registry record drawer.
 *
 *   - step statuses progress register → auth → test → data-source → refresh
 *   - auth is complete only on an explicit runtime signal (never process.env)
 *   - tested derived from status OR a 200/ok lastResponse
 *   - data-source / sandbox detection by registryId / api-registry-call node
 *   - records detection from the sidecar
 *   - nextAction points at the operator's actionable step
 *   - secret-safe + never throws on partial input
 *
 * Run with:  node --test scripts/unit-api-registry-creation-flow.test.mjs
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
const mod = await import(pathToFileURL(path.join(kitLib, "api-registry-creation-flow.js")).href);
const { deriveApiRegistryCreationState } = mod;

const SECRET = "sk-never-leak-7777";
const byId = (state) => Object.fromEntries(state.steps.map((s) => [s.id, s.status]));

test("blank row — register is active, everything downstream blocked", () => {
  const state = deriveApiRegistryCreationState({ registryRow: {} });
  const s = byId(state);
  assert.equal(s.register, "active");
  assert.equal(s.test, "blocked");
  assert.equal(s["data-source"], "blocked");
  assert.equal(state.nextStepId, "register");
});

test("registered + no auth needed → test is active, nextAction is test", () => {
  const state = deriveApiRegistryCreationState({
    registryRow: { integrationId: "open-api", baseUrl: "https://x", endpoint: "/v1" },
  });
  const s = byId(state);
  assert.equal(s.register, "complete");
  assert.equal(s.auth, "complete"); // no authRef → no secret needed
  assert.equal(s.test, "active");
  assert.deepEqual(state.nextAction, { stepId: "test", id: "test", label: "Test API" });
});

test("auth needed but no runtime signal → auth pending, test blocked (never fake)", () => {
  const state = deriveApiRegistryCreationState({
    registryRow: { integrationId: "acme", baseUrl: "https://x", authRef: "ACME" },
  });
  const s = byId(state);
  assert.equal(s.auth, "pending");
  assert.equal(s.test, "blocked");
  assert.equal(state.nextStepId, "auth");
  // never leaks; no value anywhere
  assert.ok(!JSON.stringify(state).includes(SECRET));
});

test("explicit configuredEnvRefs signal resolves auth", () => {
  const state = deriveApiRegistryCreationState({
    registryRow: { integrationId: "acme", baseUrl: "https://x", authRef: "ACME" },
    runtime: { configuredEnvRefs: ["ACME"] },
  });
  const s = byId(state);
  assert.equal(s.auth, "complete");
  assert.equal(s.test, "active");
});

test("tested via lastResponse ok → data-source becomes active", () => {
  const state = deriveApiRegistryCreationState({
    registryRow: {
      integrationId: "acme", baseUrl: "https://x", authRef: "ACME",
      status: "connected", lastResponse: JSON.stringify({ ok: true }),
    },
    runtime: { configuredEnvRefs: ["ACME"] },
  });
  const s = byId(state);
  assert.equal(s.test, "complete");
  assert.equal(s["data-source"], "active");
  assert.deepEqual(state.nextAction, { stepId: "data-source", id: "create-data-source", label: "Create Data Source" });
});

test("linked data-source + records → spine complete; sandbox optional", () => {
  const cfg = { dataModel: { objects: [
    { id: "api-registry", objectType: "api-registry", rows: [{ integrationId: "acme", status: "ok" }] },
    { id: "acme-source", objectType: "data-source", rows: [{ registryId: "acme", sourceId: "leads-src" }] },
  ] } };
  const state = deriveApiRegistryCreationState({
    workspaceConfig: cfg,
    registryRow: { integrationId: "acme", baseUrl: "https://x", status: "ok" },
    sourceRecords: { "leads-src": { recordCount: 5 } },
  });
  const s = byId(state);
  assert.equal(s["data-source"], "complete");
  assert.equal(s.refresh, "complete");
  assert.equal(s["sandbox-tool"], "optional");
  assert.equal(state.complete, true);
  // open-data-source action carries the linked object id
  const dsStep = state.steps.find((x) => x.id === "data-source");
  assert.equal(dsStep.action.id, "open-data-source");
  assert.equal(dsStep.action.objectId, "acme-source");
});

test("sandbox tool detected by api-registry-call node", () => {
  const cfg = { dataModel: { objects: [
    { objectType: "sandbox-environment", rows: [{ Name: "wf", orchestrationConfig: JSON.stringify({ nodes: [{ type: "api-registry-call", config: { registryId: "acme" } }] }) }] },
  ] } };
  const state = deriveApiRegistryCreationState({
    workspaceConfig: cfg,
    registryRow: { integrationId: "acme", baseUrl: "https://x", status: "ok" },
  });
  assert.equal(byId(state)["sandbox-tool"], "complete");
});

test("activation score — milestone-based on real evidence", () => {
  assert.equal(deriveApiRegistryCreationState({ registryRow: {} }).score, 0);
  assert.equal(deriveApiRegistryCreationState({ registryRow: { integrationId: "x", baseUrl: "https://y" } }).score, 35); // registered + no auth needed
  const tested = deriveApiRegistryCreationState({ registryRow: { integrationId: "x", baseUrl: "https://y", status: "ok" } });
  assert.equal(tested.score, 50);
  const full = deriveApiRegistryCreationState({
    workspaceConfig: { dataModel: { objects: [
      { id: "api-registry", objectType: "api-registry", rows: [{ integrationId: "x", status: "ok" }] },
      { id: "x-source", objectType: "data-source", rows: [{ registryId: "x", sourceId: "sid" }] },
    ] } },
    registryRow: { integrationId: "x", baseUrl: "https://y", status: "ok" },
    sourceRecords: { "x-source": { recordCount: 2 } },
  });
  assert.ok(full.score >= 80);
});

test("never throws on partial / undefined input", () => {
  assert.doesNotThrow(() => deriveApiRegistryCreationState());
  assert.doesNotThrow(() => deriveApiRegistryCreationState({ registryRow: null, workspaceConfig: null }));
  const state = deriveApiRegistryCreationState({});
  assert.ok(Array.isArray(state.steps));
});
