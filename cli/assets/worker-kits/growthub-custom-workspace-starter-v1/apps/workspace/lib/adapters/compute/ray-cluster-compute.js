/**
 * Portable Ray distributed backend — Sprints 8–9 of the Governed Compute
 * Realization. The provider-neutral distributed execution seam:
 *
 *   Compute Contract → Ray Jobs REST API → Ray Train (V2) → existing cluster
 *
 * Talks to the CURRENT (Ray 2.5x) Jobs REST API on the cluster head /
 * dashboard (default port 8265):
 *
 *   POST   /api/jobs/                submit — TRAILING SLASH REQUIRED;
 *                                    `submission_id` is client-suppliable and
 *                                    AT-MOST-ONCE (HTTP 400 when it already
 *                                    exists) — real provider-native
 *                                    idempotency, which this adapter uses:
 *                                    submission_id = ghl-<governed hash>
 *   GET    /api/jobs/{id}            status: PENDING | RUNNING | STOPPED |
 *                                            SUCCEEDED | FAILED
 *   GET    /api/jobs/{id}/logs       bounded log readback
 *   POST   /api/jobs/{id}/stop       cooperative stop
 *   GET    /api/version              reachability probe
 *
 * Auth: optional native token auth (Ray ≥ 2.52, RAY_AUTH_MODE=token) via
 * `Authorization: Bearer <token>` — env NAME from the governed row
 * (`authTokenEnv`), value resolved per call.
 *
 * The workspace describes the PORTABLE plan only (workers, gpusPerWorker,
 * memory, accelerator, checkpoint, gang scheduling); the adapter compiles it
 * into Ray-specific runtime configuration:
 *   - entrypoint env: GROWTHUB_NUM_WORKERS / GROWTHUB_GPUS_PER_WORKER /
 *     GROWTHUB_STORAGE_PATH / GROWTHUB_CORPUS_ROOT_HASH — the compliant
 *     driver builds its Ray Train ScalingConfig/RunConfig from these
 *     (num_workers, use_gpu, storage_path, FailureConfig for auto-resume);
 *   - job metadata: stable Growthub identity (workspace/model/run/profile/
 *     corpus hash). No secrets, ever.
 *   - driver evidence protocol (mirrors the local runner's GH_PROGRESS
 *     convention): the driver prints `GH_CHECKPOINT {json}` lines as
 *     checkpoints commit and one final `GH_ARTIFACT {json}` line; the
 *     adapter parses BOUNDED logs for them — a claimed artifact still needs
 *     locator + sha256 to count upstream.
 *
 * Generated Ray configuration is NEVER stored as independent workspace
 * authority — it is derived per call from the governed row + portable plan.
 *
 * Sprint 9: `createRayClusterAdapter` is the shared factory; the AWS
 * HyperPod and CoreWeave realizations below are PHYSICAL BINDINGS of the
 * same seam to already-authorized cluster endpoints (EKS+KubeRay /
 * CKS+KubeRay+Kueue). They do not redefine training semantics, and Growthub
 * Local does NOT procure, bill, or fleet-manage clusters — that authority
 * belongs to GH App. The same distributed plan is portable across both
 * (proven by the conformance suite).
 */

import { registerComputeProviderAdapter } from "./compute-adapter-registry.js";

export const RAY_ADAPTER_ID = "ray-cluster";
export const HYPERPOD_ADAPTER_ID = "aws-hyperpod-ray";
export const COREWEAVE_ADAPTER_ID = "coreweave-ray";

export const RAY_JOB_STATUS_MAP = {
  PENDING: "compute-queued",
  RUNNING: "compute-running",
  SUCCEEDED: "compute-completed",
  FAILED: "compute-failed",
  STOPPED: "compute-cancelled",
};

const QUOTE_TTL_MS = 10 * 60 * 1000;
const MAX_LOG_BYTES = 256 * 1024;

