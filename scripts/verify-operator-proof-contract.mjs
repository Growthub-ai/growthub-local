#!/usr/bin/env node
/**
 * Operator proof contract — the ONE deferred step, made machine-checkable.
 *
 * "No GPU in CI" defers exactly one thing: the real full-duration weight
 * training on the operator's machine, producing a real artifact, serving it,
 * and proving the tuned tag through a real chat-completions response. It does
 * NOT defer product truth, stage correctness, proof wiring, readbacks, negative
 * states, command safety, resume logic, endpoint registration, cockpit UX, or
 * the first-invocation proof contract — those are all proven in-sandbox.
 *
 * This validator gates the deferred step: an operator submits
 * `operator-proof.json` and this asserts every required field is present and
 * self-consistent. Run it in CI on the operator-submitted proof (it is a
 * no-op skip until that file exists), so "GPU needed" can never hide a missing
 * field. Pure Node, no deps.
 *
 * Crash-safety model (stated explicitly, per review): training/quantization
 * crash-safety comes from CHECKPOINTS, HASHES, TEMP ARTIFACTS, ATOMIC RENAMES,
 * and RESUMABLE RUNNER STATE — never from continuous batching (a serving
 * throughput technique that only applies to inference AFTER the artifact
 * exists). Serving optimizations (continuous batching, speculative decoding,
 * OpenAI-compatible routes) are validated as SERVING capabilities in state 14,
 * not as training/quant proof.
 *
 * Web-grounded standard anchors (documented in OPERATOR_PROOF_CONTRACT.md):
 *   PyTorch reproducibility (stamp OS/device/seed/versions/backend — one seed
 *   does not prove universal determinism) · HF Trainer resume_from_checkpoint
 *   (restores model/optimizer/scheduler/RNG) · PyTorch checkpoint RNG tradeoff
 *   · vLLM & Ollama OpenAI-compatible response shape (model/done/timings/tokens)
 *   · MLflow Model Registry (lineage/versions/rollback/aliases) · NIST AI RMF
 *   (valid/safe/accountable/transparent) · OpenTelemetry semantic naming.
 *
 * Usage: node scripts/verify-operator-proof-contract.mjs [path/to/operator-proof.json]
 *   --self-test   validate the embedded template + assert a missing field fails
 */
import fs from "node:fs";
import path from "node:path";

// The exact required contract. Each key is REQUIRED in a submitted operator
// proof; the type is the validator's shape check. Nested groups mirror the
// deferred-step fields the review enumerated.
export const OPERATOR_PROOF_CONTRACT = {
  hardwareInventory: { type: "object", require: ["cpu", "ramGB", "gpu", "diskFreeGB", "os"] },
  toolVersions: { type: "object", require: ["python", "torch", "cuda", "ollama", "llamaCpp"] },
  determinism: { type: "object", require: ["seed", "device", "backend", "deterministicAlgorithms", "note"] },
  dataset: { type: "object", require: ["datasetSha", "acceptedCount", "rejectedCount", "holdoutSplit", "tokenEstimate"] },
  fineTune: { type: "object", require: ["step", "totalSteps", "loss", "checkpointPath", "resumeFromCheckpoint", "rngStatePreserved"] },
  artifact: { type: "object", require: ["path", "sha256", "quantization", "quantSourceBytes", "quantOutputBytes"] },
  serving: { type: "object", require: ["adapter", "servedModelTag", "endpoint", "continuousBatching", "speculative"] },
  firstInvocation: { type: "object", require: ["httpStatus", "servedModel", "expectedTag", "baseModel", "notBaseModel", "done", "latencyMs", "responseBody"] },
  proof: { type: "object", require: ["outputHash", "screenshot", "readback"] },
};

function typeOf(v) { return Array.isArray(v) ? "array" : v === null ? "null" : typeof v; }

