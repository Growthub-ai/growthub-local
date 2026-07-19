/**
 * Fine-tune deployment targets — supportive adapter layer OUTSIDE the
 * workspace configuration (the same posture as persistence adapters and
 * local agent hosts: the workspace selects by id; the adapter describes
 * the runtime; nothing here conflicts with governance, contracts, or
 * schemas).
 *
 * Targets are OpenAI-compatible chat-completions runtimes. First-party
 * default is local Ollama (the runtime the native-intelligence provider
 * already speaks: base http://127.0.0.1:11434/v1). Remote/self-hosted
 * runtimes register the same way — agnostic by construction.
 *
 * The chosen target shapes the API Registry row the handoff scaffolds:
 * {baseUrl, endpoint, method, authRef} — exactly the columns the registry
 * object already uses. requiredEnv mirrors the persistence-adapter
 * convention surfaced by /api/workspace/env-status.
 */

export const LLAMA_CPP_LOCAL_TARGET_ID = "llama-cpp-local";
export const LLAMA_CPP_INFERENCE_CONTROL_PLANE_SCHEMA = "growthub-inference-control-plane-v1";

const SHA256_HEX = /^[a-f0-9]{64}$/;
const LLAMA_CACHE_TYPES = new Set(["", "f32", "f16", "bf16", "q8_0", "q4_0", "q4_1", "iq4_nl", "q5_0", "q5_1"]);

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredText(value, field, { maxLength = 4096 } = {}) {
  const text = String(value ?? "").trim();
  if (!text) throw new TypeError(`${field} is required`);
  if (text.length > maxLength || /[\0\r\n]/.test(text)) {
    throw new TypeError(`${field} contains unsupported characters or is too long`);
  }
  return text;
}

function normalizedSha256(value, field) {
  const sha256 = requiredText(value, field, { maxLength: 80 }).toLowerCase().replace(/^sha256:/, "");
  if (!SHA256_HEX.test(sha256)) throw new TypeError(`${field} must be a 64-character SHA-256 hex digest`);
  return sha256;
}

function localGgufPath(value, field) {
  const artifactPath = requiredText(value, field);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(artifactPath) && !artifactPath.toLowerCase().startsWith("file://")) {
    throw new TypeError(`${field} must be a local path or file:// URI`);
  }
  if (!artifactPath.toLowerCase().endsWith(".gguf")) {
    throw new TypeError(`${field} must identify a GGUF file; PEFT/safetensors directories are not llama.cpp LoRA artifacts`);
  }
  return artifactPath;
}

function normalizedScale(value, field) {
  const scale = value === undefined || value === null || value === "" ? 1 : Number(value);
  if (!Number.isFinite(scale)) throw new TypeError(`${field} must be a finite number`);
  if (scale < -16 || scale > 16) throw new TypeError(`${field} must be between -16 and 16`);
  return scale;
}

function servedModelAlias(value) {
  const alias = requiredText(value, "servedAlias", { maxLength: 128 });
  if (!/^[A-Za-z0-9._+:\/@-]+$/.test(alias)) {
    throw new TypeError("servedAlias contains unsupported characters");
  }
  return alias;
}

function normalizeBaseGguf(baseModel) {
  if (!plainObject(baseModel)) throw new TypeError("baseModel must be a separately proven GGUF artifact");
  const path = localGgufPath(baseModel.path ?? baseModel.artifactPath, "baseModel.path");
  const sha256 = normalizedSha256(baseModel.sha256 ?? baseModel.baseModelSha256, "baseModel.sha256");
  const modelId = String(baseModel.id ?? baseModel.modelId ?? `gguf-${sha256.slice(0, 16)}`).trim();
  if (!modelId || modelId.length > 256 || /[\0\r\n]/.test(modelId)) throw new TypeError("baseModel.id is invalid");
  return { modelId, path, sha256 };
}

function normalizeLoraGgufs(loraAdapters) {
  if (!Array.isArray(loraAdapters)) throw new TypeError("loraAdapters must be an array");
  const ids = new Set();
  return loraAdapters.map((adapter, index) => {
    if (!plainObject(adapter)) throw new TypeError(`loraAdapters[${index}] must be a separately proven llama.cpp LoRA GGUF artifact`);
    const id = requiredText(adapter.id ?? adapter.ref ?? adapter.loraId, `loraAdapters[${index}].id`, { maxLength: 256 });
    if (!/^[A-Za-z0-9._:-]+$/.test(id)) throw new TypeError(`loraAdapters[${index}].id contains unsupported characters`);
    if (ids.has(id)) throw new TypeError(`duplicate LoRA adapter id: ${id}`);
    ids.add(id);
    return {
      id,
      path: localGgufPath(adapter.path ?? adapter.artifactPath, `loraAdapters[${index}].path`),
      sha256: normalizedSha256(adapter.sha256 ?? adapter.adapterSha256, `loraAdapters[${index}].sha256`),
      scale: normalizedScale(adapter.scale ?? adapter.defaultScale, `loraAdapters[${index}].scale`),
    };
  });
}

