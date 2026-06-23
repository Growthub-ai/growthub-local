#!/usr/bin/env node
/**
 * Unit coverage for projectWorkspaceMap — the read-only Workspace Map
 * projection that powers the Data Model Canvas surface.
 *
 * Standalone — runs against the bundled growthub-custom-workspace-starter-v1
 * sources via node:test (no npm install).
 *
 *   - renders only the curated node types (object/source/integration/
 *     workflow/dashboard) and collapses everything else away
 *   - rolls multi-hop relationships up to direct edges:
 *       source→object, integration→object, workflow→object, dashboard→object
 *   - object cards carry non-secret field labels only, bounded by fieldLimit
 *   - never emits a dangling edge (every endpoint is a rendered node)
 *   - never throws on empty / garbage / partial input
 *   - real pipeline (config + source-records → store → graph → map) produces
 *     object nodes and leaks no secret-shaped values
 *
 * Run with:  node --test scripts/unit-workspace-map-projection.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kit = path.join(here, "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const kitLib = path.join(kit, "lib");

const { projectWorkspaceMap } = await import(
  pathToFileURL(path.join(kitLib, "workspace-metadata-selectors.js")).href
);
const { buildWorkspaceMetadataStore } = await import(
  pathToFileURL(path.join(kitLib, "workspace-metadata-store.js")).href
);
const { buildWorkspaceMetadataGraph } = await import(
  pathToFileURL(path.join(kitLib, "workspace-metadata-graph.js")).href
);

// A synthetic graph envelope shaped exactly like buildWorkspaceMetadataGraph
// output, with the multi-hop chains the projection must roll up.
function sampleGraph() {
  return {
    nodes: [
      { id: "obj:deals", type: "dataModelObject", label: "Deals", summary: { objectId: "deals", objectType: "custom", isLiveBacked: false, readOnly: false, rowCount: 12 } },
      { id: "obj:people", type: "dataModelObject", label: "People", summary: { objectId: "people", objectType: "people", isLiveBacked: true, readOnly: true, rowCount: 240 } },
      { id: "field:deals:name", type: "field", label: "name", summary: { objectId: "deals", type: "text", isSecret: false } },
      { id: "field:deals:value", type: "field", label: "value", summary: { objectId: "deals", type: "number", isSecret: false } },
      { id: "field:deals:apiKey", type: "field", label: "apiKey", summary: { objectId: "deals", type: "text", isSecret: true } },
      { id: "src:hubspot", type: "sourceRecord", label: "hubspot:people", summary: { recordCount: 240, fetchedAt: "2026-06-01T00:00:00Z", integrationId: "hubspot" } },
      { id: "int:hubspot", type: "integration", label: "HubSpot", summary: { lane: "crm", status: "connected" } },
      { id: "wf:enrich", type: "workflow", label: "Enrich deals", summary: { objectId: "sandbox", rowId: "enrich", lifecycleStatus: "published", nodeCount: 4, requiresInput: true } },
      { id: "wfn:read", type: "workflowNode", label: "Read deals", summary: { nodeType: "data-trigger" } },
      { id: "wfn:write", type: "workflowNode", label: "Write deals", summary: { nodeType: "data-action" } },
      { id: "dash:pipeline", type: "dashboard", label: "Pipeline", summary: { widgetCount: 3 } },
      { id: "wgt:bar", type: "widget", label: "Deals by stage", summary: { objectId: "deals" } },
      { id: "run:1", type: "run", label: "run-1", summary: {} }
    ],
    edges: [
      { from: "obj:people", relation: "backedBySourceRecord", to: "src:hubspot" },
      { from: "obj:people", relation: "boundToIntegration", to: "int:hubspot" },
      { from: "wf:enrich", relation: "containsNode", to: "wfn:read" },
      { from: "wf:enrich", relation: "containsNode", to: "wfn:write" },
      { from: "wfn:read", relation: "readsObject", to: "obj:deals" },
      { from: "wfn:write", relation: "writesObject", to: "obj:deals" },
      { from: "dash:pipeline", relation: "containsWidget", to: "wgt:bar" },
      { from: "wgt:bar", relation: "bindsToObject", to: "obj:deals" }
    ]
  };
}

test("renders only curated node types", () => {
  const map = projectWorkspaceMap(sampleGraph());
  const types = new Set(map.nodes.map((n) => n.type));
  assert.deepEqual([...types].sort(), ["dashboard", "dataModelObject", "integration", "sourceRecord", "workflow"]);
  // field / workflowNode / widget / run are collapsed away
  assert.ok(!map.nodes.some((n) => ["field", "workflowNode", "widget", "run"].includes(n.type)));
});

test("places nodes into the three layout columns", () => {
  const map = projectWorkspaceMap(sampleGraph());
  const columns = Object.fromEntries(map.columns.map((c) => [c.key, c.nodeIds]));
  assert.ok(columns.sources.includes("src:hubspot") && columns.sources.includes("int:hubspot"));
  assert.ok(columns.objects.includes("obj:deals") && columns.objects.includes("obj:people"));
  assert.ok(columns.consumers.includes("wf:enrich") && columns.consumers.includes("dash:pipeline"));
});

test("rolls source and integration feeds up to the object", () => {
  const { edges } = projectWorkspaceMap(sampleGraph());
  assert.ok(edges.some((e) => e.from === "src:hubspot" && e.to === "obj:people" && e.relation === "feeds"));
  assert.ok(edges.some((e) => e.from === "int:hubspot" && e.to === "obj:people" && e.relation === "feeds"));
});

test("rolls workflowNode read/write up to a direct workflow→object edge", () => {
  const { edges } = projectWorkspaceMap(sampleGraph());
  assert.ok(edges.some((e) => e.from === "wf:enrich" && e.to === "obj:deals" && e.relation === "reads"));
  assert.ok(edges.some((e) => e.from === "wf:enrich" && e.to === "obj:deals" && e.relation === "writes"));
});

test("rolls widget binding up to a direct dashboard→object edge", () => {
  const { edges } = projectWorkspaceMap(sampleGraph());
  assert.ok(edges.some((e) => e.from === "dash:pipeline" && e.to === "obj:deals" && e.relation === "reads"));
});

test("object cards carry only non-secret fields and respect fieldLimit", () => {
  const map = projectWorkspaceMap(sampleGraph(), { fieldLimit: 1 });
  const deals = map.nodes.find((n) => n.id === "obj:deals");
  assert.equal(deals.card.fields.length, 1); // limited
  const allFields = projectWorkspaceMap(sampleGraph()).nodes.find((n) => n.id === "obj:deals");
  const labels = allFields.card.fields.map((f) => f.label);
  assert.ok(labels.includes("name") && labels.includes("value"));
  assert.ok(!labels.includes("apiKey")); // secret dropped
});

test("never emits a dangling edge", () => {
  const map = projectWorkspaceMap(sampleGraph());
  const ids = new Set(map.nodes.map((n) => n.id));
  for (const edge of map.edges) {
    assert.ok(ids.has(edge.from), `edge.from ${edge.from} must be a rendered node`);
    assert.ok(ids.has(edge.to), `edge.to ${edge.to} must be a rendered node`);
  }
});

test("never throws on empty / garbage / partial input", () => {
  assert.doesNotThrow(() => projectWorkspaceMap(null));
  assert.doesNotThrow(() => projectWorkspaceMap(undefined));
  assert.doesNotThrow(() => projectWorkspaceMap({}));
  assert.doesNotThrow(() => projectWorkspaceMap({ nodes: "nope", edges: 42 }));
  assert.doesNotThrow(() => projectWorkspaceMap({ nodes: [{ id: "x" }], edges: [{ from: "x" }] }));
  assert.deepEqual(projectWorkspaceMap(null).nodes, []);
});

test("bundled seed config runs through the real pipeline without throwing", () => {
  // The shipped seed carries dashboards/pipelines but no dataModel objects;
  // the projection must still produce a valid, secret-free envelope.
  const config = JSON.parse(fs.readFileSync(path.join(kit, "growthub.config.json"), "utf8"));
  let sourceRecords = {};
  const srPath = path.join(kit, "growthub.source-records.json");
  if (fs.existsSync(srPath)) sourceRecords = JSON.parse(fs.readFileSync(srPath, "utf8"));
  const store = buildWorkspaceMetadataStore({ workspaceConfig: config, workspaceSourceRecords: sourceRecords });
  let map;
  assert.doesNotThrow(() => { map = projectWorkspaceMap(buildWorkspaceMetadataGraph(store)); });
  assert.equal(map.kind, "growthub-workspace-map-v1");
  assert.ok(Array.isArray(map.nodes) && Array.isArray(map.edges));
});

test("real pipeline: store→graph→map produces object nodes, a source feed edge, and leaks no secrets", () => {
  const config = {
    id: "test-ws",
    dataModel: {
      objects: [
        {
          id: "deals", label: "Deals", objectType: "custom",
          columns: ["name", "value", "apiKey"],
          rows: [{ name: "Acme", value: 10, apiKey: "sk-shouldnotleak0000000000" }]
        },
        {
          id: "people", label: "People", objectType: "people",
          binding: { sourceStorage: "workspace-source-records", sourceId: "hubspot:people", integrationId: "hubspot" },
          sourceId: "hubspot:people",
          columns: ["email"], rows: []
        }
      ]
    }
  };
  const sourceRecords = {
    "hubspot:people": { integrationId: "hubspot", fetchedAt: "2026-06-01T00:00:00Z", records: [{ email: "a@b.com" }] }
  };

  const store = buildWorkspaceMetadataStore({ workspaceConfig: config, workspaceSourceRecords: sourceRecords });
  const graph = buildWorkspaceMetadataGraph(store);
  const map = projectWorkspaceMap(graph);

  const objects = map.nodes.filter((n) => n.type === "dataModelObject");
  assert.ok(objects.some((n) => n.card.objectId === "deals"), "expected the Deals object node");
  assert.ok(objects.some((n) => n.card.objectId === "people"), "expected the People object node");
  // live-backed people object should be fed by its source record
  assert.ok(map.edges.some((e) => e.to && e.relation === "feeds"), "expected a source→object feed edge");
  // the hidden helper sandbox object must never surface on the map
  assert.ok(!map.nodes.some((n) => n.card?.objectId === "workspace-helper-sandbox"));

  const json = JSON.stringify(map);
  assert.ok(!json.includes("sk-shouldnotleak"), "secret-shaped row value must not leak into the map");
  assert.ok(!/-----BEGIN [A-Z ]+PRIVATE KEY-----/.test(json), "no private keys");
});
