/**
 * Server-owned compute authority — the trust boundary the caller-PATCHable
 * store cannot cross.
 *
 * The browser persists only a `growthub-compute-request-v1` snapshot (what
 * the customer ASKED for). Execution authority — the exact intent, ordered
 * training steps, dataset identity, output identity, normalized policy,
 * requirements and profile — is COMPILED HERE, inside the server, from:
 *
 *   - the governed `model-training-run` receipt row (run identity, base
 *     model, training profile, dataset export id, stamped preflight);
 *   - the authoritative `model-training` version row bound by dataset
 *     export id;
 *   - the customer compute request snapshot;
 *   - the pure planning derivers (adaptive plan, capacity plan, training
 *     run config) this repo already certifies.
 *
 * The compiled authority is HMAC-SHA256 SEALED with a server-owned key.
 * Because the persisted receipt store is reachable through caller PATCH
 * (policy-protected, but defense-in-depth assumes it is not), verification
 * NEVER trusts a stored authority by its self-hash: it checks the seal AND
 * recompiles from current server inputs, failing closed on any drift —
 * stale training row, missing dataset identity, changed policy, changed
 * ordered steps, changed output identity.
 *
 * Key material: `GROWTHUB_COMPUTE_AUTHORITY_KEY` (operator-provided). When
 * absent, a per-process ephemeral key is generated — seals then do not
 * survive a restart, which fails closed to RECOMPILATION (never to trusting
 * the caller). The key never appears in receipts; only the non-secret keyId
 * does.
 *
 * Node-only on purpose (node:crypto): this module must never be importable
 * into a browser bundle that could then pretend to seal.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  COMPUTE_AUTHORITY_SCHEMA,
  buildComputeIntent,
  buildComputeWorkSpec,
  hashComputeValue,
  normalizeComputeRequest,
  sha256Hex,
  stableComputeStringify,
  verifyComputeAuthority,
} from "./compute-work-spec.js";
import { buildAdaptiveStudentPlan } from "./distillation-student-plan.js";
import { deriveCapacityPlan, resolveCapacityProfile } from "./compute-capacity-profiles.js";
import { buildTrainingRunConfig } from "./training-runtime-profiles.js";

export const COMPUTE_AUTHORITY_KEY_ENV = "GROWTHUB_COMPUTE_AUTHORITY_KEY";
export const COMPUTE_AUTHORITY_VERSION = 1;

const str = (v) => String(v ?? "").trim();

let ephemeralAuthorityKey = null;

/**
 * Resolve the server-owned sealing key. Returns `{ key, keyId, source }`;
 * `keyId` is non-secret evidence safe to persist alongside the seal.
 */
export function resolveComputeAuthorityKey(env = process.env) {
  const configured = str(env?.[COMPUTE_AUTHORITY_KEY_ENV]);
  if (configured) {
    return { key: configured, keyId: `env-${sha256Hex(configured).slice(0, 12)}`, source: "env" };
  }
  if (!ephemeralAuthorityKey) ephemeralAuthorityKey = randomBytes(32).toString("hex");
  return { key: ephemeralAuthorityKey, keyId: `boot-${sha256Hex(ephemeralAuthorityKey).slice(0, 12)}`, source: "ephemeral" };
}

function hmacSeal(key, authorityWithoutSeal) {
  return createHmac("sha256", key).update(stableComputeStringify(authorityWithoutSeal), "utf8").digest("hex");
}

/** Seal a compiled authority with the server key. Pure aside from the key. */
export function sealComputeAuthority(authority, { key, keyId } = resolveComputeAuthorityKey()) {
  const body = { ...authority, keyId, seal: undefined };
  return { ...body, seal: hmacSeal(key, body) };
}

/**
 * Verify only the seal of a persisted authority (was it written by THIS
 * server with the current key?). A failed seal is not proof of forgery —
 * key rotation and restarts invalidate seals too — but a failed seal means
 * the stored object must be treated as untrusted and recompiled.
 */
export function verifyComputeAuthoritySeal(authority, env = process.env) {
  if (!authority || typeof authority !== "object") return { ok: false, reasonCode: "authority-missing", reason: "no authority object" };
  if (authority.schema !== COMPUTE_AUTHORITY_SCHEMA) return { ok: false, reasonCode: "authority-schema", reason: `unexpected schema "${str(authority.schema)}"` };
  const { key, keyId } = resolveComputeAuthorityKey(env);
  if (str(authority.keyId) !== keyId) return { ok: false, reasonCode: "seal-key-mismatch", reason: "authority sealed under a different key — treating as untrusted" };
  const expected = hmacSeal(key, { ...authority, seal: undefined });
  const got = str(authority.seal);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(got, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reasonCode: "seal-invalid", reason: "authority seal does not verify — stored authority is not server-written" };
  }
  return { ok: true, reasonCode: "", reason: "seal verified" };
}

