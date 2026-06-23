#!/usr/bin/env node
/**
 * Unit tests for the Workspace Health & Agent Context V1 derivation layer:
 *   - lib/workspace-health.js::deriveWorkspaceHealth (single health summary)
 *   - lib/workspace-health.js::deriveAgentContextPacket (agent context packet)
 *
 * The derivations run on top of the existing metadata store + graph builders,
 * so these tests exercise the real projection path (config → store → graph →
 * health/packet), mirroring the metadata-graph V1 coverage.
 *
 * Invariants proven here: pure derivation (inputs deep-frozen — any mutation
 * throws), never throws on partial/absent config, no secrets required, status
 * rolls up from issue severity, stale widgets / missing sources / dangling
 * edges are detected, and the agent packet exposes summary + capabilities +
 * critical state + entrypoints into real surfaces.
 *
 * Standalone — runs against the bundled growthub-custom-workspace-starter-v1
 * sources via node:test (no npm install).
 *
 * Run: node --test scripts/unit-workspace-health.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appLib = path.join(
  root,
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib",
);

const { buildWorkspaceMetadataStore } = await import(path.join(appLib, "workspace-metadata-store.js"));
const { buildWorkspaceMetadataGraph } = await import(path.join(appLib, "workspace-metadata-graph.js"));
const {
  HEALTH_KIND,
  AGENT_CONTEXT_KIND,
  deriveWorkspaceHealth,
  deriveAgentContextPacket,
  deriveCapabilities,
} = await import(path.join(appLib, "workspace-health.js"));

function deepFreeze(obj) {
  if (obj && typeof obj === "object") {
    Object.freeze(obj);
    for (const v of Object.values(obj)) deepFreeze(v);
  }
  return obj;
}

/**
 * Config that intentionally produces one of every health signal:
 *   - w-ok      : healthy chart bound to a live-backed object with axes
 *   - w-stale   : bound chart with no axis fields → stale_widget (warning)
 *   - w-dangle  : chart bound to an object that does not exist → dangling_edge
 *   - leads     : live-backed object whose source has records (healthy)
 *   - orders    : live-backed object whose source is absent → missing_source
 */
function configWithIssues() {
  return {
    name: "Test Workspace",
    dashboards: [
      {
        id: "dash-1",
        name: "Ops",
        tabs: [
          {
            id: "t1",
            name: "Tab",
            widgets: [
              {
                id: "w-ok",
                kind: "chart",
                title: "OK",
                config: {
                  binding: { sourceType: "workspace-data-model", objectId: "leads" },
                  xAxis: { field: "stage" },
                  yAxis: { field: "amount", operation: "sum" },
                },
              },
              {
                id: "w-stale",
                kind: "chart",
                title: "Stale",
                config: {
                  binding: { sourceType: "workspace-data-model", objectId: "leads" },
                },
              },
              {
                id: "w-dangle",
                kind: "chart",
                title: "Dangle",
                config: {
                  binding: { sourceType: "workspace-data-model", objectId: "ghost" },
                  xAxis: { field: "a" },
                  yAxis: { field: "b", operation: "sum" },
                },
              },
            ],
          },
        ],
      },
    ],
    dataModel: {
      objects: [
        {
          id: "leads",
          label: "Leads",
          objectType: "custom",
          columns: ["stage", "amount"],
          binding: { sourceStorage: "workspace-source-records", sourceId: "leads-src" },
        },
        {
          id: "orders",
          label: "Orders",
          objectType: "custom",
          columns: ["total"],
          binding: { sourceStorage: "workspace-source-records", sourceId: "orders-src" },
        },
      ],
    },
  };
}

function sourceRecordsWithLeads() {
  return {
    "leads-src": {
      records: [{ stage: "new", amount: 10 }],
      recordCount: 1,
      fetchedAt: "2026-01-01T00:00:00.000Z",
    },
    // orders-src intentionally absent → missing_source
  };
}

