/**
 * Compute customer state — Sprint 10 of the Governed Compute Realization.
 * Pure: no React, no fetch, no fs. The ONE deriver both customer surfaces
 * (TrainingHandoffModal compute disclosure + /custom-models cockpit line)
 * render, so no client can invent a state the receipts don't prove.
 *
 * Customer language stays provider-internal-free: users see Automatic /
 * Local / Cloud compute / Reserved cluster — never Ray, KubeRay, NCCL, pod
 * names, or EKS/CKS internals. Operator evidence (provider ids, event
 * trails, reason codes) rides in `advanced` for the existing
 * `<details class="training-advanced">` disclosure pattern.
 *
 * Every state is derived from the SAME evidence the runtime writes:
 * the capacity plan (compute-capacity-profiles), the governed receipt's
 * compute block (decision/allocation/events/checkpoints/artifact), the
 * provider registry derivation, and the existing training/eval receipts.
 * No fabricated progress: there is deliberately no percentage here.
 */

import { deriveComputeLifecycle, deriveComputeArtifactHonesty } from "./compute-evidence.js";

/** Customer-facing compute policies (the full vocabulary users reason in). */
export const COMPUTE_POLICIES = [
  { id: "automatic", label: "Automatic", description: "Train wherever the plan fits best — this machine when it qualifies, permitted cloud compute when it doesn't." },
  { id: "local", label: "Local", description: "Train only on this machine (the existing local pipeline)." },
  { id: "cloud", label: "Cloud compute", description: "Train on permitted burst cloud capacity." },
  { id: "reserved-cluster", label: "Reserved cluster", description: "Train on your organization's reserved training cluster." },
];

/** Map a customer policy to the governed compute ask (null = pure local). */
export function computeAskForPolicy(policy, { capacityProfileId = "" } = {}) {
  switch (String(policy || "")) {
    case "automatic":
      return { capacityProfileId: capacityProfileId || "single-gpu-finetune", providerRegistryId: "", selectionMode: "auto" };
    case "cloud":
      return { capacityProfileId: capacityProfileId || "single-gpu-finetune", providerRegistryId: "", selectionMode: "auto", excludeLocal: true };
    case "reserved-cluster":
      return { capacityProfileId: "distributed-training", providerRegistryId: "", selectionMode: "auto" };
    case "local":
    default:
      return null; // the existing local behavior, byte-for-byte
  }
}

export const COMPUTE_CUSTOMER_STATES = [
  "checking-machine",
  "local-eligible",
  "local-insufficient",
  "finding-capacity",
  "provider-missing",
  "budget-blocked",
  "capacity-unavailable",
  "allocating",
  "queued",
  "running",
  "checkpoint-available",
  "resuming",
  "cancelling",
  "release-pending",
  "release-failed",
  "artifact-verifying",
  "evaluating",
  "retained",
  "promoted",
];

function candidateCodes(decision) {
  const codes = new Set();
  for (const candidate of Array.isArray(decision?.candidates) ? decision.candidates : []) {
    for (const code of Array.isArray(candidate.reasonCodes) ? candidate.reasonCodes : []) codes.add(code);
  }
  return codes;
}

/** Customer label for the selected realization — never provider internals. */
export function realizationLabel({ decision = null, providers = [] } = {}) {
  const selected = String(decision?.selectedProviderId || "");
  if (!selected) return "";
  if (selected === "local-machine") return "Local";
  const provider = (Array.isArray(providers) ? providers : []).find((p) => p?.providerId === selected);
  const modes = Array.isArray(provider?.availabilityModes) ? provider.availabilityModes : [];
  if (modes.includes("reserved")) return "Reserved cluster";
  return "Cloud compute";
}

/**
 * Derive the single customer-visible compute state + its progressive
 * disclosure. Pure, never throws.
 *
 * @param {object} opts
 * @param {object} [opts.capacityPlan]  deriveCapacityPlan() output
 * @param {object} [opts.computeBlock]  the receipt's normalized compute block
 * @param {object[]} [opts.providers]   deriveComputeProviders().providers
 * @param {object} [opts.benchmarkWins] receipt distillation.benchmarkWins
 * @param {string} [opts.runtimeStage]  deriveTrainingRunState().stage
 * @param {string} [opts.policy]        selected customer policy id
 */
