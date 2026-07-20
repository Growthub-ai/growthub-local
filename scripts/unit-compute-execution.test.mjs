/**
 * Governed Compute Realization — governed execution lifecycle (Sprint 5).
 *
 * Exit proofs:
 *   - replay protection: a repeated governed request never silently
 *     allocates duplicate capacity (fails closed);
 *   - provider says allocated → allocation evidence recorded;
 *   - provider says completed without artifact → run non-promotable;
 *   - cancellation with failed release remains visibly unreleased
 *     (capacityMayStillExist / costMayAccrue);
 *   - the existing local pipeline continues unchanged (no compute ask →
 *     null; resolver picks local → fallthrough);
 *   - forged/stale/duplicate provider events can never advance state.
 *
 * All IO injected — no network, no clock, no fs.
 *
 * Run with: node --test scripts/unit-compute-execution.test.mjs
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
  applyComputeBlockToReceiptRows,
  parseReceiptComputeBlock,
} = await import(lib("compute-execution.js"));
const { deriveComputeLifecycle, normalizeComputeCheckpoint, computeIdempotencyKey } = await import(lib("compute-evidence.js"));
const { buildComputeIntent, buildComputeWorkSpec } = await import(lib("compute-work-spec.js"));
const { default: localAdapter } = await import(lib("adapters/compute/default-local-machine.js"));

const NOW0 = Date.parse("2026-07-20T12:00:00.000Z");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RUN_ID = "trainrun_2026-07-20";

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

function workspaceConfigWith({ rows = [providerRow()], receiptRow = null } = {}) {
  const objects = [{ id: "api-registry", objectType: "api-registry", rows }];
  if (receiptRow) objects.push({ id: "model-training-run", objectType: "model-training-run", rows: [receiptRow] });
  return { dataModel: { objects } };
}

function receiptRowWith(compute) {
  return {
    Name: RUN_ID,
    trainingRunId: RUN_ID,
    modelTrainingRowId: "workspace-local",
    status: "running",
    preflight: { ramGB: 8, diskFreeGB: 40, gpu: { present: false, name: "", vramFreeGB: 0 } },
    ...(compute ? { compute: JSON.stringify(compute) } : {}),
  };
}

/** A well-behaved fake remote adapter whose behavior is scriptable. */
function fakeAdapter(script = {}) {
  const calls = { allocate: 0, execute: 0, resume: 0, status: 0, cancel: 0, release: 0, collectArtifact: 0 };
  const resourceId = script.resourceId ?? "pod-777";
  const adapter = {
    id: "fake-remote-adapter",
    label: "Fake remote",
    description: "",
    locality: "remote",
    calls,
    describeCapabilities() {
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
      return [{ type: "compute-queued", at: "2026-07-20T12:00:03.000Z", evidenceObservedAt: "2026-07-20T12:00:03.000Z", source: "provider", runRef: { ...ctx.runRef }, providerEventId: "ev-execute", detail: "exact work spec submitted" }];
    },
    async resume(ctx) {
      calls.resume += 1;
      return [{ type: "compute-resuming", at: "2026-07-20T12:00:03.000Z", evidenceObservedAt: "2026-07-20T12:00:03.000Z", source: "provider", runRef: { ...ctx.runRef }, providerEventId: "ev-resume", detail: "proven checkpoint submitted" }];
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
      if (script.statusScript) return script.statusScript(calls.status, mk, ctx);
      // Default: running then completed.
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
        sha256: script.artifactSha ?? "a".repeat(64),
        sizeBytes: 4_000_000_000,
        evidenceObservedAt: "2026-07-20T12:09:00.000Z",
      };
    },
    async cancel(ctx) {
      calls.cancel += 1;
      if (script.cancelFails) throw new Error("cancel rejected");
      return [{ type: "compute-cancelled", at: "2026-07-20T12:10:00.000Z", evidenceObservedAt: "2026-07-20T12:10:01.000Z", source: "provider", runRef: { ...ctx.runRef }, providerEventId: "ev-cancel", detail: "" }];
    },
    async release(ctx) {
      calls.release += 1;
      if (script.releaseFails) throw new Error("terminate returned 500");
      return [{ type: "compute-released", at: "2026-07-20T12:11:00.000Z", evidenceObservedAt: "2026-07-20T12:11:01.000Z", source: "provider", runRef: { ...ctx.runRef }, providerEventId: "ev-release", detail: "capacity terminated" }];
    },
  };
  return adapter;
}

