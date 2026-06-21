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

/**
 * Derive the import-readiness of one artifact descriptor (the `artifact`
 * block of a `model-training-run` receipt). Pure, never throws.
 *
 *   - identified=false → not importable; the run stays `trained`
 *   - identified=true  → importable; the run can advance to `imported`
 */
export function deriveArtifactState(artifact) {
  if (!artifact || typeof artifact !== "object") {
    return { identified: false, type: "", modelTag: "", hasHash: false, hasPath: false, quantization: "", reason: "no artifact recorded" };
  }
  const type = ARTIFACT_TYPES.includes(String(artifact.type)) ? String(artifact.type) : "";
  const modelTag = String(artifact.modelTag || "").trim();
  const hasPath = nonEmpty(artifact.path);
  const hasHash = nonEmpty(artifact.sha256);
  const quantization = String(artifact.quantization || "").trim();

  let identified = true;
  let reason = "artifact identified";
  if (!type) { identified = false; reason = "artifact type missing or unknown"; }
  else if (!modelTag) { identified = false; reason = "artifact model tag missing"; }
  else if (FILE_BACKED_TYPES.has(type) && !hasPath) { identified = false; reason = `${type} artifact requires a path`; }
  else if (FILE_BACKED_TYPES.has(type) && !hasHash) { identified = false; reason = `${type} artifact requires a sha256 identity`; }

  return { identified, type, modelTag, hasHash, hasPath, quantization, reason, tagOnly: TAG_ONLY_TYPES.has(type) };
}

/** True only when the artifact is provable enough to import back. */
export function artifactImportComplete(artifact) {
  return deriveArtifactState(artifact).identified;
}
