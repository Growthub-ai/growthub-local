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
  return TRAINING_RUNTIME_PROFILES.find((p) => p.id === "unsloth-qlora-local") || TRAINING_RUNTIME_PROFILES[0];
}

export function resolveTrainingProfile(id) {
  return TRAINING_RUNTIME_PROFILES.find((p) => p.id === id) || defaultTrainingProfile();
}

/** Fill a profile's command/verification templates from concrete run inputs. */
function fillTemplate(value, vars) {
  return String(value || "").replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? `{{${key}}}`));
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
  return {
    profileId: profile.id,
    label: profile.label,
    runnerMode: profile.runnerMode,
    baseModel,
    datasetPath,
    outputModelTag,
    quantization,
    commands: profile.commands.map((c) => fillTemplate(c, vars)),
    importProof: profile.importProof,
    verification: {
      type: profile.verification.type,
      expectedModel: fillTemplate(profile.verification.expectedModel, vars),
    },
    missingRequirements: missing,
    ready: missing.length === 0,
  };
}