function createLlamaCppInferenceControlPlane({
  baseModel,
  loraAdapters = [],
  defaultLoraId = "",
  servedAlias,
  cacheTypeK = "",
  cacheTtl = 0,
  semanticCache = false,
  semanticSimilarityThreshold = 0.965,
  splitThresholdTokens = 2048,
  nativeDisaggregationRequired = false,
} = {}) {
  const model = normalizeBaseGguf(baseModel);
  const adapters = normalizeLoraGgufs(loraAdapters);
  const selectedLoraId = String(defaultLoraId || "").trim();
  const selectedLora = selectedLoraId ? adapters.find((adapter) => adapter.id === selectedLoraId) : null;
  if (selectedLoraId && !selectedLora) throw new TypeError(`defaultLoraId is not in loraAdapters: ${selectedLoraId}`);
  const alias = servedModelAlias(servedAlias ?? model.modelId);
  const ttl = Number(cacheTtl);
  if (!Number.isInteger(ttl) || ttl < 0 || ttl > 86_400) throw new TypeError("cacheTtl must be an integer between 0 and 86400 seconds");
  const similarity = Number(semanticSimilarityThreshold);
  if (!Number.isFinite(similarity) || similarity <= 0 || similarity > 1) throw new TypeError("semanticSimilarityThreshold must be greater than 0 and at most 1");
  const splitAt = Number(splitThresholdTokens);
  if (!Number.isInteger(splitAt) || splitAt < 1 || splitAt > 1_000_000) throw new TypeError("splitThresholdTokens must be an integer between 1 and 1000000");
  if (nativeDisaggregationRequired === true) {
    throw new TypeError("nativeDisaggregationRequired cannot be enabled until the pinned llama.cpp runtime proves a native prefill/decode state handoff");
  }
  const normalizedCacheTypeK = String(cacheTypeK || "").trim().toLowerCase();
  if (!LLAMA_CACHE_TYPES.has(normalizedCacheTypeK)) {
    throw new TypeError("cacheTypeK is not supported by the pinned llama.cpp adapter");
  }

  const allowedAdapters = adapters.map((adapter) => ({
    ref: adapter.id,
    path: adapter.path,
    sha256: adapter.sha256,
    defaultScale: adapter.scale,
    format: "gguf",
    compatibility: "llama.cpp-lora-gguf",
  }));
  const baseModelRef = {
    model_id: model.modelId,
    format: "gguf",
    base_model_sha256: model.sha256,
    artifact_ref: {
      id: model.modelId,
      sha256: model.sha256,
      uri: model.path,
      media_type: "application/vnd.ggml.gguf",
    },
  };

  return {
    schema: LLAMA_CPP_INFERENCE_CONTROL_PLANE_SCHEMA,
    providerKind: "llama.cpp-server",
    base_model_ref: baseModelRef,
    ...(selectedLora ? {
      lora_ref: {
        lora_id: selectedLora.id,
        adapter_ref: {
          id: selectedLora.id,
          sha256: selectedLora.sha256,
          uri: selectedLora.path,
          media_type: "application/vnd.ggml.gguf",
        },
        adapter_sha256: selectedLora.sha256,
        scale: selectedLora.scale,
      },
    } : {}),
    runtime: {
      kind: "llama.cpp-server",
      // Executable path, pool capacity, artifact roots, and role tuning are
      // operator-owned environment settings. Governed workspace rows can
      // select only the verified artifacts and bounded protocol knobs below.
      servedAlias: alias,
      model: { path: model.path, sha256: model.sha256, format: "gguf" },
      allowedAdapters,
      cacheTypeK: normalizedCacheTypeK,
      artifactVerification: "sha256-reverified-before-process-start",
    },
    cache: {
      ttl,
      semantic: semanticCache === true,
      similarityThreshold: similarity,
      nativePrefix: true,
    },
    routing: {
      prefillPool: "prefill_pool",
      decodePool: "decode_pool",
      splitThresholdTokens: splitAt,
      nativeDisaggregationRequired: false,
    },
    otel: { protocol: "otlp-http", propagateTraceparent: true },
    tools: { interceptor: "openapi-governed", closedLoopReceipt: true },
  };
}

