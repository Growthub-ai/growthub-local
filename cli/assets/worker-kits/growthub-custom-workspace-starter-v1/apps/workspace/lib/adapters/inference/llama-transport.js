/** Runtime transport joining the generic gateway to the supervised pool. */

import { fileURLToPath } from "node:url";
import { delimiter } from "node:path";
import {
  INFERENCE_MAX_RESPONSE_BYTES,
  readOpenAiStream,
  readResponseTextBounded,
} from "./gateway.js";
import {
  getLlamaCppProcessPool,
  selectPhasePool,
} from "./llama-cpp.js";

function clean(value) {
  return String(value || "").trim();
}

function localArtifactPath(ref) {
  const direct = clean(ref?.path || ref?.artifactPath || ref?.artifact_ref?.path || ref?.adapter_ref?.path);
  if (direct) return direct;
  const uri = clean(ref?.uri || ref?.artifact_ref?.uri || ref?.adapter_ref?.uri);
  if (uri.startsWith("file://")) return fileURLToPath(uri);
  if (uri && !/^[a-z][a-z0-9+.-]*:\/\//i.test(uri)) return uri;
  return "";
}

function baseModelSpec(runtime) {
  const source = runtime?.model || runtime?.baseModel || {};
  return {
    path: localArtifactPath(source),
    sha256: clean(source.sha256 || source.modelSha256 || source.base_model_sha256 || source.artifact_ref?.sha256),
  };
}

function adapterSpecs(runtime) {
  const source = runtime?.allowedAdapters || runtime?.loraAdapters || [];
  return (Array.isArray(source) ? source : []).map((adapter) => ({
    ref: clean(adapter.ref || adapter.loraRef || adapter.lora_ref || adapter.lora_id || adapter.adapter_ref?.id),
    path: localArtifactPath(adapter),
    sha256: clean(adapter.sha256 || adapter.adapterSha256 || adapter.adapter_sha256 || adapter.adapter_ref?.sha256),
    defaultScale: Number(adapter.defaultScale ?? adapter.scale ?? 1),
  }));
}

function selectedLoraRef(request) {
  return clean(request.loraRef?.lora_id || request.loraRef?.loraId || request.loraRef?.id || request.loraRef);
}

function parsedJson(text) {
  try { return JSON.parse(text); } catch { return text; }
}

function boundedOperatorInteger(value, fallback, { min, max, field }) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new TypeError(`${field} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function operatorArtifactRoots(env) {
  const roots = clean(env.GROWTHUB_LLAMA_ARTIFACT_ROOTS)
    .split(delimiter)
    .map((value) => value.trim())
    .filter(Boolean);
  if (roots.length === 0 && String(env.GROWTHUB_LLAMA_ALLOW_UNCONFINED_ARTIFACTS || "").toLowerCase() !== "true") {
    throw new TypeError("GROWTHUB_LLAMA_ARTIFACT_ROOTS must contain at least one operator-approved directory");
  }
  return roots;
}

function operatorServerConfig(env) {
  const raw = clean(env.GROWTHUB_LLAMA_SERVER_CONFIG_JSON);
  if (!raw) return {};
  let parsed;
  try { parsed = JSON.parse(raw); } catch {
    throw new TypeError("GROWTHUB_LLAMA_SERVER_CONFIG_JSON must be valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("GROWTHUB_LLAMA_SERVER_CONFIG_JSON must be a role-to-settings object");
  }
  return parsed;
}

function operatorPoolOptions({ env, fetchImpl }) {
  return {
    binary: clean(env.LLAMA_SERVER_BIN || "llama-server"),
    maxInstances: boundedOperatorInteger(env.GROWTHUB_LLAMA_MAX_INSTANCES, 4, {
      min: 1, max: 32, field: "GROWTHUB_LLAMA_MAX_INSTANCES",
    }),
    allowedArtifactRoots: operatorArtifactRoots(env),
    serverConfigByRole: operatorServerConfig(env),
    fetchImpl: fetchImpl || globalThis.fetch,
  };
}

/**
 * Build one transport function. The configuration comes from governed API
 * Registry metadata; request-supplied paths are never added to allowedAdapters.
 */
export function createLlamaCppTransport({ control = {}, pool, fetchImpl, env = process.env } = {}) {
  const runtime = control.runtime && typeof control.runtime === "object" ? control.runtime : control;
  const routing = control.routing && typeof control.routing === "object" ? control.routing : {};
  let processPool = pool || null;
  return async function llamaCppTransport({
    request,
    requestBody,
    traceContext,
    prefixHash,
    onDelta,
    signal,
    maxResponseBytes = INFERENCE_MAX_RESPONSE_BYTES,
  }) {
    try {
      if (!processPool) {
        processPool = getLlamaCppProcessPool(operatorPoolOptions({ env, fetchImpl }));
      }
      const model = baseModelSpec(runtime);
      const allowedAdapters = adapterSpecs(runtime);
      const loraRef = selectedLoraRef(request);
      const loraScale = request.loraRef?.scale;
      const poolRole = request.phasePoolHint || selectPhasePool({
        contextTokens: request.contextTokens,
        stream: request.stream,
        thresholdTokens: Number(routing.splitThresholdTokens) || 2048,
        nativeDisaggregationRequired: routing.nativeDisaggregationRequired === true,
      });
      const exactConfiguration = {
        model,
        allowedAdapters,
        loraRef,
        loraScale,
        poolRole,
        contextTokens: request.contextTokens,
        stream: request.stream,
        prefixHash,
        cacheTypeK: clean(runtime.cacheTypeK || ""),
        aliasPrefix: clean(runtime.aliasPrefix || "growthub"),
        servedAlias: clean(runtime.servedAlias || ""),
        nativeDisaggregationRequired: routing.nativeDisaggregationRequired === true,
      };
      let selected = processPool.select(exactConfiguration);
      if (!selected) {
        selected = await processPool.ensure(exactConfiguration);
      }
      const dispatch = await processPool.dispatch(selected.instanceId, {
        body: { ...requestBody, cache_prompt: request.nativePrefixCache },
        loraRef,
        loraScale,
        prefixHash,
        headers: {
          traceparent: traceContext.traceparent,
          ...(request.tracestate ? { tracestate: request.tracestate } : {}),
        },
        signal,
        nativeDisaggregationRequired: routing.nativeDisaggregationRequired === true,
      });
      let responseBody;
      let ok = dispatch.response.ok;
      let error = "";
      try {
        if (request.stream && dispatch.response.ok) {
          const streamed = await readOpenAiStream(dispatch.response, {
            onDelta,
            bufferOutput: Boolean(request.schemaContract) || request.tools.length > 0,
            maxBytes: maxResponseBytes,
          });
          ok = streamed.ok;
          responseBody = streamed.response;
          error = streamed.error || "";
        } else {
          responseBody = parsedJson(await readResponseTextBounded(dispatch.response, { maxBytes: maxResponseBytes }));
          error = dispatch.response.ok ? "" : String(responseBody?.error?.message || `HTTP ${dispatch.response.status}`);
        }
      } finally {
        dispatch.release({ warm: ok && dispatch.response.ok && request.nativePrefixCache });
      }
      const cachedTokens = Number(
        responseBody?.timings?.cache_n
          ?? responseBody?.usage?.prompt_tokens_details?.cached_tokens
          ?? responseBody?.usage?.cached_tokens,
      ) || 0;
      return {
        ok: Boolean(ok && dispatch.response.ok),
        status: dispatch.response.status,
        response: responseBody,
        error,
        providerKind: "llama.cpp-server",
        schemaEngine: request.schemaContract
          ? clean(runtime.schemaEngine || "llama.cpp-builtin-json-schema-grammar")
          : "",
        schemaGenerationEnforced: Boolean(request.schemaContract),
        identity: {
          verified: true,
          baseModelSha256: selected.modelSha256,
          adapterSha256: selected.adapterSha256 || "",
          adapterId: selected.loraRef || "",
          adapterScale: selected.loraScale ?? null,
          servedAlias: selected.alias,
          instanceId: selected.instanceId,
        },
        routing: {
          status: "unified",
          poolRole: selected.poolRole.replace(/_pool$/, ""),
          poolId: selected.poolRole,
          instanceId: selected.instanceId,
          endpointRef: selected.baseUrl,
          warmPrefix: dispatch.instance?.warmPrefix ?? selected.warmPrefix,
          splitThresholdTokens: Number(routing.splitThresholdTokens) || 2048,
          nativeDisaggregation: false,
          reason: "stock llama.cpp combined execution on a workload-optimized pool",
        },
        nativeCache: {
          enabled: request.nativePrefixCache,
          cacheTypeK: clean(runtime.cacheTypeK || "upstream-default"),
          cachedTokens,
        },
        coldStart: selected.coldStart,
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        response: null,
        error: String(error?.message || "llama.cpp adapter failed"),
        code: String(error?.code || "LLAMA_CPP_ADAPTER_FAILED"),
        providerKind: "llama.cpp-server",
        routing: { status: "failed", poolRole: "unified", nativeDisaggregation: false },
        nativeCache: { enabled: false, cachedTokens: 0 },
      };
    }
  };
}