function makeIo(adapter, { withLocal = false, envPresent = () => true } = {}) {
  let clock = NOW0;
  const adapters = { "fake-remote-adapter": adapter, ...(withLocal ? { "local-machine": localAdapter } : {}) };
  return {
    getAdapter: (id) => adapters[id] || null,
    listAdapterIds: () => Object.keys(adapters),
    envPresent,
    resolveEnv: () => "",
    fetchJson: async () => { throw new Error("no network in tests"); },
    now: () => { clock += 1000; return clock; },
    sleep: async () => {},
    maxPolls: 10,
    pollIntervalMs: 0,
    verifyArtifact: async (artifact) => ({ verifiedSha256: artifact.sha256, verificationKind: "test-materialized" }),
  };
}

const ASK = { capacityProfileId: "single-gpu-finetune", providerRegistryId: "", selectionMode: "auto" };

// ---------------------------------------------------------------------------
// Happy path + allocation evidence
// ---------------------------------------------------------------------------

test("EXIT PROOF — full lifecycle: allocate (evidence recorded) → running → completed → artifact → release", async () => {
  const adapter = fakeAdapter();
  const outcome = await executeProviderComputeRun({
    workspaceConfig: workspaceConfigWith({ receiptRow: receiptRowWith(null) }),
    trainingRunId: RUN_ID,
    computeAsk: ASK,
    io: makeIo(adapter),
  });
  assert.equal(outcome.localFallthrough, false);
  assert.equal(outcome.result.ok, true);
  assert.equal(outcome.result.exitCode, 0);
  const block = outcome.computeBlock;
  assert.equal(block.decision.selectedProviderId, "fake-remote");
  assert.equal(block.allocation.status, "allocated");
  assert.equal(block.allocation.idempotencyKeyHash.length > 0, true);
  const allocated = block.events.find((e) => e.type === "compute-allocated");
  assert.ok(allocated, "allocation evidence recorded as a normalized event");
  assert.equal(allocated.runRef.providerResourceId, "pod-777", "the provider resource identity IS the evidence");
  const lifecycle = deriveComputeLifecycle({ events: block.events, allocation: block.allocation });
  assert.equal(lifecycle.terminal, "completed");
  assert.equal(lifecycle.releaseConfirmed, true);
  assert.equal(lifecycle.capacityMayStillExist, false);
  assert.equal(adapter.calls.allocate, 1);
  assert.ok(!outcome.result.stdout.includes("pct"), "no invented progress percentage anywhere");
});

test("EXIT PROOF — replay protection: an unreleased allocation with the same governed identity refuses re-allocation", async () => {
  const adapter = fakeAdapter();
  const io = makeIo(adapter);
  const { hash } = computeIdempotencyKey({ trainingRunId: RUN_ID, attempt: 1, capacityProfileId: "single-gpu-finetune", providerId: "fake-remote" });
  const priorCompute = {
    capacityProfileId: "single-gpu-finetune",
    providerRegistryId: "fake-remote",
    selectionMode: "auto",
    idempotencyKeyHash: hash,
    allocation: {
      allocationId: "alloc-live-1",
      runRef: { trainingRunId: RUN_ID, modelTrainingRowId: "workspace-local", providerId: "fake-remote", capacityProfileId: "single-gpu-finetune", providerResourceId: "pod-1" },
      status: "running",
      idempotencyKeyHash: hash,
      availabilityMode: "on-demand",
      costBasis: { kind: "per-hour", unitUsd: 2, source: "" },
      requestedAt: "", allocatedAt: "2026-07-20T11:00:00.000Z", releasedAt: "",
      releaseConfirmed: false,
      allocated: null,
    },
    events: [],
  };
  const outcome = await executeProviderComputeRun({
    workspaceConfig: workspaceConfigWith({}),
    trainingRunId: RUN_ID,
    computeAsk: ASK,
    priorCompute,
    io,
  });
  assert.equal(outcome.result.ok, false);
  assert.match(outcome.result.error, /duplicate allocation refused/);
  assert.equal(adapter.calls.allocate, 0, "the adapter was never asked to allocate again");
  // An explicit governed retry (new attempt) IS allowed:
  const retry = await executeProviderComputeRun({
    workspaceConfig: workspaceConfigWith({}),
    trainingRunId: RUN_ID,
    computeAsk: ASK,
    priorCompute,
    attempt: 2,
    io: makeIo(fakeAdapter()),
  });
  assert.equal(retry.result.ok, true, "a new governed attempt is a new identity");
});

