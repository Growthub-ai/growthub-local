/**
 * Modal compute provider adapter — Sprint 7 of the Governed Compute
 * Realization. Modal (modal.com) has NO public REST control plane — the
 * official non-Python invocation paths are the gRPC SDKs and DEPLOYED WEB
 * ENDPOINTS with proxy auth. This adapter takes the web-endpoint path so the
 * workspace needs no SDK dependency: the operator pre-deploys a compatible
 * execution function (Modal Python SDK, `@modal.fastapi_endpoint(...,
 * requires_proxy_auth=True)`) and the adapter drives it with plain fetch.
 *
 * Pre-deployed function contract (the Growthub-Modal execution function):
 *   POST {baseUrl}/submit   { workload, growthub: { trainingRunId, capacityProfileId,
 *                             idempotencyKey } }            → { call_id }
 *     (the function spawns the real work via .spawn() and returns the
 *      persistent function-call id — results retrievable for 7 days)
 *   GET  {baseUrl}/status?call_id=…                         → { status, error?, artifact? }
 *     status ∈ pending | running | success | failure | terminated | timeout
 *   POST {baseUrl}/cancel   { call_id }                     → { cancelled }
 *   GET  {baseUrl}/health                                   → 200 (reachability probe)
 *
 * Auth: Modal workspace Proxy-Token credentials in the documented headers
 *   Modal-Key: wk-…   Modal-Secret: ws-…
 * resolved by env NAME at call time (`tokenIdEnv`/`tokenSecretEnv`, defaults
 * MODAL_KEY / MODAL_SECRET). Values never enter rows, receipts, or logs.
 *
 * Honesty boundaries (current Modal capabilities, July 2026):
 *   - GPUs: T4 → B300, max 8 per container; multi-node is EXPERIMENTAL
 *     (`@modal.experimental.clustered`, up to 8×8) — the adapter claims
 *     maxWorkers > 1 ONLY when the row config attests the deployed function
 *     is clustered (`clusterWorkers`), and never claims gang scheduling
 *     beyond what clustered provides (all-or-nothing start = true gang);
 *   - no price API exists: the static per-hour catalog below is labeled
 *     static-catalog; availability is proven by the health probe, not
 *     assumed;
 *   - spawn has no cross-call idempotency: the governed idempotency key is
 *     forwarded to the function (a compliant function dedupes), and
 *     exactly-once otherwise rides the upstream fail-closed replay guard;
 *   - checkpoint/resume claims require the row to attest a Modal Volume is
 *     wired (`volumeConfigured: true`);
 *   - scale-to-zero: a terminal function call holds no capacity, so release
 *     is cancel-if-live; there is no standing pod to terminate.
 */

import { registerComputeProviderAdapter } from "./compute-adapter-registry.js";

export const MODAL_ADAPTER_ID = "modal-functions";

/** Static per-hour GPU catalog (modal.com/pricing, July 2026) — labeled as
 *  such in every quote; Modal exposes no programmatic price list. */
export const MODAL_GPU_CATALOG = [
  { gpu: "T4", vramGB: 16, usdPerHour: 0.59 },
  { gpu: "L4", vramGB: 24, usdPerHour: 0.80 },
  { gpu: "A10", vramGB: 24, usdPerHour: 1.10 },
  { gpu: "L40S", vramGB: 48, usdPerHour: 1.95 },
  { gpu: "A100-40GB", vramGB: 40, usdPerHour: 2.10 },
  { gpu: "A100-80GB", vramGB: 80, usdPerHour: 2.50 },
  { gpu: "H100", vramGB: 80, usdPerHour: 3.95 },
  { gpu: "H200", vramGB: 141, usdPerHour: 4.54 },
  { gpu: "B200", vramGB: 180, usdPerHour: 6.25 },
];

const QUOTE_TTL_MS = 10 * 60 * 1000;

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
    baseUrl: str(c.baseUrl).replace(/\/+$/, ""),
    tokenIdEnv: str(c.tokenIdEnv) || "MODAL_KEY",
    tokenSecretEnv: str(c.tokenSecretEnv) || "MODAL_SECRET",
    // No default pin: an unpinned row selects the CHEAPEST catalog GPU that
    // satisfies the VRAM floor; a pinned type is honored when sufficient.
    gpuType: str(c.gpuType),
    clusterWorkers: Math.max(1, Math.floor(num(c.clusterWorkers, 1))),
    volumeConfigured: c.volumeConfigured === true,
    warmContainers: Math.max(0, Math.floor(num(c.warmContainers))),
    workload: c.workload && typeof c.workload === "object" ? c.workload : null,
    providerId: str(c.providerId) || "modal",
    region: str(c.region),
  };
}

