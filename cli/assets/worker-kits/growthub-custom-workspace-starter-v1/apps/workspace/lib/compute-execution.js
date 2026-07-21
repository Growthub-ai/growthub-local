/**
 * Governed provider-compute execution on the existing sandbox-run authority.
 *
 * Remote execution consumes only a server-compiled sealed authority; provider
 * observation is policy-filtered before network IO; allocation identity binds
 * the exact work spec; evidence journals merge monotonically; active resources
 * are reconciled instead of duplicated; transient status uncertainty remains
 * pending; provider-authored scores never mint promotion; and resume adopts a
 * newly returned active resource only after a durable resume intent exists.
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
import {
  deriveComputeRequirements,
  normalizeRequirementsForProfile,
  resolveCapacityProfileForRequirements,
} from "./compute-capacity-profiles.js";
import { LOCAL_PROVIDER_ID } from "./compute-provider-registry.js";
import {
  normalizeComputePolicy,
  normalizeComputeRequest,
  sha256Hex,
  verifyComputeAuthority,
} from "./compute-work-spec.js";

const DEFAULT_MAX_POLLS = 3;
const DEFAULT_POLL_INTERVAL_MS = 5000;
const MAX_POLLS_PER_INVOCATION = 3;
const MAX_EVENTS = 200;
const MAX_CHECKPOINTS = 50;

function str(value) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function nowIso(io) {
  return new Date(io.now()).toISOString();
}

function workspaceEvent(io, type, runRef, detail, providerEventId = "") {
  const at = nowIso(io);
  return {
    type,
    at,
    evidenceObservedAt: at,
    source: "workspace",
    runRef,
    providerEventId,
    detail: str(detail).slice(0, 500),
  };
}

async function safeCall(fn, fallback = {}) {
  try {
    return await fn();
  } catch (error) {
    return { __error: str(error?.message || error) || "adapter call failed", ...fallback };
  }
}

function eventIdentity(event) {
  const providerId = str(event?.providerEventId);
  if (providerId) return `provider:${providerId}`;
  return sha256Hex(JSON.stringify([
    str(event?.type),
    str(event?.at),
    str(event?.source),
    str(event?.runRef?.trainingRunId),
    str(event?.runRef?.providerResourceId),
    str(event?.detail),
  ]));
}

function mergeEvents(previous = [], next = []) {
  const ordered = [];
  const byId = new Map();
  for (const event of [...(Array.isArray(previous) ? previous : []), ...(Array.isArray(next) ? next : [])]) {
    if (!event || typeof event !== "object") continue;
    const id = eventIdentity(event);
    if (byId.has(id)) {
      const index = byId.get(id);
      ordered[index] = { ...ordered[index], ...event };
    } else {
      byId.set(id, ordered.length);
      ordered.push(event);
    }
  }
  if (ordered.length <= MAX_EVENTS) return ordered;
  const criticalTypes = new Set([
    "compute-requested",
    "compute-allocated",
    "checkpoint-created",
    "compute-completed",
    "compute-failed",
    "compute-cancelled",
    "compute-release-requested",
    "compute-released",
    "compute-release-failed",
  ]);
  // Never recurse during compaction: a hostile provider may emit more
  // critical events than the cap. Preserve the first request anchor, newest
  // critical transitions, then newest non-critical context.
  const firstRequest = ordered.find((event) => event.type === "compute-requested") || null;
  const criticalTail = ordered
    .filter((event) => criticalTypes.has(event.type) && event !== firstRequest)
    .slice(-(MAX_EVENTS - (firstRequest ? 1 : 0)));
  const criticalIds = new Set([
    ...(firstRequest ? [eventIdentity(firstRequest)] : []),
    ...criticalTail.map(eventIdentity),
  ]);
  const remaining = Math.max(0, MAX_EVENTS - criticalIds.size);
  const nonCriticalTail = ordered.filter((event) => !criticalTypes.has(event.type)).slice(-remaining);
  const keepIds = new Set([...criticalIds, ...nonCriticalTail.map(eventIdentity)]);
  return ordered.filter((event) => keepIds.has(eventIdentity(event))).slice(-MAX_EVENTS);
}

function mergeCheckpoints(previous = [], next = []) {
  const map = new Map();
  for (const checkpoint of [...(Array.isArray(previous) ? previous : []), ...(Array.isArray(next) ? next : [])]) {
    if (!checkpoint || typeof checkpoint !== "object") continue;
    const key = str(checkpoint.checkpointId)
      || sha256Hex(JSON.stringify([checkpoint.locator, checkpoint.sha256, checkpoint.step]));
    map.set(key, { ...(map.get(key) || {}), ...checkpoint });
  }
  return [...map.values()].slice(-MAX_CHECKPOINTS);
}

/** Absence in a newer lifecycle phase never erases old paid-resource truth. */
export function mergeComputeBlocks(previous, next) {
  const prior = normalizeComputeBlock(previous);
  const incoming = normalizeComputeBlock(next);
  if (!prior) return incoming;
  if (!incoming) return prior;
  return normalizeComputeBlock({
    ...prior,
    ...incoming,
    authority: incoming.authority || prior.authority,
    intent: incoming.intent || prior.intent,
    workSpec: incoming.workSpec || prior.workSpec,
    policy: incoming.policy || prior.policy,
    decision: incoming.decision || prior.decision,
    capabilities: incoming.capabilities || prior.capabilities,
    observation: incoming.observation || prior.observation
      ? { ...(prior.observation || {}), ...(incoming.observation || {}) }
      : null,
    dataset: incoming.dataset || prior.dataset
      ? { ...(prior.dataset || {}), ...(incoming.dataset || {}) }
      : null,
    allocation: incoming.allocation || prior.allocation,
    events: mergeEvents(prior.events, incoming.events),
    checkpoints: mergeCheckpoints(prior.checkpoints, incoming.checkpoints),
    artifact: incoming.artifact || prior.artifact,
    // Legacy/provider-authored evaluation is never carried forward as
    // promotion authority. Only the workspace-owned evaluator may persist.
    evaluation: incoming?.evaluation?.source === "workspace-canonical"
      ? incoming.evaluation
      : prior?.evaluation?.source === "workspace-canonical"
        ? prior.evaluation
        : null,
    evidenceObservedAt: incoming.evidenceObservedAt || prior.evidenceObservedAt,
  });
}

