#!/usr/bin/env node
/**
 * Unit coverage for the orchestration-agent-swarm runtime.
 *
 * Standalone — runs against the bundled growthub-custom-workspace-starter-v1
 * sources via node:test (no npm install). Verifies the orchestrator → workers
 * → synthesizer pipeline end to end:
 *
 *   - swarm graph detection + schema validation
 *   - default scaffold uses only existing node types
 *   - orchestrator plan is dispatched first and threaded to subagents
 *   - subagent fan-out respects maxConcurrency
 *   - required vs optional subagent failure semantics
 *   - synthesizer-parsed OUTCOME_SCORE flips reward.kind to evaluated-v1
 *   - missing OUTCOME_SCORE → reward.kind = structural-fallback
 *   - ai-agent cannot fall back to local-process (code-exec adapter gate)
 *   - per-subagent network access requires BOTH row + subagent toggle
 *   - secrets in stdout/stderr are redacted
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
  validateAgentSwarmGraph,
  AGENT_SWARM_EXECUTION_MODE
} = graphModule;
const { runAgentSwarmGraphIfPresent, computeRewardTelemetry } = swarmModule;
const { ensureSandboxAdaptersLoaded } = adaptersIndex;
const { registerSandboxAdapter } = registryModule;

await ensureSandboxAdaptersLoaded();

/**
 * Install a stub adapter with a deterministic response function. The function
 * receives the adapter request; whatever it returns becomes the RunResult.
 */
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

/**
 * The default routing kit returns an answer + OUTCOME_SCORE line when given the
 * synthesizer prompt, a plan when given the orchestrator prompt, and a per-role
 * acknowledgement when given a subagent prompt. Lets the same stub serve all
 * three phases naturally.
 */
function installFullPipelineStub() {
  return installAdapter({
    respond: (request) => {
      const phase = request?.env?.GROWTHUB_SWARM_PHASE || "subagent";
      if (phase === "orchestrator") {
        return { stdout: "PLAN:\n1) Researcher: gather facts.\n2) Analyst: critique." };
      }
      if (phase === "synthesis") {
        return { stdout: "Final answer: combined.\nOUTCOME_SCORE: 0.92" };
      }
      const role = request?.env?.GROWTHUB_SWARM_SUBAGENT_ROLE || "subagent";
      return { stdout: `[${role}] done.` };
    }
  });
}

function ctxFor(executionContext = {}) {
  return {
    runId: "run_test",
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
    sandboxName: "test-row",
    ...executionContext
  };
}

test("isAgentSwarmGraph + validateAgentSwarmGraph reject malformed graphs", () => {
  const ok = buildDefaultAgentSwarmGraph();
  assert.equal(isAgentSwarmGraph(ok), true);
  assert.equal(validateAgentSwarmGraph(ok).ok, true);

  const noOrchestrator = {
    version: 1,
    provider: "growthub-native",
    executionMode: AGENT_SWARM_EXECUTION_MODE,
    nodes: [{ id: "s", type: "ai-agent", config: { role: "S", taskPrompt: "do" } }],
    edges: []
  };
  const r1 = validateAgentSwarmGraph(noOrchestrator);
  assert.equal(r1.ok, false);
  assert.ok(r1.errors.some((e) => /orchestrator/i.test(e)));

  const noTaskPrompt = buildDefaultAgentSwarmGraph();
  noTaskPrompt.nodes.find((n) => n.type === "ai-agent").config.taskPrompt = "";
  const r2 = validateAgentSwarmGraph(noTaskPrompt);
  assert.equal(r2.ok, false);

  const badAdapter = buildDefaultAgentSwarmGraph();
  badAdapter.nodes.find((n) => n.type === "ai-agent").config.adapter = "local-process";
  const r3 = validateAgentSwarmGraph(badAdapter);
  assert.equal(r3.ok, false);
  assert.ok(r3.errors.some((e) => /local-process|prompt/i.test(e)));
});

