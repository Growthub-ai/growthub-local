#!/usr/bin/env python3
from __future__ import annotations

import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent


def read(rel: str) -> str:
    return (ROOT / rel).read_text()


def write(rel: str, value: str) -> None:
    (ROOT / rel).write_text(value)


def replace_once(source: str, before: str, after: str, label: str) -> str:
    count = source.count(before)
    if count != 1:
        raise RuntimeError(f"[final-integration] {label}: expected one anchor, found {count}")
    return source.replace(before, after, 1)


def replace_or_skip(source: str, before: str, after: str, marker: str, label: str) -> str:
    if before in source:
        return replace_once(source, before, after, label)
    if marker and marker in source:
        return source
    raise RuntimeError(f"[final-integration] {label}: neither old nor integrated form found")


def insert_before(source: str, anchor: str, addition: str, marker: str, label: str) -> str:
    if marker and marker in source:
        return source
    return replace_once(source, anchor, addition + anchor, label)


for script in (
    "scripts/apply-compute-network-hardening.mjs",
    "scripts/apply-compute-canonical-evaluation.mjs",
    "scripts/apply-compute-canonical-e2e.mjs",
    "scripts/apply-compute-observation-hardening.mjs",
):
    subprocess.run(["node", script], cwd=ROOT, check=True)

route_path = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/api/workspace/sandbox-run/route.js"
route = read(route_path)
route = replace_or_skip(
    route,
    '''import {
  createGovernedComputeFetchJson,
  verifyGovernedComputeArtifact
} from "@/lib/compute-network-policy";
import { runCanonicalComputeEvaluation } from "@/lib/compute-canonical-evaluation";''',
    '''import { fetchComputeJson, verifyComputeArtifactMaterialization } from "@/lib/compute-outbound-policy";
import { runCanonicalComputeEvaluation } from "@/lib/compute-canonical-evaluation";
import {
  issueComputeDatasetAccess,
  materializeComputeDataset,
  verifyComputeDatasetDelivery
} from "@/lib/compute-data-plane";''',
    'from "@/lib/compute-data-plane"',
    "route imports",
)
route = route.replace(
    '''// One server-owned outbound boundary for every compute provider and artifact
// fetch. It applies operator allowlists, DNS pinning, redirect refusal,
// private/metadata-address controls, response bounds, and streaming hashes.
const governedComputeFetchJson = createGovernedComputeFetchJson();

''',
    "",
)
route = replace_or_skip(
    route,
    '''          // Every provider quote/allocation/status/cancel/release request
          // crosses the same DNS-pinned, bounded, operator-allowlisted policy.
          fetchJson: governedComputeFetchJson,''',
    '''          // Registered adapters are wrapped too; this call-time transport is
          // defense in depth for quote/allocation/status/control operations.
          fetchJson: fetchComputeJson,''',
    "fetchJson: fetchComputeJson,",
    "route fetch policy",
)
route = replace_or_skip(
    route,
    '''          compileAuthority: async ({ trainingRunId, request, datasetManifest }) => compileComputeAuthority({
            workspaceConfig: await readWorkspaceConfig(),
            trainingRunId,
            request,
            datasetManifest,
            now: new Date().toISOString(),
          }),
          verifyAuthority: async (authority) => verifyComputeAuthorityAgainstWorkspace({
            workspaceConfig: await readWorkspaceConfig(),
            trainingRunId: rowForRun.Name || name,
            authority,
            // The trusted dataset manifest comes from server-owned records
            // only (remote data-plane workstream); never from the authority
            // under verification.
            datasetManifest: null,
            now: new Date().toISOString(),
          }),''',
    '''          compileAuthority: async ({ trainingRunId, request }) => {
            const liveConfig = await readWorkspaceConfig();
            const staged = await materializeComputeDataset({ workspaceConfig: liveConfig, trainingRunId, request });
            if (!staged?.ok) return staged;
            const compiled = compileComputeAuthority({
              workspaceConfig: liveConfig,
              trainingRunId,
              request,
              datasetManifest: staged.manifest,
              now: new Date().toISOString(),
            });
            if (!compiled?.ok || !compiled.authority) return compiled;
            const grant = issueComputeDatasetAccess({
              manifest: staged.manifest,
              trainingRunId,
              workSpecHash: compiled.authority.workSpecHash,
            });
            if (!grant?.ok) return grant;
            return { ...compiled, datasetAccess: grant.access, datasetAccessEvidence: grant.evidence };
          },
          verifyAuthority: async (authority) => {
            const liveConfig = await readWorkspaceConfig();
            const trainingRunId = String(authority?.trainingRunId || rowForRun.Name || name);
            const liveRow = findTrainingRunReceiptRow(liveConfig, trainingRunId);
            const request = normalizeComputeRequest(parseJsonColumn(liveRow?.computeRequest));
            const staged = await materializeComputeDataset({ workspaceConfig: liveConfig, trainingRunId, request });
            if (!staged?.ok) return { ...staged, contentMatches: false };
            return verifyComputeAuthorityAgainstWorkspace({
              workspaceConfig: liveConfig,
              trainingRunId,
              authority,
              datasetManifest: staged.manifest,
              now: new Date().toISOString(),
            });
          },''',
    "const staged = await materializeComputeDataset",
    "materialized authority",
)
route = replace_or_skip(
    route,
    '''          // Artifact bytes are streamed through the same outbound policy;
          // local paths are restricted to governed roots and expected output.
          verifyArtifact: (artifact, workSpec) => verifyGovernedComputeArtifact({ artifact, workSpec }),''',
    '''          verifyArtifact: (artifact, workSpec) => verifyComputeArtifactMaterialization(artifact, workSpec),
          verifyDatasetDelivery: ({ evidence, workSpec }) => verifyComputeDatasetDelivery({ evidence, workSpec }),''',
    "verifyDatasetDelivery: ({ evidence, workSpec })",
    "artifact and dataset verification",
)
write(route_path, route)

