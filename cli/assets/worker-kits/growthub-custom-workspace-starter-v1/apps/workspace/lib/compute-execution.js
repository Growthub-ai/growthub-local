/**
 * Governed compute execution — Sprint 5 of the Governed Compute Realization.
 * The orchestrator that integrates provider compute into the EXISTING
 * training execution seam (`POST /api/workspace/sandbox-run` running the
 * model-training-runner row). There is deliberately NO /api/compute/run:
 * this module is called from inside the sandbox-run route, returns the same
 * RunResult shape the sandbox adapters return, and persists evidence through
 * the same receipt lanes.
 *
 * Runner modes, conceptually:
 *   local-command      the existing local argv pipeline — UNTOUCHED
 *   compatible-runtime the existing endpoint-import path — UNTOUCHED
 *   provider-compute   this orchestrator:
 *       derive requirements → resolve Capacity Profile → resolve provider
 *       → quote → authorize policy → allocate → verify allocation
 *       → execute/observe → normalize events → checkpoint → artifact
 *       → release
 *
 * Honesty invariants enforced here:
 *   - a repeated governed request must not silently allocate duplicate
 *     capacity: the deterministic idempotency key is checked against the
 *     receipt's existing allocation and an unsafe automatic replay FAILS
 *     CLOSED (the operator retries explicitly with a new attempt number);
 *   - allocation evidence is recorded only when the provider returned a
 *     resource identity; "allocated" without evidence never advances state;
 *   - provider "completed" with no artifact (or the wrong hash) leaves the
 *     run non-promotable;
 *   - cancellation with a failed release stays visibly unreleased —
 *     `capacityMayStillExist` / `costMayAccrue` are first-class outputs;
 *   - no invented progress percentage: observers get normalized events and
 *     receipt-stamped facts only.
 *
 * All IO is injected (adapters, env presence, sleep, clock) so the entire
 * lifecycle is deterministically testable; the route passes the real
 * surfaces.
 */

import { deriveComputeProviders } from "./compute-provider-registry.js";
import { resolveCompute } from "./compute-resolver.js";
import {
  computeIdempotencyKey,
  deriveComputeArtifactHonesty,
  deriveComputeLifecycle,
  normalizeComputeBlock,
  parseJsonColumn,
} from "./compute-evidence.js";
import { deriveComputeRequirements, normalizeRequirementsForProfile, resolveCapacityProfileForRequirements } from "./compute-capacity-profiles.js";
import { LOCAL_PROVIDER_ID } from "./compute-provider-registry.js";
import { normalizeComputePolicy, normalizeComputeRequest, verifyComputeAuthority } from "./compute-work-spec.js";
import { buildBenchmarkReceiptFields, deriveBenchmarkWins } from "./distillation-eval-harness.js";

const DEFAULT_MAX_POLLS = 120;
const DEFAULT_POLL_INTERVAL_MS = 5000;

function str(v) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/** Locate the governed model-training-run receipt row for a run id. */
export function findTrainingRunReceiptRow(workspaceConfig, trainingRunId) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const object = objects.find((o) => o?.objectType === "model-training-run");
  const rows = Array.isArray(object?.rows) ? object.rows : [];
  return rows.find((r) => str(r?.trainingRunId).trim() === str(trainingRunId).trim()) || null;
}

/** Parse the receipt row's compute block (stored inline or as a JSON column). */
export function parseReceiptComputeBlock(row) {
  return normalizeComputeBlock(parseJsonColumn(row?.compute));
}

/**
 * Persist a compute block back onto the receipt row — pure objects mapper
 * the route feeds through its existing config write. The block is stored as
 * a JSON string column (the same convention distillation rows use).
 */
export function applyComputeBlockToReceiptRows(objects, trainingRunId, computeBlock, statusOverride = "") {
  const id = str(trainingRunId).trim();
  if (!id) return null;
  let changed = false;
  const next = (Array.isArray(objects) ? objects : []).map((entry) => {
    if (entry?.objectType !== "model-training-run") return entry;
    const rows = Array.isArray(entry.rows) ? entry.rows : [];
    const nextRows = rows.map((row) => {
      if (str(row?.trainingRunId).trim() !== id) return row;
      changed = true;
      const verifiedArtifact = computeBlock?.artifact?.verifiedSha256 && computeBlock.artifact.verifiedSha256 === computeBlock.artifact.sha256
        ? computeBlock.artifact : null;
      let distillation = row.distillation;
      if (typeof distillation === "string") { try { distillation = JSON.parse(distillation); } catch { distillation = null; } }
      return {
        ...row,
        ...(statusOverride ? { status: statusOverride } : verifiedArtifact ? {
          status: "imported",
          completedAt: computeBlock.evidenceObservedAt || row.completedAt,
          artifactType: verifiedArtifact.kind || "gguf",
          artifactModelTag: computeBlock?.workSpec?.output?.modelTag || row.artifactModelTag || "",
          artifactPath: verifiedArtifact.locator,
          artifactSha256: verifiedArtifact.verifiedSha256,
          artifactArtifactBytes: verifiedArtifact.sizeBytes || 0,
          distillation: { ...(distillation && typeof distillation === "object" ? distillation : {}), ...(computeBlock?.evaluation?.benchmarkWins ? { benchmarkWins: computeBlock.evaluation.benchmarkWins, evaluationLineage: { workSpecHash: computeBlock.workSpecHash, requirementsHash: computeBlock.requirementsHash } } : {}) },
        } : {}),
        compute: JSON.stringify(computeBlock),
      };
    });
    return { ...entry, rows: nextRows };
  });
  return changed ? next : null;
}