/**
 * Construct a serialized serving policy only from explicit local GGUF
 * declarations. The process pool independently resolves and hashes every file
 * again before launch; this helper never promotes a model tag or PEFT directory
 * into artifact proof.
 */
export function buildLlamaCppInferenceControlPlane(options = {}) {
  return createLlamaCppInferenceControlPlane(options);
}

/** Re-validate a serialized control-plane value before it enters a row. */
export function normalizeLlamaCppInferenceControlPlane(value) {
  if (!plainObject(value) || value.schema !== LLAMA_CPP_INFERENCE_CONTROL_PLANE_SCHEMA
    || value.providerKind !== "llama.cpp-server") {
    throw new TypeError(`inferenceControlPlane must use ${LLAMA_CPP_INFERENCE_CONTROL_PLANE_SCHEMA} with providerKind llama.cpp-server`);
  }
  return createLlamaCppInferenceControlPlane({
    baseModel: {
      id: value.base_model_ref?.model_id,
      path: value.runtime?.model?.path,
      sha256: value.runtime?.model?.sha256,
    },
    loraAdapters: (value.runtime?.allowedAdapters || []).map((adapter) => ({
      id: adapter?.ref,
      path: adapter?.path,
      sha256: adapter?.sha256,
      scale: adapter?.defaultScale,
    })),
    defaultLoraId: value.lora_ref?.lora_id || "",
    servedAlias: value.runtime?.servedAlias,
    cacheTypeK: value.runtime?.cacheTypeK,
    cacheTtl: value.cache?.ttl,
    semanticCache: value.cache?.semantic,
    semanticSimilarityThreshold: value.cache?.similarityThreshold,
    splitThresholdTokens: value.routing?.splitThresholdTokens,
    nativeDisaggregationRequired: value.routing?.nativeDisaggregationRequired,
  });
}

/** Stamp a validated llama.cpp policy on an ordinary API Registry row. */
export function stampLlamaCppInferenceControlPlane(registryRow, inferenceControlPlane) {
  if (!plainObject(registryRow)) throw new TypeError("registryRow must be an object");
  const normalized = normalizeLlamaCppInferenceControlPlane(inferenceControlPlane);
  return {
    ...registryRow,
    metadata: {
      ...(plainObject(registryRow.metadata) ? registryRow.metadata : {}),
      inferenceControlPlane: normalized,
    },
  };
}

export const FINE_TUNE_TARGETS = [
  {
    id: "ollama-local",
    label: "Ollama (local)",
    description: "Local OpenAI-compatible runtime — the first-party default the Local Intelligence provider already uses.",
    baseUrl: "http://127.0.0.1:11434/v1",
    endpoint: "/chat/completions",
    method: "POST",
    authRef: "",
    requiredEnv: [],
    default: true,
  },
  {
    id: "openai-compatible-remote",
    label: "OpenAI-compatible (remote)",
    description: "Any hosted OpenAI-compatible runtime (vLLM, LM Studio server, managed endpoints). Resolves base URL and key from env refs — never inline.",
    baseUrl: "",
    endpoint: "/chat/completions",
    method: "POST",
    authRef: "MODEL_RUNTIME_KEY",
    requiredEnv: ["MODEL_RUNTIME_URL", "MODEL_RUNTIME_KEY"],
    default: false,
  },
  {
    id: LLAMA_CPP_LOCAL_TARGET_ID,
    label: "llama.cpp (local, proof-gated)",
    description: "Supervised local llama-server pool. Requires an explicit base GGUF plus SHA-256 proof; LoRAs must already be llama.cpp-compatible GGUF files.",
    baseUrl: "",
    endpoint: "/v1/chat/completions",
    method: "POST",
    authRef: "",
    requiredEnv: [],
    requiresInferenceControlPlane: true,
    default: false,
  },
];

export function defaultFineTuneTarget() {
  return FINE_TUNE_TARGETS.find((t) => t.default) || FINE_TUNE_TARGETS[0];
}

export function resolveFineTuneTarget(id) {
  return FINE_TUNE_TARGETS.find((t) => t.id === id) || defaultFineTuneTarget();
}

/**
 * Scaffold the governed rows the handoff writes on final confirmation —
 * pure function so tests and the modal share one truth. Returns:
 *   - registryRow: an api-registry row invoking the tuned model
 *   - versionRow:  a model-training row versioning this fine-tune
 *   - exportStamp: predicate marking which trace rows get exported="true"
 *
 * Row shapes mirror the seeded api-registry columns and the
 * model-training columns exactly — no new schema, no new objectType.
 */