evidence_path = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-evidence.js"
evidence = read(evidence_path)
evidence = replace_or_skip(
    evidence,
    '''    capabilities: raw.capabilities && typeof raw.capabilities === "object" ? raw.capabilities : null,
    evaluation: raw.evaluation && typeof raw.evaluation === "object" ? raw.evaluation : null,''',
    '''    capabilities: raw.capabilities && typeof raw.capabilities === "object" ? raw.capabilities : null,
    datasetAccessEvidence: raw.datasetAccessEvidence && typeof raw.datasetAccessEvidence === "object"
      ? {
          schema: str(raw.datasetAccessEvidence.schema),
          tokenId: str(raw.datasetAccessEvidence.tokenId),
          expiresAt: str(raw.datasetAccessEvidence.expiresAt),
          corpusSha256: str(raw.datasetAccessEvidence.corpusSha256),
          sizeBytes: Math.max(0, Math.floor(num(raw.datasetAccessEvidence.sizeBytes))),
          recordCount: Math.max(0, Math.floor(num(raw.datasetAccessEvidence.recordCount))),
          deliveryStatus: str(raw.datasetAccessEvidence.deliveryStatus),
        }
      : null,
    datasetDelivery: raw.datasetDelivery && typeof raw.datasetDelivery === "object" ? raw.datasetDelivery : null,
    evaluation: raw.evaluation && typeof raw.evaluation === "object" ? raw.evaluation : null,''',
    "datasetAccessEvidence: raw.datasetAccessEvidence",
    "dataset evidence normalization",
)
write(evidence_path, evidence)

execution_path = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-execution.js"
execution = read(execution_path)
execution = replace_or_skip(
    execution,
    '''    artifact: incoming.artifact || prior.artifact,
    // Legacy/provider-authored evaluation is never carried forward as''',
    '''    artifact: incoming.artifact || prior.artifact,
    datasetAccessEvidence: incoming.datasetAccessEvidence || prior.datasetAccessEvidence,
    datasetDelivery: incoming.datasetDelivery || prior.datasetDelivery,
    // Legacy/provider-authored evaluation is never carried forward as''',
    "datasetAccessEvidence: incoming.datasetAccessEvidence",
    "monotonic data evidence",
)
execution = replace_or_skip(execution, '''  workSpec = null,
}) {''', '''  workSpec = null,
  datasetAccess = null,
}) {''', "datasetAccess = null,", "base context argument")
execution = replace_or_skip(
    execution,
    '''    workSpecHash: str(workSpec?.workSpecHash),
    providerConfig: providerConfig || {},''',
    '''    workSpecHash: str(workSpec?.workSpecHash),
    datasetAccess: datasetAccess && typeof datasetAccess === "object" ? datasetAccess : null,
    providerConfig: providerConfig || {},''',
    "datasetAccess: datasetAccess && typeof datasetAccess",
    "base context field",
)
execution = replace_or_skip(execution, '''  authority = null,
  io = null,''', '''  authority = null,
  datasetAccess = null,
  datasetAccessEvidence = null,
  io = null,''', "datasetAccessEvidence = null,", "executor arguments")