test("default swarm scaffold only uses existing graph node types", () => {
  const graph = buildDefaultAgentSwarmGraph();
  const allowed = new Set(["thinAdapter", "ai-agent", "tool-result", "flow-control", "human-input"]);
  for (const node of graph.nodes) {
    assert.ok(allowed.has(node.type), `unexpected node type ${node.type}`);
  }
  const extracted = extractSwarmNodes(graph);
  assert.ok(extracted.orchestrator);
  assert.ok(extracted.subagents.length >= 2);
  assert.ok(extracted.synthesis);
  // Subagents carry production-grade Claude Code-style metadata
  for (const sub of extracted.subagents) {
    assert.ok(typeof sub.config.role === "string" && sub.config.role.length > 0);
    assert.ok(typeof sub.config.description === "string");
    assert.ok(Array.isArray(sub.config.tools));
  }
});

test("end-to-end pipeline: orchestrator plans, subagents dispatch, synthesizer scores", async () => {
  const { calls } = installFullPipelineStub();
  const graph = buildDefaultAgentSwarmGraph({
    agentHost: "claude_local",
    subagents: [
      { id: "alpha", role: "Alpha", description: "A", taskPrompt: "do alpha", tools: ["read"], agentHost: "claude_local" },
      { id: "beta",  role: "Beta",  description: "B", taskPrompt: "do beta",  tools: ["write"], agentHost: "claude_local" }
    ]
  });
  const result = await runAgentSwarmGraphIfPresent({
    workspaceConfig: {},
    row: { Name: "row", orchestrationGraph: graph },
    timeoutMs: 5000,
    executionContext: ctxFor({})
  });
  assert.ok(result, "swarm runner must return a result");
  assert.equal(result.ok, true, `expected ok, got error=${result.error}`);
  assert.equal(result.adapterMeta.adapter, "orchestration-agent-swarm");
  // Exactly: 1 orchestrator + 2 subagents + 1 synthesizer = 4 adapter calls
  assert.equal(calls.length, 4, `expected 4 phases, got ${calls.length}`);
  const phases = calls.map((c) => c.env?.GROWTHUB_SWARM_PHASE);
  assert.ok(phases.includes("orchestrator"));
  assert.ok(phases.includes("synthesis"));
  assert.equal(phases.filter((p) => p === "subagent").length, 2);
  // Subagents see the orchestrator plan in their command
  const subagentCommands = calls.filter((c) => c.env?.GROWTHUB_SWARM_PHASE === "subagent").map((c) => c.command);
  for (const cmd of subagentCommands) {
    assert.ok(cmd.includes("PLAN:"), "subagent command must thread orchestrator plan");
    assert.ok(cmd.includes("<orchestrator_plan untrusted=\"true\">"), "plan must be wrapped as untrusted context");
  }
  // Reward upgraded to semantic evaluation
  assert.equal(result.swarm.reward.kind, "evaluated-v1");
  assert.ok(result.swarm.reward.outcome > 0.9);
  // Synthesizer answer surfaces in swarm.synthesis
  assert.ok(result.swarm.synthesis?.answer?.includes("Final answer"));
  assert.equal(Number(result.swarm.synthesis.parsedOutcomeScore.toFixed(2)), 0.92);
});

test("synthesizer without OUTCOME_SCORE falls back to structural-fallback", async () => {
  installAdapter({
    respond: (request) => {
      const phase = request?.env?.GROWTHUB_SWARM_PHASE;
      if (phase === "orchestrator") return { stdout: "plan" };
      if (phase === "synthesis") return { stdout: "final answer with no score marker" };
      return { stdout: "subagent ok" };
    }
  });
  const graph = buildDefaultAgentSwarmGraph({
    agentHost: "claude_local",
    subagents: [
      { id: "s1", role: "S1", description: "", taskPrompt: "do", agentHost: "claude_local" }
    ]
  });
  const result = await runAgentSwarmGraphIfPresent({
    row: { orchestrationGraph: graph },
    executionContext: ctxFor({})
  });
  assert.equal(result.swarm.reward.kind, "structural-fallback");
  assert.ok(result.swarm.synthesis.parsedOutcomeScore == null);
});