function authHeaders(ctx, config) {
  const key = typeof ctx?.resolveEnv === "function" ? ctx.resolveEnv(config.tokenIdEnv) : "";
  const secret = typeof ctx?.resolveEnv === "function" ? ctx.resolveEnv(config.tokenSecretEnv) : "";
  if (!key || !secret) {
    throw new Error(`Modal proxy-token env "${config.tokenIdEnv}"/"${config.tokenSecretEnv}" not present at call time`);
  }
  return { "Modal-Key": key, "Modal-Secret": secret, "Content-Type": "application/json" };
}

/** Pick the cheapest catalog GPU satisfying a per-GPU VRAM floor. */
export function modalGpuFor({ requirements, config }) {
  const pinned = MODAL_GPU_CATALOG.find((g) => g.gpu === config?.gpuType);
  const minVram = Math.max(0, num(requirements?.minVramPerGpuGB));
  if (pinned && pinned.vramGB >= minVram) return pinned;
  const fits = MODAL_GPU_CATALOG.filter((g) => g.vramGB >= minVram).sort((a, b) => a.usdPerHour - b.usdPerHour);
  return fits[0] || null;
}

/** Map the deployed-function status vocabulary to normalized events. */
export function mapModalCallStatus(status) {
  switch (str(status).toLowerCase()) {
    case "pending": return "compute-queued";
    case "running": return "compute-running";
    case "success": return "compute-completed";
    case "failure": return "compute-failed";
    case "timeout": return "compute-failed";
    case "terminated": return "compute-cancelled";
    default: return "";
  }
}

function providerEvent({ type, ctx, providerEventId, detail, source = "provider", extra = {} }) {
  const at = new Date().toISOString();
  return { type, at, evidenceObservedAt: at, source, runRef: { ...(ctx?.runRef || {}) }, providerEventId: str(providerEventId), detail: str(detail).slice(0, 500), ...extra };
}