/** Validate a submitted proof object against the contract. Returns {ok, errors[]}. */
export function validateOperatorProof(proof) {
  const errors = [];
  if (!proof || typeof proof !== "object") return { ok: false, errors: ["proof is not an object"] };
  for (const [group, spec] of Object.entries(OPERATOR_PROOF_CONTRACT)) {
    const val = proof[group];
    if (val === undefined) { errors.push(`missing group: ${group}`); continue; }
    if (typeOf(val) !== spec.type) { errors.push(`${group}: expected ${spec.type}, got ${typeOf(val)}`); continue; }
    for (const field of spec.require) {
      // A key must be PRESENT (undefined = not recorded) and non-empty-string.
      // null/false are valid recorded values (e.g. speculative:null = "not used",
      // continuousBatching:false), so they satisfy presence.
      if (val[field] === undefined || val[field] === "") errors.push(`missing field: ${group}.${field}`);
    }
  }
  // Cross-field truth checks — the contract is not just "fields present".
  const fi = proof.firstInvocation || {};
  if (fi.httpStatus !== undefined && Number(fi.httpStatus) !== 200) errors.push(`firstInvocation.httpStatus must be 200 for a passing proof (got ${fi.httpStatus})`);
  if (fi.servedModel !== undefined && fi.expectedTag !== undefined && String(fi.servedModel) !== String(fi.expectedTag)) errors.push("firstInvocation.servedModel must equal expectedTag (served the tuned model, not the base)");
  if (fi.servedModel !== undefined && fi.baseModel !== undefined && String(fi.servedModel) === String(fi.baseModel)) errors.push("firstInvocation.servedModel must NOT equal baseModel (base-model response demotes)");
  if (fi.notBaseModel === false) errors.push("firstInvocation.notBaseModel must be true");
  const a = proof.artifact || {};
  if (a.quantSourceBytes !== undefined && a.quantOutputBytes !== undefined && !(Number(a.quantOutputBytes) < Number(a.quantSourceBytes))) errors.push("artifact.quantOutputBytes must be < quantSourceBytes (quantization shrank the model)");
  return { ok: errors.length === 0, errors };
}

// A complete, valid template an operator fills in on real hardware.
export const OPERATOR_PROOF_TEMPLATE = {
  hardwareInventory: { cpu: "<cpu model>", ramGB: 32, gpu: "<gpu name or 'cpu-only'>", diskFreeGB: 180, os: "<os + kernel>" },
  toolVersions: { python: "3.11.x", torch: "2.x.x", cuda: "12.x", ollama: "0.x.x", llamaCpp: "<commit or build>" },
  determinism: { seed: 42, device: "cuda:0", backend: "inductor", deterministicAlgorithms: true, note: "PyTorch does not guarantee cross-release/platform/device reproducibility; this stamps the exact environment." },
  dataset: { datasetSha: "sha256:...", acceptedCount: 11, rejectedCount: 1, holdoutSplit: "10%", tokenEstimate: 5632 },
  fineTune: { step: 500, totalSteps: 500, loss: 0.71, checkpointPath: "./artifacts/<tag>/checkpoint-500", resumeFromCheckpoint: true, rngStatePreserved: true },
  artifact: { path: "./artifacts/<tag>/model.q4_k_m.gguf", sha256: "<sha>", quantization: "q4_k_m", quantSourceBytes: 16000000000, quantOutputBytes: 4400000000 },
  serving: { adapter: "ollama", servedModelTag: "workspace-local-tuned-v1", endpoint: "http://127.0.0.1:11434/v1/chat/completions", continuousBatching: false, speculative: null },
  firstInvocation: { httpStatus: 200, servedModel: "workspace-local-tuned-v1", expectedTag: "workspace-local-tuned-v1", baseModel: "gemma3", notBaseModel: true, done: true, latencyMs: 1180, responseBody: "<actual chat-completions body>" },
  proof: { outputHash: "<sha>", screenshot: "operator/first-invocation.png", readback: "operator/first-invocation.json" },
};

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const arg = process.argv[2];
  if (arg === "--self-test") {
    const good = validateOperatorProof(OPERATOR_PROOF_TEMPLATE);
    if (!good.ok) { console.error("FAIL self-test: template should be valid but:", good.errors); process.exit(1); }
    // A missing field must fail — the gate must actually bite.
    const broken = JSON.parse(JSON.stringify(OPERATOR_PROOF_TEMPLATE)); delete broken.artifact.sha256;
    const bad = validateOperatorProof(broken);
    if (bad.ok) { console.error("FAIL self-test: gate did not catch a missing artifact.sha256"); process.exit(1); }
    // A base-model response must fail (demotion honesty).
    const demoted = JSON.parse(JSON.stringify(OPERATOR_PROOF_TEMPLATE)); demoted.firstInvocation.servedModel = "gemma3"; demoted.firstInvocation.notBaseModel = false;
    if (validateOperatorProof(demoted).ok) { console.error("FAIL self-test: gate did not catch base-model demotion"); process.exit(1); }
    console.log("PASS operator-proof-contract self-test: template valid; missing-field and base-model-demotion both correctly rejected.");
    process.exit(0);
  }
  const file = arg || "docs/proofs/custom-model-pipeline/operator-proof.json";
  if (!fs.existsSync(file)) {
    console.log(`operator proof not submitted yet (${path.relative(process.cwd(), file)}) — deferred real-machine step is unfilled; contract validator is a no-op skip until it lands.`);
    process.exit(0);
  }
  const { ok, errors } = validateOperatorProof(JSON.parse(fs.readFileSync(file, "utf8")));
  if (!ok) { console.error(`operator proof INVALID (${file}):`); errors.forEach((e) => console.error("  -", e)); process.exit(1); }
  console.log(`operator proof VALID (${file}) — all contract fields present and self-consistent.`);
}