/** Resolve exactly one receipt row; duplicate ids are never silently selected. */
export function findTrainingRunReceiptRow(workspaceConfig, trainingRunId) {
  const wanted = str(trainingRunId).trim();
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects)
    ? workspaceConfig.dataModel.objects
    : [];
  const matches = objects
    .filter((object) => object?.objectType === "model-training-run")
    .flatMap((object) => Array.isArray(object.rows) ? object.rows : [])
    .filter((row) => str(row?.trainingRunId).trim() === wanted);
  return matches.length === 1 ? matches[0] : null;
}

export function parseReceiptComputeBlock(row) {
  return normalizeComputeBlock(parseJsonColumn(row?.compute));
}

/** Merge the journal with the row's current value before persisting it. */
export function applyComputeBlockToReceiptRows(objects, trainingRunId, computeBlock, statusOverride = "") {
  const id = str(trainingRunId).trim();
  if (!id) return null;
  let changed = false;
  const nextObjects = (Array.isArray(objects) ? objects : []).map((entry) => {
    if (entry?.objectType !== "model-training-run") return entry;
    const rows = Array.isArray(entry.rows) ? entry.rows : [];
    const nextRows = rows.map((row) => {
      if (str(row?.trainingRunId).trim() !== id) return row;
      changed = true;
      const merged = mergeComputeBlocks(parseReceiptComputeBlock(row), computeBlock);
      const verifiedArtifact = merged?.artifact?.verifiedSha256
        && merged.artifact.verifiedSha256 === merged.artifact.sha256
        ? merged.artifact
        : null;
      const distillation = parseJsonColumn(row.distillation);
      const canonicalWins = merged?.evaluation?.source === "workspace-canonical"
        ? merged.evaluation?.benchmarkWins
        : null;
      return {
        ...row,
        ...(statusOverride ? { status: statusOverride } : verifiedArtifact ? {
          status: "imported",
          completedAt: merged.evidenceObservedAt || row.completedAt,
          artifactType: verifiedArtifact.kind || "gguf",
          artifactModelTag: merged?.workSpec?.output?.modelTag || row.artifactModelTag || "",
          artifactPath: verifiedArtifact.locator,
          artifactSha256: verifiedArtifact.verifiedSha256,
          artifactArtifactBytes: verifiedArtifact.sizeBytes || 0,
          ...(canonicalWins ? {
            distillation: {
              ...(distillation && typeof distillation === "object" ? distillation : {}),
              benchmarkWins: canonicalWins,
              evaluationLineage: {
                workSpecHash: merged.workSpecHash,
                requirementsHash: merged.requirementsHash,
                source: "workspace-canonical",
              },
            },
          } : {}),
        } : {}),
        compute: JSON.stringify(merged),
      };
    });
    return { ...entry, rows: nextRows };
  });
  return changed ? nextObjects : null;
}

function providerMayBeObserved(provider, policy, selectionMode, pinnedProviderId) {
  const providerId = str(provider?.providerId);
  const availability = Array.isArray(provider?.availabilityModes)
    ? provider.availabilityModes.map(String)
    : [];
  // Hard customer policy gates are evaluated before an explicit pin. A pin
  // selects within the allowed universe; it cannot authorize a forbidden
  // local, remote, reserved, or spot provider to receive even a quote probe.
  if (policy?.mode === "local" || policy?.localOnly === true) {
    if (providerId !== LOCAL_PROVIDER_ID) return false;
  }
  if ((policy?.mode === "cloud" || policy?.excludeLocal === true) && providerId === LOCAL_PROVIDER_ID) return false;
  if (policy?.mode === "reserved-cluster" || policy?.reservedOnly === true) {
    if (providerId === LOCAL_PROVIDER_ID || !availability.some((mode) => mode === "reserved" || mode === "warm")) return false;
  }
  if (policy?.allowPreemptible !== true && availability.length === 1 && availability[0] === "spot") return false;
  if (selectionMode === "explicit" && pinnedProviderId) return providerId === pinnedProviderId;
  return true;
}

function resumeIdempotencyHash({
  trainingRunId,
  capacityProfileId,
  providerId,
  workSpecHash,
  checkpointId,
}) {
  return sha256Hex([
    "growthub-compute-resume-v1",
    str(trainingRunId),
    str(capacityProfileId),
    str(providerId),
    str(workSpecHash),
    str(checkpointId),
  ].join("|"));
}

function baseCtx({
  io,
  provider,
  providerConfig,
  requirements,
  capacityProfileId,
  trainingRunId,
  idempotencyKeyHash,
  runRef = null,
  intent = null,
  workSpec = null,
  datasetAccess = null,
}) {
  return {
    runRef: runRef || {
      trainingRunId: str(trainingRunId),
      modelTrainingRowId: "",
      providerId: str(provider?.providerId),
      capacityProfileId: str(capacityProfileId),
      providerResourceId: "",
    },
    requirements,
    capacityProfileId: str(capacityProfileId),
    idempotencyKeyHash: str(idempotencyKeyHash),
    intent,
    workSpec,
    intentHash: str(intent?.intentHash),
    requirementsHash: str(intent?.requirementsHash),
    workSpecHash: str(workSpec?.workSpecHash),
    // Short-lived bearer capability. It exists only in adapter call context
    // and is deliberately excluded from every normalized receipt shape.
    datasetAccess: datasetAccess && typeof datasetAccess === "object" ? datasetAccess : null,
    providerConfig: providerConfig || {},
    resolveEnv: typeof io.resolveEnv === "function" ? io.resolveEnv : () => "",
    fetchJson: typeof io.fetchJson === "function"
      ? io.fetchJson
      : async () => { throw new Error("fetchJson not provided"); },
  };
}

function pendingResult({
  io,
  startedMs,
  providerId,
  capacityProfileId,
  computeBlock,
  reason = "provider execution is still in progress",
  remoteStateUnverified = false,
}) {
  const summary = { providerId, capacityProfileId, pending: true, remoteStateUnverified, reason };
  return {
    localFallthrough: false,
    computeBlock,
    result: {
      ok: true,
      exitCode: null,
      durationMs: io.now() - startedMs,
      stdout: JSON.stringify(summary),
      stderr: "",
      adapterMeta: { adapter: "provider-compute", providerId, compute: summary },
    },
  };
}

async function persistMerged(io, prior, next) {
  const value = mergeComputeBlocks(prior, next);
  if (typeof io.persistCompute === "function") await io.persistCompute(value);
  return value;
}