function healthyConfig() {
  return {
    name: "Healthy Workspace",
    dashboards: [
      {
        id: "dash-1",
        name: "Ops",
        tabs: [
          {
            id: "t1",
            name: "Tab",
            widgets: [
              {
                id: "w-ok",
                kind: "chart",
                title: "OK",
                config: {
                  binding: { sourceType: "workspace-data-model", objectId: "leads" },
                  xAxis: { field: "stage" },
                  yAxis: { field: "amount", operation: "sum" },
                },
              },
            ],
          },
        ],
      },
    ],
    dataModel: {
      objects: [
        {
          id: "leads",
          label: "Leads",
          objectType: "custom",
          columns: ["stage", "amount"],
          binding: { sourceStorage: "workspace-source-records", sourceId: "leads-src" },
        },
      ],
    },
  };
}

function buildAll(config, sourceRecords) {
  const frozenConfig = deepFreeze(structuredClone(config));
  const frozenSources = deepFreeze(structuredClone(sourceRecords || {}));
  const store = buildWorkspaceMetadataStore({
    workspaceConfig: frozenConfig,
    workspaceSourceRecords: frozenSources,
  });
  const graph = buildWorkspaceMetadataGraph(store);
  return { config: frozenConfig, store, graph };
}

// ── deriveWorkspaceHealth ──────────────────────────────────────────────────

test("deriveWorkspaceHealth returns the typed V1 envelope", () => {
  const { store, graph } = buildAll(healthyConfig(), sourceRecordsWithLeads());
  const health = deriveWorkspaceHealth(store, graph);
  assert.equal(health.kind, HEALTH_KIND);
  assert.equal(health.version, 1);
  assert.ok(Array.isArray(health.issues));
  assert.ok(health.metrics && typeof health.metrics === "object");
});

test("a clean workspace is healthy with zero issues", () => {
  const { store, graph } = buildAll(healthyConfig(), sourceRecordsWithLeads());
  const health = deriveWorkspaceHealth(store, graph);
  assert.equal(health.status, "healthy");
  assert.equal(health.issues.length, 0);
  assert.equal(health.metrics.totalWidgets, 1);
  assert.equal(health.metrics.danglingEdges, 0);
  assert.equal(health.metrics.missingSources, 0);
});

test("detects stale widget, dangling edge, and missing source; rolls up to unhealthy", () => {
  const { store, graph } = buildAll(configWithIssues(), sourceRecordsWithLeads());
  const health = deriveWorkspaceHealth(store, graph);

  assert.equal(health.status, "unhealthy");

  const types = health.issues.map((issue) => issue.type);
  assert.ok(types.includes("stale_widget"), "expected a stale_widget issue");
  assert.ok(types.includes("dangling_edge"), "expected a dangling_edge issue");
  assert.ok(types.includes("missing_source"), "expected a missing_source issue");

  // The dangling edge points at the widget bound to a non-existent object.
  const dangling = health.issues.find((issue) => issue.type === "dangling_edge");
  assert.equal(dangling.widgetId, "w-dangle");
  assert.equal(dangling.severity, "error");

  // The stale widget is the bound-but-no-axis one, NOT the unknown-object one
  // (that is already counted as a dangling edge, never double-counted).
  const stale = health.issues.filter((issue) => issue.type === "stale_widget");
  assert.equal(stale.length, 1);
  assert.equal(stale[0].widgetId, "w-stale");

  assert.equal(health.metrics.danglingEdges, 1);
  assert.equal(health.metrics.missingSources, 1);
  assert.equal(health.metrics.staleWidgets, 1);
  assert.equal(health.metrics.totalWidgets, 3);
});

test("errors are ordered before warnings in the issue list", () => {
  const { store, graph } = buildAll(configWithIssues(), sourceRecordsWithLeads());
  const health = deriveWorkspaceHealth(store, graph);
  const firstWarningIndex = health.issues.findIndex((issue) => issue.severity !== "error");
  const lastErrorIndex = health.issues.map((issue) => issue.severity).lastIndexOf("error");
  if (firstWarningIndex !== -1) {
    assert.ok(lastErrorIndex < firstWarningIndex, "all errors must precede warnings");
  }
});

test("never throws on empty / partial / garbage input", () => {
  for (const input of [undefined, null, {}, { objects: 5 }, [], "nope"]) {
    const health = deriveWorkspaceHealth(input, null);
    assert.equal(health.kind, HEALTH_KIND);
    assert.equal(health.status, "healthy");
    assert.ok(Array.isArray(health.issues));
  }
});

// ── deriveAgentContextPacket ───────────────────────────────────────────────

