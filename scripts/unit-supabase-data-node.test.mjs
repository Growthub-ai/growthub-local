#!/usr/bin/env node
/**
 * Unit coverage for the `supabase-data` canvas node runtime:
 *   - node type registered in the graph contract (KNOWN_NODE_TYPES + extractor)
 *   - operation → method/Prefer mapping (select/insert/update/upsert/delete/rpc)
 *   - apikey + Bearer header shape; secret values never in results or errors
 *   - update/delete refuse to run without a row filter (whole-table guardrail)
 *   - {{input.*}} substitution in table/query/body
 *   - registry-row + env resolution failure modes (honest errors, no fake ok)
 *   - full-pipeline dispatch: a graph with a supabase-data node executes it
 *     as the HTTP stage; api-registry-call keeps precedence when both exist
 *
 * Offline — global fetch is stubbed per test. Run with:
 *   node --test scripts/unit-supabase-data-node.test.mjs
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

const graphLib = await import(pathToFileURL(path.join(kitLib, "orchestration-graph.js")).href);
const runner = await import(pathToFileURL(path.join(kitLib, "orchestration-graph-runner.js")).href);

const { validateOrchestrationGraph, extractSupabaseDataNode } = graphLib;
const { executeSupabaseData, runOrchestrationGraphIfPresent } = runner;

const SERVICE_KEY = "test-service-role-key-value";
const BASE_URL = "https://abcd1234.supabase.co";

function workspaceWithSupabaseRow(overrides = {}) {
  return {
    dataModel: {
      objects: [
        {
          id: "api-registry",
          objectType: "api-registry",
          rows: [
            {
              Name: "Supabase Postgres (PostgREST)",
              integrationId: "supabase-postgrest",
              authRef: "SUPABASE",
              baseUrl: BASE_URL,
              executionLane: "workspace-data",
              connectorKind: "supabase-data",
              syncStatus: "verified",
              ...overrides,
            },
          ],
        },
      ],
    },
  };
}

/** Stub global fetch; returns { calls } to inspect the outbound request. */
function stubFetch(handler) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const result = handler ? handler(String(url), init) : null;
    const status = result?.status ?? 200;
    const payload = result?.payload ?? [{ id: 1 }];
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name) => (name.toLowerCase() === "content-type" ? "application/json" : "") },
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    };
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

