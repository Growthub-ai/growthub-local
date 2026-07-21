/**
 * Compute evidence — Sprints 4–5 of the Governed Compute Realization. Pure:
 * no React, no fetch, no fs, no clock. The evidence layer that makes remote
 * compute honest:
 *
 *   - the additive `compute` block a `model-training-run` receipt carries
 *     (mirroring the `distillation` block precedent exactly — optional,
 *     normalized, pre-compute receipts entirely unaffected);
 *   - the 12 normalized compute events and the EVIDENCE-GATED lifecycle
 *     fold: a provider event may advance state ONLY when supported by
 *     actual evidence (allocation id before "allocated", an applied
 *     allocation before "running", a proven checkpoint before "resuming",
 *     a running state before "completed"). A stale, out-of-order, or forged
 *     event is REFUSED and recorded as refused — never silently applied,
 *     never silently dropped;
 *   - deterministic allocation identity (idempotency key) so a replayed
 *     governed request can never silently allocate duplicate capacity;
 *   - artifact honesty: provider "completed" with no artifact identity (or
 *     the wrong hash) is non-promotable, with the reason named;
 *   - release honesty: every terminal state answers "may capacity still
 *     exist / may cost still accrue?" explicitly.
 */

import { sha256Hex } from "./compute-work-spec.js";

/** Runtime mirrors of the shared contract (tested for equality). */
export const COMPUTE_EVENT_TYPES = [
  "compute-requested",
  "compute-queued",
  "compute-allocated",
  "compute-running",
  "checkpoint-created",
  "compute-resuming",
  "compute-completed",
  "compute-failed",
  "compute-cancelled",
  "compute-release-requested",
  "compute-released",
  "compute-release-failed",
];
export const COMPUTE_EVIDENCE_SCHEMA = "growthub-compute-evidence-v1";
export const COMPUTE_DECISION_SCHEMA = "growthub-compute-decision-v1";

const MAX_EVENTS = 200;
const MAX_CHECKPOINTS = 50;

function str(v) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Parse a receipt column that stores an object either inline or as a JSON
 * string (the Data Model grid convention). Returns null for anything that
 * is not (or does not parse to) a plain object. Shared by the execution
 * seam and the authority compiler so both read columns identically.
 */