function parseJsonColumn(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function findReceiptRow(workspaceConfig, trainingRunId) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const object = objects.find((o) => o?.objectType === "model-training-run");
  const rows = Array.isArray(object?.rows) ? object.rows : [];
  return rows.find((r) => str(r?.trainingRunId) === str(trainingRunId)) || null;
}

/** The authoritative model-training version row bound by dataset export id. */
function findTrainingVersionRow(workspaceConfig, datasetExportId) {
  const exportId = str(datasetExportId);
  if (!exportId) return null;
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  for (const object of objects) {
    if (object?.objectType !== "model-training") continue;
    const rows = Array.isArray(object.rows) ? object.rows : [];
    const match = rows.find((r) => str(r?.lastExportId) === exportId);
    if (match) return match;
  }
  return null;
}

const failure = (reasonCode, reason) => ({ ok: false, reasonCode, reason, authority: null });

/**
 * Compile the canonical, server-owned compute authority for one governed
 * training run. Deterministic over durable workspace state (recompiling with
 * unchanged inputs yields the same `authorityHash`), so drift detection is a
 * hash comparison. Returns `{ ok, reasonCode, reason, authority }`; the
 * authority is sealed.
 *
 * @param {object} opts.workspaceConfig  current governed config
 * @param {string} opts.trainingRunId    the model-training-run identity
 * @param {object} [opts.request]        customer request override (defaults
 *                                       to the receipt row's computeRequest)
 * @param {object} [opts.datasetManifest] { corpusSha256, sizeBytes } when the
 *                                       server has materialized the corpus
 * @param {string} [opts.now]            ISO timestamp (evidence only — never
 *                                       part of the content identity)
 * @param {object} [opts.env]            key resolution environment
 */
export function compileComputeAuthority({
  workspaceConfig = null,
  trainingRunId = "",
  request = null,
  datasetManifest = null,
  now = "",
  env = process.env,
} = {}) {
  const row = findReceiptRow(workspaceConfig, trainingRunId);
  if (!row) return failure("receipt-missing", `no model-training-run receipt for "${str(trainingRunId)}"`);

  const req = normalizeComputeRequest(request || parseJsonColumn(row.computeRequest));
  if (!req) return failure("request-missing", "no customer compute request snapshot on the receipt row — nothing to compile authority from");

  const datasetExportId = req.datasetExportId || str(row.datasetExportId);
  if (!datasetExportId) return failure("dataset-identity-missing", "dataset export identity is required for compute authority");

  const baseModel = str(row.baseModel) || req.baseModel;
  if (!baseModel) return failure("base-model-missing", "base model identity is required for compute authority");

  const trainingProfileId = str(row.trainingProfile) || req.trainingProfileId;
  if (!trainingProfileId) return failure("training-profile-missing", "training profile identity is required for compute authority");

  const outputModelTag = req.outputModelTag;
  if (!outputModelTag) return failure("output-identity-missing", "requested output model tag is required for compute authority");

  // Cross-check the request against the governed receipt row: a request that
  // contradicts the run's own durable identity is rejected, not repaired.
  if (req.baseModel && req.baseModel !== baseModel) {
    return failure("base-model-conflict", `request base model "${req.baseModel}" contradicts the governed receipt's "${baseModel}"`);
  }
  if (req.trainingProfileId && req.trainingProfileId !== trainingProfileId) {
    return failure("training-profile-conflict", `request training profile "${req.trainingProfileId}" contradicts the governed receipt's "${trainingProfileId}"`);
  }
  if (req.datasetExportId && str(row.datasetExportId) && req.datasetExportId !== str(row.datasetExportId)) {
    return failure("dataset-identity-conflict", `request dataset export "${req.datasetExportId}" contradicts the governed receipt's "${str(row.datasetExportId)}"`);
  }

  const versionRow = findTrainingVersionRow(workspaceConfig, datasetExportId);
  const trainingRowBinding = versionRow
    ? { rowName: str(versionRow.Name), lastExportId: str(versionRow.lastExportId), baseModel: str(versionRow.baseModel) }
    : null;
  if (trainingRowBinding?.baseModel && trainingRowBinding.baseModel !== baseModel) {
    return failure("training-row-stale", `model-training row "${trainingRowBinding.rowName}" carries base model "${trainingRowBinding.baseModel}", receipt claims "${baseModel}" — stale or tampered lineage`);
  }

  // Server-side recompilation of the exact workload from PURE derivers over
  // durable evidence (never from a caller-supplied plan or step list).
  const preflight = row.preflight && typeof row.preflight === "object" ? row.preflight : null;
  const adaptivePlan = buildAdaptiveStudentPlan({ preflight, requestedBaseModel: baseModel });
  const capacityPlan = deriveCapacityPlan({
    plan: adaptivePlan,
    preflight,
    workloadKind: "fine-tune",
    // Quote-estimation input from the customer request; 0 keeps total cost
    // unknown, which the resolver refuses under a hard cap (never zero).
    estimatedDurationMinutes: req.estimatedDurationMinutes,
  });
  const capacityProfileId = req.capacityProfileId && resolveCapacityProfile(req.capacityProfileId)
    ? req.capacityProfileId
    : capacityPlan.capacityProfileId;

  const runConfig = buildTrainingRunConfig({
    profileId: trainingProfileId,
    baseModel,
    datasetPath: req.datasetPath || `dataset/${datasetExportId}.jsonl`,
    outputModelTag,
    artifactPath: req.artifactPath || `artifacts/${outputModelTag}`,
    ...(req.teacherModel ? { teacherModel: req.teacherModel } : {}),
    ...(req.quantization ? { quantization: req.quantization } : {}),
  });

  let intent;
  let workSpec;
  try {
    intent = buildComputeIntent({
      adaptivePlan,
      capacityPlan: { ...capacityPlan, capacityProfileId },
      policy: req.policy,
      trainingRunConfig: runConfig,
    });
    workSpec = buildComputeWorkSpec({
      intent,
      trainingRunConfig: runConfig,
      trainingRunId: str(trainingRunId),
      modelTrainingRowId: str(row.modelTrainingRowId),
      datasetExportId,
      corpusSha256: str(datasetManifest?.corpusSha256),
    });
  } catch (error) {
    return failure("compile-failed", `authority compilation failed: ${str(error?.message) || "unknown error"}`);
  }

  const body = {
    schema: COMPUTE_AUTHORITY_SCHEMA,
    version: COMPUTE_AUTHORITY_VERSION,
    trainingRunId: str(trainingRunId),
    modelTrainingRowId: str(row.modelTrainingRowId),
    trainingRowBinding,
    request: req,
    requestHash: hashComputeValue(req),
    dataset: {
      exportId: datasetExportId,
      corpusSha256: str(datasetManifest?.corpusSha256),
      sizeBytes: Math.max(0, Math.floor(Number(datasetManifest?.sizeBytes) || 0)),
    },
    intent,
    workSpec,
    intentHash: intent.intentHash,
    requirementsHash: intent.requirementsHash,
    workSpecHash: workSpec.workSpecHash,
    compiledBy: "workspace-server",
    compiledAt: str(now),
  };
  // Content identity excludes the compile timestamp so re-compilation over
  // unchanged inputs is hash-stable (drift detection = hash comparison).
  const authorityHash = hashComputeValue({ ...body, compiledAt: undefined });
  const authority = sealComputeAuthority({ ...body, authorityHash }, resolveComputeAuthorityKey(env));
  return { ok: true, reasonCode: "", reason: "authority compiled and sealed", authority };
}

