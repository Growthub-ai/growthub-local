import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = path.join(root, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const lib = (name) => pathToFileURL(path.join(app, "lib", name)).href;
const { executeProviderComputeRun } = await import(lib("compute-execution.js"));
const { buildComputeIntent, buildComputeWorkSpec, hashComputeValue } = await import(lib("compute-work-spec.js"));

const TRAINING_RUN_ID = "trainrun-observer";
const PROVIDER_ID = "remote-observer";
const REQUIREMENTS = {
  workloadKind: "fine-tune",
  acceleratorClass: "any-gpu",
  gpuCount: 1,
  minVramPerGpuGB: 16,
  minCpuCores: 4,
  minRamGB: 16,
  minDiskGB: 60,
  checkpointRequired: true,
  distributed: null,
  locality: { regions: [], dataResidency: "" },
  estimatedDurationMinutes: 60,
};
const RUN_CONFIG = {
  profileId: "unsloth-qlora-quantize-pipeline",
  runnerMode: "provider-compute",
  baseModel: "gemma3:4b",
  teacherModel: "",
  quantization: "q4_k_m",
  steps: [{ stageId: "fine-tuning", label: "Fine-tune", bin: "trainer", args: ["--run"] }],
  datasetPath: "data/export-observer.jsonl",
  outputModelTag: "observer-tuned-v1",
  artifactPath: "artifacts/observer-tuned-v1",
  importProof: { acceptedTypes: ["gguf"] },
};
const intent = buildComputeIntent({
  adaptivePlan: { mode: "train-remote", tier: "test", baseModel: RUN_CONFIG.baseModel },
  capacityPlan: { capacityProfileId: "single-gpu-finetune", requirements: REQUIREMENTS },
  policy: { mode: "cloud", excludeLocal: true, budget: { mode: "advisory" } },
  trainingRunConfig: RUN_CONFIG,
});
const workSpec = buildComputeWorkSpec({
  intent,
  trainingRunConfig: RUN_CONFIG,
  trainingRunId: TRAINING_RUN_ID,
  modelTrainingRowId: "workspace-local",
  datasetExportId: "export-observer",
  corpusSha256: "d".repeat(64),
});
const authorityBody = {
  schema: "growthub-compute-authority-v1",
  version: 1,
  trainingRunId: TRAINING_RUN_ID,
  modelTrainingRowId: "workspace-local",
  intent,
  workSpec,
  intentHash: intent.intentHash,
  requirementsHash: intent.requirementsHash,
  workSpecHash: workSpec.workSpecHash,
  compiledBy: "workspace-server",
};
const AUTHORITY = { ...authorityBody, authorityHash: hashComputeValue(authorityBody), keyId: "wsk-test", seal: "test-seal" };

function workspaceConfig() {
  return {
    dataModel: {
      objects: [
        {
          id: "api-registry",
          objectType: "api-registry",
          rows: [{
            integrationId: PROVIDER_ID,
            status: "registered",
            metadata: {
              computeProvider: {
                schema: "growthub-compute-provider-v1",
                adapterId: "observer-adapter",
                capacityProfiles: ["single-gpu-finetune"],
                availabilityModes: ["on-demand"],
                requiredEnv: [],
                executionLane: "sandbox-local",
                config: {},
              },
            },
          }],
        },
        {
          id: "model-training-run",
          objectType: "model-training-run",
          rows: [{ trainingRunId: TRAINING_RUN_ID, modelTrainingRowId: "workspace-local" }],
        },
      ],
    },
  };
}

function adapterAndCalls() {
  const calls = { inspect: 0, reconcile: 0, allocate: 0, execute: 0, status: 0, release: 0 };
  const event = (type, ctx, id) => ({
    type,
    at: "2026-07-21T03:00:00.000Z",
    evidenceObservedAt: "2026-07-21T03:00:00.000Z",
    source: "provider",
    runRef: { ...ctx.runRef, providerResourceId: "resource-observer" },
    providerEventId: id,
    detail: type,
    workSpecHash: ctx.workSpecHash,
    requirementsHash: ctx.requirementsHash,
  });
  const adapter = {
    id: "observer-adapter",
    describeCapabilities() {
      return {
        providerId: PROVIDER_ID,
        adapterId: "observer-adapter",
        capacityProfiles: ["single-gpu-finetune"],
        availabilityModes: ["on-demand"],
        acceleratorClasses: ["any-gpu"],
        maxVramPerGpuGB: 80,
        maxGpusPerWorker: 8,
        maxWorkers: 1,
        supportsCheckpointing: true,
        supportsResume: true,
        supportsGangScheduling: false,
        regions: [],
        requiredEnv: [],
        allocationIdempotency: "guaranteed",
      };
    },
    async inspectCapacity(ctx) {
      calls.inspect += 1;
      return {
        providerId: PROVIDER_ID,
        capacityProfileId: ctx.capacityProfileId,
        available: true,
        availabilityMode: "on-demand",
        costBasis: { kind: "per-hour", unitUsd: 1, source: "test" },
        estimatedTotalUsd: 1,
        queueLatencySeconds: 0,
        quoteObservedAt: "2026-07-21T03:00:00.000Z",
        quoteExpiresAt: "2026-07-21T04:00:00.000Z",
        quoteRef: "quote",
      };
    },
    async reconcile() { calls.reconcile += 1; return null; },
    async allocate(ctx) {
      calls.allocate += 1;
      return {
        allocationId: "allocation-observer",
        runRef: { ...ctx.runRef, providerResourceId: "resource-observer" },
        status: "allocated",
        idempotencyKeyHash: ctx.idempotencyKeyHash,
        availabilityMode: "on-demand",
        costBasis: { kind: "per-hour", unitUsd: 1, source: "test" },
        requestedAt: "2026-07-21T03:00:00.000Z",
        allocatedAt: "2026-07-21T03:00:00.000Z",
        releasedAt: "",
        releaseConfirmed: false,
        allocated: { gpuType: "A100", gpuCount: 1, workers: 1, region: "" },
      };
    },
    async execute(ctx) { calls.execute += 1; return [event("compute-queued", ctx, "queued")]; },
    async status(ctx) { calls.status += 1; return [event("compute-queued", ctx, `queued-${calls.status}`)]; },
    async collectArtifact() { return null; },
    async cancel() { return []; },
    async release() { calls.release += 1; return []; },
  };
  return { adapter, calls };
}

function io(adapter, readiness) {
  let clock = Date.parse("2026-07-21T03:00:00.000Z");
  return {
    getAdapter: (id) => id === "observer-adapter" ? adapter : null,
    listAdapterIds: () => ["observer-adapter"],
    envPresent: () => true,
    resolveEnv: () => "",
    fetchJson: async () => ({}),
    now: () => { clock += 1000; return clock; },
    sleep: async () => {},
    maxPolls: 1,
    pollIntervalMs: 0,
    requireDurableObservation: true,
    observationSchedulerReady: readiness,
    persistCompute: async () => {},
  };
}

test("production-style remote execution refuses paid allocation without durable observer", async () => {
  const { adapter, calls } = adapterAndCalls();
  const outcome = await executeProviderComputeRun({
    workspaceConfig: workspaceConfig(),
    trainingRunId: TRAINING_RUN_ID,
    computeAsk: { selectionMode: "explicit", providerRegistryId: PROVIDER_ID, policy: intent.policy },
    priorCompute: null,
    requireAuthority: true,
    authority: AUTHORITY,
    io: io(adapter, false),
  });
  assert.equal(outcome.result.ok, false);
  assert.match(outcome.result.error, /durable-observation-unavailable/);
  assert.equal(outcome.computeBlock.observation.lastErrorCode, "observation-scheduler-unavailable");
  assert.equal(calls.allocate, 0, "no paid allocation crosses an unobserved production boundary");
  assert.equal(calls.execute, 0);
  assert.equal(calls.status, 0);
});

test("ready durable observer permits one bounded lifecycle continuation", async () => {
  const { adapter, calls } = adapterAndCalls();
  const outcome = await executeProviderComputeRun({
    workspaceConfig: workspaceConfig(),
    trainingRunId: TRAINING_RUN_ID,
    computeAsk: { selectionMode: "explicit", providerRegistryId: PROVIDER_ID, policy: intent.policy },
    priorCompute: null,
    requireAuthority: true,
    authority: AUTHORITY,
    io: io(adapter, true),
  });
  assert.equal(outcome.result.ok, true, outcome.result.error);
  assert.equal(outcome.result.adapterMeta.compute.pending, true);
  assert.equal(calls.allocate, 1);
  assert.equal(calls.execute, 1);
  assert.equal(calls.status, 1);
  assert.equal(calls.release, 0, "pending remote work is never released as if terminal");
});
