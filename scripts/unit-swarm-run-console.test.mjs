#!/usr/bin/env node
/**
 * Unit coverage for the swarm run-console projection (SWARM_RUN_CONTRACT_V1).
 *
 * Verifies deriveSwarmRunProjection + normalizeRunConsoleRecord:
 *   - non-swarm records normalize exactly as before (swarmRun is null)
 *   - swarm records expose the swarmRun projection (phases/agents/totals)
 *   - missing tokens/tools stay null — never estimated
 *   - totals are null when nothing was reported, summed when reported
 *   - missing tasks / malformed reward / partial records do not crash
 *   - transcripts are secret-redacted
 *   - logTree and lifecycle still work
 *
 * Run with:  node --test scripts/unit-swarm-run-console.test.mjs
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

const consoleModule = await import(pathToFileURL(path.join(kitRoot, "orchestration-run-console.js")).href);
const { normalizeRunConsoleRecord, deriveSwarmRunProjection } = consoleModule;

function swarmRecord(overrides = {}) {
  return {
    runId: "run_swarm_1",
    ranAt: "2026-06-10T08:34:00.000Z",
    name: "swarm-ui-smoke-test",
    objectId: "swarm-workflows",
    adapter: "orchestration-agent-swarm",
    runtime: "node",
    runLocality: "local",
    exitCode: 0,
    durationMs: 15000,
    stdout: "swarm 2/2 score=0.9",
    stderr: "",
    swarm: {
      executionMode: "agent-swarm-v1",
      orchestrator: {
        nodeId: "orchestrator",
        status: "completed",
        adapter: "local-intelligence",
        durationMs: 1200,
        tokens: 500,
        tools: 0,
        plan: "1) Ping 2) Echo",
      },
      tasks: [
        {
          taskId: "subagent-ping",
          role: "ping-0",
          status: "completed",
          durationMs: 4000,
          tokens: 16300,
          tools: 1,
          stdout: "pong",
          required: true,
        },
        {
          taskId: "subagent-echo",
          role: "echo-alpha",
          status: "completed",
          durationMs: 4200,
          tokens: null,
          tools: null,
          stdout: "echo with Bearer abc123token inside",
          required: true,
        },
      ],
      synthesis: {
        nodeId: "synthesis",
        label: "Verify",
        status: "completed",
        durationMs: 900,
        tokens: null,
        tools: null,
        answer: "All good.\nOUTCOME_SCORE: 0.9",
        parsedOutcomeScore: 0.9,
      },
      reward: { kind: "evaluated-v1", score: 0.9 },
      maxConcurrency: 4,
      observedParallelism: 2,
    },
    logTree: [{ id: "swarm-root", label: "agent-swarm", type: "swarm", status: "completed", durationMs: 15000, children: [] }],
    ...overrides,
  };
}

test("non-swarm records normalize unchanged with swarmRun null", () => {
  const record = {
    runId: "run_api_1",
    ranAt: "2026-06-10T08:00:00.000Z",
    name: "plain-api-tool",
    adapter: "local-process",
    exitCode: 0,
    durationMs: 800,
    stdout: "ok",
  };
  const normalized = normalizeRunConsoleRecord(record);
  assert.equal(normalized.runId, "run_api_1");
  assert.equal(normalized.status, "completed");
  assert.equal(normalized.swarm, null);
  assert.equal(normalized.swarmRun, null);
  assert.ok(Array.isArray(normalized.logTree) && normalized.logTree.length > 0);
  assert.ok(Array.isArray(normalized.lifecycle) && normalized.lifecycle.length > 0);
  assert.equal(deriveSwarmRunProjection(record), null);
});

test("swarm records expose the full swarmRun projection", () => {
  const normalized = normalizeRunConsoleRecord(swarmRecord());
  const projection = normalized.swarmRun;
  assert.ok(projection, "swarmRun attached");
  assert.equal(projection.runId, "run_swarm_1");
  assert.equal(projection.title, "swarm-ui-smoke-test");
  assert.equal(projection.status, "completed");
  assert.equal(projection.elapsedMs, 15000);
  assert.deepEqual(projection.phases.map((p) => p.id), ["plan", "dispatch", "synthesize"]);
  // plan + 2 dispatch agents + synthesize
  assert.equal(projection.agentCount, 4);
  const dispatch = projection.phases.find((p) => p.id === "dispatch");
  assert.equal(dispatch.agents.length, 2);
  assert.equal(dispatch.agents[0].label, "ping-0");
  assert.equal(dispatch.agents[0].tokens, 16300);
  assert.equal(dispatch.agents[0].tools, 1);
  assert.equal(dispatch.agents[0].durationMs, 4000);
  assert.ok(dispatch.agents[0].logNodeId, "agents link to log nodes");
  // logTree untouched
  assert.equal(normalized.logTree[0].id, "swarm-root");
});

test("missing tokens/tools remain null and totals are truthful", () => {
  const projection = deriveSwarmRunProjection(swarmRecord());
  const dispatch = projection.phases.find((p) => p.id === "dispatch");
  assert.equal(dispatch.agents[1].tokens, null, "unreported tokens stay null");
  assert.equal(dispatch.agents[1].tools, null);
  // totals = sum of reported values only (500 + 16300)
  assert.equal(projection.totalTokens, 16800);
  assert.equal(projection.totalTools, 1);

  // When NOTHING reports, totals are null — never 0-as-fake or estimated.
  const silent = swarmRecord();
  silent.swarm.orchestrator.tokens = null;
  silent.swarm.orchestrator.tools = null;
  silent.swarm.tasks.forEach((t) => { t.tokens = null; t.tools = null; });
  silent.swarm.synthesis.tokens = null;
  silent.swarm.synthesis.tools = null;
  const silentProjection = deriveSwarmRunProjection(silent);
  assert.equal(silentProjection.totalTokens, null);
  assert.equal(silentProjection.totalTools, null);
});

test("transcripts are secret-redacted", () => {
  const projection = deriveSwarmRunProjection(swarmRecord());
  const echo = projection.phases.find((p) => p.id === "dispatch").agents[1];
  assert.ok(!echo.transcript.includes("abc123token"), "bearer value redacted");
  assert.ok(echo.transcript.includes("[redacted]"));
});

test("degenerate swarm records do not crash", () => {
  // Missing tasks
  const noTasks = swarmRecord();
  delete noTasks.swarm.tasks;
  const p1 = deriveSwarmRunProjection(noTasks);
  assert.equal(p1.phases.find((ph) => ph.id === "dispatch").agents.length, 0);
  assert.equal(p1.phases.find((ph) => ph.id === "dispatch").status, "failed");

  // Malformed reward + missing orchestrator/synthesis
  const minimal = { runId: "r", swarm: { reward: "garbage", tasks: [{ role: 7, status: null }] } };
  const p2 = deriveSwarmRunProjection(minimal);
  assert.ok(p2);
  assert.equal(p2.phases.length, 1);
  assert.equal(p2.phases[0].agents.length, 1);
  assert.equal(p2.phases[0].agents[0].tokens, null);

  // Entirely empty swarm block
  const p3 = deriveSwarmRunProjection({ runId: "r2", swarm: {} });
  assert.ok(p3);
  assert.equal(p3.agentCount, 0);

  // Failed run statuses propagate
  const failed = swarmRecord({ exitCode: 1, error: "one or more required subagents failed" });
  failed.swarm.tasks[0].status = "failed";
  const p4 = deriveSwarmRunProjection(failed);
  assert.equal(p4.status, "failed");
  assert.equal(p4.phases.find((ph) => ph.id === "dispatch").status, "failed");
});

test("projection module stays pure — no React, no fetch, no config writes", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile(path.join(kitRoot, "orchestration-run-console.js"), "utf8");
  assert.ok(!/from\s+["']react["']/.test(source), "no React import");
  assert.ok(!/\bfetch\s*\(/.test(source), "no fetch calls");
  assert.ok(!/writeWorkspaceConfig\s*\(|writeWorkspaceSourceRecords\s*\(/.test(source), "no config writes");
  assert.ok(!/localStorage\.|sessionStorage\./.test(source), "no browser storage");
});
