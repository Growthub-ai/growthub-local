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
 *   - the pure planning derivers this repo already certifies.
 *
 * The compiled authority is HMAC-SHA256 SEALED with a server-owned key.
 * Verification never trusts a stored authority by its self-hash: it verifies
 * the seal first, then recompiles from current server inputs and refuses drift.
 *
 * Key material, in precedence order:
 *   1. `GROWTHUB_COMPUTE_AUTHORITY_KEY` — dedicated override;
 *   2. `GROWTHUB_WORKSPACE_SIGNING_KEY` — shared operator root, from which a
 *      compute-specific subkey is derived so the manifest and compute HMAC
 *      domains never use the same effective key;
 *   3. a per-process ephemeral key for non-production development only.
 *
 * Production remote authority compilation and verification fail closed when
 * no durable configured key exists. The key never appears in receipts; only
 * the non-secret keyId does.
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
import { parseJsonColumn } from "./compute-evidence.js";
import { findTrainingRunReceiptRow } from "./compute-execution.js";

export const COMPUTE_AUTHORITY_KEY_ENV = "GROWTHUB_COMPUTE_AUTHORITY_KEY";
export const WORKSPACE_SIGNING_KEY_ENV = "GROWTHUB_WORKSPACE_SIGNING_KEY";
export const COMPUTE_AUTHORITY_VERSION = 1;

const AUTHORITY_HMAC_DOMAIN = "growthub-compute-authority-v1\0";
const AUTHORITY_SUBKEY_DOMAIN = "growthub-compute-authority-subkey-v1\0";
const str = (v) => String(v ?? "").trim();

/** Domain-separated, non-secret key identity. */
const authorityKeyId = (key) => sha256Hex(`growthub-compute-authority-key:${key}`).slice(0, 16);

let ephemeralAuthorityKey = null;

/** Derive a compute-only subkey from the shared workspace signing root. */
function deriveWorkspaceComputeSubkey(workspaceKey) {
  return createHmac("sha256", workspaceKey).update(AUTHORITY_SUBKEY_DOMAIN, "utf8").digest("hex");
}

/**
 * Resolve the server-owned sealing key. Returns `{ key, keyId, source }`;
 * `keyId` is non-secret evidence safe to persist alongside the seal.
 */
export function resolveComputeAuthorityKey(env = process.env) {
  const dedicated = str(env?.[COMPUTE_AUTHORITY_KEY_ENV]);
  if (dedicated) {
    return { key: dedicated, keyId: `env-${authorityKeyId(dedicated)}`, source: "env" };
  }
  const workspaceKey = str(env?.[WORKSPACE_SIGNING_KEY_ENV]);
  if (workspaceKey) {
    const derived = deriveWorkspaceComputeSubkey(workspaceKey);
    return { key: derived, keyId: `wsk-${authorityKeyId(derived)}`, source: "workspace-signing-key" };
  }
  if (!ephemeralAuthorityKey) ephemeralAuthorityKey = randomBytes(32).toString("hex");
  return { key: ephemeralAuthorityKey, keyId: `boot-${authorityKeyId(ephemeralAuthorityKey)}`, source: "ephemeral" };
}

function durableAuthorityKeyRequired(env) {
  return str(env?.NODE_ENV).toLowerCase() === "production";
}

function hmacSeal(key, authorityWithoutSeal) {
  return createHmac("sha256", key)
    .update(AUTHORITY_HMAC_DOMAIN, "utf8")
    .update(stableComputeStringify(authorityWithoutSeal), "utf8")
    .digest("hex");
}

/** Seal a compiled authority with the server key. Pure aside from the key. */
export function sealComputeAuthority(authority, { key, keyId } = resolveComputeAuthorityKey()) {
  if (!key || !keyId) throw new Error("compute authority sealing key unavailable");
  const body = { ...authority, keyId, seal: undefined };
  return { ...body, seal: hmacSeal(key, body) };
}

