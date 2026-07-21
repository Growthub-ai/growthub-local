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
import { deriveCapacityPlan, normalizeRequirementsForProfile, paramsForBaseModel, resolveCapacityProfile } from "./compute-capacity-profiles.js";
import { buildTrainingRunConfig } from "./training-runtime-profiles.js";
import { parseJsonColumn } from "./compute-evidence.js";

export const COMPUTE_AUTHORITY_KEY_ENV = "GROWTHUB_COMPUTE_AUTHORITY_KEY";
export const WORKSPACE_SIGNING_KEY_ENV = "GROWTHUB_WORKSPACE_SIGNING_KEY";
export const COMPUTE_AUTHORITY_VERSION = 1;

const AUTHORITY_HMAC_DOMAIN = "growthub-compute-authority-v1\0";
const AUTHORITY_SUBKEY_DOMAIN = "growthub-compute-authority-subkey-v1\0";
const str = (v) => String(v ?? "").trim();

/** Domain-separated, non-secret key identity. */
const authorityKeyId = (key) => sha256Hex(`growthub-compute-authority-key:${key}`).slice(0, 16);

/** Params (B) parsed from an ollama-style tag suffix ("qwen3:141b" → 141)
 *  for base models the student sizing ladder does not enumerate. */
function paramsFromTagSuffix(tag) {
  const suffix = String(tag || "").trim().split(":").pop() || "";
  const match = /(\d+(?:\.\d+)?)\s*b$/i.exec(suffix);
  return match ? Number(match[1]) : 0;
}

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

// Cryptographic domain separation is TWO-layer: the shared workspace root is
// stretched into a compute-only subkey (deriveWorkspaceComputeSubkey), and
// the HMAC message itself carries a fixed compute-authority domain prefix —
// a manifest signature and an authority seal can never be valid for each
// other's bytes. The distinct keyId remains observability evidence only.
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

/** ALL rows of an objectType matching a predicate — ambiguity detection. */
function collectRows(workspaceConfig, objectType, predicate) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const matches = [];
  for (const object of objects) {
    if (object?.objectType !== objectType) continue;
    for (const row of Array.isArray(object.rows) ? object.rows : []) {
      if (row && typeof row === "object" && predicate(row)) matches.push(row);
    }
  }
  return matches;
}

/** The api-registry row a version row binds through `apiRegistryId`. */
function findRegistryRow(workspaceConfig, integrationId) {
  const id = str(integrationId);
  if (!id) return null;
  return collectRows(workspaceConfig, "api-registry", (r) => str(r?.integrationId) === id)[0] || null;
}

