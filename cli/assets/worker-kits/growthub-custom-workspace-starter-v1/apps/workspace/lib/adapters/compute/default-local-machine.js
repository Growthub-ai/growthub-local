/**
 * Local machine compute provider adapter — the owned-hardware realization.
 *
 * Wraps the EXISTING local execution substrate: capacity is derived from the
 * SAME stamped preflight evidence the training probes already produce
 * ({ ramGB, diskFreeGB, gpu: { present, name, vramFreeGB } }); execution
 * stays the existing model-training-runner sandbox lane. This adapter runs
 * no probe of its own and does not rewrite the local trainer — it only makes
 * the local machine a first-class citizen of the compute resolver so local
 * vs remote is ONE deterministic decision, not a special case.
 *
 * The preflight evidence rides in on `ctx.providerConfig.preflight` (stamped
 * machine evidence, injected by the caller from receipts/readiness — never a
 * live probe inside the adapter). Absent evidence quotes as unavailable,
 * honestly, rather than optimistically.
 *
 * Cost basis: owned-hardware, $0 marginal — the one case where zero cost is
 * the TRUE cost rather than an unknown one.
 */

import { registerComputeProviderAdapter } from "./compute-adapter-registry.js";
import { deriveLocalComputeCompatibility } from "../../compute-capacity-profiles.js";

export const LOCAL_COMPUTE_ADAPTER_ID = "local-machine";

function nowIso() {
  return new Date().toISOString();
}

function preflightOf(ctx) {
  const pf = ctx?.providerConfig?.preflight;
  return pf && typeof pf === "object" ? pf : null;
}

function eventFor(ctx, type, detail, source = "workspace") {
  const at = nowIso();
  return {
    type,
    at,
    evidenceObservedAt: at,
    source,
    runRef: ctx?.runRef || null,
    providerEventId: "",
    detail: String(detail || ""),
  };
}

const localMachineAdapter = {
  id: LOCAL_COMPUTE_ADAPTER_ID,
  label: "This machine",
  description: "Owned local hardware — capacity from the existing machine preflight evidence, execution through the existing local training runner.",
  locality: "local",

  describeCapabilities(config = {}) {
    const pf = config && typeof config === "object" && config.preflight && typeof config.preflight === "object" ? config.preflight : null;
    const gpuPresent = pf?.gpu?.present === true;
    const vramFreeGB = Number(pf?.gpu?.vramFreeGB) || 0;
    return {
      providerId: String(config?.providerId || LOCAL_COMPUTE_ADAPTER_ID),
      adapterId: LOCAL_COMPUTE_ADAPTER_ID,
      capacityProfiles: ["harvest-only", "serve-local", "cpu-local-finetune", "single-gpu-finetune"],
      availabilityModes: ["local"],
      acceleratorClasses: gpuPresent ? ["none", "any-gpu"] : ["none"],
      maxVramPerGpuGB: vramFreeGB,
      maxGpusPerWorker: gpuPresent ? 1 : 0,
      maxWorkers: 1,
      supportsCheckpointing: true, // the runner stamps checkpointPath/step in progress
      supportsResume: true,        // deriveTrainingResumeState is the existing surface
      supportsGangScheduling: false,
      regions: [],
      requiredEnv: [],
    };
  },

  async inspectCapacity(ctx) {
    const at = nowIso();
    const preflight = preflightOf(ctx);
    const verdict = deriveLocalComputeCompatibility({ requirements: ctx?.requirements || null, preflight });
    return {
      providerId: String(ctx?.runRef?.providerId || LOCAL_COMPUTE_ADAPTER_ID),
      capacityProfileId: String(ctx?.capacityProfileId || ""),
      available: verdict.eligible,
      availabilityMode: "local",
      costBasis: { kind: "owned-hardware", unitUsd: 0, source: "local-machine-evidence" },
      estimatedTotalUsd: 0,
      queueLatencySeconds: 0,
      quoteObservedAt: at,
      // Machine evidence goes stale like any observation; a short window keeps
      // the resolver honest about re-checking before expensive decisions.
      quoteExpiresAt: new Date(Date.parse(at) + 10 * 60 * 1000).toISOString(),
      quoteRef: "",
      // Adapter-scoped detail (verdict reasons) for the decision record.
      adapterMeta: { reasons: verdict.reasons, reasonCodes: verdict.reasonCodes, preflightPresent: Boolean(preflight) },
    };
  },

  async allocate(ctx) {
    const at = nowIso();
    const preflight = preflightOf(ctx);
    const verdict = deriveLocalComputeCompatibility({ requirements: ctx?.requirements || null, preflight });
    if (!verdict.eligible) {
      // Local allocation of an ineligible machine is refused, never faked.
      return {
        allocationId: "",
        runRef: ctx?.runRef || null,
        status: "failed",
        idempotencyKeyHash: String(ctx?.idempotencyKeyHash || ""),
        availabilityMode: "local",
        costBasis: { kind: "owned-hardware", unitUsd: 0, source: "local-machine-evidence" },
        requestedAt: at,
        allocatedAt: "",
        releasedAt: "",
        releaseConfirmed: false,
        allocated: null,
        error: `local machine ineligible: ${verdict.reasons.join("; ") || "no machine evidence"}`,
      };
    }
    // The local machine IS the capacity — allocation is a bookkeeping fact,
    // deterministic on the idempotency key (a replay returns the same id).
    return {
      allocationId: `local_${String(ctx?.idempotencyKeyHash || "").slice(0, 16) || "unkeyed"}`,
      runRef: ctx?.runRef || null,
      status: "allocated",
      idempotencyKeyHash: String(ctx?.idempotencyKeyHash || ""),
      availabilityMode: "local",
      costBasis: { kind: "owned-hardware", unitUsd: 0, source: "local-machine-evidence" },
      requestedAt: at,
      allocatedAt: at,
      releasedAt: "",
      releaseConfirmed: false,
      allocated: {
        gpuType: String(preflight?.gpu?.name || ""),
        gpuCount: preflight?.gpu?.present === true ? 1 : 0,
        workers: 1,
        region: "local",
      },
    };
  },

  async status(ctx) {
    // Local execution truth lives in the run receipts the runner stamps; the
    // adapter has no separate status channel and says so instead of inventing
    // one.
    return [eventFor(ctx, "compute-running", "local execution status is carried by the governed run receipt (runner-stamped progress), not a provider channel")];
  },

  async execute(ctx) {
    if (!ctx?.workSpec?.workSpecHash) throw new Error("immutable work spec required");
    return [eventFor(ctx, "compute-running", `local runner accepted work spec ${ctx.workSpec.workSpecHash}`)];
  },

  async resume(ctx, checkpoint) {
    if (!checkpoint?.resumable || checkpoint?.runRef?.trainingRunId !== ctx?.runRef?.trainingRunId) throw new Error("foreign or unproven checkpoint refused");
    return [eventFor(ctx, "compute-resuming", `local runner resuming ${checkpoint.checkpointId}`)];
  },

  async cancel(ctx) {
    // Cooperative cancellation of the local runner rides the existing sandbox
    // timeout/kill path; the adapter records the request honestly.
    return [eventFor(ctx, "compute-cancelled", "cancellation requested — the local runner terminates through the existing sandbox lifecycle")];
  },

  async release(ctx) {
    // Owned hardware has nothing to release; the capacity simply returns to
    // the operator. Release always succeeds and never bills.
    return [eventFor(ctx, "compute-released", "owned hardware — no remote capacity to release, no cost accrues")];
  },
};

registerComputeProviderAdapter(localMachineAdapter);

export default localMachineAdapter;