test("EXIT PROOF — provider completed without artifact → non-promotable, run not ok", async () => {
  const adapter = fakeAdapter({ noArtifact: true });
  const outcome = await executeProviderComputeRun({
    workspaceConfig: workspaceConfigWith({}),
    trainingRunId: RUN_ID,
    computeAsk: ASK,
    io: makeIo(adapter),
  });
  assert.equal(outcome.result.ok, false, "completion without an artifact is not success");
  assert.match(outcome.result.error, /no artifact/);
  assert.equal(outcome.result.adapterMeta.compute.terminal, "completed");
  assert.equal(outcome.result.adapterMeta.compute.promotable, false);
});

test("EXIT PROOF — cancellation with failed release remains visibly unreleased", async () => {
  const adapter = fakeAdapter({ releaseFails: true });
  const prior = {
    capacityProfileId: "single-gpu-finetune",
    idempotencyKeyHash: "h1",
    allocation: {
      allocationId: "alloc-9",
      runRef: { trainingRunId: RUN_ID, modelTrainingRowId: "", providerId: "fake-remote", capacityProfileId: "single-gpu-finetune", providerResourceId: "pod-9" },
      status: "running",
      idempotencyKeyHash: "h1",
      availabilityMode: "on-demand",
      costBasis: { kind: "per-hour", unitUsd: 2, source: "" },
      requestedAt: "", allocatedAt: "2026-07-20T11:00:00.000Z", releasedAt: "", releaseConfirmed: false, allocated: null,
    },
    events: [
      { type: "compute-requested", at: "2026-07-20T11:00:00.000Z", evidenceObservedAt: "2026-07-20T11:00:00.000Z", source: "workspace", runRef: { trainingRunId: RUN_ID, providerId: "fake-remote", capacityProfileId: "single-gpu-finetune", modelTrainingRowId: "", providerResourceId: "" }, providerEventId: "", detail: "" },
      { type: "compute-allocated", at: "2026-07-20T11:00:01.000Z", evidenceObservedAt: "2026-07-20T11:00:01.000Z", source: "provider", runRef: { trainingRunId: RUN_ID, providerId: "fake-remote", capacityProfileId: "single-gpu-finetune", modelTrainingRowId: "", providerResourceId: "pod-9" }, providerEventId: "e1", detail: "" },
    ],
  };
  const outcome = await cancelProviderComputeRun({
    priorCompute: prior,
    provider: { providerId: "fake-remote", adapterId: "fake-remote-adapter", config: {} },
    io: makeIo(adapter),
  });
  assert.equal(outcome.cancelled, true);
  assert.equal(outcome.releaseConfirmed, false);
  assert.equal(outcome.capacityMayStillExist, true, "state says capacity may still exist");
  assert.equal(outcome.costMayAccrue, true, "state says cost may still accrue");
  assert.match(outcome.reason, /capacity may still exist/i);
  const releaseFailedEvent = outcome.computeBlock.events.find((e) => e.type === "compute-release-failed");
  assert.ok(releaseFailedEvent, "the release failure is durable evidence");
});

// ---------------------------------------------------------------------------
// Existing local pipeline unchanged
// ---------------------------------------------------------------------------

test("EXIT PROOF — no compute ask on the receipt → null (existing local path, byte-for-byte)", async () => {
  const outcome = await maybeExecuteProviderComputeForSandboxRun({
    workspaceConfig: workspaceConfigWith({ receiptRow: receiptRowWith(null) }),
    objectId: "model-training-runner",
    name: RUN_ID,
    io: makeIo(fakeAdapter()),
  });
  assert.equal(outcome, null);
  const other = await maybeExecuteProviderComputeForSandboxRun({
    workspaceConfig: workspaceConfigWith({}),
    objectId: "some-other-sandbox",
    name: "anything",
    io: makeIo(fakeAdapter()),
  });
  assert.equal(other, null, "non-training sandboxes are untouched");
});

test("resolver choosing the LOCAL machine falls through to the existing local pipeline", async () => {
  // Capable local machine, no remote provider rows: the deterministic
  // resolver picks local-machine and the orchestrator declines to run.
  const preflight = { ramGB: 32, diskFreeGB: 500, gpu: { present: false, name: "", vramFreeGB: 0 } };
  const outcome = await executeProviderComputeRun({
    workspaceConfig: { dataModel: { objects: [] } },
    trainingRunId: RUN_ID,
    computeAsk: { capacityProfileId: "cpu-local-finetune", providerRegistryId: "", selectionMode: "auto" },
    preflight,
    io: makeIo(fakeAdapter(), { withLocal: true }),
  });
  assert.equal(outcome.localFallthrough, true, "local selection is NOT a provider-compute execution");
  assert.equal(outcome.result, null);
  assert.equal(outcome.computeBlock.decision.selectedProviderId, "local-machine");
});

