/**
 * Training artifacts — pure artifact-identity derivation. No React, no
 * fetch, no fs. Answers one question honestly: "is this training run's
 * output a PROVABLE artifact, or just a claim?"
 *
 * The governed lifecycle owns artifact identity, not the compute backend.
 * A run that says it produced weights but carries no model tag (and, for
 * local file artifacts, no path + sha256) has NOT produced an importable
 * artifact — the ledger must keep it at `trained`, never `imported`. This
 * module is the floor that enforces that, shared by the run-receipt
 * deriver and the Training Runtime modal so they can never disagree.
 */

export const ARTIFACT_TYPES = ["adapter", "gguf", "merged-model", "ollama-model", "openai-compatible-endpoint"];

/** File-backed artifacts must carry a path + content hash to be provable. */
const FILE_BACKED_TYPES = new Set(["adapter", "gguf", "merged-model"]);

/** Endpoint/named-runtime artifacts prove identity by model tag alone. */
const TAG_ONLY_TYPES = new Set(["ollama-model", "openai-compatible-endpoint"]);

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/** Supported GGUF quant levels the pipeline can produce + prove. */
export const SUPPORTED_QUANTIZATIONS = ["q4_k_m", "q5_k_m", "q6_k", "q8_0"];

/**
 * A quantized GGUF must be MEASURABLY smaller than the fp16 source it came
 * from. Any real llama.cpp quant (even q8_0 ≈ 0.53× fp16) sits far below this;
 * an un-quantized copy sits at ≈ 1.0×. So a size ratio at/above this floor is
 * proof the quantize step did NOT actually run.
 */
const QUANT_MAX_SIZE_RATIO = 0.9;

function toBytes(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function fmtGB(bytes) {
  return `${(bytes / 1e9).toFixed(1)} GB`;
}

/**
 * Prove (or refute) a declared quantization from the produced file's size vs
 * its fp16 source. Pure. Returns { declared, measured, verified, ... }:
 *   - measured=false → no size evidence recorded (neutral — cannot demote)
 *   - verified=true  → sizes present AND the file is genuinely smaller
 *   - verified=false + measured=true → declared a quant but the file is NOT
 *     quantized (the demotion signal)
 */
export function deriveQuantState(artifact) {
  const declared = String(artifact?.quantization || "").trim();
  const sourceBytes = toBytes(artifact?.sourceBytes);
  const artifactBytes = toBytes(artifact?.artifactBytes);
  const measured = sourceBytes > 0 && artifactBytes > 0;
  const ratio = measured ? artifactBytes / sourceBytes : null;
  const known = SUPPORTED_QUANTIZATIONS.includes(declared);
  const isQuant = Boolean(declared) && declared !== "none";

  let verified = false;
  let reason;
  if (!isQuant) reason = "no quantization declared";
  else if (!known) reason = `unsupported quantization "${declared}" (expected ${SUPPORTED_QUANTIZATIONS.join(" / ")})`;
  else if (!measured) reason = `${declared} declared — size evidence not recorded, unverified`;
  else if (ratio >= QUANT_MAX_SIZE_RATIO) reason = `declared ${declared} but file is not quantized (${fmtGB(sourceBytes)} → ${fmtGB(artifactBytes)})`;
  else { verified = true; reason = `${declared} proven (${fmtGB(sourceBytes)} → ${fmtGB(artifactBytes)}, ${(ratio * 100).toFixed(0)}%)`; }

  return { declared, known, measured, verified, sourceBytes, artifactBytes, ratio, reason };
}

/**
 * Derive the import-readiness of one artifact descriptor (the `artifact`
 * block of a `model-training-run` receipt). Pure, never throws.
 *
 *   - identified=false → not importable; the run stays `trained`
 *   - identified=true  → importable; the run can advance to `imported`
 *
 * Quantization proof is a gate, not a label: when the produced file carries
 * size evidence that CONTRADICTS the declared quant level (a GGUF no smaller
 * than its fp16 source), the artifact is demoted — the quantize step did not
 * really run. Absence of size evidence is neutral (declared-but-unverified),
 * preserving prior behavior for tag-only and legacy artifacts.
 */
export function deriveArtifactState(artifact) {
  if (!artifact || typeof artifact !== "object") {
    return { identified: false, type: "", modelTag: "", hasHash: false, hasPath: false, quantization: "", quant: deriveQuantState(null), reason: "no artifact recorded" };
  }
  const type = ARTIFACT_TYPES.includes(String(artifact.type)) ? String(artifact.type) : "";
  const modelTag = String(artifact.modelTag || "").trim();
  const hasPath = nonEmpty(artifact.path);
  const hasHash = nonEmpty(artifact.sha256);
  const quantization = String(artifact.quantization || "").trim();
  const quant = deriveQuantState(artifact);

  let identified = true;
  let reason = "artifact identified";
  if (!type) { identified = false; reason = "artifact type missing or unknown"; }
  else if (!modelTag) { identified = false; reason = "artifact model tag missing"; }
  else if (FILE_BACKED_TYPES.has(type) && !hasPath) { identified = false; reason = `${type} artifact requires a path`; }
  else if (FILE_BACKED_TYPES.has(type) && !hasHash) { identified = false; reason = `${type} artifact requires a sha256 identity`; }
  // Quant proof gate: only a MEASURED contradiction demotes (never an absence).
  else if (FILE_BACKED_TYPES.has(type) && quant.measured && !quant.verified) { identified = false; reason = quant.reason; }

  return { identified, type, modelTag, hasHash, hasPath, quantization, quant, reason, tagOnly: TAG_ONLY_TYPES.has(type) };
}

/** True only when the artifact is provable enough to import back. */
export function artifactImportComplete(artifact) {
  return deriveArtifactState(artifact).identified;
}
