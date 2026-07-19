/**
 * Distillation student plan — Sprints 1 + 2 of the flywheel. Pure: no React,
 * no fetch, no fs. Two layers, both consumed by the Training Runtime modal
 * and the runner through the EXISTING profile/receipt contracts:
 *
 *   1. MACHINE-ADAPTIVE PLANNING — the fix for "one-click training fails per
 *      user machine config". The #273 preflight/readiness probes already
 *      measure RAM / free disk / GPU honestly; this module turns that
 *      evidence into a COMPLETE plan instead of a dead end: which student
 *      base fits (Gemma-class first), which quant level, batch/accum/rank —
 *      or, when nothing fits, `mode: "harvest-only"`: the custom-model
 *      identity still goes live behind the mothership proxy and every
 *      invocation is harvested as training evidence for later. Every
 *      downgrade is NAMED in `adjustments[]`; nothing degrades silently.
 *
 *   2. SPARSE-MoE SPECIALIZATION (MoE-Sieve / DR-LoRA posture) — calibration
 *      routing histograms → top-k salient experts per layer, adapter ranks
 *      grown by expert saliency, and the sparsity metrics + routing-histogram
 *      hash the receipts stamp so training-time and inference-time routing
 *      can be compared as operator proof.
 */

import { fnv1a64 } from "./distillation-gateway.js";

export const STUDENT_PLAN_SCHEMA = "growthub-distillation-student-plan-v1";
export const STUDENT_ARCHITECTURES = ["dense", "sparse-moe"];

// ---------------------------------------------------------------------------
// Machine tiers
// ---------------------------------------------------------------------------

/**
 * Ordered capability tiers (weakest → strongest). Resolution walks from the
 * strongest tier down to the first whose floors the measured machine clears.
 * Floors are conservative on purpose: a plan that fits slowly beats a plan
 * that OOMs. `maxBaseParamsB` bounds the student base; `allowSparse` gates
 * the sparse-MoE path (it REDUCES trainable params, so it is allowed
 * everywhere training is allowed at all).
 */
export const MACHINE_TIERS = [
  { id: "harvest-only", label: "Harvest only (train later)", minRamGB: 0, requiresGpu: false, maxBaseParamsB: 0, batchSize: 0, gradAccum: 0, loraRank: 0, allowSparse: false, canTrain: false },
  { id: "cpu-constrained", label: "CPU · constrained", minRamGB: 8, requiresGpu: false, maxBaseParamsB: 1, batchSize: 1, gradAccum: 16, loraRank: 4, allowSparse: true, canTrain: true },
  { id: "cpu-standard", label: "CPU · standard", minRamGB: 16, requiresGpu: false, maxBaseParamsB: 4, batchSize: 1, gradAccum: 8, loraRank: 8, allowSparse: true, canTrain: true },
  { id: "cpu-large", label: "CPU · large memory", minRamGB: 32, requiresGpu: false, maxBaseParamsB: 8, batchSize: 1, gradAccum: 8, loraRank: 8, allowSparse: true, canTrain: true },
  { id: "gpu-small", label: "GPU · small", minRamGB: 16, requiresGpu: true, maxBaseParamsB: 4, batchSize: 1, gradAccum: 8, loraRank: 8, allowSparse: true, canTrain: true },
  { id: "gpu-standard", label: "GPU · standard", minRamGB: 24, requiresGpu: true, maxBaseParamsB: 8, batchSize: 2, gradAccum: 4, loraRank: 16, allowSparse: true, canTrain: true },
  { id: "gpu-large", label: "GPU · large", minRamGB: 64, requiresGpu: true, maxBaseParamsB: 14, batchSize: 4, gradAccum: 2, loraRank: 32, allowSparse: true, canTrain: true },
];

/**
 * Student base candidates, smallest-first — the "built-up initialized
 * version" ladder. Gemma-class smalls run on almost any hardware, which is
 * exactly why they anchor the weak-machine journey. `diskGB` estimates the
 * full pipeline footprint (weights + merged fp16 + gguf + quant).
 */
export const STUDENT_BASE_CANDIDATES = [
  { tag: "gemma3:1b", paramsB: 1, diskGB: 8 },
  { tag: "gemma3", paramsB: 4, diskGB: 18 },
  { tag: "llama3.1:8b", paramsB: 8, diskGB: 34 },
  { tag: "qwen3:14b", paramsB: 14, diskGB: 58 },
];

