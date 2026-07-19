/**
 * Training ledger — registry entry + pure eligibility driver invariants.
 *
 * Guards the /training slash command (same single-entry contract as /swarm
 * and /workflows) and the deterministic ledger derivation:
 *   - /training is read-only: view switch only, no intent, no prompt seed,
 *     no patch/execute surface
 *   - the deriver is a pure causation driver: workspace evidence in,
 *     low-entropy eligibility out (blocked → eligible → complete)
 *   - export claims are only complete when the row's lastExportId matches
 *     a record in the training:* sidecar entry at lastSourceId; claims
 *     without sidecar evidence surface as missing, never as complete
 *   - the feature seed materializes a ledger the deriver scores exported
 *     with evidence linked, without fake tuned-model proof
 *
 * Run with:  node --test scripts/unit-training-ledger.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kitApp = path.join(
  repoRoot,
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace",
);

const { HELPER_COMMANDS, HELPER_COMMAND_ALLOWED_KEYS } = await import(
  pathToFileURL(path.join(kitApp, "app/data-model/components/helper-commands.js")).href
);
const {
  deriveTrainingLedgerState,
  deriveDistillationPipelineState,
  deriveTrainingHandoffState,
  deriveHandoffRecovery,
  parseExportSummary,
  TRAINING_OBJECT_TYPE,
  MIN_FINETUNE_TRACES,
} = await import(
  pathToFileURL(path.join(kitApp, "lib/training-ledger.js")).href
);
const { TRAINING_OBJECT, TRAINING_EXPORT_SUMMARY, buildSuperAdminModelQaSeed } = await import(
  pathToFileURL(path.join(repoRoot, "scripts/lib/super-admin-model-qa-seed.mjs")).href
);
const { buildFeatureWorkspaceSeed } = await import(
  pathToFileURL(path.join(repoRoot, "scripts/lib/workspace-feature-seed.mjs")).href
);

function configWithRows(rows) {
  return { dataModel: { objects: [{ objectType: TRAINING_OBJECT_TYPE, rows }] } };
}

const CLAIM_ROW = {
  Name: "workspace-local",
  localModel: "gemma3:4b",
  lastExportAt: "2026-06-10T00:00:00.000Z",
  lastExportId: "exp_1",
  lastSourceId: "training:model-training:workspace-local",
  lastExportSummary: JSON.stringify({ recordCount: 3, surfaces: { helper: 3 }, escalations: 0 }),
};

test("/training is registered read-only with a view switch and nothing else", () => {
  const cmd = HELPER_COMMANDS.find((c) => c.name === "/training");
  assert.ok(cmd, "/training present in registry");
  assert.equal(cmd.mutates, false);
  assert.equal(cmd.view, "training");
  assert.equal(cmd.intent, undefined, "read-only command must not seed an intent");
  assert.equal(cmd.promptTemplate, undefined, "read-only command must not seed a prompt");
  for (const key of Object.keys(cmd)) {
    assert.ok(HELPER_COMMAND_ALLOWED_KEYS.includes(key), `${key} is an allowed command key`);
  }
});

test("deriver blocked with no ledger object and no source records", () => {
  const blocked = deriveTrainingLedgerState({ workspaceConfig: { dataModel: { objects: [] } }, workspaceSourceRecords: {} });
  assert.equal(blocked.present, false);
  assert.equal(blocked.eligibility.state, "blocked");
});

test("deriver eligible with ledger row but no export claim", () => {
  const state = deriveTrainingLedgerState({
    workspaceConfig: configWithRows([{ Name: "workspace-local", localModel: "gemma3:4b" }]),
    workspaceSourceRecords: {},
  });
  assert.equal(state.present, true);
  assert.equal(state.eligibility.state, "eligible");
  assert.equal(state.coverage.exports, 0);
  assert.equal(state.models[0].evidence, "none");
});

test("deriver complete only when row export and source record match", () => {
  const matched = deriveTrainingLedgerState({
    workspaceConfig: configWithRows([CLAIM_ROW]),
    workspaceSourceRecords: {
      [CLAIM_ROW.lastSourceId]: { recordCount: 3, records: [{ exportId: "exp_1", recordCount: 3, surfaces: { helper: 3 }, escalations: 0 }] },
    },
  });
  assert.equal(matched.eligibility.state, "exported");
  assert.equal(matched.models[0].evidence, "linked");
  assert.equal(matched.coverage.exports, 1);
  assert.equal(matched.coverage.records, 3);

  const mismatched = deriveTrainingLedgerState({
    workspaceConfig: configWithRows([CLAIM_ROW]),
    workspaceSourceRecords: {
      [CLAIM_ROW.lastSourceId]: { records: [{ exportId: "exp_other" }] },
    },
  });
  assert.equal(mismatched.models[0].evidence, "missing");
  assert.equal(mismatched.eligibility.state, "eligible", "exportId mismatch never reads complete");
  assert.match(mismatched.eligibility.next, /rerun/i);
});

test("deriver flags missing sidecar evidence when row claims export without a record", () => {
  const state = deriveTrainingLedgerState({
    workspaceConfig: configWithRows([CLAIM_ROW]),
    workspaceSourceRecords: {},
  });
  assert.equal(state.models[0].evidence, "missing");
  assert.equal(state.missingEvidence, true);
  assert.equal(state.eligibility.state, "eligible");
  assert.equal(state.coverage.exports, 0, "unverified claims never count as exports");
});

test("deriver flags missing evidence when lastSourceId is absent on a claiming row", () => {
  const row = { ...CLAIM_ROW, lastSourceId: "" };
  const state = deriveTrainingLedgerState({
    workspaceConfig: configWithRows([row]),
    workspaceSourceRecords: { "training:model-training:workspace-local": { records: [{ exportId: "exp_1" }] } },
  });
  assert.equal(state.models[0].evidence, "missing");
  assert.equal(state.eligibility.state, "eligible");
});

test("backward compatibility — config-only callers keep pre-evidence behavior", () => {
  const state = deriveTrainingLedgerState({ workspaceConfig: configWithRows([CLAIM_ROW]) });
  assert.equal(state.models[0].evidence, "unverified");
  assert.equal(state.eligibility.state, "exported");
  assert.equal(state.coverage.exports, 1);
});

test("deriver does not crash on malformed lastExportSummary", () => {
  const row = { ...CLAIM_ROW, lastExportSummary: "{not json" };
  const state = deriveTrainingLedgerState({
    workspaceConfig: configWithRows([row]),
    workspaceSourceRecords: {
      [row.lastSourceId]: { records: [{ exportId: "exp_1", recordCount: 2 }] },
    },
  });
  assert.equal(state.models[0].summary, null);
  assert.equal(state.models[0].evidence, "linked", "sidecar record carries the truth when row summary is malformed");
  assert.equal(state.coverage.records, 2);
});

test("feature seed materializes an exported ledger with evidence linked", () => {
  const { workspaceConfig, sourceRecords } = buildSuperAdminModelQaSeed({});
  const state = deriveTrainingLedgerState({ workspaceConfig, workspaceSourceRecords: sourceRecords });
  assert.equal(state.present, true);
  assert.equal(state.eligibility.state, "exported", "seed stops before fake tuned-model proof");
  assert.equal(state.missingEvidence, false);
  assert.equal(state.models[0].evidence, "linked");
  assert.equal(state.models[0].baseModel, "gemma3");
  assert.equal(state.models[0].localModel, "");
  assert.equal(state.identityChain.apiRegistryId, "");
  assert.equal(state.identityChain.apiTestProof, false);
  assert.equal(state.coverage.exports, 1);
  assert.equal(state.coverage.records, TRAINING_EXPORT_SUMMARY.recordCount);
  assert.equal(state.coverage.escalations, TRAINING_EXPORT_SUMMARY.escalations);
  assert.deepEqual(state.coverage.surfaces, TRAINING_EXPORT_SUMMARY.surfaces);
});

test("seed row and sidecar record cross-reference exactly", () => {
  const { sourceRecords } = buildSuperAdminModelQaSeed({});
  const row = TRAINING_OBJECT.rows[0];
  assert.equal(TRAINING_OBJECT.id, "model-training");
  assert.equal(TRAINING_OBJECT.objectType, "model-training");
  assert.equal(row.Name, "workspace-local");
  const entry = sourceRecords[row.lastSourceId];
  assert.ok(entry, "sidecar carries the training:* ledger record at row.lastSourceId");
  assert.equal(entry.records[0].exportId, row.lastExportId);
  const rowSummary = parseExportSummary(row.lastExportSummary);
  assert.equal(entry.records[0].recordCount, rowSummary.recordCount);
  assert.deepEqual(entry.records[0].surfaces, rowSummary.surfaces);
});

test("summary parsing never throws and rejects non-objects", () => {
  assert.equal(parseExportSummary(undefined), null);
  assert.equal(parseExportSummary("not json"), null);
  assert.equal(parseExportSummary('"a string"'), null);
  assert.equal(parseExportSummary("[1,2]"), null);
  assert.deepEqual(parseExportSummary('{"recordCount":2}'), { recordCount: 2 });
});

// ---------------------------------------------------------------------------
// Distillation pipeline + handoff cockpit + scaffold (continuum add-ons)
// ---------------------------------------------------------------------------

const {
  FINE_TUNE_TARGETS,
  LLAMA_CPP_LOCAL_TARGET_ID,
  buildLlamaCppInferenceControlPlane,
  defaultFineTuneTarget,
  normalizeLlamaCppInferenceControlPlane,
  rebindCustomModelServingIdentity,
  scaffoldHandoffRows,
} = await import(
  pathToFileURL(path.join(kitApp, "lib/adapters/fine-tune-targets.js")).href
);

const BASE_GGUF_SHA = "a".repeat(64);
const LORA_GGUF_SHA = "b".repeat(64);

function provenLlamaControl(overrides = {}) {
  return buildLlamaCppInferenceControlPlane({
    baseModel: { id: "base-model", path: "/models/base.gguf", sha256: BASE_GGUF_SHA },
    loraAdapters: [{ id: "support-v1", path: "/models/support-v1.gguf", sha256: LORA_GGUF_SHA, scale: 0.75 }],
    defaultLoraId: "support-v1",
    cacheTtl: 300,
    semanticCache: true,
    ...overrides,
  });
}

function tracesConfig(rows, extraObjects = []) {
  return { dataModel: { objects: [{ id: "training-traces", objectType: "training-traces", rows }, ...extraObjects] } };
}

const CURATED_ROW = { sessionDate: "2026-06-10T00:00:00.000Z", inputPrompt: "Build ops dashboard", agentOutput: "Proposed dashboard.", qualityScore: "5", reason: "merged", exported: "false" };

test("pipeline deriver applies the exact Phase-3 predicate", () => {
  const state = deriveDistillationPipelineState({
    workspaceConfig: tracesConfig([
      CURATED_ROW,
      { ...CURATED_ROW, exported: "true" },
      { ...CURATED_ROW, qualityScore: "2" },
      { ...CURATED_ROW, inputPrompt: "  " },
    ]),
  });
  assert.equal(state.present, true);
  assert.equal(state.total, 4);
  assert.equal(state.graded, 2, "score>=4 with non-empty input/output");
  assert.equal(state.unexported, 1);
  assert.equal(state.exportedCount, 1);
  assert.equal(state.ready, false);
  assert.equal(state.remaining, MIN_FINETUNE_TRACES - 2);
});

test("pipeline deriver absent object reports not-present without throwing", () => {
  const state = deriveDistillationPipelineState({ workspaceConfig: { dataModel: { objects: [] } } });
  assert.equal(state.present, false);
  assert.equal(state.total, 0);
  assert.equal(state.ready, false);
});

test("handoff cockpit derives step statuses from evidence only", () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ ...CURATED_ROW, inputPrompt: `task ${i}` }));
  const cfg = tracesConfig(rows, [
    { objectType: "sandbox-environment", rows: [{ adapter: "local-intelligence", localModel: "gemma3:4b" }] },
    { objectType: "api-registry", rows: [{ integrationId: "workspace-local-model", baseUrl: "http://127.0.0.1:11434/v1" }] },
  ]);
  const state = deriveTrainingHandoffState({ workspaceConfig: cfg, workspaceSourceRecords: {} });
  const byId = Object.fromEntries(state.steps.map((s) => [s.id, s.status]));
  assert.equal(byId.collect, "complete");
  assert.equal(byId.curate, "complete");
  assert.equal(byId.gather, "complete", "12 curated >= floor of 10");
  assert.equal(byId["export-sft"], "active", "unexported rows actionable");
  assert.equal(byId.activate, "complete", "localModel set on local-intelligence row");
  assert.equal(byId.register, "complete", "registry row matches convention");
  assert.equal(state.totalCount, state.steps.length);
});

test("handoff cockpit register step pending without model, eligible with model only", () => {
  const base = tracesConfig([CURATED_ROW]);
  const none = deriveTrainingHandoffState({ workspaceConfig: base, workspaceSourceRecords: {} });
  assert.equal(none.steps.find((s) => s.id === "register").status, "pending");

  const withModel = deriveTrainingHandoffState({
    workspaceConfig: tracesConfig([CURATED_ROW], [
      { objectType: "sandbox-environment", rows: [{ adapter: "local-intelligence", localModel: "gemma3:4b" }] },
    ]),
    workspaceSourceRecords: {},
  });
  assert.equal(withModel.steps.find((s) => s.id === "register").status, "active");
});

test("fine-tune targets: ollama-local is the first-party default; remote needs env refs", () => {
  const def = defaultFineTuneTarget();
  assert.equal(def.id, "ollama-local");
  assert.equal(def.baseUrl, "http://127.0.0.1:11434/v1");
  assert.deepEqual(def.requiredEnv, []);
  const remote = FINE_TUNE_TARGETS.find((t) => t.id === "openai-compatible-remote");
  assert.ok(remote.requiredEnv.includes("MODEL_RUNTIME_URL"));
  assert.equal(remote.authRef, "MODEL_RUNTIME_KEY", "credentials resolve via env ref, never inline");
  const llama = FINE_TUNE_TARGETS.find((t) => t.id === LLAMA_CPP_LOCAL_TARGET_ID);
  assert.equal(llama.default, false);
  assert.equal(llama.requiresInferenceControlPlane, true, "llama.cpp target cannot scaffold from a tag alone");
  assert.equal(llama.endpoint, "/v1/chat/completions");
});

test("llama.cpp handoff builds a runtime-verifiable base + hot-swappable LoRA policy from GGUF proofs", () => {
  const control = provenLlamaControl();
  assert.equal(control.providerKind, "llama.cpp-server");
  assert.equal(control.base_model_ref.base_model_sha256, BASE_GGUF_SHA);
  assert.equal(control.runtime.model.path, "/models/base.gguf");
  assert.equal(control.runtime.model.sha256, BASE_GGUF_SHA);
  assert.equal(control.runtime.artifactVerification, "sha256-reverified-before-process-start");
  assert.deepEqual(control.runtime.allowedAdapters[0], {
    ref: "support-v1",
    path: "/models/support-v1.gguf",
    sha256: LORA_GGUF_SHA,
    defaultScale: 0.75,
    format: "gguf",
    compatibility: "llama.cpp-lora-gguf",
  });
  assert.equal(control.lora_ref.lora_id, "support-v1");
  assert.equal(control.lora_ref.adapter_sha256, LORA_GGUF_SHA);
  assert.equal(control.cache.nativePrefix, true);
  assert.equal(control.routing.prefillPool, "prefill_pool");
  assert.equal(control.routing.decodePool, "decode_pool");
  assert.equal(control.routing.nativeDisaggregationRequired, false);
  assert.equal(control.otel.protocol, "otlp-http");
  assert.equal(control.tools.interceptor, "openapi-governed");
});

test("llama.cpp handoff supports a separately proven base GGUF without inventing a LoRA", () => {
  const control = buildLlamaCppInferenceControlPlane({
    baseModel: { path: "file:///models/base.GGUF", sha256: `SHA256:${BASE_GGUF_SHA.toUpperCase()}` },
    loraAdapters: [],
  });
  assert.equal(control.base_model_ref.model_id, `gguf-${BASE_GGUF_SHA.slice(0, 16)}`);
  assert.equal(control.runtime.model.sha256, BASE_GGUF_SHA);
  assert.deepEqual(control.runtime.allowedAdapters, []);
  assert.equal(Object.hasOwn(control, "lora_ref"), false, "base-only serving stays explicit instead of inventing an adapter");
});

test("llama.cpp handoff fails closed on missing proof, PEFT directories, invalid hashes, and unproven defaults", () => {
  assert.throws(() => buildLlamaCppInferenceControlPlane(), /baseModel must be a separately proven GGUF artifact/);
  assert.throws(() => buildLlamaCppInferenceControlPlane({
    baseModel: { path: "/models/base", sha256: BASE_GGUF_SHA },
  }), /must identify a GGUF file/);
  assert.throws(() => buildLlamaCppInferenceControlPlane({
    baseModel: { path: "/models/base.gguf", sha256: "not-a-sha" },
  }), /64-character SHA-256/);
  assert.throws(() => buildLlamaCppInferenceControlPlane({
    baseModel: { path: "/models/base.gguf", sha256: BASE_GGUF_SHA },
    loraAdapters: [{ id: "peft", path: "/training/adapter_model", sha256: LORA_GGUF_SHA }],
  }), /PEFT\/safetensors directories are not llama\.cpp LoRA artifacts/);
  assert.throws(() => buildLlamaCppInferenceControlPlane({
    baseModel: { path: "/models/base.gguf", sha256: BASE_GGUF_SHA },
    loraAdapters: [{ id: "lora", path: "/models/lora.gguf", sha256: LORA_GGUF_SHA }],
    defaultLoraId: "missing",
  }), /defaultLoraId is not in loraAdapters/);
  assert.throws(() => buildLlamaCppInferenceControlPlane({
    baseModel: { path: "/models/base.gguf", sha256: BASE_GGUF_SHA },
    nativeDisaggregationRequired: true,
  }), /cannot be enabled until.*native prefill\/decode state handoff/);
});

test("serialized llama.cpp control-plane metadata is revalidated instead of trusted", () => {
  const valid = provenLlamaControl();
  assert.deepEqual(normalizeLlamaCppInferenceControlPlane(valid), valid);
  const invalid = structuredClone(valid);
  invalid.runtime.allowedAdapters[0].path = "/training/adapter_model";
  assert.throws(() => normalizeLlamaCppInferenceControlPlane(invalid), /must identify a GGUF file/);
  const invalidSha = structuredClone(valid);
  invalidSha.runtime.model.sha256 = "c".repeat(63);
  assert.throws(() => normalizeLlamaCppInferenceControlPlane(invalidSha), /64-character SHA-256/);
});

test("scaffoldHandoffRows produces registry + version rows in existing column shapes", () => {
  const { registryRow, versionRow, integrationId } = scaffoldHandoffRows({
    slug: "workspace-local", version: 2, target: defaultFineTuneTarget(),
    modelTag: "workspace-local-tuned-v2", datasetRecords: 14, datasetPath: "unsloth-dataset-v2.jsonl",
    now: "2026-06-11T15:00:00.000Z",
  });
  assert.equal(integrationId, "workspace-local-model");
  assert.equal(registryRow.integrationId, "workspace-local-model");
  assert.equal(registryRow.baseUrl, "http://127.0.0.1:11434/v1");
  assert.equal(registryRow.endpoint, "/chat/completions");
  assert.equal(registryRow.connectorKind, "http");
  assert.equal(versionRow.Name, "workspace-local-v2");
  const summary = JSON.parse(versionRow.lastExportSummary);
  assert.equal(summary.recordCount, 14);
  assert.equal(summary.registryId, "workspace-local-model");
  assert.equal(summary.version, 2);
});

test("llama.cpp scaffold stays unavailable until activation stamps identity-aligned GGUF proof", () => {
  const target = FINE_TUNE_TARGETS.find((candidate) => candidate.id === LLAMA_CPP_LOCAL_TARGET_ID);
  const input = {
    slug: "workspace-local", version: 3, target,
    modelTag: "workspace-local-lora-v3", datasetRecords: 20, datasetPath: "dataset-v3.jsonl",
    now: "2026-07-19T12:00:00.000Z",
  };
  const pending = scaffoldHandoffRows(input);
  assert.equal(pending.registryRow.connectorKind, "llama.cpp-server");
  assert.equal(pending.registryRow.metadata, undefined, "training preparation cannot fabricate a future artifact SHA");
  const control = provenLlamaControl({ servedAlias: input.modelTag });
  const { registryRow } = scaffoldHandoffRows({ ...input, inferenceControlPlane: control });
  assert.deepEqual(registryRow.metadata.inferenceControlPlane, control);
  assert.equal(registryRow.integrationId, "workspace-local-model");
  assert.equal(registryRow.executionLane, "sandbox-local", "the existing governed execution lane is preserved");
});

test("attached model tag rebinds training, direct registry, and mothership identity atomically", () => {
  const objects = [
    { objectType: "model-training", rows: [{ Name: "workspace-local-v1", localModel: "reserved-tag", status: "prepared" }] },
    { objectType: "api-registry", rows: [
      { integrationId: "workspace-local-model", expectedModelTag: "reserved-tag" },
      { integrationId: "mothership-proxy-reserved-tag", name: "reserved-tag (mothership proxy)", metadata: { mothershipProxy: { modelTag: "reserved-tag", routes: [
        { target: "local-student", registryId: "workspace-local-model", modelTag: "reserved-tag" },
        { target: "local-base", modelTag: "gemma3:4b" },
      ] } } },
    ] },
  ];
  const rebound = rebindCustomModelServingIdentity(objects, {
    trainingRowId: "workspace-local-v1",
    integrationId: "workspace-local-model",
    modelTag: "workspace-local-tuned-v1:latest",
  });
  assert.equal(rebound[0].rows[0].localModel, "workspace-local-tuned-v1:latest");
  assert.equal(rebound[0].rows[0].status, "imported");
  assert.equal(rebound[1].rows[0].expectedModelTag, "workspace-local-tuned-v1:latest");
  assert.equal(rebound[1].rows[1].metadata.mothershipProxy.modelTag, "workspace-local-tuned-v1:latest");
  assert.equal(rebound[1].rows[1].name, "workspace-local-tuned-v1:latest", "registry display name stays capability-neutral after rebinding");
  assert.doesNotMatch(rebound[1].rows[1].name, /mothership proxy|custom model/i);
  assert.equal(rebound[1].rows[1].metadata.mothershipProxy.routes[0].modelTag, "workspace-local-tuned-v1:latest");
  assert.equal(rebound[1].rows[1].metadata.mothershipProxy.routes[1].modelTag, "gemma3:4b", "fallback identity is unchanged");
  assert.equal(objects[0].rows[0].localModel, "reserved-tag", "input remains immutable");
});

test("identity rebind carries explicit llama.cpp proof only onto the direct serving row", () => {
  const control = provenLlamaControl({ servedAlias: "workspace-local-lora-v1" });
  const objects = [
    { objectType: "model-training", rows: [{ Name: "workspace-local-v1", localModel: "reserved", status: "prepared" }] },
    { objectType: "api-registry", rows: [
      { integrationId: "workspace-local-model", metadata: { retained: true } },
      { integrationId: "mothership-proxy-reserved", metadata: { mothershipProxy: { modelTag: "reserved", routes: [
        { target: "local-student", registryId: "workspace-local-model", modelTag: "reserved" },
        { target: "local-base", modelTag: "base" },
      ] } } },
    ] },
  ];
  const rebound = rebindCustomModelServingIdentity(objects, {
    trainingRowId: "workspace-local-v1",
    integrationId: "workspace-local-model",
    modelTag: "workspace-local-lora-v1",
    inferenceControlPlane: control,
  });
  const [direct, proxy] = rebound[1].rows;
  assert.equal(direct.metadata.retained, true);
  assert.deepEqual(direct.metadata.inferenceControlPlane, control);
  assert.equal(proxy.metadata.inferenceControlPlane, undefined, "student process policy must not leak onto base/teacher fallback routes");
  assert.equal(proxy.metadata.mothershipProxy.routes[0].modelTag, "workspace-local-lora-v1");
  assert.equal(objects[1].rows[0].metadata.inferenceControlPlane, undefined, "input remains immutable");
});

test("handoff cockpit mirrors the registry-cockpit contract: milestone score + closure steps", () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ ...CURATED_ROW, inputPrompt: `task ${i}`, exported: "true" }));
  const cfg = tracesConfig(rows, [
    { objectType: "sandbox-environment", rows: [
      { adapter: "local-intelligence", localModel: "gemma3:4b" },
      { Name: "model-sbx", schedulerRegistryId: "workspace-local-model" },
    ]},
    { objectType: "api-registry", rows: [{
      integrationId: "workspace-local-model", baseUrl: "http://127.0.0.1:11434/v1", status: "connected",
      lastResponse: JSON.stringify({ model: "workspace-local-tuned-v1", choices: [{ message: { content: "hi" } }] }),
    }]},
    { objectType: "model-training", rows: [{ Name: "workspace-local-v1", localModel: "workspace-local-tuned-v1", lastExportId: "ft_1" }] },
  ]);
  const state = deriveTrainingHandoffState({ workspaceConfig: cfg, workspaceSourceRecords: {} });
  const byId = Object.fromEntries(state.steps.map((s) => [s.id, s.status]));
  assert.equal(byId.integrate, "complete", "sandbox row references the registry id");
  assert.equal(byId.prove, "complete", "lastResponse model tag matches the tuned version row");
  assert.equal(state.complete, true);
  assert.equal(state.score, 100, "milestone score reaches 100 only at full closure");
  for (const step of state.steps) {
    assert.ok(["complete", "active", "pending"].includes(step.status), `${step.id} uses cockpit vocabulary`);
    assert.equal(typeof step.description, "string");
  }
});

test("prove step never completes on a base-model response", () => {
  const cfg = tracesConfig([CURATED_ROW], [
    { objectType: "api-registry", rows: [{ integrationId: "workspace-local-model", status: "connected", lastResponse: JSON.stringify({ model: "gemma3:4b" }) }] },
    { objectType: "model-training", rows: [{ Name: "workspace-local-v1", localModel: "workspace-local-tuned-v1" }] },
  ]);
  const state = deriveTrainingHandoffState({ workspaceConfig: cfg, workspaceSourceRecords: {} });
  const prove = state.steps.find((s) => s.id === "prove");
  assert.equal(prove.status, "active", "base-model tag must not satisfy the tuned-weights proof");
  assert.equal(state.complete, false);
});

test("recovery checklist derives personalized items from real failure evidence", () => {
  const offline = deriveHandoffRecovery({ stage: "apply", message: "Failed to fetch", online: false, readbackOk: false, datasetDownloaded: true });
  assert.equal(offline.items.find((i) => i.id === "connection").status, "blocked");
  assert.equal(offline.items.find((i) => i.id === "dataset").status, "complete", "saved dataset survives the outage");
  assert.equal(offline.retryable, true);

  const quota = deriveHandoffRecovery({ stage: "package", message: "QuotaExceededError: no space", online: true, datasetDownloaded: false });
  assert.equal(quota.items.find((i) => i.id === "dataset").status, "blocked");
  assert.equal(quota.retryable, false, "storage must be freed before retry");

  const refused = deriveHandoffRecovery({ stage: "apply", message: "governed PATCH refused: 400 unknown fields", online: true, readbackOk: true, registryPresent: false });
  assert.equal(refused.items.find((i) => i.id === "apply").status, "blocked");
  assert.match(refused.items.find((i) => i.id === "apply").description, /atomic/i);

  const landed = deriveHandoffRecovery({ stage: "verify", message: "timeout", online: true, readbackOk: true, registryPresent: true });
  assert.equal(landed.items.find((i) => i.id === "apply").status, "complete", "atomic PATCH already landed — retry skips to verify");
});

test("progress stages derive deterministically per atomic step (swarm phase-row pattern)", async () => {
  const { deriveProgressStages, HANDOFF_STAGES } = await import(
    pathToFileURL(path.join(kitApp, "lib/training-ledger.js")).href
  );
  assert.deepEqual(HANDOFF_STAGES, ["validate", "convert", "package", "apply", "verify"]);
  const mid = deriveProgressStages({ stage: "apply", pct: 82, converted: 11, total: 11 });
  const byId = Object.fromEntries(mid.map((s) => [s.id, s.status]));
  assert.equal(byId.validate, "complete");
  assert.equal(byId.convert, "complete");
  assert.equal(byId.package, "complete");
  assert.equal(byId.apply, "active");
  assert.equal(byId.verify, "pending");
  assert.match(mid.find((s) => s.id === "apply").detail, /atomic governed PATCH/);
  const done = deriveProgressStages({ stage: "verify", pct: 100, converted: 11, total: 11 });
  assert.ok(done.every((s) => s.status === "complete"), "100% marks every atomic step complete");
});

test("version row bonds to its registry record and surfaces only tuned-tag-validated output", () => {
  const validated = JSON.stringify({ model: "workspace-local-tuned-v1", choices: [{ message: { content: "Hello from your fine-tuned model." } }] });
  const cfg = {
    dataModel: { objects: [
      { objectType: TRAINING_OBJECT_TYPE, rows: [{
        Name: "workspace-local-v1", localModel: "workspace-local-tuned-v1",
        lastExportId: "ft_1", lastSourceId: "",
        lastExportSummary: JSON.stringify({ recordCount: 11, registryId: "workspace-local-model", version: 1 }),
      }] },
      { objectType: "api-registry", rows: [{ integrationId: "workspace-local-model", status: "connected", lastTested: "2026-06-11T17:00:00.000Z", lastResponse: validated }] },
    ] },
  };
  const state = deriveTrainingLedgerState({ workspaceConfig: cfg });
  const bonded = state.models[0].bondedRegistry;
  assert.equal(bonded.registryId, "workspace-local-model");
  assert.equal(bonded.status, "connected");
  assert.ok(bonded.validated, "tuned-tag response validates");
  assert.match(bonded.validated.snippet, /fine-tuned model/);

  // base-model response never shows as validated output on the version row
  const baseCfg = JSON.parse(JSON.stringify(cfg));
  baseCfg.dataModel.objects[1].rows[0].lastResponse = validated.replace("workspace-local-tuned-v1", "gemma3:4b");
  const baseState = deriveTrainingLedgerState({ workspaceConfig: baseCfg });
  assert.equal(baseState.models[0].bondedRegistry.validated, null);

  // missing registry record is surfaced, not silently dropped
  const missingCfg = { dataModel: { objects: [cfg.dataModel.objects[0]] } };
  const missingState = deriveTrainingLedgerState({ workspaceConfig: missingCfg });
  assert.equal(missingState.models[0].bondedRegistry.status, "missing");
});

test("seven-state ladder keeps seed exported until real model evidence exists", () => {
  const { workspaceConfig, sourceRecords } = buildSuperAdminModelQaSeed({});
  const state = deriveTrainingLedgerState({ workspaceConfig, workspaceSourceRecords: sourceRecords });
  assert.equal(state.eligibility.state, "exported", "seed QA workspace does not fake a tuned model");
  const chain = state.identityChain;
  assert.equal(chain.modelTrainingRowId, "workspace-local");
  assert.ok(chain.lastExportId, "exportId link");
  assert.equal(chain.trainingSourceId, "training:model-training:workspace-local");
  assert.equal(chain.modelVersion, "");
  assert.equal(chain.apiRegistryId, "");
  assert.equal(chain.apiTestProof, false);
  assert.equal(chain.sandboxObjectId, "");
  assert.equal(chain.sandboxRunId, "");
  assert.equal(chain.modelOutputHash, "");
  assert.equal(chain.snippetHash, "");
});

test("seed invocation proof is absent until a real tuned-model run exists", () => {
  const { sourceRecords } = buildSuperAdminModelQaSeed({});
  const proof = sourceRecords["model-invocation:workspace-local-model:seed"];
  assert.equal(proof, undefined);
});

test("training checklist invokes custom models through the API Registry test lane", () => {
  const source = fs.readFileSync(path.join(kitApp, "app/data-model/components/TrainingLedger.jsx"), "utf8");
  assert.match(source, /fetch\("\/api\/workspace\/test-api-record"/);
  assert.doesNotMatch(source, /fetch\("\/api\/workspace\/test-source"/);
  assert.match(source, /lastResponse: JSON\.stringify\(payload\.response/);
});