function str(v) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function cfg(ctx, realization) {
  const c = ctx?.providerConfig && typeof ctx.providerConfig === "object" ? ctx.providerConfig : {};
  return {
    dashboardUrl: str(c.dashboardUrl).replace(/\/+$/, ""),
    authTokenEnv: str(c.authTokenEnv),
    entrypoint: str(c.entrypoint) || "python growthub_ray_train_driver.py",
    runtimeEnv: c.runtimeEnv && typeof c.runtimeEnv === "object" ? c.runtimeEnv : null,
    storagePath: str(c.storagePath),
    maxWorkers: Math.max(1, Math.floor(num(c.maxWorkers, realization?.defaultMaxWorkers ?? 1))),
    gpusPerWorkerMax: Math.max(0, Math.floor(num(c.gpusPerWorkerMax, 8))),
    maxVramPerGpuGB: Math.max(0, num(c.maxVramPerGpuGB, realization?.defaultMaxVramPerGpuGB ?? 0)),
    gangScheduling: c.gangScheduling === true || realization?.gangByDefault === true,
    highBandwidthInterconnect: c.highBandwidthInterconnect === true || realization?.hbiByDefault === true,
    clusterHourlyUsd: Math.max(0, num(c.clusterHourlyUsd)),
    owned: c.owned === true,
    region: str(c.region),
    dataResidency: str(c.dataResidency),
    corpusRootHash: str(c.corpusRootHash),
    workspaceId: str(c.workspaceId),
    providerId: str(c.providerId) || (realization?.id || RAY_ADAPTER_ID),
  };
}

function headers(ctx, config) {
  const h = { "Content-Type": "application/json" };
  if (config.authTokenEnv) {
    const token = typeof ctx?.resolveEnv === "function" ? ctx.resolveEnv(config.authTokenEnv) : "";
    if (!token) throw new Error(`Ray auth token env "${config.authTokenEnv}" not present at call time`);
    h.Authorization = `Bearer ${token}`;
  }
  return h;
}

/**
 * Compile the PORTABLE distributed plan into the Ray job submission body.
 * Pure and exported so portability is directly testable: the same plan must
 * compile identically for every Ray-backed realization.
 */
export function buildRayJobSubmission({ ctx, config }) {
  const req = ctx?.requirements && typeof ctx.requirements === "object" ? ctx.requirements : {};
  const dist = req.distributed && typeof req.distributed === "object" ? req.distributed : null;
  const workers = dist ? Math.max(1, Math.floor(num(dist.workers, 1))) : 1;
  const gpusPerWorker = dist ? Math.max(0, Math.floor(num(dist.gpusPerWorker, 0))) : Math.max(0, Math.floor(num(req.gpuCount, 0)));
  return {
    entrypoint: config.entrypoint,
    submission_id: `ghl-${str(ctx?.idempotencyKeyHash).slice(0, 32) || "unkeyed"}`,
    runtime_env: {
      ...(config.runtimeEnv || {}),
      env_vars: {
        ...((config.runtimeEnv && config.runtimeEnv.env_vars) || {}),
        GROWTHUB_TRAINING_RUN_ID: str(ctx?.runRef?.trainingRunId),
        GROWTHUB_CAPACITY_PROFILE: str(ctx?.capacityProfileId),
        GROWTHUB_NUM_WORKERS: String(workers),
        GROWTHUB_GPUS_PER_WORKER: String(gpusPerWorker),
        GROWTHUB_CHECKPOINT_REQUIRED: req.checkpointRequired === true ? "1" : "0",
        GROWTHUB_GANG_SCHEDULING: dist?.gangScheduling === true ? "1" : "0",
        ...(config.storagePath ? { GROWTHUB_STORAGE_PATH: config.storagePath } : {}),
        ...(config.corpusRootHash ? { GROWTHUB_CORPUS_ROOT_HASH: config.corpusRootHash } : {}),
      },
    },
    metadata: {
      growthubWorkspaceId: config.workspaceId,
      growthubModelId: str(ctx?.runRef?.modelTrainingRowId),
      growthubTrainingRunId: str(ctx?.runRef?.trainingRunId),
      growthubCapacityProfileId: str(ctx?.capacityProfileId),
      growthubCorpusRootHash: config.corpusRootHash,
      growthubIdempotencyHash: str(ctx?.idempotencyKeyHash),
    },
    // The driver command itself is light; worker resources are reserved by
    // Ray Train's ScalingConfig (placement group) from the env vars above.
    entrypoint_num_cpus: 1,
  };
}

/** Parse GH_CHECKPOINT / GH_ARTIFACT evidence lines from bounded logs. */
export function parseRayDriverEvidence(logs) {
  const bounded = str(logs).slice(-MAX_LOG_BYTES);
  const checkpoints = [];
  let artifact = null;
  for (const line of bounded.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("GH_CHECKPOINT ")) {
      try { checkpoints.push(JSON.parse(trimmed.slice("GH_CHECKPOINT ".length))); } catch { /* malformed line is not evidence */ }
    } else if (trimmed.startsWith("GH_ARTIFACT ")) {
      try { artifact = JSON.parse(trimmed.slice("GH_ARTIFACT ".length)); } catch { /* malformed line is not evidence */ }
    }
  }
  return { checkpoints, artifact };
}