const modalAdapter = {
  id: MODAL_ADAPTER_ID,
  label: "Modal",
  description: "Modal serverless GPU functions via a pre-deployed proxy-authed execution endpoint. Per-second billing, scale-to-zero, up to 8 GPUs/container (clustered attested via config).",
  locality: "remote",

  describeCapabilities(config = {}) {
    const c = cfg({ providerConfig: config });
    const clustered = c.clusterWorkers > 1;
    return {
      providerId: c.providerId,
      adapterId: MODAL_ADAPTER_ID,
      capacityProfiles: [
        "burst-gpu",
        "single-gpu-finetune",
        "multi-gpu-finetune",
        ...(c.warmContainers > 0 ? ["warm-inference"] : []),
        ...(clustered ? ["distributed-training"] : []),
      ],
      availabilityModes: ["on-demand", ...(c.warmContainers > 0 ? ["warm"] : [])],
      acceleratorClasses: ["any-gpu", "datacenter-gpu", "high-memory-gpu"],
      maxVramPerGpuGB: 180,
      maxGpusPerWorker: 8,
      // Multi-node ONLY when the deployed function is attested clustered
      // (Modal @modal.experimental.clustered, up to 8 nodes × 8 GPUs).
      maxWorkers: clustered ? Math.min(8, c.clusterWorkers) : 1,
      supportsCheckpointing: c.volumeConfigured,
      supportsResume: c.volumeConfigured,
      // clustered starts all nodes together or not at all — true gang.
      supportsGangScheduling: clustered,
      regions: c.region ? [c.region] : [],
      requiredEnv: [c.tokenIdEnv, c.tokenSecretEnv],
    };
  },

  async inspectCapacity(ctx) {
    const config = cfg(ctx);
    const observedAt = new Date().toISOString();
    const gpu = modalGpuFor({ requirements: ctx?.requirements, config });
    const gpuCount = Math.max(1, Math.floor(num(ctx?.requirements?.gpuCount, 1)));
    const workers = Math.max(1, Math.floor(num(ctx?.requirements?.distributed?.workers, 1)));
    const expiry = new Date(Date.parse(observedAt) + QUOTE_TTL_MS).toISOString();

    // Availability is PROVEN by the deployed endpoint answering, never assumed.
    let reachable = false;
    let probeDetail = "";
    if (config.baseUrl) {
      try {
        await ctx.fetchJson(`${config.baseUrl}/health`, { headers: authHeaders(ctx, config) });
        reachable = true;
      } catch (error) {
        probeDetail = str(error?.message).slice(0, 120);
      }
    } else {
      probeDetail = "no baseUrl configured for the pre-deployed execution function";
    }

    const hourly = gpu ? gpu.usdPerHour * gpuCount * workers : NaN;
    const durationMin = num(ctx?.requirements?.estimatedDurationMinutes);
    return {
      providerId: config.providerId,
      capacityProfileId: str(ctx?.capacityProfileId),
      available: reachable && Boolean(gpu),
      availabilityMode: config.warmContainers > 0 ? "warm" : "on-demand",
      costBasis: gpu
        ? { kind: "per-hour", unitUsd: Math.round(hourly * 100) / 100, source: `static-catalog (${gpu.gpu} × ${gpuCount}${workers > 1 ? ` × ${workers} workers` : ""}; Modal bills per second)` }
        : { kind: "unknown", unitUsd: 0, source: `no catalog GPU satisfies ${num(ctx?.requirements?.minVramPerGpuGB)} GB VRAM` },
      estimatedTotalUsd: gpu && durationMin > 0 ? Math.round(hourly * (durationMin / 60) * 100) / 100 : null,
      queueLatencySeconds: config.warmContainers > 0 ? 2 : 30,
      quoteObservedAt: observedAt,
      quoteExpiresAt: expiry,
      quoteRef: gpu ? gpu.gpu : "",
      ...(probeDetail ? { adapterMeta: { probeDetail } } : {}),
    };
  },

  async allocate(ctx) {
    const config = cfg(ctx);
    const requestedAt = new Date().toISOString();
    const base = { runRef: { ...(ctx?.runRef || {}) }, idempotencyKeyHash: str(ctx?.idempotencyKeyHash), requestedAt, releasedAt: "", releaseConfirmed: false };
    if (!config.baseUrl) {
      return { ...base, allocationId: "", status: "failed", availabilityMode: "on-demand", costBasis: { kind: "unknown", unitUsd: 0, source: "" }, allocatedAt: "", allocated: null, error: "Modal adapter requires config.baseUrl (the pre-deployed execution function URL)" };
    }
    const gpu = modalGpuFor({ requirements: ctx?.requirements, config });
    const gpuCount = Math.max(1, Math.floor(num(ctx?.requirements?.gpuCount, 1)));
    const submitted = await ctx.fetchJson(`${config.baseUrl}/submit`, {
      method: "POST",
      headers: authHeaders(ctx, config),
      body: JSON.stringify({
        workSpec: ctx?.workSpec,
        gpu: gpu ? `${gpu.gpu}${gpuCount > 1 ? `:${gpuCount}` : ""}` : "",
        growthub: {
          trainingRunId: str(ctx?.runRef?.trainingRunId),
          capacityProfileId: str(ctx?.capacityProfileId),
          // Forwarded so a compliant deployed function can dedupe; exactly-
          // once is otherwise enforced upstream, fail closed.
          idempotencyKey: str(ctx?.idempotencyKeyHash),
          workSpecHash: str(ctx?.workSpecHash),
        },
      }),
    });
    const callId = str(submitted?.call_id || submitted?.callId);
    if (!callId) {
      return { ...base, allocationId: "", status: "failed", availabilityMode: "on-demand", costBasis: { kind: "unknown", unitUsd: 0, source: "" }, allocatedAt: "", allocated: null, error: "deployed function returned no call_id" };
    }
    return {
      ...base,
      allocationId: callId,
      runRef: { ...(ctx?.runRef || {}), providerResourceId: callId },
      status: "allocated",
      availabilityMode: config.warmContainers > 0 ? "warm" : "on-demand",
      costBasis: gpu ? { kind: "per-hour", unitUsd: gpu.usdPerHour * gpuCount, source: "static-catalog (billed per second)" } : { kind: "unknown", unitUsd: 0, source: "" },
      allocatedAt: new Date().toISOString(),
      allocated: { gpuType: gpu ? gpu.gpu : "", gpuCount, workers: Math.max(1, Math.floor(num(ctx?.requirements?.distributed?.workers, 1))), region: config.region },
    };
  },

  async status(ctx) {
    const config = cfg(ctx);
    const callId = str(ctx?.runRef?.providerResourceId);
    if (!callId || !config.baseUrl) return [];
    const call = await ctx.fetchJson(`${config.baseUrl}/status?call_id=${encodeURIComponent(callId)}`, { headers: authHeaders(ctx, config) });
    const status = str(call?.status);
    const type = mapModalCallStatus(status);
    if (!type) return [];
    const events = [];
    if (call?.checkpoint && typeof call.checkpoint === "object") {
      events.push(providerEvent({ type: "checkpoint-created", ctx, providerEventId: `${callId}:checkpoint:${str(call.checkpoint.checkpointId || call.checkpoint.step)}`, detail: `checkpoint ${str(call.checkpoint.checkpointId || call.checkpoint.step)}`, extra: { checkpoint: call.checkpoint } }));
    }
    events.push(providerEvent({ type, ctx, providerEventId: `${callId}:${status}`, detail: type === "compute-failed" ? str(call?.error || status).slice(0, 200) : status }));
    return events;
  },

  async execute(ctx) {
    if (!ctx?.workSpec?.workSpecHash) throw new Error("immutable work spec required");
    return [providerEvent({ type: "compute-queued", ctx, providerEventId: `${ctx.runRef.providerResourceId}:work-spec:${ctx.workSpec.workSpecHash}`, detail: `exact training work spec ${ctx.workSpec.workSpecHash} submitted` })];
  },

  async resume(ctx, checkpoint) {
    const config = cfg(ctx);
    if (!config.volumeConfigured) throw new Error("Modal resume unavailable without a configured Volume");
    if (!checkpoint?.resumable || checkpoint?.runRef?.trainingRunId !== ctx?.runRef?.trainingRunId || checkpoint?.workSpecHash !== ctx?.workSpecHash) throw new Error("foreign, unproven, or wrong-work-spec checkpoint refused");
    const resumed = await ctx.fetchJson(`${config.baseUrl}/resume`, { method: "POST", headers: authHeaders(ctx, config), body: JSON.stringify({ call_id: ctx.runRef.providerResourceId, workSpec: ctx.workSpec, checkpoint }) });
    const callId = str(resumed?.call_id || resumed?.callId || ctx.runRef.providerResourceId);
    return [providerEvent({ type: "compute-resuming", ctx: { ...ctx, runRef: { ...ctx.runRef, providerResourceId: callId } }, providerEventId: `${callId}:resume:${checkpoint.checkpointId}`, detail: `resuming proven checkpoint ${checkpoint.checkpointId}` })];
  },

  async collectArtifact(ctx) {
    const config = cfg(ctx);
    const callId = str(ctx?.runRef?.providerResourceId);
    if (!callId || !config.baseUrl) return null;
    const call = await ctx.fetchJson(`${config.baseUrl}/status?call_id=${encodeURIComponent(callId)}`, { headers: authHeaders(ctx, config) });
    const artifact = call?.artifact;
    if (!artifact || typeof artifact !== "object" || !str(artifact.locator || artifact.path)) return null;
    return {
      runRef: { ...(ctx?.runRef || {}) },
      kind: str(artifact.kind) || "gguf",
      locator: str(artifact.locator || artifact.path),
      sha256: str(artifact.sha256),
      sizeBytes: Math.max(0, Math.floor(num(artifact.sizeBytes))),
      evidenceObservedAt: new Date().toISOString(),
      evaluationResults: Array.isArray(call?.evaluationResults) ? call.evaluationResults : [],
    };
  },

  async cancel(ctx) {
    const config = cfg(ctx);
    const callId = str(ctx?.runRef?.providerResourceId);
    if (!callId || !config.baseUrl) return [];
    const res = await ctx.fetchJson(`${config.baseUrl}/cancel`, { method: "POST", headers: authHeaders(ctx, config), body: JSON.stringify({ call_id: callId, terminate_containers: true }) });
    return [providerEvent({ type: "compute-cancelled", ctx, providerEventId: `${callId}:cancel`, detail: res?.cancelled === true ? "function call cancelled (containers terminated)" : "cancel requested" })];
  },

  async release(ctx) {
    const config = cfg(ctx);
    const callId = str(ctx?.runRef?.providerResourceId);
    if (!callId) {
      return [providerEvent({ type: "compute-released", ctx, providerEventId: "", detail: "nothing was allocated", source: "workspace" })];
    }
    // Modal scale-to-zero: a terminal call holds no billed capacity. If the
    // call is still live, cancellation IS the release; failure to observe or
    // cancel keeps the risk visible.
    try {
      const call = await ctx.fetchJson(`${config.baseUrl}/status?call_id=${encodeURIComponent(callId)}`, { headers: authHeaders(ctx, config) });
      const status = str(call?.status).toLowerCase();
      if (["success", "failure", "terminated", "timeout"].includes(status)) {
        return [providerEvent({ type: "compute-released", ctx, providerEventId: `${callId}:released`, detail: `call ${status} — containers scale to zero, no standing capacity` })];
      }
      await ctx.fetchJson(`${config.baseUrl}/cancel`, { method: "POST", headers: authHeaders(ctx, config), body: JSON.stringify({ call_id: callId, terminate_containers: true }) });
      return [providerEvent({ type: "compute-released", ctx, providerEventId: `${callId}:cancel-release`, detail: "live call cancelled with container termination — capacity released" })];
    } catch (error) {
      return [providerEvent({ type: "compute-release-failed", ctx, providerEventId: `${callId}:release-failed`, detail: `release not confirmed: ${str(error?.message).slice(0, 160)} — a live call may still be billing per second`, source: "workspace" })];
    }
  },
};

registerComputeProviderAdapter(modalAdapter);

export default modalAdapter;