execution = replace_or_skip(
    execution,
    '''    capabilities: capabilitiesById[selectedId] || prior?.capabilities || null,
    events,''',
    '''    capabilities: capabilitiesById[selectedId] || prior?.capabilities || null,
    datasetAccessEvidence: prior?.datasetAccessEvidence || datasetAccessEvidence || null,
    events,''',
    "datasetAccessEvidence: prior?.datasetAccessEvidence",
    "journal access evidence",
)
execution = replace_or_skip(
    execution,
    '''  const ctx = () => baseCtx({
    io,
    provider,
    providerConfig,
    requirements: req,
    capacityProfileId,
    trainingRunId,
    idempotencyKeyHash,
    runRef,
    intent,
    workSpec,
  });''',
    '''  const ctx = () => baseCtx({
    io,
    provider,
    providerConfig,
    requirements: req,
    capacityProfileId,
    trainingRunId,
    idempotencyKeyHash,
    runRef,
    intent,
    workSpec,
    datasetAccess,
  });''',
    "    datasetAccess,\n  });",
    "provider context access",
)
reconciliation = '''

  const adoptAllocation = async (observed, detail = "reconciled") => {
    if (!observed || observed.status === "failed" || !str(observed.allocationId).trim()) return false;
    runRef.providerResourceId = str(observed.runRef?.providerResourceId || observed.allocationId);
    allocation = {
      ...observed,
      runRef: { ...(observed.runRef || runRef), providerResourceId: runRef.providerResourceId },
      idempotencyKeyHash,
      workSpecHash: workSpec?.workSpecHash || "",
      reconciled: detail === "reconciled" || observed.reconciled === true,
    };
    events.push({ ...workspaceEvent(io, "compute-allocated", runRef, `allocation ${allocation.allocationId} ${detail}`, `workspace:allocation:${allocation.allocationId}`), source: "provider" });
    await persist({ allocation });
    return true;
  };

  const allocationStateUnverified = events.some((event) => String(event?.detail || "").includes("allocation-state-unverified"));
  if (!allocation && typeof adapter.reconcile === "function") {
    const reconciled = await safeCall(() => adapter.reconcile(ctx()));
    if (!reconciled?.__error && reconciled) await adoptAllocation(reconciled, "reconciled");
  }
  if (!allocation && allocationStateUnverified) {
    const detail = typeof adapter.reconcile === "function"
      ? "allocation-state-unverified: reconciliation found no provider resource yet; no second allocation was attempted"
      : "allocation-state-unverified: provider has no deterministic reconciliation operation; automatic re-allocation is refused";
    const computeBlock = await persist({ allocation: null });
    return pendingResult({ io, startedMs, providerId: selectedId, capacityProfileId, computeBlock, reason: detail, remoteStateUnverified: true });
  }
'''
execution = insert_before(execution, "\n  if (!allocation) {\n", reconciliation, "const adoptAllocation = async", "allocation reconciliation seam")
execution = replace_or_skip(
    execution,
    '''    let observedAllocation = await safeCall(() => adapter.allocate(ctx()));
    if (observedAllocation?.__error
      || !observedAllocation
      || observedAllocation.status === "failed"
      || !str(observedAllocation.allocationId).trim()) {
      const reason = observedAllocation?.__error || observedAllocation?.error || "provider did not return a verifiable allocation";
      events.push(workspaceEvent(io, "compute-failed", runRef, `allocation failed: ${reason}`));
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
          error: `compute allocation failed: ${reason}`,
          adapterMeta: { adapter: "provider-compute", providerId: selectedId },
        },
      };
    }''',
    '''    let observedAllocation = await safeCall(() => adapter.allocate(ctx()));
    if (observedAllocation?.__error || !observedAllocation || !str(observedAllocation.allocationId).trim()) {
      const reconciled = typeof adapter.reconcile === "function" ? await safeCall(() => adapter.reconcile(ctx())) : null;
      if (!reconciled?.__error && reconciled && str(reconciled.allocationId).trim()) {
        observedAllocation = reconciled;
      } else {
        const reason = observedAllocation?.__error || "provider returned no allocation identity";
        events.push(workspaceEvent(io, "compute-requested", runRef, `allocation-state-unverified: ${reason}; no second allocation will be attempted until reconciliation proves the resource identity`, `workspace:allocation-state-unverified:${idempotencyKeyHash}`));
        const computeBlock = await persist({ allocation: null });
        return pendingResult({ io, startedMs, providerId: selectedId, capacityProfileId, computeBlock, reason: "allocation-state-unverified: provider acceptance could not be confirmed; deterministic reconciliation is required", remoteStateUnverified: true });
      }
    }
    if (observedAllocation.status === "failed") {
      const reason = observedAllocation.error || "provider explicitly refused allocation";
      events.push(workspaceEvent(io, "compute-failed", runRef, `allocation failed: ${reason}`));
      const computeBlock = await persist({ allocation: observedAllocation });
      return { localFallthrough: false, computeBlock, result: { ok: false, exitCode: 1, durationMs: io.now() - startedMs, stdout: "", stderr: "", error: `compute allocation failed: ${reason}`, adapterMeta: { adapter: "provider-compute", providerId: selectedId } } };
    }''',
    "allocation-state-unverified: provider acceptance could not be confirmed",
    "ambiguous allocation response",
)
execution = replace_or_skip(
    execution,
    '''      const verified = typeof io.verifyArtifact === "function"
        ? await safeCall(() => io.verifyArtifact(candidate, workSpec))
        : null;
      artifact = verified && !verified.__error && verified.verifiedSha256 === candidate.sha256
        ? { ...candidate, ...verified }
        : candidate;''',
    '''      const delivery = typeof io.verifyDatasetDelivery === "function"
        ? await safeCall(() => io.verifyDatasetDelivery({ evidence: prior?.datasetAccessEvidence || datasetAccessEvidence, workSpec }))
        : { __error: "dataset delivery verifier unavailable" };
      const verified = !delivery?.__error && delivery?.ok === true && typeof io.verifyArtifact === "function"
        ? await safeCall(() => io.verifyArtifact(candidate, workSpec))
        : null;
      artifact = verified && !verified.__error && verified.verifiedSha256 === candidate.sha256
        ? { ...candidate, ...verified, datasetDeliveryVerified: true }
        : candidate;
      if (!delivery?.__error && delivery?.ok === true) await persist({ allocation, datasetDelivery: delivery.receipt });''',
    "datasetDeliveryVerified: true",
    "delivery before artifact trust",
)
execution = replace_or_skip(
    execution,
    "  const authority = compiled.authority;\n",
    '''  const authority = compiled.authority;
  const datasetAccess = compiled.datasetAccess && typeof compiled.datasetAccess === "object" ? compiled.datasetAccess : null;
  const datasetAccessEvidence = prior?.datasetAccessEvidence
    || (compiled.datasetAccessEvidence && typeof compiled.datasetAccessEvidence === "object" ? compiled.datasetAccessEvidence : null);
''',
    "const datasetAccess = compiled.datasetAccess",
    "compiled access capture",
)
execution = replace_or_skip(execution, '''    requireAuthority: true,
    authority,
    io,''', '''    requireAuthority: true,
    authority,
    datasetAccess,
    datasetAccessEvidence,
    io,''', "    datasetAccessEvidence,\n    io,", "pass access to executor")