test("low semantic score (<0.5) marks swarm failed even when subagents succeed", async () => {
  installAdapter({
    respond: (request) => {
      const phase = request?.env?.GROWTHUB_SWARM_PHASE;
      if (phase === "orchestrator") return { stdout: "plan" };
      if (phase === "synthesis") return { stdout: "answer\nOUTCOME_SCORE: 0.10" };
      return { stdout: "subagent ok" };
    }
  });
  const graph = buildDefaultAgentSwarmGraph({
    agentHost: "claude_local",
    subagents: [
      { id: "s1", role: "S1", description: "", taskPrompt: "do", agentHost: "claude_local" }
    ]
  });
  const result = await runAgentSwarmGraphIfPresent({
    row: { orchestrationGraph: graph },
    executionContext: ctxFor({})
  });
  assert.equal(result.ok, false);
  assert.equal(result.swarm.reward.kind, "evaluated-v1");
  assert.equal(result.swarm.reward.outcome, 0.1);
  assert.match(String(result.error || ""), /OUTCOME_SCORE/);
});

test("required subagent failure → swarm fails, synthesizer still runs to gather signal", async () => {
  installAdapter({
    respond: (request) => {
      const phase = request?.env?.GROWTHUB_SWARM_PHASE;
      const role = request?.env?.GROWTHUB_SWARM_SUBAGENT_ROLE;
      if (phase === "orchestrator") return { stdout: "plan" };
      if (phase === "synthesis") return { stdout: "partial answer\nOUTCOME_SCORE: 0.30" };
      if (role === "Beta") return { ok: false, error: "boom" };
      return { stdout: "alpha ok" };
    }
  });
  const graph = buildDefaultAgentSwarmGraph({
    agentHost: "claude_local",
    subagents: [
      { id: "a", role: "Alpha", description: "", taskPrompt: "ok", required: true, agentHost: "claude_local" },
      { id: "b", role: "Beta",  description: "", taskPrompt: "boom", required: true, agentHost: "claude_local" }
    ]
  });
  const result = await runAgentSwarmGraphIfPresent({
    row: { orchestrationGraph: graph },
    executionContext: ctxFor({})
  });
  assert.equal(result.ok, false);
  assert.equal(result.swarm.tasks.filter((t) => t.status === "failed").length, 1);
  assert.equal(result.swarm.tasks.filter((t) => t.status === "completed").length, 1);
});

test("optional subagent failure does not fail the swarm", async () => {
  installAdapter({
    respond: (request) => {
      const phase = request?.env?.GROWTHUB_SWARM_PHASE;
      const role = request?.env?.GROWTHUB_SWARM_SUBAGENT_ROLE;
      if (phase === "orchestrator") return { stdout: "plan" };
      if (phase === "synthesis") return { stdout: "ok\nOUTCOME_SCORE: 0.80" };
      if (role === "Optional") return { ok: false, error: "boom" };
      return { stdout: "ok" };
    }
  });
  const graph = buildDefaultAgentSwarmGraph({
    agentHost: "claude_local",
    subagents: [
      { id: "r", role: "Required", description: "", taskPrompt: "do", required: true, agentHost: "claude_local" },
      { id: "o", role: "Optional", description: "", taskPrompt: "do", required: false, agentHost: "claude_local" }
    ]
  });
  const result = await runAgentSwarmGraphIfPresent({
    row: { orchestrationGraph: graph },
    executionContext: ctxFor({})
  });
  assert.equal(result.ok, true, `expected ok, got error=${result.error}`);
});

test("orchestrator failure short-circuits without dispatching subagents", async () => {
  const { calls } = installAdapter({
    respond: (request) => {
      const phase = request?.env?.GROWTHUB_SWARM_PHASE;
      if (phase === "orchestrator") return { ok: false, error: "planner crashed" };
      return { stdout: "should-not-run" };
    }
  });
  const graph = buildDefaultAgentSwarmGraph({
    agentHost: "claude_local",
    subagents: [
      { id: "a", role: "A", description: "", taskPrompt: "do", agentHost: "claude_local" }
    ]
  });
  const result = await runAgentSwarmGraphIfPresent({
    row: { orchestrationGraph: graph },
    executionContext: ctxFor({})
  });
  assert.equal(result.ok, false);
  assert.equal(result.adapterMeta.phaseFailed, "orchestrator");
  assert.equal(result.swarm.tasks.length, 0);
  assert.equal(calls.length, 1, "only the orchestrator should have been invoked");
});

