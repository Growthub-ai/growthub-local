#!/usr/bin/env node
/**
 * Unit coverage for swarm telemetry + additive event contract
 * (SWARM_RUN_CONTRACT_V1).
 *
 * Verifies:
 *   - task results carry truthful telemetry (tokens/tools/startedAt/endedAt/
 *     phaseId) sourced from adapter-reported metadata only
 *   - missing telemetry stays null — never estimated
 *   - orchestrator/synthesis projections carry the same additive fields
 *   - packages/api-contract events stay ADDITIVE: all pre-existing event
 *     types remain and the seven swarm lifecycle events are present in both
 *     the union and the runtime guard
 *
 * Run with:  node --test scripts/unit-orchestration-agent-swarm-events.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, "..");
const kitRoot = path.join(
  repoRoot,
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib"
);

const graphModule = await import(pathToFileURL(path.join(kitRoot, "orchestration-graph.js")).href);
const swarmModule = await import(pathToFileURL(path.join(kitRoot, "orchestration-agent-swarm.js")).href);
const adaptersIndex = await import(pathToFileURL(path.join(kitRoot, "adapters/sandboxes/index.js")).href);
const registryModule = await import(
  pathToFileURL(path.join(kitRoot, "adapters/sandboxes/sandbox-adapter-registry.js")).href
);

const { buildDefaultAgentSwarmGraph } = graphModule;
const { runAgentSwarmGraphIfPresent, extractAdapterTelemetry } = swarmModule;
const { ensureSandboxAdaptersLoaded } = adaptersIndex;
const { registerSandboxAdapter } = registryModule;

await ensureSandboxAdaptersLoaded();

function installAdapter({ id = "local-agent-host", respond }) {
  const calls = [];
  registerSandboxAdapter({
    id,
    label: `stub:${id}`,
    locality: "local",
    supportedRuntimes: ["node", "bash", "python"],
    run: async (request) => {
      calls.push(request);
      const r = await respond(request);
      return {
        ok: r.ok !== false,
        exitCode: r.exitCode == null ? (r.ok === false ? 1 : 0) : r.exitCode,
        durationMs: r.durationMs ?? 1,
        stdout: r.stdout || "",
        stderr: r.stderr || "",
        error: r.error,
        adapterMeta: { adapter: id, stubbed: true, ...(r.adapterMeta || {}) }
      };
    }
  });
  return { calls };
}

function ctxFor(executionContext = {}) {
  return {
    runId: "run_events_test",
    ranAt: new Date().toISOString(),
    runtime: "node",
    adapterId: "local-agent-host",
    agentHost: "claude_local",
    env: {},
    envRefSlugs: [],
    envRefsMissing: [],
    networkAllow: false,
    allowList: [],
    timeoutMs: 5000,
    sandboxName: "events-test-row",
    ...executionContext
  };
}

test("extractAdapterTelemetry is truthful — null when unreported, numbers when reported", () => {
  assert.deepEqual(extractAdapterTelemetry({}), { tokens: null, tools: null });
  assert.deepEqual(extractAdapterTelemetry({ adapterMeta: {} }), { tokens: null, tools: null });
  assert.deepEqual(
    extractAdapterTelemetry({ adapterMeta: { tokens: 1234, tools: 2 } }),
    { tokens: 1234, tools: 2 }
  );
  assert.deepEqual(
    extractAdapterTelemetry({ adapterMeta: { tokens: "garbage", tools: -5 } }),
    { tokens: null, tools: null }
  );
});

test("task results carry tokens/tools/startedAt/endedAt/phaseId from adapter metadata", async () => {
  installAdapter({
    respond: (request) => {
      const phase = request?.env?.GROWTHUB_SWARM_PHASE || "subagent";
      if (phase === "orchestrator") return { stdout: "PLAN", adapterMeta: { tokens: 100, tools: 0 } };
      if (phase === "synthesis") return { stdout: "done\nOUTCOME_SCORE: 1", adapterMeta: { tokens: 50, tools: 0 } };
      return { stdout: "ack", adapterMeta: { tokens: 16300, tools: 1 } };
    }
  });
  const graph = buildDefaultAgentSwarmGraph();
  const result = await runAgentSwarmGraphIfPresent({
    workspaceConfig: {},
    row: { Name: "events-test-row" },
    graph,
    timeoutMs: 5000,
    runInputs: null,
    executionContext: ctxFor()
  });
  assert.equal(result.ok, true);
  for (const task of result.swarm.tasks) {
    assert.equal(task.tokens, 16300);
    assert.equal(task.tools, 1);
    assert.equal(task.phaseId, "dispatch");
    assert.ok(!Number.isNaN(Date.parse(task.startedAt)), "startedAt is ISO");
    assert.ok(!Number.isNaN(Date.parse(task.endedAt)), "endedAt is ISO");
    assert.ok(Date.parse(task.endedAt) >= Date.parse(task.startedAt));
  }
  assert.equal(result.swarm.orchestrator.tokens, 100);
  assert.equal(result.swarm.orchestrator.phaseId, "plan");
  assert.equal(result.swarm.synthesis.tokens, 50);
  assert.equal(result.swarm.synthesis.phaseId, "synthesize");
});

test("missing adapter telemetry yields null — never an estimate", async () => {
  installAdapter({
    respond: (request) => {
      const phase = request?.env?.GROWTHUB_SWARM_PHASE || "subagent";
      if (phase === "orchestrator") return { stdout: "PLAN" };
      if (phase === "synthesis") return { stdout: "done\nOUTCOME_SCORE: 1" };
      return { stdout: "ack" };
    }
  });
  const graph = buildDefaultAgentSwarmGraph();
  const result = await runAgentSwarmGraphIfPresent({
    workspaceConfig: {},
    row: { Name: "events-test-row" },
    graph,
    timeoutMs: 5000,
    runInputs: null,
    executionContext: ctxFor()
  });
  assert.equal(result.ok, true);
  for (const task of result.swarm.tasks) {
    assert.equal(task.tokens, null);
    assert.equal(task.tools, null);
  }
  assert.equal(result.swarm.orchestrator.tokens, null);
  assert.equal(result.swarm.synthesis.tokens, null);
});

test("execution event contract is additive: legacy types intact, swarm types appended", async () => {
  const source = await readFile(path.join(repoRoot, "packages/api-contract/src/events.ts"), "utf8");
  const legacy = [
    "node_start",
    "node_complete",
    "node_error",
    "credit_warning",
    "progress",
    "complete",
    "error"
  ];
  const swarmEvents = [
    "swarm_run_start",
    "swarm_phase_start",
    "swarm_agent_start",
    "swarm_agent_complete",
    "swarm_agent_error",
    "swarm_phase_complete",
    "swarm_run_complete"
  ];
  for (const type of [...legacy, ...swarmEvents]) {
    assert.ok(source.includes(`"${type}"`), `event type ${type} present in union`);
    assert.ok(source.includes(`case "${type}":`), `event type ${type} accepted by isExecutionEvent guard`);
  }
});
