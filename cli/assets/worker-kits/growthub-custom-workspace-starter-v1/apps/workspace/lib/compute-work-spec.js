/**
 * Provider-neutral compute contracts, split by TRUST BOUNDARY:
 *
 *   growthub-compute-request-v1
 *     CUSTOMER-authored request inputs (policy mode, budget, locality,
 *     preemptible choice, provider preference, selected training profile,
 *     trace/export identity, requested output tag). PATCHable, replayable,
 *     never execution authority by itself.
 *
 *   growthub-compute-intent-v1 + growthub-training-execution-spec-v1
 *     SERVER-compiled execution authority. Compiled and HMAC-sealed in
 *     lib/compute-authority.js from authoritative workspace records plus the
 *     customer request. A caller-supplied intent/work-spec — even one whose
 *     self-hash matches — is NEVER trusted: verification recompiles from
 *     server inputs and checks the seal.
 *
 * The training planner remains the sole authority for workload semantics;
 * compute adapters receive the frozen server-compiled projection and may
 * only translate it. This module stays dependency-free (no node:crypto) so
 * the request builder and hash preview run in the browser too; sealing is
 * server-only and lives in compute-authority.js.
 */
import { resolveCapacityProfile, normalizeRequirementsForProfile } from "./compute-capacity-profiles.js";

export const COMPUTE_REQUEST_SCHEMA = "growthub-compute-request-v1";
export const COMPUTE_INTENT_SCHEMA = "growthub-compute-intent-v1";
export const COMPUTE_WORK_SPEC_SCHEMA = "growthub-training-execution-spec-v1";
export const COMPUTE_AUTHORITY_SCHEMA = "growthub-compute-authority-v1";