/**
 * Factory for a Ray-backed compute adapter. `realization` binds the seam to
 * a physical cluster flavor without changing training semantics.
 */
export function createRayClusterAdapter(realization = null) {
  const id = realization?.adapterId || RAY_ADAPTER_ID;

  return {
    id,
    label: realization?.label || "Ray cluster",
    description: realization?.description || "Provider-neutral Ray Jobs + Ray Train distributed backend bound to an already-authorized cluster endpoint.",
    locality: "cluster",

    describeCapabilities(config = {}) {
      const c = cfg({ providerConfig: config }, realization);
      return {
        providerId: c.providerId,
        adapterId: id,
        capacityProfiles: [
          "single-gpu-finetune",
          "multi-gpu-finetune",
          ...(c.maxWorkers >= 2 ? ["distributed-training"] : []),
          "burst-gpu",
        ],
        availabilityModes: ["reserved"],
        acceleratorClasses: ["any-gpu", "datacenter-gpu", "high-memory-gpu"],
        maxVramPerGpuGB: c.maxVramPerGpuGB,
        maxGpusPerWorker: c.gpusPerWorkerMax,
        maxWorkers: c.maxWorkers,
        // Checkpoint/resume require a shared storage path (S3/FSx/NFS class)
        // — Ray Train errors on local paths for multi-node, so no path = no
        // claim. Resume additionally leans on FailureConfig + (HyperPod)
        // node auto-replacement, both storage-dependent.
        supportsCheckpointing: Boolean(c.storagePath),
        supportsResume: Boolean(c.storagePath),
        // True gang needs a batch scheduler (Volcano/YuniKorn/Kueue) or the
        // realization's guarantee — operator-attested, never assumed.
        supportsGangScheduling: c.gangScheduling,
        regions: c.region ? [c.region] : [],
        requiredEnv: c.authTokenEnv ? [c.authTokenEnv] : [],
      };
    },

    async inspectCapacity(ctx) {
      const config = cfg(ctx, realization);
      const observedAt = new Date().toISOString();
      let reachable = false;
      let probeDetail = "";
      if (config.dashboardUrl) {
        try {
          await ctx.fetchJson(`${config.dashboardUrl}/api/version`, { headers: headers(ctx, config) });
          reachable = true;
        } catch (error) {
          probeDetail = str(error?.message).slice(0, 120);
        }
      } else {
        probeDetail = "no dashboardUrl configured — bind the governed row to an authorized Ray endpoint";
      }
      const durationMin = num(ctx?.requirements?.estimatedDurationMinutes);
      const costBasis = config.owned
        ? { kind: "owned-hardware", unitUsd: 0, source: "operator-owned cluster" }
        : config.clusterHourlyUsd > 0
          ? { kind: "per-hour", unitUsd: config.clusterHourlyUsd, source: "operator-declared cluster rate" }
          : { kind: "unknown", unitUsd: 0, source: "cluster rate not declared — unknown cost is not zero" };
      return {
        providerId: config.providerId,
        capacityProfileId: str(ctx?.capacityProfileId),
        available: reachable,
        availabilityMode: "reserved",
        costBasis,
        estimatedTotalUsd: config.owned ? 0 : config.clusterHourlyUsd > 0 && durationMin > 0 ? Math.round(config.clusterHourlyUsd * (durationMin / 60) * 100) / 100 : null,
        queueLatencySeconds: 15,
        quoteObservedAt: observedAt,
        quoteExpiresAt: new Date(Date.parse(observedAt) + QUOTE_TTL_MS).toISOString(),
        quoteRef: "",
        ...(probeDetail ? { adapterMeta: { probeDetail } } : {}),
      };
    },

    async allocate(ctx) {
      const config = cfg(ctx, realization);
      const requestedAt = new Date().toISOString();
      const base = { runRef: { ...(ctx?.runRef || {}) }, idempotencyKeyHash: str(ctx?.idempotencyKeyHash), requestedAt, releasedAt: "", releaseConfirmed: false };
      if (!config.dashboardUrl) {
        return { ...base, allocationId: "", status: "failed", availabilityMode: "reserved", costBasis: { kind: "unknown", unitUsd: 0, source: "" }, allocatedAt: "", allocated: null, error: "Ray adapter requires config.dashboardUrl" };
      }
      const dist = ctx?.requirements?.distributed;
      if (dist && num(dist.workers) > config.maxWorkers) {
        return { ...base, allocationId: "", status: "failed", availabilityMode: "reserved", costBasis: { kind: "unknown", unitUsd: 0, source: "" }, allocatedAt: "", allocated: null, error: `plan needs ${dist.workers} workers — this cluster row declares ${config.maxWorkers}` };
      }
      const submission = buildRayJobSubmission({ ctx, config });
      let submitted = null;
      try {
        submitted = await ctx.fetchJson(`${config.dashboardUrl}/api/jobs/`, { method: "POST", headers: headers(ctx, config), body: JSON.stringify(submission) });
      } catch (error) {
        // Provider-native idempotency: a 400 "already exists" means THIS
        // governed request already submitted — adopt it, never duplicate.
        if (/already exists|400/.test(str(error?.message))) {
          try {
            const existing = await ctx.fetchJson(`${config.dashboardUrl}/api/jobs/${submission.submission_id}`, { headers: headers(ctx, config) });
            if (existing) {
              return {
                ...base,
                allocationId: submission.submission_id,
                runRef: { ...(ctx?.runRef || {}), providerResourceId: submission.submission_id },
                status: "allocated",
                availabilityMode: "reserved",
                costBasis: config.owned ? { kind: "owned-hardware", unitUsd: 0, source: "operator-owned cluster" } : { kind: "per-hour", unitUsd: config.clusterHourlyUsd, source: "operator-declared cluster rate" },
                allocatedAt: new Date().toISOString(),
                allocated: { gpuType: "", gpuCount: Math.max(0, Math.floor(num(dist?.gpusPerWorker, num(ctx?.requirements?.gpuCount)))), workers: Math.max(1, Math.floor(num(dist?.workers, 1))), region: config.region },
                reconciled: true,
              };
            }
          } catch { /* fall through to failure below */ }
        }
        return { ...base, allocationId: "", status: "failed", availabilityMode: "reserved", costBasis: { kind: "unknown", unitUsd: 0, source: "" }, allocatedAt: "", allocated: null, error: `Ray job submit failed: ${str(error?.message).slice(0, 200)}` };
      }
      const submissionId = str(submitted?.submission_id) || submission.submission_id;
      return {
        ...base,
        allocationId: submissionId,
        runRef: { ...(ctx?.runRef || {}), providerResourceId: submissionId },
        status: "allocated",
        availabilityMode: "reserved",
        costBasis: config.owned ? { kind: "owned-hardware", unitUsd: 0, source: "operator-owned cluster" } : config.clusterHourlyUsd > 0 ? { kind: "per-hour", unitUsd: config.clusterHourlyUsd, source: "operator-declared cluster rate" } : { kind: "unknown", unitUsd: 0, source: "cluster rate not declared" },
        allocatedAt: new Date().toISOString(),
        allocated: { gpuType: "", gpuCount: Math.max(0, Math.floor(num(dist?.gpusPerWorker, num(ctx?.requirements?.gpuCount)))), workers: Math.max(1, Math.floor(num(dist?.workers, 1))), region: config.region },
      };
    },

    async status(ctx) {
      const config = cfg(ctx, realization);
      const jobId = str(ctx?.runRef?.providerResourceId);
      if (!jobId || !config.dashboardUrl) return [];
      const job = await ctx.fetchJson(`${config.dashboardUrl}/api/jobs/${jobId}`, { headers: headers(ctx, config) });
      const status = str(job?.status).toUpperCase();
      const type = RAY_JOB_STATUS_MAP[status] || "";
      if (!type) return [];
      const events = [];
      const mkEvent = (t, idSuffix, detail, extra = {}) => {
        const at = new Date().toISOString();
        return { type: t, at, evidenceObservedAt: at, source: "provider", runRef: { ...(ctx?.runRef || {}) }, providerEventId: `${jobId}:${idSuffix}`, detail: str(detail).slice(0, 500), ...extra };
      };
      // Checkpoint evidence from the driver's GH_CHECKPOINT lines (bounded).
      if (status === "RUNNING" || status === "SUCCEEDED") {
        try {
          const logResponse = await ctx.fetchJson(`${config.dashboardUrl}/api/jobs/${jobId}/logs`, { headers: headers(ctx, config) });
          const { checkpoints } = parseRayDriverEvidence(logResponse?.logs);
          for (const checkpoint of checkpoints) {
            events.push(mkEvent("checkpoint-created", `ckpt:${str(checkpoint?.checkpointId || checkpoint?.step)}`, `checkpoint ${str(checkpoint?.checkpointId || checkpoint?.step)}`, { checkpoint }));
          }
        } catch { /* logs unavailable — checkpoints simply not observed */ }
      }
      events.push(mkEvent(type, status, type === "compute-failed" ? str(job?.message || status).slice(0, 200) : status));
      return events;
    },

    async collectArtifact(ctx) {
      const config = cfg(ctx, realization);
      const jobId = str(ctx?.runRef?.providerResourceId);
      if (!jobId || !config.dashboardUrl) return null;
      const logResponse = await ctx.fetchJson(`${config.dashboardUrl}/api/jobs/${jobId}/logs`, { headers: headers(ctx, config) });
      const { artifact } = parseRayDriverEvidence(logResponse?.logs);
      if (!artifact || !str(artifact.locator || artifact.path)) return null;
      return {
        runRef: { ...(ctx?.runRef || {}) },
        kind: str(artifact.kind) || "gguf",
        locator: str(artifact.locator || artifact.path),
        sha256: str(artifact.sha256),
        sizeBytes: Math.max(0, Math.floor(num(artifact.sizeBytes))),
        evidenceObservedAt: new Date().toISOString(),
      };
    },

    async cancel(ctx) {
      const config = cfg(ctx, realization);
      const jobId = str(ctx?.runRef?.providerResourceId);
      if (!jobId) return [];
      const res = await ctx.fetchJson(`${config.dashboardUrl}/api/jobs/${jobId}/stop`, { method: "POST", headers: headers(ctx, config) });
      const at = new Date().toISOString();
      return [{ type: "compute-cancelled", at, evidenceObservedAt: at, source: "provider", runRef: { ...(ctx?.runRef || {}) }, providerEventId: `${jobId}:stop`, detail: res?.stopped === true ? "job stop signaled" : "stop requested" }];
    },

    async release(ctx) {
      const config = cfg(ctx, realization);
      const jobId = str(ctx?.runRef?.providerResourceId);
      const at = new Date().toISOString();
      const mk = (type, detail) => [{ type, at, evidenceObservedAt: at, source: "workspace", runRef: { ...(ctx?.runRef || {}) }, providerEventId: jobId ? `${jobId}:release` : "", detail }];
      if (!jobId) return mk("compute-released", "no job was submitted");
      try {
        const job = await ctx.fetchJson(`${config.dashboardUrl}/api/jobs/${jobId}`, { headers: headers(ctx, config) });
        const status = str(job?.status).toUpperCase();
        if (["SUCCEEDED", "FAILED", "STOPPED"].includes(status)) {
          return mk("compute-released", `job ${status} — its placement-group resources returned to the cluster pool. The cluster itself is externally managed (GH App authority), so cluster-level cost is governed there.`);
        }
        await ctx.fetchJson(`${config.dashboardUrl}/api/jobs/${jobId}/stop`, { method: "POST", headers: headers(ctx, config) });
        return mk("compute-released", "live job stopped — worker resources returned to the cluster pool");
      } catch (error) {
        return mk("compute-release-failed", `release not confirmed: ${str(error?.message).slice(0, 160)} — the job may still hold cluster resources`);
      }
    },
  };
}

