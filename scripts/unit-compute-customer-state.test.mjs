/**
 * Governed Compute Realization — customer-experience derivation (Sprint 10).
 *
 * Every visible compute state comes from ONE pure deriver over the same
 * receipts/derivers the runtime writes — no client-only state, no fabricated
 * progress. This suite proves every required customer state is derivable
 * from evidence, that customer language never leaks provider internals, and
 * that the policy → governed-ask mapping preserves the pure-local default.
 *
 * Run with: node --test scripts/unit-compute-customer-state.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kitApp = path.join(repoRoot, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const lib = (rel) => pathToFileURL(path.join(kitApp, "lib", rel)).href;

const {
  deriveComputeCustomerState,
  computeAskForPolicy,
  realizationLabel,
  COMPUTE_POLICIES,
  COMPUTE_CUSTOMER_STATES,
} = await import(lib("compute-customer-state.js"));
const { deriveCapacityPlan } = await import(lib("compute-capacity-profiles.js"));
const { buildAdaptiveStudentPlan } = await import(lib("distillation-student-plan.js"));
const { normalizeComputeBlock } = await import(lib("compute-evidence.js"));

const RUN_REF = { trainingRunId: "run1", modelTrainingRowId: "workspace-local", providerId: "cloud-a", capacityProfileId: "single-gpu-finetune", providerResourceId: "pod-1" };

function decisionWith({ selected = "cloud-a", candidates = [], budget = null } = {}) {
  return {
    schema: "growthub-compute-decision-v1",
    capacityProfileId: "single-gpu-finetune",
    requirements: null,
    budget: budget || { mode: "advisory", maxTotalUsd: 0, maxHourlyUsd: 0, allowUnknownCost: false },
    selectionMode: "auto",
    selectedProviderId: selected,
    selectedReasons: selected ? ["estimated $4.00 total"] : [],
    candidates,
    decidedAt: "2026-07-20T12:00:00.000Z",
    evidenceObservedAt: "2026-07-20T12:00:00.000Z",
  };
}

function ev(type, id, extra = {}) {
  return { type, at: "t", evidenceObservedAt: "t", source: "provider", runRef: RUN_REF, providerEventId: id, detail: "", ...extra };
}

const BASE_EVENTS = [
  { ...ev("compute-requested", ""), source: "workspace", runRef: { ...RUN_REF, providerResourceId: "" } },
  ev("compute-allocated", "e1"),
];

function blockWith({ events = [], checkpoints = [], artifact = null, decision = decisionWith() } = {}) {
  return normalizeComputeBlock({
    capacityProfileId: "single-gpu-finetune",
    providerRegistryId: "cloud-a",
    selectionMode: "auto",
    idempotencyKeyHash: "h",
    decision,
    allocation: {
      allocationId: "alloc1", runRef: RUN_REF, status: "allocated", idempotencyKeyHash: "h",
      availabilityMode: "on-demand", costBasis: { kind: "per-hour", unitUsd: 2, source: "" },
      requestedAt: "t", allocatedAt: "t", releasedAt: "", releaseConfirmed: false, allocated: null,
    },
    events: [...BASE_EVENTS, ...events],
    checkpoints,
    artifact,
    evidenceObservedAt: "t",
  });
}

const PROVEN_CKPT = { checkpointId: "ck1", runRef: RUN_REF, locator: "s3://ck/1", sha256: "a".repeat(64), step: 100, sizeBytes: 1, createdAt: "t", evidenceObservedAt: "t" };
const GOOD_ARTIFACT = { runRef: RUN_REF, kind: "gguf", locator: "s3://out/m.gguf", sha256: "b".repeat(64), sizeBytes: 1, evidenceObservedAt: "t" };

// ---------------------------------------------------------------------------

test("customer policies are the four required terms; local maps to NO governed ask", () => {
  assert.deepEqual(COMPUTE_POLICIES.map((p) => p.label), ["Automatic", "Local", "Cloud compute", "Reserved cluster"]);
  assert.equal(computeAskForPolicy("local"), null, "Local = the existing pipeline, byte-for-byte");
  assert.equal(computeAskForPolicy("automatic").selectionMode, "auto");
  assert.equal(computeAskForPolicy("reserved-cluster").capacityProfileId, "distributed-training");
  assert.equal(computeAskForPolicy(undefined), null, "unknown policy defaults to the safe local behavior");
});

test("REQUIRED STATES — every state in the contract list is derivable from evidence", () => {
  const capable = { ramGB: 32, diskFreeGB: 300, gpu: { present: false, name: "", vramFreeGB: 0 } };
  const weak = { ramGB: 4, diskFreeGB: 5, gpu: { present: false, name: "", vramFreeGB: 0 } };
  const planFor = (pf) => deriveCapacityPlan({ plan: buildAdaptiveStudentPlan({ preflight: pf }), preflight: pf, workloadKind: "fine-tune" });

  const seen = {};
  const record = (state) => { seen[state.stateId] = state; return state; };

  // Pre-execution
  assert.equal(record(deriveComputeCustomerState({ capacityPlan: null })).stateId, "checking-machine");
  assert.equal(record(deriveComputeCustomerState({ capacityPlan: planFor(capable) })).stateId, "local-eligible");
  const insufficient = record(deriveComputeCustomerState({
    capacityPlan: deriveCapacityPlan({ plan: { mode: "train-local", baseModel: "gemma3:1b" }, preflight: weak, workloadKind: "fine-tune" }),
    policy: "automatic",
  }));
  assert.equal(insufficient.stateId, "local-insufficient");
  assert.equal(insufficient.tone, "warn", "with a remote-permitting policy, insufficiency is a path, not a dead end");
  assert.equal(record(deriveComputeCustomerState({ capacityPlan: planFor(capable), policy: "cloud" })).stateId, "finding-capacity");

  // Decision-blocked
  assert.equal(record(deriveComputeCustomerState({
    computeBlock: blockWith({ decision: decisionWith({ selected: "", candidates: [{ providerId: "c", eligible: false, reasonCodes: ["over-budget"], reasons: ["$500 > $100"], rank: -1, quote: null }], budget: { mode: "hard-cap", maxTotalUsd: 100, maxHourlyUsd: 0, allowUnknownCost: false } }) }),
  })).stateId, "budget-blocked");
  assert.equal(record(deriveComputeCustomerState({
    computeBlock: blockWith({ decision: decisionWith({ selected: "", candidates: [{ providerId: "c", eligible: false, reasonCodes: ["credential-missing"], reasons: ["RUNPOD_API_KEY absent"], rank: -1, quote: null }] }) }),
  })).stateId, "provider-missing");
  assert.equal(record(deriveComputeCustomerState({
    computeBlock: blockWith({ decision: decisionWith({ selected: "", candidates: [{ providerId: "c", eligible: false, reasonCodes: ["capacity-unavailable"], reasons: ["no stock"], rank: -1, quote: null }] }) }),
  })).stateId, "capacity-unavailable");

  // Execution ladder
  assert.equal(record(deriveComputeCustomerState({ computeBlock: blockWith({ events: [] }) })).stateId, "allocating");
  assert.equal(record(deriveComputeCustomerState({ computeBlock: blockWith({ events: [ev("compute-queued", "q1")] }) })).stateId, "queued");
  assert.equal(record(deriveComputeCustomerState({ computeBlock: blockWith({ events: [ev("compute-running", "r1")] }) })).stateId, "running");
  assert.equal(record(deriveComputeCustomerState({
    computeBlock: blockWith({ events: [ev("compute-running", "r1"), ev("checkpoint-created", "c1")], checkpoints: [PROVEN_CKPT] }),
  })).stateId, "checkpoint-available");
  assert.equal(record(deriveComputeCustomerState({
    computeBlock: blockWith({ events: [ev("compute-running", "r1"), ev("compute-resuming", "rs1")], checkpoints: [PROVEN_CKPT] }),
  })).stateId, "resuming");
  assert.equal(record(deriveComputeCustomerState({
    computeBlock: blockWith({ events: [ev("compute-running", "r1"), ev("compute-cancelled", "x1")] }),
  })).stateId, "cancelling");
  assert.equal(record(deriveComputeCustomerState({
    computeBlock: blockWith({ events: [ev("compute-running", "r1"), ev("compute-completed", "d1"), { ...ev("compute-release-requested", "rr1"), source: "workspace" }] }),
  })).stateId, "release-pending");
  const releaseFailed = record(deriveComputeCustomerState({
    computeBlock: blockWith({ events: [ev("compute-running", "r1"), ev("compute-cancelled", "x1"), { ...ev("compute-release-requested", "rr1"), source: "workspace" }, { ...ev("compute-release-failed", "rf1"), source: "workspace" }] }),
  }));
  assert.equal(releaseFailed.stateId, "release-failed");
  assert.match(releaseFailed.label, /cost money/i, "release failure names the money risk");
  assert.equal(releaseFailed.release.risk, true);

  // Post-completion
  const done = (extra) => blockWith({ events: [ev("compute-running", "r1"), ev("compute-completed", "d1"), { ...ev("compute-release-requested", "rr"), source: "workspace" }, ev("compute-released", "rl1")], artifact: GOOD_ARTIFACT, ...extra });
  assert.equal(record(deriveComputeCustomerState({ computeBlock: done(), runtimeStage: "trained" })).stateId, "artifact-verifying");
  assert.equal(record(deriveComputeCustomerState({ computeBlock: done(), runtimeStage: "imported" })).stateId, "artifact-verifying");
  assert.equal(record(deriveComputeCustomerState({ computeBlock: done(), runtimeStage: "" })).stateId, "evaluating");
  assert.equal(record(deriveComputeCustomerState({ computeBlock: done(), benchmarkWins: { promoted: false, total: 8, wins: 3 } })).stateId, "retained");
  assert.equal(record(deriveComputeCustomerState({ computeBlock: done(), benchmarkWins: { promoted: true, total: 8, wins: 7 } })).stateId, "promoted");

  // Completeness: every required state was exercised above.
  for (const required of COMPUTE_CUSTOMER_STATES) {
    assert.ok(seen[required], `required customer state "${required}" must be derivable from evidence`);
  }
});

test("completed-without-artifact reads as a failed outcome, never success", () => {
  const state = deriveComputeCustomerState({
    computeBlock: blockWith({ events: [ev("compute-running", "r1"), ev("compute-completed", "d1")], artifact: null }),
  });
  assert.equal(state.tone, "bad");
  assert.match(state.detail, /no artifact/i);
});

test("customer language never leaks provider internals", () => {
  const states = [
    deriveComputeCustomerState({ computeBlock: blockWith({ events: [ev("compute-running", "r1")] }) }),
    deriveComputeCustomerState({ capacityPlan: deriveCapacityPlan({ plan: buildAdaptiveStudentPlan({ preflight: { ramGB: 32, diskFreeGB: 300, gpu: { present: false } } }), preflight: { ramGB: 32, diskFreeGB: 300, gpu: { present: false } } }) }),
  ];
  for (const state of states) {
    const customerText = `${state.label} ${state.detail} ${state.requiredCapacity} ${state.realization} ${state.budget.label} ${state.checkpoint.label} ${state.release.label}`;
    for (const internal of ["Ray", "KubeRay", "NCCL", "Kubernetes", "EKS", "CKS", "pod-", "GraphQL"]) {
      assert.ok(!customerText.includes(internal), `customer text leaks "${internal}": ${customerText}`);
    }
  }
});

test("realization labels are the customer vocabulary", () => {
  assert.equal(realizationLabel({ decision: { selectedProviderId: "local-machine" } }), "Local");
  assert.equal(realizationLabel({ decision: { selectedProviderId: "cw" }, providers: [{ providerId: "cw", availabilityModes: ["reserved"] }] }), "Reserved cluster");
  assert.equal(realizationLabel({ decision: { selectedProviderId: "rp" }, providers: [{ providerId: "rp", availabilityModes: ["on-demand"] }] }), "Cloud compute");
  assert.equal(realizationLabel({ decision: null }), "");
});

test("no fabricated progress: the derived state carries no percentage anywhere", () => {
  const state = deriveComputeCustomerState({ computeBlock: blockWith({ events: [ev("compute-running", "r1")] }) });
  assert.ok(!JSON.stringify(state).match(/"pct"|percent/i), "no invented compute progress numbers");
});

test("garbage never throws", () => {
  assert.ok(deriveComputeCustomerState());
  assert.ok(deriveComputeCustomerState({ computeBlock: "junk", capacityPlan: 42, providers: "x" }));
});
