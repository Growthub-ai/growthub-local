/**
 * Compute capacity profiles — Sprint 2 of the Governed Compute Realization.
 * Pure: no React, no fetch, no fs. The runtime mirror of the
 * `@growthub/api-contract/compute` vocabulary plus the derivations that turn
 * the EXISTING training evidence into a provider-neutral capacity ask:
 *
 *   adaptive student plan (distillation-student-plan.js)
 *        + machine preflight ({ ramGB, diskFreeGB, gpu })
 *   → ComputeRequirements (accelerator class, VRAM floor, GPU count, CPU,
 *     memory, storage, checkpoint, distributed workers, locality, duration)
 *   → Capacity Profile (the SHAPE of capacity, never a vendor)
 *   → local compatibility verdict (evidence-backed, reasons named)
 *
 * Division of authority (the architectural law): the training planner decides
 * WHAT to train (base model, quant, hyperparams — buildAdaptiveStudentPlan);
 * this layer only decides PLACEMENT. It runs no probe of its own — machine
 * evidence arrives as the same preflight shape the #273 probes already stamp,
 * so there is exactly one hardware detector in the product.
 */

import { resolveMachineTier, STUDENT_BASE_CANDIDATES } from "./distillation-student-plan.js";

/** Runtime mirrors of the shared contract vocabulary (tested for equality
 *  against `@growthub/api-contract/dist/compute.js`). */
export const COMPUTE_CAPACITY_PROFILE_IDS = [
  "harvest-only",
  "serve-local",
  "burst-gpu",
  "warm-inference",
  "single-gpu-finetune",
  "multi-gpu-finetune",
  "distributed-training",
];
export const COMPUTE_ACCELERATOR_CLASSES = ["none", "any-gpu", "consumer-gpu", "datacenter-gpu", "high-memory-gpu"];
export const COMPUTE_WORKLOAD_KINDS = [
  "training", "fine-tune", "distillation", "evaluation", "conversion",
  "quantization", "data-prep", "inference-serve", "harvest",
];

/**
 * The seven governed Capacity Profiles. A profile is a pure description of a
 * capacity SHAPE — what a workload of this class needs from wherever it runs.
 * `execution: false` marks profiles that allocate no compute at all
 * (harvest-only is a first-class honest journey, not a failure state).
 * Floors here are profile-level minima; the per-run ComputeRequirements may
 * tighten them, never loosen them.
 */