write(execution_path, execution)

registry_path = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/compute/compute-adapter-registry.js"
registry = read(registry_path)
registry = replace_or_skip(registry, 'const CONTEXT_METHODS = ["inspectCapacity", "allocate", "execute", "status", "resume", "cancel", "release", "collectArtifact"];', 'const CONTEXT_METHODS = ["inspectCapacity", "reconcile", "allocate", "execute", "status", "resume", "cancel", "release", "collectArtifact"];', '"reconcile", "allocate"', "registry reconcile wrapping")
write(registry_path, registry)

modal_path = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/compute/modal-compute.js"
modal = read(modal_path)
modal = replace_or_skip(modal, '''        workSpec: ctx?.workSpec,
        gpu:''', '''        workSpec: ctx?.workSpec,
        datasetAccess: ctx?.datasetAccess,
        gpu:''', "datasetAccess: ctx?.datasetAccess", "Modal dataset access")
if "async reconcile(ctx)" not in modal:
    modal = replace_once(modal, "  async status(ctx) {", '''  async reconcile(ctx) {
    const config = cfg(ctx);
    if (!config.baseUrl || !ctx?.idempotencyKeyHash) return null;
    const observed = await ctx.fetchJson(`${config.baseUrl}/reconcile?idempotency_key=${encodeURIComponent(ctx.idempotencyKeyHash)}`, { headers: authHeaders(ctx, config) });
    const callId = str(observed?.call_id || observed?.callId);
    if (!callId) return null;
    const gpu = modalGpuFor({ requirements: ctx?.requirements, config });
    const gpuCount = Math.max(1, Math.floor(num(ctx?.requirements?.gpuCount, 1)));
    return { allocationId: callId, runRef: { ...(ctx?.runRef || {}), providerResourceId: callId }, status: "allocated", idempotencyKeyHash: str(ctx.idempotencyKeyHash), availabilityMode: config.warmContainers > 0 ? "warm" : "on-demand", costBasis: gpu ? { kind: "per-hour", unitUsd: gpu.usdPerHour * gpuCount, source: "static-catalog (reconciled)" } : { kind: "unknown", unitUsd: 0, source: "" }, requestedAt: new Date().toISOString(), allocatedAt: new Date().toISOString(), releasedAt: "", releaseConfirmed: false, allocated: { gpuType: gpu ? gpu.gpu : "", gpuCount, workers: Math.max(1, Math.floor(num(ctx?.requirements?.distributed?.workers, 1))), region: config.region }, reconciled: true };
  },

  async status(ctx) {''', "Modal reconcile")