export function parseJsonColumn(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Deterministic allocation identity
// ---------------------------------------------------------------------------

/**
 * The deterministic idempotency key for one governed allocation request.
 * Same governed request (same run, attempt, profile, provider, AND sealed
 * workload identity) → same key → the execution seam can refuse a silent
 * duplicate allocation. Binding `workSpecHash` in means a changed work spec
 * mints a different identity, so provider-native reconciliation can never
 * adopt a resource that was created for a different workload. `attempt` is
 * incremented ONLY by an explicit governed retry decision, never by a
 * network replay.
 */
export function computeIdempotencyKey({ trainingRunId = "", attempt = 1, capacityProfileId = "", providerId = "", workSpecHash = "" } = {}) {
  const canonical = `${str(trainingRunId)}|${Math.max(1, Math.floor(num(attempt, 1)))}|${str(capacityProfileId)}|${str(providerId)}|${str(workSpecHash)}`;
  return { key: canonical, hash: sha256Hex(canonical) };
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

export function normalizeComputeRunRef(ref) {
  const r = ref && typeof ref === "object" ? ref : {};
  return {
    trainingRunId: str(r.trainingRunId).trim(),
    modelTrainingRowId: str(r.modelTrainingRowId).trim(),
    providerId: str(r.providerId).trim(),
    capacityProfileId: str(r.capacityProfileId).trim(),
    providerResourceId: str(r.providerResourceId).trim(),
  };
}

/** Normalize one compute event; null for an unrecognizable one. */
export function normalizeComputeEvent(raw) {
  const e = raw && typeof raw === "object" ? raw : null;
  if (!e) return null;
  const type = str(e.type).trim();
  if (!COMPUTE_EVENT_TYPES.includes(type)) return null;
  return {
    type,
    at: str(e.at).trim(),
    evidenceObservedAt: str(e.evidenceObservedAt).trim(),
    source: ["provider", "workspace", "operator"].includes(e.source) ? e.source : "workspace",
    runRef: normalizeComputeRunRef(e.runRef),
    providerEventId: str(e.providerEventId).trim(),
    detail: str(e.detail).slice(0, 500),
    workSpecHash: str(e.workSpecHash).trim(),
    requirementsHash: str(e.requirementsHash).trim(),
  };
}

/** Normalize a checkpoint ref. `resumable` is DERIVED from identity proof. */
export function normalizeComputeCheckpoint(raw) {
  const c = raw && typeof raw === "object" ? raw : {};
  const locator = str(c.locator || c.path).trim();
  const sha256 = str(c.sha256).trim();
  return {
    checkpointId: str(c.checkpointId).trim(),
    runRef: normalizeComputeRunRef(c.runRef),
    locator,
    sha256,
    step: Math.max(0, Math.floor(num(c.step))),
    sizeBytes: Math.max(0, Math.floor(num(c.sizeBytes))),
    createdAt: str(c.createdAt).trim(),
    evidenceObservedAt: str(c.evidenceObservedAt).trim(),
    workSpecHash: str(c.workSpecHash).trim(),
    // A checkpoint with no locator or no content identity cannot be resumed
    // from — a CLAIMED checkpoint is not a proven one.
    resumable: Boolean(locator && sha256),
  };
}

export function normalizeComputeAllocation(raw) {
  if (!raw || typeof raw !== "object") return null;
  const statuses = ["requested", "queued", "allocated", "running", "completed", "failed", "cancelled", "release-pending", "released", "release-failed"];
  const basis = raw.costBasis && typeof raw.costBasis === "object" ? raw.costBasis : {};
  return {
    allocationId: str(raw.allocationId).trim(),
    runRef: normalizeComputeRunRef(raw.runRef),
    status: statuses.includes(raw.status) ? raw.status : "requested",
    idempotencyKeyHash: str(raw.idempotencyKeyHash).trim(),
    availabilityMode: str(raw.availabilityMode).trim(),
    costBasis: {
      kind: ["per-second", "per-hour", "per-job", "owned-hardware", "unknown"].includes(basis.kind) ? basis.kind : "unknown",
      unitUsd: Math.max(0, num(basis.unitUsd)),
      source: str(basis.source),
    },
    requestedAt: str(raw.requestedAt).trim(),
    allocatedAt: str(raw.allocatedAt).trim(),
    releasedAt: str(raw.releasedAt).trim(),
    releaseConfirmed: raw.releaseConfirmed === true,
    allocated: raw.allocated && typeof raw.allocated === "object"
      ? { gpuType: str(raw.allocated.gpuType), gpuCount: Math.max(0, Math.floor(num(raw.allocated.gpuCount))), workers: Math.max(0, Math.floor(num(raw.allocated.workers))), region: str(raw.allocated.region) }
      : null,
    workSpecHash: str(raw.workSpecHash).trim(),
  };
}

export function normalizeComputeArtifactRef(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    runRef: normalizeComputeRunRef(raw.runRef),
    kind: str(raw.kind).trim() || "gguf",
    locator: str(raw.locator || raw.path).trim(),
    sha256: str(raw.sha256).trim(),
    sizeBytes: Math.max(0, Math.floor(num(raw.sizeBytes))),
    evidenceObservedAt: str(raw.evidenceObservedAt).trim(),
    workSpecHash: str(raw.workSpecHash).trim(),
    requirementsHash: str(raw.requirementsHash).trim(),
    verifiedSha256: str(raw.verifiedSha256).trim(),
    verificationKind: str(raw.verificationKind).trim(),
    evaluationResults: Array.isArray(raw.evaluationResults) ? raw.evaluationResults : [],
  };
}

/**
 * Normalize the additive `compute` receipt block. Every field optional; a
 * receipt with no compute evidence carries `null` so pre-compute receipts
 * and readers are entirely unaffected (the `distillation` block precedent).
 */
export function normalizeComputeBlock(raw) {
  if (!raw || typeof raw !== "object") return null;
  const decision = raw.decision && typeof raw.decision === "object" && raw.decision.schema === COMPUTE_DECISION_SCHEMA ? raw.decision : null;
  return {
    schema: COMPUTE_EVIDENCE_SCHEMA,
    capacityProfileId: str(raw.capacityProfileId).trim(),
    providerRegistryId: str(raw.providerRegistryId).trim(),
    selectionMode: raw.selectionMode === "explicit" ? "explicit" : "auto",
    idempotencyKeyHash: str(raw.idempotencyKeyHash).trim(),
    // The SERVER-compiled sealed authority envelope (growthub-compute-
    // authority-v1). Carried verbatim as evidence; it is never trusted from
    // this store — the execution seam recompiles and checks the seal
    // (lib/compute-authority.js) before any provider boundary.
    authority: raw.authority && typeof raw.authority === "object" ? raw.authority : null,
    authorityHash: str(raw.authorityHash || raw.authority?.authorityHash).trim(),
    authorityKeyId: str(raw.authorityKeyId || raw.authority?.keyId).trim(),
    intent: raw.intent && typeof raw.intent === "object" ? raw.intent : (raw.authority?.intent || null),
    intentHash: str(raw.intentHash || raw.intent?.intentHash || raw.authority?.intentHash).trim(),
    requirementsHash: str(raw.requirementsHash || raw.intent?.requirementsHash || raw.authority?.requirementsHash).trim(),
    workSpec: raw.workSpec && typeof raw.workSpec === "object" ? raw.workSpec : (raw.authority?.workSpec || null),
    workSpecHash: str(raw.workSpecHash || raw.workSpec?.workSpecHash || raw.authority?.workSpecHash).trim(),
    policy: raw.policy && typeof raw.policy === "object" ? raw.policy : (raw.intent?.policy || raw.authority?.intent?.policy || null),
    capabilities: raw.capabilities && typeof raw.capabilities === "object" ? raw.capabilities : null,
    evaluation: raw.evaluation && typeof raw.evaluation === "object" ? raw.evaluation : null,
    decision,
    allocation: normalizeComputeAllocation(raw.allocation),
    events: (Array.isArray(raw.events) ? raw.events : []).map(normalizeComputeEvent).filter(Boolean).slice(0, MAX_EVENTS),
    checkpoints: (Array.isArray(raw.checkpoints) ? raw.checkpoints : []).map(normalizeComputeCheckpoint).slice(0, MAX_CHECKPOINTS),
    artifact: normalizeComputeArtifactRef(raw.artifact),
    evidenceObservedAt: str(raw.evidenceObservedAt).trim(),
  };
}

// ---------------------------------------------------------------------------
// Evidence-gated lifecycle fold
// ---------------------------------------------------------------------------

/**
 * Fold a compute event stream into the lifecycle state, refusing every
 * advance the evidence does not support. Pure, order-respecting (the caller
 * appends events as observed; the fold judges each in sequence).
 *
 * Gates (the forged/stale-event defenses):
 *   - compute-allocated requires a provider resource id (allocation
 *     evidence) on the event or a matching allocation record;
 *   - compute-running requires an APPLIED allocation — a "running" claim
 *     with no allocation behind it is forged and refused;
 *   - checkpoint-created is applied but marks the checkpoint unproven when
 *     identity (locator+sha256) is missing;
 *   - compute-resuming requires a PROVEN checkpoint;
 *   - compute-completed requires an applied running state — a bare
 *     "completed" with no run behind it is forged and refused;
 *   - compute-released requires a release request or terminal state; only a
 *     release event CONFIRMS release;
 *   - duplicate providerEventIds are refused as replays.
 *
 * @returns {{
 *   status: string, releaseConfirmed: boolean, capacityMayStillExist: boolean,
 *   costMayAccrue: boolean, applied: object[], refused: {event, reason}[],
 *   checkpoints: object[], provenCheckpoints: object[], resumed: boolean
 * }}
 */
export function deriveComputeLifecycle({ events = [], allocation = null, checkpoints = [] } = {}) {
  const alloc = normalizeComputeAllocation(allocation);
  const applied = [];
  const refused = [];
  const seenProviderEventIds = new Set();
  // Checkpoints must belong to THIS run: a checkpoint stamped with a
  // different trainingRunId can never satisfy a resume for this one (the
  // wrong-checkpoint defense). Unstamped checkpoints only count when the
  // run identity is unknowable on either side.
  const runId = str(alloc?.runRef?.trainingRunId)
    || str((Array.isArray(events) ? events : []).map((e) => e?.runRef?.trainingRunId).find(Boolean));
  const allCheckpoints = (Array.isArray(checkpoints) ? checkpoints : [])
    .map(normalizeComputeCheckpoint)
    .map((c) => (runId && c.runRef.trainingRunId && c.runRef.trainingRunId !== runId
      ? { ...c, resumable: false, foreignRun: true }
      : c));

  let status = "none";
  let allocated = false;
  let running = false;
  let releaseRequested = false;
  let releaseConfirmed = false;
  let releaseFailed = false;
  let resumed = false;
  let terminal = "";

  const refuse = (event, reason) => refused.push({ event, reason });
  const apply = (event, next) => { applied.push(event); if (next) status = next; };

  for (const raw of Array.isArray(events) ? events : []) {
    const event = normalizeComputeEvent(raw);
    if (!event) { refuse(raw, "unrecognized event shape or non-normalized type"); continue; }
    if (event.providerEventId && seenProviderEventIds.has(event.providerEventId)) {
      refuse(event, `duplicate provider event id "${event.providerEventId}" — replay refused`);
      continue;
    }
    if (event.providerEventId) seenProviderEventIds.add(event.providerEventId);

    switch (event.type) {
      case "compute-requested":
        if (terminal && allCheckpoints.some((c) => c.resumable)) {
          terminal = "";
          running = false;
          releaseRequested = false;
          releaseConfirmed = false;
          releaseFailed = false;
        }
        apply(event, "requested");
        break;
      case "compute-queued":
        if (status === "none") { refuse(event, "queued before any governed request"); break; }
        apply(event, terminal ? status : "queued");
        break;
      case "compute-allocated": {
        const resourceId = event.runRef.providerResourceId || alloc?.allocationId || "";
        if (!resourceId) { refuse(event, "allocation claimed without allocation evidence (no provider resource id, no allocation record)"); break; }
        if (terminal) { refuse(event, `allocation event after terminal state "${terminal}"`); break; }
        allocated = true;
        apply(event, "allocated");
        break;
      }
      case "compute-running":
        if (!allocated) { refuse(event, "running claimed with no applied allocation — forged or out-of-order event refused"); break; }
        if (terminal) { refuse(event, `running event after terminal state "${terminal}"`); break; }
        running = true;
        apply(event, "running");
        break;
      case "checkpoint-created": {
        if (!running && !allocated) { refuse(event, "checkpoint claimed before any allocated/running state"); break; }
        apply(event, status);
        break;
      }
      case "compute-resuming": {
        const proven = allCheckpoints.some((c) => c.resumable);
        if (!proven) { refuse(event, "resume claimed with no proven checkpoint (locator + sha256 required)"); break; }
        if (terminal) { refuse(event, `resume after terminal state "${terminal}"`); break; }
        resumed = true;
        running = true;
        apply(event, "running");
        break;
      }
      case "compute-completed":
        if (!running) { refuse(event, "completion claimed with no applied running state — forged completion refused"); break; }
        terminal = "completed";
        apply(event, "completed");
        break;
      case "compute-failed":
        if (status === "none") { refuse(event, "failure claimed before any governed request"); break; }
        terminal = "failed";
        apply(event, "failed");
        break;
      case "compute-cancelled":
        if (status === "none") { refuse(event, "cancellation claimed before any governed request"); break; }
        terminal = "cancelled";
        apply(event, "cancelled");
        break;
      case "compute-release-requested":
        if (!allocated) { refuse(event, "release requested with no allocation to release"); break; }
        releaseRequested = true;
        apply(event, terminal || "release-pending");
        break;
      case "compute-released":
        if (!allocated) { refuse(event, "release confirmed with no allocation on record"); break; }
        releaseConfirmed = true;
        releaseFailed = false;
        apply(event, terminal || "released");
        break;
      case "compute-release-failed":
        if (!allocated) { refuse(event, "release failure reported with no allocation on record"); break; }
        releaseFailed = true;
        apply(event, terminal || "release-failed");
        break;
      default:
        refuse(event, `unhandled event type "${event.type}"`);
    }
  }

  // Release honesty: capacity may still exist whenever an allocation was
  // applied and release was never CONFIRMED — including release-failed and
  // "completed but nobody released". Cost may accrue whenever that capacity
  // is not owned hardware.
  const capacityMayStillExist = allocated && !releaseConfirmed;
  const owned = alloc?.costBasis?.kind === "owned-hardware";
  const costMayAccrue = capacityMayStillExist && !owned;

  return {
    status,
    terminal,
    releaseRequested,
    releaseConfirmed,
    releaseFailed,
    capacityMayStillExist,
    costMayAccrue,
    applied,
    refused,
    checkpoints: allCheckpoints,
    provenCheckpoints: allCheckpoints.filter((c) => c.resumable),
    resumed,
  };
}

// ---------------------------------------------------------------------------
// Artifact honesty
// ---------------------------------------------------------------------------

/**
 * Judge whether a compute run's completion is PROMOTABLE toward the existing
 * artifact/evaluation ladder. A provider "completed" status is never a
 * verified artifact:
 *   - completed + no artifact ref            → non-promotable (artifact-missing)
 *   - completed + artifact without sha256    → non-promotable (artifact-unproven)
 *   - completed + expectedSha256 mismatch    → non-promotable (artifact-hash-mismatch)
 * The final import floors remain deriveArtifactState() — this gate runs
 * BEFORE it and can only refuse, never bless.
 */
export function deriveComputeArtifactHonesty({ lifecycle = null, artifact = null, expectedSha256 = "" } = {}) {
  const life = lifecycle && typeof lifecycle === "object" ? lifecycle : { terminal: "" };
  const art = normalizeComputeArtifactRef(artifact);
  if (life.terminal !== "completed") {
    return { promotable: false, reasonCode: "run-not-completed", reason: `run is not completed (${life.terminal || life.status || "no lifecycle"}) — nothing to promote` };
  }
  if (!art || !art.locator) {
    return { promotable: false, reasonCode: "artifact-missing", reason: "provider reports completed but no artifact was returned — non-promotable" };
  }
  if (!art.sha256) {
    return { promotable: false, reasonCode: "artifact-unproven", reason: "artifact has no sha256 identity — a claimed artifact is not a verified one" };
  }
  const expected = str(expectedSha256).trim();
  if (expected && expected !== art.sha256) {
    return { promotable: false, reasonCode: "artifact-hash-mismatch", reason: `artifact sha256 ${art.sha256.slice(0, 12)}… does not match the expected ${expected.slice(0, 12)}… — non-promotable` };
  }
  if (!art.verifiedSha256 || art.verifiedSha256 !== art.sha256) {
    return { promotable: false, reasonCode: "artifact-bytes-unverified", reason: "artifact bytes were not verified by the canonical materialization/storage boundary — non-promotable" };
  }
  return { promotable: true, reasonCode: "", reason: "artifact identity present — eligible for the existing import/verification/evaluation ladder" };
}
