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
const { deriveCustomModelsState, buildCapabilityManifest, deriveEndpointMode } = await import(
  pathToFileURL(path.join(kitApp, "lib/custom-models-ledger.js")).href
);
const { buildFeatureWorkspaceSeed } = await import(
  pathToFileURL(path.join(repoRoot, "scripts/lib/workspace-feature-seed.mjs")).href
);

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

test("deriver: commandVisible false on empty workspace, true from seed evidence", () => {
  const empty = deriveCustomModelsState({ workspaceConfig: { dataModel: { objects: [] } }, workspaceSourceRecords: {} });
  assert.equal(empty.commandVisible, false);
  assert.equal(empty.available, false);

  const { workspaceConfig, sourceRecords } = buildFeatureWorkspaceSeed({});
  const state = deriveCustomModelsState({ workspaceConfig, workspaceSourceRecords: sourceRecords });
  assert.equal(state.commandVisible, true);
  assert.equal(state.available, true);
});

test("seed model card resolves registry, sandbox, hash, endpoint mode, and complete state", () => {
  const { workspaceConfig, sourceRecords } = buildFeatureWorkspaceSeed({});
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
  const { workspaceConfig, sourceRecords } = buildFeatureWorkspaceSeed({});
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
  const { workspaceConfig, sourceRecords } = buildFeatureWorkspaceSeed({});
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
  const { workspaceConfig, sourceRecords } = buildFeatureWorkspaceSeed({});
  const tricked = JSON.parse(JSON.stringify(workspaceConfig));
  for (const o of tricked.dataModel.objects) if (o.objectType === "sandbox-environment") for (const r of o.rows) if (r.Name === "custom-model-workflow") {
    r.lastResponse = 'the log mentions "ok": true and "exitCode": 0 but this is not JSON{';
  }
  const state = deriveCustomModelsState({ workspaceConfig: tricked, workspaceSourceRecords: sourceRecords });
  assert.equal(state.models[0].evidenceState, "sandbox-ready", "string mentions of ok/exitCode never count; malformed demotes, never throws");
});

test("exact deep links: workflow link carries object, row, and run params", () => {
  const { workspaceConfig, sourceRecords } = buildFeatureWorkspaceSeed({});
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