modal = replace_or_skip(modal, '''    const res = await ctx.fetchJson(`${config.baseUrl}/cancel`, { method: "POST", headers: authHeaders(ctx, config), body: JSON.stringify({ call_id: callId, terminate_containers: true }) });
    return [providerEvent({ type: "compute-cancelled", ctx, providerEventId: `${callId}:cancel`, detail: res?.cancelled === true ? "function call cancelled (containers terminated)" : "cancel requested" })];''', '''    const res = await ctx.fetchJson(`${config.baseUrl}/cancel`, { method: "POST", headers: authHeaders(ctx, config), body: JSON.stringify({ call_id: callId, terminate_containers: true }) });
    if (res?.cancelled !== true) return [];
    return [providerEvent({ type: "compute-cancelled", ctx, providerEventId: `${callId}:cancel`, detail: "function call cancelled (containers terminated)" })];''', "if (res?.cancelled !== true) return [];", "Modal cancellation evidence")
write(modal_path, modal)

runpod_path = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/compute/runpod-compute.js"
runpod = read(runpod_path)
runpod = replace_or_skip(runpod, '''            workSpec: ctx?.workSpec,
            growthub:''', '''            workSpec: ctx?.workSpec,
            datasetAccess: ctx?.datasetAccess,
            growthub:''', "datasetAccess: ctx?.datasetAccess", "Runpod serverless access")
runpod = replace_or_skip(runpod, '        GROWTHUB_WORK_SPEC_JSON: JSON.stringify(ctx?.workSpec || {}),', '''        GROWTHUB_WORK_SPEC_JSON: JSON.stringify(ctx?.workSpec || {}),
        GROWTHUB_DATASET_ACCESS_JSON: JSON.stringify(ctx?.datasetAccess || {}),''', "GROWTHUB_DATASET_ACCESS_JSON", "Runpod pod access")
