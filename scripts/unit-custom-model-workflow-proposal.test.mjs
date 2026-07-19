/**
 * Custom-model workflow proposal lane (CUSTOM_MODEL_WORKFLOW_CONTRACT_V1).
 *
 * Guards: the cockpit's first-utilization actions create REAL governed
 * sandbox-environment rows — the server rebuilds the orchestration graph from
 * evidence (never a client graph), refuses unverified/base-model endpoints,
 * carries a schedule trigger on the recursive training-data loop, and upserts
 * idempotently (no duplicate rows, no history loss).
 *
 * Run with:  node --test scripts/unit-custom-model-workflow-proposal.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kitApp = path.join(repoRoot, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");

const {
  CUSTOM_MODEL_WORKFLOW_PROPOSAL_TYPE,
  CUSTOM_MODEL_WORKFLOW_VARIANTS,
  buildCustomModelWorkflowProposal,
  validateCustomModelWorkflowProposal,
  normalizeCustomModelWorkflowProposal,
  ensureCustomModelWorkflowsObject,
  upsertCustomModelWorkflowRow,
} = await import(pathToFileURL(path.join(kitApp, "lib/custom-model-workflow-proposal.js")).href);
const {
  CUSTOM_MODEL_WORKFLOWS_OBJECT_ID,
  CUSTOM_MODEL_WORKFLOW_TIMEOUT_MS,
  customModelWorkflowRowName,
  deriveCustomModelsState,
  deriveCustomModelFocusActions,
} = await import(
  pathToFileURL(path.join(kitApp, "lib/custom-models-ledger.js")).href
);
const { validateWorkspaceConfig } = await import(
  pathToFileURL(path.join(kitApp, "lib/workspace-schema.js")).href
);
const { buildSuperAdminModelQaSeed } = await import(
  pathToFileURL(path.join(repoRoot, "scripts/lib/super-admin-model-qa-seed.mjs")).href
);

// A verified, complete custom-model workspace — the proven fixture shape from
// unit-custom-models-ledger.test.mjs (bonding requires the training row link +
// the sandbox run proof, not just a registry row).
function verifiedWorkspace() {
  const { workspaceConfig, sourceRecords } = buildSuperAdminModelQaSeed({});
  const objects = workspaceConfig.dataModel.objects;
  const training = objects.find((o) => o.id === "model-training");
  const row = training.rows[0];
  row.localModel = "workspace-local-tuned-v1";
  row.modelVersion = "workspace-local-tuned-v1";
  row.apiRegistryId = "workspace-local-model";
  row.deployedEndpoint = "http://127.0.0.1:11434/v1/chat/completions";
  row.lastSandboxObjectId = "sandbox-probe";
  row.lastSandboxRunId = "run_seed_model_smoke";
  row.lastExportSummary = JSON.stringify({ ...JSON.parse(row.lastExportSummary), registryId: "workspace-local-model" });

  let registry = objects.find((o) => o.objectType === "api-registry");
  if (!registry) { registry = { id: "api-registry", objectType: "api-registry", rows: [] }; objects.push(registry); }
  registry.rows.push({
    integrationId: "workspace-local-model", authRef: "", baseUrl: "http://127.0.0.1:11434/v1",
    endpoint: "/chat/completions", method: "POST", status: "connected", lastTested: "2026-06-10T00:00:00.000Z",
    lastResponse: JSON.stringify({ model: "workspace-local-tuned-v1", choices: [{ message: { content: "ok" } }] }),
    capabilities: "chat-completions", executionLane: "sandbox-local", kind: "custom-model",
  });

  let sandbox = objects.find((o) => o.id === "sandbox-probe");
  if (!sandbox) { sandbox = { id: "sandbox-probe", objectType: "sandbox-environment", rows: [] }; objects.push(sandbox); }
  sandbox.rows.push({
    Name: "custom-model-workflow", schedulerRegistryId: "workspace-local-model", lastRunId: "run_seed_model_smoke",
    lastResponse: JSON.stringify({ ok: true, exitCode: 0, outputHash: "seed-out-7f3a91" }),
    orchestrationConfig: JSON.stringify({ nodes: [{ config: { registryId: "workspace-local-model" } }] }),
  });
  sourceRecords["model-invocation:workspace-local-model:seed"] = {
    records: [{ status: 200, modelVersion: "workspace-local-tuned-v1", note: "completed fixture proof" }],
  };
  return { workspaceConfig, sourceRecords };
}

test("proposal contract: intent-only payload, variant allowlist", () => {
  const p = buildCustomModelWorkflowProposal({ modelId: "workspace-local", variant: "chat" });
  assert.equal(p.type, CUSTOM_MODEL_WORKFLOW_PROPOSAL_TYPE);
  assert.equal(p.affectedField, "dataModel");
  assert.deepEqual(Object.keys(p.payload).sort(), ["modelId", "variant"]);
  assert.equal(validateCustomModelWorkflowProposal(p).ok, true);
  assert.equal(validateCustomModelWorkflowProposal(buildCustomModelWorkflowProposal({ modelId: "x", variant: "bogus" })).ok, false);
  assert.equal(validateCustomModelWorkflowProposal(buildCustomModelWorkflowProposal({ modelId: "", variant: "chat" })).ok, false);
  assert.ok(CUSTOM_MODEL_WORKFLOW_VARIANTS.includes("recursive-learning"));
});

test("normalize: creates a governed sandbox row with a REAL graph, artifact opens the canvas", () => {
  const { workspaceConfig, sourceRecords } = verifiedWorkspace();
  const proposal = buildCustomModelWorkflowProposal({ modelId: "workspace-local", variant: "chat" });
  const result = normalizeCustomModelWorkflowProposal(proposal, workspaceConfig, sourceRecords);
  assert.equal(result.ok, true, result.error);
  assert.equal(result.artifact.objectId, CUSTOM_MODEL_WORKFLOWS_OBJECT_ID);
  const rowName = customModelWorkflowRowName({ id: "workspace-local" }, "chat");
  assert.equal(result.artifact.rowName, rowName);

  const obj = result.config.dataModel.objects.find((o) => o.id === CUSTOM_MODEL_WORKFLOWS_OBJECT_ID);
  assert.ok(obj, "custom-model-workflows object created");
  const row = obj.rows.find((r) => r.Name === rowName);
  assert.ok(row, "row created");
  const graph = JSON.parse(row.orchestrationConfig);
  assert.equal(row.timeoutMs, String(CUSTOM_MODEL_WORKFLOW_TIMEOUT_MS), "row allows bounded cold model loading");
  assert.ok(graph.nodes.some((n) => n.type === "input"), "has input node");
  assert.ok(graph.nodes.some((n) => n.type === "api-registry-call" && n.config.registryId === "workspace-local-model"), "model-call bound to registry");
  assert.ok(graph.nodes.filter((n) => n.type === "api-registry-call").every((n) => n.config.timeoutMs === CUSTOM_MODEL_WORKFLOW_TIMEOUT_MS), "every model-call shares the row timeout invariant");
  assert.ok(graph.nodes.some((n) => n.type === "tool-result"), "has terminal write");
  assert.ok(graph.edges.length >= 2, "wired edges");
  // The created config still validates as a governed workspace (throws on invalid).
  assert.doesNotThrow(() => validateWorkspaceConfig(result.config));
});

test("normalize: no schedule trigger is attached (scheduler rolled back)", () => {
  const { workspaceConfig, sourceRecords } = verifiedWorkspace();
  const result = normalizeCustomModelWorkflowProposal(
    buildCustomModelWorkflowProposal({ modelId: "workspace-local", variant: "recursive-learning" }),
    workspaceConfig, sourceRecords,
  );
  assert.equal(result.ok, true, result.error);
  const obj = result.config.dataModel.objects.find((o) => o.id === CUSTOM_MODEL_WORKFLOWS_OBJECT_ID);
  const row = obj.rows.find((r) => r.Name === customModelWorkflowRowName({ id: "workspace-local" }, "recursive-learning"));
  assert.ok(!row.schedulerCron, "no schedule trigger — scheduler action rolled back");
});

test("normalize: refuses an unverified endpoint (no base-model workflow can bind)", () => {
  const { workspaceConfig, sourceRecords } = verifiedWorkspace();
  // Demote the served tag so verification fails.
  for (const o of workspaceConfig.dataModel.objects) {
    if (o.objectType !== "api-registry") continue;
    for (const r of o.rows) if (r.integrationId === "workspace-local-model") {
      r.lastResponse = JSON.stringify({ model: "gemma3:4b", choices: [{ message: { content: "base" } }] });
    }
  }
  const result = normalizeCustomModelWorkflowProposal(
    buildCustomModelWorkflowProposal({ modelId: "workspace-local", variant: "chat" }),
    workspaceConfig, sourceRecords,
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /no real serving route/i);
});

test("upsert is idempotent — re-creating a workflow does not duplicate rows or lose history", () => {
  const { workspaceConfig, sourceRecords } = verifiedWorkspace();
  const once = normalizeCustomModelWorkflowProposal(
    buildCustomModelWorkflowProposal({ modelId: "workspace-local", variant: "chat" }),
    workspaceConfig, sourceRecords,
  );
  // Stamp a run-history marker as if it had executed.
  let cfg = once.config;
  const obj0 = cfg.dataModel.objects.find((o) => o.id === CUSTOM_MODEL_WORKFLOWS_OBJECT_ID);
  const rowName = customModelWorkflowRowName({ id: "workspace-local" }, "chat");
  obj0.rows.find((r) => r.Name === rowName).lastRunId = "run_alpha";
  const twice = normalizeCustomModelWorkflowProposal(
    buildCustomModelWorkflowProposal({ modelId: "workspace-local", variant: "chat" }),
    cfg, sourceRecords,
  );
  const obj = twice.config.dataModel.objects.find((o) => o.id === CUSTOM_MODEL_WORKFLOWS_OBJECT_ID);
  const rows = obj.rows.filter((r) => r.Name === rowName);
  assert.equal(rows.length, 1, "no duplicate row");
  assert.equal(rows[0].lastRunId, "run_alpha", "run history preserved");
});

test("model-scoped identities: the same workflow variant cannot collide across models", () => {
  const { workspaceConfig, sourceRecords } = verifiedWorkspace();
  const objects = workspaceConfig.dataModel.objects;
  const training = objects.find((object) => object.id === "model-training");
  training.rows.push({
    ...training.rows[0],
    Name: "support-specialist",
    localModel: "support-specialist-v2",
    modelVersion: "support-specialist-v2",
    apiRegistryId: "support-specialist-api",
    lastExportSummary: JSON.stringify({ registryId: "support-specialist-api" }),
    lastSandboxObjectId: "support-specialist-proof",
    lastSandboxRunId: "run_support_smoke",
  });
  const registry = objects.find((object) => object.objectType === "api-registry");
  registry.rows.push({
    ...registry.rows.find((row) => row.integrationId === "workspace-local-model"),
    integrationId: "support-specialist-api",
    expectedModelTag: "support-specialist-v2",
    lastResponse: JSON.stringify({ model: "support-specialist-v2", choices: [{ message: { content: "ok" } }] }),
  });
  const sandbox = objects.find((object) => object.id === "sandbox-probe");
  sandbox.rows.push({
    ...sandbox.rows[0],
    Name: "support-specialist-proof",
    schedulerRegistryId: "support-specialist-api",
    lastRunId: "run_support_smoke",
    orchestrationConfig: JSON.stringify({ nodes: [{ config: { registryId: "support-specialist-api" } }] }),
  });
  sourceRecords["model-invocation:support-specialist-api:seed"] = {
    records: [{ status: 200, modelVersion: "support-specialist-v2" }],
  };

  const first = normalizeCustomModelWorkflowProposal(
    buildCustomModelWorkflowProposal({ modelId: "workspace-local", variant: "chat" }),
    workspaceConfig,
    sourceRecords,
  );
  assert.equal(first.ok, true, first.error);
  const second = normalizeCustomModelWorkflowProposal(
    buildCustomModelWorkflowProposal({ modelId: "support-specialist", variant: "chat" }),
    first.config,
    sourceRecords,
  );
  assert.equal(second.ok, true, second.error);

  const rows = second.config.dataModel.objects
    .find((object) => object.id === CUSTOM_MODEL_WORKFLOWS_OBJECT_ID).rows;
  const workspaceRow = rows.find((row) => row.Name === "custom-model-workspace-local-chat");
  const supportRow = rows.find((row) => row.Name === "custom-model-support-specialist-chat");
  assert.ok(workspaceRow);
  assert.ok(supportRow);
  assert.notEqual(workspaceRow.Name, supportRow.Name);
  assert.equal(workspaceRow.customModelId, "workspace-local");
  assert.equal(supportRow.customModelId, "support-specialist");
  assert.equal(supportRow.servingRegistryId, "support-specialist-api");
});

test("focus actions: causation modes — create when absent, open when present, blocked when unverified", () => {
  const { workspaceConfig, sourceRecords } = verifiedWorkspace();
  const state = deriveCustomModelsState({ workspaceConfig, workspaceSourceRecords: sourceRecords });
  const model = state.models.find((m) => m.id === "workspace-local");

  // A single focused action; before any workflow exists → "create".
  const before = deriveCustomModelFocusActions(model, { workspaceConfig });
  assert.deepEqual(before.map((a) => a.id), ["open-in-canvas"]);
  assert.equal(before[0].mode, "create", "create when absent");

  // After creating the chat workflow → the action flips to "open".
  const created = normalizeCustomModelWorkflowProposal(
    buildCustomModelWorkflowProposal({ modelId: "workspace-local", variant: "chat" }),
    workspaceConfig, sourceRecords,
  ).config;
  const after = deriveCustomModelFocusActions(model, { workspaceConfig: created });
  assert.equal(after.find((a) => a.id === "open-in-canvas").mode, "open");

  // Unverified model → blocked (no fake enablement).
  const blocked = deriveCustomModelFocusActions({ ...model, verificationStatus: "unverified" }, { workspaceConfig });
  assert.ok(blocked.every((a) => a.mode === "blocked" && !a.enabled));
});