export const COMPUTE_CAPACITY_PROFILES = [
  {
    id: "harvest-only",
    label: "Harvest only (train later)",
    description: "No execution realization qualifies yet — the model identity serves through the gateway and every exchange compounds the governed corpus.",
    workloadKinds: ["harvest"],
    execution: false,
    localCapable: true,
    floors: { gpuCount: 0, minVramPerGpuGB: 0, minCpuCores: 1, minRamGB: 0, minDiskGB: 0 },
    checkpointRequired: false,
    distributed: false,
  },
  {
    id: "serve-local",
    label: "Serve on this machine",
    description: "Local inference serving through the existing runtime (Ollama/llama.cpp). Owned hardware, zero marginal cost.",
    workloadKinds: ["inference-serve"],
    execution: true,
    localCapable: true,
    floors: { gpuCount: 0, minVramPerGpuGB: 0, minCpuCores: 2, minRamGB: 8, minDiskGB: 10 },
    checkpointRequired: false,
    distributed: false,
  },
  {
    id: "burst-gpu",
    label: "Cloud compute · burst",
    description: "Short-lived single-GPU capacity allocated per job: evaluation, conversion, quantization, data preparation, small fine-tunes.",
    workloadKinds: ["evaluation", "conversion", "quantization", "data-prep", "fine-tune", "distillation"],
    execution: true,
    localCapable: false,
    floors: { gpuCount: 1, minVramPerGpuGB: 16, minCpuCores: 4, minRamGB: 16, minDiskGB: 40 },
    checkpointRequired: false,
    distributed: false,
  },
  {
    id: "warm-inference",
    label: "Cloud compute · warm serving",
    description: "Pre-provisioned low-latency serving capacity held ready for the model realization.",
    workloadKinds: ["inference-serve"],
    execution: true,
    localCapable: false,
    floors: { gpuCount: 1, minVramPerGpuGB: 24, minCpuCores: 4, minRamGB: 16, minDiskGB: 40 },
    checkpointRequired: false,
    distributed: false,
  },
  {
    id: "single-gpu-finetune",
    label: "Cloud compute · single-GPU fine-tune",
    description: "One accelerator carrying a complete fine-tune/distillation run with checkpointing.",
    workloadKinds: ["fine-tune", "distillation", "training"],
    execution: true,
    localCapable: true,
    floors: { gpuCount: 1, minVramPerGpuGB: 16, minCpuCores: 4, minRamGB: 16, minDiskGB: 60 },
    checkpointRequired: true,
    distributed: false,
  },
  {
    id: "multi-gpu-finetune",
    label: "Cloud compute · multi-GPU fine-tune",
    description: "A single worker with multiple accelerators for models beyond one GPU's memory.",
    workloadKinds: ["fine-tune", "distillation", "training"],
    execution: true,
    localCapable: false,
    floors: { gpuCount: 2, minVramPerGpuGB: 40, minCpuCores: 8, minRamGB: 64, minDiskGB: 200 },
    checkpointRequired: true,
    distributed: false,
  },
  {
    id: "distributed-training",
    label: "Reserved cluster · distributed training",
    description: "Gang-scheduled multi-worker training with high-bandwidth interconnect, checkpointing, and auto-resume.",
    workloadKinds: ["training", "fine-tune", "distillation"],
    execution: true,
    localCapable: false,
    floors: { gpuCount: 1, minVramPerGpuGB: 40, minCpuCores: 16, minRamGB: 128, minDiskGB: 500 },
    checkpointRequired: true,
    distributed: true,
  },
];

/** Resolve a profile by id (null for unknown — never a silent default). */
export function resolveCapacityProfile(id) {
  return COMPUTE_CAPACITY_PROFILES.find((p) => p.id === String(id || "").trim()) || null;
}

// ---------------------------------------------------------------------------
// Requirement derivation
// ---------------------------------------------------------------------------

/**
 * VRAM floor ladder for a QLoRA-class fine-tune by student size (per GPU,
 * GB). Conservative: a floor that fits slowly beats a floor that OOMs. CPU
 * training remains legal below the smallest rung — the ladder only applies
 * when an accelerator is required or requested.
 */
export const FINETUNE_VRAM_FLOORS = [
  { maxParamsB: 1, vramGB: 8 },
  { maxParamsB: 4, vramGB: 16 },
  { maxParamsB: 8, vramGB: 24 },
  { maxParamsB: 14, vramGB: 32 },
  { maxParamsB: 32, vramGB: 48 },
  { maxParamsB: 70, vramGB: 80 },
];

/** Largest single-GPU VRAM the floors ladder reasons about (H100/H200 class). */
export const MAX_SINGLE_GPU_VRAM_GB = 80;

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Params (B) for a student base tag, from the ONE existing sizing ladder. */
export function paramsForBaseModel(tag) {
  const found = STUDENT_BASE_CANDIDATES.find((c) => c.tag === String(tag || "").trim());
  return found ? found.paramsB : 0;
}

/** Disk estimate (GB) for a student base tag from the same ladder. */
export function diskForBaseModel(tag) {
  const found = STUDENT_BASE_CANDIDATES.find((c) => c.tag === String(tag || "").trim());
  return found ? found.diskGB : 0;
}

/** VRAM floor for a fine-tune of `paramsB` billions of params (per GPU). */
export function vramFloorFor(paramsB) {
  const p = Math.max(0, num(paramsB));
  if (p === 0) return 0;
  for (const rung of FINETUNE_VRAM_FLOORS) {
    if (p <= rung.maxParamsB) return rung.vramGB;
  }
  // Beyond the single-GPU ladder: per-GPU floor caps at the largest class;
  // gpuCount/distributed absorb the rest.
  return MAX_SINGLE_GPU_VRAM_GB;
}

