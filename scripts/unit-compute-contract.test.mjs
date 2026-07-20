/**
 * Governed Compute Realization — shared contract tests (Sprint 1).
 *
 * Verifies the additive `@growthub/api-contract/compute` surface: the
 * vocabulary constants, the runtime guards, and the core invariant that the
 * contract can describe local, burst, warm, single-GPU, multi-GPU, and
 * distributed compute without naming a mandatory vendor.
 *
 * Imports the BUILT dist (committed alongside src per package convention) so
 * the test proves what npm consumers actually receive.
 *
 * Run with: node --test scripts/unit-compute-contract.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = await import(
  pathToFileURL(path.join(repoRoot, "packages/api-contract/dist/compute.js")).href
);

const {
  COMPUTE_WORKLOAD_KINDS,
  COMPUTE_AVAILABILITY_MODES,
  COMPUTE_CAPACITY_PROFILE_IDS,
  COMPUTE_ACCELERATOR_CLASSES,
  COMPUTE_ALLOCATION_STATUSES,
  COMPUTE_EVENT_TYPES,
  COMPUTE_PROVIDER_ROW_SCHEMA,
  COMPUTE_DECISION_SCHEMA,
  COMPUTE_EVIDENCE_SCHEMA,
  isComputeProviderRowMetadata,
  isComputeDecision,
  isComputeEvent,
  WORKSPACE_COMPUTE_CONTRACT_VERSION,
} = contract;

test("contract version sentinel is the additive literal 1", () => {
  assert.equal(WORKSPACE_COMPUTE_CONTRACT_VERSION, 1);
});

test("schema ids are the frozen v1 identifiers", () => {
  assert.equal(COMPUTE_PROVIDER_ROW_SCHEMA, "growthub-compute-provider-v1");
  assert.equal(COMPUTE_DECISION_SCHEMA, "growthub-compute-decision-v1");
  assert.equal(COMPUTE_EVIDENCE_SCHEMA, "growthub-compute-evidence-v1");
});

test("the governed capacity profiles are named, vendor-free", () => {
  assert.deepEqual([...COMPUTE_CAPACITY_PROFILE_IDS], [
    "harvest-only",
    "serve-local",
    "cpu-local-finetune",
    "burst-gpu",
    "warm-inference",
    "single-gpu-finetune",
    "multi-gpu-finetune",
    "distributed-training",
  ]);
  // No profile id names a vendor — profiles describe capacity shapes only.
  const vendorTokens = ["runpod", "modal", "aws", "hyperpod", "coreweave", "gcp", "azure", "lambda"];
  for (const id of COMPUTE_CAPACITY_PROFILE_IDS) {
    for (const vendor of vendorTokens) {
      assert.ok(!id.toLowerCase().includes(vendor), `profile "${id}" must not name vendor "${vendor}"`);
    }
  }
});

test("the 12 normalized compute lifecycle events are exactly the governed set", () => {
  assert.deepEqual([...COMPUTE_EVENT_TYPES], [
    "compute-requested",
    "compute-queued",
    "compute-allocated",
    "compute-running",
    "checkpoint-created",
    "compute-resuming",
    "compute-completed",
    "compute-failed",
    "compute-cancelled",
    "compute-release-requested",
    "compute-released",
    "compute-release-failed",
  ]);
});

test("availability modes cover local, burst, queued, warm, reserved, spot", () => {
  assert.deepEqual([...COMPUTE_AVAILABILITY_MODES], ["local", "on-demand", "queued", "warm", "reserved", "spot"]);
});

test("allocation statuses include the honest failure surfaces", () => {
  for (const s of ["release-failed", "release-pending", "cancelled", "failed"]) {
    assert.ok(COMPUTE_ALLOCATION_STATUSES.includes(s), `missing allocation status ${s}`);
  }
});

test("workload kinds cover the lifecycle without a vendor", () => {
  for (const k of ["training", "fine-tune", "evaluation", "conversion", "quantization", "data-prep", "inference-serve", "harvest"]) {
    assert.ok(COMPUTE_WORKLOAD_KINDS.includes(k), `missing workload kind ${k}`);
  }
});

test("accelerator classes are class floors, never provider SKUs", () => {
  assert.deepEqual([...COMPUTE_ACCELERATOR_CLASSES], ["none", "any-gpu", "consumer-gpu", "datacenter-gpu", "high-memory-gpu"]);
});

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

const validProviderMetadata = {
  schema: "growthub-compute-provider-v1",
  adapterId: "local-machine",
  capacityProfiles: ["serve-local", "single-gpu-finetune"],
  availabilityModes: ["local"],
  requiredEnv: [],
  executionLane: "sandbox-local",
};

test("isComputeProviderRowMetadata accepts a valid governed row block", () => {
  assert.equal(isComputeProviderRowMetadata(validProviderMetadata), true);
});

test("isComputeProviderRowMetadata rejects wrong schema, missing adapter, and garbage", () => {
  assert.equal(isComputeProviderRowMetadata(null), false);
  assert.equal(isComputeProviderRowMetadata({}), false);
  assert.equal(isComputeProviderRowMetadata({ ...validProviderMetadata, schema: "growthub-compute-provider-v2" }), false);
  assert.equal(isComputeProviderRowMetadata({ ...validProviderMetadata, adapterId: "" }), false);
  assert.equal(isComputeProviderRowMetadata({ ...validProviderMetadata, capacityProfiles: "burst-gpu" }), false);
  assert.equal(isComputeProviderRowMetadata({ ...validProviderMetadata, requiredEnv: undefined }), false);
  assert.equal(isComputeProviderRowMetadata("growthub-compute-provider-v1"), false);
});

test("isComputeDecision accepts a decision and rejects a schemaless claim", () => {
  const decision = {
    schema: "growthub-compute-decision-v1",
    capacityProfileId: "single-gpu-finetune",
    requirements: {},
    budget: { mode: "hard-cap", maxTotalUsd: 25, maxHourlyUsd: 0, allowUnknownCost: false },
    selectionMode: "auto",
    selectedProviderId: "local-machine",
    selectedReasons: ["local ownership"],
    candidates: [],
    decidedAt: "2026-07-20T00:00:00.000Z",
    evidenceObservedAt: "2026-07-20T00:00:00.000Z",
  };
  assert.equal(isComputeDecision(decision), true);
  assert.equal(isComputeDecision({ ...decision, schema: undefined }), false);
  assert.equal(isComputeDecision({ ...decision, candidates: null }), false);
  assert.equal(isComputeDecision(null), false);
});

test("isComputeEvent accepts normalized events only", () => {
  const event = {
    type: "compute-allocated",
    at: "2026-07-20T00:00:00.000Z",
    evidenceObservedAt: "2026-07-20T00:00:01.000Z",
    source: "provider",
    runRef: { trainingRunId: "trainrun_x", modelTrainingRowId: "workspace-local", providerId: "p", capacityProfileId: "burst-gpu", providerResourceId: "pod-1" },
    providerEventId: "",
    detail: "",
  };
  assert.equal(isComputeEvent(event), true);
  assert.equal(isComputeEvent({ ...event, type: "pod-created" }), false, "provider-native event names are not normalized events");
  assert.equal(isComputeEvent({ ...event, evidenceObservedAt: undefined }), false, "evidence observation stamp is mandatory");
  assert.equal(isComputeEvent(null), false);
});

// ---------------------------------------------------------------------------
// The core Sprint-1 exit proof: every capacity shape is describable without a
// mandatory vendor.
// ---------------------------------------------------------------------------

function requirementsFor(shape) {
  const base = {
    workloadKind: "fine-tune",
    acceleratorClass: "none",
    gpuCount: 0,
    minVramPerGpuGB: 0,
    minCpuCores: 2,
    minRamGB: 8,
    minDiskGB: 20,
    checkpointRequired: false,
    distributed: null,
    locality: { regions: [], dataResidency: "" },
    estimatedDurationMinutes: 0,
  };
  switch (shape) {
    case "local-cpu": return base;
    case "burst-single-gpu": return { ...base, acceleratorClass: "any-gpu", gpuCount: 1, minVramPerGpuGB: 24, checkpointRequired: true };
    case "warm-inference": return { ...base, workloadKind: "inference-serve", acceleratorClass: "datacenter-gpu", gpuCount: 1, minVramPerGpuGB: 40 };
    case "multi-gpu": return { ...base, acceleratorClass: "datacenter-gpu", gpuCount: 8, minVramPerGpuGB: 80, checkpointRequired: true };
    case "distributed": return {
      ...base,
      workloadKind: "training",
      acceleratorClass: "high-memory-gpu",
      gpuCount: 8,
      minVramPerGpuGB: 80,
      checkpointRequired: true,
      distributed: { workers: 4, gpusPerWorker: 8, gangScheduling: true, highBandwidthInterconnect: true },
    };
    default: throw new Error(`unknown shape ${shape}`);
  }
}

test("local, burst, warm, single-GPU, multi-GPU, and distributed shapes are all expressible vendor-free", () => {
  for (const shape of ["local-cpu", "burst-single-gpu", "warm-inference", "multi-gpu", "distributed"]) {
    const req = requirementsFor(shape);
    const serialized = JSON.stringify(req);
    for (const vendor of ["runpod", "modal", "aws", "coreweave", "hyperpod"]) {
      assert.ok(!serialized.toLowerCase().includes(vendor), `${shape} requirements leak vendor "${vendor}"`);
    }
    // Every shape rides the same decision/event/evidence grammar.
    const decision = {
      schema: COMPUTE_DECISION_SCHEMA,
      capacityProfileId: shape === "distributed" ? "distributed-training" : "burst-gpu",
      requirements: req,
      budget: { mode: "advisory", maxTotalUsd: 0, maxHourlyUsd: 0, allowUnknownCost: false },
      selectionMode: "auto",
      selectedProviderId: "",
      selectedReasons: [],
      candidates: [],
      decidedAt: "2026-07-20T00:00:00.000Z",
      evidenceObservedAt: "2026-07-20T00:00:00.000Z",
    };
    assert.equal(isComputeDecision(decision), true, `${shape} decision must validate`);
  }
});

test("quote timestamps and idempotency fields are first-class contract fields", async () => {
  // The dist .d.ts is committed; assert the declaration surface carries the
  // audit-critical fields so a consumer's type checker enforces them.
  const fs = await import("node:fs");
  const dts = fs.readFileSync(path.join(repoRoot, "packages/api-contract/dist/compute.d.ts"), "utf8");
  for (const field of ["quoteObservedAt", "quoteExpiresAt", "idempotencyKeyHash", "evidenceObservedAt", "costBasis", "releaseConfirmed"]) {
    assert.ok(dts.includes(field), `dist/compute.d.ts must declare ${field}`);
  }
});
