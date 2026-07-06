/**
 * Training runtime profiles — the supportive adapter layer that describes
 * HOW a governed corpus becomes a model artifact, mirroring the
 * fine-tune-targets.js posture exactly: the workspace selects a profile by
 * id; the profile describes the runtime; nothing here mutates governance,
 * contracts, or schemas, and nothing here executes.
 *
 * A profile is NOT a hosted bridge feature. It is a local Growthub Local
 * description of a training/import substrate. Compute may run through a
 * local command, a container, a manual attestation, or a compatible
 * runtime — but the Growthub Local module owns the lifecycle, the run
 * receipt, the artifact identity, and the verification expectation. The
 * profile is the contract that makes that ownership concrete without
 * pretending the workspace runtime trains the weights itself.
 *
 * Each profile feeds two pure consumers:
 *   - buildTrainingRunConfig() → the run config + receipt scaffold the
 *     Training Runtime modal records (a prepared `model-training-run`).
 *   - importProof / verification → the floors training-artifacts.js and
 *     training-verification.js enforce before a run advances past
 *     `trained` / `imported`.
 */

export const TRAINING_RUN_PROFILE_SCHEMA = "growthub-local-training-profile-v1";

export const TRAINING_RUNTIME_PROFILES = [
  {
    // The one-click default: the WHOLE local pipeline in one ordered, atomic
    // sandbox run — QLoRA fine-tune → merge → GGUF convert → imatrix →
    // quantize → ollama create. Steps are ARGV specs (bin + args[]), never
    // shell strings: user-influenced values (paths, tags, quant) are argv
    // elements the runner passes to execFile — no shell parses them.
    //
    // Honest naming: dataset distillation is the pre-runner trace-curation
    // pass (training-ledger), so this runner is NOT named distill-driven and
    // never stamps a `distilling` stage it does not perform. It starts at
    // fine-tuning.
    id: "unsloth-qlora-quantize-pipeline",
    label: "Local pipeline — QLoRA → quantize → serve (one click)",
    description:
      "The full no-code pipeline on the local runner: QLoRA fine-tune over the curated corpus, merge, convert to GGUF, build an importance matrix, quantize to the chosen level, and register the served Ollama model. Emits a quantized, callable local model.",
    input: "growthub-local-intelligence-trace-v1.jsonl",
    outputs: ["ollama-model"],
    requires: ["baseModel", "datasetPath", "outputModelTag"],
    runnerMode: "local-command",
    // Argv step specs mapped to the canonical progress stages. `bin` is
    // allowlisted; `args` tokens are single argv elements (values templated in
    // whole, never concatenated into a shell line).
    steps: [
      { stageId: "fine-tuning", label: "Fine-tuning (QLoRA)", bin: "python", args: ["train.py", "--dataset", "{{datasetPath}}", "--base", "{{baseModel}}", "--out", "{{artifactPath}}/adapter"] },
      { stageId: "fine-tuning", label: "Merging adapter", bin: "python", args: ["merge_and_export.py", "--base", "{{baseModel}}", "--adapter", "{{artifactPath}}/adapter", "--out", "{{artifactPath}}/merged"] },
      { stageId: "converting", label: "Converting to GGUF", bin: "python", args: ["convert_hf_to_gguf.py", "{{artifactPath}}/merged", "--outfile", "{{artifactPath}}/model.f16.gguf"] },
      { stageId: "quantizing", label: "Building importance matrix", bin: "./llama-imatrix", args: ["-m", "{{artifactPath}}/model.f16.gguf", "-f", "{{datasetPath}}", "-o", "{{artifactPath}}/imatrix.dat"] },
      { stageId: "quantizing", label: "Quantizing {{quantization}}", bin: "./llama-quantize", args: ["--imatrix", "{{artifactPath}}/imatrix.dat", "{{artifactPath}}/model.f16.gguf", "{{artifactPath}}/model.{{quantization}}.gguf", "{{quantization}}"] },
      { stageId: "serving", label: "Registering local model", bin: "ollama", args: ["create", "{{outputModelTag}}", "-f", "{{artifactPath}}/Modelfile"] },
    ],
    importProof: { artifactPathRequired: true, sha256Required: true, modelTagRequired: true, quantProofRequired: true },
    verification: { type: "api-registry-chat-completion", expectedModel: "{{outputModelTag}}" },
  },
  {
    id: "unsloth-qlora-local",
    label: "Unsloth QLoRA (local)",
    description:
      "QLoRA fine-tune over the exported corpus on a local GPU/CPU runner. Emits an adapter, a merged model, or a GGUF for Ollama import.",
    input: "growthub-local-intelligence-trace-v1.jsonl",
    outputs: ["adapter", "merged-model", "gguf"],
    requires: ["baseModel", "datasetPath", "outputModelTag"],
    runnerMode: "local-command",
    commands: [
      "python train.py --dataset {{datasetPath}} --base {{baseModel}} --out {{artifactPath}}",
    ],
    importProof: { artifactPathRequired: true, sha256Required: true, modelTagRequired: true },
    verification: { type: "api-registry-chat-completion", expectedModel: "{{outputModelTag}}" },
  },
  {
    id: "llama-cpp-gguf-import",
    label: "llama.cpp GGUF import",
    description:
      "Convert/quantize tuned weights to GGUF with llama.cpp, then import the quantized artifact identity back into the ledger.",
    input: "merged-model | adapter",
    outputs: ["gguf"],
    requires: ["baseModel", "outputModelTag"],
    runnerMode: "local-command",
    commands: [
      "python convert_hf_to_gguf.py {{artifactPath}} --outfile {{artifactPath}}.gguf",
      "./llama-quantize {{artifactPath}}.gguf {{artifactPath}}.{{quantization}}.gguf {{quantization}}",
    ],
    importProof: { artifactPathRequired: true, sha256Required: true, modelTagRequired: true },
    verification: { type: "api-registry-chat-completion", expectedModel: "{{outputModelTag}}" },
  },
  {
    id: "ollama-modelfile-import",
    label: "Ollama Modelfile import",
    description:
      "Create a named Ollama model from a Modelfile that references the tuned GGUF, then register the local :11434 endpoint.",
    input: "gguf",
    outputs: ["ollama-model"],
    requires: ["outputModelTag"],
    runnerMode: "local-command",
    commands: ["ollama create {{outputModelTag}} -f ./Modelfile"],
    importProof: { artifactPathRequired: false, sha256Required: false, modelTagRequired: true },
    verification: { type: "api-registry-chat-completion", expectedModel: "{{outputModelTag}}" },
  },
  {
    id: "openai-compatible-endpoint-import",
    label: "OpenAI-compatible endpoint import",
    description:
      "Point at an already-served tuned model on a vLLM / LM Studio / managed OpenAI-compatible runtime. No local artifact file — identity is the served model tag.",
    input: "served-endpoint",
    outputs: ["openai-compatible-endpoint"],
    requires: ["outputModelTag"],
    runnerMode: "compatible-runtime",
    commands: [],
    importProof: { artifactPathRequired: false, sha256Required: false, modelTagRequired: true },
    verification: { type: "api-registry-chat-completion", expectedModel: "{{outputModelTag}}" },
  },
  {
    id: "manual-artifact-attestation",
    label: "Manual artifact attestation",
    description:
      "Attest an artifact trained out-of-band. Requires a recorded artifact path + sha256 + model tag so the import is provable, never assumed.",
    input: "external",
    outputs: ["adapter", "gguf", "merged-model"],
    requires: ["outputModelTag", "artifactPath", "sha256"],
    runnerMode: "manual-attested",
    commands: [],
    importProof: { artifactPathRequired: true, sha256Required: true, modelTagRequired: true },
    verification: { type: "api-registry-chat-completion", expectedModel: "{{outputModelTag}}" },
  },
];

