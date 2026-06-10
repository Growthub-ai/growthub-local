#!/usr/bin/env node
/**
 * Unit coverage for the governed swarm proposal lane (SWARM_RUN_CONTRACT_V1).
 *
 * Standalone — runs against the bundled growthub-custom-workspace-starter-v1
 * sources via node:test (no npm install). Verifies:
 *
 *   - swarm.run.propose / .workflow.save / .run.resume validate
 *   - invalid type, affectedField, missing agents/objective reject
 *   - credential-shaped payload fields reject
 *   - code-execution adapters reject (prompt-capable only)
 *   - normalization into a sandbox-environment row with an agent-swarm-v1
 *     graph built by buildDefaultAgentSwarmGraph (model graph not trusted)
 *   - upsert de-dupes by Name and preserves run-history stamps
 *   - findSwarmRunRows finds swarm rows and ignores non-swarm rows
 *   - the helper contract maps swarm types to the EXISTING dataModel patch
 *     field — no new top-level PATCH allowlist entry
 *
 * Run with:  node --test scripts/unit-swarm-proposal.test.mjs
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

const swarmModule = await import(pathToFileURL(path.join(kitRoot, "workspace-swarm-proposal.js")).href);
const graphModule = await import(pathToFileURL(path.join(kitRoot, "orchestration-graph.js")).href);
const helperModule = await import(pathToFileURL(path.join(kitRoot, "workspace-helper.js")).href);
const schemaModule = await import(pathToFileURL(path.join(kitRoot, "workspace-schema.js")).href);

const {
  SWARM_RUN_PROPOSAL_TYPE,
  SWARM_WORKFLOW_SAVE_PROPOSAL_TYPE,
  SWARM_RUN_RESUME_PROPOSAL_TYPE,
  SWARM_WORKFLOWS_OBJECT_ID,
  deriveHelperWidgetCausationState,
  validateSwarmRunProposal,
  buildSwarmRunProposal,
  buildSandboxRowFromSwarmProposal,
  deriveSwarmWorkflowExecutionEligibility,
  upsertSwarmRunRow,
  findSwarmRunRows,
  summarizeSwarmRunProposal,
} = swarmModule;
const { parseOrchestrationGraph, isAgentSwarmGraph, validateAgentSwarmGraph, extractSwarmNodes } = graphModule;
const { WORKSPACE_HELPER_PROPOSAL_TYPES, PROPOSAL_TYPE_TO_PATCH_FIELD, PATCH_ALLOWLIST, validateProposals } = helperModule;
const { KNOWN_SANDBOX_AGENT_HOSTS, validateWorkspaceConfig } = schemaModule;

function intentInput(overrides = {}) {
  return {
    name: "swarm-ui-smoke-test",
    description: "Low-token 8-agent swarm to exercise workflow UI/UX",
    objective: "Exercise the workflow UI with trivial prompts.",
    agents: [
      { role: "Ping", taskPrompt: "Reply with pong.", tools: ["read"], required: true },
      { role: "Echo", taskPrompt: "Echo the input.", required: false, maxTokens: 500, timeoutMs: 9000 },
    ],
    maxConcurrency: 4,
    outcomeCriteria: "Every required agent replies.",
    adapter: "local-intelligence",
    ...overrides,
  };
}

function helperWorkspace(overrides = {}) {
  return {
    dataModel: {
      objects: [
        {
          id: "workspace-helper-sandbox",
          label: "Workspace Helper Sandbox",
          objectType: "sandbox-environment",
          columns: ["Name", "lifecycleStatus", "runLocality", "runtime", "adapter", "agentHost", "timeoutMs"],
          rows: [
            {
              Name: "workspace-helper",
              lifecycleStatus: "live",
              runLocality: "local",
              runtime: "node",
              adapter: "local-agent-host",
              agentHost: "codex_local",
              timeoutMs: "45000",
              ...overrides,
            },
          ],
        },
      ],
    },
  };
}

test("swarm.run.propose builds and validates", () => {
  const proposal = buildSwarmRunProposal(intentInput());
  assert.equal(proposal.type, SWARM_RUN_PROPOSAL_TYPE);
  assert.equal(proposal.affectedField, "dataModel");
  const v = validateSwarmRunProposal(proposal);
  assert.equal(v.ok, true, v.error);
  assert.ok(summarizeSwarmRunProposal(proposal).includes("swarm-ui-smoke-test"));
});

test("invalid proposal type and affectedField reject", () => {
  assert.equal(validateSwarmRunProposal({ type: "agent.run.direct", payload: {} }).ok, false);
  const proposal = buildSwarmRunProposal(intentInput());
  assert.equal(validateSwarmRunProposal({ ...proposal, affectedField: "swarm" }).ok, false);
});

test("missing objective / missing agents / empty roles reject", () => {
  const base = buildSwarmRunProposal(intentInput());
  assert.equal(validateSwarmRunProposal({ ...base, payload: { ...base.payload, objective: "" } }).ok, false);
  assert.equal(validateSwarmRunProposal({ ...base, payload: { ...base.payload, agents: [] } }).ok, false);
  assert.equal(
    validateSwarmRunProposal({ ...base, payload: { ...base.payload, agents: [{ role: "", taskPrompt: "x" }] } }).ok,
    false
  );
  assert.equal(
    validateSwarmRunProposal({ ...base, payload: { ...base.payload, agents: [{ role: "A", taskPrompt: "" }] } }).ok,
    false
  );
});

test("credential-shaped payload fields reject", () => {
  const base = buildSwarmRunProposal(intentInput());
  const poisoned = { ...base, payload: { ...base.payload, apiKey: "sk-test-123" } };
  const v = validateSwarmRunProposal(poisoned);
  assert.equal(v.ok, false);
  assert.match(v.error, /credential/i);
});

test("code-execution adapter rejects; prompt-capable adapters pass", () => {
  const base = buildSwarmRunProposal(intentInput());
  assert.equal(
    validateSwarmRunProposal({ ...base, payload: { ...base.payload, adapter: "local-process" } }).ok,
    false
  );
  assert.equal(
    validateSwarmRunProposal({ ...base, payload: { ...base.payload, adapter: "local-agent-host" } }).ok,
    true
  );
});

test("normalization produces a governed sandbox-environment row with an agent-swarm-v1 graph", () => {
  const proposal = buildSwarmRunProposal(intentInput());
  const row = buildSandboxRowFromSwarmProposal({}, proposal);
  assert.equal(row.objectType, "sandbox-environment");
  assert.equal(row.Name, "swarm-ui-smoke-test");
  assert.equal(row.runLocality, "local");
  assert.equal(row.adapter, "local-intelligence");
  assert.equal(row.status, "untested");
  const graph = parseOrchestrationGraph(row.orchestrationConfig);
  assert.ok(graph, "orchestrationConfig must parse");
  assert.equal(graph.provider, "growthub-native");
  assert.equal(graph.executionMode, "agent-swarm-v1");
  assert.equal(isAgentSwarmGraph(graph), true);
  assert.equal(validateAgentSwarmGraph(graph).ok, true);
  const { orchestrator, subagents, synthesis, swarmConfig } = extractSwarmNodes(graph);
  assert.ok(orchestrator, "graph has thinAdapter orchestrator");
  assert.equal(subagents.length, 2, "graph has ai-agent subagents");
  assert.ok(synthesis, "graph has tool-result synthesis");
  assert.equal(swarmConfig.maxConcurrency, 4);
  // Budgets travel onto subagent configs truthfully
  const echo = subagents.find((n) => n.config.role === "Echo");
  assert.equal(echo.config.required, false);
  assert.equal(echo.config.maxTokens, 500);
  assert.equal(echo.config.timeoutMs, 9000);
  // No credential-bearing fields land on the row
  assert.equal(row.envRefs, "");
  assert.ok(!/"(apiKey|api_key|secret|password|bearerToken)"/i.test(JSON.stringify(row)));
});

test("model-authored graph JSON is not trusted unless it validates as agent-swarm-v1", () => {
  const proposal = buildSwarmRunProposal(intentInput());
  proposal.payload.orchestrationGraph = {
    version: 1,
    provider: "growthub-native",
    executionMode: "agent-swarm-v1",
    nodes: [{ id: "evil", type: "ai-agent", config: { role: "X", taskPrompt: "" } }],
    edges: [],
  };
  const row = buildSandboxRowFromSwarmProposal({}, proposal);
  const graph = parseOrchestrationGraph(row.orchestrationConfig);
  // Invalid hand-authored graph (no orchestrator, empty taskPrompt) was
  // discarded and rebuilt from intent.
  assert.equal(validateAgentSwarmGraph(graph).ok, true);
  assert.ok(graph.nodes.some((n) => n.type === "thinAdapter"));
});

test("unknown agentHost values are dropped, maxConcurrency normalizes", () => {
  const proposal = buildSwarmRunProposal(intentInput({ agentHost: "evil_host", maxConcurrency: -3 }));
  assert.equal(proposal.payload.agentHost, "");
  assert.ok(proposal.payload.maxConcurrency >= 1);
  const known = buildSwarmRunProposal(intentInput({ agentHost: "claude_local" }));
  assert.equal(known.payload.agentHost, "claude_local");
});

test("helper widget causation state gates command and swarm execution", () => {
  const ready = deriveHelperWidgetCausationState(helperWorkspace());
  assert.equal(ready.ready, true, ready.guidance);
  assert.equal(ready.adapter, "local-agent-host");
  assert.equal(ready.agentHost, "codex_local");
  assert.match(ready.guidance, /Helper is live/i);

  const missing = deriveHelperWidgetCausationState(helperWorkspace({ agentHost: "" }));
  assert.equal(missing.ready, false);
  assert.ok(missing.missing.includes("helper agent host"));
  assert.match(missing.guidance, /Set up the live workspace helper/i);
});

test("apply inherits the helper sandbox execution target for agent swarm workflow rows", () => {
  const workspaceConfig = helperWorkspace();
  const proposal = buildSwarmRunProposal(intentInput({ adapter: "local-agent-host", agentHost: "" }));
  const row = buildSandboxRowFromSwarmProposal(workspaceConfig, proposal);
  assert.equal(row.adapter, "local-agent-host");
  assert.equal(row.agentHost, "codex_local");
  assert.equal(row.runLocality, "local");
  assert.equal(row.runtime, "node");
  assert.equal(row.timeoutMs, "45000");
  const graph = parseOrchestrationGraph(row.orchestrationConfig);
  const subagents = extractSwarmNodes(graph).subagents;
  assert.equal(subagents.length, 2);
  assert.deepEqual(
    subagents.map((node) => node.config.agentHost),
    ["codex_local", "codex_local"],
    "the node interface sees the same execution target before Play"
  );
  assert.deepEqual(
    subagents.map((node) => node.config.adapter),
    ["local-agent-host", "local-agent-host"],
    "subagents inherit the same prompt-capable execution adapter"
  );
  const eligibility = deriveSwarmWorkflowExecutionEligibility(row);
  assert.equal(eligibility.ready, true, eligibility.guidance);
  assert.equal(eligibility.agentHost, "codex_local");
  assert.equal(eligibility.adapter, "local-agent-host");

  const config = upsertSwarmRunRow(workspaceConfig, row);
  const object = config.dataModel.objects.find((o) => o.id === SWARM_WORKFLOWS_OBJECT_ID);
  assert.ok(object.columns.includes("agentHost"), "swarm-workflows exposes the execution target column");
  validateWorkspaceConfig({ dataModel: config.dataModel });
});

test("agent-host execution target inheritance is catalog-agnostic", () => {
  for (const host of KNOWN_SANDBOX_AGENT_HOSTS) {
    const workspaceConfig = helperWorkspace({ agentHost: host });
    const proposal = buildSwarmRunProposal(intentInput({ adapter: "local-agent-host", agentHost: "" }));
    const row = buildSandboxRowFromSwarmProposal(workspaceConfig, proposal);
    const graph = parseOrchestrationGraph(row.orchestrationConfig);
    const subagents = extractSwarmNodes(graph).subagents;
    assert.equal(row.adapter, "local-agent-host", host);
    assert.equal(row.agentHost, host, host);
    assert.deepEqual(subagents.map((node) => node.config.agentHost), [host, host], host);
    assert.equal(deriveSwarmWorkflowExecutionEligibility(row).ready, true, host);
  }
});

test("local-intelligence helper target stays runnable without an agent host", () => {
  const workspaceConfig = helperWorkspace({
    adapter: "local-intelligence",
    agentHost: "",
    localModel: "smoke-model",
    localEndpoint: "http://127.0.0.1:11434/v1/chat/completions",
    intelligenceAdapterMode: "ollama",
  });
  const proposal = buildSwarmRunProposal(intentInput({ adapter: "local-agent-host", agentHost: "" }));
  const row = buildSandboxRowFromSwarmProposal(workspaceConfig, proposal);
  const graph = parseOrchestrationGraph(row.orchestrationConfig);
  const subagents = extractSwarmNodes(graph).subagents;
  assert.equal(row.adapter, "local-intelligence");
  assert.equal(row.agentHost, "");
  assert.deepEqual(subagents.map((node) => node.config.adapter), ["local-intelligence", "local-intelligence"]);
  assert.deepEqual(subagents.map((node) => node.config.agentHost), ["", ""]);
  assert.equal(deriveSwarmWorkflowExecutionEligibility(row).ready, true);
});

test("execution eligibility blocks first Play when a swarm row has no runnable target", () => {
  const proposal = buildSwarmRunProposal(intentInput({ adapter: "local-agent-host", agentHost: "" }));
  const row = buildSandboxRowFromSwarmProposal({ dataModel: { objects: [] } }, proposal);
  const eligibility = deriveSwarmWorkflowExecutionEligibility(row);
  assert.equal(eligibility.ready, false);
  assert.ok(eligibility.missing.includes("agent host"));
  assert.match(eligibility.guidance, /agent host/i);
});

test("upsert seeds the swarm-workflows object, de-dupes by Name, preserves run stamps", () => {
  const proposal = buildSwarmRunProposal(intentInput());
  const row = buildSandboxRowFromSwarmProposal({}, proposal);
  const config1 = upsertSwarmRunRow({ dataModel: { objects: [] } }, row);
  const object = config1.dataModel.objects.find((o) => o.id === SWARM_WORKFLOWS_OBJECT_ID);
  assert.ok(object, "well-known swarm-workflows object seeded");
  assert.equal(object.objectType, "sandbox-environment");
  assert.equal(object.rows.length, 1);
  // The merged config passes the same validator the PATCH lane uses.
  validateWorkspaceConfig({ dataModel: config1.dataModel });

  // Simulate a run having stamped the row, then re-apply the same proposal.
  object.rows[0] = { ...object.rows[0], status: "connected", lastRunId: "run_x", lastSourceId: "src_x", lastResponse: "{}" };
  const config2 = upsertSwarmRunRow(config1, buildSandboxRowFromSwarmProposal(config1, proposal));
  const object2 = config2.dataModel.objects.find((o) => o.id === SWARM_WORKFLOWS_OBJECT_ID);
  assert.equal(object2.rows.length, 1, "no uncontrolled duplicates");
  assert.equal(object2.rows[0].status, "connected", "run stamp preserved");
  assert.equal(object2.rows[0].lastRunId, "run_x");
});

test("findSwarmRunRows finds swarm rows across sandbox objects and ignores non-swarm rows", () => {
  const proposal = buildSwarmRunProposal(intentInput());
  const row = buildSandboxRowFromSwarmProposal({}, proposal);
  const config = upsertSwarmRunRow({
    dataModel: {
      objects: [
        {
          id: "other-sandbox",
          label: "Other",
          objectType: "sandbox-environment",
          columns: ["Name"],
          rows: [{ Name: "plain-tool", orchestrationConfig: "" }],
          binding: { mode: "manual", source: "Other" },
        },
      ],
    },
  }, row);
  const found = findSwarmRunRows(config);
  assert.equal(found.length, 1);
  assert.equal(found[0].row.Name, "swarm-ui-smoke-test");
  assert.equal(found[0].objectId, SWARM_WORKFLOWS_OBJECT_ID);
  const byName = findSwarmRunRows(config, { name: "swarm-ui-smoke-test" });
  assert.equal(byName.length, 1);
  assert.equal(findSwarmRunRows(config, { name: "missing" }).length, 0);
});

test("swarm.run.resume validates only against an existing row name", () => {
  assert.equal(
    validateSwarmRunProposal({ type: SWARM_RUN_RESUME_PROPOSAL_TYPE, payload: {} }).ok,
    false
  );
  assert.equal(
    validateSwarmRunProposal({ type: SWARM_RUN_RESUME_PROPOSAL_TYPE, payload: { name: "swarm-ui-smoke-test" } }).ok,
    true
  );
});

test("helper contract routes swarm types to the existing dataModel patch field — no new PATCH field", () => {
  for (const type of [SWARM_RUN_PROPOSAL_TYPE, SWARM_WORKFLOW_SAVE_PROPOSAL_TYPE, SWARM_RUN_RESUME_PROPOSAL_TYPE]) {
    assert.ok(WORKSPACE_HELPER_PROPOSAL_TYPES.includes(type), `${type} registered`);
    assert.equal(PROPOSAL_TYPE_TO_PATCH_FIELD[type], "dataModel");
  }
  assert.deepEqual(PATCH_ALLOWLIST, ["dashboards", "widgetTypes", "canvas", "dataModel"], "allowlist unchanged");
  // validateProposals accepts a swarm proposal and rejects an invented type.
  const ok = validateProposals([buildSwarmRunProposal(intentInput())]);
  assert.equal(ok.valid.length, 1);
  const bad = validateProposals([{ type: "agent.run.direct", payload: {}, affectedField: "dataModel" }]);
  assert.equal(bad.valid.length, 0);
  assert.equal(bad.errors.length, 1);
});
