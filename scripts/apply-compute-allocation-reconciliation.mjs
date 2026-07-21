#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const write = (rel, value) => fs.writeFileSync(path.join(root, rel), value);

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`[allocation-reconciliation] missing anchor: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`[allocation-reconciliation] ambiguous anchor: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function replaceOrSkip(source, before, after, marker, label) {
  if (source.includes(before)) return replaceOnce(source, before, after, label);
  if (marker && source.includes(marker)) return source;
  throw new Error(`[allocation-reconciliation] neither old nor hardened form found: ${label}`);
}

const registryPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/compute/compute-adapter-registry.js";
let registry = read(registryPath);
registry = replaceOrSkip(
  registry,
  `const CONTEXT_METHODS = ["inspectCapacity", "allocate", "execute", "status", "resume", "cancel", "release", "collectArtifact"];`,
  `const CONTEXT_METHODS = ["inspectCapacity", "reconcile", "allocate", "execute", "status", "resume", "cancel", "release", "collectArtifact"];`,
  `"inspectCapacity", "reconcile", "allocate"`,
  "registry reconcile wrapper",
);
write(registryPath, registry);

const executionPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-execution.js";
let execution = read(executionPath);
execution = replaceOrSkip(
  execution,
  `  if (!allocation) {
    events.push(workspaceEvent(`,
  `  const allocationUnverifiedEventId = \`workspace:allocation-state-unverified:${"${idempotencyKeyHash}"}\`;
  const allocationStateUnverified = events.some((event) =>
    str(event?.providerEventId) === allocationUnverifiedEventId
      || str(event?.detail).includes("allocation-state-unverified"));

  const adoptReconciledAllocation = async (candidate) => {
    if (!candidate || candidate.status === "failed" || !str(candidate.allocationId).trim()) return false;
    runRef.providerResourceId = str(candidate.runRef?.providerResourceId || candidate.allocationId);
    allocation = {
      ...candidate,
      runRef: { ...(candidate.runRef || runRef), providerResourceId: runRef.providerResourceId },
      idempotencyKeyHash,
      workSpecHash: workSpec?.workSpecHash || "",
      reconciled: true,
    };
    events.push({
      ...workspaceEvent(io, "compute-allocated", runRef, \`allocation ${"${allocation.allocationId}"} reconciled after an ambiguous provider response\`, \`workspace:allocation:${"${allocation.allocationId}"}\`),
      source: "provider",
    });
    await persist({ allocation });
    return true;
  };

  // A prior call may have crossed the paid boundary but lost the provider
  // response before the allocation id was persisted. Never call allocate again
  // until deterministic provider reconciliation either adopts that resource or
  // proves it does not exist.
  if (!allocation && allocationStateUnverified) {
    const reconciled = typeof adapter.reconcile === "function"
      ? await safeCall(() => adapter.reconcile(ctx()))
      : null;
    if (!reconciled?.__error && await adoptReconciledAllocation(reconciled)) {
      // Continue with the adopted resource below.
    } else {
      const computeBlock = await persist({ allocation: null });
      return pendingResult({
        io,
        startedMs,
        providerId: selectedId,
        capacityProfileId,
        computeBlock,
        reason: "allocation-state-unverified: provider reconciliation has not yet produced a canonical resource id; no second paid allocation was attempted",
        remoteStateUnverified: true,
      });
    }
  }

  if (!allocation) {
    events.push(workspaceEvent(`,
  `const allocationUnverifiedEventId =`,
  "prior ambiguous allocation reconciliation",
);
execution = replaceOrSkip(
  execution,
  `    let observedAllocation = await safeCall(() => adapter.allocate(ctx()));
    if (observedAllocation?.__error
      || !observedAllocation
      || observedAllocation.status === "failed"
      || !str(observedAllocation.allocationId).trim()) {
      const reason = observedAllocation?.__error || observedAllocation?.error || "provider did not return a verifiable allocation";
      events.push(workspaceEvent(io, "compute-failed", runRef, \`allocation failed: ${"${reason}"}\`));
      const computeBlock = await persist({ allocation: observedAllocation?.__error ? null : observedAllocation });
      return {
        localFallthrough: false,
        computeBlock,
        result: {
          ok: false,
          exitCode: null,
          durationMs: io.now() - startedMs,
          stdout: "",
          stderr: "",
          error: \`compute allocation failed: ${"${reason}"}\`,
          adapterMeta: { adapter: "provider-compute", providerId: selectedId },
        },
      };
    }`,
  `    let observedAllocation = await safeCall(() => adapter.allocate(ctx()));
    if (observedAllocation && !observedAllocation.__error && observedAllocation.status === "failed") {
      const reason = observedAllocation.error || "provider explicitly refused allocation";
      events.push(workspaceEvent(io, "compute-failed", runRef, \`allocation failed: ${"${reason}"}\`));
      const computeBlock = await persist({ allocation: observedAllocation });
      return {
        localFallthrough: false,
        computeBlock,
        result: { ok: false, exitCode: 1, durationMs: io.now() - startedMs, stdout: "", stderr: "", error: \`compute allocation failed: ${"${reason}"}\`, adapterMeta: { adapter: "provider-compute", providerId: selectedId } },
      };
    }
    if (observedAllocation?.__error || !observedAllocation || !str(observedAllocation.allocationId).trim()) {
      // Network timeout/reset and a response with no resource id are ambiguous:
      // the provider may already be billing. Reconcile by the exact sealed
      // idempotency identity before deciding whether anything may be retried.
      const reconciled = typeof adapter.reconcile === "function"
        ? await safeCall(() => adapter.reconcile(ctx()))
        : null;
      if (!reconciled?.__error && reconciled && str(reconciled.allocationId).trim()) {
        observedAllocation = reconciled;
      } else {
        const reason = observedAllocation?.__error || "provider returned no allocation identity";
        events.push(workspaceEvent(
          io,
          "compute-requested",
          runRef,
          \`allocation-state-unverified: ${"${reason}"}; deterministic reconciliation is required before any further paid create\`,
          allocationUnverifiedEventId,
        ));
        const computeBlock = await persist({ allocation: null });
        return pendingResult({
          io,
          startedMs,
          providerId: selectedId,
          capacityProfileId,
          computeBlock,
          reason: "allocation-state-unverified: provider acceptance could not be confirmed; no second paid allocation was attempted",
          remoteStateUnverified: true,
        });
      }
    }`,
  `provider acceptance could not be confirmed; no second paid allocation was attempted`,
  "ambiguous allocation response",
);
write(executionPath, execution);

const runpodPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/compute/runpod-compute.js";
let runpod = read(runpodPath);
runpod = replaceOrSkip(
  runpod,
  `  async status(ctx) {`,
  `  async reconcile(ctx) {
    const config = cfg(ctx);
    if (config.mode === "serverless" || !ctx?.idempotencyKeyHash) return null;
    const key = apiKey(ctx, config);
    const podName = \`ghl-${"${str(ctx.idempotencyKeyHash).slice(0, 24) || \"unkeyed\"}"}\`;
    const existing = await ctx.fetchJson(\`${"${RUNPOD_REST_BASE}"}/pods?name=${"${encodeURIComponent(podName)}"}\`, { headers: restHeaders(key) });
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

  async status(ctx) {`,
  `async reconcile(ctx)`,
  "Runpod deterministic reconcile",
);
write(runpodPath, runpod);

const modalPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/compute/modal-compute.js";
let modal = read(modalPath);
modal = replaceOrSkip(
  modal,
  `  async status(ctx) {`,
  `  async reconcile(ctx) {
    const config = cfg(ctx);
    if (!config.baseUrl || !ctx?.idempotencyKeyHash) return null;
    // A health-attested growthub-idempotency-key-v1 endpoint must return the
    // same call id when /submit is repeated with the same key.
    const gpu = modalGpuFor({ requirements: ctx?.requirements, config });
    const gpuCount = Math.max(1, Math.floor(num(ctx?.requirements?.gpuCount, 1)));
    const submitted = await ctx.fetchJson(\`${"${config.baseUrl}"}/submit\`, {
      method: "POST",
      headers: authHeaders(ctx, config),
      body: JSON.stringify({
        workSpec: ctx?.workSpec,
        datasetAccess: ctx?.datasetAccess,
        gpu: gpu ? \`${"${gpu.gpu}"}${"${gpuCount > 1 ? `:${gpuCount}` : \"\"}"}\` : "",
        growthub: {
          trainingRunId: str(ctx?.runRef?.trainingRunId),
          capacityProfileId: str(ctx?.capacityProfileId),
          idempotencyKey: str(ctx?.idempotencyKeyHash),
          workSpecHash: str(ctx?.workSpecHash),
          reconcile: true,
        },
      }),
    });
    const callId = str(submitted?.call_id || submitted?.callId);
    if (!callId) return null;
    return {
      allocationId: callId,
      runRef: { ...(ctx?.runRef || {}), providerResourceId: callId },
      status: "allocated",
      idempotencyKeyHash: str(ctx.idempotencyKeyHash),
      availabilityMode: config.warmContainers > 0 ? "warm" : "on-demand",
      costBasis: gpu ? { kind: "per-hour", unitUsd: gpu.usdPerHour * gpuCount, source: "static-catalog (idempotent endpoint reconciliation)" } : { kind: "unknown", unitUsd: 0, source: "" },
      requestedAt: new Date().toISOString(),
      allocatedAt: new Date().toISOString(),
      releasedAt: "",
      releaseConfirmed: false,
      allocated: { gpuType: gpu ? gpu.gpu : "", gpuCount, workers: Math.max(1, Math.floor(num(ctx?.requirements?.distributed?.workers, 1))), region: config.region },
      reconciled: true,
    };
  },

  async status(ctx) {`,
  `async reconcile(ctx)`,
  "Modal idempotent endpoint reconcile",
);
write(modalPath, modal);

const rayPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/compute/ray-cluster-compute.js";
let ray = read(rayPath);
ray = replaceOrSkip(
  ray,
  `    async status(ctx) {`,
  `    async reconcile(ctx) {
      const config = cfg(ctx, realization);
      if (!config.dashboardUrl || !ctx?.idempotencyKeyHash) return null;
      const submission = buildRayJobSubmission({ ctx, config });
      let existing;
      try {
        existing = await ctx.fetchJson(\`${"${config.dashboardUrl}"}/api/jobs/${"${submission.submission_id}"}\`, { headers: headers(ctx, config) });
      } catch {
        return null;
      }
      if (!existing) return null;
      const dist = ctx?.requirements?.distributed;
      return {
        allocationId: submission.submission_id,
        runRef: { ...(ctx?.runRef || {}), providerResourceId: submission.submission_id },
        status: "allocated",
        idempotencyKeyHash: str(ctx.idempotencyKeyHash),
        availabilityMode: "reserved",
        costBasis: config.owned ? { kind: "owned-hardware", unitUsd: 0, source: "operator-owned cluster" } : config.clusterHourlyUsd > 0 ? { kind: "per-hour", unitUsd: config.clusterHourlyUsd, source: "operator-declared cluster rate" } : { kind: "unknown", unitUsd: 0, source: "cluster rate not declared" },
        requestedAt: new Date().toISOString(),
        allocatedAt: new Date().toISOString(),
        releasedAt: "",
        releaseConfirmed: false,
        allocated: { gpuType: "", gpuCount: Math.max(0, Math.floor(num(dist?.gpusPerWorker, num(ctx?.requirements?.gpuCount)))), workers: Math.max(1, Math.floor(num(dist?.workers, 1))), region: config.region },
        reconciled: true,
      };
    },

    async status(ctx) {`,
  `async reconcile(ctx)`,
  "Ray deterministic reconcile",
);
write(rayPath, ray);

console.log("[allocation-reconciliation] ambiguous paid allocation responses now reconcile-or-pend without duplicate spend");