export function defaultTrainingProfile() {
  // The one-click default is the full pipeline (fine-tune → quantize → serve),
  // so a single click produces a served, quantized model — not a bare adapter.
  return TRAINING_RUNTIME_PROFILES.find((p) => p.id === "unsloth-qlora-quantize-pipeline") || TRAINING_RUNTIME_PROFILES[0];
}

export function resolveTrainingProfile(id) {
  return TRAINING_RUNTIME_PROFILES.find((p) => p.id === id) || defaultTrainingProfile();
}

/** Fill a profile's command/verification templates from concrete run inputs. */
function fillTemplate(value, vars) {
  return String(value || "").replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? `{{${key}}}`));
}

// --- Command-safety layer (no shell-string execution of user-influenced values) ---

/** Binaries the local runner is permitted to execFile. Nothing else runs. */
export const ALLOWED_PIPELINE_BINS = ["python", "python3", "ollama", "./llama-quantize", "./llama-imatrix"];

/** A tuned model tag / quant level must be a safe token (no shell metachars). */
export function isSafeModelTag(tag) {
  return /^[A-Za-z0-9._:\/-]{1,128}$/.test(String(tag || ""));
}

/**
 * A pipeline artifact/dataset path must stay inside the workspace: relative,
 * no `..` traversal, no absolute or home paths. Returns true when contained.
 */