function eventNow(io) {
  return new Date(io.now()).toISOString();
}

function workspaceEvent(io, type, runRef, detail) {
  const at = eventNow(io);
  return { type, at, evidenceObservedAt: at, source: "workspace", runRef, providerEventId: "", detail: str(detail) };
}

/** Bounded adapter call: an adapter throw becomes evidence, never a crash. */
async function safeCall(fn, fallback) {
  try {
    return await fn();
  } catch (error) {
    return { __error: str(error?.message || error) || "adapter call failed", ...(fallback || {}) };
  }
}

/**
 * Execute the full provider-compute lifecycle for one governed training run.
 *
 * @param {object} opts
 * @param {object} opts.workspaceConfig
 * @param {string} opts.trainingRunId
 * @param {object} [opts.computeAsk]      { capacityProfileId, providerRegistryId, selectionMode }
 * @param {object} [opts.requirements]    ComputeRequirements (derived when absent)
 * @param {object} [opts.preflight]       stamped machine evidence
 * @param {object} [opts.budget]          ComputeBudgetPolicy
 * @param {number} [opts.attempt]         governed retry counter (replay protection)
 * @param {object} [opts.priorCompute]    the receipt's existing compute block
 * @param {object} opts.io                { getAdapter, listAdapterIds, envPresent,
 *                                          resolveEnv, fetchJson, now, sleep,
 *                                          maxPolls?, pollIntervalMs? }
 * @returns {{ result: object|null, computeBlock: object|null, localFallthrough: boolean }}
 */