/**
 * Derive provider-neutral ComputeRequirements from the adaptive student plan
 * and the SAME preflight evidence the training probes stamp. Pure, never
 * throws. The plan decides what; this only describes the capacity shape.
 *
 * @param {object} opts
 * @param {object} [opts.plan]        buildAdaptiveStudentPlan() output
 * @param {object} [opts.preflight]   { ramGB, diskFreeGB, gpu } (evidence, not a probe)
 * @param {string} [opts.workloadKind]
 * @param {number} [opts.paramsB]     explicit student size override (off-ladder tags)
 * @param {boolean} [opts.requireAccelerator] force a GPU ask even where CPU could crawl
 * @param {object} [opts.distributed] { workers, gpusPerWorker } for cluster-scale plans
 * @param {object} [opts.locality]    { regions[], dataResidency }
 * @param {number} [opts.estimatedDurationMinutes]
 */
export function deriveComputeRequirements({
  plan = null,
  preflight = null,
  workloadKind = "fine-tune",
  paramsB = 0,
  requireAccelerator = false,
  distributed = null,
  locality = null,
  estimatedDurationMinutes = 0,
} = {}) {
  const kind = COMPUTE_WORKLOAD_KINDS.includes(String(workloadKind)) ? String(workloadKind) : "fine-tune";
  const planObj = plan && typeof plan === "object" ? plan : null;

  // Harvest-only plans ask for NO execution capacity — that is the honest ask.
  if (planObj && planObj.mode === "harvest-only") {
    return {
      workloadKind: "harvest",
      acceleratorClass: "none",
      gpuCount: 0,
      minVramPerGpuGB: 0,
      minCpuCores: 1,
      minRamGB: 0,
      minDiskGB: 0,
      checkpointRequired: false,
      distributed: null,
      locality: normalizeLocality(locality),
      estimatedDurationMinutes: 0,
    };
  }

  const baseParamsB = Math.max(0, num(paramsB) || paramsForBaseModel(planObj?.baseModel));
  const baseDiskGB = diskForBaseModel(planObj?.baseModel);
  const trainingKind = kind === "training" || kind === "fine-tune" || kind === "distillation";

  // Distributed shape: explicit ask only — the planner names cluster scale,
  // placement never invents it.
  const dist = distributed && typeof distributed === "object" && num(distributed.workers) >= 2
    ? {
        workers: Math.floor(num(distributed.workers)),
        gpusPerWorker: Math.max(1, Math.floor(num(distributed.gpusPerWorker, 1))),
        gangScheduling: distributed.gangScheduling !== false,
        highBandwidthInterconnect: distributed.highBandwidthInterconnect !== false,
      }
    : null;

  // Accelerator ask: distributed and multi-GPU always require one; otherwise
  // a GPU is required when the student exceeds what CPU training honestly
  // carries (the existing tier ladder trains up to 8B on cpu-large) or when
  // the caller pins one.
  const cpuTrainCeilingB = 8;
  const needsGpu = Boolean(dist) || requireAccelerator === true || (trainingKind && baseParamsB > cpuTrainCeilingB) || kind === "inference-serve" && requireAccelerator === true;
  const perGpuVram = needsGpu ? vramFloorFor(Math.max(baseParamsB, dist ? baseParamsB : 0)) || 16 : 0;

  // Single-worker GPU count: grow past one GPU only when the per-GPU floor
  // ladder tops out below the model's total need.
  let gpuCount = 0;
  if (needsGpu) {
    gpuCount = 1;
    if (!dist && baseParamsB > 70) gpuCount = Math.min(8, Math.ceil(baseParamsB / 70));
    if (dist) gpuCount = dist.gpusPerWorker;
  }

  const acceleratorClass = !needsGpu
    ? "none"
    : perGpuVram >= 80 ? "high-memory-gpu"
    : perGpuVram >= 40 ? "datacenter-gpu"
    : perGpuVram >= 24 ? "any-gpu"
    : "any-gpu";

  // Memory/disk floors: the plan's ladder disk estimate when known, else the
  // tier-conservative defaults; CPU-mode training needs RAM ≈ what the tier
  // ladder demanded for that size.
  const minRamGB = trainingKind
    ? Math.max(8, needsGpu ? 16 : baseParamsB >= 8 ? 32 : baseParamsB >= 4 ? 16 : 8)
    : 8;
  const minDiskGB = Math.max(baseDiskGB, trainingKind ? 20 : 10);

  return {
    workloadKind: kind,
    acceleratorClass,
    gpuCount,
    minVramPerGpuGB: perGpuVram,
    minCpuCores: dist ? 16 : needsGpu ? 4 : 2,
    minRamGB,
    minDiskGB,
    checkpointRequired: trainingKind,
    distributed: dist,
    locality: normalizeLocality(locality),
    estimatedDurationMinutes: Math.max(0, Math.floor(num(estimatedDurationMinutes))),
  };
}