export function isContainedPath(p) {
  const s = String(p || "").trim();
  if (!s) return false;
  if (s.startsWith("/") || s.startsWith("~")) return false;
  return !s.split("/").some((seg) => seg === "..");
}

/** Shell-escape a single argv token for HUMAN PREVIEW only (never execution). */
function previewToken(tok) {
  return /^[A-Za-z0-9._:\/=-]+$/.test(tok) ? tok : `'${String(tok).replace(/'/g, "'\\''")}'`;
}

/**
 * Resolve a profile's argv step specs into concrete { stageId, label, bin,
 * args[] } + a human preview string, and validate command safety. Pure.
 * Returns { resolvedSteps, commands (preview), stageIds, safety }.
 */
function resolveSteps(profile, vars) {
  if (!Array.isArray(profile.steps)) return { resolvedSteps: [], commands: [], stageIds: [], safety: { ok: true, reasons: [] } };
  const reasons = [];
  if (!isSafeModelTag(vars.outputModelTag)) reasons.push(`unsafe model tag "${vars.outputModelTag}"`);
  if (!isSafeModelTag(vars.quantization)) reasons.push(`unsafe quantization "${vars.quantization}"`);
  for (const [k, v] of [["datasetPath", vars.datasetPath], ["artifactPath", vars.artifactPath]]) {
    if (v && !isContainedPath(v)) reasons.push(`unsafe ${k} "${v}" (must stay inside the workspace)`);
  }
  const resolvedSteps = profile.steps.map((step) => {
    const bin = String(step.bin || "");
    const args = (Array.isArray(step.args) ? step.args : []).map((a) => fillTemplate(a, vars));
    if (!ALLOWED_PIPELINE_BINS.includes(bin)) reasons.push(`binary "${bin}" is not allowlisted`);
    return { stageId: String(step.stageId || ""), label: fillTemplate(step.label || bin, vars), bin, args };
  });
  const commands = resolvedSteps.map((s) => [s.bin, ...s.args].map(previewToken).join(" "));
  return { resolvedSteps, commands, stageIds: resolvedSteps.map((s) => s.stageId), safety: { ok: reasons.length === 0, reasons } };
}

/**
 * Build the run config the Training Runtime modal records when a user
 * prepares a training run. Pure: no fetch, no fs, no execution — it only
 * resolves the profile templates into the concrete commands + the
 * verification expectation, plus the import floors the artifact must clear.
 *
 * Returns the shape the modal stamps into a `model-training-run` receipt
 * (status `prepared`); the run never reads as `trained` from this alone.
 */
export function buildTrainingRunConfig({
  profileId,
  baseModel = "",
  datasetPath = "",
  outputModelTag = "",
  artifactPath = "",
  quantization = "q4_k_m",
} = {}) {
  const profile = resolveTrainingProfile(profileId);
  const vars = { baseModel, datasetPath, outputModelTag, artifactPath, quantization };
  const missing = profile.requires.filter((key) => !String(vars[key] || "").trim());
  // Argv step profiles (the one-click pipeline) resolve to structured specs +
  // a safety verdict; legacy string-command profiles keep their shell preview.
  const { resolvedSteps, commands: stepCommands, stageIds, safety } = resolveSteps(profile, vars);
  const legacyCommands = Array.isArray(profile.commands) ? profile.commands.map((c) => fillTemplate(c, vars)) : [];
  const commands = resolvedSteps.length ? stepCommands : legacyCommands;
  const stageLabels = resolvedSteps.length
    ? resolvedSteps.map((s) => s.label)
    : (Array.isArray(profile.stageLabels) ? profile.stageLabels : legacyCommands).map((s) => fillTemplate(s, vars));
  return {
    profileId: profile.id,
    label: profile.label,
    runnerMode: profile.runnerMode,
    baseModel,
    datasetPath,
    outputModelTag,
    artifactPath,
    quantization,
    // Preview strings (display only) + the ARGV steps the runner execFiles.
    commands,
    steps: resolvedSteps,
    stageIds,
    stageLabels,
    commandSafety: safety,
    importProof: profile.importProof,
    verification: {
      type: profile.verification.type,
      expectedModel: fillTemplate(profile.verification.expectedModel, vars),
    },
    missingRequirements: missing,
    // Not ready if a requirement is missing OR a command-safety check failed.
    ready: missing.length === 0 && safety.ok,
  };
}