/**
 * Resolve the machine tier from the SAME preflight evidence the #273 probes
 * already stamp ({ ramGB, diskFreeGB, gpu: { present, name } }). Pure, never
 * throws; unmeasured/garbage input resolves to "harvest-only" with the reason
 * named — never an optimistic tier.
 */
export function resolveMachineTier(preflight) {
  const pf = preflight && typeof preflight === "object" ? preflight : {};
  const ramGB = Number(pf.ramGB) || 0;
  const gpuPresent = pf.gpu && typeof pf.gpu === "object" ? pf.gpu.present === true : false;
  if (ramGB <= 0) {
    return { tier: MACHINE_TIERS[0], reason: "machine not measured yet — the preflight probe runs before anything trains" };
  }
  for (let i = MACHINE_TIERS.length - 1; i >= 0; i -= 1) {
    const t = MACHINE_TIERS[i];
    if (ramGB >= t.minRamGB && (!t.requiresGpu || gpuPresent)) {
      return { tier: t, reason: t.canTrain ? `fits ${t.label} (memory ${ramGB} GB${gpuPresent ? " · graphics present" : " · CPU mode"})` : `below the smallest training floor (memory ${ramGB} GB)` };
    }
  }
  return { tier: MACHINE_TIERS[0], reason: `below the smallest training floor (memory ${ramGB} GB)` };
}

/**
 * Build the complete machine-adaptive plan for a student run. This is what
 * the configure step renders instead of a hard gate: `mode` is
 * "train-local" when a sized plan fits, "harvest-only" when it doesn't —
 * BOTH are complete journeys. Pure, never throws.
 */
export function buildAdaptiveStudentPlan({
  preflight = null,
  architecture = "dense",
  requestedBaseModel = "",
  quantization = "q4_k_m",
} = {}) {
  const adjustments = [];
  const arch = STUDENT_ARCHITECTURES.includes(String(architecture)) ? String(architecture) : "dense";
  if (arch !== String(architecture || "dense")) adjustments.push(`unknown architecture "${architecture}" — planned dense`);

  const { tier, reason } = resolveMachineTier(preflight);
  const pf = preflight && typeof preflight === "object" ? preflight : {};
  const diskFreeGB = Number(pf.diskFreeGB) || 0;

  if (!tier.canTrain) {
    return {
      schema: STUDENT_PLAN_SCHEMA,
      mode: "harvest-only",
      ready: true, // harvest-only IS a ready state — the journey continues
      tier: tier.id,
      tierLabel: tier.label,
      tierReason: reason,
      architecture: arch,
      baseModel: "",
      hyperparams: null,
      adjustments,
      reasons: [reason],
      next: "Keep using your model through the gateway — every reply is harvested as training evidence for when a training-capable machine is available.",
    };
  }

  // Size the student base to the tier, honoring an explicit request when it
  // fits and downgrading BY NAME when it doesn't.
  const fitting = STUDENT_BASE_CANDIDATES.filter((c) => c.paramsB <= tier.maxBaseParamsB && (diskFreeGB === 0 || c.diskGB <= diskFreeGB));
  const requested = STUDENT_BASE_CANDIDATES.find((c) => c.tag === String(requestedBaseModel || "").trim());
  let base = fitting.length ? fitting[fitting.length - 1] : null;
  if (requested) {
    if (fitting.includes(requested)) base = requested;
    else adjustments.push(`requested base "${requested.tag}" (${requested.paramsB}B) exceeds this machine — sized down to ${base ? base.tag : "none"}`);
  } else if (String(requestedBaseModel || "").trim()) {
    // An off-ladder tag (a model we don't have sizing data for) is kept as
    // the user's explicit choice — the runner preflight remains the enforcer.
    base = { tag: String(requestedBaseModel).trim(), paramsB: 0, diskGB: 0 };
    adjustments.push(`base "${base.tag}" is not on the sizing ladder — the run's preflight stage enforces fit`);
  }

  if (!base) {
    return {
      schema: STUDENT_PLAN_SCHEMA,
      mode: "harvest-only",
      ready: true,
      tier: tier.id,
      tierLabel: tier.label,
      tierReason: reason,
      architecture: arch,
      baseModel: "",
      hyperparams: null,
      adjustments,
      reasons: [`free disk ${diskFreeGB} GB fits no student pipeline (smallest needs ${STUDENT_BASE_CANDIDATES[0].diskGB} GB)`],
      next: "Free disk space or attach an external volume, then re-check — harvesting continues meanwhile.",
    };
  }

  const sparse = arch === "sparse-moe";
  if (sparse && !tier.allowSparse) adjustments.push(`sparse path not sized for ${tier.label} — planned dense`);
  const effectiveArch = sparse && tier.allowSparse ? "sparse-moe" : "dense";

  return {
    schema: STUDENT_PLAN_SCHEMA,
    mode: "train-local",
    ready: true,
    tier: tier.id,
    tierLabel: tier.label,
    tierReason: reason,
    architecture: effectiveArch,
    baseModel: base.tag,
    hyperparams: {
      batchSize: tier.batchSize,
      gradAccum: tier.gradAccum,
      loraRank: tier.loraRank,
      quantization: String(quantization || "q4_k_m"),
    },
    adjustments,
    reasons: [],
    next: effectiveArch === "sparse-moe"
      ? "Calibrate expert routing on your traces, then train the sparse student."
      : "Train the student — the plan is sized to this machine.",
  };
}