test("ai-agent without prompt-capable adapter → adapter-gate failure (no code execution)", async () => {
  // Register local-process so we can prove it is NOT invoked.
  const { calls } = installAdapter({ id: "local-process", respond: () => ({ stdout: "should not run" }) });
  const graph = buildDefaultAgentSwarmGraph({
    subagents: [{ id: "stranded", role: "Stranded", description: "", taskPrompt: "do", required: true }]
  });
  const result = await runAgentSwarmGraphIfPresent({
    row: { orchestrationGraph: graph },
    executionContext: ctxFor({ adapterId: "local-process", agentHost: "" })
  });
  // Orchestrator also has no prompt-capable resolution → fails at planner phase.
  assert.equal(result.ok, false);
  assert.equal(calls.length, 0, "local-process must not be invoked for natural-language prompts");
});

test("non-prompt-capable subagent adapter override is rejected", async () => {
  installFullPipelineStub();
  const { calls } = installAdapter({ id: "local-process", respond: () => ({ stdout: "should not run" }) });
  const graph = buildDefaultAgentSwarmGraph({
    agentHost: "claude_local",
    subagents: [
      { id: "x", role: "Naughty", description: "", taskPrompt: "bypass", required: true, agentHost: "claude_local", adapter: "local-process" }
    ]
  });
  const result = await runAgentSwarmGraphIfPresent({
    row: { orchestrationGraph: graph },
    executionContext: ctxFor({})
  });
  assert.equal(result.ok, false);
  assert.equal(result.swarm.tasks[0].adapterMeta?.reason, "adapter-gate");
  assert.equal(calls.length, 0, "code-execution adapter must not be invoked for ai-agent");
});

test("network access requires BOTH row networkAllow and subagent networkAccess", async () => {
  const observed = [];
  installAdapter({
    respond: (request) => {
      const phase = request?.env?.GROWTHUB_SWARM_PHASE;
      if (phase === "subagent") {
        observed.push({ name: request.name, networkAllow: request.networkAllow });
      }
      if (phase === "orchestrator") return { stdout: "plan" };
      if (phase === "synthesis") return { stdout: "ok\nOUTCOME_SCORE: 0.9" };
      return { stdout: "ok" };
    }
  });
  const graph = buildDefaultAgentSwarmGraph({
    agentHost: "claude_local",
    subagents: [
      { id: "n-on",  role: "On",  description: "", taskPrompt: "x", agentHost: "claude_local", networkAccess: true },
      { id: "n-off", role: "Off", description: "", taskPrompt: "x", agentHost: "claude_local", networkAccess: false }
    ]
  });

  await runAgentSwarmGraphIfPresent({
    row: { orchestrationGraph: graph },
    executionContext: ctxFor({ networkAllow: true })
  });
  const on = observed.find((o) => o.name.endsWith("n-on"));
  const off = observed.find((o) => o.name.endsWith("n-off"));
  assert.equal(on.networkAllow, true, "row+subagent both on → network");
  assert.equal(off.networkAllow, false, "subagent off → no network even if row on");

  observed.length = 0;
  await runAgentSwarmGraphIfPresent({
    row: { orchestrationGraph: graph },
    executionContext: ctxFor({ networkAllow: false })
  });
  for (const entry of observed) {
    assert.equal(entry.networkAllow, false, "row off → no network for any subagent");
  }
});