test("deriveAgentContextPacket returns the typed V1 envelope with summary + capabilities", () => {
  const { config, store, graph } = buildAll(configWithIssues(), sourceRecordsWithLeads());
  const health = deriveWorkspaceHealth(store, graph);
  const packet = deriveAgentContextPacket(store, graph, health, config);

  assert.equal(packet.kind, AGENT_CONTEXT_KIND);
  assert.equal(packet.version, 1);
  assert.equal(packet.summary.name, "Test Workspace");
  assert.equal(packet.summary.objects, 2);
  assert.equal(packet.summary.widgets, 3);
  assert.ok(packet.capabilities.includes("dashboards"));
  assert.ok(packet.capabilities.includes("data-model"));
  assert.ok(packet.capabilities.includes("live-sources"));
});

test("packet critical state mirrors the health rollup, sliced by type", () => {
  const { config, store, graph } = buildAll(configWithIssues(), sourceRecordsWithLeads());
  const health = deriveWorkspaceHealth(store, graph);
  const packet = deriveAgentContextPacket(store, graph, health, config);

  assert.equal(packet.criticalState.staleWidgets.length, 1);
  assert.equal(packet.criticalState.danglingEdges.length, 1);
  assert.equal(packet.criticalState.missingSources.length, 1);
  assert.equal(packet.health.status, "unhealthy");
  assert.equal(packet.health.issueCount, health.issues.length);
});

test("packet entrypoints route into real workspace surfaces", () => {
  const { config, store, graph } = buildAll(configWithIssues(), sourceRecordsWithLeads());
  const packet = deriveAgentContextPacket(store, graph, deriveWorkspaceHealth(store, graph), config);

  assert.equal(packet.entrypoints.dataModel, "/data-model");
  assert.equal(packet.entrypoints.api, "/api/workspace");
  assert.equal(packet.entrypoints.health, "/api/workspace/health");
  assert.ok(Array.isArray(packet.entrypoints.dashboards));
  assert.ok(packet.entrypoints.dashboards.some((entry) => entry.id === "dash-1"));
});

test("packet derives health internally when none is passed", () => {
  const { config, store, graph } = buildAll(healthyConfig(), sourceRecordsWithLeads());
  const packet = deriveAgentContextPacket(store, graph, undefined, config);
  assert.equal(packet.health.status, "healthy");
});

test("packet never throws on empty / partial input and defaults the name", () => {
  for (const input of [undefined, null, {}, "nope"]) {
    const packet = deriveAgentContextPacket(input, null, null, input);
    assert.equal(packet.kind, AGENT_CONTEXT_KIND);
    assert.equal(packet.summary.name, "workspace");
    assert.ok(Array.isArray(packet.capabilities));
  }
});

// ── deriveCapabilities ─────────────────────────────────────────────────────

test("deriveCapabilities reflects only the surfaces that exist", () => {
  assert.deepEqual(deriveCapabilities({}), []);
  const caps = deriveCapabilities({
    dashboards: [{ id: "d" }],
    widgets: [{ id: "w" }],
    objects: [{ id: "o", isLiveBacked: true }],
    sandboxes: [{ id: "s", hasGraph: true }],
    integrations: [{ id: "i" }],
  });
  for (const cap of ["dashboards", "widgets", "data-model", "live-sources", "workflows", "sandboxes", "integrations"]) {
    assert.ok(caps.includes(cap), `expected capability ${cap}`);
  }
});

// ── secret safety ──────────────────────────────────────────────────────────

test("health + packet JSON never echoes secret-shaped values", () => {
  const config = healthyConfig();
  config.dataModel.objects.push({
    id: "secrets",
    label: "Secrets",
    objectType: "custom",
    columns: ["apiKey", "accessToken"],
    rows: [{ apiKey: "sk-live-DO-NOT-LEAK", accessToken: "bearer-DO-NOT-LEAK" }],
  });
  const { store, graph } = buildAll(config, sourceRecordsWithLeads());
  const health = deriveWorkspaceHealth(store, graph);
  const packet = deriveAgentContextPacket(store, graph, health, config);
  const blob = JSON.stringify({ health, packet });
  assert.ok(!blob.includes("sk-live-DO-NOT-LEAK"));
  assert.ok(!blob.includes("bearer-DO-NOT-LEAK"));
});