// ---------------------------------------------------------------------------
// Sparse-MoE specialization (MoE-Sieve / DR-LoRA posture)
// ---------------------------------------------------------------------------

/**
 * Normalize a calibration routing histogram:
 *   { layers: [{ layer: 0, counts: { "<expertId>": <activations> } }] }
 * Never throws; garbage rows are dropped.
 */
export function normalizeRoutingHistogram(raw) {
  const layers = Array.isArray(raw?.layers) ? raw.layers : [];
  return {
    layers: layers
      .filter((l) => l && typeof l === "object" && l.counts && typeof l.counts === "object")
      .map((l) => ({
        layer: Math.max(0, Math.floor(Number(l.layer) || 0)),
        counts: Object.fromEntries(
          Object.entries(l.counts)
            .map(([k, v]) => [String(k), Math.max(0, Math.floor(Number(v) || 0))])
            .filter(([, v]) => v > 0),
        ),
      }))
      .filter((l) => Object.keys(l.counts).length > 0),
  };
}

/** Deterministic hash of a routing histogram (stable key order). */
export function routingHistogramHash(raw) {
  const h = normalizeRoutingHistogram(raw);
  const canonical = h.layers
    .slice()
    .sort((a, b) => a.layer - b.layer)
    .map((l) => `${l.layer}:${Object.entries(l.counts).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join(",")}`)
    .join("|");
  return canonical ? fnv1a64(canonical) : "";
}

/**
 * MoE-Sieve: select the top-k salient experts per layer from the calibration
 * histogram. Returns per-layer selections + activation coverage (how much of
 * the observed routing mass the selection captures). Pure, never throws.
 */
export function deriveSalientExperts({ routingHistogram = null, topK = 8 } = {}) {
  const h = normalizeRoutingHistogram(routingHistogram);
  const k = Math.max(1, Math.floor(Number(topK) || 8));
  if (h.layers.length === 0) {
    return { moe: false, layers: [], selectedExperts: 0, totalExperts: 0, coveragePct: 0, reason: "no routing histogram — base model has no observed MoE routing (dense path applies)" };
  }
  let selectedExperts = 0;
  let totalExperts = 0;
  let coveredMass = 0;
  let totalMass = 0;
  const layers = h.layers.map((l) => {
    const ranked = Object.entries(l.counts).sort(([, a], [, b]) => b - a);
    const selected = ranked.slice(0, k);
    const layerMass = ranked.reduce((acc, [, v]) => acc + v, 0);
    const layerCovered = selected.reduce((acc, [, v]) => acc + v, 0);
    selectedExperts += selected.length;
    totalExperts += ranked.length;
    coveredMass += layerCovered;
    totalMass += layerMass;
    return {
      layer: l.layer,
      selected: selected.map(([id]) => id),
      saliency: Object.fromEntries(selected.map(([id, v]) => [id, layerMass > 0 ? v / layerMass : 0])),
    };
  });
  return {
    moe: true,
    layers,
    selectedExperts,
    totalExperts,
    coveragePct: totalMass > 0 ? Math.round((coveredMass / totalMass) * 1000) / 10 : 0,
    reason: "",
  };
}

