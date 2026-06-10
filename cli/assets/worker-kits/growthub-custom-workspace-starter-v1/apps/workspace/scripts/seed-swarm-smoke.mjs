#!/usr/bin/env node
/**
 * Swarm cockpit smoke seed — super-admin fast path.
 *
 * Seeds the workspace artifacts the Agent Swarm Cockpit reads so a real
 * user smoke test starts at the interesting part — no onboarding guide,
 * no activation drivers:
 *
 *   growthub.source-records.json
 *     swarm:saved-workflows   — `swarm-ui-smoke-test` (8 agents, Ping/Echo)
 *                               and `swarm-20-smoke-test` (20 agents,
 *                               Ping/Echo/Verify) — the exact shapes from
 *                               the reference screenshots
 *     swarm:approval-memory   — both workflows pre-approved (remembered),
 *                               so /loop and one-click starts work instantly
 *
 *   growthub.config.json
 *     dataModel object `swarm-smoke-sandbox` (sandbox-environment) with an
 *     agent-swarm-v1 graph row — exercises workflow-mode runs and the
 *     workflows list
 *
 * Idempotent: re-running overwrites only the seeded keys/rows it owns.
 * With --live it also proposes + starts the 8-agent run against a running
 * dev server (default http://localhost:3000) so the Running section,
 * dot strips, and NDJSON stream light up immediately. Agent outputs then
 * depend on which sandbox adapters are configured — an unconfigured
 * adapter still renders the full tree with honest error states, which is
 * exactly what a UI smoke needs.
 *
 * Usage (from apps/workspace):
 *   node scripts/seed-swarm-smoke.mjs            # seed files only
 *   node scripts/seed-swarm-smoke.mjs --live     # seed + launch smoke run
 *   node scripts/seed-swarm-smoke.mjs --live --base http://localhost:3200
 */

import { promises as fs } from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const CONFIG_PATH = path.join(cwd, "growthub.config.json");
const RECORDS_PATH = path.join(cwd, "growthub.source-records.json");

const args = process.argv.slice(2);
const live = args.includes("--live");
const baseIndex = args.indexOf("--base");
const baseUrl = baseIndex >= 0 ? args[baseIndex + 1] : "http://localhost:3000";

function pingAgents(count) {
  return Array.from({ length: count }, (_, i) => ({
    label: `ping-${i}`,
    prompt: "Reply with exactly: pong. Nothing else.",
    maxTokens: 32,
    timeoutMs: 20000
  }));
}

function echoAgents(count) {
  const names = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"];
  return Array.from({ length: count }, (_, i) => ({
    label: `echo-${names[i] || i}`,
    prompt: "Echo the prior phase output back in one short line.",
    maxTokens: 64,
    timeoutMs: 20000
  }));
}

const SAVED_WORKFLOWS = [
  {
    name: "swarm-ui-smoke-test",
    label: "swarm-ui-smoke-test",
    description: "Low-token 8-agent swarm to exercise workflow UI/UX",
    plan: {
      maxConcurrency: 8,
      phases: [
        { label: "Ping", agents: pingAgents(5) },
        { label: "Echo", agents: echoAgents(3) }
      ]
    },
    savedAt: new Date().toISOString()
  },
  {
    name: "swarm-20-smoke-test",
    label: "swarm-20-smoke-test",
    description: "Low-token 20-agent swarm to exercise workflow UI/UX at scale",
    plan: {
      maxConcurrency: 10,
      phases: [
        { label: "Ping", agents: pingAgents(10) },
        { label: "Echo", agents: echoAgents(8) },
        {
          label: "Verify",
          agents: [
            { label: "verify-counts", prompt: "Confirm prior phase output is non-empty. Reply ok or missing.", maxTokens: 32 },
            { label: "verify-shape", prompt: "Confirm prior phase output contains the word pong. Reply ok or missing.", maxTokens: 32 }
          ]
        }
      ]
    },
    savedAt: new Date().toISOString()
  }
];

const APPROVAL_MEMORY = SAVED_WORKFLOWS.map((workflow) => ({
  workflowName: workflow.name,
  approvedBy: "smoke-seed",
  approvedAt: new Date().toISOString()
}));