test("max concurrency bounds subagent overlap", async () => {
  installAdapter({
    respond: async (request) => {
      const phase = request?.env?.GROWTHUB_SWARM_PHASE;
      if (phase === "subagent") {
        await new Promise((r) => setTimeout(r, 25));
        return { stdout: "ok" };
      }
      if (phase === "synthesis") return { stdout: "ok\nOUTCOME_SCORE: 0.9" };
      return { stdout: "plan" };
    }
  });
  const graph = buildDefaultAgentSwarmGraph({
    agentHost: "claude_local",
    subagents: [
      { id: "a", role: "A", description: "", taskPrompt: "x", agentHost: "claude_local" },
      { id: "b", role: "B", description: "", taskPrompt: "x", agentHost: "claude_local" },
      { id: "c", role: "C", description: "", taskPrompt: "x", agentHost: "claude_local" },
      { id: "d", role: "D", description: "", taskPrompt: "x", agentHost: "claude_local" }
    ],
    maxConcurrency: 2
  });
  const result = await runAgentSwarmGraphIfPresent({
    row: { orchestrationGraph: graph },
    executionContext: ctxFor({})
  });
  assert.equal(result.swarm.tasks.length, 4);
  assert.ok(result.swarm.observedParallelism <= 2, `observedParallelism should respect maxConcurrency=2, got ${result.swarm.observedParallelism}`);
});

test("secrets in stdout/stderr/error are redacted in the returned payload", async () => {
  installAdapter({
    respond: (request) => {
      const phase = request?.env?.GROWTHUB_SWARM_PHASE;
      if (phase === "orchestrator") return { stdout: "plan" };
      if (phase === "synthesis") return { stdout: "ok\nOUTCOME_SCORE: 0.9" };
      return {
        stdout: "Bearer SECRETVALUE123",
        stderr: "api_key=SECRETVALUE123",
        error: undefined
      };
    }
  });
  const graph = buildDefaultAgentSwarmGraph({
    agentHost: "claude_local",
    subagents: [{ id: "r", role: "Redactor", description: "", taskPrompt: "x", agentHost: "claude_local" }]
  });
  const result = await runAgentSwarmGraphIfPresent({
    row: { orchestrationGraph: graph },
    executionContext: ctxFor({})
  });
  const task = result.swarm.tasks[0];
  assert.ok(!task.stdout.includes("SECRETVALUE123"), "stdout must redact secrets");
  assert.ok(!task.stderr.includes("SECRETVALUE123"), "stderr must redact secrets");
  const treeText = JSON.stringify(result.logTree);
  assert.ok(!treeText.includes("SECRETVALUE123"), "logTree must redact secrets");
});

test("reward kind is structural-v1 when no synthesizer is configured", () => {
  const reward = computeRewardTelemetry({
    subagentNodes: [{}],
    tasks: [{ status: "completed", required: true }],
    weights: { parallel: 0.25, finish: 0.35, outcome: 0.4 },
    plannedConcurrency: 1,
    observedParallelism: 1,
    outcomeOk: true,
    synthesisResult: null
  });
  assert.equal(reward.kind, "structural-v1");
});

test("reward kind is evaluated-v1 when synthesizer returns OUTCOME_SCORE", () => {
  const reward = computeRewardTelemetry({
    subagentNodes: [{}],
    tasks: [{ status: "completed", required: true }],
    weights: { parallel: 0.25, finish: 0.35, outcome: 0.4 },
    plannedConcurrency: 1,
    observedParallelism: 1,
    outcomeOk: true,
    synthesisResult: { ranSynthesis: true, parsedOutcomeScore: 0.85, status: "completed" }
  });
  assert.equal(reward.kind, "evaluated-v1");
  assert.equal(reward.outcome, 0.85);
});

test("subagent prompt template includes description and tools when set", async () => {
  const { calls } = installFullPipelineStub();
  const graph = buildDefaultAgentSwarmGraph({
    agentHost: "claude_local",
    subagents: [{
      id: "rich",
      role: "Rich",
      description: "Special charter line.",
      taskPrompt: "do rich work",
      tools: ["read", "summarize"],
      agentHost: "claude_local"
    }]
  });
  await runAgentSwarmGraphIfPresent({
    row: { orchestrationGraph: graph },
    executionContext: ctxFor({})
  });
  const subagentCall = calls.find((c) => c.env?.GROWTHUB_SWARM_PHASE === "subagent");
  assert.ok(subagentCall.command.includes("Special charter line."), "subagent description must appear in prompt");
  assert.ok(subagentCall.command.includes("read, summarize"), "tools must appear in prompt");
  assert.equal(subagentCall.env.GROWTHUB_SWARM_SUBAGENT_TOOLS, "read,summarize");
});

test("returns null for non-swarm graph (caller falls back to API Registry path)", async () => {
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
