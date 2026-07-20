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
} from "./compute-evidence.js";
import { deriveComputeRequirements, resolveCapacityProfileForRequirements } from "./compute-capacity-profiles.js";
import { LOCAL_PROVIDER_ID } from "./compute-provider-registry.js";

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
  let compute = row?.compute;
  if (typeof compute === "string") {
    try { compute = JSON.parse(compute); } catch { compute = null; }
  }
  return normalizeComputeBlock(compute);
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
      return {
        ...row,
        ...(statusOverride ? { status: statusOverride } : {}),
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
  io = null,
} = {}) {
  if (!io || typeof io.getAdapter !== "function" || typeof io.now !== "function") {
    throw new Error("executeProviderComputeRun: io.getAdapter and io.now are required");
  }
  const ask = computeAsk && typeof computeAsk === "object" ? computeAsk : {};
  const events = [];
  const checkpoints = [];

  // 1. Requirements + Capacity Profile.
  const req = requirements && typeof requirements === "object"
    ? requirements
    : deriveComputeRequirements({ preflight, workloadKind: "fine-tune" });
  const capacityProfileId = str(ask.capacityProfileId).trim() || resolveCapacityProfileForRequirements(req).profile.id;

  // 2. Providers + capabilities + quotes.
  const providersState = deriveComputeProviders({
    workspaceConfig,
    registeredAdapterIds: typeof io.listAdapterIds === "function" ? io.listAdapterIds() : [],
    envPresent: io.envPresent || (() => false),
    preflight,
  });
  const capabilitiesById = {};
  const quotesById = {};
  for (const provider of providersState.providers) {
    if (provider.status !== "ready") continue;
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
    budget,
    selectionMode: ask.selectionMode === "explicit" ? "explicit" : "auto",
    pinnedProviderId: str(ask.providerRegistryId).trim(),
    now: io.now(),
  });

  const selectedId = decision.selectedProviderId;
  if (!selectedId) {
    const reasons = decision.candidates.filter((c) => !c.eligible).map((c) => `${c.providerId}: ${c.reasons.join("; ")}`);
    return {
      localFallthrough: false,
      computeBlock: normalizeComputeBlock({ capacityProfileId, selectionMode: decision.selectionMode, decision, events, evidenceObservedAt: eventNow(io) }),
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
    return { localFallthrough: true, computeBlock: normalizeComputeBlock({ capacityProfileId, selectionMode: decision.selectionMode, decision, evidenceObservedAt: eventNow(io) }), result: null };
  }

  const provider = providersState.providers.find((p) => p.providerId === selectedId);
  const adapter = io.getAdapter(provider.adapterId);
  const providerConfig = { ...(provider.config || {}), providerId: provider.providerId, preflight };

  // 4. Deterministic allocation identity + replay protection.
  const { hash: idempotencyKeyHash } = computeIdempotencyKey({ trainingRunId, attempt, capacityProfileId, providerId: selectedId });
  const prior = normalizeComputeBlock(priorCompute);
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
    events,
    checkpoints,
    evidenceObservedAt: eventNow(io),
    ...extra,
  });

  // 5. Allocate + verify allocation evidence.
  const ctx = baseCtx({ io, provider, providerConfig, req, capacityProfileId, trainingRunId, idempotencyKeyHash, runRef });
  const allocation = await safeCall(() => adapter.allocate(ctx));
  if (allocation?.__error || !allocation || allocation.status === "failed" || !str(allocation.allocationId).trim()) {
    const reason = allocation?.__error || allocation?.error || "provider did not return a verifiable allocation";
    events.push(workspaceEvent(io, "compute-failed", runRef, `allocation failed: ${reason}`));
    return {
      localFallthrough: false,
      computeBlock: block({ allocation: allocation?.__error ? null : allocation }),
      result: { ok: false, exitCode: null, durationMs: io.now() - startedMs, stdout: "", stderr: "", error: `compute allocation failed: ${reason}`, adapterMeta: { adapter: "provider-compute", providerId: selectedId } },
    };
  }
  runRef.providerResourceId = str(allocation.runRef?.providerResourceId || allocation.allocationId);
  events.push({ ...workspaceEvent(io, "compute-allocated", runRef, `allocation ${allocation.allocationId} verified`), source: "provider" });

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
        events.push(event);
        if (event?.type === "checkpoint-created" && event?.checkpoint) checkpoints.push(event.checkpoint);
      }
    }
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
    if (!collected?.__error) artifact = collected;
  }
  const honesty = deriveComputeArtifactHonesty({ lifecycle, artifact });

  // 8. Release — always attempted, failure stays visible.
  events.push(workspaceEvent(io, "compute-release-requested", runRef, "governed release of provider capacity"));
  const released = await safeCall(() => adapter.release(ctx));
  if (released?.__error) {
    events.push({ ...workspaceEvent(io, "compute-release-failed", runRef, `release failed: ${released.__error} — capacity may still exist and cost may accrue`), source: "workspace" });
  } else {
    for (const event of Array.isArray(released) ? released : []) events.push(event);
  }
  lifecycle = deriveComputeLifecycle({ events, allocation, checkpoints });

  const computeBlock = block({ allocation, artifact });
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

  events.push(workspaceEvent(io, "compute-release-requested", runRef, "release after cancellation"));
  const releaseEvents = await safeCall(() => adapter.release(ctx));
  if (releaseEvents?.__error) {
    events.push(workspaceEvent(io, "compute-release-failed", runRef, `release failed: ${releaseEvents.__error} — capacity may still exist and cost may accrue`));
  } else {
    for (const e of Array.isArray(releaseEvents) ? releaseEvents : []) events.push(e);
  }
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