const SMOKE_SANDBOX_OBJECT = {
  id: "swarm-smoke-sandbox",
  label: "Swarm Smoke Sandbox",
  objectType: "sandbox-environment",
  columns: ["Name", "adapter", "agentHost", "lifecycleStatus", "version"],
  rows: [
    {
      Name: "swarm-graph-smoke-test",
      adapter: "local-intelligence",
      agentHost: "",
      lifecycleStatus: "live",
      version: "1",
      orchestrationGraph: JSON.stringify({
        provider: "agent-swarm-v1",
        swarm: {
          maxConcurrency: 4,
          outcomeCriteria: "Every subagent replied with a one-line result.",
          rewardWeights: { parallel: 0.25, finish: 0.35, outcome: 0.4 }
        },
        nodes: [
          {
            id: "orchestrator",
            type: "thinAdapter",
            label: "Orchestrator",
            config: { prompt: "Assign each subagent its one-line smoke reply. Keep the plan to three lines." }
          },
          {
            id: "subagent-1",
            type: "ai-agent",
            label: "Ping",
            config: { role: "Ping", taskPrompt: "Reply with exactly: pong.", required: true, tools: [] }
          },
          {
            id: "subagent-2",
            type: "ai-agent",
            label: "Echo",
            config: { role: "Echo", taskPrompt: "Reply with exactly: echo.", required: true, tools: [] }
          },
          {
            id: "synthesis",
            type: "tool-result",
            label: "Synthesize",
            config: { outcomePrompt: "Combine the replies into one line." }
          }
        ],
        edges: [
          { from: "orchestrator", to: "subagent-1", passes: "subtask-assignment" },
          { from: "orchestrator", to: "subagent-2", passes: "subtask-assignment" },
          { from: "subagent-1", to: "synthesis", passes: "subtask-result" },
          { from: "subagent-2", to: "synthesis", passes: "subtask-result" }
        ]
      })
    }
  ]
};

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function seedSourceRecords() {
  const all = await readJson(RECORDS_PATH, {});
  all["swarm:saved-workflows"] = {
    records: SAVED_WORKFLOWS,
    integrationId: "swarm:saved-workflows",
    fetchedAt: new Date().toISOString(),
    recordCount: SAVED_WORKFLOWS.length
  };
  all["swarm:approval-memory"] = {
    records: APPROVAL_MEMORY,
    integrationId: "swarm:approval-memory",
    fetchedAt: new Date().toISOString(),
    recordCount: APPROVAL_MEMORY.length
  };
  await fs.writeFile(RECORDS_PATH, `${JSON.stringify(all, null, 2)}\n`, "utf8");
  return Object.keys(all).length;
}

async function seedConfig() {
  const config = await readJson(CONFIG_PATH, null);
  if (!config) {
    console.log("- growthub.config.json not found; skipped graph-workflow seed (saved plans still work)");
    return false;
  }
  config.dataModel = config.dataModel && typeof config.dataModel === "object" ? config.dataModel : {};
  const objects = Array.isArray(config.dataModel.objects) ? config.dataModel.objects : [];
  config.dataModel.objects = [
    ...objects.filter((object) => object?.id !== SMOKE_SANDBOX_OBJECT.id),
    SMOKE_SANDBOX_OBJECT
  ];
  await fs.writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return true;
}

async function launchLiveSmoke() {
  const propose = await fetch(`${baseUrl}/api/workspace/swarm-runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "propose",
      workflowName: "swarm-ui-smoke-test",
      reviewedBy: "smoke-seed"
    })
  }).then((response) => response.json());
  if (!propose?.ok) throw new Error(`propose failed: ${propose?.error || "unknown"}`);
  const start = await fetch(`${baseUrl}/api/workspace/swarm-runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "start", runId: propose.runId, approve: true, approvedBy: "smoke-seed" })
  }).then((response) => response.json());
  if (!start?.ok) throw new Error(`start failed: ${start?.error || "unknown"}`);
  return propose.runId;
}

const keys = await seedSourceRecords();
console.log(`✓ seeded swarm:saved-workflows (${SAVED_WORKFLOWS.length}) + swarm:approval-memory (${APPROVAL_MEMORY.length}) — ${keys} sidecar keys total`);
const graphSeeded = await seedConfig();
if (graphSeeded) console.log("✓ seeded swarm-smoke-sandbox graph workflow into growthub.config.json");

if (live) {
  try {
    const runId = await launchLiveSmoke();
    console.log(`✓ live smoke run launched: ${runId}`);
    console.log(`  watch: ${baseUrl}  →  Background tasks  (or curl ${baseUrl}/api/workspace/swarm-runs/${runId}/events)`);
  } catch (error) {
    console.log(`✗ live launch failed: ${error.message} — is the dev server running at ${baseUrl}?`);
    process.exitCode = 1;
  }
} else {
  console.log("next: start the app, open Background tasks, run /swarm swarm-ui-smoke-test (or re-run with --live)");
}
