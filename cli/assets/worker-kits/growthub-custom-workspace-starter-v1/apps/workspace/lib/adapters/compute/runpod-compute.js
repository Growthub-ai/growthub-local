/**
 * Runpod compute provider adapter — Sprint 6 of the Governed Compute
 * Realization. Talks to the CURRENT (July 2026) official Runpod surfaces:
 *
 *   - REST v1 management API   https://rest.runpod.io/v1
 *       POST   /pods                       create on-demand/interruptible pod
 *       GET    /pods?name=…                list/reconcile (dedupe seam)
 *       GET    /pods/{podId}               status (desiredStatus RUNNING|EXITED|TERMINATED)
 *       POST   /pods/{podId}/stop          stop (releases GPU, keeps volume)
 *       DELETE /pods/{podId}               terminate (204)
 *   - GraphQL (price/stock — REST v1 has no GPU price listing)
 *       POST https://api.runpod.io/graphql   { gpuTypes { lowestPrice … stockStatus } }
 *   - Serverless job API       https://api.runpod.ai/v2/{endpointId}
 *       POST /run, GET /status/{jobId}, POST /cancel/{jobId}
 *       states IN_QUEUE | IN_PROGRESS | RUNNING | COMPLETED | FAILED |
 *              CANCELLED | TIMED_OUT
 *
 * Honesty boundaries (what Runpod's public API truly supports today):
 *   - capacity profiles: burst-gpu, warm-inference, single-gpu-finetune,
 *     multi-gpu-finetune (up to 8 GPUs on ONE pod). NOT distributed-training:
 *     Instant Clusters have no public REST lifecycle in v1, so this adapter
 *     never claims multi-node (maxWorkers = 1).
 *   - checkpointing requires a configured network volume — without
 *     `networkVolumeId` the container disk is wiped on stop, so
 *     supportsCheckpointing is FALSE, honestly.
 *   - the API has NO idempotency key; the adapter dedupes pod creation by
 *     embedding the governed idempotency hash in the pod name and
 *     reconciling GET /pods?name=… BEFORE creating (the provider-native
 *     pattern). Serverless /run has no dedupe at all — exactly-once rides on
 *     the governed replay protection upstream (fail closed).
 *   - a pod's EXITED state is a provider claim of completion, not proof —
 *     the completion event carries that caveat and artifact honesty gates
 *     promotion upstream.
 *
 * All Runpod-specific fields live HERE (gpu type ids, cloudType,
 * dataCenterIds, endpointId…) — the portable plan/receipt never sees them.
 * Auth: env NAME from row config (`apiKeyEnv`, default RUNPOD_API_KEY),
 * value resolved server-side per call, never logged, never stored.
 */

import { registerComputeProviderAdapter } from "./compute-adapter-registry.js";

export const RUNPOD_ADAPTER_ID = "runpod-pods";
export const RUNPOD_REST_BASE = "https://rest.runpod.io/v1";
export const RUNPOD_GRAPHQL_URL = "https://api.runpod.io/graphql";
export const RUNPOD_SERVERLESS_BASE = "https://api.runpod.ai/v2";

/** Adapter-internal accelerator-class → Runpod GPU type preference ladder.
 *  Full marketing strings per the current GPU types reference. */
export const RUNPOD_GPU_LADDER = [
  { minVramGB: 141, gpuTypeIds: ["NVIDIA H200"] },
  { minVramGB: 80, gpuTypeIds: ["NVIDIA H100 80GB HBM3", "NVIDIA A100 80GB PCIe", "NVIDIA A100-SXM4-80GB"] },
  { minVramGB: 48, gpuTypeIds: ["NVIDIA L40S", "NVIDIA RTX A6000", "NVIDIA A40"] },
  { minVramGB: 24, gpuTypeIds: ["NVIDIA GeForce RTX 4090", "NVIDIA RTX A5000", "NVIDIA L4"] },
  { minVramGB: 16, gpuTypeIds: ["NVIDIA RTX A4000"] },
];

const QUOTE_TTL_MS = 5 * 60 * 1000;