/**
 * Verify only the seal of a persisted authority. In production, an ephemeral
 * boot key is not accepted as durable execution authority.
 */
export function verifyComputeAuthoritySeal(authority, env = process.env) {
  if (!authority || typeof authority !== "object") return { ok: false, reasonCode: "authority-missing", reason: "no authority object" };
  if (authority.schema !== COMPUTE_AUTHORITY_SCHEMA) return { ok: false, reasonCode: "authority-schema", reason: `unexpected schema "${str(authority.schema)}"` };
  const resolved = resolveComputeAuthorityKey(env);
  if (resolved.source === "ephemeral" && durableAuthorityKeyRequired(env)) {
    return {
      ok: false,
      reasonCode: "authority-key-missing",
      reason: `production compute authority requires ${COMPUTE_AUTHORITY_KEY_ENV} or ${WORKSPACE_SIGNING_KEY_ENV}; an ephemeral boot key cannot authorize paid remote execution`,
    };
  }
  if (str(authority.keyId) !== resolved.keyId) return { ok: false, reasonCode: "seal-key-mismatch", reason: "authority sealed under a different key — treating as untrusted" };
  const expected = hmacSeal(resolved.key, { ...authority, seal: undefined });
  const got = str(authority.seal);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(got, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reasonCode: "seal-invalid", reason: "authority seal does not verify — stored authority is not server-written" };
  }
  return { ok: true, reasonCode: "", reason: "seal verified" };
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
 * training run. Deterministic over durable workspace state.
 */
export function compileComputeAuthority({
  workspaceConfig = null,
  trainingRunId = "",
  request = null,
  datasetManifest = null,
  now = "",
  env = process.env,
} = {}) {
  const row = findTrainingRunReceiptRow(workspaceConfig, trainingRunId);
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

  const preflight = row.preflight && typeof row.preflight === "object" ? row.preflight : null;
  const adaptivePlan = buildAdaptiveStudentPlan({ preflight, requestedBaseModel: baseModel });
  const capacityPlan = deriveCapacityPlan({
    plan: adaptivePlan,
    preflight,
    workloadKind: "fine-tune",
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
  const authorityHash = hashComputeValue({ ...body, compiledAt: undefined });
  const resolvedKey = resolveComputeAuthorityKey(env);
  if (resolvedKey.source === "ephemeral" && durableAuthorityKeyRequired(env)) {
    return failure(
      "authority-key-missing",
      `production compute authority requires ${COMPUTE_AUTHORITY_KEY_ENV} or ${WORKSPACE_SIGNING_KEY_ENV}; refusing remote authority compilation under an ephemeral boot key`,
    );
  }
  const authority = sealComputeAuthority({ ...body, authorityHash }, resolvedKey);
  return { ok: true, reasonCode: "", reason: "authority compiled and sealed", authority };
}

/**
 * Verify a persisted authority against the workspace it claims to govern.
 * The seal is verified BEFORE any persisted dataset metadata is reused for
 * recompilation; untrusted authority fields never become compiler inputs.
 */
export function verifyComputeAuthorityAgainstWorkspace({
  workspaceConfig = null,
  trainingRunId = "",
  authority = null,
  env = process.env,
  now = "",
} = {}) {
  const seal = verifyComputeAuthoritySeal(authority, env);
  if (!seal.ok) return { ok: false, reasonCode: seal.reasonCode, reason: seal.reason, recompiled: null };

  const internal = verifyComputeAuthority({ intent: authority.intent, workSpec: authority.workSpec });
  if (!internal.ok) return { ok: false, reasonCode: "authority-inconsistent", reason: "sealed authority failed internal intent/work-spec lineage validation", recompiled: null };

  const recompileResult = compileComputeAuthority({
    workspaceConfig,
    trainingRunId,
    datasetManifest: authority.dataset,
    now,
    env,
  });
  const recompiled = recompileResult.ok ? recompileResult.authority : null;
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