export async function executeProviderComputeRun({
  workspaceConfig = null,
  trainingRunId = "",
  computeAsk = null,
  requirements = null,
  preflight = null,
  budget = null,
  attempt = 1,
  priorCompute = null,
  requireAuthority = false,
  authority = null,
  io = null,
} = {}) {
  if (!io || typeof io.getAdapter !== "function" || typeof io.now !== "function") {
    throw new Error("executeProviderComputeRun: io.getAdapter and io.now are required");
  }
  const ask = computeAsk && typeof computeAsk === "object" ? computeAsk : {};
  // Execution authority comes ONLY from the server-compiled sealed authority
  // (lib/compute-authority.js), passed in by the route hook after compile +
  // seal/drift verification. Caller-shaped intent/work-spec fields — on the
  // ask, on the receipt row, anywhere reachable through PATCH — are never
  // read here, however self-consistent their hashes are.
  const sealedAuthority = authority && typeof authority === "object" ? authority : null;
  const intent = sealedAuthority?.intent && typeof sealedAuthority.intent === "object" ? sealedAuthority.intent : null;
  const workSpec = sealedAuthority?.workSpec && typeof sealedAuthority.workSpec === "object" ? sealedAuthority.workSpec : null;
  const authorityOk = Boolean(sealedAuthority && verifyComputeAuthority({ intent, workSpec }).ok);
  if (requireAuthority && !authorityOk) throw new Error("provider compute refused: server-compiled compute authority is missing or failed lineage validation — caller-supplied intent/work specs are never execution authority");
  const events = [];
  const checkpoints = [];

  // 1. Requirements + Capacity Profile.
  const derived = authorityOk ? intent.requirements : (requirements && typeof requirements === "object" ? requirements : deriveComputeRequirements({ preflight, workloadKind: "fine-tune" }));
  const capacityProfileId = authorityOk ? intent.capacityProfileId : (str(ask.capacityProfileId).trim() || resolveCapacityProfileForRequirements(derived).profile.id);
  const req = normalizeRequirementsForProfile(derived, capacityProfileId);
  const policy = authorityOk
    ? normalizeComputePolicy(intent.policy)
    : (ask.policy && typeof ask.policy === "object" ? normalizeComputePolicy(ask.policy) : null);
  const effectiveBudget = policy?.budget || budget;

  // 2. Providers + capabilities + quotes.
  const providersState = deriveComputeProviders({
    workspaceConfig,
    registeredAdapterIds: typeof io.listAdapterIds === "function" ? io.listAdapterIds() : [],
    envPresent: io.envPresent || (() => false),
    preflight,
  });
  // Policy pre-filter BEFORE any adapter contact: a local-only ask must not
  // make remote health/quote calls (there is no provider boundary without
  // sealed authority), an exclude-local ask never probes the local machine,
  // and an explicit pin inspects only the pinned provider.
  const pinnedProviderId = str(ask.providerRegistryId).trim();
  const inspectable = providersState.providers.filter((provider) => {
    if (provider.status !== "ready") return false;
    if (policy?.localOnly) return provider.providerId === LOCAL_PROVIDER_ID;
    if (policy?.excludeLocal && provider.providerId === LOCAL_PROVIDER_ID) return false;
    if (ask.selectionMode === "explicit" && pinnedProviderId) return provider.providerId === pinnedProviderId;
    return true;
  });
  const capabilitiesById = {};
  const quotesById = {};
  for (const provider of inspectable) {
    const adapter = io.getAdapter(provider.adapterId);
    if (!adapter) continue;
    const providerConfig = { ...(provider.config || {}), providerId: provider.providerId, preflight };
    const ctx = baseCtx({ io, provider, providerConfig, req, capacityProfileId, trainingRunId, idempotencyKeyHash: "" });
    const caps = await safeCall(() => adapter.describeCapabilities(providerConfig));
    if (!caps?.__error) capabilitiesById[provider.providerId] = caps;
    const quote = await safeCall(() => adapter.inspectCapacity(ctx));
    if (!quote?.__error) quotesById[provider.providerId] = quote;
  }

  // 3. Deterministic decision (budget authorized inside the resolver).
  const decision = resolveCompute({
    requirements: req,
    capacityProfileId,
    providers: providersState.providers,
    capabilitiesById,
    quotesById,
    budget: effectiveBudget,
    policy,
    selectionMode: ask.selectionMode === "explicit" ? "explicit" : "auto",
    pinnedProviderId: str(ask.providerRegistryId).trim(),
    now: io.now(),
  });
  const decisionBlock = normalizeComputeBlock({ capacityProfileId, selectionMode: decision.selectionMode, decision, authority: sealedAuthority, intent, workSpec, policy, evidenceObservedAt: eventNow(io) });
  if (typeof io.persistCompute === "function") await io.persistCompute(decisionBlock);

  const selectedId = decision.selectedProviderId;
  if (!selectedId) {
    const reasons = decision.candidates.filter((c) => !c.eligible).map((c) => `${c.providerId}: ${c.reasons.join("; ")}`);
    return {
      localFallthrough: false,
      computeBlock: decisionBlock,
      result: {
        ok: false,
        exitCode: null,
        durationMs: 0,
        stdout: "",
        stderr: "",
        error: `no eligible compute realization for profile "${capacityProfileId}" — ${reasons.join(" | ") || "no candidates"}`,
        adapterMeta: { adapter: "provider-compute", compute: { blocked: true } },
      },
    };
  }

  // The deterministic resolver may pick the LOCAL machine — that is not a
  // provider-compute execution; the existing local pipeline runs unchanged.
  if (selectedId === LOCAL_PROVIDER_ID) {
    return { localFallthrough: true, computeBlock: decisionBlock, result: null };
  }

  const provider = providersState.providers.find((p) => p.providerId === selectedId);
  const adapter = io.getAdapter(provider.adapterId);
  const providerConfig = { ...(provider.config || {}), providerId: provider.providerId, preflight };

  // 4. Deterministic allocation identity + replay protection.
  // The identity is bound to the SEALED WORKLOAD (workSpecHash), not only
  // the run/attempt/profile/provider tuple: a changed work spec can never
  // silently adopt (or collide with) a resource minted for another workload.
  const { hash: idempotencyKeyHash } = computeIdempotencyKey({ trainingRunId, attempt, capacityProfileId, providerId: selectedId, workSpecHash: workSpec?.workSpecHash || "" });
  const prior = normalizeComputeBlock(priorCompute);
  if (prior?.allocation && !prior.allocation.releaseConfirmed
    && str(prior.workSpecHash) !== str(workSpec?.workSpecHash || "")) {
    // An UNRELEASED allocation exists for a DIFFERENT sealed workload. A
    // changed work spec must never allocate beside — or adopt — a resource
    // minted for another workload; only the SAME workload may be explicitly
    // retried (a new governed attempt) while release is unconfirmed.
    return {
      localFallthrough: false,
      computeBlock: prior,
      result: {
        ok: false,
        exitCode: null,
        durationMs: 0,
        stdout: "",
        stderr: "",
        error: `allocation refused: unreleased allocation ${prior.allocation.allocationId || "(unnamed)"} belongs to a different sealed workload — release or reconcile it before running a changed workload`,
        adapterMeta: { adapter: "provider-compute", providerId: selectedId, compute: { foreignAllocationRefused: true } },
      },
    };
  }
  if (prior?.allocation && prior.allocation.idempotencyKeyHash === idempotencyKeyHash && !prior.allocation.releaseConfirmed) {
    // The same governed request already allocated capacity that is not
    // provably released. Exactly-once cannot be proven from here, so the
    // unsafe automatic replay FAILS CLOSED — no silent duplicate spend.
    return {
      localFallthrough: false,
      computeBlock: prior,
      result: {
        ok: false,
        exitCode: null,
        durationMs: 0,
        stdout: "",
        stderr: "",
        error: `duplicate allocation refused: allocation ${prior.allocation.allocationId || "(unnamed)"} for this governed request already exists and is not provably released — release it or retry with a new governed attempt`,
        adapterMeta: { adapter: "provider-compute", providerId: selectedId, compute: { replayRefused: true } },
      },
    };
  }

  const runRef = {
    trainingRunId: str(trainingRunId),
    modelTrainingRowId: str(findTrainingRunReceiptRow(workspaceConfig, trainingRunId)?.modelTrainingRowId || ""),
    providerId: selectedId,
    capacityProfileId,
    providerResourceId: "",
  };
  const startedMs = io.now();
  events.push(workspaceEvent(io, "compute-requested", runRef, `governed compute request for profile ${capacityProfileId} via ${selectedId}`));

  const block = (extra = {}) => normalizeComputeBlock({
    capacityProfileId,
    providerRegistryId: selectedId,
    selectionMode: decision.selectionMode,
    idempotencyKeyHash,
    decision,
    authority: sealedAuthority,
    intent,
    intentHash: intent?.intentHash,
    requirementsHash: intent?.requirementsHash,
    workSpec,
    workSpecHash: workSpec?.workSpecHash,
    policy,
    capabilities: capabilitiesById[selectedId] || null,
    events,
    checkpoints,
    evidenceObservedAt: eventNow(io),
    ...extra,
  });
  const persist = async (extra = {}) => {
    const value = block(extra);
    if (typeof io.persistCompute === "function") await io.persistCompute(value);
    return value;
  };
  await persist();

  // 5. Allocate + verify allocation evidence.
  const ctx = baseCtx({ io, provider, providerConfig, req, capacityProfileId, trainingRunId, idempotencyKeyHash, runRef, intent, workSpec });
  let allocation = await safeCall(() => adapter.allocate(ctx));
  if (allocation?.__error || !allocation || allocation.status === "failed" || !str(allocation.allocationId).trim()) {
    const reason = allocation?.__error || allocation?.error || "provider did not return a verifiable allocation";
    events.push(workspaceEvent(io, "compute-failed", runRef, `allocation failed: ${reason}`));
    return {
      localFallthrough: false,
      computeBlock: block({ allocation: allocation?.__error ? null : allocation }),
      result: { ok: false, exitCode: null, durationMs: io.now() - startedMs, stdout: "", stderr: "", error: `compute allocation failed: ${reason}`, adapterMeta: { adapter: "provider-compute", providerId: selectedId } },
    };
  }
  // Verify the allocation EVIDENCE against the governed ask: a provider that
  // reports fewer GPUs/workers than the requirements demanded has not
  // satisfied this allocation — fail closed and release rather than train on
  // silently degraded capacity (the reported-GPU-mismatch defense).
  const reported = allocation.allocated && typeof allocation.allocated === "object" ? allocation.allocated : null;
  const wantGpus = Math.max(0, Math.floor(Number(req?.gpuCount) || 0));
  const wantWorkers = req?.distributed && Number(req.distributed.workers) >= 2 ? Math.floor(Number(req.distributed.workers)) : 1;
  if (reported && ((wantGpus > 0 && Number(reported.gpuCount) > 0 && Number(reported.gpuCount) < wantGpus)
    || (wantWorkers > 1 && Number(reported.workers) > 0 && Number(reported.workers) < wantWorkers))) {
    const mismatch = `allocation evidence mismatch: asked for ${wantGpus} GPU(s) × ${wantWorkers} worker(s), provider reports ${Number(reported.gpuCount) || 0} GPU(s) × ${Number(reported.workers) || 0} worker(s)`;
    runRef.providerResourceId = str(allocation.runRef?.providerResourceId || allocation.allocationId);
    events.push({ ...workspaceEvent(io, "compute-allocated", runRef, `allocation ${allocation.allocationId} recorded`), source: "provider" });
    events.push(workspaceEvent(io, "compute-failed", runRef, mismatch));
    events.push(workspaceEvent(io, "compute-release-requested", runRef, "releasing mismatched allocation"));
    const releasedEvents = await safeCall(() => adapter.release(ctx));
    if (releasedEvents?.__error) events.push(workspaceEvent(io, "compute-release-failed", runRef, `release failed: ${releasedEvents.__error} — capacity may still exist and cost may accrue`));
    else for (const event of Array.isArray(releasedEvents) ? releasedEvents : []) events.push(event);
    return {
      localFallthrough: false,
      computeBlock: block({ allocation }),
      result: { ok: false, exitCode: null, durationMs: io.now() - startedMs, stdout: "", stderr: "", error: mismatch, adapterMeta: { adapter: "provider-compute", providerId: selectedId } },
    };
  }
  runRef.providerResourceId = str(allocation.runRef?.providerResourceId || allocation.allocationId);
  allocation = { ...allocation, runRef: { ...(allocation.runRef || runRef), providerResourceId: runRef.providerResourceId }, workSpecHash: workSpec?.workSpecHash || "" };
  events.push({ ...workspaceEvent(io, "compute-allocated", runRef, `allocation ${allocation.allocationId} verified`), source: "provider" });
  await persist({ allocation });

  // Allocation and workload submission are separate adapter operations. The
  // exact server-compiled portable work spec is the only workload authority.
  if (!authorityOk && !requireAuthority) {
    // Backward-compatible direct library callers have no compiled server
    // authority. The shipped sandbox route hook always sets requireAuthority
    // for remote-capable asks and therefore always crosses the explicit
    // execute boundary with a sealed work spec.
  } else if (typeof adapter.execute !== "function") {
    events.push(workspaceEvent(io, "compute-failed", runRef, "provider adapter has no execute operation"));
    await persist({ allocation });
  } else {
    const executionEvents = await safeCall(() => adapter.execute(ctx));
    if (executionEvents?.__error) events.push(workspaceEvent(io, "compute-failed", runRef, `execution submission failed: ${executionEvents.__error}`));
    else for (const event of Array.isArray(executionEvents) ? executionEvents : []) events.push({ ...event, workSpecHash: workSpec?.workSpecHash || "", requirementsHash: intent?.requirementsHash || "" });
    await persist({ allocation });
  }

  // 6. Observe execution until terminal (bounded).
  const maxPolls = Number(io.maxPolls) > 0 ? Number(io.maxPolls) : DEFAULT_MAX_POLLS;
  const pollInterval = Number(io.pollIntervalMs) >= 0 ? Number(io.pollIntervalMs) : DEFAULT_POLL_INTERVAL_MS;
  let lifecycle = deriveComputeLifecycle({ events, allocation, checkpoints });
  for (let poll = 0; poll < maxPolls && !lifecycle.terminal; poll += 1) {
    const observed = await safeCall(() => adapter.status(ctx));
    if (observed?.__error) {
      events.push(workspaceEvent(io, "compute-failed", runRef, `provider status unobservable: ${observed.__error}`));
    } else {
      for (const event of Array.isArray(observed) ? observed : []) {
        const boundEvent = { ...event, workSpecHash: workSpec?.workSpecHash || "", requirementsHash: intent?.requirementsHash || "" };
        events.push(boundEvent);
        if (event?.type === "checkpoint-created" && event?.checkpoint) checkpoints.push({ ...event.checkpoint, workSpecHash: workSpec?.workSpecHash || "" });
      }
    }
    await persist({ allocation });
    lifecycle = deriveComputeLifecycle({ events, allocation, checkpoints });
    if (lifecycle.terminal) break;
    if (typeof io.sleep === "function" && pollInterval > 0) await io.sleep(pollInterval);
  }
  if (!lifecycle.terminal) {
    events.push(workspaceEvent(io, "compute-failed", runRef, `execution did not reach a terminal state within ${maxPolls} observations — treated as failed, capacity may still exist`));
    lifecycle = deriveComputeLifecycle({ events, allocation, checkpoints });
  }

  // 7. Artifact honesty (a provider 200 is not a verified artifact).
  let artifact = null;
  if (lifecycle.terminal === "completed" && typeof adapter.collectArtifact === "function") {
    const collected = await safeCall(() => adapter.collectArtifact(ctx));
    if (!collected?.__error && collected) {
      const candidate = { ...collected, workSpecHash: workSpec?.workSpecHash || "", requirementsHash: intent?.requirementsHash || "" };
      const verified = typeof io.verifyArtifact === "function" ? await safeCall(() => io.verifyArtifact(candidate, workSpec)) : null;
      if (verified && !verified.__error && verified.verifiedSha256 === candidate.sha256) artifact = { ...candidate, ...verified };
      else artifact = candidate;
    }
  }
  const honesty = deriveComputeArtifactHonesty({ lifecycle, artifact });
  const benchmark = artifact?.verifiedSha256 && Array.isArray(artifact.evaluationResults) && artifact.evaluationResults.length
    ? deriveBenchmarkWins({ results: artifact.evaluationResults }) : null;
  const evaluation = benchmark ? { workSpecHash: workSpec?.workSpecHash || "", requirementsHash: intent?.requirementsHash || "", benchmarkWins: buildBenchmarkReceiptFields(benchmark), reason: benchmark.reason } : null;

  // 8. Release — always attempted, failure stays visible.
  events.push(workspaceEvent(io, "compute-release-requested", runRef, "governed release of provider capacity"));
  await persist({ allocation, artifact, evaluation });
  const released = await safeCall(() => adapter.release(ctx));
  if (released?.__error) {
    events.push({ ...workspaceEvent(io, "compute-release-failed", runRef, `release failed: ${released.__error} — capacity may still exist and cost may accrue`), source: "workspace" });
  } else {
    for (const event of Array.isArray(released) ? released : []) events.push(event);
  }
  await persist({ allocation, artifact, evaluation });
  lifecycle = deriveComputeLifecycle({ events, allocation, checkpoints });

  const computeBlock = block({ allocation, artifact, evaluation });
  const ok = lifecycle.terminal === "completed" && honesty.promotable;
  const summary = {
    providerId: selectedId,
    capacityProfileId,
    terminal: lifecycle.terminal,
    promotable: honesty.promotable,
    promotabilityReason: honesty.reason,
    releaseConfirmed: lifecycle.releaseConfirmed,
    capacityMayStillExist: lifecycle.capacityMayStillExist,
    costMayAccrue: lifecycle.costMayAccrue,
    refusedEvents: lifecycle.refused.length,
  };
  return {
    localFallthrough: false,
    computeBlock,
    result: {
      ok,
      exitCode: ok ? 0 : lifecycle.terminal ? 1 : null,
      durationMs: io.now() - startedMs,
      stdout: JSON.stringify(summary),
      stderr: "",
      ...(ok ? {} : { error: lifecycle.terminal === "completed" ? honesty.reason : `provider compute ${lifecycle.terminal || "did not complete"}` }),
      adapterMeta: { adapter: "provider-compute", providerId: selectedId, compute: summary },
    },
  };
}