/** Execute or reconcile one remote provider-compute lifecycle continuation. */
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
  datasetAccess = null,
  datasetEvidence = null,
  io = null,
} = {}) {
  if (!io || typeof io.getAdapter !== "function" || typeof io.now !== "function") {
    throw new Error("executeProviderComputeRun: io.getAdapter and io.now are required");
  }

  const ask = computeAsk && typeof computeAsk === "object" ? computeAsk : {};
  const sealedAuthority = authority && typeof authority === "object" ? authority : null;
  const intent = sealedAuthority?.intent && typeof sealedAuthority.intent === "object" ? sealedAuthority.intent : null;
  const workSpec = sealedAuthority?.workSpec && typeof sealedAuthority.workSpec === "object" ? sealedAuthority.workSpec : null;
  const authorityOk = Boolean(sealedAuthority && verifyComputeAuthority({ intent, workSpec }).ok);
  if (requireAuthority && !authorityOk) {
    throw new Error("provider compute refused: server-compiled compute authority is missing or failed lineage validation");
  }

  const derived = authorityOk
    ? intent.requirements
    : requirements && typeof requirements === "object"
      ? requirements
      : deriveComputeRequirements({ preflight, workloadKind: "fine-tune" });
  const capacityProfileId = authorityOk
    ? intent.capacityProfileId
    : str(ask.capacityProfileId).trim() || resolveCapacityProfileForRequirements(derived).profile.id;
  const req = normalizeRequirementsForProfile(derived, capacityProfileId);
  const policy = authorityOk
    ? normalizeComputePolicy(intent.policy)
    : ask.policy && typeof ask.policy === "object" ? normalizeComputePolicy(ask.policy) : null;
  const effectiveBudget = policy?.budget || budget;

  if (policy?.mode === "local" || policy?.localOnly === true) {
    return { localFallthrough: true, computeBlock: normalizeComputeBlock(priorCompute), result: null };
  }

  const selectionMode = ask.selectionMode === "explicit" ? "explicit" : "auto";
  const pinnedProviderId = str(ask.providerRegistryId).trim();
  const providersState = deriveComputeProviders({
    workspaceConfig,
    registeredAdapterIds: typeof io.listAdapterIds === "function" ? io.listAdapterIds() : [],
    envPresent: io.envPresent || (() => false),
    preflight,
  });
  const observableProviders = providersState.providers.filter((provider) =>
    providerMayBeObserved(provider, policy, selectionMode, pinnedProviderId));

  const capabilitiesById = {};
  const quotesById = {};
  for (const provider of observableProviders) {
    if (provider.status !== "ready") continue;
    const adapter = io.getAdapter(provider.adapterId);
    if (!adapter) continue;
    const providerConfig = { ...(provider.config || {}), providerId: provider.providerId, preflight };
    const ctx = baseCtx({
      io,
      provider,
      providerConfig,
      requirements: req,
      capacityProfileId,
      trainingRunId,
      idempotencyKeyHash: "",
      intent,
      workSpec,
    });
    const caps = await safeCall(() => adapter.describeCapabilities(providerConfig));
    if (!caps?.__error) capabilitiesById[provider.providerId] = caps;
    const quote = await safeCall(() => adapter.inspectCapacity(ctx));
    if (!quote?.__error) quotesById[provider.providerId] = quote;
  }

  const decision = resolveCompute({
    requirements: req,
    capacityProfileId,
    providers: observableProviders,
    capabilitiesById,
    quotesById,
    budget: effectiveBudget,
    policy,
    selectionMode,
    pinnedProviderId,
    now: io.now(),
  });
  const selectedId = decision.selectedProviderId;
  const prior = normalizeComputeBlock(priorCompute);

  if (!selectedId) {
    const blocked = normalizeComputeBlock({
      capacityProfileId,
      selectionMode: decision.selectionMode,
      decision,
      authority: sealedAuthority,
      intent,
      workSpec,
      policy,
      dataset: datasetEvidence,
      evidenceObservedAt: nowIso(io),
    });
    const computeBlock = await persistMerged(io, prior, blocked);
    const reasons = decision.candidates
      .filter((candidate) => !candidate.eligible)
      .map((candidate) => `${candidate.providerId}: ${(candidate.reasons || []).join("; ")}`);
    return {
      localFallthrough: false,
      computeBlock,
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

  if (selectedId === LOCAL_PROVIDER_ID) return { localFallthrough: true, computeBlock: prior, result: null };

  // A paid/remote production allocation is unsafe when the initiating request
  // is the only observer. QStash readiness is server-owned and checked before
  // allocation; local/test operation may still use explicit/manual observe.
  if (io.requireDurableObservation === true && io.observationSchedulerReady !== true) {
    const blocked = normalizeComputeBlock({
      capacityProfileId,
      selectionMode: decision.selectionMode,
      decision,
      authority: sealedAuthority,
      intent,
      workSpec,
      policy,
      observation: {
        schema: "growthub-compute-observation-v1",
        mode: "manual",
        status: "manual",
        attempt: 0,
        nextAttempt: 1,
        maxAttempts: 0,
        requestId: "",
        messageId: "",
        scheduleId: "",
        scheduledAt: "",
        nextObservationAt: "",
        lastObservedAt: "",
        lastErrorCode: "observation-scheduler-unavailable",
        authorityHash: str(sealedAuthority?.authorityHash),
        workSpecHash: str(workSpec?.workSpecHash),
      },
      evidenceObservedAt: nowIso(io),
    });
    const computeBlock = await persistMerged(io, prior, blocked);
    return {
      localFallthrough: false,
      computeBlock,
      result: {
        ok: false,
        exitCode: null,
        durationMs: 0,
        stdout: "",
        stderr: "",
        error: "durable-observation-unavailable: remote production compute requires a configured signed QStash observer before paid allocation",
        adapterMeta: { adapter: "provider-compute", providerId: selectedId, compute: { blocked: true, reasonCode: "durable-observation-unavailable" } },
      },
    };
  }

  const provider = observableProviders.find((candidate) => candidate.providerId === selectedId);
  const adapter = provider ? io.getAdapter(provider.adapterId) : null;
  if (!provider || !adapter) {
    return {
      localFallthrough: false,
      computeBlock: prior,
      result: {
        ok: false,
        exitCode: null,
        durationMs: 0,
        stdout: "",
        stderr: "",
        error: `selected provider "${selectedId}" is no longer available`,
        adapterMeta: { adapter: "provider-compute", providerId: selectedId },
      },
    };
  }

  const providerConfig = { ...(provider.config || {}), providerId: provider.providerId, preflight };
  const { hash: idempotencyKeyHash } = computeIdempotencyKey({
    trainingRunId,
    attempt,
    capacityProfileId,
    providerId: selectedId,
    workSpecHash: workSpec?.workSpecHash || "",
  });
  const startedMs = io.now();
  const runRef = {
    trainingRunId: str(trainingRunId),
    modelTrainingRowId: str(findTrainingRunReceiptRow(workspaceConfig, trainingRunId)?.modelTrainingRowId || ""),
    providerId: selectedId,
    capacityProfileId,
    providerResourceId: "",
  };
  let events = Array.isArray(prior?.events) ? [...prior.events] : [];
  let checkpoints = Array.isArray(prior?.checkpoints) ? [...prior.checkpoints] : [];
  let allocation = prior?.allocation || null;
  // True whenever this invocation continues a provider submission that
  // already happened (journaled allocation adopted, or an ambiguous accept
  // reconciled). Dataset delivery evidence follows the SUBMISSION: the
  // journaled grant is the identity the provider actually fetched under; a
  // freshly issued grant binds only when THIS invocation performs the create.
  let allocationContinued = false;
  const submissionDataset = () => (allocationContinued && prior?.dataset
    ? prior.dataset
    : (datasetEvidence || prior?.dataset || null));

  if (allocation && !allocation.releaseConfirmed) {
    if (allocation.idempotencyKeyHash !== idempotencyKeyHash) {
      return {
        localFallthrough: false,
        computeBlock: prior,
        result: {
          ok: false,
          exitCode: null,
          durationMs: io.now() - startedMs,
          stdout: "",
          stderr: "",
          error: `active allocation conflict: ${allocation.allocationId || "(unnamed)"} belongs to a different work-spec or attempt and is not provably released`,
          adapterMeta: {
            adapter: "provider-compute",
            providerId: selectedId,
            compute: { replayRefused: true, activeAllocationConflict: true },
          },
        },
      };
    }
    runRef.providerResourceId = str(allocation.runRef?.providerResourceId || allocation.allocationId);
    allocationContinued = true;
  } else {
    allocation = null;
  }

  const buildBlock = (extra = {}) => normalizeComputeBlock({
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
    capabilities: capabilitiesById[selectedId] || prior?.capabilities || null,
    dataset: submissionDataset(),
    events,
    checkpoints,
    allocation,
    evidenceObservedAt: nowIso(io),
    ...extra,
  });
  const persist = async (extra = {}) => {
    const value = await persistMerged(io, prior, buildBlock(extra));
    events = [...(value?.events || events)];
    checkpoints = [...(value?.checkpoints || checkpoints)];
    allocation = value?.allocation || allocation;
    return value;
  };
  const ctx = () => baseCtx({
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
  });

  const allocationUnverifiedEventId = `workspace:allocation-state-unverified:${idempotencyKeyHash}`;
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
    allocationContinued = true;
    events.push({
      ...workspaceEvent(io, "compute-allocated", runRef, `allocation ${allocation.allocationId} reconciled after an ambiguous provider response`, `workspace:allocation:${allocation.allocationId}`),
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
    events.push(workspaceEvent(
      io,
      "compute-requested",
      runRef,
      `durable provider allocation request for profile ${capacityProfileId} via ${selectedId}; idempotency ${idempotencyKeyHash.slice(0, 12)}`,
      `workspace:allocation-request:${idempotencyKeyHash}`,
    ));
    await persist();

    let observedAllocation = await safeCall(() => adapter.allocate(ctx()));
    if (observedAllocation && !observedAllocation.__error && observedAllocation.status === "failed") {
      const reason = observedAllocation.error || "provider explicitly refused allocation";
      events.push(workspaceEvent(io, "compute-failed", runRef, `allocation failed: ${reason}`));
      const computeBlock = await persist({ allocation: observedAllocation });
      return {
        localFallthrough: false,
        computeBlock,
        result: { ok: false, exitCode: 1, durationMs: io.now() - startedMs, stdout: "", stderr: "", error: `compute allocation failed: ${reason}`, adapterMeta: { adapter: "provider-compute", providerId: selectedId } },
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
          `allocation-state-unverified: ${reason}; deterministic reconciliation is required before any further paid create`,
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
    }

    const reported = observedAllocation.allocated && typeof observedAllocation.allocated === "object"
      ? observedAllocation.allocated
      : null;
    const wantGpus = Math.max(0, Math.floor(Number(req?.gpuCount) || 0));
    const wantWorkers = req?.distributed && Number(req.distributed.workers) >= 2
      ? Math.floor(Number(req.distributed.workers))
      : 1;
    const mismatch = reported && (
      (wantGpus > 0 && Number(reported.gpuCount) > 0 && Number(reported.gpuCount) < wantGpus)
      || (wantWorkers > 1 && Number(reported.workers) > 0 && Number(reported.workers) < wantWorkers)
    );
    runRef.providerResourceId = str(observedAllocation.runRef?.providerResourceId || observedAllocation.allocationId);
    observedAllocation = {
      ...observedAllocation,
      runRef: { ...(observedAllocation.runRef || runRef), providerResourceId: runRef.providerResourceId },
      idempotencyKeyHash,
      workSpecHash: workSpec?.workSpecHash || "",
    };
    allocation = observedAllocation;
    events.push({
      ...workspaceEvent(
        io,
        "compute-allocated",
        runRef,
        `allocation ${allocation.allocationId} ${allocation.reconciled ? "reconciled" : "verified"}`,
        `workspace:allocation:${allocation.allocationId}`,
      ),
      source: "provider",
    });
    await persist({ allocation });

    if (mismatch) {
      const detail = `allocation evidence mismatch: asked for ${wantGpus} GPU(s) × ${wantWorkers} worker(s), provider reports ${Number(reported.gpuCount) || 0} GPU(s) × ${Number(reported.workers) || 0} worker(s)`;
      events.push(workspaceEvent(io, "compute-failed", runRef, detail));
      events.push(workspaceEvent(io, "compute-release-requested", runRef, "releasing mismatched allocation"));
      await persist({ allocation });
      const releaseEvents = await safeCall(() => adapter.release(ctx()));
      if (releaseEvents?.__error) {
        events.push(workspaceEvent(io, "compute-release-failed", runRef, `release failed: ${releaseEvents.__error} — capacity may still exist and cost may accrue`));
      } else {
        for (const event of Array.isArray(releaseEvents) ? releaseEvents : []) events.push(event);
      }
      const computeBlock = await persist({ allocation });
      return {
        localFallthrough: false,
        computeBlock,
        result: {
          ok: false,
          exitCode: null,
          durationMs: io.now() - startedMs,
          stdout: "",
          stderr: "",
          error: detail,
          adapterMeta: { adapter: "provider-compute", providerId: selectedId },
        },
      };
    }
  }

  const submitted = events.some((event) =>
    ["compute-queued", "compute-running", "compute-completed"].includes(event?.type)
      && str(event?.workSpecHash) === str(workSpec?.workSpecHash));
  if (!submitted) {
    if (typeof adapter.execute !== "function") {
      events.push(workspaceEvent(io, "compute-failed", runRef, "provider adapter has no execute operation"));
      const computeBlock = await persist({ allocation });
      return {
        localFallthrough: false,
        computeBlock,
        result: {
          ok: false,
          exitCode: 1,
          durationMs: io.now() - startedMs,
          stdout: "",
          stderr: "",
          error: "provider adapter has no execute operation",
          adapterMeta: { adapter: "provider-compute", providerId: selectedId },
        },
      };
    }
    const executionEvents = await safeCall(() => adapter.execute(ctx()));
    if (executionEvents?.__error) {
      events.push(workspaceEvent(io, "compute-failed", runRef, `execution submission failed: ${executionEvents.__error}`));
      const computeBlock = await persist({ allocation });
      return {
        localFallthrough: false,
        computeBlock,
        result: {
          ok: false,
          exitCode: 1,
          durationMs: io.now() - startedMs,
          stdout: "",
          stderr: "",
          error: `execution submission failed: ${executionEvents.__error}`,
          adapterMeta: { adapter: "provider-compute", providerId: selectedId },
        },
      };
    }
    for (const event of Array.isArray(executionEvents) ? executionEvents : []) {
      events.push({ ...event, workSpecHash: workSpec?.workSpecHash || "", requirementsHash: intent?.requirementsHash || "" });
    }
    await persist({ allocation });
  }

  let lifecycle = deriveComputeLifecycle({ events, allocation, checkpoints });
  const requestedPolls = Number(io.maxPolls) > 0 ? Math.floor(Number(io.maxPolls)) : DEFAULT_MAX_POLLS;
  const maxPolls = Math.max(1, Math.min(requestedPolls, MAX_POLLS_PER_INVOCATION));
  const pollInterval = Number(io.pollIntervalMs) >= 0 ? Number(io.pollIntervalMs) : DEFAULT_POLL_INTERVAL_MS;

  for (let poll = 0; poll < maxPolls && !lifecycle.terminal; poll += 1) {
    const observed = await safeCall(() => adapter.status(ctx()));
    if (observed?.__error) {
      const event = workspaceEvent(
        io,
        lifecycle.status === "running" ? "compute-running" : "compute-queued",
        runRef,
        `remote-state-unverified: provider status could not be observed (${observed.__error}); execution remains pending and no release was attempted`,
        `workspace:remote-state-unverified:${sha256Hex(`${idempotencyKeyHash}|${observed.__error}`).slice(0, 24)}`,
      );
      events.push(event);
      const computeBlock = await persist({ allocation });
      return pendingResult({
        io,
        startedMs,
        providerId: selectedId,
        capacityProfileId,
        computeBlock,
        reason: event.detail,
        remoteStateUnverified: true,
      });
    }
    for (const event of Array.isArray(observed) ? observed : []) {
      events.push({ ...event, workSpecHash: workSpec?.workSpecHash || "", requirementsHash: intent?.requirementsHash || "" });
      if (event?.type === "checkpoint-created" && event?.checkpoint) {
        checkpoints.push({ ...event.checkpoint, workSpecHash: workSpec?.workSpecHash || "" });
      }
    }
    await persist({ allocation });
    lifecycle = deriveComputeLifecycle({ events, allocation, checkpoints });
    if (lifecycle.terminal) break;
    if (poll < maxPolls - 1 && typeof io.sleep === "function" && pollInterval > 0) await io.sleep(pollInterval);
  }

  if (!lifecycle.terminal) {
    const computeBlock = await persist({ allocation });
    return pendingResult({ io, startedMs, providerId: selectedId, capacityProfileId, computeBlock });
  }

  let artifact = prior?.artifact || null;
  let dataEvidence = submissionDataset();
  let datasetDeliveryReason = "";
  let deliveryVerified = dataEvidence?.deliveryStatus === "delivered";
  if (!deliveryVerified && lifecycle.terminal === "completed" && typeof io.verifyDatasetDelivery === "function") {
    const delivery = await safeCall(() => io.verifyDatasetDelivery({ evidence: dataEvidence, workSpec }));
    if (!delivery?.__error && delivery?.ok === true) {
      deliveryVerified = true;
      dataEvidence = {
        ...dataEvidence,
        deliveryStatus: "delivered",
        deliveredAt: str(delivery.receipt?.deliveredAt),
        reasonCode: "",
      };
    } else {
      datasetDeliveryReason = str(delivery?.reason || delivery?.__error || "dataset delivery could not be proven");
      dataEvidence = { ...dataEvidence, deliveryStatus: "unverified", reasonCode: str(delivery?.reasonCode || "dataset-delivery-unverified") };
    }
    await persist({ allocation, dataset: dataEvidence });
  }
  if (lifecycle.terminal === "completed" && !artifact && typeof adapter.collectArtifact === "function") {
    const collected = await safeCall(() => adapter.collectArtifact(ctx()));
    if (!collected?.__error && collected) {
      const { evaluationResults: _untrustedEvaluation, ...artifactEvidence } = collected;
      const reportedWorkSpecHash = str(artifactEvidence.workSpecHash);
      const reportedCorpusSha256 = str(artifactEvidence.corpusSha256 || artifactEvidence.datasetSha256);
      const expectedWorkSpecHash = str(workSpec?.workSpecHash);
      const expectedCorpusSha256 = str(workSpec?.dataset?.corpusSha256);
      const providerAttestationVerified = Boolean(
        reportedWorkSpecHash
          && reportedCorpusSha256
          && reportedWorkSpecHash === expectedWorkSpecHash
          && reportedCorpusSha256 === expectedCorpusSha256,
      );
      const providerAttestationReason = providerAttestationVerified
        ? "provider artifact binds the exact governed work-spec and corpus identities"
        : `provider artifact attestation mismatch: expected workSpec=${expectedWorkSpecHash || "missing"} corpus=${expectedCorpusSha256 || "missing"}; received workSpec=${reportedWorkSpecHash || "missing"} corpus=${reportedCorpusSha256 || "missing"}`;
      const candidate = {
        ...artifactEvidence,
        workSpecHash: reportedWorkSpecHash,
        corpusSha256: reportedCorpusSha256,
        requirementsHash: intent?.requirementsHash || "",
        providerAttestationVerified,
        providerAttestationReason,
      };
      const verified = providerAttestationVerified && deliveryVerified && typeof io.verifyArtifact === "function"
        ? await safeCall(() => io.verifyArtifact(candidate, workSpec))
        : null;
      artifact = verified && !verified.__error && verified.verifiedSha256 === candidate.sha256
        ? { ...candidate, ...verified }
        : candidate;
    }
  }

  const honesty = deriveComputeArtifactHonesty({ lifecycle, artifact });
  let evaluation = prior?.evaluation?.source === "workspace-canonical" ? prior.evaluation : null;
  let evaluationPendingReason = "";

  // Paid training capacity is released before any workspace benchmark work.
  // Evaluation can take many model calls and must never extend provider billing.
  events.push(workspaceEvent(io, "compute-release-requested", runRef, "governed release of provider capacity"));
  await persist({ allocation, artifact, evaluation, dataset: dataEvidence });
  const released = await safeCall(() => adapter.release(ctx()));
  if (released?.__error) {
    events.push(workspaceEvent(io, "compute-release-failed", runRef, `release failed: ${released.__error} — capacity may still exist and cost may accrue`));
  } else {
    for (const event of Array.isArray(released) ? released : []) events.push(event);
  }
  let computeBlock = await persist({ allocation, artifact, evaluation, dataset: dataEvidence });
  lifecycle = deriveComputeLifecycle({
    events: computeBlock?.events,
    allocation: computeBlock?.allocation,
    checkpoints: computeBlock?.checkpoints,
  });

  if (honesty.promotable && !evaluation) {
    if (!lifecycle.releaseConfirmed) {
      evaluationPendingReason = "canonical evaluation waits until provider capacity release is confirmed";
    } else if (typeof io.evaluateArtifact === "function") {
      const evaluated = await safeCall(() => io.evaluateArtifact({ artifact, workSpec, intent, trainingRunId }));
      if (!evaluated?.__error && evaluated?.ok === true && evaluated?.evaluation?.source === "workspace-canonical") {
        evaluation = evaluated.evaluation;
      } else {
        evaluationPendingReason = str(evaluated?.reason || evaluated?.__error || "canonical evaluator returned no authoritative result");
      }
    } else {
      evaluationPendingReason = "workspace canonical evaluator is unavailable";
    }
    computeBlock = await persistMerged(io, computeBlock, {
      ...computeBlock,
      evaluation,
      evidenceObservedAt: nowIso(io),
    });
  }

  const ok = lifecycle.terminal === "completed" && honesty.promotable && lifecycle.releaseConfirmed;
  const summary = {
    providerId: selectedId,
    capacityProfileId,
    terminal: lifecycle.terminal,
    datasetDelivered: deliveryVerified,
    datasetDeliveryReason,
    artifactVerified: honesty.promotable,
    canonicalEvaluationPending: lifecycle.terminal === "completed" && honesty.promotable && !evaluation,
    canonicalEvaluationPromoted: evaluation?.benchmarkWins?.promoted === true,
    evaluationPendingReason,
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
      ...(ok ? {} : {
        error: lifecycle.terminal === "completed" && !deliveryVerified
          ? `provider completed but governed dataset delivery is unproven: ${datasetDeliveryReason || "no signed delivery receipt"}`
          : lifecycle.terminal === "completed" && honesty.promotable
            ? "artifact verified but provider capacity release is not confirmed"
            : lifecycle.terminal === "completed" ? honesty.reason : `provider compute ${lifecycle.terminal || "did not complete"}`,
      }),
      adapterMeta: { adapter: "provider-compute", providerId: selectedId, compute: summary },
    },
  };
}

export async function cancelProviderComputeRun({ priorCompute = null, provider = null, io = null } = {}) {
  if (!io || typeof io.getAdapter !== "function" || typeof io.now !== "function") {
    throw new Error("cancelProviderComputeRun: io.getAdapter and io.now required");
  }
  const prior = normalizeComputeBlock(priorCompute);
  if (!prior?.allocation) return { computeBlock: prior, cancelled: false, reason: "no allocation on record — nothing to cancel" };
  const adapter = io.getAdapter(provider?.adapterId || "");
  if (!adapter) return { computeBlock: prior, cancelled: false, reason: `adapter "${provider?.adapterId || ""}" not registered — capacity may still exist` };

  const runRef = prior.allocation.runRef;
  const ctx = baseCtx({
    io,
    provider,
    providerConfig: { ...(provider?.config || {}), providerId: provider?.providerId },
    requirements: prior.intent?.requirements,
    capacityProfileId: prior.capacityProfileId,
    trainingRunId: runRef.trainingRunId,
    idempotencyKeyHash: prior.idempotencyKeyHash,
    runRef,
    intent: prior.intent,
    workSpec: prior.workSpec,
  });
  let events = [...(prior.events || [])];
  const cancelEvents = await safeCall(() => adapter.cancel(ctx));
  if (cancelEvents?.__error) events.push(workspaceEvent(io, "compute-failed", runRef, `cancel failed: ${cancelEvents.__error}`));
  else for (const event of Array.isArray(cancelEvents) ? cancelEvents : []) events.push(event);
  let computeBlock = await persistMerged(io, prior, { ...prior, events, evidenceObservedAt: nowIso(io) });

  events = [...(computeBlock?.events || events)];
  events.push(workspaceEvent(io, "compute-release-requested", runRef, "release after cancellation"));
  computeBlock = await persistMerged(io, computeBlock, { ...computeBlock, events, evidenceObservedAt: nowIso(io) });
  const releaseEvents = await safeCall(() => adapter.release(ctx));
  events = [...(computeBlock?.events || events)];
  if (releaseEvents?.__error) events.push(workspaceEvent(io, "compute-release-failed", runRef, `release failed: ${releaseEvents.__error} — capacity may still exist and cost may accrue`));
  else for (const event of Array.isArray(releaseEvents) ? releaseEvents : []) events.push(event);
  computeBlock = await persistMerged(io, computeBlock, { ...computeBlock, events, evidenceObservedAt: nowIso(io) });

  const lifecycle = deriveComputeLifecycle({
    events: computeBlock?.events,
    allocation: computeBlock?.allocation,
    checkpoints: computeBlock?.checkpoints,
  });
  return {
    computeBlock,
    cancelled: lifecycle.terminal === "cancelled",
    releaseConfirmed: lifecycle.releaseConfirmed,
    capacityMayStillExist: lifecycle.capacityMayStillExist,
    costMayAccrue: lifecycle.costMayAccrue,
    reason: lifecycle.terminal !== "cancelled"
      ? "provider did not return verifiable cancellation evidence; capacity may still exist"
      : lifecycle.releaseConfirmed
        ? "cancelled and released"
        : "cancelled — release NOT confirmed; capacity may still exist and cost may accrue",
  };
}

export async function resumeProviderComputeRun({
  priorCompute = null,
  provider = null,
  checkpointId = "",
  io = null,
} = {}) {
  if (!io || typeof io.getAdapter !== "function" || typeof io.now !== "function") {
    throw new Error("resumeProviderComputeRun: io.getAdapter and io.now required");
  }
  const prior = normalizeComputeBlock(priorCompute);
  const lifecycle = deriveComputeLifecycle({
    events: prior?.events,
    allocation: prior?.allocation,
    checkpoints: prior?.checkpoints,
  });
  const checkpoint = lifecycle.provenCheckpoints.find((item) => item.checkpointId === str(checkpointId));
  if (!checkpoint) return { computeBlock: prior, resumed: false, reason: "checkpoint is missing, unproven, or foreign to this run" };
  if (checkpoint.workSpecHash !== prior.workSpecHash) return { computeBlock: prior, resumed: false, reason: "checkpoint work-spec lineage mismatch" };
  if (prior?.capabilities?.supportsResume !== true) return { computeBlock: prior, resumed: false, reason: "selected provider does not support resume" };
  const adapter = io.getAdapter(provider?.adapterId || "");
  if (!adapter || typeof adapter.resume !== "function") return { computeBlock: prior, resumed: false, reason: "provider resume operation unavailable" };

  const previousRef = prior.allocation?.runRef;
  const resumeHash = resumeIdempotencyHash({
    trainingRunId: previousRef?.trainingRunId,
    capacityProfileId: prior.capacityProfileId,
    providerId: prior.providerRegistryId,
    workSpecHash: prior.workSpecHash,
    checkpointId: checkpoint.checkpointId,
  });
  const requestedRef = { ...previousRef, providerResourceId: "" };
  let events = [...(prior.events || [])];
  events.push(workspaceEvent(
    io,
    "compute-requested",
    requestedRef,
    `durable resume request from checkpoint ${checkpoint.checkpointId}; idempotency ${resumeHash.slice(0, 12)}`,
    `workspace:resume-request:${resumeHash}`,
  ));
  let computeBlock = await persistMerged(io, prior, {
    ...prior,
    idempotencyKeyHash: resumeHash,
    events,
    evidenceObservedAt: nowIso(io),
  });

  const ctx = baseCtx({
    io,
    provider,
    providerConfig: { ...(provider?.config || {}), providerId: provider?.providerId },
    requirements: prior.intent?.requirements,
    capacityProfileId: prior.capacityProfileId,
    trainingRunId: previousRef?.trainingRunId,
    idempotencyKeyHash: resumeHash,
    runRef: previousRef,
    intent: prior.intent,
    workSpec: prior.workSpec,
  });
  const resumedEvents = await safeCall(() => adapter.resume(ctx, checkpoint));
  if (resumedEvents?.__error) return { computeBlock, resumed: false, reason: resumedEvents.__error };
  const returned = Array.isArray(resumedEvents) ? resumedEvents : [];
  const resumeRef = returned.find((event) => str(event?.runRef?.providerResourceId))?.runRef || previousRef;
  const resourceId = str(resumeRef?.providerResourceId);
  if (!resourceId) return { computeBlock, resumed: false, reason: "provider resume returned no active resource identity — resume remains unproven" };

  const activeAllocation = {
    ...(prior.allocation || {}),
    allocationId: resourceId,
    runRef: { ...resumeRef, providerResourceId: resourceId },
    status: "allocated",
    idempotencyKeyHash: resumeHash,
    requestedAt: nowIso(io),
    allocatedAt: nowIso(io),
    releasedAt: "",
    releaseConfirmed: false,
    workSpecHash: prior.workSpecHash,
  };
  events = [...(computeBlock?.events || events)];
  events.push({
    ...workspaceEvent(
      io,
      "compute-allocated",
      activeAllocation.runRef,
      `resume attempt allocation ${resourceId} adopted`,
      `workspace:resume-allocation:${resourceId}`,
    ),
    source: "provider",
    workSpecHash: prior.workSpecHash,
    requirementsHash: prior.requirementsHash,
  });
  for (const event of returned) events.push({ ...event, workSpecHash: prior.workSpecHash, requirementsHash: prior.requirementsHash });
  computeBlock = await persistMerged(io, computeBlock, {
    ...computeBlock,
    idempotencyKeyHash: resumeHash,
    allocation: activeAllocation,
    events,
    evidenceObservedAt: nowIso(io),
  });
  const resumedLifecycle = deriveComputeLifecycle({
    events: computeBlock?.events,
    allocation: computeBlock?.allocation,
    checkpoints: computeBlock?.checkpoints,
  });
  return {
    computeBlock,
    resumed: resumedLifecycle.resumed,
    reason: resumedLifecycle.resumed
      ? "resume submitted from proven checkpoint and active resource adopted"
      : "provider resume response did not produce verifiable resumed lifecycle evidence",
  };
}

function refusal(prior, message, reasonCode = "authority-refused") {
  return {
    localFallthrough: false,
    computeBlock: prior,
    result: {
      ok: false,
      exitCode: null,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: message,
      adapterMeta: { adapter: "provider-compute", compute: { authorityRefused: true, reasonCode } },
    },
  };
}

/** A repeated run against an active allocation is an observation continuation. */
export async function maybeExecuteProviderComputeForSandboxRun({
  workspaceConfig = null,
  objectId = "",
  name = "",
  action = "run",
  checkpointId = "",
  io = null,
} = {}) {
  if (str(objectId) !== "model-training-runner") return null;
  const trainingRunId = str(name).trim();
  if (!trainingRunId) return null;
  const row = findTrainingRunReceiptRow(workspaceConfig, trainingRunId);
  if (!row) return null;
  const prior = parseReceiptComputeBlock(row);

  if (action === "cancel") {
    if (!prior?.providerRegistryId) return refusal(prior, "no remote compute provider is recorded for this run", "provider-missing");
    const providersState = deriveComputeProviders({
      workspaceConfig,
      registeredAdapterIds: typeof io?.listAdapterIds === "function" ? io.listAdapterIds() : [],
      envPresent: io?.envPresent || (() => false),
      preflight: row.preflight || null,
    });
    const provider = providersState.providers.find((item) => item.providerId === prior.providerRegistryId);
    if (!provider) return refusal(prior, "recorded compute provider no longer exists", "provider-missing");
    const controlled = await cancelProviderComputeRun({ priorCompute: prior, provider, io });
    return {
      localFallthrough: false,
      computeBlock: controlled.computeBlock,
      result: {
        ok: controlled.cancelled,
        exitCode: controlled.cancelled ? 0 : 1,
        durationMs: 0,
        stdout: JSON.stringify({ action, reason: controlled.reason }),
        stderr: "",
        ...(controlled.cancelled ? {} : { error: controlled.reason }),
        adapterMeta: { adapter: "provider-compute", providerId: prior.providerRegistryId, action },
      },
    };
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
  if (!request) return null;
  if (request.policy.mode === "local" || request.policy.localOnly === true) return null;

  if (typeof io?.materializeDataset !== "function") {
    return refusal(prior, "compute dataset materializer unavailable — remote execution requires server-owned corpus bytes", "dataset-materializer-unavailable");
  }
  const stagedDataset = await io.materializeDataset({ trainingRunId, request });
  if (!stagedDataset?.ok || !stagedDataset.manifest) {
    return refusal(prior, `compute dataset materialization failed (${str(stagedDataset?.reasonCode) || "unknown"}): ${str(stagedDataset?.reason) || "no detail"}`, str(stagedDataset?.reasonCode) || "dataset-materialization-failed");
  }

  if (typeof io?.compileAuthority !== "function") {
    return refusal(prior, "compute authority compiler unavailable — remote-capable compute is refused without server-owned authority", "authority-compiler-unavailable");
  }
  const compiled = await io.compileAuthority({ trainingRunId, request, datasetManifest: stagedDataset.manifest });
  if (!compiled?.ok || !compiled.authority) {
    return refusal(
      prior,
      `compute authority compilation failed (${str(compiled?.reasonCode) || "unknown"}): ${str(compiled?.reason) || "no detail"}`,
      str(compiled?.reasonCode) || "authority-compile-failed",
    );
  }
  if (str(compiled.keySource) === "ephemeral") {
    return refusal(
      prior,
      "compute authority is sealed with a per-process ephemeral key — remote execution requires GROWTHUB_COMPUTE_AUTHORITY_KEY or GROWTHUB_WORKSPACE_SIGNING_KEY",
      "authority-key-ephemeral",
    );
  }
  const authority = compiled.authority;

  if (prior?.authority) {
    if (typeof io.verifyAuthority !== "function") {
      return refusal(prior, "compute authority verifier unavailable — refusing to supersede journaled authority", "authority-verifier-unavailable");
    }
    const verdict = await io.verifyAuthority(prior.authority, stagedDataset.manifest);
    if (!verdict || verdict.contentMatches !== true) {
      return refusal(
        prior,
        `governed inputs changed after compute authority was sealed (${str(verdict?.reasonCode) || "unreproducible"}) — refusing before provider submission; prepare a new governed run`,
        str(verdict?.reasonCode) || "authority-drift",
      );
    }
  }

  if (action === "resume") {
    if (!prior?.providerRegistryId) return refusal(prior, "no remote compute provider is recorded for this run", "provider-missing");
    const providersState = deriveComputeProviders({
      workspaceConfig,
      registeredAdapterIds: typeof io.listAdapterIds === "function" ? io.listAdapterIds() : [],
      envPresent: io.envPresent || (() => false),
      preflight: row.preflight || null,
    });
    const provider = providersState.providers.find((item) => item.providerId === prior.providerRegistryId);
    if (!provider) return refusal(prior, "recorded compute provider no longer exists", "provider-missing");
    const controlled = await resumeProviderComputeRun({ priorCompute: prior, provider, checkpointId, io });
    return {
      localFallthrough: false,
      computeBlock: controlled.computeBlock,
      result: {
        ok: controlled.resumed,
        exitCode: controlled.resumed ? 0 : 1,
        durationMs: 0,
        stdout: JSON.stringify({ action, reason: controlled.reason }),
        stderr: "",
        ...(controlled.resumed ? {} : { error: controlled.reason }),
        adapterMeta: { adapter: "provider-compute", providerId: prior.providerRegistryId, action },
      },
    };
  }

  if (typeof io?.issueDatasetAccess !== "function") {
    return refusal(prior, "compute dataset grant issuer unavailable — remote provider cannot receive governed corpus bytes", "dataset-access-unavailable");
  }
  const grant = await io.issueDatasetAccess({
    manifest: stagedDataset.manifest,
    trainingRunId,
    workSpecHash: authority.workSpecHash,
    priorEvidence: prior?.dataset || null,
  });
  if (!grant?.ok || !grant.access || !grant.evidence) {
    return refusal(prior, `compute dataset access failed (${str(grant?.reasonCode) || "unknown"}): ${str(grant?.reason) || "no detail"}`, str(grant?.reasonCode) || "dataset-access-failed");
  }

  const outcome = await executeProviderComputeRun({
    workspaceConfig,
    trainingRunId,
    computeAsk: {
      capacityProfileId: request.capacityProfileId,
      providerRegistryId: request.providerRegistryId,
      selectionMode: request.selectionMode,
      policy: request.policy,
    },
    preflight: row.preflight && typeof row.preflight === "object" ? row.preflight : null,
    budget: request.policy.budget,
    priorCompute: prior,
    requireAuthority: true,
    authority,
    datasetAccess: grant.access,
    datasetEvidence: { ...grant.evidence, manifestHash: stagedDataset.manifest.manifestHash, exportId: stagedDataset.manifest.exportId },
    io,
  });
  if (outcome.localFallthrough) return null;
  return outcome;
}