export function stableComputeStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableComputeStringify).join(",")}]`;
  return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stableComputeStringify(value[key])}`).join(",")}}`;
}

// ---------------------------------------------------------------------------
// Canonical SHA-256 (dependency-free, browser + node). Authority and content
// identities use SHA-256, not FNV-1a: content identity must be collision
// resistant when it participates in a sealed authority chain.
//
// Deliberately NOT the node:crypto sha256Hex from
// lib/adapters/inference/contracts.js: this module is imported by the
// client-side TrainingHandoffModal (for the request builder), so it must
// not pull node:crypto into a browser bundle. Output equality with
// node:crypto is pinned by scripts/unit-compute-work-spec.test.mjs.
// ---------------------------------------------------------------------------

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function utf8Bytes(text) {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text);
  // eslint-disable-next-line no-undef
  return Uint8Array.from(Buffer.from(text, "utf8"));
}

const rotr = (x, n) => ((x >>> n) | (x << (32 - n))) >>> 0;

export function sha256Hex(input) {
  const bytes = utf8Bytes(String(input ?? ""));
  const length = bytes.length;
  const totalLen = Math.ceil((length + 9) / 64) * 64;
  const padded = new Uint8Array(totalLen);
  padded.set(bytes);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(totalLen - 8, Math.floor(length / 0x20000000), false);
  view.setUint32(totalLen - 4, (length << 3) >>> 0, false);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);
  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => x.toString(16).padStart(8, "0")).join("");
}

export function hashComputeValue(value) {
  return sha256Hex(stableComputeStringify(value));
}

export function normalizeComputePolicy(raw = {}) {
  const p = raw && typeof raw === "object" ? raw : {};
  const mode = ["automatic", "local", "cloud", "reserved-cluster"].includes(p.mode) ? p.mode : "automatic";
  const budget = p.budget && typeof p.budget === "object" ? p.budget : {};
  const locality = p.locality && typeof p.locality === "object" ? p.locality : {};
  return {
    mode,
    excludeLocal: mode === "cloud" || p.excludeLocal === true,
    localOnly: mode === "local" || p.localOnly === true,
    reservedOnly: mode === "reserved-cluster" || p.reservedOnly === true,
    allowPreemptible: p.allowPreemptible === true,
    budget: {
      mode: ["hard-cap", "advisory", "unlimited"].includes(budget.mode) ? budget.mode : "advisory",
      maxTotalUsd: Math.max(0, Number(budget.maxTotalUsd) || 0),
      maxHourlyUsd: Math.max(0, Number(budget.maxHourlyUsd) || 0),
      allowUnknownCost: budget.allowUnknownCost === true,
    },
    locality: {
      regions: Array.isArray(locality.regions) ? locality.regions.map(String).filter(Boolean) : [],
      dataResidency: String(locality.dataResidency || ""),
    },
  };
}

/**
 * Normalize the CUSTOMER-authored compute request snapshot — the only
 * compute-shaped thing a browser or direct PATCH may persist. It records what
 * the customer asked for; it grants nothing. The server compiles execution
 * authority FROM it (compute-authority.js) and rejects it when the referenced
 * governed records disagree. Returns null for a non-object.
 */
export function normalizeComputeRequest(raw) {
  if (!raw || typeof raw !== "object") return null;
  const s = (v) => String(v ?? "").trim();
  return {
    schema: COMPUTE_REQUEST_SCHEMA,
    policy: normalizeComputePolicy(raw.policy),
    selectionMode: raw.selectionMode === "explicit" ? "explicit" : "auto",
    providerRegistryId: s(raw.providerRegistryId),
    capacityProfileId: s(raw.capacityProfileId),
    trainingProfileId: s(raw.trainingProfileId),
    baseModel: s(raw.baseModel),
    teacherModel: s(raw.teacherModel),
    quantization: s(raw.quantization),
    datasetExportId: s(raw.datasetExportId),
    datasetPath: s(raw.datasetPath),
    outputModelTag: s(raw.outputModelTag),
    artifactPath: s(raw.artifactPath),
    // Customer's expected training duration — quote-estimation input only.
    // Under a hard budget cap an absent estimate keeps cost UNKNOWN, and
    // unknown cost fails closed in the resolver (never treated as zero).
    estimatedDurationMinutes: Math.max(0, Math.floor(Number(raw.estimatedDurationMinutes) || 0)),
    requestedAt: s(raw.requestedAt),
  };
}

/** Pure factory for the customer request snapshot (browser-safe). */
export function buildComputeRequest(fields = {}) {
  return normalizeComputeRequest(fields);
}

/**
 * SERVER-side intent compiler. Callers outside compute-authority.js /
 * certification tests must not treat the return value as trusted authority —
 * only the sealed authority envelope compiled in compute-authority.js is.
 */
export function buildComputeIntent({ adaptivePlan, capacityPlan, policy, trainingRunConfig } = {}) {
  const profileId = String(capacityPlan?.capacityProfileId || "");
  if (!resolveCapacityProfile(profileId)) throw new Error(`unknown capacity profile "${profileId}"`);
  const policySnapshot = normalizeComputePolicy(policy);
  const requirements = normalizeRequirementsForProfile({ ...(capacityPlan?.requirements || {}), locality: policySnapshot.locality }, profileId);
  const body = {
    schema: COMPUTE_INTENT_SCHEMA,
    adaptivePlan: {
      mode: String(adaptivePlan?.mode || ""),
      tier: String(adaptivePlan?.tier || ""),
      baseModel: String(adaptivePlan?.baseModel || trainingRunConfig?.baseModel || ""),
    },
    capacityProfileId: profileId,
    requirements,
    requirementsHash: hashComputeValue(requirements),
    policy: policySnapshot,
    training: {
      profileId: String(trainingRunConfig?.profileId || ""),
      runnerMode: String(trainingRunConfig?.runnerMode || ""),
      baseModel: String(trainingRunConfig?.baseModel || ""),
      teacherModel: String(trainingRunConfig?.teacherModel || ""),
      quantization: String(trainingRunConfig?.quantization || ""),
    },
  };
  return { ...body, intentHash: hashComputeValue(body) };
}

export function buildComputeWorkSpec({ intent, trainingRunConfig, trainingRunId, modelTrainingRowId, datasetExportId, corpusSha256 = "" } = {}) {
  if (!intent || intent.schema !== COMPUTE_INTENT_SCHEMA || intent.intentHash !== hashComputeValue({ ...intent, intentHash: undefined })) {
    throw new Error("compute intent missing or hash mismatch");
  }
  const body = {
    schema: COMPUTE_WORK_SPEC_SCHEMA,
    intentHash: intent.intentHash,
    requirementsHash: intent.requirementsHash,
    capacityProfileId: intent.capacityProfileId,
    trainingRunId: String(trainingRunId || ""),
    modelTrainingRowId: String(modelTrainingRowId || ""),
    training: {
      profileId: String(trainingRunConfig?.profileId || ""),
      runnerMode: String(trainingRunConfig?.runnerMode || ""),
      baseModel: String(trainingRunConfig?.baseModel || ""),
      teacherModel: String(trainingRunConfig?.teacherModel || ""),
      quantization: String(trainingRunConfig?.quantization || ""),
      steps: (Array.isArray(trainingRunConfig?.steps) ? trainingRunConfig.steps : []).map((step) => ({
        stageId: String(step?.stageId || ""), label: String(step?.label || ""), bin: String(step?.bin || ""), args: Array.isArray(step?.args) ? step.args.map(String) : [],
      })),
    },
    dataset: { exportId: String(datasetExportId || ""), path: String(trainingRunConfig?.datasetPath || ""), corpusSha256: String(corpusSha256 || "") },
    output: {
      modelTag: String(trainingRunConfig?.outputModelTag || ""),
      artifactPath: String(trainingRunConfig?.artifactPath || ""),
      expectedKinds: Array.isArray(trainingRunConfig?.importProof?.acceptedTypes) ? trainingRunConfig.importProof.acceptedTypes.map(String) : [],
    },
  };
  return { ...body, workSpecHash: hashComputeValue(body) };
}

/**
 * INTERNAL-CONSISTENCY check of a compiled intent/work-spec pair (schemas,
 * self-hashes, lineage binding). This is a necessary precondition, NEVER a
 * trust decision: a self-consistent pair supplied by a caller proves only
 * that the caller can hash. Trust requires the server seal + recompilation
 * check in compute-authority.js (verifyComputeAuthorityAgainstWorkspace).
 */
export function verifyComputeAuthority({ intent, workSpec } = {}) {
  const intentOk = Boolean(intent?.schema === COMPUTE_INTENT_SCHEMA && intent.intentHash === hashComputeValue({ ...intent, intentHash: undefined }));
  const specOk = Boolean(workSpec?.schema === COMPUTE_WORK_SPEC_SCHEMA && workSpec.workSpecHash === hashComputeValue({ ...workSpec, workSpecHash: undefined }));
  return { ok: intentOk && specOk && workSpec?.intentHash === intent?.intentHash && workSpec?.requirementsHash === intent?.requirementsHash && workSpec?.capacityProfileId === intent?.capacityProfileId, intentOk, specOk };
}