function normalizeLocality(locality) {
  const l = locality && typeof locality === "object" ? locality : {};
  return {
    regions: Array.isArray(l.regions) ? l.regions.map(String).filter(Boolean) : [],
    dataResidency: String(l.dataResidency || ""),
  };
}

// ---------------------------------------------------------------------------
// Profile resolution
// ---------------------------------------------------------------------------

/**
 * Resolve which Capacity Profile a requirements shape compiles into.
 * Deterministic, pure. Returns { profile, reason }; `profile` is always one
 * of the seven governed profiles (harvest-only when nothing executes).
 */
export function resolveCapacityProfileForRequirements(requirements) {
  const req = requirements && typeof requirements === "object" ? requirements : null;
  const byId = (id) => COMPUTE_CAPACITY_PROFILES.find((p) => p.id === id);
  if (!req) return { profile: byId("harvest-only"), reason: "no requirements derived — nothing may execute" };
  if (req.workloadKind === "harvest") return { profile: byId("harvest-only"), reason: "plan asks for no execution capacity — harvesting continues" };
  if (req.distributed && req.distributed.workers >= 2) {
    return { profile: byId("distributed-training"), reason: `${req.distributed.workers} gang-scheduled workers × ${req.distributed.gpusPerWorker} GPU(s)` };
  }
  if (req.workloadKind === "inference-serve") {
    return req.gpuCount > 0
      ? { profile: byId("warm-inference"), reason: "accelerated serving capacity requested" }
      : { profile: byId("serve-local"), reason: "local serving fits the ask" };
  }
  const trainingKind = ["training", "fine-tune", "distillation"].includes(req.workloadKind);
  if (trainingKind) {
    if (req.gpuCount >= 2) return { profile: byId("multi-gpu-finetune"), reason: `${req.gpuCount} GPUs on one worker` };
    return { profile: byId("single-gpu-finetune"), reason: req.gpuCount === 1 ? "one accelerator carries the run" : "CPU-mode fine-tune (single worker)" };
  }
  // Short-lived jobs: evaluation / conversion / quantization / data-prep.
  return { profile: byId("burst-gpu"), reason: `short-lived ${req.workloadKind} job` };
}

// ---------------------------------------------------------------------------
// Local compatibility — the same preflight evidence, no second probe
// ---------------------------------------------------------------------------

/**
 * Judge whether the LOCAL machine (as evidenced by the stamped preflight —
 * { ramGB, diskFreeGB, gpu: { present, name, vramFreeGB } }) satisfies a
 * requirements shape. Pure; unmeasured machines are ineligible with the
 * reason named, never optimistically eligible.
 *
 * @returns {{ eligible: boolean, reasons: string[], reasonCodes: string[] }}
 */
