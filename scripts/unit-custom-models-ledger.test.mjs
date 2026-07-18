/**
 * Custom Models ledger — /custom-models command gating + pure deriver.
 *
 * Guards: evidence-derived command visibility (never hardcoded), read-only
 * command contract, model-card derivation built on the training-ledger
 * evidence engine (shared demotion semantics), secret-free capability
 * manifests, and non-destructive action contracts.
 *
 * Run with:  node --test scripts/unit-custom-models-ledger.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kitApp = path.join(repoRoot, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");

const { HELPER_COMMANDS, deriveVisibleHelperCommands, parseSlashInput, isGovernedHelperCommand } = await import(
  pathToFileURL(path.join(kitApp, "app/data-model/components/helper-commands.js")).href
);
const { deriveCustomModelsState, buildCapabilityManifest, deriveEndpointMode, deriveCustomModelNodeTemplate, deriveCustomModelSuggestedActions, deriveCustomModelCockpit, buildSyntheticTraceProvenance, buildCustomModelWorkflowVariants, buildCustomModelSandboxRow } = await import(
  pathToFileURL(path.join(kitApp, "lib/custom-models-ledger.js")).href
);
const { buildSuperAdminModelQaSeed } = await import(
  pathToFileURL(path.join(repoRoot, "scripts/lib/super-admin-model-qa-seed.mjs")).href
);
const { buildFeatureWorkspaceSeed } = await import(
  pathToFileURL(path.join(repoRoot, "scripts/lib/workspace-feature-seed.mjs")).href
);

function buildCompletedModelWorkspace() {
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
  row.lastExportSummary = JSON.stringify({
    ...JSON.parse(row.lastExportSummary),
    registryId: "workspace-local-model",
  });

  let registry = objects.find((o) => o.objectType === "api-registry");
  if (!registry) {
    registry = { id: "api-registry", objectType: "api-registry", rows: [] };
    objects.push(registry);
  }
  registry.rows.push({
    integrationId: "workspace-local-model",
    authRef: "",
    baseUrl: "http://127.0.0.1:11434/v1",
    endpoint: "/chat/completions",
    method: "POST",
    status: "connected",
    lastTested: "2026-06-10T00:00:00.000Z",
    lastResponse: JSON.stringify({
      model: "workspace-local-tuned-v1",
      choices: [{ message: { content: "completed model fixture" } }],
    }),
    capabilities: "chat-completions",
    executionLane: "sandbox-local",
    kind: "custom-model",
  });

  let sandbox = objects.find((o) => o.id === "sandbox-probe");
  if (!sandbox) {
    sandbox = { id: "sandbox-probe", objectType: "sandbox-environment", rows: [] };
    objects.push(sandbox);
  }
  sandbox.rows.push({
    Name: "custom-model-workflow",
    schedulerRegistryId: "workspace-local-model",
    lastRunId: "run_seed_model_smoke",
    lastResponse: JSON.stringify({ ok: true, exitCode: 0, outputHash: "seed-out-7f3a91" }),
    orchestrationConfig: JSON.stringify({ nodes: [{ config: { registryId: "workspace-local-model" } }] }),
  });
  sourceRecords["model-invocation:workspace-local-model:seed"] = {
    records: [{ status: 200, modelVersion: "workspace-local-tuned-v1", note: "completed fixture proof" }],
  };
  return { workspaceConfig, sourceRecords };
}

test("/custom-models is registered read-only, governed, and evidence-gated", () => {
  const cmd = HELPER_COMMANDS.find((c) => c.name === "/custom-models");
  assert.ok(cmd, "command present");
  assert.equal(cmd.mutates, false);
  assert.equal(cmd.view, "custom-models");
  assert.equal(cmd.intent, undefined);
  assert.equal(cmd.promptTemplate, undefined);
  assert.equal(cmd.requiresEvidence, "custom-models");
  assert.equal(isGovernedHelperCommand(cmd).ok, true);
});

test("command hidden without evidence, visible with it; other commands unaffected", () => {
  const hidden = deriveVisibleHelperCommands(HELPER_COMMANDS, { "custom-models": false }).map((c) => c.name);
  assert.ok(!hidden.includes("/custom-models"));
  assert.ok(hidden.includes("/training") && hidden.includes("/workflows") && hidden.includes("/swarm"));
  const shown = deriveVisibleHelperCommands(HELPER_COMMANDS, { "custom-models": true }).map((c) => c.name);
  assert.ok(shown.includes("/custom-models"));

  const visibleSet = new Set(hidden);
  const slash = parseSlashInput("/custom", visibleSet);
  assert.equal(slash.matches.find((c) => c.name === "/custom-models"), undefined, "slash menu respects the gate");
});

test("deriver: commandVisible false on empty/export-only workspace, true from completed model evidence", () => {
  const empty = deriveCustomModelsState({ workspaceConfig: { dataModel: { objects: [] } }, workspaceSourceRecords: {} });
  assert.equal(empty.commandVisible, false);
  assert.equal(empty.available, false);

  const { workspaceConfig, sourceRecords } = buildSuperAdminModelQaSeed({});
  const exportOnly = deriveCustomModelsState({ workspaceConfig, workspaceSourceRecords: sourceRecords });
  assert.equal(exportOnly.commandVisible, false);
  assert.equal(exportOnly.available, false);

  const completed = buildCompletedModelWorkspace();
  const state = deriveCustomModelsState({ workspaceConfig: completed.workspaceConfig, workspaceSourceRecords: completed.sourceRecords });
  assert.equal(state.commandVisible, true);
  assert.equal(state.available, true);
});

test("completed model card resolves registry, sandbox, hash, endpoint mode, and complete state", () => {
  const { workspaceConfig, sourceRecords } = buildCompletedModelWorkspace();
  const state = deriveCustomModelsState({ workspaceConfig, workspaceSourceRecords: sourceRecords });
  const model = state.models.find((m) => m.id === "workspace-local");
  assert.ok(model);
  assert.equal(model.apiRegistryId, "workspace-local-model");
  assert.equal(model.endpointMode, "local");
  assert.equal(model.lastSandboxObjectId, "sandbox-probe");
  assert.equal(model.lastSandboxRunId, "run_seed_model_smoke");
  assert.equal(model.modelOutputHash, "seed-out-7f3a91", "REAL output hash from run proof");
  assert.ok(model.snippetHash, "snippet digest present and separately named");
  assert.equal(model.evidenceState, "complete");
  assert.equal(model.nextAction, "Run again");
  assert.equal(model.canTest, true);
  assert.ok(state.filters.endpointModes.includes("local"));
});

test("base-model response demotes; failed run demotes; row claims never verify", () => {
  const { workspaceConfig, sourceRecords } = buildCompletedModelWorkspace();
  const base = JSON.parse(JSON.stringify(workspaceConfig));
  for (const o of base.dataModel.objects) if (o.objectType === "api-registry") for (const r of o.rows) if (r.integrationId === "workspace-local-model") r.lastResponse = String(r.lastResponse).replaceAll("workspace-local-tuned-v1", "gemma3:4b");
  const demoted = deriveCustomModelsState({ workspaceConfig: base, workspaceSourceRecords: sourceRecords });
  assert.equal(demoted.models.find((m) => m.id === "workspace-local").evidenceState, "deployed", "base tag never verifies");

  const failedRun = JSON.parse(JSON.stringify(workspaceConfig));
  for (const o of failedRun.dataModel.objects) if (o.objectType === "sandbox-environment") for (const r of o.rows) if (r.Name === "custom-model-workflow") r.lastResponse = JSON.stringify({ ok: false, exitCode: 1, error: "connection refused" });
  const sandboxOnly = deriveCustomModelsState({ workspaceConfig: failedRun, workspaceSourceRecords: sourceRecords });
  assert.equal(sandboxOnly.models.find((m) => m.id === "workspace-local").evidenceState, "sandbox-ready", "failed run demotes complete");
});

test("capability manifest is deterministic, complete, and secret-free", () => {
  const { workspaceConfig, sourceRecords } = buildCompletedModelWorkspace();
  const state = deriveCustomModelsState({ workspaceConfig, workspaceSourceRecords: sourceRecords });
  const manifest = buildCapabilityManifest(state.models[0], { workspaceConfig });
  assert.equal(manifest.schema, "growthub-custom-model-capability-v1");
  assert.equal(manifest.apiRegistryId, "workspace-local-model");
  assert.equal(manifest.requestContract.endpoint, "/chat/completions");
  assert.equal(manifest.requestContract.authRef, "", "authRef name only — never a secret value");
  assert.equal(manifest.sdk.capabilityName, "workspaceLocalModel");
  const raw = JSON.stringify(manifest);
  for (const pat of [/sk-[A-Za-z0-9]{8}/, /ghp_/, /Bearer\s+\S{10}/, /password/i, /secret/i]) {
    assert.ok(!pat.test(raw), `manifest free of ${pat}`);
  }
});

test("endpoint mode derivation: local vs hosted vs serverless vs unknown", () => {
  assert.equal(deriveEndpointMode({ baseUrl: "http://127.0.0.1:11434/v1" }), "local");
  assert.equal(deriveEndpointMode({ baseUrl: "https://models.example.com" }), "hosted");
  assert.equal(deriveEndpointMode({ baseUrl: "http://10.0.0.5", executionLane: "sandbox-serverless" }), "serverless");
  assert.equal(deriveEndpointMode(null), "unknown");
});

test("generic chat-completions registry row alone never exposes /custom-models", () => {
  const cfg = { dataModel: { objects: [
    { objectType: "api-registry", rows: [{ integrationId: "some-llm-proxy", capabilities: "chat-completions", baseUrl: "https://api.example.com" }] },
  ] } };
  const state = deriveCustomModelsState({ workspaceConfig: cfg, workspaceSourceRecords: {} });
  assert.equal(state.commandVisible, false, "untagged, unbonded chat row is not custom-model evidence");
});

test("regex false-positive cannot mark a run complete — proof is parsed, malformed demotes", () => {
  const { workspaceConfig, sourceRecords } = buildCompletedModelWorkspace();
  const tricked = JSON.parse(JSON.stringify(workspaceConfig));
  for (const o of tricked.dataModel.objects) if (o.objectType === "sandbox-environment") for (const r of o.rows) if (r.Name === "custom-model-workflow") {
    r.lastResponse = 'the log mentions "ok": true and "exitCode": 0 but this is not JSON{';
  }
  const state = deriveCustomModelsState({ workspaceConfig: tricked, workspaceSourceRecords: sourceRecords });
  assert.equal(state.models[0].evidenceState, "sandbox-ready", "string mentions of ok/exitCode never count; malformed demotes, never throws");
});

test("exact deep links: workflow link carries object, row, and run params", () => {
  const { workspaceConfig, sourceRecords } = buildCompletedModelWorkspace();
  const state = deriveCustomModelsState({ workspaceConfig, workspaceSourceRecords: sourceRecords });
  const links = state.models[0].links;
  assert.equal(links.workflow, "/workflows?object=sandbox-probe&row=custom-model-workflow&run=run_seed_model_smoke");
  assert.equal(links.training, "/training");
});

test("scale: 25 models derive and filter correctly", () => {
  const objects = [
    { objectType: "model-training", rows: Array.from({ length: 25 }, (_, i) => ({
      Name: `model-${i}`, localModel: `tuned-${i}`, lastExportId: `e${i}`,
      lastExportSummary: JSON.stringify({ registryId: i % 2 ? `reg-${i}` : "" }),
    })) },
    { objectType: "api-registry", rows: Array.from({ length: 12 }, (_, i) => ({ integrationId: `reg-${i * 2 + 1}`, baseUrl: i % 2 ? "https://m.example.com" : "http://127.0.0.1:11434/v1" })) },
  ];
  const state = deriveCustomModelsState({ workspaceConfig: { dataModel: { objects } }, workspaceSourceRecords: {} });
  assert.equal(state.models.length, 25);
  assert.ok(state.filters.endpointModes.length >= 2, "local + hosted + unknown modes derived");
  const local = state.models.filter((m) => m.endpointMode === "local");
  assert.ok(local.length > 0 && local.length < 25, "mode filter partitions the set");
});


test("original feature seed stays pristine — no model/training contamination", () => {
  const base = buildFeatureWorkspaceSeed({});
  const types = base.workspaceConfig.dataModel.objects.map((o) => o.objectType);
  assert.ok(!types.includes("model-training"), "original seed has no model-training object");
  assert.ok(!base.workspaceConfig.dataModel.objects.some((o) => o.id === "training-traces"), "original seed has no traces object");
  const regIds = base.workspaceConfig.dataModel.objects.filter((o) => o.objectType === "api-registry").flatMap((o) => o.rows).map((r) => r.integrationId);
  assert.ok(!regIds.includes("workspace-local-model"), "original registry rows untouched");
  assert.ok(!Object.keys(base.sourceRecords).some((k) => k.startsWith("training:") || k.startsWith("model-invocation:")), "original sidecar untouched");
  // And the QA clone never mutates the original module state:
  buildSuperAdminModelQaSeed({});
  const again = buildFeatureWorkspaceSeed({});
  assert.equal(again.workspaceConfig.dataModel.objects.length, base.workspaceConfig.dataModel.objects.length, "composing the QA seed leaves the original builder unchanged");
});

// --------------------------------------------------------------------------
// Post-training utilization — node template + suggested actions (3rd pass)
// --------------------------------------------------------------------------

test("node template: unverified model cannot be inserted; verified yields a clean api-registry node", () => {
  const unverified = deriveCustomModelNodeTemplate({ apiRegistryId: "gh-model", verificationStatus: "unverified", localModel: "gh-v1" }, { workspaceConfig: { dataModel: { objects: [] } } });
  assert.equal(unverified.ready, false);
  assert.match(unverified.blockedReason, /not verified/);
  const ws = { dataModel: { objects: [{ objectType: "api-registry", rows: [{ integrationId: "gh-model", baseUrl: "http://127.0.0.1:11434/v1", authRef: "" }] }] } };
  const verified = deriveCustomModelNodeTemplate({ apiRegistryId: "gh-model", verificationStatus: "verified", localModel: "gh-v1", name: "workspace-local", lastResponseModel: "gh-v1", modelOutputHash: "oh_1" }, { workspaceConfig: ws });
  assert.equal(verified.ready, true);
  assert.equal(verified.node.type, "api-registry-chat-completion");
  assert.equal(verified.node.runLocality, "local");
  assert.equal(verified.node.provenance.servedTag, "gh-v1");
  assert.ok(!JSON.stringify(verified.node).includes("secret"), "node carries authRef NAME only, no secret value");
});

test("suggested actions: gated by evidence; synthetic data is provenance-safe + review-gated", () => {
  const ws = { dataModel: { objects: [{ objectType: "api-registry", rows: [{ integrationId: "gh-model", baseUrl: "http://127.0.0.1:11434/v1" }] }] } };
  const s = deriveCustomModelSuggestedActions({ apiRegistryId: "gh-model", verificationStatus: "verified", evidenceState: "verified", name: "workspace-local", localModel: "gh-v1" }, { workspaceConfig: ws });
  const byId = Object.fromEntries(s.actions.map((a) => [a.id, a]));
  assert.equal(byId["use-in-workflow"].enabled, true, "verified → workflow node enabled");
  assert.equal(byId["synthetic-data-scaling"].enabled, false, "not complete → synthetic scaling blocked");
  assert.match(byId["synthetic-data-scaling"].blockedReason, /proven run|outputHash/);
  // Every action carries the checklist grammar + a real closed loop.
  for (const a of s.actions) for (const k of ["title", "whyNow", "blockedReason", "openHref", "orchestrationConfig", "sandboxRow", "proofProduced"]) assert.ok(k in a, `${a.id} has ${k}`);
  // Synthetic provenance never blurs real vs generated.
  const prov = buildSyntheticTraceProvenance({ apiRegistryId: "gh-model", name: "workspace-local" }).provenance;
  assert.equal(prov.synthetic, true); assert.equal(prov.generated, true);
  assert.equal(prov.accepted, false); assert.equal(prov.qualityStatus, "ungraded"); assert.equal(prov.redactionStatus, "pending");
});

// --------------------------------------------------------------------------
// Reuse-this-model actions are REAL closed loops (not links): each variant is a
// complete, canvas-openable orchestration graph wiring the deployed model, with
// variant-specific semantics + honest gating.
// --------------------------------------------------------------------------

function modelFixture(over = {}) {
  return { name: "workspace-local-v1", localModel: "workspace-local-tuned-v1", baseModel: "gemma3", apiRegistryId: "workspace-local-model", verificationStatus: "verified", evidenceState: "verified", lastResponseModel: "workspace-local-tuned-v1", ...over };
}
const wsWithReg = { dataModel: { objects: [{ objectType: "api-registry", rows: [{ integrationId: "workspace-local-model", baseUrl: "http://127.0.0.1:11434/v1", endpoint: "/chat/completions", method: "POST" }] }] } };

function assertClosedLoop(cfg, { modelNodeId }) {
  assert.ok(cfg && Array.isArray(cfg.nodes) && Array.isArray(cfg.edges), "graph has nodes+edges");
  assert.ok(cfg.nodes.some((n) => n.type === "input"), "has an input node");
  const modelNodes = cfg.nodes.filter((n) => n.type === "api-registry-call");
  assert.ok(modelNodes.length >= 1, "has a model-call node");
  // every model-call is bound to the model's api-registry row (no fake/hardcoded)
  for (const mn of modelNodes) assert.equal(mn.config.integrationId, "workspace-local-model", "model-call bound to the registry row");
  assert.ok(cfg.nodes.some((n) => n.type === "tool-result"), "has a terminal write/result node");
  // edges connect input → … → terminal (a real loop, not orphan nodes)
  const froms = new Set(cfg.edges.map((e) => e.from)); const tos = new Set(cfg.edges.map((e) => e.to));
  assert.ok(froms.has("input"), "input is wired out");
  assert.ok(cfg.nodes.every((n) => n.id === "input" || tos.has(n.id) || froms.has(n.id)), "no orphan nodes");
  if (modelNodeId) assert.ok(cfg.nodes.some((n) => n.id === modelNodeId), `has node ${modelNodeId}`);
}

test("workflow variants: every variant is a valid closed loop bound to the model", () => {
  const v = buildCustomModelWorkflowVariants(modelFixture(), { workspaceConfig: wsWithReg });
  assert.deepEqual(Object.keys(v).sort(), ["agentic", "chat", "eval-vs-base", "recursive-learning", "synthetic-scaling"]);
  for (const key of Object.keys(v)) assertClosedLoop(v[key], {});
});

test("workflow variants: recursive-learning feeds graded traces back into the corpus", () => {
  const v = buildCustomModelWorkflowVariants(modelFixture(), { workspaceConfig: wsWithReg });
  const cfg = v["recursive-learning"];
  assert.ok(cfg.nodes.some((n) => n.id === "self-grade"), "has a self-grade node");
  const write = cfg.nodes.find((n) => n.type === "tool-result");
  assert.match(String(write.config.sourceRecordId), /training:model-training/, "writes back to training-traces");
  assert.equal(write.config.outputMode, "training-trace");
});

test("workflow variants: synthetic-scaling is provenance-safe (synthetic, ungraded, unaccepted)", () => {
  const v = buildCustomModelWorkflowVariants(modelFixture(), { workspaceConfig: wsWithReg });
  const write = v["synthetic-scaling"].nodes.find((n) => n.type === "tool-result");
  assert.equal(write.config.provenance.synthetic, true);
  assert.equal(write.config.provenance.accepted, false);
  assert.equal(write.config.provenance.qualityStatus, "ungraded");
});

test("workflow variants: agentic is loopback-only with browser-use; eval calls BOTH tuned and base", () => {
  const v = buildCustomModelWorkflowVariants(modelFixture(), { workspaceConfig: wsWithReg });
  const agent = v.agentic.nodes.find((n) => n.type === "api-registry-call");
  assert.equal(agent.config.networkPolicy, "loopback-only");
  assert.equal(agent.config.permissions.browserUse, true);
  const evalCalls = v["eval-vs-base"].nodes.filter((n) => n.type === "api-registry-call");
  assert.equal(evalCalls.length, 2, "tuned + base");
  assert.ok(evalCalls.some((n) => n.id === "tuned") && evalCalls.some((n) => n.id === "base"));
});

test("suggested actions: each carries a real config + canvas deep-link + sandbox row; gating is honest", () => {
  const actions = deriveCustomModelSuggestedActions(modelFixture({ evidenceState: "verified" }), { workspaceConfig: wsWithReg }).actions;
  assert.equal(actions.length, 5);
  for (const a of actions) {
    assert.ok(a.orchestrationConfig && a.orchestrationConfig.nodes.length >= 3, `${a.id} has a real config`);
    assert.match(a.openHref, /^\/workflows\?object=custom-model-.*&row=custom-model-/, `${a.id} opens the canvas on its config`);
    assert.ok(a.sandboxRow && a.sandboxRow.orchestrationConfig, `${a.id} creates a governed sandbox row`);
    assert.equal(a.applyIntent, "create_sandbox_workflow");
  }
  // synthetic-scaling stays blocked until the model is complete (not just verified)
  const synthetic = actions.find((a) => a.id === "synthetic-data-scaling");
  assert.equal(synthetic.enabled, false, "synthetic scaling blocked until complete");
  // unverified model → the verify-gated actions are blocked
  const unverified = deriveCustomModelSuggestedActions(modelFixture({ verificationStatus: "unverified", evidenceState: "deployed" }), { workspaceConfig: wsWithReg }).actions;
  assert.equal(unverified.find((a) => a.id === "use-in-workflow").enabled, false);
});

test("cockpit view-model: status + governed config are real and demotion-safe", () => {
  const { workspaceConfig, sourceRecords } = buildCompletedModelWorkspace();
  const state = deriveCustomModelsState({ workspaceConfig, workspaceSourceRecords: sourceRecords });
  const model = state.models.find((m) => m.id === "workspace-local");
  const cockpit = deriveCustomModelCockpit(model, { workspaceConfig, workspaceSourceRecords: sourceRecords });

  // Health mirrors the ledger's complete state — no fabricated status.
  assert.equal(cockpit.health.label, "Healthy");
  assert.equal(cockpit.health.tone, "ok");

  // No fabricated telemetry tiles — eval%/latency/uptime are not governed, so
  // they are not surfaced.
  assert.equal(cockpit.tiles, undefined);
  assert.equal(cockpit.ladder, undefined);

  // Governed config surfaced as canvas-style fields, reflecting the registry row.
  const cfg = Object.fromEntries(cockpit.settingsFields.map((f) => [f.key, f]));
  assert.equal(cfg.baseUrl.value, "http://127.0.0.1:11434/v1");
  assert.equal(cfg.endpoint.value, "/chat/completions");
  assert.equal(cfg.method.value, "POST");
  assert.equal(cfg.method.kind, "select");
  assert.equal(cfg.endpointMode.kind, "select");
  assert.ok(cockpit.registryBound);
  // Never leaks a secret value — authRef is a NAME reference only.
  assert.equal(cfg.authRef.value, "");

  // Real proof carried through, not invented.
  assert.equal(cockpit.outputHash, "seed-out-7f3a91");
  assert.ok(cockpit.invocations.length >= 1, "invocation receipts counted from governed source records");
});

test("cockpit view-model: an unverified/recorded model is honest — muted status, no registry binding, no served tag", () => {
  const model = modelFixture({ verificationStatus: "unverified", evidenceState: "recorded", apiRegistryId: "", lastVerifiedAt: "", lastResponseModel: "" });
  const cockpit = deriveCustomModelCockpit(model, { workspaceConfig: { dataModel: { objects: [] } }, workspaceSourceRecords: {} });
  assert.equal(cockpit.health.label, "Recorded");
  assert.notEqual(cockpit.health.tone, "ok");
  assert.equal(cockpit.registryBound, false);
  assert.equal(cockpit.served, "", "no fabricated served tag");
  assert.equal(cockpit.outputHash, "", "no fabricated proof hash");
});