export function deriveComputeCustomerState({
  capacityPlan = null,
  computeBlock = null,
  providers = [],
  benchmarkWins = null,
  runtimeStage = "",
  policy = "automatic",
} = {}) {
  const out = (stateId, label, tone, detail, extra = {}) => ({
    stateId,
    label,
    tone, // ok | warn | bad | running | muted — the existing chip tones
    detail: String(detail || ""),
    policy: String(policy || "automatic"),
    requiredCapacity: describeRequiredCapacity(capacityPlan),
    realization: realizationLabel({ decision: computeBlock?.decision, providers }),
    budget: describeBudget(computeBlock?.decision),
    checkpoint: describeCheckpoint(computeBlock),
    release: describeRelease(computeBlock),
    advanced: {
      capacityProfileId: String(computeBlock?.capacityProfileId || capacityPlan?.capacityProfileId || ""),
      selectedProviderId: String(computeBlock?.decision?.selectedProviderId || ""),
      selectedReasons: Array.isArray(computeBlock?.decision?.selectedReasons) ? computeBlock.decision.selectedReasons : [],
      skipped: (Array.isArray(computeBlock?.decision?.candidates) ? computeBlock.decision.candidates : [])
        .filter((c) => !c.eligible)
        .map((c) => ({ providerId: c.providerId, reasons: c.reasons })),
      refusedEvents: extra.lifecycle ? extra.lifecycle.refused.length : 0,
      localReasons: Array.isArray(capacityPlan?.local?.reasons) ? capacityPlan.local.reasons : [],
    },
    ...extra.fields,
  });

  // ---- Pre-execution phases (no compute block yet) ------------------------
  const decision = computeBlock?.decision || null;
  const lifecycle = computeBlock ? deriveComputeLifecycle({ events: computeBlock.events, allocation: computeBlock.allocation, checkpoints: computeBlock.checkpoints }) : null;

  if (!computeBlock || (!decision && !computeBlock.events?.length)) {
    if (!capacityPlan) return out("checking-machine", "Checking your machine", "running", "Measuring memory, storage, and graphics before anything trains.");
    const machineUnmeasured = capacityPlan.local?.reasonCodes?.includes("machine-unmeasured");
    if (machineUnmeasured) return out("checking-machine", "Checking your machine", "running", "Machine not measured yet — the preflight check runs first.");
    if (capacityPlan.local?.eligible && policy !== "cloud" && policy !== "reserved-cluster") {
      return out("local-eligible", "This machine qualifies", "ok", "Training can run here. No cloud capacity is needed.");
    }
    if (!capacityPlan.local?.eligible) {
      const wantsRemote = policy !== "local";
      return out(
        "local-insufficient",
        "This machine can't carry this plan",
        wantsRemote ? "warn" : "bad",
        `${capacityPlan.local?.reasons?.[0] || "The plan exceeds this machine."}${wantsRemote ? " Cloud compute can carry it — capacity is resolved when training starts." : " Choose a smaller plan or allow cloud compute."}`,
      );
    }
    return out("finding-capacity", "Finding capacity", "running", "Resolving where this training run may execute.");
  }

  // ---- Decision made, nothing selected ------------------------------------
  if (decision && !decision.selectedProviderId) {
    const codes = candidateCodes(decision);
    if (codes.has("cost-unknown-under-hard-budget") || codes.has("over-budget") || codes.has("over-hourly-budget") || codes.has("hourly-cost-unknown-under-hard-budget")) {
      return out("budget-blocked", "Blocked by budget", "bad", "No permitted capacity fits the budget policy. Raise the cap, permit unknown cost explicitly, or pick a smaller plan.", { lifecycle });
    }
    if (codes.has("adapter-missing") || codes.has("credential-missing") || codes.has("provider-invalid")) {
      return out("provider-missing", "No compute provider connected", "warn", "Connect a compute provider (or repair its credentials) in the API Registry to unlock cloud training.", { lifecycle });
    }
    return out("capacity-unavailable", "Capacity unavailable right now", "warn", "Every permitted realization declined the request. The reasons are listed under advanced evidence.", { lifecycle });
  }

  // ---- Execution phases (evidence-gated lifecycle) -------------------------
  if (lifecycle) {
    if (lifecycle.releaseFailed) {
      return out("release-failed", "Release failed — capacity may still cost money", "bad", "The provider did not confirm the capacity was released. It may still exist and continue billing until released manually.", { lifecycle });
    }
    if (lifecycle.terminal && lifecycle.releaseRequested && !lifecycle.releaseConfirmed) {
      return out("release-pending", "Releasing capacity", "running", "Waiting for the provider to confirm the capacity is gone.", { lifecycle });
    }
    if (lifecycle.terminal === "cancelled" && !lifecycle.releaseConfirmed) {
      return out("cancelling", "Cancelling", "running", "Cancellation requested — capacity is not confirmed released yet.", { lifecycle });
    }
    if (lifecycle.terminal === "completed") {
      const honesty = deriveComputeArtifactHonesty({ lifecycle, artifact: computeBlock.artifact });
      if (!honesty.promotable) {
        return out("capacity-unavailable", "Run finished without a usable result", "bad", honesty.reason, { lifecycle });
      }
      if (["trained", "imported"].includes(String(runtimeStage))) {
        return out("artifact-verifying", "Verifying the returned model", "running", "Checking the artifact's identity (SHA-256) against what the run reported.", { lifecycle });
      }
      const wins = benchmarkWins && typeof benchmarkWins === "object" ? benchmarkWins : null;
      if (wins?.promoted === true) {
        return out("promoted", "Promoted — this is your model's new realization", "ok", "The candidate won evaluation and passed the existing promotion boundary.", { lifecycle });
      }
      if (wins) {
        return out("retained", "Kept your current model", "muted", "The candidate did not beat your current model, so production is unchanged. Its evidence feeds the next training cycle.", { lifecycle });
      }
      return out("evaluating", "Evaluating the candidate", "running", "Only an evaluation win can promote — the candidate is being scored against your current model.", { lifecycle });
    }
    if (lifecycle.status === "running") {
      const lastApplied = lifecycle.applied[lifecycle.applied.length - 1];
      if (lastApplied?.type === "compute-resuming") {
        return out("resuming", "Resuming from checkpoint", "running", "Continuing from the last proven checkpoint.", { lifecycle });
      }
      if (lifecycle.provenCheckpoints.length > 0) {
        return out("checkpoint-available", "Training — checkpoint saved", "running", `Running with ${lifecycle.provenCheckpoints.length} proven checkpoint${lifecycle.provenCheckpoints.length > 1 ? "s" : ""} — an interruption can resume.`, { lifecycle });
      }
      return out("running", "Training", "running", "The run is executing on the selected capacity.", { lifecycle });
    }
    if (lifecycle.status === "queued") {
      return out("queued", "Waiting in the provider queue", "running", "Capacity is reserved in a queue; the run starts when a worker is free.", { lifecycle });
    }
    if (["requested", "allocated"].includes(lifecycle.status)) {
      return out("allocating", "Allocating capacity", "running", "Setting up the selected capacity for this run.", { lifecycle });
    }
    if (lifecycle.terminal === "failed") {
      return out("capacity-unavailable", "Run failed", "bad", lifecycle.applied.findLast?.((e) => e.type === "compute-failed")?.detail || "The provider reported a failure.", { lifecycle });
    }
  }

  return out("finding-capacity", "Finding capacity", "running", "Resolving where this training run may execute.");
}

