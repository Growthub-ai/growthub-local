#!/usr/bin/env node
/**
 * Product golden path: API Registry official record → governed WORKFLOW CANVAS.
 *
 * Proves the API Registry journey is the entry point into the SAME governed
 * workflow system (Input → API Registry → Transform → Result), not a separate
 * resolver studio. It fails if the journey regresses into a resolver-only flow
 * or stops reusing the canonical orchestration node types.
 *
 * Run with:  node --test scripts/unit-api-registry-workflow-canvas.test.mjs
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

const og = await import(pathToFileURL(path.join(kitLib, "orchestration-graph.js")).href);
const rp = await import(pathToFileURL(path.join(kitLib, "api-response-profile.js")).href);
const flow = await import(pathToFileURL(path.join(kitLib, "api-registry-creation-flow.js")).href);

const ROW = {
  Name: "Contacts",
  integrationId: "acme-contacts",
  baseUrl: "https://api.acme.test",
  endpoint: "/v2/contacts",
  method: "GET",
  authRef: "ACME",
  authHeaderName: "x-api-key",
  status: "connected",
  lastResponse: JSON.stringify({ data: { items: [{ id: "c1", name: "A", email: "a@x.test" }, { id: "c2", name: "B", email: "b@x.test" }] } }),
};

function nodeTypes(graph) {
  return graph.nodes.map((n) => n.type);
}

test("API Registry → workflow canvas: detected shape seeds the canonical graph", () => {
  const profile = rp.profileApiResponse(ROW.lastResponse);
  assert.equal(profile.arrayPath, "data.items"); // detected, not typed

  const graph = og.buildDefaultOrchestrationGraphFromRegistry(ROW, {
    rootPath: profile.arrayPath,
    previewFields: profile.fields.map((f) => f.name),
    authRef: ROW.authRef,
  });

  // canonical node types only — no invented types
  assert.deepEqual(nodeTypes(graph), ["input", "api-registry-call", "transform-filter", "tool-result"]);

  const api = graph.nodes.find((n) => n.type === "api-registry-call");
  assert.equal(api.config.registryId, "acme-contacts");      // points back at the governed row
  assert.equal(api.config.integrationId, "acme-contacts");
  assert.equal(api.config.method, "GET");
  assert.equal(api.config.endpoint, "/v2/contacts");
  assert.equal(api.config.authRef, "ACME");                  // ref name only
  assert.equal(api.config.requestHeadersMetadata.authHeaderName, "x-api-key");

  const transform = graph.nodes.find((n) => n.type === "transform-filter");
  assert.equal(transform.config.rootPath, "data.items");      // SAME detected path
  assert.deepEqual(transform.config.includeFields, ["id", "name", "email"]); // field names only

  const result = graph.nodes.find((n) => n.type === "tool-result");
  assert.equal(result.config.writeLastResponse, true);
  assert.equal(result.config.writeSourceRecord, true);
  assert.deepEqual(result.config.previewFields, ["id", "name", "email"]);

  // existing validator accepts it
  const v = og.validateOrchestrationGraph(graph);
  assert.equal(v.ok, true, JSON.stringify(v.errors));

  // no secret/PII values serialized (field NAMES + authRef NAME only)
  const s = JSON.stringify(graph);
  assert.ok(!s.includes("a@x.test") && !s.includes("b@x.test"), "no PII values");
  assert.ok(!/Bearer\s+\S/.test(s) && !s.includes("ACME_API_KEY"), "no secret material");
});

test("API Registry → workflow canvas: sandbox row is a DRAFT, untested, graph-backed", () => {
  const profile = rp.profileApiResponse(ROW.lastResponse);
  const row = og.buildSandboxRowFromApiRegistry({}, ROW, {
    rootPath: profile.arrayPath,
    previewFields: profile.fields.map((f) => f.name),
    authRef: ROW.authRef,
  });
  assert.equal(row.objectType, "sandbox-environment");
  assert.equal(row.lifecycleStatus, "draft");   // never auto-live
  assert.equal(row.status, "untested");          // publish stays governed
  const graph = og.parseOrchestrationGraph(row.orchestrationConfig);
  const transform = graph.nodes.find((n) => n.type === "transform-filter");
  assert.equal(transform.config.rootPath, "data.items"); // detected path survived serialization
  const api = graph.nodes.find((n) => n.type === "api-registry-call");
  assert.equal(api.config.registryId, "acme-contacts");
  // no secret material in the serialized row
  assert.ok(!/Bearer\s+\S/.test(row.orchestrationConfig) && !row.orchestrationConfig.includes("ACME_API_KEY"));
});

test("API Registry → workflow canvas: duplicate workflow creation is blocked", () => {
  const row = og.buildSandboxRowFromApiRegistry({}, ROW, { rootPath: "data.items" });
  const workspaceConfig = {
    dataModel: { objects: [{ id: "workspace-sandbox", objectType: "sandbox-environment", label: "Sandbox", columns: [], rows: [row] }] },
  };
  // an existing workflow that calls this registry id is detected → no duplicate
  const existing = og.findSandboxRowsForRegistry(workspaceConfig, "acme-contacts");
  assert.equal(existing.length, 1);
});

test("API Registry creation journey: workflow step opens the existing canvas (no dead end)", () => {
  const row = og.buildSandboxRowFromApiRegistry({}, ROW, { rootPath: "data.items" });
  const workspaceConfig = {
    dataModel: {
      objects: [
        { id: "workspace-api-registry", objectType: "api-registry", label: "API Registry", columns: [], rows: [ROW] },
        { id: "workspace-sandbox", objectType: "sandbox-environment", label: "Sandbox", columns: [], rows: [row] },
      ],
    },
  };
  const state = flow.deriveApiRegistryCreationState({
    workspaceConfig,
    registryRow: ROW,
    runtime: { configuredEnvRefs: ["ACME"] },
  });
  const wf = state.steps.find((s) => s.id === "sandbox-tool");
  assert.equal(wf.label, "Use this API in a workflow");
  assert.equal(wf.status, "complete");
  assert.equal(wf.action.id, "open-workflow");           // continues the journey
  assert.equal(wf.action.objectId, "workspace-sandbox");
  assert.equal(wf.action.rowName, row.Name);
});

test("API Registry creation journey: workflow step creates a canvas when none exists", () => {
  const workspaceConfig = {
    dataModel: { objects: [{ id: "workspace-api-registry", objectType: "api-registry", label: "API Registry", columns: [], rows: [ROW] }] },
  };
  const state = flow.deriveApiRegistryCreationState({
    workspaceConfig,
    registryRow: ROW,
    runtime: { configuredEnvRefs: ["ACME"] },
  });
  const wf = state.steps.find((s) => s.id === "sandbox-tool");
  assert.equal(wf.action.id, "create-sandbox-tool");
  assert.equal(wf.action.label, "Create workflow canvas");
});
