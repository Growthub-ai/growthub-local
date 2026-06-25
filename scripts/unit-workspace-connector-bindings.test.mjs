/**
 * Unit tests for the connector-bindings deriver — the causation-based, agent-
 * agnostic, secret-free view of what binds at agent connection.
 *
 * Run with:  node --test scripts/unit-workspace-connector-bindings.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(here, "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib");
const mod = await import(pathToFileURL(path.join(kitLib, "workspace-connector-bindings.js")).href);
const { normalizeConnectorReport, reconcileConnectorSources, deriveConnectorBindings, deriveAgentHostConnectors } = mod;

const agentHostGraph = (slug, host) => ({
  kind: "growthub-workspace-metadata-graph-v1", version: 1, warnings: [],
  nodes: [{ id: `agentHost:${host}`, type: "agentHost", label: slug, summary: { label: slug }, metadataId: `agentHost:${host}` }],
  edges: [],
});

test("normalizeConnectorReport: keeps shape, DROPS anything token-shaped", () => {
  const raw = [
    { name: "slack", tools: ["post_message", "read_channel", "auth_token"], token: "xoxb-SECRET" },
    { name: "asana", tools: ["create_task"], scopes: ["tasks:write"] },
  ];
  const out = normalizeConnectorReport(raw, { surface: "local-agent", host: "claude" });
  assert.equal(out.length, 2);
  const slack = out.find((c) => c.provider === "slack");
  assert.ok(!("token" in slack)); // secret field never carried
  assert.ok(!slack.tools.includes("auth_token")); // secret-shaped tool dropped
  assert.deepEqual(slack.tools, ["post_message", "read_channel"]);
});

test("agnostic: works for any agent host/surface, not just Claude", () => {
  const codexLocal = normalizeConnectorReport([{ name: "asana", tools: ["create_task"] }], { surface: "local-agent", host: "codex" });
  const claudeAi = normalizeConnectorReport([{ name: "asana", tools: ["create_task"] }], { surface: "ai-agent", host: "claude" });
  assert.equal(codexLocal[0].host, "codex");
  assert.equal(codexLocal[0].surface, "local-agent");
  assert.equal(claudeAi[0].surface, "ai-agent");
});

test("reconcileConnectorSources: Both — runtime self-report confirms serve-time", () => {
  const serve = normalizeConnectorReport([{ name: "slack", tools: ["post_message"] }], { surface: "local-agent", host: "claude" });
  const run = normalizeConnectorReport([{ name: "slack", tools: ["read_channel"] }], { surface: "local-agent", host: "claude" });
  const merged = reconcileConnectorSources(serve, run);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].confirmedAtRuntime, true);
  // tools unioned across sources
  assert.deepEqual(merged[0].tools.sort(), ["post_message", "read_channel"]);
});

test("deriveConnectorBindings: records the CAUSE (boundTo agent host) and stays secret-free", () => {
  const graph = agentHostGraph("claude", "claude");
  const reports = normalizeConnectorReport([{ name: "slack", tools: ["post_message"], token: "x" }], { surface: "local-agent", host: "claude" });
  const out = deriveConnectorBindings(graph, { runtime: reports });
  assert.equal(out.total, 1);
  const b = out.bindings[0];
  assert.equal(b.id, "local-agent:slack");
  assert.equal(b.boundTo, "agentHost:claude"); // causally bound to the host node
  assert.equal(b.authLocation, "agent-account"); // never the workspace
  assert.equal(b.configurable, true);
  assert.equal(b.confirmedAtRuntime, true);
  assert.ok(!JSON.stringify(out).includes("token")); // no secret anywhere in the payload
});

test("deriveConnectorBindings: falls back to a synthetic host id when no node exists yet", () => {
  const out = deriveConnectorBindings({ nodes: [], edges: [] }, { serveTime: normalizeConnectorReport([{ name: "asana" }], { surface: "ai-agent", host: "claude" }) });
  assert.equal(out.bindings[0].boundTo, "agentHost:claude");
  assert.equal(out.bindings[0].confirmedAtRuntime, false);
});

test("deriveConnectorBindings: no connectors → honest, actionable empty", () => {
  const out = deriveConnectorBindings(agentHostGraph("claude", "claude"), {});
  assert.equal(out.total, 0);
  assert.match(out.summary, /No connectors bound/);
});

test("deriveAgentHostConnectors: per-host configurable view", () => {
  const graph = agentHostGraph("claude", "claude");
  const reports = normalizeConnectorReport([{ name: "slack" }, { name: "asana" }], { surface: "local-agent", host: "claude" });
  const view = deriveAgentHostConnectors(graph, "agentHost:claude", { runtime: reports });
  assert.equal(view.length, 2);
  assert.ok(view.every((b) => b.boundTo === "agentHost:claude"));
});

test("deriveConnectorBindings: malformed input never throws", () => {
  assert.equal(deriveConnectorBindings(null, null).total, 0);
  assert.equal(deriveConnectorBindings(undefined, { runtime: "nope" }).total, 0);
});