export function deriveLocalComputeCompatibility({ requirements = null, preflight = null } = {}) {
  const req = requirements && typeof requirements === "object" ? requirements : null;
  const pf = preflight && typeof preflight === "object" ? preflight : {};
  const reasons = [];
  const reasonCodes = [];
  const flag = (code, reason) => { reasonCodes.push(code); reasons.push(reason); };

  if (!req) {
    flag("no-requirements", "no requirements derived");
    return { eligible: false, reasons, reasonCodes };
  }
  if (req.workloadKind === "harvest") {
    // Harvesting executes nothing — the local machine trivially qualifies.
    return { eligible: true, reasons: [], reasonCodes: [] };
  }

  const ramGB = num(pf.ramGB);
  const diskFreeGB = num(pf.diskFreeGB);
  const gpu = pf.gpu && typeof pf.gpu === "object" ? pf.gpu : { present: false, vramFreeGB: 0 };

  if (ramGB <= 0) flag("machine-unmeasured", "machine not measured yet — the preflight probe runs before anything trains");
  if (req.distributed && req.distributed.workers >= 2) flag("distributed-unsupported-locally", `plan needs ${req.distributed.workers} workers — a single local machine cannot gang-schedule a cluster`);
  if (req.gpuCount > 1) flag("multi-gpu-unsupported-locally", `plan needs ${req.gpuCount} GPUs on one worker — local evidence records at most one`);
  if (req.gpuCount >= 1) {
    if (gpu.present !== true) flag("no-local-gpu", "an accelerator is required and none is present locally");
    else {
      const vramFreeGB = num(gpu.vramFreeGB);
      if (req.minVramPerGpuGB > 0 && vramFreeGB > 0 && vramFreeGB < req.minVramPerGpuGB) {
        flag("insufficient-vram", `needs ${req.minVramPerGpuGB} GB VRAM per GPU — local GPU has ${vramFreeGB} GB free`);
      }
      if (req.minVramPerGpuGB > 0 && vramFreeGB <= 0) {
        flag("vram-unmeasured", `needs ${req.minVramPerGpuGB} GB VRAM per GPU — local VRAM not measured`);
      }
    }
  }
  if (ramGB > 0 && req.minRamGB > 0 && ramGB < req.minRamGB) flag("insufficient-ram", `needs ${req.minRamGB} GB memory — machine has ${ramGB} GB`);
  if (req.minDiskGB > 0) {
    if (diskFreeGB <= 0 && ramGB > 0) flag("disk-unmeasured", `needs ${req.minDiskGB} GB free storage — free disk not measured`);
    else if (diskFreeGB > 0 && diskFreeGB < req.minDiskGB) flag("insufficient-disk", `needs ${req.minDiskGB} GB free storage — machine has ${diskFreeGB} GB`);
  }

  return { eligible: reasons.length === 0, reasons, reasonCodes };
}

// ---------------------------------------------------------------------------
// Composed capacity plan — the one object the resolver and UI consume
// ---------------------------------------------------------------------------

/**
 * Compose plan + preflight into the capacity picture: requirements, the
 * resolved profile, and the local verdict. Honesty invariants:
 *   - an impossible plan never claims local readiness;
 *   - harvest-only is reported as harvest-only, never as a fake execution
 *     profile;
 *   - every local downgrade carries machine-readable reasons.
 * Pure, never throws.
 */
export function deriveCapacityPlan({
  plan = null,
  preflight = null,
  workloadKind = "fine-tune",
  paramsB = 0,
  requireAccelerator = false,
  distributed = null,
  locality = null,
  estimatedDurationMinutes = 0,
} = {}) {
  const requirements = deriveComputeRequirements({ plan, preflight, workloadKind, paramsB, requireAccelerator, distributed, locality, estimatedDurationMinutes });
  const { profile, reason } = resolveCapacityProfileForRequirements(requirements);
  const local = deriveLocalComputeCompatibility({ requirements, preflight });

  // The tier resolver is the second honesty gate: even when the raw floors
  // pass, a machine whose tier cannot train keeps local ineligible for
  // training workloads (the SAME evidence the student plan already honors).
  const trainingKind = ["training", "fine-tune", "distillation"].includes(requirements.workloadKind);
  let localVerdict = local;
  if (trainingKind && local.eligible) {
    const { tier, reason: tierReason } = resolveMachineTier(preflight);
    if (!tier.canTrain) {
      localVerdict = {
        eligible: false,
        reasons: [...local.reasons, tierReason],
        reasonCodes: [...local.reasonCodes, "below-training-tier"],
      };
    }
  }

  return {
    schema: "growthub-compute-capacity-plan-v1",
    requirements,
    capacityProfileId: profile.id,
    capacityProfileLabel: profile.label,
    profileReason: reason,
    executes: profile.execution === true,
    local: localVerdict,
  };
}
