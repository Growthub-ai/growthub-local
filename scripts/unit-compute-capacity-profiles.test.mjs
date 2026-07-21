/**
 * Governed Compute Realization — Capacity Profiles + requirement derivation
 * (Sprint 2). Pure-deriver invariants:
 *
 *   - the runtime vocabulary mirrors the shared contract exactly;
 *   - the training planner decides WHAT, this layer only decides PLACEMENT;
 *   - a small student that fits locally resolves to a local-compatible
 *     profile; an 80 GB ask against a 24 GB GPU makes local ineligible with
 *     the exact reason; an impossible plan never claims local readiness;
 *   - harvest-only stays honest when no execution realization qualifies.
 *
 * Run with: node --test scripts/unit-compute-capacity-profiles.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kitApp = path.join(repoRoot, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const lib = (rel) => pathToFileURL(path.join(kitApp, "lib", rel)).href;

const {
  COMPUTE_CAPACITY_PROFILES,
  COMPUTE_CAPACITY_PROFILE_IDS,
  COMPUTE_ACCELERATOR_CLASSES,
  COMPUTE_WORKLOAD_KINDS,
  resolveCapacityProfile,
  deriveComputeRequirements,
  resolveCapacityProfileForRequirements,
  deriveLocalComputeCompatibility,
  deriveCapacityPlan,
  vramFloorFor,
  paramsForBaseModel,
} = await import(lib("compute-capacity-profiles.js"));

const { buildAdaptiveStudentPlan } = await import(lib("distillation-student-plan.js"));

const contract = await import(
  pathToFileURL(path.join(repoRoot, "packages/api-contract/dist/compute.js")).href
);

// ---------------------------------------------------------------------------
// Contract mirror
// ---------------------------------------------------------------------------

test("runtime vocabulary mirrors the shared contract exactly", () => {
  assert.deepEqual(COMPUTE_CAPACITY_PROFILE_IDS, [...contract.COMPUTE_CAPACITY_PROFILE_IDS]);
  assert.deepEqual(COMPUTE_ACCELERATOR_CLASSES, [...contract.COMPUTE_ACCELERATOR_CLASSES]);
  assert.deepEqual(COMPUTE_WORKLOAD_KINDS, [...contract.COMPUTE_WORKLOAD_KINDS]);
});

test("all profiles exist, each id resolvable, unknown id resolves to null", () => {
  assert.equal(COMPUTE_CAPACITY_PROFILES.length, 8);
  for (const id of COMPUTE_CAPACITY_PROFILE_IDS) {
    const p = resolveCapacityProfile(id);
    assert.ok(p, `profile ${id} must resolve`);
    assert.equal(p.id, id);
  }
  assert.equal(resolveCapacityProfile("aws-p5"), null, "vendor-shaped ids are not profiles");
  assert.equal(resolveCapacityProfile(""), null);
});

test("profiles are pure descriptions — no vendor names, no credentials, no URLs", () => {
  const s = JSON.stringify(COMPUTE_CAPACITY_PROFILES).toLowerCase();
  for (const banned of ["runpod", "modal.com", "coreweave", "hyperpod", "api_key", "apikey", "token", "https://"]) {
    assert.ok(!s.includes(banned), `profiles leak "${banned}"`);
  }
});

// ---------------------------------------------------------------------------
// Requirement derivation reuses the ONE sizing ladder
// ---------------------------------------------------------------------------

test("params + VRAM floors come from the existing student ladder, monotonic", () => {
  assert.equal(paramsForBaseModel("gemma3:1b"), 1);
  assert.equal(paramsForBaseModel("qwen3:14b"), 14);
  assert.equal(paramsForBaseModel("unknown:tag"), 0);
  assert.equal(vramFloorFor(0), 0);
  let prev = 0;
  for (const p of [1, 4, 8, 14, 32, 70, 200]) {
    const v = vramFloorFor(p);
    assert.ok(v >= prev, `vram floor must not decrease (${p}B → ${v})`);
    prev = v;
  }
  assert.equal(vramFloorFor(70), 80, "70B fine-tune floors at the 80 GB class");
});

test("EXIT PROOF 1 — a small student that fits locally selects a local-compatible profile", () => {
  const preflight = { ramGB: 32, diskFreeGB: 200, gpu: { present: false, name: "", vramFreeGB: 0 } };
  const plan = buildAdaptiveStudentPlan({ preflight });
  assert.equal(plan.mode, "train-local", "precondition: the planner sizes a local plan");
  const capacity = deriveCapacityPlan({ plan, preflight, workloadKind: "fine-tune" });
  assert.equal(capacity.capacityProfileId, "cpu-local-finetune");
  const profile = resolveCapacityProfile(capacity.capacityProfileId);
  assert.equal(profile.localCapable, true, "the resolved profile admits local execution");
  assert.equal(capacity.local.eligible, true, `local must be eligible: ${capacity.local.reasons.join("; ")}`);
  assert.equal(capacity.requirements.gpuCount, 0, "a 4B CPU-mode plan asks for no GPU");
  assert.equal(capacity.requirements.checkpointRequired, true, "training work is checkpointable");
});

test("EXIT PROOF 2 — an 80 GB VRAM requirement against 24 GB local VRAM makes local ineligible", () => {
  const preflight = { ramGB: 128, diskFreeGB: 2000, gpu: { present: true, name: "RTX 4090", vramFreeGB: 24 } };
  const requirements = deriveComputeRequirements({ paramsB: 70, workloadKind: "fine-tune", preflight });
  assert.equal(requirements.minVramPerGpuGB, 80);
  const verdict = deriveLocalComputeCompatibility({ requirements, preflight });
  assert.equal(verdict.eligible, false);
  assert.ok(verdict.reasonCodes.includes("insufficient-vram"), `expected insufficient-vram in ${verdict.reasonCodes}`);
  assert.ok(verdict.reasons.some((r) => r.includes("80 GB") && r.includes("24 GB")), "the reason names both numbers");
});

test("EXIT PROOF 3 — an impossible plan does not claim local readiness", () => {
  // A machine below every training tier: 4 GB RAM, no GPU, 5 GB disk.
  const preflight = { ramGB: 4, diskFreeGB: 5, gpu: { present: false, name: "", vramFreeGB: 0 } };
  const plan = buildAdaptiveStudentPlan({ preflight });
  assert.equal(plan.mode, "harvest-only", "precondition: the planner refuses to size a training plan");
  const capacity = deriveCapacityPlan({ plan, preflight, workloadKind: "fine-tune" });
  assert.equal(capacity.capacityProfileId, "harvest-only");
  assert.equal(capacity.executes, false, "harvest-only allocates no compute");
  // Force a training ask against the same machine: local must NOT be eligible.
  const forced = deriveCapacityPlan({ plan: { mode: "train-local", baseModel: "gemma3:1b" }, preflight, workloadKind: "fine-tune" });
  assert.equal(forced.local.eligible, false, "an under-tier machine never reads as locally ready for training");
  assert.ok(forced.local.reasonCodes.length > 0, "the refusal carries machine-readable reasons");
});

test("EXIT PROOF 4 — harvest-only remains honest when no execution realization qualifies", () => {
  const preflight = { ramGB: 4, diskFreeGB: 5, gpu: { present: false, name: "", vramFreeGB: 0 } };
  const plan = buildAdaptiveStudentPlan({ preflight });
  const capacity = deriveCapacityPlan({ plan, preflight });
  assert.equal(capacity.requirements.workloadKind, "harvest");
  assert.equal(capacity.requirements.gpuCount, 0);
  assert.equal(capacity.requirements.minDiskGB, 0, "harvest asks for no storage capacity");
  assert.equal(capacity.capacityProfileId, "harvest-only");
  assert.equal(capacity.local.eligible, true, "harvesting itself always works locally");
  const profile = resolveCapacityProfile("harvest-only");
  assert.equal(profile.execution, false, "harvest-only is a first-class NON-execution profile, never a fake run");
});

// ---------------------------------------------------------------------------
// Placement mapping
// ---------------------------------------------------------------------------

test("distributed asks resolve to distributed-training with gang scheduling", () => {
  const requirements = deriveComputeRequirements({
    paramsB: 70,
    workloadKind: "training",
    distributed: { workers: 4, gpusPerWorker: 8 },
  });
  assert.deepEqual(requirements.distributed, { workers: 4, gpusPerWorker: 8, gangScheduling: true, highBandwidthInterconnect: true });
  assert.equal(requirements.gpuCount, 8, "per-worker GPU count follows the distributed shape");
  const { profile } = resolveCapacityProfileForRequirements(requirements);
  assert.equal(profile.id, "distributed-training");
  const local = deriveLocalComputeCompatibility({ requirements, preflight: { ramGB: 128, diskFreeGB: 4000, gpu: { present: true, vramFreeGB: 80 } } });
  assert.equal(local.eligible, false);
  assert.ok(local.reasonCodes.includes("distributed-unsupported-locally"));
});

test("a single-worker degenerate 'distributed' ask (workers < 2) is not distributed", () => {
  const requirements = deriveComputeRequirements({ paramsB: 8, workloadKind: "fine-tune", distributed: { workers: 1, gpusPerWorker: 4 } });
  assert.equal(requirements.distributed, null);
});

test("evaluation / conversion / quantization jobs compile to burst-gpu", () => {
  for (const workloadKind of ["evaluation", "conversion", "quantization", "data-prep"]) {
    const requirements = deriveComputeRequirements({ workloadKind, paramsB: 4 });
    const { profile } = resolveCapacityProfileForRequirements(requirements);
    assert.equal(profile.id, "burst-gpu", `${workloadKind} → burst-gpu`);
  }
});

test("serving asks split serve-local vs warm-inference on the accelerator ask", () => {
  const localServe = deriveComputeRequirements({ workloadKind: "inference-serve" });
  assert.equal(resolveCapacityProfileForRequirements(localServe).profile.id, "serve-local");
  const warm = deriveComputeRequirements({ workloadKind: "inference-serve", requireAccelerator: true, paramsB: 8 });
  assert.equal(resolveCapacityProfileForRequirements(warm).profile.id, "warm-inference");
});

test("a large single-node student compiles to multi-gpu-finetune", () => {
  const requirements = deriveComputeRequirements({ paramsB: 140, workloadKind: "fine-tune" });
  assert.ok(requirements.gpuCount >= 2, `140B needs multiple GPUs, got ${requirements.gpuCount}`);
  assert.equal(resolveCapacityProfileForRequirements(requirements).profile.id, "multi-gpu-finetune");
});

// ---------------------------------------------------------------------------
// Honesty on garbage
// ---------------------------------------------------------------------------

test("garbage input never throws and never reads as locally ready", () => {
  for (const garbage of [null, undefined, {}, { preflight: "x" }, { plan: 42 }]) {
    const capacity = deriveCapacityPlan(garbage ?? {});
    assert.ok(capacity.capacityProfileId, "always resolves a profile");
    if (["training", "fine-tune", "distillation"].includes(capacity.requirements.workloadKind)) {
      assert.equal(capacity.local.eligible, false, "an unmeasured machine is never optimistically eligible for training");
    }
  }
  assert.equal(deriveLocalComputeCompatibility({}).eligible, false);
  assert.equal(deriveLocalComputeCompatibility({ requirements: null, preflight: null }).eligible, false);
});

test("unmeasured VRAM with a VRAM floor is ineligible (unknown never passes a floor)", () => {
  const requirements = deriveComputeRequirements({ paramsB: 70, workloadKind: "fine-tune" });
  const verdict = deriveLocalComputeCompatibility({
    requirements,
    preflight: { ramGB: 128, diskFreeGB: 2000, gpu: { present: true, name: "mystery", vramFreeGB: 0 } },
  });
  assert.equal(verdict.eligible, false);
  assert.ok(verdict.reasonCodes.includes("vram-unmeasured"));
});