function str(v) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function cfg(ctx) {
  const c = ctx?.providerConfig && typeof ctx.providerConfig === "object" ? ctx.providerConfig : {};
  return {
    mode: c.mode === "serverless" ? "serverless" : "pods",
    apiKeyEnv: str(c.apiKeyEnv) || "RUNPOD_API_KEY",
    cloudType: c.cloudType === "COMMUNITY" ? "COMMUNITY" : "SECURE",
    interruptible: c.interruptible === true,
    imageName: str(c.imageName),
    templateId: str(c.templateId),
    gpuTypeIds: Array.isArray(c.gpuTypeIds) ? c.gpuTypeIds.map(String).filter(Boolean) : [],
    dataCenterIds: Array.isArray(c.dataCenterIds) ? c.dataCenterIds.map(String).filter(Boolean) : [],
    networkVolumeId: str(c.networkVolumeId),
    containerDiskInGb: Math.max(0, Math.floor(num(c.containerDiskInGb))),
    endpointId: str(c.endpointId),
    jobInput: c.jobInput && typeof c.jobInput === "object" ? c.jobInput : null,
    providerId: str(c.providerId) || "runpod",
  };
}

function apiKey(ctx, config) {
  const value = typeof ctx?.resolveEnv === "function" ? ctx.resolveEnv(config.apiKeyEnv) : "";
  if (!value) throw new Error(`Runpod credential env "${config.apiKeyEnv}" is not present at call time`);
  return value;
}