export function scaffoldHandoffRows({ slug, version, target, modelTag, datasetRecords, datasetPath, now, inferenceControlPlane = null }) {
  const at = now || new Date().toISOString();
  const integrationId = `${slug}-model`;
  // A training handoff cannot claim the future GGUF path/SHA before the
  // runner produces it. The row is scaffolded now and remains unavailable to
  // inference until import/activation stamps a proof-gated control plane.
  if (inferenceControlPlane && target?.id !== LLAMA_CPP_LOCAL_TARGET_ID) {
    throw new TypeError(`llama.cpp inferenceControlPlane requires target ${LLAMA_CPP_LOCAL_TARGET_ID}`);
  }
  let registryRow = {
    integrationId,
    authRef: target.authRef || "",
    baseUrl: target.baseUrl,
    endpoint: target.endpoint,
    method: target.method,
    status: "registered",
    lastTested: "",
    lastResponse: "",
    entityTypes: "chat-completions",
    description: `Fine-tuned workspace model ${modelTag} (v${version}) — scaffolded by the training handoff.`,
    connectorKind: target?.id === LLAMA_CPP_LOCAL_TARGET_ID ? "llama.cpp-server" : "http",
    resolverTemplateId: "custom-http",
    schemaVersion: "growthub-resolver-template-v1",
    capabilities: "chat-completions",
    executionLane: "sandbox-local",
  };
  if (inferenceControlPlane) {
    const normalizedControlPlane = normalizeLlamaCppInferenceControlPlane(inferenceControlPlane);
    if (normalizedControlPlane.runtime?.servedAlias !== String(modelTag || "").trim()) {
      throw new TypeError("llama.cpp servedAlias must exactly match the scaffolded modelTag");
    }
    registryRow = stampLlamaCppInferenceControlPlane(registryRow, normalizedControlPlane);
  }
  const versionRow = {
    Name: `${slug}-v${version}`,
    status: "prepared",
    modelVersion: `ft-${at.slice(0, 10)}-v${version}`,
    apiRegistryId: integrationId,
    deployedEndpoint: `${target.baseUrl}${target.endpoint}`,
    baseModel: "",
    localModel: modelTag,
    lastExportAt: at,
    lastExportId: `ft_${version}_${at.replace(/[:.]/g, "-")}`,
    lastSourceId: "",
    lastExportSummary: JSON.stringify({ recordCount: datasetRecords, path: datasetPath, registryId: integrationId, version }),
    description: `Fine-tune dataset v${version}: ${datasetRecords} curated records → ${modelTag}, invocable via API Registry '${integrationId}'.`,
  };
  return { registryRow, versionRow, integrationId };
}

/**
 * Rebind an attached model result across the existing governed identity chain.
 * Pure and immutable: the version row, direct API Registry record, and its
 * mothership policy always name the same exact served tag.
 */
export function rebindCustomModelServingIdentity(objects, { trainingRowId, integrationId, modelTag, inferenceControlPlane = null } = {}) {
  const normalizedControlPlane = inferenceControlPlane
    ? normalizeLlamaCppInferenceControlPlane(inferenceControlPlane)
    : null;
  const tag = String(modelTag || "").trim();
  if (!tag) return Array.isArray(objects) ? objects : [];
  if (normalizedControlPlane && normalizedControlPlane.runtime?.servedAlias !== tag) {
    throw new TypeError("llama.cpp servedAlias must exactly match the activated modelTag");
  }
  return (Array.isArray(objects) ? objects : []).map((object) => {
    if (object?.objectType === "model-training") {
      return {
        ...object,
        rows: (object.rows || []).map((row) => String(row?.Name || "") === String(trainingRowId || "")
          ? { ...row, localModel: tag, status: "imported" }
          : row),
      };
    }
    if (object?.objectType !== "api-registry") return object;
    return {
      ...object,
      rows: (object.rows || []).map((row) => {
        if (String(row?.integrationId || "") === String(integrationId || "")) {
          return {
            ...row,
            expectedModelTag: tag,
            ...(normalizedControlPlane ? {
              metadata: {
                ...(plainObject(row.metadata) ? row.metadata : {}),
                inferenceControlPlane: normalizedControlPlane,
              },
            } : {}),
          };
        }
        const proxy = row?.metadata?.mothershipProxy;
        if (!proxy || !Array.isArray(proxy.routes)
          || !proxy.routes.some((route) => String(route?.registryId || "") === String(integrationId || ""))) return row;
        return {
          ...row,
          name: tag,
          metadata: {
            ...row.metadata,
            mothershipProxy: {
              ...proxy,
              modelTag: tag,
              routes: proxy.routes.map((route) => String(route?.target || "") === "local-student"
                ? { ...route, modelTag: tag }
                : route),
            },
          },
        };
      }),
    };
  });
}