/**
 * Cancel a provider-compute run: cooperative cancel + release, with the
 * release outcome kept honest (a failed release remains visibly unreleased).
 */
export async function cancelProviderComputeRun({ priorCompute = null, provider = null, io = null } = {}) {
  if (!io || typeof io.getAdapter !== "function") throw new Error("cancelProviderComputeRun: io.getAdapter required");
  const prior = normalizeComputeBlock(priorCompute);
  if (!prior?.allocation) {
    return { computeBlock: prior, cancelled: false, reason: "no allocation on record — nothing to cancel" };
  }
  const adapter = io.getAdapter(provider?.adapterId || "");
  if (!adapter) {
    return { computeBlock: prior, cancelled: false, reason: `adapter "${provider?.adapterId || ""}" not registered — capacity may still exist` };
  }
  const runRef = prior.allocation.runRef;
  const providerConfig = { ...(provider?.config || {}), providerId: provider?.providerId };
  const ctx = baseCtx({ io, provider, providerConfig, req: null, capacityProfileId: prior.capacityProfileId, trainingRunId: runRef.trainingRunId, idempotencyKeyHash: prior.idempotencyKeyHash, runRef });
  const events = [...prior.events];
  const cancelEvents = await safeCall(() => adapter.cancel(ctx));
  if (cancelEvents?.__error) events.push(workspaceEvent(io, "compute-failed", runRef, `cancel failed: ${cancelEvents.__error}`));
  else for (const e of Array.isArray(cancelEvents) ? cancelEvents : []) events.push(e);
  if (typeof io.persistCompute === "function") await io.persistCompute(normalizeComputeBlock({ ...prior, events, evidenceObservedAt: eventNow(io) }));

  events.push(workspaceEvent(io, "compute-release-requested", runRef, "release after cancellation"));
  const releaseEvents = await safeCall(() => adapter.release(ctx));
  if (releaseEvents?.__error) {
    events.push(workspaceEvent(io, "compute-release-failed", runRef, `release failed: ${releaseEvents.__error} — capacity may still exist and cost may accrue`));
  } else {
    for (const e of Array.isArray(releaseEvents) ? releaseEvents : []) events.push(e);
  }
  if (typeof io.persistCompute === "function") await io.persistCompute(normalizeComputeBlock({ ...prior, events, evidenceObservedAt: eventNow(io) }));
  const lifecycle = deriveComputeLifecycle({ events, allocation: prior.allocation, checkpoints: prior.checkpoints });
  return {
    computeBlock: normalizeComputeBlock({ ...prior, events, evidenceObservedAt: eventNow(io) }),
    cancelled: lifecycle.terminal === "cancelled",
    releaseConfirmed: lifecycle.releaseConfirmed,
    capacityMayStillExist: lifecycle.capacityMayStillExist,
    costMayAccrue: lifecycle.costMayAccrue,
    reason: lifecycle.releaseConfirmed ? "cancelled and released" : "cancelled — release NOT confirmed; capacity may still exist and cost may accrue",
  };
}