if "async reconcile(ctx)" not in runpod:
    runpod = replace_once(runpod, "  async status(ctx) {", '''  async reconcile(ctx) {
    const config = cfg(ctx);
    if (config.mode === "serverless" || !ctx?.idempotencyKeyHash) return null;
    const key = apiKey(ctx, config);
    const podName = `ghl-${str(ctx.idempotencyKeyHash).slice(0, 24) || "unkeyed"}`;
    const existing = await ctx.fetchJson(`${RUNPOD_REST_BASE}/pods?name=${encodeURIComponent(podName)}`, { headers: restHeaders(key) });
    const pods = Array.isArray(existing) ? existing : Array.isArray(existing?.pods) ? existing.pods : [];
    const live = pods.find((pod) => str(pod?.name) === podName && str(pod?.desiredStatus) !== "TERMINATED");
    if (!live?.id) return null;
    return { allocationId: str(live.id), runRef: { ...(ctx?.runRef || {}), providerResourceId: str(live.id) }, status: "allocated", idempotencyKeyHash: str(ctx.idempotencyKeyHash), availabilityMode: config.interruptible ? "spot" : "on-demand", costBasis: { kind: "per-hour", unitUsd: num(live.costPerHr), source: "runpod-pod-costPerHr (reconciled existing pod)" }, requestedAt: new Date().toISOString(), allocatedAt: str(live.lastStartedAt) || new Date().toISOString(), releasedAt: "", releaseConfirmed: false, allocated: { gpuType: str(live?.machine?.gpuType?.id || live?.gpuTypeId || ""), gpuCount: Math.max(1, Math.floor(num(live.gpuCount, 1))), workers: 1, region: str(live?.machine?.dataCenterId || "") }, reconciled: true };
  },

  async status(ctx) {''', "Runpod reconcile")
write(runpod_path, runpod)

ray_path = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/compute/ray-cluster-compute.js"
ray = read(ray_path)
ray = replace_or_skip(ray, '        GROWTHUB_WORK_SPEC_JSON: JSON.stringify(ctx?.workSpec || {}),', '''        GROWTHUB_WORK_SPEC_JSON: JSON.stringify(ctx?.workSpec || {}),
        GROWTHUB_DATASET_ACCESS_JSON: JSON.stringify(ctx?.datasetAccess || {}),''', "GROWTHUB_DATASET_ACCESS_JSON", "Ray dataset access")
if "async reconcile(ctx)" not in ray:
    ray = replace_once(ray, "    async status(ctx) {", '''    async reconcile(ctx) {
      const config = cfg(ctx, realization);
      if (!config.dashboardUrl || !ctx?.idempotencyKeyHash) return null;
      const submission = buildRayJobSubmission({ ctx, config });
      const existing = await ctx.fetchJson(`${config.dashboardUrl}/api/jobs/${submission.submission_id}`, { headers: headers(ctx, config) });
      if (!existing) return null;
      const dist = ctx?.requirements?.distributed;
      return { allocationId: submission.submission_id, runRef: { ...(ctx?.runRef || {}), providerResourceId: submission.submission_id }, status: "allocated", idempotencyKeyHash: str(ctx.idempotencyKeyHash), availabilityMode: "reserved", costBasis: config.owned ? { kind: "owned-hardware", unitUsd: 0, source: "operator-owned cluster" } : config.clusterHourlyUsd > 0 ? { kind: "per-hour", unitUsd: config.clusterHourlyUsd, source: "operator-declared cluster rate" } : { kind: "unknown", unitUsd: 0, source: "cluster rate not declared" }, requestedAt: new Date().toISOString(), allocatedAt: new Date().toISOString(), releasedAt: "", releaseConfirmed: false, allocated: { gpuType: "", gpuCount: Math.max(0, Math.floor(num(dist?.gpusPerWorker, num(ctx?.requirements?.gpuCount)))), workers: Math.max(1, Math.floor(num(dist?.workers, 1))), region: config.region }, reconciled: true };
    },

    async status(ctx) {''', "Ray reconcile")
write(ray_path, ray)

handoff_path = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/data-model/components/TrainingHandoffModal.jsx"
handoff = read(handoff_path)
handoff = replace_or_skip(handoff, "      const selectedIdx = new Set(selected.map(({ index }) => index));", "      const selectedOrdinalByIndex = new Map(selected.map(({ index }, ordinal) => [index, ordinal]));", "const selectedOrdinalByIndex = new Map", "selected export ordinal")
handoff = replace_or_skip(handoff, '(selectedIdx.has(i) ? { ...row, exported: "true" } : row)', '(selectedOrdinalByIndex.has(i) ? { ...row, exported: "true", lastExportId: exportId, datasetExportId: exportId, exportOrdinal: selectedOrdinalByIndex.get(i) } : row)', "lastExportId: exportId, datasetExportId: exportId", "trace export identity")
write(handoff_path, handoff)