// The three Ray-backed realizations. HyperPod and CoreWeave bind the SAME
// seam to already-authorized endpoints; neither procures clusters.
const rayAdapter = createRayClusterAdapter(null);

const hyperpodAdapter = createRayClusterAdapter({
  adapterId: HYPERPOD_ADAPTER_ID,
  id: "aws-hyperpod",
  label: "AWS SageMaker HyperPod (EKS + KubeRay)",
  description: "Ray-backed realization on an already-authorized HyperPod EKS cluster: KubeRay operator, FSx/S3 checkpoint storage, deep-health-checked nodes with automatic replacement (drive FailureConfig(max_failures=-1) for auto-resume).",
  // HyperPod ships EFA-class interconnect on GPU instances.
  hbiByDefault: true,
  defaultMaxVramPerGpuGB: 141,
  defaultMaxWorkers: 1, // declared per row — never assumed cluster size
});

const coreweaveAdapter = createRayClusterAdapter({
  adapterId: COREWEAVE_ADAPTER_ID,
  id: "coreweave",
  label: "CoreWeave CKS (KubeRay + Kueue)",
  description: "Ray-backed realization on an already-authorized CoreWeave CKS cluster: customer-installed KubeRay with Kueue gang admission (all-or-nothing RayCluster placement) on InfiniBand-backed GPU nodes.",
  hbiByDefault: true,
  // Kueue admission is CoreWeave's documented Ray pattern — gang by default.
  gangByDefault: true,
  defaultMaxVramPerGpuGB: 141,
  defaultMaxWorkers: 1,
});

registerComputeProviderAdapter(rayAdapter);
registerComputeProviderAdapter(hyperpodAdapter);
registerComputeProviderAdapter(coreweaveAdapter);

export { rayAdapter, hyperpodAdapter, coreweaveAdapter };
export default rayAdapter;
