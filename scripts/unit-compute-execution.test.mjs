/**
 * Governed Compute Realization — execution and recovery certification.
 *
 * These tests exercise the production orchestrator, not a copied algorithm:
 * - one server-owned authority reaches every provider boundary;
 * - active paid resources are reconciled/observed, never duplicated;
 * - status uncertainty stays pending instead of inventing failure/release;
 * - provider-authored score rows never mint canonical evaluation/promotion;
 * - journals merge monotonically;
 * - cancellation and resume require verifiable provider evidence;
 * - a resumed resource becomes the active allocation before later controls.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kitApp = path.join(repoRoot, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const lib = (rel) => pathToFileURL(path.join(kitApp, "lib", rel)).href;

const {
  executeProviderComputeRun,
  cancelProviderComputeRun,
  resumeProviderComputeRun,
  maybeExecuteProviderComputeForSandboxRun,
  applyComputeBlockToReceiptRows,
  parseReceiptComputeBlock,
  mergeComputeBlocks,
  findTrainingRunReceiptRow,
} = await import(lib("compute-execution.js"));
const {
  deriveComputeLifecycle,
  normalizeComputeCheckpoint,
  computeIdempotencyKey,
} = await import(lib("compute-evidence.js"));
const { COMPUTE_AUTHORITY_SCHEMA, buildComputeIntent, buildComputeWorkSpec } = await import(lib("compute-work-spec.js"));
const {
  compileComputeAuthority,
  verifyComputeAuthoritySeal,
  verifyComputeAuthorityAgainstWorkspace,
} = await import(lib("compute-authority.js"));
const { default: localAdapter } = await import(lib("adapters/compute/default-local-machine.js"));

const NOW0 = Date.parse("2026-07-20T12:00:00.000Z");
const RUN_ID = "trainrun_2026-07-20";
const WORK_SPEC_HASH = "a".repeat(64);

function providerRow(overrides = {}) {
  return {
    integrationId: "fake-remote",
    Name: "Fake remote GPU",
    kind: "compute-provider",
    metadata: {
      computeProvider: {
        schema: "growthub-compute-provider-v1",
        adapterId: "fake-remote-adapter",
        capacityProfiles: ["burst-gpu", "single-gpu-finetune"],
        availabilityModes: ["on-demand"],
        requiredEnv: ["FAKE_REMOTE_KEY"],
        executionLane: "sandbox-local",
        config: {},
        ...overrides,
      },
    },
  };
}

function directRegistryConfig({ receiptRow = null, providerOverrides = {} } = {}) {
  const objects = [{ id: "api-registry", objectType: "api-registry", rows: [providerRow(providerOverrides)] }];
  if (receiptRow) objects.push({ id: "model-training-run", objectType: "model-training-run", rows: [receiptRow] });
  return { dataModel: { objects } };
}

function receiptRowWith(compute = null, overrides = {}) {
  return {
    Name: RUN_ID,
    trainingRunId: RUN_ID,
    modelTrainingRowId: "workspace-local",
    status: "running",
    preflight: { ramGB: 8, diskFreeGB: 80, gpu: { present: false, name: "", vramFreeGB: 0 } },
    ...(compute ? { compute: JSON.stringify(compute) } : {}),
    ...overrides,
  };
}

function fakeAdapter(script = {}) {
  const calls = {
    describeCapabilities: 0,
    inspectCapacity: 0,
    allocate: 0,
    execute: 0,
    resume: 0,
    status: 0,
    cancel: 0,
    release: 0,
    collectArtifact: 0,
  };
  const resourceId = script.resourceId ?? "pod-777";
  const adapter = {
    id: "fake-remote-adapter",
    label: "Fake remote",
    description: "",
    locality: "remote",
    calls,
    describeCapabilities() {
      calls.describeCapabilities += 1;
      if (script.describeFails) throw new Error("capabilities unavailable");
      return {
        providerId: "fake-remote",
        adapterId: "fake-remote-adapter",
        capacityProfiles: ["burst-gpu", "single-gpu-finetune"],
        availabilityModes: ["on-demand"],
        acceleratorClasses: ["any-gpu", "datacenter-gpu"],
        maxVramPerGpuGB: 80,
        maxGpusPerWorker: 8,
        maxWorkers: 1,
        supportsCheckpointing: true,
        supportsResume: true,
        supportsGangScheduling: false,
        regions: ["us-east"],
        requiredEnv: ["FAKE_REMOTE_KEY"],
      };
    },
    async inspectCapacity(ctx) {
      calls.inspectCapacity += 1;
      if (script.quoteFails) throw new Error("quote unavailable");
      return {
        providerId: "fake-remote",
        capacityProfileId: ctx.capacityProfileId,
        available: true,
        availabilityMode: "on-demand",
        costBasis: { kind: "per-hour", unitUsd: 2, source: "static-catalog" },
        estimatedTotalUsd: 4,
        queueLatencySeconds: 10,
        quoteObservedAt: "2026-07-20T12:00:00.000Z",
        quoteExpiresAt: "2026-07-20T13:00:00.000Z",
        quoteRef: "",
      };
    },
    async allocate(ctx) {
      calls.allocate += 1;
      if (script.allocateFails) throw new Error("provider allocation exploded");
      if (typeof script.onAllocate === "function") script.onAllocate(ctx);
      return {
        allocationId: `alloc-${ctx.idempotencyKeyHash.slice(0, 8)}`,
        runRef: { ...ctx.runRef, providerResourceId: resourceId },
        status: "allocated",
        idempotencyKeyHash: ctx.idempotencyKeyHash,
        availabilityMode: "on-demand",
        costBasis: { kind: "per-hour", unitUsd: 2, source: "static-catalog" },
        requestedAt: "2026-07-20T12:00:01.000Z",
        allocatedAt: "2026-07-20T12:00:02.000Z",
        releasedAt: "",
        releaseConfirmed: false,
        allocated: { gpuType: "A100", gpuCount: 1, workers: 1, region: "us-east" },
      };
    },
    async execute(ctx) {
      calls.execute += 1;
      if (script.executeFails) throw new Error("execution submit failed");
      if (typeof script.onExecute === "function") script.onExecute(ctx);
      return [{
        type: "compute-queued",
        at: "2026-07-20T12:00:03.000Z",
        evidenceObservedAt: "2026-07-20T12:00:03.000Z",
        source: "provider",
        runRef: { ...ctx.runRef },
        providerEventId: "ev-execute",
        detail: "exact work spec submitted",
      }];
    },
    async resume(ctx, checkpoint) {
      calls.resume += 1;
      if (script.resumeFails) throw new Error("resume rejected");
      if (typeof script.onResume === "function") script.onResume(ctx, checkpoint);
      const resumedResourceId = script.resumeResourceId || "pod-resumed-888";
      return [{
        type: "compute-resuming",
        at: "2026-07-20T12:20:00.000Z",
        evidenceObservedAt: "2026-07-20T12:20:01.000Z",
        source: "provider",
        runRef: { ...ctx.runRef, providerResourceId: resumedResourceId },
        providerEventId: `ev-resume-${resumedResourceId}`,
        detail: `proven checkpoint submitted to ${resumedResourceId}`,
      }];
    },
    async status(ctx) {
      calls.status += 1;
      const mk = (type, id, extra = {}) => ({
        type,
        at: `2026-07-20T12:0${Math.min(9, calls.status)}:00.000Z`,
        evidenceObservedAt: `2026-07-20T12:0${Math.min(9, calls.status)}:01.000Z`,
        source: "provider",
        runRef: { ...ctx.runRef },
        providerEventId: id,
        detail: "",
        ...extra,
      });
      if (script.statusThrows) throw new Error(script.statusThrows);
      if (script.statusScript) return script.statusScript(calls.status, mk, ctx);
      if (calls.status === 1) return [mk("compute-running", "ev-run-1")];
      return [mk("compute-completed", "ev-done-1")];
    },
    async collectArtifact(ctx) {
      calls.collectArtifact += 1;
      if (script.noArtifact) return null;
      return {
        runRef: { ...ctx.runRef },
        kind: "gguf",
        locator: "volume://artifacts/model.q4_k_m.gguf",
        sha256: script.artifactSha ?? "b".repeat(64),
        sizeBytes: 4_000_000,
        evidenceObservedAt: "2026-07-20T12:09:00.000Z",
        // An honest provider attests the exact sealed identities it executed.
        workSpecHash: ctx.workSpec?.workSpecHash || "",
        corpusSha256: ctx.workSpec?.dataset?.corpusSha256 || "",
        ...(Array.isArray(script.evaluationResults) ? { evaluationResults: script.evaluationResults } : {}),
      };
    },
    async cancel(ctx) {
      calls.cancel += 1;
      if (script.cancelFails) throw new Error("cancel rejected");
      if (script.cancelNoEvidence) return [];
      return [{
        type: "compute-cancelled",
        at: "2026-07-20T12:10:00.000Z",
        evidenceObservedAt: "2026-07-20T12:10:01.000Z",
        source: "provider",
        runRef: { ...ctx.runRef },
        providerEventId: "ev-cancel",
        detail: "provider confirmed cancellation",
      }];
    },
    async release(ctx) {
      calls.release += 1;
      if (script.releaseFails) throw new Error("terminate returned 500");
      if (script.releaseNoEvidence) return [];
      return [{
        type: "compute-released",
        at: "2026-07-20T12:11:00.000Z",
        evidenceObservedAt: "2026-07-20T12:11:01.000Z",
        source: "provider",
        runRef: { ...ctx.runRef },
        providerEventId: "ev-release",
        detail: "capacity terminated",
      }];
    },
  };
  return adapter;
}

function makeIo(adapter, {
  withLocal = false,
  envPresent = () => true,
  maxPolls = 10,
  onPersist = null,
  verifyArtifact = null,
} = {}) {
  let clock = NOW0;
  const persisted = [];
  const adapters = {
    "fake-remote-adapter": adapter,
    ...(withLocal ? { "local-machine": localAdapter } : {}),
  };
  return {
    getAdapter: (id) => adapters[id] || null,
    listAdapterIds: () => Object.keys(adapters),
    envPresent,
    resolveEnv: () => "",
    fetchJson: async () => { throw new Error("no network in tests"); },
    now: () => { clock += 1000; return clock; },
    sleep: async () => {},
    maxPolls,
    pollIntervalMs: 0,
    verifyArtifact: verifyArtifact || (async (artifact) => ({
      verifiedSha256: artifact.sha256,
      verificationKind: "test-materialized",
      sizeBytes: artifact.sizeBytes,
    })),
    persistCompute: async (computeBlock) => {
      persisted.push(JSON.parse(JSON.stringify(computeBlock)));
      if (typeof onPersist === "function") await onPersist(computeBlock, persisted.length);
    },
    persisted,
  };
}

const ASK = {
  capacityProfileId: "single-gpu-finetune",
  providerRegistryId: "",
  selectionMode: "auto",
};

function activePrior({ workSpecHash = "", idempotencyKeyHash = "", terminal = "" } = {}) {
  const runRef = {
    trainingRunId: RUN_ID,
    modelTrainingRowId: "workspace-local",
    providerId: "fake-remote",
    capacityProfileId: "single-gpu-finetune",
    providerResourceId: "pod-existing-1",
  };
  const events = [
    { type: "compute-requested", at: "t0", evidenceObservedAt: "t0", source: "workspace", runRef: { ...runRef, providerResourceId: "" }, providerEventId: "request-1", detail: "" },
    { type: "compute-allocated", at: "t1", evidenceObservedAt: "t1", source: "provider", runRef, providerEventId: "allocated-1", detail: "", workSpecHash },
    { type: "compute-queued", at: "t2", evidenceObservedAt: "t2", source: "provider", runRef, providerEventId: "queued-1", detail: "", workSpecHash },
    ...(terminal ? [{ type: terminal === "failed" ? "compute-failed" : "compute-cancelled", at: "t3", evidenceObservedAt: "t3", source: "provider", runRef, providerEventId: `terminal-${terminal}`, detail: terminal, workSpecHash }] : []),
  ];
  return {
    capacityProfileId: "single-gpu-finetune",
    providerRegistryId: "fake-remote",
    selectionMode: "auto",
    workSpecHash,
    idempotencyKeyHash,
    allocation: {
      allocationId: "alloc-existing-1",
      runRef,
      status: terminal || "running",
      idempotencyKeyHash,
      availabilityMode: "on-demand",
      costBasis: { kind: "per-hour", unitUsd: 2, source: "" },
      requestedAt: "t0",
      allocatedAt: "t1",
      releasedAt: "",
      releaseConfirmed: false,
      allocated: { gpuType: "A100", gpuCount: 1, workers: 1, region: "us-east" },
      workSpecHash,
    },
    events,
    checkpoints: [],
  };
}

// ---------------------------------------------------------------------------
// Core lifecycle and paid-resource recovery
// ---------------------------------------------------------------------------

// Direct-executor tests run under a sealed authority (production remote
// contract): the provider must attest the exact work-spec and corpus
// identities, and dataset delivery must be proven, before an artifact can
// verify.
const DIRECT_CORPUS_SHA = "d".repeat(64);
function directAuthority() {
  const intent = buildComputeIntent({
    adaptivePlan: { mode: "train-remote", tier: "small", baseModel: "gemma3:4b" },
    capacityPlan: {
      capacityProfileId: "single-gpu-finetune",
      requirements: {
        workloadKind: "fine-tune", acceleratorClass: "any-gpu", gpuCount: 1,
        minVramPerGpuGB: 16, minCpuCores: 4, minRamGB: 16, minDiskGB: 60,
        checkpointRequired: true, distributed: null,
        locality: { regions: [], dataResidency: "" }, estimatedDurationMinutes: 10,
      },
    },
    policy: { mode: "cloud", excludeLocal: true, budget: { mode: "advisory" } },
    trainingRunConfig: {
      profileId: "unsloth-qlora-quantize-pipeline", runnerMode: "provider-compute",
      baseModel: "gemma3:4b", teacherModel: "", quantization: "q4_k_m",
      steps: [{ stageId: "fine-tuning", label: "Fine tune", bin: "python", args: ["train.py"] }],
      datasetPath: "data/train.jsonl", outputModelTag: "workspace-tuned-v1",
      artifactPath: "artifacts/workspace-tuned-v1", importProof: { acceptedTypes: ["gguf"] },
    },
  });
  const workSpec = buildComputeWorkSpec({
    intent,
    trainingRunConfig: { datasetPath: "data/train.jsonl" },
    trainingRunId: RUN_ID,
    modelTrainingRowId: "workspace-local",
    datasetExportId: "export-direct",
    corpusSha256: DIRECT_CORPUS_SHA,
  });
  return { schema: "growthub-compute-authority-v1", intent, workSpec, intentHash: intent.intentHash, requirementsHash: intent.requirementsHash, workSpecHash: workSpec.workSpecHash };
}
const directDeliveredDataset = () => ({
  schema: "growthub-compute-dataset-access-v1",
  tokenId: "token-direct",
  trainingRunId: RUN_ID,
  exportId: "export-direct",
  corpusSha256: DIRECT_CORPUS_SHA,
  deliveryStatus: "delivered",
  deliveredAt: "2026-07-20T12:00:05.000Z",
});

test("full lifecycle records allocation, verifies artifact, confirms release, and never fabricates promotion", async () => {
  const adapter = fakeAdapter();
  const outcome = await executeProviderComputeRun({
    workspaceConfig: directRegistryConfig({ receiptRow: receiptRowWith() }),
    trainingRunId: RUN_ID,
    computeAsk: ASK,
    authority: directAuthority(),
    datasetEvidence: directDeliveredDataset(),
    io: makeIo(adapter),
  });
  assert.equal(outcome.localFallthrough, false);
  assert.equal(outcome.result.ok, true, outcome.result.error);
  assert.equal(outcome.result.exitCode, 0);
  assert.equal(outcome.computeBlock.decision.selectedProviderId, "fake-remote");
  assert.equal(outcome.computeBlock.allocation.runRef.providerResourceId, "pod-777");
  assert.equal(outcome.computeBlock.artifact.verifiedSha256, outcome.computeBlock.artifact.sha256);
  assert.equal(outcome.computeBlock.evaluation, null, "provider completion does not create canonical evaluation");
  const lifecycle = deriveComputeLifecycle({
    events: outcome.computeBlock.events,
    allocation: outcome.computeBlock.allocation,
    checkpoints: outcome.computeBlock.checkpoints,
  });
  assert.equal(lifecycle.terminal, "completed");
  assert.equal(lifecycle.releaseConfirmed, true);
  assert.equal(lifecycle.capacityMayStillExist, false);
  assert.equal(adapter.calls.allocate, 1);
  assert.equal(adapter.calls.release, 1);
  assert.ok(!outcome.result.stdout.includes("pct"), "no invented progress percentage");
});

test("provider-authored benchmark wins are discarded and cannot enter the training receipt", async () => {
  const fabricatedWins = Array.from({ length: 6 }, (_, index) => ({
    taskId: `provider-task-${index}`,
    student: { quality: 1, latencyMs: 1, costUsd: 0 },
    baseline: { quality: 0, latencyMs: 100, costUsd: 100 },
  }));
  const adapter = fakeAdapter({ evaluationResults: fabricatedWins });
  const outcome = await executeProviderComputeRun({
    workspaceConfig: directRegistryConfig({ receiptRow: receiptRowWith() }),
    trainingRunId: RUN_ID,
    computeAsk: ASK,
    authority: directAuthority(),
    datasetEvidence: directDeliveredDataset(),
    io: makeIo(adapter),
  });
  assert.equal(outcome.result.ok, true);
  assert.equal(outcome.computeBlock.evaluation, null);
  assert.equal("evaluationResults" in outcome.computeBlock.artifact, false, "untrusted scores are not persisted with the artifact");

  const objects = directRegistryConfig({ receiptRow: receiptRowWith() }).dataModel.objects;
  const stamped = applyComputeBlockToReceiptRows(objects, RUN_ID, outcome.computeBlock);
  const row = stamped.find((object) => object.objectType === "model-training-run").rows[0];
  const distillation = row.distillation ? JSON.parse(row.distillation) : null;
  assert.equal(distillation?.benchmarkWins, undefined, "provider scores cannot mint benchmarkWins/promoted");
});

test("an active allocation for the same workload is observed and completed without a second allocate or execute", async () => {
  const adapter = fakeAdapter();
  const authority = directAuthority();
  const { hash } = computeIdempotencyKey({
    trainingRunId: RUN_ID,
    attempt: 1,
    capacityProfileId: "single-gpu-finetune",
    providerId: "fake-remote",
    workSpecHash: authority.workSpecHash,
  });
  const priorCompute = activePrior({ workSpecHash: authority.workSpecHash, idempotencyKeyHash: hash });
  const outcome = await executeProviderComputeRun({
    workspaceConfig: directRegistryConfig(),
    trainingRunId: RUN_ID,
    computeAsk: ASK,
    authority,
    datasetEvidence: directDeliveredDataset(),
    priorCompute,
    io: makeIo(adapter),
  });
  assert.equal(outcome.result.ok, true, outcome.result.error);
  assert.equal(adapter.calls.allocate, 0, "existing paid resource is adopted, not recreated");
  assert.equal(adapter.calls.execute, 0, "already-submitted workload is not submitted twice");
  assert.ok(adapter.calls.status > 0, "active resource is reconciled by observation");
  assert.equal(outcome.computeBlock.allocation.allocationId, "alloc-existing-1");
});

test("an unreleased allocation from another attempt/workload blocks a new paid request", async () => {
  const adapter = fakeAdapter();
  const { hash } = computeIdempotencyKey({
    trainingRunId: RUN_ID,
    attempt: 1,
    capacityProfileId: "single-gpu-finetune",
    providerId: "fake-remote",
    workSpecHash: "",
  });
  const priorCompute = activePrior({ idempotencyKeyHash: hash });
  const outcome = await executeProviderComputeRun({
    workspaceConfig: directRegistryConfig(),
    trainingRunId: RUN_ID,
    computeAsk: ASK,
    priorCompute,
    attempt: 2,
    io: makeIo(adapter),
  });
  assert.equal(outcome.result.ok, false);
  assert.match(outcome.result.error, /active allocation conflict/);
  assert.equal(adapter.calls.allocate, 0);
  assert.equal(adapter.calls.execute, 0);
});

test("transient provider status failure stays pending, preserves allocation, and never triggers release", async () => {
  const adapter = fakeAdapter({ statusThrows: "ETIMEDOUT provider status" });
  const outcome = await executeProviderComputeRun({
    workspaceConfig: directRegistryConfig(),
    trainingRunId: RUN_ID,
    computeAsk: ASK,
    io: makeIo(adapter),
  });
  assert.equal(outcome.result.ok, true);
  assert.equal(outcome.result.exitCode, null);
  assert.equal(outcome.result.adapterMeta.compute.pending, true);
  assert.equal(outcome.result.adapterMeta.compute.remoteStateUnverified, true);
  assert.equal(adapter.calls.release, 0, "observation uncertainty never terminates a possibly-running paid job");
  const lifecycle = deriveComputeLifecycle({
    events: outcome.computeBlock.events,
    allocation: outcome.computeBlock.allocation,
    checkpoints: outcome.computeBlock.checkpoints,
  });
  assert.equal(lifecycle.terminal, "");
  assert.equal(lifecycle.capacityMayStillExist, true);
  assert.ok(outcome.computeBlock.events.some((event) => /remote-state-unverified/.test(event.detail)));
});

test("a long-running provider returns a bounded pending continuation instead of timing out as failure", async () => {
  const adapter = fakeAdapter({
    statusScript: (call, mk) => [mk("compute-running", `still-running-${call}`)],
  });
  const outcome = await executeProviderComputeRun({
    workspaceConfig: directRegistryConfig(),
    trainingRunId: RUN_ID,
    computeAsk: ASK,
    io: makeIo(adapter, { maxPolls: 1000 }),
  });
  assert.equal(outcome.result.ok, true);
  assert.equal(outcome.result.exitCode, null);
  assert.equal(outcome.result.adapterMeta.compute.pending, true);
  assert.equal(adapter.calls.status, 3, "one HTTP invocation is bounded to three observations");
  assert.equal(adapter.calls.release, 0);
  assert.equal(outcome.computeBlock.events.some((event) => event.type === "compute-failed"), false);
});

test("completed without an artifact is non-successful but release still runs", async () => {
  const adapter = fakeAdapter({ noArtifact: true });
  const outcome = await executeProviderComputeRun({
    workspaceConfig: directRegistryConfig(),
    trainingRunId: RUN_ID,
    computeAsk: ASK,
    authority: directAuthority(),
    datasetEvidence: directDeliveredDataset(),
    io: makeIo(adapter),
  });
  assert.equal(outcome.result.ok, false);
  assert.match(outcome.result.error, /no artifact/);
  assert.equal(outcome.result.adapterMeta.compute.artifactVerified, false);
  assert.equal(adapter.calls.release, 1);
});

// ---------------------------------------------------------------------------
// Monotonic journal and lifecycle controls
// ---------------------------------------------------------------------------

test("monotonic journal merge cannot erase allocation, checkpoints, artifact, or canonical evaluation", () => {
  const prior = {
    ...activePrior({ idempotencyKeyHash: "h".repeat(64), workSpecHash: WORK_SPEC_HASH }),
    checkpoints: [{
      checkpointId: "ck-1",
      runRef: { trainingRunId: RUN_ID, providerId: "fake-remote", providerResourceId: "pod-existing-1" },
      locator: "volume://checkpoint/1",
      sha256: "c".repeat(64),
      workSpecHash: WORK_SPEC_HASH,
    }],
    artifact: {
      runRef: { trainingRunId: RUN_ID, providerId: "fake-remote", providerResourceId: "pod-existing-1" },
      kind: "gguf",
      locator: "volume://artifact/model.gguf",
      sha256: "d".repeat(64),
      verifiedSha256: "d".repeat(64),
      sizeBytes: 100,
    },
    evaluation: {
      source: "workspace-canonical",
      benchmarkWins: { total: 5, wins: 4, winRatePct: 80, promoted: true },
    },
  };
  const merged = mergeComputeBlocks(prior, {
    decision: { schema: "growthub-compute-decision-v1", selectedProviderId: "fake-remote", candidates: [] },
    events: [],
    checkpoints: [],
    allocation: null,
    artifact: null,
    evaluation: null,
  });
  assert.equal(merged.allocation.allocationId, "alloc-existing-1");
  assert.equal(merged.checkpoints[0].checkpointId, "ck-1");
  assert.equal(merged.artifact.verifiedSha256, "d".repeat(64));
  assert.equal(merged.evaluation.source, "workspace-canonical");
});

test("applyComputeBlockToReceiptRows merges with live row state instead of overwriting it", () => {
  const prior = activePrior({ idempotencyKeyHash: "e".repeat(64) });
  const objects = directRegistryConfig({ receiptRow: receiptRowWith(prior) }).dataModel.objects;
  const stamped = applyComputeBlockToReceiptRows(objects, RUN_ID, {
    decision: { schema: "growthub-compute-decision-v1", selectedProviderId: "fake-remote", candidates: [] },
    events: [],
  });
  const row = stamped.find((object) => object.objectType === "model-training-run").rows[0];
  const parsed = parseReceiptComputeBlock(row);
  assert.equal(parsed.allocation.allocationId, "alloc-existing-1");
  assert.ok(parsed.events.some((event) => event.type === "compute-allocated"));
});

test("cancellation with failed release remains visibly unreleased and costly", async () => {
  const adapter = fakeAdapter({ releaseFails: true });
  const prior = activePrior({ idempotencyKeyHash: "f".repeat(64) });
  const outcome = await cancelProviderComputeRun({
    priorCompute: prior,
    provider: { providerId: "fake-remote", adapterId: "fake-remote-adapter", config: {} },
    io: makeIo(adapter),
  });
  assert.equal(outcome.cancelled, true);
  assert.equal(outcome.releaseConfirmed, false);
  assert.equal(outcome.capacityMayStillExist, true);
  assert.equal(outcome.costMayAccrue, true);
  assert.match(outcome.reason, /capacity may still exist/i);
  assert.ok(outcome.computeBlock.events.some((event) => event.type === "compute-release-failed"));
});

test("an empty cancel acknowledgement never fabricates a cancelled lifecycle", async () => {
  const adapter = fakeAdapter({ cancelNoEvidence: true });
  const prior = activePrior({ idempotencyKeyHash: "1".repeat(64) });
  const outcome = await cancelProviderComputeRun({
    priorCompute: prior,
    provider: { providerId: "fake-remote", adapterId: "fake-remote-adapter", config: {} },
    io: makeIo(adapter),
  });
  assert.equal(outcome.cancelled, false);
  assert.match(outcome.reason, /did not return verifiable cancellation evidence/);
});

test("resume persists intent before provider IO and adopts the provider's new active resource", async () => {
  const workSpecHash = WORK_SPEC_HASH;
  const runRef = {
    trainingRunId: RUN_ID,
    modelTrainingRowId: "workspace-local",
    providerId: "fake-remote",
    capacityProfileId: "single-gpu-finetune",
    providerResourceId: "pod-old",
  };
  const checkpoint = {
    checkpointId: "ck-resume-1",
    runRef,
    locator: "volume://checkpoint/resume-1",
    sha256: "9".repeat(64),
    step: 100,
    sizeBytes: 1000,
    createdAt: "t2",
    evidenceObservedAt: "t2",
    workSpecHash,
  };
  const prior = {
    capacityProfileId: "single-gpu-finetune",
    providerRegistryId: "fake-remote",
    workSpecHash,
    requirementsHash: "8".repeat(64),
    intent: { requirements: { workloadKind: "fine-tune", gpuCount: 1 } },
    workSpec: { workSpecHash },
    capabilities: { supportsResume: true },
    allocation: {
      allocationId: "alloc-old",
      runRef,
      status: "failed",
      idempotencyKeyHash: "7".repeat(64),
      availabilityMode: "on-demand",
      costBasis: { kind: "per-hour", unitUsd: 2, source: "" },
      requestedAt: "t0",
      allocatedAt: "t1",
      releasedAt: "",
      releaseConfirmed: false,
      allocated: null,
      workSpecHash,
    },
    events: [
      { type: "compute-requested", at: "t0", evidenceObservedAt: "t0", source: "workspace", runRef: { ...runRef, providerResourceId: "" }, providerEventId: "rq", detail: "" },
      { type: "compute-allocated", at: "t1", evidenceObservedAt: "t1", source: "provider", runRef, providerEventId: "al", detail: "", workSpecHash },
      { type: "compute-running", at: "t2", evidenceObservedAt: "t2", source: "provider", runRef, providerEventId: "rn", detail: "", workSpecHash },
      { type: "checkpoint-created", at: "t2", evidenceObservedAt: "t2", source: "provider", runRef, providerEventId: "ck", detail: "", workSpecHash },
      { type: "compute-failed", at: "t3", evidenceObservedAt: "t3", source: "provider", runRef, providerEventId: "fl", detail: "interrupted", workSpecHash },
    ],
    checkpoints: [checkpoint],
  };
  let persistedBeforeResume = false;
  const adapter = fakeAdapter({
    resumeResourceId: "pod-new-resume",
    onResume: () => { assert.equal(persistedBeforeResume, true, "resume intent was durable before provider call"); },
  });
  const io = makeIo(adapter, {
    onPersist: (_block, count) => { if (count >= 1) persistedBeforeResume = true; },
  });
  const outcome = await resumeProviderComputeRun({
    priorCompute: prior,
    provider: { providerId: "fake-remote", adapterId: "fake-remote-adapter", config: {} },
    checkpointId: checkpoint.checkpointId,
    io,
  });
  assert.equal(outcome.resumed, true, outcome.reason);
  assert.equal(adapter.calls.resume, 1);
  assert.equal(outcome.computeBlock.allocation.runRef.providerResourceId, "pod-new-resume");
  assert.equal(outcome.computeBlock.allocation.allocationId, "pod-new-resume");
  assert.equal(outcome.computeBlock.allocation.releaseConfirmed, false);
  assert.ok(outcome.computeBlock.events.some((event) => event.type === "compute-resuming"));
});

test("duplicate trainingRunId rows are never silently selected", () => {
  const row = receiptRowWith();
  const config = {
    dataModel: {
      objects: [
        { id: "runs-a", objectType: "model-training-run", rows: [row] },
        { id: "runs-b", objectType: "model-training-run", rows: [{ ...row }] },
      ],
    },
  };
  assert.equal(findTrainingRunReceiptRow(config, RUN_ID), null);
});

// ---------------------------------------------------------------------------
// Existing local lane and server authority hook
// ---------------------------------------------------------------------------

test("no compute request on the receipt returns null and leaves the existing local path untouched", async () => {
  const outcome = await maybeExecuteProviderComputeForSandboxRun({
    workspaceConfig: directRegistryConfig({ receiptRow: receiptRowWith() }),
    objectId: "model-training-runner",
    name: RUN_ID,
    io: makeIo(fakeAdapter()),
  });
  assert.equal(outcome, null);
});

test("direct local policy falls through before any remote capabilities, quote, allocation, or status call", async () => {
  const adapter = fakeAdapter({ describeFails: true, quoteFails: true });
  const outcome = await executeProviderComputeRun({
    workspaceConfig: directRegistryConfig(),
    trainingRunId: RUN_ID,
    computeAsk: {
      capacityProfileId: "cpu-local-finetune",
      providerRegistryId: "local-machine",
      selectionMode: "explicit",
      policy: { mode: "local", localOnly: true },
    },
    preflight: { ramGB: 32, diskFreeGB: 500, gpu: { present: false, vramFreeGB: 0 } },
    io: makeIo(adapter, { withLocal: true }),
  });
  assert.equal(outcome.localFallthrough, true);
  assert.equal(outcome.result, null);
  assert.equal(adapter.calls.describeCapabilities, 0);
  assert.equal(adapter.calls.inspectCapacity, 0);
  assert.equal(adapter.calls.allocate, 0);
  assert.equal(adapter.calls.status, 0);
});

test("no eligible remote realization blocks honestly", async () => {
  const adapter = fakeAdapter();
  const outcome = await executeProviderComputeRun({
    workspaceConfig: directRegistryConfig(),
    trainingRunId: RUN_ID,
    computeAsk: ASK,
    io: makeIo(adapter, { envPresent: () => false }),
  });
  assert.equal(outcome.result.ok, false);
  assert.match(outcome.result.error, /no eligible compute realization/);
  assert.match(outcome.result.error, /credential|FAKE_REMOTE_KEY/i);
  assert.equal(adapter.calls.allocate, 0);
});

const HOOK_ENV = { GROWTHUB_COMPUTE_AUTHORITY_KEY: "exec-suite-authority-key" };

function hookRequest(overrides = {}) {
  return {
    schema: "growthub-compute-request-v1",
    policy: { mode: "cloud", excludeLocal: true, budget: { mode: "advisory" } },
    selectionMode: "explicit",
    providerRegistryId: "fake-remote",
    capacityProfileId: "single-gpu-finetune",
    trainingProfileId: "unsloth-qlora-quantize-pipeline",
    baseModel: "gemma3:4b",
    datasetExportId: "dataset-test",
    datasetPath: "data/train.jsonl",
    outputModelTag: "workspace-tuned-v1",
    artifactPath: "artifacts/workspace-tuned-v1",
    estimatedDurationMinutes: 60,
    ...overrides,
  };
}

function hookWorkspaceConfig(request = hookRequest(), compute = null) {
  const runRow = receiptRowWith(compute, {
    baseModel: "gemma3:4b",
    trainingProfile: "unsloth-qlora-quantize-pipeline",
    datasetExportId: "dataset-test",
    computeRequest: JSON.stringify(request),
  });
  return {
    dataModel: {
      objects: [
        {
          id: "api-registry",
          objectType: "api-registry",
          rows: [
            providerRow(),
            {
              integrationId: "workspace-local-model",
              kind: "custom-model",
              expectedModelTag: "workspace-tuned-v1",
            },
          ],
        },
        {
          id: "model-training",
          objectType: "model-training",
          rows: [{
            Name: "workspace-local-v1",
            status: "prepared",
            lastExportId: "dataset-test",
            baseModel: "gemma3:4b",
            localModel: "workspace-tuned-v1",
            apiRegistryId: "workspace-local-model",
            lastExportSummary: JSON.stringify({ path: "data/train.jsonl", recordCount: 20 }),
          }],
        },
        { id: "model-training-run", objectType: "model-training-run", rows: [runRow] },
      ],
    },
  };
}

const HOOK_MANIFEST = {
  schema: "growthub-compute-dataset-manifest-v1",
  exportId: "dataset-test",
  manifestHash: "e".repeat(64),
  corpusSha256: "f".repeat(64),
  sizeBytes: 2048,
  recordCount: 20,
  binding: "materialized-bytes",
};

function hookIo(adapter, workspaceConfig, env = HOOK_ENV) {
  const io = makeIo(adapter);
  return {
    ...io,
    // Server-owned data plane, stubbed at the same io seam the production
    // route wires: materialized manifest → sealed grant → delivery receipt.
    materializeDataset: async () => ({ ok: true, manifest: { ...HOOK_MANIFEST } }),
    issueDatasetAccess: async ({ manifest, trainingRunId, workSpecHash }) => ({
      ok: true,
      access: { uri: "http://127.0.0.1:0/api/workspace/compute-data/test-token", workSpecHash, corpusSha256: manifest.corpusSha256, sizeBytes: manifest.sizeBytes },
      evidence: {
        schema: "growthub-compute-dataset-access-v1",
        tokenId: "token-hook",
        trainingRunId,
        workSpecHash,
        exportId: manifest.exportId,
        corpusSha256: manifest.corpusSha256,
        sizeBytes: manifest.sizeBytes,
        recordCount: manifest.recordCount,
        deliveryStatus: "issued",
      },
    }),
    verifyDatasetDelivery: async () => ({ ok: true, receipt: { deliveredAt: "2026-07-20T12:00:06.000Z" } }),
    compileAuthority: ({ trainingRunId, request, datasetManifest }) => compileComputeAuthority({
      workspaceConfig,
      trainingRunId,
      request,
      datasetManifest,
      now: "2026-07-20T12:00:00.000Z",
      env,
    }),
    verifyAuthority: (authority) => verifyComputeAuthorityAgainstWorkspace({
      workspaceConfig,
      trainingRunId: RUN_ID,
      authority,
      env,
    }),
  };
}

test("customer request compiles server authority and executes through the production route hook", async () => {
  const adapter = fakeAdapter();
  const workspaceConfig = hookWorkspaceConfig();
  const outcome = await maybeExecuteProviderComputeForSandboxRun({
    workspaceConfig,
    objectId: "model-training-runner",
    name: RUN_ID,
    io: hookIo(adapter, workspaceConfig),
  });
  assert.ok(outcome);
  assert.equal(outcome.result.ok, true, outcome.result.error);
  assert.equal(outcome.computeBlock.authority?.schema, COMPUTE_AUTHORITY_SCHEMA);
  assert.equal(verifyComputeAuthoritySeal(outcome.computeBlock.authority, HOOK_ENV).ok, true);
  assert.equal(adapter.calls.allocate, 1);
});

test("remote request is refused when the authority compiler is absent", async () => {
  const adapter = fakeAdapter();
  const workspaceConfig = hookWorkspaceConfig();
  const outcome = await maybeExecuteProviderComputeForSandboxRun({
    workspaceConfig,
    objectId: "model-training-runner",
    name: RUN_ID,
    io: { ...makeIo(adapter), materializeDataset: async () => ({ ok: true, manifest: { ...HOOK_MANIFEST } }) },
  });
  assert.equal(outcome.result.ok, false);
  assert.match(outcome.result.error, /authority compiler unavailable/);
  assert.equal(adapter.calls.allocate, 0);
});

test("remote request is refused under an ephemeral boot key", async () => {
  const adapter = fakeAdapter();
  const workspaceConfig = hookWorkspaceConfig();
  const outcome = await maybeExecuteProviderComputeForSandboxRun({
    workspaceConfig,
    objectId: "model-training-runner",
    name: RUN_ID,
    io: hookIo(adapter, workspaceConfig, {}),
  });
  assert.equal(outcome.result.ok, false);
  assert.match(outcome.result.error, /ephemeral key/);
  assert.equal(adapter.calls.allocate, 0);
});

test("journaled authority drift fails before any provider call", async () => {
  const originalConfig = hookWorkspaceConfig();
  const compiled = compileComputeAuthority({
    workspaceConfig: originalConfig,
    trainingRunId: RUN_ID,
    env: HOOK_ENV,
  });
  assert.equal(compiled.ok, true, compiled.reason);
  const drifted = hookWorkspaceConfig(hookRequest({ outputModelTag: "workspace-tuned-v2" }), {
    schema: "growthub-compute-evidence-v1",
    authority: compiled.authority,
  });
  const adapter = fakeAdapter();
  const outcome = await maybeExecuteProviderComputeForSandboxRun({
    workspaceConfig: drifted,
    objectId: "model-training-runner",
    name: RUN_ID,
    io: hookIo(adapter, drifted),
  });
  assert.equal(outcome.result.ok, false);
  assert.match(outcome.result.error, /changed after compute authority was sealed|output-identity-conflict/);
  assert.equal(adapter.calls.allocate, 0);
  assert.equal(adapter.calls.status, 0);
});

test("checkpoint normalizer still requires locator plus content identity", () => {
  assert.equal(normalizeComputeCheckpoint({ locator: "volume://x", sha256: "" }).resumable, false);
  assert.equal(normalizeComputeCheckpoint({ locator: "volume://x", sha256: "f".repeat(64) }).resumable, true);
});