e2e_path = "scripts/e2e-compute-route-realization-loop.mjs"
e2e = read(e2e_path)
e2e = replace_or_skip(e2e, '''  if (url.pathname === "/submit") {
    submitCount += 1;
    assert.match(String(body.workSpec?.workSpecHash || ""), /^[0-9a-f]{64}$/);
    assert.equal(body.workSpec?.output?.modelTag, "student-v1");
    return json(200, { call_id: `call-${body.workSpec.trainingRunId}` });
  }''', '''  if (url.pathname === "/submit") {
    submitCount += 1;
    assert.match(String(body.workSpec?.workSpecHash || ""), /^[0-9a-f]{64}$/);
    assert.equal(body.workSpec?.output?.modelTag, "student-v1");
    assert.ok(body.datasetAccess?.uri, "provider receives a short-lived call-time dataset grant");
    const datasetResponse = await fetch(body.datasetAccess.uri);
    assert.equal(datasetResponse.ok, true, "provider can retrieve the governed corpus");
    const datasetBytes = Buffer.from(await datasetResponse.arrayBuffer());
    assert.equal(crypto.createHash("sha256").update(datasetBytes).digest("hex"), body.workSpec.dataset.corpusSha256);
    return json(200, { call_id: `call-${body.workSpec.trainingRunId}` });
  }''', "provider receives a short-lived call-time dataset grant", "booted dataset retrieval")
e2e = replace_or_skip(e2e, '        GROWTHUB_COMPUTE_AUTHORITY_KEY: AUTHORITY_KEY,', '''        GROWTHUB_COMPUTE_AUTHORITY_KEY: AUTHORITY_KEY,
        GROWTHUB_COMPUTE_PUBLIC_BASE_URL: base,
        GROWTHUB_COMPUTE_DATA_ROOT: path.join(app, ".growthub", "compute-data"),''', "GROWTHUB_COMPUTE_PUBLIC_BASE_URL: base", "booted data plane env")
e2e = replace_or_skip(e2e, '''  const holdoutRows = Array.from({ length: 6 }, (_, index) => ({
    inputPrompt: `Canonical evaluation holdout ${index}: answer with the governed workspace behavior.`,
    agentOutput: `reference ${index}`,
    qualityScore: 5,
    redactionStatus: "clear",
    exported: "false",
    evaluationHoldout: true,
    sessionDate: `2026-07-${String(index + 1).padStart(2, "0")}`,
  }));''', '''  const trainingRows = Array.from({ length: 10 }, (_, index) => ({
    inputPrompt: `Governed training example ${index}`,
    agentOutput: `Governed training answer ${index}`,
    qualityScore: 5,
    redactionStatus: "clear",
    exported: "true",
    lastExportId: "export-route-success",
    datasetExportId: "export-route-success",
    exportOrdinal: index,
    sessionDate: `2026-06-${String(index + 1).padStart(2, "0")}`,
  }));
  const holdoutRows = Array.from({ length: 6 }, (_, index) => ({
    inputPrompt: `Canonical evaluation holdout ${index}: answer with the governed workspace behavior.`,
    agentOutput: `reference ${index}`,
    qualityScore: 5,
    redactionStatus: "clear",
    exported: "false",
    evaluationHoldout: true,
    sessionDate: `2026-07-${String(index + 1).padStart(2, "0")}`,
  }));''', "const trainingRows = Array.from", "booted training rows")
e2e = replace_or_skip(e2e, '  if (existingTraces) existingTraces.rows = holdoutRows;\n  else objects.push({ id: "training-traces", objectType: "training-traces", label: "Training Traces", columns: [], rows: holdoutRows });', '  if (existingTraces) existingTraces.rows = [...trainingRows, ...holdoutRows];\n  else objects.push({ id: "training-traces", objectType: "training-traces", label: "Training Traces", columns: [], rows: [...trainingRows, ...holdoutRows] });', "existingTraces.rows = [...trainingRows, ...holdoutRows]", "booted trace set")
write(e2e_path, e2e)

cert_path = "scripts/run-compute-certification.mjs"
cert = read(cert_path)
for suite in (
    "scripts/unit-compute-outbound-policy.test.mjs",
    "scripts/unit-compute-canonical-evaluation.test.mjs",
    "scripts/unit-compute-data-plane.test.mjs",
    "scripts/unit-compute-allocation-reconciliation.test.mjs",
):
    if suite not in cert:
        cert = replace_once(cert, '  "scripts/unit-compute-execution.test.mjs",\n', f'  "scripts/unit-compute-execution.test.mjs",\n  "{suite}",\n', f"certification {suite}")
write(cert_path, cert)

print("[final-integration] all seven production gaps are wired into the governed compute certification path")