function baseCtx({ io, provider, providerConfig, req, capacityProfileId, trainingRunId, idempotencyKeyHash, runRef = null }) {
  return {
    runRef: runRef || { trainingRunId: str(trainingRunId), modelTrainingRowId: "", providerId: str(provider?.providerId), capacityProfileId: str(capacityProfileId), providerResourceId: "" },
    requirements: req,
    capacityProfileId: str(capacityProfileId),
    idempotencyKeyHash: str(idempotencyKeyHash),
    providerConfig: providerConfig || {},
    resolveEnv: typeof io.resolveEnv === "function" ? io.resolveEnv : () => "",
    fetchJson: typeof io.fetchJson === "function" ? io.fetchJson : async () => { throw new Error("fetchJson not provided"); },
  };
}

/**
 * Route hook: decide whether this sandbox run is a provider-compute run and
 * execute it if so. Returns null to FALL THROUGH to the existing local path
 * unchanged (the default for every pre-compute workspace). Applicability is
 * evidence-based: the governed receipt must carry a compute ask.
 */
export async function maybeExecuteProviderComputeForSandboxRun({ workspaceConfig = null, objectId = "", name = "", io = null } = {}) {
  if (str(objectId) !== "model-training-runner") return null;
  const trainingRunId = str(name).trim();
  if (!trainingRunId) return null;
  const row = findTrainingRunReceiptRow(workspaceConfig, trainingRunId);
  if (!row) return null;
  const prior = parseReceiptComputeBlock(row);
  const ask = prior && (prior.capacityProfileId || prior.providerRegistryId)
    ? { capacityProfileId: prior.capacityProfileId, providerRegistryId: prior.providerRegistryId, selectionMode: prior.selectionMode }
    : null;
  if (!ask) return null; // no compute ask → existing local behavior, byte-for-byte
  const preflight = row.preflight && typeof row.preflight === "object" ? row.preflight : null;
  const outcome = await executeProviderComputeRun({
    workspaceConfig,
    trainingRunId,
    computeAsk: ask,
    preflight,
    budget: prior?.decision?.budget || null,
    priorCompute: prior,
    io,
  });
  if (outcome.localFallthrough) return null;
  return outcome;
}