/** Resume the same governed workload from a proven checkpoint in its lineage. */
export async function resumeProviderComputeRun({ priorCompute = null, provider = null, checkpointId = "", io = null } = {}) {
  if (!io || typeof io.getAdapter !== "function") throw new Error("resumeProviderComputeRun: io.getAdapter required");
  const prior = normalizeComputeBlock(priorCompute);
  const lifecycle = deriveComputeLifecycle({ events: prior?.events, allocation: prior?.allocation, checkpoints: prior?.checkpoints });
  const checkpoint = lifecycle.provenCheckpoints.find((item) => item.checkpointId === String(checkpointId || ""));
  if (!checkpoint) return { computeBlock: prior, resumed: false, reason: "checkpoint is missing, unproven, or foreign to this run" };
  if (checkpoint.workSpecHash !== prior.workSpecHash) return { computeBlock: prior, resumed: false, reason: "checkpoint work-spec lineage mismatch" };
  if (prior?.capabilities?.supportsResume !== true) return { computeBlock: prior, resumed: false, reason: "selected provider does not support resume" };
  const adapter = io.getAdapter(provider?.adapterId || "");
  if (!adapter || typeof adapter.resume !== "function") return { computeBlock: prior, resumed: false, reason: "provider resume operation unavailable" };
  const runRef = prior.allocation?.runRef;
  const ctx = baseCtx({ io, provider, providerConfig: { ...(provider?.config || {}), providerId: provider?.providerId }, req: prior.intent?.requirements, capacityProfileId: prior.capacityProfileId, trainingRunId: runRef?.trainingRunId, idempotencyKeyHash: prior.idempotencyKeyHash, runRef, intent: prior.intent, workSpec: prior.workSpec });
  const events = [...prior.events];
  events.push(workspaceEvent(io, "compute-requested", { ...runRef, providerResourceId: "" }, `new governed attempt resuming checkpoint ${checkpoint.checkpointId}`));
  const resumedEvents = await safeCall(() => adapter.resume(ctx, checkpoint));
  if (resumedEvents?.__error) return { computeBlock: prior, resumed: false, reason: resumedEvents.__error };
  const returned = Array.isArray(resumedEvents) ? resumedEvents : [];
  const resumeRef = returned.find((event) => event?.runRef?.providerResourceId)?.runRef || runRef;
  events.push({ ...workspaceEvent(io, "compute-allocated", resumeRef, "resume attempt allocation adopted"), source: "provider", workSpecHash: prior.workSpecHash, requirementsHash: prior.requirementsHash });
  for (const event of returned) events.push({ ...event, workSpecHash: prior.workSpecHash, requirementsHash: prior.requirementsHash });
  const computeBlock = normalizeComputeBlock({ ...prior, events, evidenceObservedAt: eventNow(io) });
  if (typeof io.persistCompute === "function") await io.persistCompute(computeBlock);
  return { computeBlock, resumed: deriveComputeLifecycle({ events, allocation: prior.allocation, checkpoints: prior.checkpoints }).resumed, reason: "resume submitted from proven checkpoint" };
}

