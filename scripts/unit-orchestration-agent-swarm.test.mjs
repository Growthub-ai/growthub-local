#!/usr/bin/env node
/**
 * Unit coverage for the orchestration-agent-swarm runtime.
 *
 * Standalone — runs against the bundled growthub-custom-workspace-starter-v1
 * sources via node:test (no npm install). Verifies:
 *   - swarm graph detection
 *   - default swarm scaffold matches the no-schema-change contract
 *   - subagent dispatch routes through a stubbed sandbox adapter
 *   - required vs optional subagent failures
 *   - max-concurrency enforcement
 *   - reward telemetry math
 *
 * Run with:  node --test scripts/unit-orchestration-agent-swarm.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitRoot = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib"
);

const graphModule = await import(pathToFileURL(path.join(kitRoot, "orchestration-graph.js")).href);
const swarmModule = await import(pathToFileURL(path.join(kitRoot, "orchestration-agent-swarm.js")).href);
const adaptersIndex = await import(pathToFileURL(path.join(kitRoot, "adapters/sandboxes/index.js")).href);
const registryModule = await import(
  pathToFileURL(path.join(kitRoot, "adapters/sandboxes/sandbox-adapter-registry.js")).href
);

const {
  buildDefaultAgentSwarmGraph,
  isAgentSwarmGraph,
  extractSwarmNodes,
  AGENT_SWARM_EXECUTION_MODE
} = graphModule;
const { runAgentSwarmGraphIfPresent, computeRewardTelemetry } = swarmModule;
const { ensureSandboxAdaptersLoaded } = adaptersIndex;
const { registerSandboxAdapter } = registryModule;

await ensureSandboxAdaptersLoaded();

function stubAdapter({ id, failOn = [], delayMs = 5 } = {}) {
  const calls = [];
  registerSandboxAdapter({
    id,
    label: `stub:${id}`,
    description: "test stub",
    locality: "local",
    supportedRuntimes: ["node", "bash", "python"],
    run: async (request) => {
      calls.push(request);
      await new Promise((r) => setTimeout(r, delayMs));
      const haystack = `${request.name || ""}\n${request.command || ""}`;
      const isFail = failOn.some((needle) => haystack.includes(needle));
      return {
        ok: !isFail,
        exitCode: isFail ? 1 : 0,
        durationMs: delayMs,
        stdout: isFail ? "" : `ok:${request.name}`,
        stderr: "",
        error: isFail ? "intentional stub failure" : undefined,
        adapterMeta: { adapter: id, stubbed: true }
      };
    }
  });
  return { calls };
}

test("isAgentSwarmGraph detects executionMode + node types", () => {
  const graph = buildDefaultAgentSwarmGraph();
  assert.equal(isAgentSwarmGraph(graph), true);
  assert.equal(graph.executionMode, AGENT_SWARM_EXECUTION_MODE);
  assert.equal(graph.provider, "growthub-native");
  assert.equal(isAgentSwarmGraph({ provider: "growthub-native", nodes: [] }), false);
  assert.equal(isAgentSwarmGraph({ provider: "growthub-native", executionMode: "agent-swarm-v1", nodes: [] }), false);
});

test("buildDefaultAgentSwarmGraph keeps to existing node types only", () => {
  const graph = buildDefaultAgentSwarmGraph();
  const allowed = new Set(["thinAdapter", "ai-agent", "tool-result", "flow-control", "human-input"]);
  for (const node of graph.nodes) {
    assert.ok(allowed.has(node.type), `unexpected node type ${node.type}`);
  }
  const extracted = extractSwarmNodes(graph);
  assert.ok(extracted.orchestrator, "orchestrator missing");
  assert.ok(extracted.subagents.length >= 2, "default subagent count");
  assert.ok(extracted.synthesis, "synthesis missing");
});

test("runAgentSwarmGraphIfPresent dispatches subagents through adapter registry", async () => {
  const { calls } = stubAdapter({ id: "stub-swarm-ok" });
  const graph = buildDefaultAgentSwarmGraph({
    subagents: [
      { id: "s1", role: "Alpha", taskPrompt: "do a" },
      { id: "s2", role: "Beta", taskPrompt: "do b" }
    ]
  });
  const result = await runAgentSwarmGraphIfPresent({
    workspaceConfig: {},
    row: { Name: "test-row", orchestrationGraph: graph },
    timeoutMs: 5000,
    executionContext: {
      runId: "run_test",
      ranAt: new Date().toISOString(),
      runtime: "node",
      adapterId: "stub-swarm-ok",
      agentHost: "",
      env: {},
      envRefSlugs: [],
      envRefsMissing: [],
      networkAllow: false,
      allowList: [],
      timeoutMs: 5000,
      sandboxName: "test-row"
    }
  });
  assert.ok(result, "swarm runner must return a result");
  assert.equal(result.ok, true, `expected ok, got error=${result.error}`);
  assert.equal(result.adapterMeta.adapter, "orchestration-agent-swarm");
  assert.equal(result.swarm.tasks.length, 2);
  assert.equal(calls.length, 2, "adapter must be called once per subagent");
  assert.ok(Array.isArray(result.logTree));
  assert.equal(result.logTree[0].id, "swarm-root");
});

test("required subagent failure marks swarm failed", async () => {
  stubAdapter({ id: "stub-swarm-required-fail", failOn: ["Beta"] });
  const graph = buildDefaultAgentSwarmGraph({
    subagents: [
      { id: "s1", role: "Alpha", taskPrompt: "ok", required: true },
      { id: "s2", role: "Beta", taskPrompt: "boom", required: true }
    ]
  });
  const result = await runAgentSwarmGraphIfPresent({
    workspaceConfig: {},
    row: { Name: "fail-row", orchestrationGraph: graph },
    timeoutMs: 5000,
    executionContext: {
      runId: "run_fail",
      runtime: "node",
      adapterId: "stub-swarm-required-fail",
      sandboxName: "fail-row",
      env: {},
      envRefSlugs: [],
      envRefsMissing: [],
      networkAllow: false,
      allowList: [],
      timeoutMs: 5000
    }
  });
  assert.equal(result.ok, false);
  assert.equal(result.swarm.tasks.filter((t) => t.status === "completed").length, 1);
  assert.equal(result.swarm.tasks.filter((t) => t.status === "failed").length, 1);
});

test("optional subagent failure still succeeds", async () => {
  stubAdapter({ id: "stub-swarm-optional-fail", failOn: ["Optional"] });
  const graph = buildDefaultAgentSwarmGraph({
    subagents: [
      { id: "s1", role: "Required", taskPrompt: "ok", required: true },
      { id: "s2", role: "Optional", taskPrompt: "boom", required: false }
    ]
  });
  const result = await runAgentSwarmGraphIfPresent({
    workspaceConfig: {},
    row: { Name: "opt-row", orchestrationGraph: graph },
    timeoutMs: 5000,
    executionContext: {
      runId: "run_opt",
      runtime: "node",
      adapterId: "stub-swarm-optional-fail",
      sandboxName: "opt-row",
      env: {},
      envRefSlugs: [],
      envRefsMissing: [],
      networkAllow: false,
      allowList: [],
      timeoutMs: 5000
    }
  });
  assert.equal(result.ok, true, `expected ok, got error=${result.error}`);
  assert.equal(result.swarm.tasks.length, 2);
});

test("computeRewardTelemetry yields expected proportions", () => {
  const reward = computeRewardTelemetry({
    subagentNodes: [{}, {}, {}],
    tasks: [
      { status: "completed", required: true },
      { status: "completed", required: true },
      { status: "failed", required: false }
    ],
    weights: { parallel: 0.25, finish: 0.35, outcome: 0.4 },
    plannedConcurrency: 3,
    observedParallelism: 3,
    outcomeOk: true
  });
  assert.equal(reward.parallel, 1);
  assert.equal(reward.finish, 1);
  assert.equal(reward.outcome, 1);
  assert.equal(reward.score, 1);
});

test("rejects swarm graph without orchestrator", async () => {
  const graph = {
    version: 1,
    provider: "growthub-native",
    executionMode: "agent-swarm-v1",
    nodes: [
      { id: "x", type: "ai-agent", label: "Solo", config: { role: "Solo", taskPrompt: "" } }
    ],
    edges: []
  };
  const result = await runAgentSwarmGraphIfPresent({
    row: { orchestrationGraph: graph },
    executionContext: { runId: "rid", runtime: "node", adapterId: "stub-swarm-ok" }
  });
  assert.equal(result.ok, false);
  assert.match(String(result.error || ""), /thinAdapter|orchestrator/);
});

test("returns null for non-swarm graph (caller falls back)", async () => {
  const graph = {
    version: 1,
    provider: "growthub-native",
    nodes: [
      { id: "api", type: "api-registry-call", config: { registryId: "x" } },
      { id: "result", type: "tool-result", config: {} }
    ],
    edges: []
  };
  const result = await runAgentSwarmGraphIfPresent({ row: { orchestrationGraph: graph } });
  assert.equal(result, null);
});

test("max concurrency bounds adapter overlap", async () => {
  const startTimes = [];
  const endTimes = [];
  registerSandboxAdapter({
    id: "stub-swarm-concurrency",
    label: "stub",
    locality: "local",
    supportedRuntimes: ["node"],
    run: async () => {
      const start = Date.now();
      startTimes.push(start);
      await new Promise((r) => setTimeout(r, 30));
      endTimes.push(Date.now());
      return { ok: true, exitCode: 0, durationMs: 30, stdout: "ok", stderr: "" };
    }
  });
  const graph = buildDefaultAgentSwarmGraph({
    subagents: [
      { id: "a", role: "A", taskPrompt: "" },
      { id: "b", role: "B", taskPrompt: "" },
      { id: "c", role: "C", taskPrompt: "" },
      { id: "d", role: "D", taskPrompt: "" }
    ],
    maxConcurrency: 2
  });
  const result = await runAgentSwarmGraphIfPresent({
    row: { orchestrationGraph: graph },
    executionContext: { runId: "rid", runtime: "node", adapterId: "stub-swarm-concurrency", sandboxName: "n", timeoutMs: 1000 }
  });
  assert.equal(result.swarm.tasks.length, 4);
  assert.ok(result.swarm.observedParallelism <= 2, `observedParallelism should respect maxConcurrency=2, got ${result.swarm.observedParallelism}`);
});

test("stdout/stderr/error are redacted in returned payload", async () => {
  registerSandboxAdapter({
    id: "stub-swarm-redact",
    label: "stub",
    locality: "local",
    supportedRuntimes: ["node"],
    run: async () => ({
      ok: true,
      exitCode: 0,
      durationMs: 1,
      stdout: "Bearer SECRETVALUE123",
      stderr: "api_key=SECRETVALUE123",
      error: undefined
    })
  });
  const graph = buildDefaultAgentSwarmGraph({
    subagents: [{ id: "r", role: "Redactor", taskPrompt: "" }]
  });
  const result = await runAgentSwarmGraphIfPresent({
    row: { orchestrationGraph: graph },
    executionContext: { runId: "rid", runtime: "node", adapterId: "stub-swarm-redact", sandboxName: "n", timeoutMs: 1000 }
  });
  const task = result.swarm.tasks[0];
  assert.ok(!task.stdout.includes("SECRETVALUE123"), "stdout must redact secrets");
  assert.ok(!task.stderr.includes("SECRETVALUE123"), "stderr must redact secrets");
});