const failure = (reasonCode, reason) => ({ ok: false, reasonCode, reason, authority: null, keySource: "" });

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
  // Exactly ONE run row may claim the identity — a duplicate is either a
  // corrupted store or an attempt to shadow the governed row.
  const runRows = collectRows(workspaceConfig, "model-training-run", (r) => str(r?.trainingRunId) === str(trainingRunId));
  if (runRows.length === 0) return failure("receipt-missing", `no model-training-run receipt for "${str(trainingRunId)}"`);
  if (runRows.length > 1) return failure("run-identity-ambiguous", `${runRows.length} model-training-run rows claim "${str(trainingRunId)}" — refusing ambiguous run identity`);
  const row = runRows[0];

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

  // The authoritative `model-training` version row is REQUIRED and must be
  // unique for the export identity: authority is compiled from real
  // training-version lineage, never from a free-floating run row.
  const versionRows = collectRows(workspaceConfig, "model-training", (r) => str(r?.lastExportId) === datasetExportId);
  if (versionRows.length === 0) return failure("training-row-missing", `no model-training version row carries export "${datasetExportId}" — a run without training-version lineage cannot be granted authority`);
  if (versionRows.length > 1) return failure("training-row-ambiguous", `${versionRows.length} model-training version rows claim export "${datasetExportId}" — refusing ambiguous lineage`);
  const versionRow = versionRows[0];
  const modelTrainingRowId = str(row.modelTrainingRowId);
  const versionRowName = str(versionRow.Name);
  if (modelTrainingRowId && !new RegExp(`^${modelTrainingRowId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-v\\d+$`).test(versionRowName)) {
    return failure("training-row-binding", `model-training row "${versionRowName}" does not belong to training identity "${modelTrainingRowId}"`);
  }
  const trainingRowBinding = {
    rowName: versionRowName,
    lastExportId: str(versionRow.lastExportId),
    baseModel: str(versionRow.baseModel),
    localModel: str(versionRow.localModel),
    apiRegistryId: str(versionRow.apiRegistryId),
  };
  if (trainingRowBinding.baseModel && trainingRowBinding.baseModel !== baseModel) {
    return failure("training-row-stale", `model-training row "${trainingRowBinding.rowName}" carries base model "${trainingRowBinding.baseModel}", receipt claims "${baseModel}" — stale or tampered lineage`);
  }
  // Output identity must agree with the version row's reserved tag AND the
  // API Registry row the version binds (its expected served tag).
  if (trainingRowBinding.localModel && trainingRowBinding.localModel !== outputModelTag) {
    return failure("output-identity-conflict", `requested output tag "${outputModelTag}" contradicts the model-training row's reserved tag "${trainingRowBinding.localModel}"`);
  }
  const registryRow = findRegistryRow(workspaceConfig, trainingRowBinding.apiRegistryId);
  const expectedTag = str(registryRow?.expectedModelTag);
  if (expectedTag && expectedTag !== outputModelTag) {
    return failure("output-identity-conflict", `requested output tag "${outputModelTag}" contradicts API Registry "${trainingRowBinding.apiRegistryId}" expected tag "${expectedTag}"`);
  }
  // Dataset path must agree with the version row's export summary when it
  // records one — the run cannot silently point the workload at other bytes.
  const exportSummary = parseJsonColumn(versionRow.lastExportSummary);
  const summaryPath = str(exportSummary?.path);
  if (summaryPath && req.datasetPath && summaryPath !== req.datasetPath) {
    return failure("dataset-path-conflict", `requested dataset path "${req.datasetPath}" contradicts the export summary's "${summaryPath}"`);
  }

  // Server-side recompilation of the exact workload from PURE derivers over
  // durable evidence (never from a caller-supplied plan or step list). The
  // preflight anchor is request-lane input for the FIRST compile; once any
  // journal exists the PATCH policy freezes it and drift detection refuses
  // later changes — it is never treated as unforgeable machine truth.
  const preflight = row.preflight && typeof row.preflight === "object" ? row.preflight : null;
  const adaptivePlan = buildAdaptiveStudentPlan({ preflight, requestedBaseModel: baseModel });
  const capacityPlan = deriveCapacityPlan({
    plan: adaptivePlan,
    preflight,
    workloadKind: "fine-tune",
    // Size from the GOVERNED base model, not the adaptive local-fit student:
    // the remote workload fine-tunes the receipt's base model, so its
    // parameter count drives the derived floor the requested profile must
    // meet or exceed (ladder first, tag-suffix fallback for off-ladder tags).
    paramsB: paramsForBaseModel(baseModel) || paramsFromTagSuffix(baseModel),
    // Quote-estimation input from the customer request; 0 keeps total cost
    // unknown, which the resolver refuses under a hard cap (never zero).
    estimatedDurationMinutes: req.estimatedDurationMinutes,
  });
  // A requested profile may only TIGHTEN the derived plan. Profile floors
  // only ever raise minimums, so comparing floors applied to the derived
  // requirements cannot reveal a weaker profile — compare the profiles'
  // INTRINSIC floors (floors over an empty ask) instead. A weaker or
  // contradictory profile is refused, never silently substituted.
  let capacityProfileId = capacityPlan.capacityProfileId;
  if (req.capacityProfileId && req.capacityProfileId !== capacityPlan.capacityProfileId) {
    if (!resolveCapacityProfile(req.capacityProfileId)) {
      return failure("capacity-profile-unknown", `unknown requested capacity profile "${req.capacityProfileId}"`);
    }
    const bareAsk = { workloadKind: str(capacityPlan.requirements?.workloadKind) || "fine-tune" };
    const derivedFloor = normalizeRequirementsForProfile(bareAsk, capacityPlan.capacityProfileId);
    const requestedFloor = normalizeRequirementsForProfile(bareAsk, req.capacityProfileId);
    const dims = ["gpuCount", "minVramPerGpuGB", "minCpuCores", "minRamGB", "minDiskGB"];
    const weaker = dims.filter((dim) => (Number(requestedFloor?.[dim]) || 0) < (Number(derivedFloor?.[dim]) || 0));
    const derivedWorkers = Number(derivedFloor?.distributed?.workers) || 1;
    const requestedWorkers = Number(requestedFloor?.distributed?.workers) || 1;
    if (requestedWorkers < derivedWorkers) weaker.push("distributed.workers");
    if (derivedFloor?.checkpointRequired === true && requestedFloor?.checkpointRequired !== true) weaker.push("checkpointRequired");
    if (weaker.length > 0) {
      return failure("capacity-profile-downgrade", `requested profile "${req.capacityProfileId}" is weaker than the derived "${capacityPlan.capacityProfileId}" on ${weaker.join(", ")} — a profile override may only tighten the plan`);
    }
    capacityProfileId = req.capacityProfileId;
  }

  const runConfig = buildTrainingRunConfig({
    profileId: trainingProfileId,
    baseModel,
    datasetPath: req.datasetPath || summaryPath || `dataset/${datasetExportId}.jsonl`,
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
      // HONEST classification: without a server-materialized corpus manifest
      // (the remote data-plane workstream) this authority binds dataset
      // METADATA/identity only — it does not claim byte-level authority.
      binding: str(datasetManifest?.corpusSha256) ? "manifest" : "metadata-only",
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
  // keySource lets the execution seam refuse paid boundaries under the
  // ephemeral per-process key in EVERY environment (the NODE_ENV gate above
  // is the production hard-stop; the hook refuses remote unconditionally).
  return { ok: true, reasonCode: "", reason: "authority compiled and sealed", authority, keySource: resolvedKey.source };
}

/**
 * Verify a PERSISTED authority against the workspace it claims to govern.
 * Trust requires BOTH: (1) the server seal verifies, and (2) recompiling
 * from current authoritative inputs reproduces the same content identity.
 * A caller-supplied object that is merely self-consistent fails here.
 *
 * The seal is verified FIRST. Untrusted authority fields never become
 * compiler inputs: the persisted dataset manifest is reused for
 * recompilation ONLY after the seal proves it server-written; on a failed
 * seal the recompile uses solely the caller-supplied trusted manifest (from
 * server-owned records), so a forged persisted manifest can never launder
 * itself into a freshly sealed authority.
 *
 * Returns `{ ok, reasonCode, reason, recompiled, contentMatches }`.
 * `recompiled` is compiled from trusted inputs only, so it is safe to use
 * as current truth; `contentMatches` is reported even when the seal fails,
 * distinguishing a seal-only failure with identical content (safe explicit
 * reseal after key rotation) from real drift (fail closed, re-prepare).
 */
export function verifyComputeAuthorityAgainstWorkspace({
  workspaceConfig = null,
  trainingRunId = "",
  authority = null,
  datasetManifest = null,
  env = process.env,
  now = "",
} = {}) {
  const seal = verifyComputeAuthoritySeal(authority, env);

  const recompileResult = compileComputeAuthority({
    workspaceConfig,
    trainingRunId,
    datasetManifest: seal.ok ? (datasetManifest ?? authority.dataset) : datasetManifest,
    now,
    env,
  });
  const recompiled = recompileResult.ok ? recompileResult.authority : null;
  const contentMatches = Boolean(recompiled && str(recompiled.authorityHash) === str(authority?.authorityHash));

  if (!seal.ok) return { ok: false, reasonCode: seal.reasonCode, reason: seal.reason, recompiled, contentMatches };

  const internal = verifyComputeAuthority({ intent: authority.intent, workSpec: authority.workSpec });
  if (!internal.ok) return { ok: false, reasonCode: "authority-inconsistent", reason: "sealed authority failed internal intent/work-spec lineage validation", recompiled, contentMatches };

  if (!recompileResult.ok) {
    return { ok: false, reasonCode: recompileResult.reasonCode, reason: `authoritative inputs no longer compile: ${recompileResult.reason}`, recompiled, contentMatches };
  }
  if (!contentMatches) {
    return {
      ok: false,
      reasonCode: "authority-drift",
      reason: "governed inputs changed after sealing (training row, dataset identity, policy, ordered steps, or output identity) — refusing the stale authority",
      recompiled,
      contentMatches,
    };
  }
  return { ok: true, reasonCode: "", reason: "seal verified and recompilation matches", recompiled, contentMatches };
}