function describeRequiredCapacity(capacityPlan) {
  const req = capacityPlan?.requirements;
  if (!req) return "";
  if (req.workloadKind === "harvest") return "None — harvesting continues on this machine";
  const parts = [];
  if (req.distributed) parts.push(`${req.distributed.workers} workers × ${req.distributed.gpusPerWorker} graphics cards`);
  else if (req.gpuCount > 0) parts.push(`${req.gpuCount} graphics card${req.gpuCount > 1 ? "s" : ""} (${req.minVramPerGpuGB} GB memory each)`);
  else parts.push("CPU training");
  if (req.minRamGB > 0) parts.push(`${req.minRamGB} GB memory`);
  if (req.minDiskGB > 0) parts.push(`${req.minDiskGB} GB storage`);
  return parts.join(" · ");
}

function describeBudget(decision) {
  const budget = decision?.budget;
  if (!budget) return { label: "No budget set", blocked: false };
  if (budget.mode === "unlimited") return { label: "Unlimited", blocked: false };
  if (budget.mode === "advisory") return { label: budget.maxTotalUsd > 0 ? `Advisory · up to $${budget.maxTotalUsd}` : "Advisory", blocked: false };
  const codes = candidateCodes(decision);
  const blocked = !decision.selectedProviderId && (codes.has("over-budget") || codes.has("cost-unknown-under-hard-budget"));
  return { label: `Hard cap · $${budget.maxTotalUsd || 0}${budget.maxHourlyUsd ? ` ($${budget.maxHourlyUsd}/h)` : ""}`, blocked };
}

function describeCheckpoint(computeBlock) {
  if (!computeBlock) return { label: "—", proven: 0 };
  const lifecycle = deriveComputeLifecycle({ events: computeBlock.events, allocation: computeBlock.allocation, checkpoints: computeBlock.checkpoints });
  if (lifecycle.provenCheckpoints.length === 0) return { label: "No checkpoint yet", proven: 0 };
  const latest = lifecycle.provenCheckpoints[lifecycle.provenCheckpoints.length - 1];
  return { label: `Checkpoint at step ${latest.step || "?"} — resumable`, proven: lifecycle.provenCheckpoints.length };
}

function describeRelease(computeBlock) {
  if (!computeBlock?.allocation) return { label: "—", risk: false };
  const lifecycle = deriveComputeLifecycle({ events: computeBlock.events, allocation: computeBlock.allocation, checkpoints: computeBlock.checkpoints });
  if (lifecycle.releaseConfirmed) return { label: "Capacity released", risk: false };
  if (lifecycle.releaseFailed) return { label: "Release FAILED — capacity may still cost money", risk: true };
  if (lifecycle.capacityMayStillExist) return { label: lifecycle.costMayAccrue ? "Capacity not released — cost may accrue" : "Capacity not released (owned hardware — no cost)", risk: lifecycle.costMayAccrue };
  return { label: "—", risk: false };
}