const RANK_LADDER = [4, 8, 16, 32, 64];

/**
 * DR-LoRA posture: grow adapter rank with expert saliency — the most-routed
 * experts get the most adaptation capacity; ranks snap to the ladder and are
 * clamped to [baseRank, maxRank]. Pure.
 */
export function deriveAdapterRankPlan({ salientExperts = null, baseRank = 8, maxRank = 32 } = {}) {
  const base = RANK_LADDER.includes(Number(baseRank)) ? Number(baseRank) : 8;
  const max = Math.max(base, RANK_LADDER.includes(Number(maxRank)) ? Number(maxRank) : 32);
  const layers = Array.isArray(salientExperts?.layers) ? salientExperts.layers : [];
  const ranks = [];
  for (const l of layers) {
    for (const [expertId, saliency] of Object.entries(l.saliency || {})) {
      const s = Math.max(0, Math.min(1, Number(saliency) || 0));
      const raw = base + s * (max - base);
      const snapped = RANK_LADDER.filter((r) => r <= raw).pop() || base;
      ranks.push({ layer: l.layer, expertId, rank: Math.max(base, Math.min(max, snapped)) });
    }
  }
  return { baseRank: base, maxRank: max, ranks };
}

/**
 * Sparsity metrics for the receipt + operator proof. `expertFlopsShare` is
 * the fraction of forward FLOPs spent in expert MLPs (0.7 default for
 * standard MoE transformer shapes) — the estimate is labeled an estimate.
 */
export function deriveSparsityMetrics({ selectedExperts = 0, totalExperts = 0, denseTrainableParams = 0, sparseTrainableParams = 0, expertFlopsShare = 0.7 } = {}) {
  const sel = Math.max(0, Math.floor(Number(selectedExperts) || 0));
  const tot = Math.max(0, Math.floor(Number(totalExperts) || 0));
  const dense = Math.max(0, Number(denseTrainableParams) || 0);
  const sparse = Math.max(0, Number(sparseTrainableParams) || 0);
  const share = Math.max(0, Math.min(1, Number(expertFlopsShare) || 0.7));
  const activeExpertsPct = tot > 0 ? Math.round((sel / tot) * 1000) / 10 : 0;
  return {
    activeExpertsPct,
    trainableParamsReductionPct: dense > 0 && sparse <= dense ? Math.round(((dense - sparse) / dense) * 1000) / 10 : 0,
    estimatedFlopsSavedPct: tot > 0 ? Math.round((1 - sel / tot) * share * 1000) / 10 : 0,
    selectedExperts: sel,
    totalExperts: tot,
  };
}

/**
 * Compose the full sparse training plan from a calibration histogram — the
 * one object the runner consumes and the receipt summarizes. Pure.
 */
export function buildSparseTrainingPlan({ routingHistogram = null, topK = 8, baseRank = 8, maxRank = 32, denseTrainableParams = 0 } = {}) {
  const salient = deriveSalientExperts({ routingHistogram, topK });
  if (!salient.moe) {
    return { ready: false, reason: salient.reason, salient, rankPlan: null, sparsity: null, routingHistogramHash: "" };
  }
  const rankPlan = deriveAdapterRankPlan({ salientExperts: salient, baseRank, maxRank });
  // Trainable-param estimate: each selected expert contributes ∝ its rank;
  // dense trains every expert at maxRank-equivalent capacity.
  const sparseUnits = rankPlan.ranks.reduce((acc, r) => acc + r.rank, 0);
  const denseUnits = salient.totalExperts * rankPlan.maxRank;
  const sparsity = deriveSparsityMetrics({
    selectedExperts: salient.selectedExperts,
    totalExperts: salient.totalExperts,
    denseTrainableParams: denseTrainableParams || denseUnits,
    sparseTrainableParams: denseTrainableParams ? Math.round(denseTrainableParams * (sparseUnits / Math.max(1, denseUnits))) : sparseUnits,
  });
  return {
    ready: true,
    reason: "",
    salient,
    rankPlan,
    sparsity,
    routingHistogramHash: routingHistogramHash(routingHistogram),
  };
}