function baseCtx({ io, provider, providerConfig, req, capacityProfileId, trainingRunId, idempotencyKeyHash, runRef = null, intent = null, workSpec = null }) {
  return {
    runRef: runRef || { trainingRunId: str(trainingRunId), modelTrainingRowId: "", providerId: str(provider?.providerId), capacityProfileId: str(capacityProfileId), providerResourceId: "" },
    requirements: req,
    capacityProfileId: str(capacityProfileId),
    idempotencyKeyHash: str(idempotencyKeyHash),
    intent,
    workSpec,
    intentHash: str(intent?.intentHash),
    requirementsHash: str(intent?.requirementsHash),
    workSpecHash: str(workSpec?.workSpecHash),
    providerConfig: providerConfig || {},
    resolveEnv: typeof io.resolveEnv === "function" ? io.resolveEnv : () => "",
    fetchJson: typeof io.fetchJson === "function" ? io.fetchJson : async () => { throw new Error("fetchJson not provided"); },
  };
}

/**
 * Route hook: decide whether this sandbox run is a provider-compute run and
 * execute it if so. Returns null to FALL THROUGH to the existing local path
 * unchanged (the default for every pre-compute workspace).
 *
 * Applicability is request-based: the governed receipt row carries a
 * CUSTOMER compute request snapshot (`computeRequest`, growthub-compute-
 * request-v1) — or, for rows journaled before the request/authority split,
 * the ask fields of the server-journaled compute block. Row-stored intent /
 * work-spec objects are NEVER an ask and never authority: for any
 * remote-capable request the server compiles and seals its own authority
 * (io.compileAuthority → lib/compute-authority.js) and fails closed when
 * compilation fails or when a previously sealed authority no longer matches
 * the governed inputs — all before any provider boundary.
 */
