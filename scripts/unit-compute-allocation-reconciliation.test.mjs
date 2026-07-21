import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = path.join(root, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const lib = (name) => pathToFileURL(path.join(app, "lib", name)).href;

const { executeProviderComputeRun } = await import(lib("compute-execution.js"));
const { buildComputeIntent, buildComputeWorkSpec } = await import(lib("compute-work-spec.js"));

const RUN_ID = "trainrun-reconcile";
const PROVIDER_ID = "reconcile-provider";

function authority() {
  const requirements = {
    workloadKind: "fine-tune", acceleratorClass: "any-gpu", gpuCount: 1,
    minVramPerGpuGB: 16, minCpuCores: 4, minRamGB: 16, minDiskGB: 60,
    checkpointRequired: true, distributed: null,
    locality: { regions: [], dataResidency: "" }, estimatedDurationMinutes: 10,
  };
  const trainingRunConfig = {
    profileId: "unsloth-qlora-quantize-pipeline", runnerMode: "provider-compute",
    baseModel: "gemma3:4b", teacherModel: "", quantization: "q4_k_m",
    steps: [{ stageId: "fine-tuning", label: "Fine tune", bin: "python", args: ["train.py"] }],
    datasetPath: "data/reconcile.jsonl", outputModelTag: "reconcile-model",
    artifactPath: "artifacts/reconcile-model", importProof: { acceptedTypes: ["gguf"] },
  };
  const intent = buildComputeIntent({
    adaptivePlan: { mode: "train-remote", tier: "small", baseModel: trainingRunConfig.baseModel },
    capacityPlan: { capacityProfileId: "single-gpu-finetune", requirements },
    policy: { mode: "cloud", excludeLocal: true, budget: { mode: "hard-cap", maxTotalUsd: 10, maxHourlyUsd: 10, allowUnknownCost: false } },
    trainingRunConfig,
  });
  const workSpec = buildComputeWorkSpec({
    intent, trainingRunConfig, trainingRunId: RUN_ID,
    modelTrainingRowId: "workspace-local", datasetExportId: "export-reconcile",
    corpusSha256: "d".repeat(64),
  });
  return { schema: "growthub-compute-authority-v1", intent, workSpec, intentHash: intent.intentHash, requirementsHash: intent.requirementsHash, workSpecHash: workSpec.workSpecHash };
}

function workspace() {
  return { dataModel: { objects: [
    { id: "api-registry", objectType: "api-registry", rows: [{
      integrationId: PROVIDER_ID, Name: "Reconcile provider", status: "registered",
      metadata: { computeProvider: {
        schema: "growthub-compute-provider-v1", adapterId: "reconcile-adapter",
        capacityProfiles: ["single-gpu-finetune"], availabilityModes: ["on-demand"],
        requiredEnv: [], executionLane: "sandbox-local", config: {},
      } },
    }] },
    { id: "model-training-run", objectType: "model-training-run", rows: [{ trainingRunId: RUN_ID, modelTrainingRowId: "workspace-local" }] },
  ] } };
}

function baseAdapter(overrides = {}) {
  return {
    id: "reconcile-adapter", locality: "remote",
    describeCapabilities() {
      return {
        providerId: PROVIDER_ID, adapterId: "reconcile-adapter",
        capacityProfiles: ["single-gpu-finetune"], availabilityModes: ["on-demand"],
        acceleratorClasses: ["any-gpu"], maxVramPerGpuGB: 80, maxGpusPerWorker: 1,
        maxWorkers: 1, supportsCheckpointing: true, supportsResume: true,
        supportsGangScheduling: false, regions: [], requiredEnv: [],
      };
    },
    async inspectCapacity(ctx) {
      return {
        providerId: PROVIDER_ID, capacityProfileId: ctx.capacityProfileId, available: true,
        availabilityMode: "on-demand", costBasis: { kind: "per-hour", unitUsd: 1, source: "test" },
        estimatedTotalUsd: 1, queueLatencySeconds: 0,
        quoteObservedAt: "2026-07-21T12:00:00.000Z", quoteExpiresAt: "2026-07-21T13:00:00.000Z", quoteRef: "test",
      };
    },
    async execute(ctx) {
      return [{ type: "compute-queued", at: "2026-07-21T12:00:01.000Z", evidenceObservedAt: "2026-07-21T12:00:01.000Z", source: "provider", runRef: ctx.runRef, providerEventId: "queued-1", detail: "queued" }];
    },
    async status(ctx) {
      return [{ type: "compute-running", at: "2026-07-21T12:00:02.000Z", evidenceObservedAt: "2026-07-21T12:00:02.000Z", source: "provider", runRef: ctx.runRef, providerEventId: "running-1", detail: "running" }];
    },
    async resume() { return []; }, async cancel() { return []; }, async release() { return []; },
    ...overrides,
  };
}

function io(adapter) {
  let clock = Date.parse("2026-07-21T12:00:00.000Z");
  return {
    getAdapter: (id) => id === "reconcile-adapter" ? adapter : null,
    listAdapterIds: () => ["reconcile-adapter"], envPresent: () => true,
    resolveEnv: () => "", fetchJson: async () => { throw new Error("network is adapter-owned in this test"); },
    now: () => { clock += 1000; return clock; }, sleep: async () => {},
    maxPolls: 1, pollIntervalMs: 0, persistCompute: async (block) => block,
  };
}

function run(adapter, priorCompute = null) {
  const sealed = authority();
  return executeProviderComputeRun({
    workspaceConfig: workspace(), trainingRunId: RUN_ID,
    computeAsk: { capacityProfileId: "single-gpu-finetune", providerRegistryId: PROVIDER_ID, selectionMode: "explicit", policy: sealed.intent.policy },
    priorCompute, requireAuthority: true, authority: sealed,
    datasetAccess: { uri: "https://workspace.example/dataset", corpusSha256: sealed.workSpec.dataset.corpusSha256 },
    datasetEvidence: { schema: "growthub-compute-dataset-access-v1", tokenId: "token-1", corpusSha256: sealed.workSpec.dataset.corpusSha256, deliveryStatus: "issued" },
    io: io(adapter),
  });
}

test("ambiguous provider acceptance is reconciled and adopted without a second provider create", async () => {
  let accepted = false;
  let providerCreates = 0;
  let allocateCalls = 0;
  let reconcileCalls = 0;
  const adapter = baseAdapter({
    async allocate() {
      allocateCalls += 1;
      if (!accepted) providerCreates += 1;
      accepted = true;
      throw new Error("ECONNRESET after provider accepted allocation");
    },
    async reconcile(ctx) {
      reconcileCalls += 1;
      if (!accepted) return null;
      return {
        allocationId: "alloc-reconciled", runRef: { ...ctx.runRef, providerResourceId: "resource-reconciled" },
        status: "allocated", idempotencyKeyHash: ctx.idempotencyKeyHash, availabilityMode: "on-demand",
        costBasis: { kind: "per-hour", unitUsd: 1, source: "test-reconcile" },
        requestedAt: "2026-07-21T12:00:00.000Z", allocatedAt: "2026-07-21T12:00:01.000Z",
        releasedAt: "", releaseConfirmed: false,
        allocated: { gpuType: "A100", gpuCount: 1, workers: 1, region: "" }, reconciled: true,
      };
    },
  });
  const first = await run(adapter);
  assert.equal(allocateCalls, 1);
  assert.equal(providerCreates, 1);
  assert.equal(reconcileCalls, 1, "the ambiguous response is reconciled immediately");
  assert.equal(first.computeBlock.allocation.allocationId, "alloc-reconciled");
  assert.equal(first.computeBlock.allocation.reconciled, true);
  assert.equal(first.computeBlock.events.some((event) => event.type === "compute-failed"), false);
  await run(adapter, first.computeBlock);
  assert.equal(allocateCalls, 1, "continuation observes the adopted resource and never allocates again");
  assert.equal(providerCreates, 1, "only one provider resource was ever created");
});

test("ambiguous allocation without reconciliation remains pending and is never retried automatically", async () => {
  let allocateCalls = 0;
  const adapter = baseAdapter({ async allocate() { allocateCalls += 1; throw new Error("timeout after submit"); } });
  delete adapter.reconcile;
  const first = await run(adapter);
  assert.equal(first.result.ok, true, "the governed request is accepted but remains non-terminal");
  assert.equal(first.result.adapterMeta.compute.pending, true);
  assert.equal(first.result.adapterMeta.compute.remoteStateUnverified, true);
  assert.match(first.result.adapterMeta.compute.reason, /allocation-state-unverified/);
  assert.equal(allocateCalls, 1);
  const second = await run(adapter, first.computeBlock);
  assert.equal(second.result.adapterMeta.compute.pending, true);
  assert.equal(second.result.adapterMeta.compute.remoteStateUnverified, true);
  assert.equal(allocateCalls, 1, "unverified prior acceptance blocks a second paid create");
});