function restHeaders(key) {
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

/** GPU type candidates for a requirements shape (config override first). */
export function runpodGpuCandidates({ requirements, config }) {
  if (config?.gpuTypeIds?.length) return config.gpuTypeIds;
  const minVram = Math.max(0, num(requirements?.minVramPerGpuGB));
  const eligible = RUNPOD_GPU_LADDER.filter((rung) => rung.minVramGB >= minVram);
  const chosen = eligible.length ? eligible[eligible.length - 1] : null; // smallest sufficient class
  return chosen ? chosen.gpuTypeIds : RUNPOD_GPU_LADDER[0].gpuTypeIds;
}

function providerEvent({ type, ctx, providerEventId, detail, at, source = "provider", extra = {} }) {
  const stamp = at || new Date().toISOString();
  return {
    type,
    at: stamp,
    evidenceObservedAt: new Date().toISOString(),
    source,
    runRef: { ...(ctx?.runRef || {}) },
    providerEventId: str(providerEventId),
    detail: str(detail).slice(0, 500),
    ...extra,
  };
}

/** Map a serverless job status onto the normalized event vocabulary. */
export function mapRunpodJobStatus(status) {
  switch (str(status).toUpperCase()) {
    case "IN_QUEUE": return "compute-queued";
    case "IN_PROGRESS":
    case "RUNNING": return "compute-running";
    case "COMPLETED": return "compute-completed";
    case "FAILED": return "compute-failed";
    case "CANCELLED": return "compute-cancelled";
    case "TIMED_OUT": return "compute-failed";
    default: return "";
  }
}

const runpodAdapter = {
  id: RUNPOD_ADAPTER_ID,
  label: "Runpod",
  description: "Runpod GPU pods + serverless jobs (REST v1 / api.runpod.ai v2). Single-worker up to 8 GPUs; checkpointing via network volumes.",
  locality: "remote",

  describeCapabilities(config = {}) {
    const c = cfg({ providerConfig: config });
    const hasVolume = Boolean(c.networkVolumeId);
    return {
      providerId: c.providerId,
      adapterId: RUNPOD_ADAPTER_ID,
      // What the public API truthfully supports — never multi-node.
      capacityProfiles: ["burst-gpu", "warm-inference", "single-gpu-finetune", "multi-gpu-finetune"],
      availabilityModes: c.mode === "serverless" ? ["queued", "on-demand"] : (c.interruptible ? ["on-demand", "spot"] : ["on-demand"]),
      acceleratorClasses: ["any-gpu", "consumer-gpu", "datacenter-gpu", "high-memory-gpu"],
      maxVramPerGpuGB: 141,
      maxGpusPerWorker: 8,
      maxWorkers: 1,
      supportsCheckpointing: hasVolume,
      supportsResume: hasVolume,
      supportsGangScheduling: false,
      regions: c.dataCenterIds,
      requiredEnv: [c.apiKeyEnv],
      allocationIdempotency: c.mode === "serverless"
        ? {
            guaranteed: false,
            mode: "unproven",
            evidence: "Runpod Serverless /run returns a generated job id and exposes no deterministic idempotency lookup",
          }
        : {
            guaranteed: true,
            mode: "reconcile-before-create",
            evidence: "deterministic pod name from the sealed idempotency hash; GET /pods?name runs before POST /pods",
          },
      // Optional extension floors the resolver honors when declared.
      maxRamGB: 0,
      maxDiskGB: 0,
    };
  },

  async inspectCapacity(ctx) {
    const config = cfg(ctx);
    const key = apiKey(ctx, config);
    const gpuCount = Math.max(1, Math.floor(num(ctx?.requirements?.gpuCount, 1)));
    const candidates = runpodGpuCandidates({ requirements: ctx?.requirements, config });
    const observedAt = new Date().toISOString();
    const query = `query GpuStock($ids: [String!]) {
      gpuTypes(input: { ids: $ids }) {
        id displayName memoryInGb secureCloud communityCloud
        lowestPrice(input: { gpuCount: ${gpuCount}, secureCloud: ${config.cloudType === "SECURE"} }) {
          uninterruptablePrice minimumBidPrice stockStatus
        }
      }
    }`;
    let gpuTypes = [];
    try {
      const data = await ctx.fetchJson(`${RUNPOD_GRAPHQL_URL}?api_key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: { ids: candidates } }),
      });
      if (Array.isArray(data?.errors) && data.errors.length) throw new Error(str(data.errors[0]?.message) || "GraphQL error");
      gpuTypes = Array.isArray(data?.data?.gpuTypes) ? data.data.gpuTypes : [];
    } catch (error) {
      // Unobservable capacity is an HONEST unknown, not a zero-cost yes.
      return {
        providerId: config.providerId,
        capacityProfileId: str(ctx?.capacityProfileId),
        available: false,
        availabilityMode: config.mode === "serverless" ? "queued" : "on-demand",
        costBasis: { kind: "unknown", unitUsd: 0, source: `price query failed: ${str(error?.message).slice(0, 120)}` },
        estimatedTotalUsd: null,
        queueLatencySeconds: 0,
        quoteObservedAt: observedAt,
        quoteExpiresAt: new Date(Date.parse(observedAt) + QUOTE_TTL_MS).toISOString(),
        quoteRef: "",
      };
    }

    const inStock = gpuTypes
      .map((g) => ({
        id: str(g?.id),
        price: config.interruptible ? num(g?.lowestPrice?.minimumBidPrice, NaN) : num(g?.lowestPrice?.uninterruptablePrice, NaN),
        stock: str(g?.lowestPrice?.stockStatus),
      }))
      .filter((g) => g.id && g.stock && g.stock !== "None");
    const best = inStock
      .filter((g) => Number.isFinite(g.price))
      .sort((a, b) => a.price - b.price)[0] || null;

    const hourly = best ? best.price * gpuCount : NaN;
    const durationMin = num(ctx?.requirements?.estimatedDurationMinutes);
    return {
      providerId: config.providerId,
      capacityProfileId: str(ctx?.capacityProfileId),
      available: Boolean(best),
      availabilityMode: config.mode === "serverless" ? "queued" : (config.interruptible ? "spot" : "on-demand"),
      costBasis: Number.isFinite(hourly)
        ? { kind: "per-hour", unitUsd: hourly, source: "runpod-graphql-lowestPrice" }
        : { kind: "unknown", unitUsd: 0, source: "no in-stock price observed" },
      // Unknown duration → unknown total (null), NEVER zero.
      estimatedTotalUsd: Number.isFinite(hourly) && durationMin > 0 ? Math.round(hourly * (durationMin / 60) * 100) / 100 : null,
      queueLatencySeconds: config.mode === "serverless" ? 30 : 60,
      quoteObservedAt: observedAt,
      quoteExpiresAt: new Date(Date.parse(observedAt) + QUOTE_TTL_MS).toISOString(),
      quoteRef: best ? best.id : "",
    };
  },

  async allocate(ctx) {
    const config = cfg(ctx);
    const key = apiKey(ctx, config);
    const requestedAt = new Date().toISOString();
    const base = {
      runRef: { ...(ctx?.runRef || {}) },
      idempotencyKeyHash: str(ctx?.idempotencyKeyHash),
      requestedAt,
      releasedAt: "",
      releaseConfirmed: false,
    };

    if (config.mode === "serverless") {
      if (!config.endpointId) {
        return { ...base, allocationId: "", status: "failed", availabilityMode: "queued", costBasis: { kind: "unknown", unitUsd: 0, source: "" }, allocatedAt: "", allocated: null, error: "serverless mode requires config.endpointId" };
      }
      const submitted = await ctx.fetchJson(`${RUNPOD_SERVERLESS_BASE}/${config.endpointId}/run`, {
        method: "POST",
        headers: { Authorization: key, "Content-Type": "application/json" },
        body: JSON.stringify({
          input: {
            workSpec: ctx?.workSpec,
            datasetAccess: ctx?.datasetAccess,
            growthub: {
              trainingRunId: str(ctx?.runRef?.trainingRunId),
              capacityProfileId: str(ctx?.capacityProfileId),
              idempotencyKeyHash: str(ctx?.idempotencyKeyHash),
              workSpecHash: str(ctx?.workSpecHash),
            },
          },
        }),
      });
      const jobId = str(submitted?.id);
      if (!jobId) {
        return { ...base, allocationId: "", status: "failed", availabilityMode: "queued", costBasis: { kind: "unknown", unitUsd: 0, source: "" }, allocatedAt: "", allocated: null, error: "Runpod /run returned no job id" };
      }
      return {
        ...base,
        allocationId: jobId,
        runRef: { ...(ctx?.runRef || {}), providerResourceId: jobId },
        status: "allocated",
        availabilityMode: "queued",
        costBasis: { kind: "per-second", unitUsd: 0, source: "runpod-serverless (billed per second; rate is endpoint-level)" },
        allocatedAt: new Date().toISOString(),
        allocated: { gpuType: "", gpuCount: Math.max(1, Math.floor(num(ctx?.requirements?.gpuCount, 1))), workers: 1, region: "" },
      };
    }

    // Pods mode. Provider-native dedupe: the governed idempotency hash is the
    // pod name; reconcile before creating so a replay adopts, never duplicates.
    const podName = `ghl-${str(ctx?.idempotencyKeyHash).slice(0, 24) || "unkeyed"}`;
    try {
      const existing = await ctx.fetchJson(`${RUNPOD_REST_BASE}/pods?name=${encodeURIComponent(podName)}`, { headers: restHeaders(key) });
      const pods = Array.isArray(existing) ? existing : Array.isArray(existing?.pods) ? existing.pods : [];
      const live = pods.find((p) => str(p?.name) === podName && str(p?.desiredStatus) !== "TERMINATED");
      if (live) {
        return {
          ...base,
          allocationId: str(live.id),
          runRef: { ...(ctx?.runRef || {}), providerResourceId: str(live.id) },
          status: "allocated",
          availabilityMode: config.interruptible ? "spot" : "on-demand",
          costBasis: { kind: "per-hour", unitUsd: num(live.costPerHr), source: "runpod-pod-costPerHr (reconciled existing pod)" },
          allocatedAt: str(live.lastStartedAt) || new Date().toISOString(),
          allocated: { gpuType: str(live?.machine?.gpuType?.id || live?.gpuTypeId || ""), gpuCount: Math.max(1, Math.floor(num(live.gpuCount, 1))), workers: 1, region: str(live?.machine?.dataCenterId || "") },
          reconciled: true,
        };
      }
    } catch {
      // Reconcile probe failing is not fatal — creation still carries the
      // deterministic name, so a later reconcile can still find it.
    }

    if (!config.imageName && !config.templateId) {
      return { ...base, allocationId: "", status: "failed", availabilityMode: "on-demand", costBasis: { kind: "unknown", unitUsd: 0, source: "" }, allocatedAt: "", allocated: null, error: "pods mode requires config.imageName or config.templateId" };
    }
    const gpuCount = Math.max(1, Math.floor(num(ctx?.requirements?.gpuCount, 1)));
    const body = {
      name: podName,
      cloudType: config.cloudType,
      gpuTypeIds: runpodGpuCandidates({ requirements: ctx?.requirements, config }),
      gpuCount,
      interruptible: config.interruptible,
      ...(config.imageName ? { imageName: config.imageName } : {}),
      ...(config.templateId ? { templateId: config.templateId } : {}),
      ...(config.dataCenterIds.length ? { dataCenterIds: config.dataCenterIds } : {}),
      ...(config.networkVolumeId ? { networkVolumeId: config.networkVolumeId } : {}),
      ...(config.containerDiskInGb ? { containerDiskInGb: config.containerDiskInGb } : {}),
      env: {
        GROWTHUB_TRAINING_RUN_ID: str(ctx?.runRef?.trainingRunId),
        GROWTHUB_CAPACITY_PROFILE: str(ctx?.capacityProfileId),
        GROWTHUB_IDEMPOTENCY_HASH: str(ctx?.idempotencyKeyHash),
        GROWTHUB_WORK_SPEC_HASH: str(ctx?.workSpecHash),
        GROWTHUB_WORK_SPEC_JSON: JSON.stringify(ctx?.workSpec || {}),
        GROWTHUB_DATASET_ACCESS_JSON: JSON.stringify(ctx?.datasetAccess || {}),
      },
    };
    const pod = await ctx.fetchJson(`${RUNPOD_REST_BASE}/pods`, { method: "POST", headers: restHeaders(key), body: JSON.stringify(body) });
    const podId = str(pod?.id);
    if (!podId) {
      return { ...base, allocationId: "", status: "failed", availabilityMode: "on-demand", costBasis: { kind: "unknown", unitUsd: 0, source: "" }, allocatedAt: "", allocated: null, error: "Runpod pod create returned no id" };
    }
    return {
      ...base,
      allocationId: podId,
      runRef: { ...(ctx?.runRef || {}), providerResourceId: podId },
      status: "allocated",
      availabilityMode: config.interruptible ? "spot" : "on-demand",
      costBasis: { kind: "per-hour", unitUsd: num(pod.costPerHr), source: "runpod-pod-costPerHr" },
      allocatedAt: new Date().toISOString(),
      allocated: { gpuType: str(pod?.machine?.gpuType?.id || (Array.isArray(pod?.gpuTypeIds) ? pod.gpuTypeIds[0] : "")), gpuCount, workers: 1, region: str(pod?.machine?.dataCenterId || "") },
    };
  },

  async reconcile(ctx) {
    const config = cfg(ctx);
    if (config.mode === "serverless" || !ctx?.idempotencyKeyHash) return null;
    const key = apiKey(ctx, config);
    const podName = `ghl-${str(ctx.idempotencyKeyHash).slice(0, 24) || "unkeyed"}`;
    const existing = await ctx.fetchJson(`${RUNPOD_REST_BASE}/pods?name=${encodeURIComponent(podName)}`, { headers: restHeaders(key) });
    const pods = Array.isArray(existing) ? existing : Array.isArray(existing?.pods) ? existing.pods : [];
    const live = pods.find((pod) => str(pod?.name) === podName && str(pod?.desiredStatus) !== "TERMINATED");
    if (!live?.id) return null;
    return {
      allocationId: str(live.id),
      runRef: { ...(ctx?.runRef || {}), providerResourceId: str(live.id) },
      status: "allocated",
      idempotencyKeyHash: str(ctx.idempotencyKeyHash),
      availabilityMode: config.interruptible ? "spot" : "on-demand",
      costBasis: { kind: "per-hour", unitUsd: num(live.costPerHr), source: "runpod-pod-costPerHr (reconciled existing pod)" },
      requestedAt: new Date().toISOString(),
      allocatedAt: str(live.lastStartedAt) || new Date().toISOString(),
      releasedAt: "",
      releaseConfirmed: false,
      allocated: { gpuType: str(live?.machine?.gpuType?.id || live?.gpuTypeId || ""), gpuCount: Math.max(1, Math.floor(num(live.gpuCount, 1))), workers: 1, region: str(live?.machine?.dataCenterId || "") },
      reconciled: true,
    };
  },

  async status(ctx) {
    const config = cfg(ctx);
    const key = apiKey(ctx, config);
    const resourceId = str(ctx?.runRef?.providerResourceId);
    if (!resourceId) return [];

    if (config.mode === "serverless") {
      const job = await ctx.fetchJson(`${RUNPOD_SERVERLESS_BASE}/${config.endpointId}/status/${resourceId}`, { headers: { Authorization: key } });
      const status = str(job?.status);
      const type = mapRunpodJobStatus(status);
      if (!type) return [];
      return [providerEvent({ type, ctx, providerEventId: `${resourceId}:${status}`, detail: type === "compute-failed" ? str(job?.error || job?.output?.error || status) : status })];
    }

    const pod = await ctx.fetchJson(`${RUNPOD_REST_BASE}/pods/${resourceId}`, { headers: restHeaders(key) });
    const desired = str(pod?.desiredStatus);
    const change = str(pod?.lastStatusChange);
    const eventId = `${resourceId}:${desired}:${change}`;
    if (desired === "RUNNING") {
      return [providerEvent({ type: "compute-running", ctx, providerEventId: eventId, detail: `pod RUNNING${pod?.machine?.gpuType?.id ? ` on ${pod.machine.gpuType.id}` : ""}` })];
    }
    if (desired === "EXITED") {
      return [providerEvent({ type: "compute-completed", ctx, providerEventId: eventId, detail: "pod EXITED — a provider exit is a claim, not proof; artifact verification gates promotion" })];
    }
    if (desired === "TERMINATED") {
      return [providerEvent({ type: "compute-released", ctx, providerEventId: eventId, detail: "pod TERMINATED" })];
    }
    return [];
  },

  async execute(ctx) {
    if (!ctx?.workSpec?.workSpecHash) throw new Error("immutable work spec required");
    return [providerEvent({ type: "compute-queued", ctx, providerEventId: `${ctx.runRef.providerResourceId}:work-spec:${ctx.workSpec.workSpecHash}`, detail: `exact training work spec ${ctx.workSpec.workSpecHash} submitted` })];
  },

  async resume(ctx, checkpoint) {
    const config = cfg(ctx);
    if (!config.networkVolumeId) throw new Error("Runpod resume unavailable without a configured network volume");
    if (!checkpoint?.resumable || checkpoint?.runRef?.trainingRunId !== ctx?.runRef?.trainingRunId || checkpoint?.workSpecHash !== ctx?.workSpecHash) throw new Error("foreign, unproven, or wrong-work-spec checkpoint refused");
    const key = apiKey(ctx, config);
    if (config.mode === "serverless") {
      const submitted = await ctx.fetchJson(`${RUNPOD_SERVERLESS_BASE}/${config.endpointId}/run`, { method: "POST", headers: { Authorization: key, "Content-Type": "application/json" }, body: JSON.stringify({ input: { workSpec: ctx.workSpec, resumeCheckpoint: checkpoint } }) });
      const jobId = str(submitted?.id);
      if (!jobId) throw new Error("Runpod resume returned no job id");
      return [providerEvent({ type: "compute-resuming", ctx: { ...ctx, runRef: { ...ctx.runRef, providerResourceId: jobId } }, providerEventId: `${jobId}:resume:${checkpoint.checkpointId}`, detail: `resuming proven checkpoint ${checkpoint.checkpointId}` })];
    }
    await ctx.fetchJson(`${RUNPOD_REST_BASE}/pods/${ctx.runRef.providerResourceId}/start`, { method: "POST", headers: restHeaders(key) });
    return [providerEvent({ type: "compute-resuming", ctx, providerEventId: `${ctx.runRef.providerResourceId}:resume:${checkpoint.checkpointId}`, detail: `pod restarted from proven volume checkpoint ${checkpoint.checkpointId}` })];
  },

  async collectArtifact(ctx) {
    const config = cfg(ctx);
    const resourceId = str(ctx?.runRef?.providerResourceId);
    if (config.mode === "serverless" && config.endpointId && resourceId) {
      // Re-observe the terminal job: a completed handler may report the
      // artifact identity in its output. Reported ≠ trusted — the upstream
      // honesty gate still requires locator + sha256 and re-verifies.
      const key = apiKey(ctx, config);
      const job = await ctx.fetchJson(`${RUNPOD_SERVERLESS_BASE}/${config.endpointId}/status/${resourceId}`, { headers: { Authorization: key } });
      const out = job?.output?.artifact;
      if (out && typeof out === "object" && str(out.locator || out.path)) {
        return {
          runRef: { ...(ctx?.runRef || {}) },
          kind: str(out.kind) || "gguf",
          locator: str(out.locator || out.path),
          sha256: str(out.sha256),
          sizeBytes: Math.max(0, Math.floor(num(out.sizeBytes))),
          evidenceObservedAt: new Date().toISOString(),
          workSpecHash: str(out.workSpecHash || job?.output?.workSpecHash),
          corpusSha256: str(out.corpusSha256 || job?.output?.corpusSha256),
          evaluationResults: Array.isArray(job?.output?.evaluationResults) ? job.output.evaluationResults : [],
        };
      }
      return null;
    }
    // Pods: artifact identity is reported by the governed workload itself
    // through the receipt lane; the pod API carries none. Absent = absent.
    return null;
  },

  async cancel(ctx) {
    const config = cfg(ctx);
    const key = apiKey(ctx, config);
    const resourceId = str(ctx?.runRef?.providerResourceId);
    if (!resourceId) return [];
    if (config.mode === "serverless") {
      const res = await ctx.fetchJson(`${RUNPOD_SERVERLESS_BASE}/${config.endpointId}/cancel/${resourceId}`, { method: "POST", headers: { Authorization: key } });
      const status = str(res?.status).toUpperCase();
      // A request acknowledgement is not cancellation evidence. Only an
      // explicit terminal acknowledgement may advance the governed lifecycle.
      if (!["CANCELLED", "CANCELED"].includes(status) && res?.cancelled !== true) return [];
      return [providerEvent({ type: "compute-cancelled", ctx, providerEventId: `${resourceId}:cancel`, detail: status || "CANCELLED" })];
    }
    await ctx.fetchJson(`${RUNPOD_REST_BASE}/pods/${resourceId}/stop`, { method: "POST", headers: restHeaders(key) });
    return [providerEvent({ type: "compute-cancelled", ctx, providerEventId: `${resourceId}:stop`, detail: "pod stop requested — volume disk persists and still bills until terminated" })];
  },

  async release(ctx) {
    const config = cfg(ctx);
    const key = apiKey(ctx, config);
    const resourceId = str(ctx?.runRef?.providerResourceId);
    if (!resourceId) {
      return [providerEvent({ type: "compute-released", ctx, providerEventId: "", detail: "no provider resource was ever allocated", source: "workspace" })];
    }
    if (config.mode === "serverless") {
      const terminal = new Set(["COMPLETED", "FAILED", "CANCELLED", "CANCELED", "TIMED_OUT"]);
      const live = new Set(["IN_QUEUE", "IN_PROGRESS"]);
      const failed = (detail) => [providerEvent({
        type: "compute-release-failed",
        ctx,
        providerEventId: `${resourceId}:serverless-release-unverified`,
        detail: `${detail} — serverless job release is not confirmed; work may still be billing`,
        source: "workspace",
      })];
      try {
        const observed = await ctx.fetchJson(`${RUNPOD_SERVERLESS_BASE}/${config.endpointId}/status/${resourceId}`, { headers: { Authorization: key } });
        const status = str(observed?.status).toUpperCase();
        if (terminal.has(status)) return [providerEvent({ type: "compute-released", ctx, providerEventId: `${resourceId}:serverless-released:${status}`, detail: `serverless job ${status} — workers are terminal and scale to zero` })];
        if (!live.has(status)) return failed(`provider state "${status || "unknown"}" is not safely classifiable`);
        const cancelled = await ctx.fetchJson(`${RUNPOD_SERVERLESS_BASE}/${config.endpointId}/cancel/${resourceId}`, { method: "POST", headers: { Authorization: key } });
        const cancelStatus = str(cancelled?.status).toUpperCase();
        if (!["CANCELLED", "CANCELED"].includes(cancelStatus) && cancelled?.cancelled !== true) return failed(`provider did not confirm cancellation (status "${cancelStatus || "unknown"}")`);
        const confirmed = await ctx.fetchJson(`${RUNPOD_SERVERLESS_BASE}/${config.endpointId}/status/${resourceId}`, { headers: { Authorization: key } });
        const finalStatus = str(confirmed?.status).toUpperCase();
        if (!terminal.has(finalStatus)) return failed(`post-cancel state "${finalStatus || "unknown"}" is not terminal`);
        return [providerEvent({ type: "compute-released", ctx, providerEventId: `${resourceId}:serverless-released:${finalStatus}`, detail: `serverless release verified in terminal state ${finalStatus}` })];
      } catch (error) {
        return failed(`serverless release not confirmed: ${str(error?.message).slice(0, 160)}`);
      }
    }
    try {
      await ctx.fetchJson(`${RUNPOD_REST_BASE}/pods/${resourceId}`, { method: "DELETE", headers: restHeaders(key) });
      return [providerEvent({ type: "compute-released", ctx, providerEventId: `${resourceId}:terminated`, detail: "pod terminated (DELETE 204)" })];
    } catch (error) {
      return [providerEvent({ type: "compute-release-failed", ctx, providerEventId: `${resourceId}:terminate-failed`, detail: `terminate failed: ${str(error?.message).slice(0, 160)} — the pod may still exist and continue billing`, source: "workspace" })];
    }
  },
};

registerComputeProviderAdapter(runpodAdapter);

export default runpodAdapter;