export async function maybeExecuteProviderComputeForSandboxRun({ workspaceConfig = null, objectId = "", name = "", action = "run", checkpointId = "", io = null } = {}) {
  if (str(objectId) !== "model-training-runner") return null;
  const trainingRunId = str(name).trim();
  if (!trainingRunId) return null;
  const row = findTrainingRunReceiptRow(workspaceConfig, trainingRunId);
  if (!row) return null;
  const prior = parseReceiptComputeBlock(row);
  if (["cancel", "resume"].includes(action)) {
    if (!prior?.providerRegistryId) return { localFallthrough: false, computeBlock: prior, result: { ok: false, exitCode: 1, durationMs: 0, stdout: "", stderr: "", error: "no remote compute provider is recorded for this run", adapterMeta: { adapter: "provider-compute" } } };
    const providersState = deriveComputeProviders({ workspaceConfig, registeredAdapterIds: typeof io.listAdapterIds === "function" ? io.listAdapterIds() : [], envPresent: io.envPresent || (() => false), preflight: row.preflight || null });
    const provider = providersState.providers.find((item) => item.providerId === prior.providerRegistryId);
    if (!provider) return { localFallthrough: false, computeBlock: prior, result: { ok: false, exitCode: 1, durationMs: 0, stdout: "", stderr: "", error: "recorded compute provider no longer exists", adapterMeta: { adapter: "provider-compute" } } };
    const controlled = action === "cancel"
      ? await cancelProviderComputeRun({ priorCompute: prior, provider, io })
      : await resumeProviderComputeRun({ priorCompute: prior, provider, checkpointId, io });
    const ok = action === "cancel" ? controlled.cancelled : controlled.resumed;
    return { localFallthrough: false, computeBlock: controlled.computeBlock, result: { ok, exitCode: ok ? 0 : 1, durationMs: 0, stdout: JSON.stringify({ action, reason: controlled.reason }), stderr: "", ...(ok ? {} : { error: controlled.reason }), adapterMeta: { adapter: "provider-compute", providerId: prior.providerRegistryId, action } } };
  }

  const request = normalizeComputeRequest(parseJsonColumn(row.computeRequest))
    || (prior && (prior.capacityProfileId || prior.providerRegistryId)
      ? normalizeComputeRequest({
        policy: prior.policy,
        selectionMode: prior.selectionMode,
        providerRegistryId: prior.providerRegistryId,
        capacityProfileId: prior.capacityProfileId,
      })
      : null);
  if (!request) return null; // no compute ask → existing local behavior, byte-for-byte

  const preflight = row.preflight && typeof row.preflight === "object" ? row.preflight : null;
  const ask = {
    capacityProfileId: request.capacityProfileId,
    providerRegistryId: request.providerRegistryId,
    selectionMode: request.selectionMode,
    policy: request.policy,
  };
  const refusal = (message) => ({
    localFallthrough: false,
    computeBlock: prior,
    result: { ok: false, exitCode: null, durationMs: 0, stdout: "", stderr: "", error: message, adapterMeta: { adapter: "provider-compute", compute: { authorityRefused: true } } },
  });

  if (request.policy.mode === "local") {
    // Pure-local ask: localOnly excludes every remote candidate in the
    // resolver, so no provider boundary exists and no sealed authority is
    // needed; the decision is journaled and execution falls through to the
    // existing local pipeline byte-for-byte.
    const outcome = await executeProviderComputeRun({
      workspaceConfig,
      trainingRunId,
      computeAsk: ask,
      preflight,
      budget: request.policy.budget,
      priorCompute: prior,
      requireAuthority: false,
      io,
    });
    if (outcome.localFallthrough) return null;
    return outcome;
  }

  // Remote-capable ask: server-owned authority is mandatory, compiled fresh
  // from authoritative records before any provider work.
  if (typeof io.compileAuthority !== "function") {
    return refusal("compute authority compiler unavailable — remote-capable compute is refused without server-owned authority");
  }
  const compiled = await io.compileAuthority({ trainingRunId, request });
  if (!compiled?.ok || !compiled.authority) {
    return refusal(`compute authority compilation failed (${str(compiled?.reasonCode) || "unknown"}): ${str(compiled?.reason) || "no detail"}`);
  }
  if (str(compiled.keySource) === "ephemeral") {
    // A seal that cannot outlive a process restart must never authorize a
    // paid provider boundary: after the restart the workload could be
    // silently replaced. Development/local evidence only.
    return refusal("compute authority is sealed with a per-process ephemeral key — remote execution requires a durable key; set GROWTHUB_COMPUTE_AUTHORITY_KEY or GROWTHUB_WORKSPACE_SIGNING_KEY");
  }
  const authority = compiled.authority;
  if (prior?.authority) {
    // Authority CONTINUITY, decided by content — never by whether the old
    // seal still verifies. Key rotation or a restart must not become
    // permission to change workload semantics: if the journaled authority's
    // content identity cannot be reproduced from current governed inputs,
    // fail closed BEFORE any provider action; if it matches, proceed under
    // an explicit reseal (the journal records the new keyId).
    if (typeof io.verifyAuthority !== "function") {
      return refusal("compute authority verifier unavailable — refusing to supersede a journaled authority without verification");
    }
    const verdict = await io.verifyAuthority(prior.authority);
    if (!verdict || verdict.contentMatches !== true) {
      return refusal(`governed inputs changed after compute authority was sealed (${str(verdict?.reasonCode) || "unreproducible"}) — refusing before provider submission; prepare a new governed run to change the workload`);
    }
  }
  const outcome = await executeProviderComputeRun({
    workspaceConfig,
    trainingRunId,
    computeAsk: ask,
    preflight,
    budget: request.policy.budget,
    priorCompute: prior,
    requireAuthority: true,
    authority,
    io,
  });
  if (outcome.localFallthrough) return null;
  return outcome;
}