function envPatch(values) {
  const saved = {};
  for (const [key, value] of Object.entries(values)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

test("supabase-data is a known graph node type with an extractor", () => {
  const graph = {
    provider: "growthub-native",
    version: 1,
    nodes: [
      { id: "input", type: "input", config: {} },
      { id: "db", type: "supabase-data", config: { operation: "select", table: "apps" } },
      { id: "result", type: "tool-result", config: {} },
    ],
    edges: [],
  };
  const validation = validateOrchestrationGraph(graph);
  assert.equal(validation.ok, true, JSON.stringify(validation));
  assert.equal(extractSupabaseDataNode(graph)?.id, "db");
});

test("select maps to GET with apikey + Bearer and query passthrough", async () => {
  const restore = envPatch({ SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY });
  const { calls, restore: restoreFetch } = stubFetch();
  try {
    const result = await executeSupabaseData(
      workspaceWithSupabaseRow(),
      { operation: "select", table: "apps", query: "select=id,name&status=eq.live&limit=50" },
      {},
      30000,
    );
    assert.equal(result.ok, true);
    assert.equal(result.httpStatus, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${BASE_URL}/rest/v1/apps?select=id,name&status=eq.live&limit=50`);
    assert.equal(calls[0].init.method, "GET");
    assert.equal(calls[0].init.headers.apikey, SERVICE_KEY);
    assert.equal(calls[0].init.headers.authorization, `Bearer ${SERVICE_KEY}`);
    assert.equal(calls[0].init.headers.prefer, undefined);
    assert.equal(result.adapterMeta.nodeType, "supabase-data");
    assert.equal(result.adapterMeta.operation, "select");
  } finally {
    restoreFetch();
    restore();
  }
});

test("insert/upsert/update/delete map to method + Prefer semantics", async () => {
  const restore = envPatch({ SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY });
  const { calls, restore: restoreFetch } = stubFetch();
  try {
    const config = workspaceWithSupabaseRow();
    await executeSupabaseData(config, { operation: "insert", table: "apps", bodyTemplate: "{\"name\":\"a\"}" }, {}, 30000);
    await executeSupabaseData(config, { operation: "upsert", table: "apps", bodyTemplate: "{\"id\":1}" }, {}, 30000);
    await executeSupabaseData(config, { operation: "update", table: "apps", query: "id=eq.1", bodyTemplate: "{\"name\":\"b\"}" }, {}, 30000);
    await executeSupabaseData(config, { operation: "delete", table: "apps", query: "id=eq.1" }, {}, 30000);
    assert.deepEqual(calls.map((c) => c.init.method), ["POST", "POST", "PATCH", "DELETE"]);
    assert.equal(calls[0].init.headers.prefer, "return=representation");
    assert.equal(calls[1].init.headers.prefer, "resolution=merge-duplicates,return=representation");
    assert.equal(calls[2].init.headers.prefer, "return=representation");
    assert.equal(calls[3].init.headers.prefer, "return=representation");
    assert.equal(calls[0].init.headers["content-type"], "application/json");
    assert.equal(calls[3].init.body, undefined, "delete sends no body");
  } finally {
    restoreFetch();
    restore();
  }
});

test("rpc posts to /rest/v1/rpc/<fn>", async () => {
  const restore = envPatch({ SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY });
  const { calls, restore: restoreFetch } = stubFetch();
  try {
    const result = await executeSupabaseData(
      workspaceWithSupabaseRow(),
      { operation: "rpc", rpcFunction: "sync_status", bodyTemplate: "{\"app\":\"one\"}" },
      {},
      30000,
    );
    assert.equal(result.ok, true);
    assert.equal(calls[0].url, `${BASE_URL}/rest/v1/rpc/sync_status`);
    assert.equal(calls[0].init.method, "POST");
  } finally {
    restoreFetch();
    restore();
  }
});

test("update/delete without a filter are refused before any request", async () => {
  const restore = envPatch({ SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY });
  const { calls, restore: restoreFetch } = stubFetch();
  try {
    for (const operation of ["update", "delete"]) {
      const result = await executeSupabaseData(
        workspaceWithSupabaseRow(),
        { operation, table: "apps", bodyTemplate: "{\"x\":1}" },
        {},
        30000,
      );
      assert.equal(result.ok, false);
      assert.match(result.error, /requires a row filter/);
    }
    assert.equal(calls.length, 0, "guardrail fires before fetch");
  } finally {
    restoreFetch();
    restore();
  }
});

test("{{input.*}} substitutes into table, query, and body", async () => {
  const restore = envPatch({ SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY });
  const { calls, restore: restoreFetch } = stubFetch();
  try {
    await executeSupabaseData(
      workspaceWithSupabaseRow(),
      {
        operation: "update",
        table: "{{input.table}}",
        query: "id=eq.{{input.id}}",
        bodyTemplate: "{\"status\":\"{{input.status}}\"}",
      },
      { table: "workspaces", id: "42", status: "live" },
      30000,
    );
    assert.equal(calls[0].url, `${BASE_URL}/rest/v1/workspaces?id=eq.42`);
    assert.equal(JSON.parse(calls[0].init.body).status, "live");
  } finally {
    restoreFetch();
    restore();
  }
});

test("missing registry row / env fail honestly, never fake ok", async () => {
  const restoreEnv = envPatch({ SUPABASE_SERVICE_ROLE_KEY: undefined, SUPABASE_URL: undefined, SUPABASE: undefined, SUPABASE_API_KEY: undefined, SUPABASE_TOKEN: undefined });
  const { calls, restore: restoreFetch } = stubFetch();
  try {
    const noRow = await executeSupabaseData({ dataModel: { objects: [] } }, { operation: "select", table: "apps" }, {}, 30000);
    assert.equal(noRow.ok, false);
    assert.match(noRow.error, /no API Registry row/);

    const noEnv = await executeSupabaseData(
      workspaceWithSupabaseRow({ baseUrl: "" }),
      { operation: "select", table: "apps" },
      {},
      30000,
    );
    assert.equal(noEnv.ok, false);
    assert.match(noEnv.error, /SUPABASE_URL missing/);

    const noKey = await executeSupabaseData(
      workspaceWithSupabaseRow(),
      { operation: "select", table: "apps" },
      {},
      30000,
    );
    assert.equal(noKey.ok, false);
    assert.match(noKey.error, /SUPABASE_SERVICE_ROLE_KEY missing/);
    assert.equal(calls.length, 0);
  } finally {
    restoreFetch();
    restoreEnv();
  }
});

test("non-2xx surfaces as HTTP error; secret never leaks into the envelope", async () => {
  const restore = envPatch({ SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY });
  const { restore: restoreFetch } = stubFetch(() => ({ status: 401, payload: { message: "JWT invalid" } }));
  try {
    const result = await executeSupabaseData(
      workspaceWithSupabaseRow(),
      { operation: "select", table: "apps" },
      {},
      30000,
    );
    assert.equal(result.ok, false);
    assert.equal(result.error, "HTTP 401");
    const text = JSON.stringify(result);
    assert.ok(!text.includes(SERVICE_KEY), "service key must never appear in the result envelope");
  } finally {
    restoreFetch();
    restore();
  }
});

test("pipeline dispatch executes supabase-data as the HTTP stage with node trace", async () => {
  const restore = envPatch({ SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY });
  const { calls, restore: restoreFetch } = stubFetch(() => ({ status: 200, payload: [{ id: 7, name: "app-seven" }] }));
  try {
    const row = {
      Name: "supabase-sync-workflow",
      orchestrationGraph: JSON.stringify({
        provider: "growthub-native",
        version: 1,
        nodes: [
          { id: "input", type: "input", config: { inputMode: "manual", samplePayload: { status: "live" } } },
          { id: "db", type: "supabase-data", config: { operation: "select", table: "apps", query: "status=eq.{{input.status}}" } },
          { id: "transform", type: "transform-filter", config: { rootPath: "" } },
          { id: "result", type: "tool-result", config: { successStatusCodes: [200], writeLastResponse: true } },
        ],
        edges: [],
      }),
    };
    const result = await runOrchestrationGraphIfPresent({
      workspaceConfig: workspaceWithSupabaseRow(),
      row,
      timeoutMs: 30000,
    });
    assert.equal(result.ok, true);
    assert.equal(calls[0].url, `${BASE_URL}/rest/v1/apps?status=eq.live`);
    assert.ok(result.stdout.includes("app-seven"));
    const traced = Object.fromEntries(result.nodeTrace.map((n) => [n.id, n.status]));
    assert.equal(traced.db, "completed");
    assert.equal(traced.result, "completed");
  } finally {
    restoreFetch();
    restore();
  }
});

test("api-registry-call keeps precedence when both HTTP-stage nodes exist", async () => {
  const restore = envPatch({ SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY });
  const { calls, restore: restoreFetch } = stubFetch(() => ({ status: 200, payload: { data: [] } }));
  try {
    const row = {
      Name: "mixed-workflow",
      orchestrationGraph: JSON.stringify({
        provider: "growthub-native",
        version: 1,
        nodes: [
          { id: "input", type: "input", config: {} },
          { id: "api", type: "api-registry-call", config: { registryId: "supabase-postgrest", endpoint: "https://api.example.com/things", method: "GET" } },
          { id: "db", type: "supabase-data", config: { operation: "select", table: "apps" } },
          { id: "result", type: "tool-result", config: {} },
        ],
        edges: [],
      }),
    };
    await runOrchestrationGraphIfPresent({
      workspaceConfig: workspaceWithSupabaseRow(),
      row,
      timeoutMs: 30000,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.example.com/things", "api-registry-call executed, not the supabase node");
  } finally {
    restoreFetch();
    restore();
  }
});