test("no eligible realization blocks honestly with every candidate explained", async () => {
  const outcome = await executeProviderComputeRun({
    workspaceConfig: workspaceConfigWith({}),
    trainingRunId: RUN_ID,
    computeAsk: ASK,
    io: makeIo(fakeAdapter(), { envPresent: () => false }), // credential missing
  });
  assert.equal(outcome.result.ok, false);
  assert.match(outcome.result.error, /no eligible compute realization/);
  assert.match(outcome.result.error, /FAKE_REMOTE_KEY|credential/i);
});

// ---------------------------------------------------------------------------
// Forged / stale / duplicate event defenses (Sprint 5 hard invariants)
// ---------------------------------------------------------------------------

test("a forged running event with no allocation is refused and cannot advance state", () => {
  const runRef = { trainingRunId: RUN_ID, modelTrainingRowId: "", providerId: "p", capacityProfileId: "burst-gpu", providerResourceId: "" };
  const lifecycle = deriveComputeLifecycle({
    events: [
      { type: "compute-requested", at: "t", evidenceObservedAt: "t", source: "workspace", runRef, providerEventId: "", detail: "" },
      { type: "compute-running", at: "t", evidenceObservedAt: "t", source: "provider", runRef, providerEventId: "forge-1", detail: "" },
    ],
  });
  assert.equal(lifecycle.status, "requested");
  assert.equal(lifecycle.refused.length, 1);
  assert.match(lifecycle.refused[0].reason, /forged|no applied allocation/);
});

test("a forged completion with no running state is refused", () => {
  const runRef = { trainingRunId: RUN_ID, modelTrainingRowId: "", providerId: "p", capacityProfileId: "burst-gpu", providerResourceId: "pod-1" };
  const lifecycle = deriveComputeLifecycle({
    events: [
      { type: "compute-requested", at: "t", evidenceObservedAt: "t", source: "workspace", runRef: { ...runRef, providerResourceId: "" }, providerEventId: "", detail: "" },
      { type: "compute-allocated", at: "t", evidenceObservedAt: "t", source: "provider", runRef, providerEventId: "e1", detail: "" },
      { type: "compute-completed", at: "t", evidenceObservedAt: "t", source: "provider", runRef, providerEventId: "e2", detail: "" },
    ],
  });
  assert.equal(lifecycle.terminal, "", "completion never applied");
  assert.ok(lifecycle.refused.some((r) => /forged completion/.test(r.reason)));
});

test("duplicate provider event ids are replay-refused; allocation without resource id is refused", () => {
  const runRef = { trainingRunId: RUN_ID, modelTrainingRowId: "", providerId: "p", capacityProfileId: "burst-gpu", providerResourceId: "pod-1" };
  const bare = { ...runRef, providerResourceId: "" };
  const lifecycle = deriveComputeLifecycle({
    events: [
      { type: "compute-requested", at: "t", evidenceObservedAt: "t", source: "workspace", runRef: bare, providerEventId: "", detail: "" },
      { type: "compute-allocated", at: "t", evidenceObservedAt: "t", source: "provider", runRef: bare, providerEventId: "e-noevidence", detail: "" },
      { type: "compute-allocated", at: "t", evidenceObservedAt: "t", source: "provider", runRef, providerEventId: "e1", detail: "" },
      { type: "compute-running", at: "t", evidenceObservedAt: "t", source: "provider", runRef, providerEventId: "e2", detail: "" },
      { type: "compute-running", at: "t", evidenceObservedAt: "t", source: "provider", runRef, providerEventId: "e2", detail: "replayed" },
    ],
  });
  assert.ok(lifecycle.refused.some((r) => /allocation claimed without allocation evidence/.test(r.reason)));
  assert.ok(lifecycle.refused.some((r) => /duplicate provider event id/.test(r.reason)));
  assert.equal(lifecycle.status, "running");
  assert.equal(lifecycle.applied.filter((e) => e.type === "compute-running").length, 1);
});