/**
 * Verify a PERSISTED authority against the workspace it claims to govern.
 * Trust requires BOTH: (1) the server seal verifies, and (2) recompiling
 * from current authoritative inputs reproduces the same content identity.
 * A caller-supplied object that is merely self-consistent fails here.
 *
 * Returns `{ ok, reasonCode, reason, recompiled }` where `recompiled` is the
 * freshly compiled authority (usable when the caller wants to proceed with
 * current truth after a seal-only failure).
 */
export function verifyComputeAuthorityAgainstWorkspace({
  workspaceConfig = null,
  trainingRunId = "",
  authority = null,
  env = process.env,
  now = "",
} = {}) {
  const recompileResult = compileComputeAuthority({
    workspaceConfig,
    trainingRunId,
    datasetManifest: authority?.dataset,
    now,
    env,
  });
  const recompiled = recompileResult.ok ? recompileResult.authority : null;

  const seal = verifyComputeAuthoritySeal(authority, env);
  if (!seal.ok) return { ok: false, reasonCode: seal.reasonCode, reason: seal.reason, recompiled };

  const internal = verifyComputeAuthority({ intent: authority.intent, workSpec: authority.workSpec });
  if (!internal.ok) return { ok: false, reasonCode: "authority-inconsistent", reason: "sealed authority failed internal intent/work-spec lineage validation", recompiled };

  if (!recompileResult.ok) {
    return { ok: false, reasonCode: recompileResult.reasonCode, reason: `authoritative inputs no longer compile: ${recompileResult.reason}`, recompiled };
  }
  if (str(recompiled.authorityHash) !== str(authority.authorityHash)) {
    return {
      ok: false,
      reasonCode: "authority-drift",
      reason: "governed inputs changed after sealing (training row, dataset identity, policy, ordered steps, or output identity) — refusing the stale authority",
      recompiled,
    };
  }
  return { ok: true, reasonCode: "", reason: "seal verified and recompilation matches", recompiled };
}