test("resume requires a PROVEN checkpoint; a claimed checkpoint without identity is not resumable", () => {
  const runRef = { trainingRunId: RUN_ID, modelTrainingRowId: "", providerId: "p", capacityProfileId: "single-gpu-finetune", providerResourceId: "pod-1" };
  const events = [
    { type: "compute-requested", at: "t", evidenceObservedAt: "t", source: "workspace", runRef, providerEventId: "", detail: "" },
    { type: "compute-allocated", at: "t", evidenceObservedAt: "t", source: "provider", runRef, providerEventId: "e1", detail: "" },
    { type: "compute-running", at: "t", evidenceObservedAt: "t", source: "provider", runRef, providerEventId: "e2", detail: "" },
    { type: "compute-resuming", at: "t", evidenceObservedAt: "t", source: "provider", runRef, providerEventId: "e3", detail: "" },
  ];
  const unproven = deriveComputeLifecycle({ events, checkpoints: [{ checkpointId: "ck1", locator: "", sha256: "" }] });
  assert.ok(unproven.refused.some((r) => /no proven checkpoint/.test(r.reason)));
  const proven = deriveComputeLifecycle({ events, checkpoints: [{ checkpointId: "ck1", locator: "vol://ck-100", sha256: "b".repeat(64), step: 100 }] });
  assert.equal(proven.refused.some((r) => /no proven checkpoint/.test(r.reason)), false);
  assert.equal(proven.resumed, true);
  assert.equal(normalizeComputeCheckpoint({ locator: "vol://x", sha256: "" }).resumable, false);
});

// ---------------------------------------------------------------------------
// Receipt persistence round-trip
// ---------------------------------------------------------------------------

test("compute block round-trips through the governed receipt row (JSON column)", async () => {
  const adapter = fakeAdapter();
  const outcome = await executeProviderComputeRun({
    workspaceConfig: workspaceConfigWith({ receiptRow: receiptRowWith(null) }),
    trainingRunId: RUN_ID,
    computeAsk: ASK,
    io: makeIo(adapter),
  });
  const objects = workspaceConfigWith({ receiptRow: receiptRowWith(null) }).dataModel.objects;
  const stamped = applyComputeBlockToReceiptRows(objects, RUN_ID, outcome.computeBlock);
  assert.ok(stamped, "receipt row updated");
  const row = stamped.find((o) => o.objectType === "model-training-run").rows[0];
  const parsed = parseReceiptComputeBlock(row);
  assert.equal(parsed.decision.selectedProviderId, "fake-remote");
  assert.equal(parsed.allocation.allocationId, outcome.computeBlock.allocation.allocationId);
  assert.equal(parsed.events.length, outcome.computeBlock.events.length);
  // Secret-free by construction:
  assert.ok(!JSON.stringify(parsed).includes("FAKE_REMOTE_KEY_VALUE"));
});

test("a run whose receipt carries a compute ask executes provider compute through the route hook", async () => {
  const adapter = fakeAdapter();
  const requirements = { workloadKind: "fine-tune", acceleratorClass: "any-gpu", gpuCount: 1, minVramPerGpuGB: 24, minCpuCores: 4, minRamGB: 16, minDiskGB: 60, checkpointRequired: true, distributed: null, locality: { regions: [], dataResidency: "" }, estimatedDurationMinutes: 60 };
  const runConfig = { profileId: "unsloth-qlora-quantize-pipeline", runnerMode: "pipeline", baseModel: "gemma3:4b", teacherModel: "", quantization: "q4_k_m", steps: [], datasetPath: "data/train.jsonl", outputModelTag: "workspace-tuned-v1", artifactPath: "artifacts/run" };
  const intent = buildComputeIntent({ adaptivePlan: { mode: "train-local", tier: "test", baseModel: runConfig.baseModel }, capacityPlan: { capacityProfileId: "single-gpu-finetune", requirements }, policy: { mode: "cloud", excludeLocal: true }, trainingRunConfig: runConfig });
  const workSpec = buildComputeWorkSpec({ intent, trainingRunConfig: runConfig, trainingRunId: RUN_ID, modelTrainingRowId: "workspace-local", datasetExportId: "dataset-test", corpusSha256: "a".repeat(64) });
  const outcome = await maybeExecuteProviderComputeForSandboxRun({
    workspaceConfig: workspaceConfigWith({ receiptRow: receiptRowWith({ capacityProfileId: "single-gpu-finetune", providerRegistryId: "fake-remote", selectionMode: "explicit", intent, workSpec, policy: intent.policy }) }),
    objectId: "model-training-runner",
    name: RUN_ID,
    io: makeIo(adapter),
  });
  assert.ok(outcome, "compute ask engages the provider-compute lane");
  assert.equal(outcome.result.ok, true);
  assert.equal(outcome.computeBlock.decision.selectionMode, "explicit");
  assert.equal(adapter.calls.release, 1, "capacity released after completion");
});
