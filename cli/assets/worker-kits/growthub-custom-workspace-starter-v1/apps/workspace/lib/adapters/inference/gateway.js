/**
 * Governed inference control plane.
 *
 * Order is intentional: normalize/hash contracts -> cache lookup -> phase-
 * aware transport -> final schema/tool validation -> cache write -> OTLP. The
 * caller persists the compact verification receipt through the existing
 * sandbox-run/source-record lane; this module creates no mutation route or
 * parallel audit store.
 */

import {
  auditToolResults,
  llamaStructuredResponseFields,
  normalizeSchemaContract,
  openApiOperations,
  preflightSchemaContract,
  projectOpenApiTools,
  sha256Hex,
  stableStringify,
  validateStructuredCompletion,
  validateToolCalls,
} from "./contracts.js";
import { getInferenceSemanticCache } from "./cache.js";
import {
  buildOtlpSpan,
  createChildTraceContext,
  createTraceContext,
  exportOtlpSpans,
  normalizeTracestate,
  parseTraceparent,
} from "./otel.js";

export const INFERENCE_RECEIPT_KIND = "growthub-inference-verification-receipt-v1";
export const INFERENCE_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
export const INFERENCE_MAX_STREAM_CHUNKS = 100_000;
const INFERENCE_MAX_TOOL_RESULTS = 64;
const INFERENCE_MAX_TOOL_RESULT_BYTES = 1024 * 1024;

function nowIso(now) {
  return new Date(Number(now()) || Date.now()).toISOString();
}

function cleanMessage(raw) {
  const message = raw && typeof raw === "object" ? raw : {};
  const next = {
    role: String(message.role || "user"),
    content: typeof message.content === "string" || message.content == null
      ? (message.content ?? "")
      : message.content,
  };
  if (message.name) next.name = String(message.name);
  if (message.tool_call_id) next.tool_call_id = String(message.tool_call_id);
  if (Array.isArray(message.tool_calls)) next.tool_calls = message.tool_calls;
  return next;
}

function normalizeMessages(messages, prompt) {
  const normalized = (Array.isArray(messages) ? messages : []).map(cleanMessage);
  if (normalized.length === 0 && String(prompt || "")) normalized.push({ role: "user", content: String(prompt) });
  return normalized;
}

function messageText(message) {
  return typeof message?.content === "string" ? message.content : stableStringify(message?.content);
}

function prefixText(messages, explicitPrefix = "") {
  const lastUser = messages.map((message, index) => ({ message, index })).filter(({ message }) => message.role === "user").at(-1)?.index ?? messages.length;
  const derived = messages.slice(0, lastUser).map((message) => `${message.role}:${messageText(message)}`).join("\n");
  // A caller hint can add stable RAG context, but cannot replace the actual
  // system/developer/history prefix used for cache isolation.
  return explicitPrefix ? `declared:${String(explicitPrefix)}\nderived:${derived}` : derived;
}

function semanticText(messages) {
  return messages.map((message) => `${message.role}:${messageText(message)}`).join("\n");
}

function estimateContextTokens(messages, explicit) {
  const supplied = Number(explicit);
  if (Number.isFinite(supplied) && supplied >= 0) return { count: Math.floor(supplied), basis: "caller-supplied" };
  const chars = semanticText(messages).length;
  return { count: Math.max(1, Math.ceil(chars / 4)), basis: "utf16-chars-div-4-estimate" };
}

function loraId(raw) {
  return String(raw?.lora_id || raw?.loraId || raw?.id || "");
}

function loraSha(raw) {
  return String(raw?.adapter_sha256 || raw?.adapterSha256 || raw?.adapter_ref?.sha256 || raw?.adapterRef?.sha256 || "").toLowerCase();
}

function baseSha(raw) {
  return String(raw?.base_model_sha256 || raw?.baseModelSha256 || raw?.artifact_ref?.sha256 || raw?.artifactRef?.sha256 || "").toLowerCase();
}

export function normalizeInferenceRequest(raw = {}, defaults = {}) {
  const request = raw && typeof raw === "object" ? raw : {};
  const messages = normalizeMessages(request.messages ?? defaults.messages, request.prompt ?? defaults.prompt);
  if (messages.length > 256 || Buffer.byteLength(stableStringify(messages), "utf8") > 1_048_576) {
    return { error: { code: "inference_request_too_large", message: "messages exceed 256 entries or 1 MiB" } };
  }
  const responseSchema = request.response_schema || request.responseSchema || request.grammar_schema || request.grammarSchema || null;
  const schemaRef = request.schema_ref || request.schemaRef || null;
  const schemaContract = normalizeSchemaContract(responseSchema, { schemaRef });
  const schemaPreflight = preflightSchemaContract(schemaContract, {
    engine: defaults.llamaCpp === true ? "llama.cpp-builtin" : "generic",
  });
  if (!schemaPreflight.ok) {
    return {
      error: {
        code: "response_schema_rejected",
        message: schemaPreflight.errors.map((item) => item.message).join("; "),
        violations: schemaPreflight.errors,
      },
    };
  }
  const requestedGrammarHash = String(request.grammar_hash || request.grammarHash || "").toLowerCase();
  if (requestedGrammarHash && schemaContract && requestedGrammarHash !== schemaContract.grammarHash) {
    return { error: { code: "grammar_hash_mismatch", message: "declared grammar_hash does not match the canonical response schema" } };
  }
  const tools = Array.isArray(request.tools) ? request.tools : [];
  const openapi = request.tool_openapi || request.toolOpenApi || request.openapi || request.tool_contract?.openapi_spec || null;
  if (tools.length > 64 || Buffer.byteLength(stableStringify({ tools, openapi }), "utf8") > 524_288) {
    return { error: { code: "tool_contract_too_large", message: "tool/OpenAPI contract exceeds 64 tools or 512 KiB" } };
  }
  const allowedOperationIds = request.tool_contract?.allowed_operation_ids || request.toolContract?.allowedOperationIds || [];
  const declaredToolNames = tools.map((tool) => String(tool?.function?.name || ""));
  const duplicateToolNames = declaredToolNames.filter((name, index) => !name || declaredToolNames.indexOf(name) !== index);
  const operationIndex = openApiOperations(openapi);
  if (duplicateToolNames.length || operationIndex.duplicateOperationIds?.length) {
    return {
      error: {
        code: "tool_contract_ambiguous",
        message: duplicateToolNames.length
          ? "tool definitions require unique non-empty function names"
          : `OpenAPI operationId values must be unique: ${operationIndex.duplicateOperationIds.join(", ")}`,
      },
    };
  }
  const projectedTools = tools.length ? tools.map((tool) => ({ type: "function", function: tool.function || tool }))
    : openapi ? projectOpenApiTools(openapi, { allowedOperationIds }) : [];
  if (projectedTools.length > 64) {
    return { error: { code: "tool_contract_too_large", message: "projected OpenAPI contract exceeds 64 tools" } };
  }
  const toolResults = Array.isArray(request.tool_results || request.toolResults) ? (request.tool_results || request.toolResults) : [];
  if (toolResults.length > INFERENCE_MAX_TOOL_RESULTS
    || Buffer.byteLength(stableStringify(toolResults), "utf8") > INFERENCE_MAX_TOOL_RESULT_BYTES) {
    return { error: { code: "tool_results_too_large", message: "tool results exceed 64 entries or 1 MiB" } };
  }
  const context = estimateContextTokens(messages, request.context_tokens ?? request.contextTokens);
  if (context.count > 1_000_000) {
    return { error: { code: "context_too_large", message: "context token hint exceeds 1,000,000" } };
  }
  const cacheTtl = Math.max(0, Math.min(86_400, Math.floor(Number(request.cache_ttl ?? request.cacheTtl ?? defaults.cacheTtl) || 0)));
  const cachePolicy = request.cache_policy || request.cachePolicy || {};
  return {
    requestId: String(request.request_id || request.requestId || defaults.requestId || `inf_${Date.now().toString(36)}`),
    modelTag: String(request.model || request.model_tag || request.modelTag || defaults.modelTag || ""),
    messages,
    stream: request.stream === true,
    maxTokens: Math.min(
      Math.max(1, Math.floor(Number(defaults.maxTokensLimit) || 32_768)),
      Math.max(1, Math.floor(Number(request.max_tokens ?? request.maxTokens ?? defaults.maxTokens) || 512)),
    ),
    temperature: Number.isFinite(Number(request.temperature ?? defaults.temperature)) ? Number(request.temperature ?? defaults.temperature) : 0,
    baseModelRef: request.base_model_ref || request.baseModelRef || defaults.baseModelRef || null,
    adapterRef: request.adapter_ref || request.adapterRef || defaults.adapterRef || null,
    loraRef: request.lora_ref ?? request.loraRef ?? defaults.loraRef ?? null,
    schemaContract,
    schemaRef,
    cacheTtl,
    cacheMode: String(cachePolicy.mode || request.cache_mode || "use"),
    semanticCache: cachePolicy.semantic === true || request.semantic_cache === true,
    semanticThreshold: Number(cachePolicy.similarity_threshold ?? request.semantic_threshold) || 0.965,
    nativePrefixCache: cachePolicy.native_prefix_cache !== false && request.native_prefix_cache !== false,
    traceparent: String(request.otel_traceparent || request.traceparent || defaults.traceparent || ""),
    tracestate: normalizeTracestate(request.otel_tracestate || request.tracestate || defaults.tracestate || ""),
    phasePoolHint: String(request.phase_pool || request.phasePool || ""),
    prefillPool: request.prefill_pool || request.prefillPool || defaults.prefillPool || null,
    decodePool: request.decode_pool || request.decodePool || defaults.decodePool || null,
    contextTokens: context.count,
    contextTokenBasis: context.basis,
    prefix: prefixText(messages, request.context_prefix || request.contextPrefix || ""),
    tools: projectedTools,
    openapi,
    allowedOperationIds: Array.isArray(allowedOperationIds) ? allowedOperationIds.map(String) : [],
    toolChoice: request.tool_choice || request.toolChoice || (projectedTools.length ? "auto" : undefined),
    toolResults,
    priorReceiptId: String(request.prior_receipt_id || request.priorReceiptId || ""),
    metadata: request.metadata && typeof request.metadata === "object" ? request.metadata : {},
  };
}

export function buildInferenceRequestBody(request, { llamaCpp = false, nativeLora = null } = {}) {
  const body = {
    model: request.modelTag,
    messages: request.messages,
    stream: request.stream,
    max_tokens: request.maxTokens,
    temperature: request.temperature,
  };
  if (request.tools.length) {
    body.tools = request.tools;
    body.tool_choice = request.toolChoice || "auto";
  }
  if (request.schemaContract) Object.assign(body, llamaStructuredResponseFields(request.schemaContract));
  if (llamaCpp) {
    body.cache_prompt = request.nativePrefixCache;
    if (Array.isArray(nativeLora) && nativeLora.length) body.lora = nativeLora;
  }
  return body;
}

function aggregateChunk(state, payload) {
  if (payload?.usage) state.usage = payload.usage;
  if (payload?.model) state.model = payload.model;
  if (payload?.id) state.id = payload.id;
  const choice = payload?.choices?.[0];
  if (!choice) return;
  if (choice.finish_reason != null) state.finishReason = choice.finish_reason;
  const delta = choice.delta || choice.message || {};
  if (typeof delta.content === "string") state.content += delta.content;
  for (const part of Array.isArray(delta.tool_calls) ? delta.tool_calls : []) {
    const index = Number.isInteger(part?.index) ? part.index : state.toolCalls.length;
    state.toolCalls[index] = state.toolCalls[index] || { id: "", type: "function", function: { name: "", arguments: "" } };
    const target = state.toolCalls[index];
    if (part.id) target.id = String(part.id);
    if (part.type) target.type = String(part.type);
    if (part.function?.name) target.function.name += String(part.function.name);
    if (part.function?.arguments) target.function.arguments += String(part.function.arguments);
  }
}

export async function readResponseTextBounded(response, { maxBytes = INFERENCE_MAX_RESPONSE_BYTES } = {}) {
  const limit = Math.max(1024, Math.min(64 * 1024 * 1024, Math.floor(Number(maxBytes) || INFERENCE_MAX_RESPONSE_BYTES)));
  const declared = Number(response?.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw new Error(`inference response exceeds ${limit} bytes`);
  if (!response?.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > limit) throw new Error(`inference response exceeds ${limit} bytes`);
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value?.byteLength || 0;
      if (bytes > limit) {
        await reader.cancel("inference response byte limit exceeded").catch(() => {});
        throw new Error(`inference response exceeds ${limit} bytes`);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock?.();
  }
}

export async function readOpenAiStream(response, {
  onDelta,
  bufferOutput = false,
  maxBytes = INFERENCE_MAX_RESPONSE_BYTES,
  maxChunks = INFERENCE_MAX_STREAM_CHUNKS,
} = {}) {
  if (!response.body?.getReader) return { ok: false, error: "streaming response has no readable body", response: null };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let bytes = 0;
  let chunks = 0;
  const byteLimit = Math.max(1024, Math.min(64 * 1024 * 1024, Math.floor(Number(maxBytes) || INFERENCE_MAX_RESPONSE_BYTES)));
  const chunkLimit = Math.max(1, Math.min(1_000_000, Math.floor(Number(maxChunks) || INFERENCE_MAX_STREAM_CHUNKS)));
  const state = { id: "", model: "", content: "", toolCalls: [], finishReason: null, usage: null };
  const consume = (line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") return;
    let payload;
    try { payload = JSON.parse(data); } catch { return; }
    aggregateChunk(state, payload);
    if (!bufferOutput && typeof onDelta === "function") onDelta({ type: "inference.delta", payload });
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value?.byteLength || 0;
      chunks += 1;
      if (bytes > byteLimit || chunks > chunkLimit) {
        await reader.cancel("inference stream limit exceeded").catch(() => {});
        return { ok: false, error: `inference stream exceeds ${byteLimit} bytes or ${chunkLimit} chunks`, response: null };
      }
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() || "";
      for (const line of lines) consume(line);
    }
    pending += decoder.decode();
    for (const line of pending.split(/\r?\n/)) consume(line);
  } finally {
    reader.releaseLock?.();
  }
  const message = { role: "assistant", content: state.content };
  if (state.toolCalls.length) message.tool_calls = state.toolCalls.filter(Boolean);
  return {
    ok: true,
    response: {
      id: state.id,
      object: "chat.completion",
      model: state.model,
      choices: [{ index: 0, message, finish_reason: state.finishReason }],
      ...(state.usage ? { usage: state.usage } : {}),
    },
  };
}

/** Standard OpenAI-compatible transport, including SSE tool-call assembly. */
export function createOpenAiChatTransport({
  baseUrl,
  endpoint = "/chat/completions",
  fetchImpl,
  authToken = "",
  headers = {},
  providerKind = "openai-compatible",
  schemaEngine = "post-hoc",
  identity = {},
  maxResponseBytes = INFERENCE_MAX_RESPONSE_BYTES,
} = {}) {
  const url = `${String(baseUrl || "").replace(/\/+$/, "")}/${String(endpoint || "/chat/completions").replace(/^\/+/, "")}`;
  return async function openAiTransport({ request, requestBody, traceContext, onDelta, signal }) {
    const f = fetchImpl || globalThis.fetch;
    if (typeof f !== "function") return { ok: false, error: "fetch unavailable", status: 0 };
    const outboundHeaders = { "content-type": "application/json", ...headers, traceparent: traceContext.traceparent };
    if (traceContext.tracestate) outboundHeaders.tracestate = traceContext.tracestate;
    if (authToken) outboundHeaders.authorization = `Bearer ${authToken}`;
    try {
      const response = await f(url, {
        method: "POST",
        headers: outboundHeaders,
        body: JSON.stringify(requestBody),
        redirect: "error",
        signal,
      });
      if (!request.stream) {
        const text = await readResponseTextBounded(response, { maxBytes: maxResponseBytes });
        let body;
        try { body = JSON.parse(text); } catch { body = text; }
        return {
          ok: response.ok,
          status: response.status,
          response: body,
          error: response.ok ? "" : (body?.error?.message || `HTTP ${response.status}`),
          providerKind,
          schemaEngine,
          schemaGenerationEnforced: false,
          identity,
          routing: { status: "unified", poolRole: "unified", instanceId: identity.instanceId || "", nativeDisaggregation: false },
          nativeCache: { enabled: false, cachedTokens: Number(body?.timings?.cache_n || body?.usage?.prompt_tokens_details?.cached_tokens) || 0 },
        };
      }
      if (!response.ok) return { ok: false, status: response.status, error: `HTTP ${response.status}`, response: null };
      const streamed = await readOpenAiStream(response, {
        onDelta,
        // Schema output is released only after final validation; tool-call
        // deltas are released only after completed arguments pass governance.
        bufferOutput: Boolean(request.schemaContract) || request.tools.length > 0,
        maxBytes: maxResponseBytes,
      });
      return {
        ...streamed,
        status: response.status,
        providerKind,
        schemaEngine,
        schemaGenerationEnforced: false,
        identity,
        routing: { status: "unified", poolRole: "unified", instanceId: identity.instanceId || "", nativeDisaggregation: false },
        nativeCache: { enabled: false, cachedTokens: Number(streamed.response?.timings?.cache_n || streamed.response?.usage?.prompt_tokens_details?.cached_tokens) || 0 },
      };
    } catch (error) {
      return { ok: false, status: 0, response: null, error: String(error?.message || "inference request failed") };
    }
  };
}

function priorToolCalls(messages) {
  const assistant = [...messages].reverse().find((message) => message.role === "assistant" && Array.isArray(message.tool_calls));
  return assistant?.tool_calls || [];
}

function toolContractDigest(request) {
  return request.tools.length || request.openapi
    ? sha256Hex({ tools: request.tools, openapi: request.openapi, allowedOperationIds: request.allowedOperationIds })
    : "";
}

function continuationBaseMessages(messages, trustedCalls = []) {
  const currentCallIds = new Set((Array.isArray(trustedCalls) ? trustedCalls : []).map((call) => String(call?.id || "")).filter(Boolean));
  return (Array.isArray(messages) ? messages : []).filter((message) => {
    if (message?.role === "tool" && currentCallIds.has(String(message?.tool_call_id || ""))) return false;
    if (message?.role !== "assistant" || !Array.isArray(message?.tool_calls)) return true;
    return !message.tool_calls.some((call) => currentCallIds.has(String(call?.id || "")));
  });
}

function trustedContinuationCalls(request, trustedContinuation, defaults, toolContractHash) {
  if (request.toolResults.length === 0) {
    return request.priorReceiptId
      ? { ok: false, calls: [], violations: [{ code: "prior_receipt_without_results", message: "prior_receipt_id is only valid with tool_results" }] }
      : { ok: true, calls: [], violations: [] };
  }
  const trusted = trustedContinuation && trustedContinuation.trusted === true ? trustedContinuation : null;
  const violations = [];
  if (!request.priorReceiptId) violations.push({ code: "prior_receipt_required", message: "tool continuation requires prior_receipt_id" });
  if (!trusted || String(trusted.receiptId || "") !== request.priorReceiptId) {
    violations.push({ code: "prior_receipt_untrusted", message: "prior inference receipt was not resolved from server-owned source records" });
  }
  if (trusted) {
    if (String(trusted.modelTag || "") !== request.modelTag) violations.push({ code: "prior_receipt_model_mismatch", message: "prior receipt model tag does not match this continuation" });
    if (String(trusted.appScope || "workspace-wide") !== String(defaults.appScope || "workspace-wide")) violations.push({ code: "prior_receipt_app_scope_mismatch", message: "prior receipt app scope does not match this continuation" });
    if (String(trusted.integrationId || "") !== String(defaults.integrationId || "")) violations.push({ code: "prior_receipt_integration_mismatch", message: "prior receipt integration does not match this continuation" });
    if (String(trusted.baseModelSha256 || "") !== baseSha(request.baseModelRef)) violations.push({ code: "prior_receipt_base_mismatch", message: "prior receipt base-model identity does not match this continuation" });
    if (String(trusted.adapterSha256 || "") !== loraSha(request.loraRef)) violations.push({ code: "prior_receipt_adapter_mismatch", message: "prior receipt adapter identity does not match this continuation" });
    if (String(trusted.toolContractSha256 || "") !== toolContractHash) violations.push({ code: "prior_receipt_tool_contract_mismatch", message: "prior receipt tool contract does not match this continuation" });
    if (!Array.isArray(trusted.toolCalls) || trusted.toolCalls.length === 0) violations.push({ code: "prior_receipt_tool_calls_missing", message: "prior receipt has no validated tool calls awaiting results" });
    const baseMessages = continuationBaseMessages(request.messages, trusted.toolCalls);
    if (!/^[a-f0-9]{64}$/.test(String(trusted.conversationSha256 || ""))
      || sha256Hex(baseMessages) !== String(trusted.conversationSha256 || "")) {
      violations.push({ code: "prior_receipt_conversation_mismatch", message: "continuation messages do not match the conversation that produced the persisted tool call" });
    }
  }
  return { ok: violations.length === 0, calls: violations.length ? [] : trusted.toolCalls, violations };
}

function withTrustedAssistantToolCalls(request, calls) {
  if (!Array.isArray(calls) || calls.length === 0) return request;
  const callerIndependentMessages = continuationBaseMessages(request.messages, calls);
  return {
    ...request,
    messages: [...callerIndependentMessages, { role: "assistant", content: "", tool_calls: calls }],
  };
}

function withToolResults(request) {
  if (!request.toolResults.length) return request;
  const existingIds = new Set(request.messages.filter((message) => message.role === "tool").map((message) => String(message.tool_call_id || "")));
  const additions = request.toolResults.flatMap((result) => {
    const id = String(result?.tool_call_id || result?.toolCallId || "");
    if (!id || existingIds.has(id)) return [];
    const content = result?.response ?? result?.content ?? result?.body ?? null;
    return [{ role: "tool", tool_call_id: id, content: typeof content === "string" ? content : stableStringify(content) }];
  });
  return additions.length ? { ...request, messages: [...request.messages, ...additions] } : request;
}

function messagesWithinBound(messages) {
  return Array.isArray(messages)
    && messages.length <= 256
    && Buffer.byteLength(stableStringify(messages), "utf8") <= 1_048_576;
}

function identityScope(request, providerIdentity) {
  const expectedBaseSha = baseSha(request.baseModelRef);
  const expectedAdapterSha = loraSha(request.loraRef);
  const runtimeVerified = providerIdentity?.verified === true;
  const actualBaseSha = runtimeVerified ? String(providerIdentity?.baseModelSha256 || "").toLowerCase() : "";
  const actualAdapterSha = runtimeVerified ? String(providerIdentity?.adapterSha256 || "").toLowerCase() : "";
  return {
    runtimeVerified,
    expectedBaseSha,
    expectedAdapterSha,
    baseModelSha256: actualBaseSha,
    adapterSha256: actualAdapterSha,
    adapterId: String(providerIdentity?.adapterId || loraId(request.loraRef) || ""),
    adapterScale: Number(providerIdentity?.adapterScale ?? request.loraRef?.scale ?? 1),
    servedAlias: String(providerIdentity?.servedAlias || providerIdentity?.alias || ""),
    instanceId: String(providerIdentity?.instanceId || ""),
  };
}

function receiptIdentity(request, identity, grammarHash, observedModel = "") {
  const modelTagHash = sha256Hex({
    modelTag: request.modelTag,
    baseModelSha256: identity.baseModelSha256,
    adapterSha256: identity.adapterSha256,
    adapterScale: identity.adapterScale,
    grammarHash,
  });
  const hasResolvedBase = identity.runtimeVerified && /^[0-9a-f]{64}$/.test(identity.baseModelSha256);
  const adapterRequested = Boolean(request.loraRef);
  const hasResolvedAdapter = !adapterRequested || (identity.runtimeVerified && /^[0-9a-f]{64}$/.test(identity.adapterSha256));
  const baseMatches = !identity.expectedBaseSha || identity.baseModelSha256 === identity.expectedBaseSha;
  const adapterMatches = !adapterRequested || (!identity.expectedAdapterSha || identity.adapterSha256 === identity.expectedAdapterSha);
  const servedAliasMatches = !identity.runtimeVerified
    || !identity.servedAlias
    || String(observedModel || "") === identity.servedAlias;
  const mismatch = (hasResolvedBase && !baseMatches) || (hasResolvedAdapter && !adapterMatches) || !servedAliasMatches;
  return {
    status: mismatch ? "mismatch" : hasResolvedBase && hasResolvedAdapter ? "verified" : "unavailable",
    base_model_ref: request.baseModelRef,
    adapter_ref: request.adapterRef,
    lora_ref: request.loraRef,
    base_model_sha256: identity.baseModelSha256 || null,
    adapter_sha256: identity.adapterSha256 || null,
    served_alias: identity.servedAlias || null,
    model_tag: request.modelTag || null,
    model_tag_sha256: modelTagHash,
    ...(mismatch
      ? { reason: !baseMatches
          ? "resolved base-model SHA-256 does not match the governed artifact"
          : !adapterMatches
            ? "resolved adapter SHA-256 does not match the governed artifact"
            : `response model ${String(observedModel || "(missing)")} does not match the verified served alias ${identity.servedAlias}` }
      : !hasResolvedBase
        ? { reason: "runtime did not independently resolve a base-model SHA-256" }
        : !hasResolvedAdapter
          ? { reason: "runtime did not independently resolve the requested adapter SHA-256" }
          : {}),
  };
}

function routingEvidence(request, transportResult, inferenceSpan, startedAt, completedAt) {
  const routing = transportResult?.routing || {};
  if (routing.cacheReplay === true) {
    return {
      status: "unified",
      context_tokens: request.contextTokens,
      split_threshold_tokens: Number(routing.splitThresholdTokens) || 2048,
      phases: ["prefill", "decode"].map((phase) => ({
        phase,
        phase_pool: "unified_pool",
        pool_ref: null,
        status: "bypassed",
        span_id: inferenceSpan.spanId,
        started_at: startedAt,
        completed_at: completedAt,
        reason: "gateway completion-cache replay; no inference runtime executed",
      })),
      reason: "gateway completion-cache replay bypassed prefill and decode",
    };
  }
  const role = String(routing.poolRole || "unified");
  const status = routing.nativeDisaggregation === true ? "split" : "unified";
  const providerKind = String(transportResult?.providerKind || "selected transport");
  const combinedPrefillReason = providerKind === "llama.cpp-server"
    ? "combined inference; stock llama.cpp has no stable prefill/decode state handoff"
    : `combined inference; ${providerKind} did not provide a verified native prefill/decode state handoff`;
  const same = {
    pool_id: String(routing.poolId || role),
    role,
    instance_id: String(routing.instanceId || "") || undefined,
    endpoint_ref: String(routing.endpointRef || "") || undefined,
  };
  return {
    status,
    context_tokens: request.contextTokens,
    split_threshold_tokens: Number(routing.splitThresholdTokens) || 2048,
    phases: [
      {
        phase: "prefill",
        phase_pool: role === "prefill" ? "prefill_pool" : role === "decode" ? "decode_pool" : "unified_pool",
        pool_ref: same,
        status: transportResult?.ok ? "completed" : "failed",
        span_id: inferenceSpan.spanId,
        context_tokens: request.contextTokens,
        started_at: startedAt,
        completed_at: completedAt,
        reason: routing.nativeDisaggregation === true ? undefined : combinedPrefillReason,
      },
      {
        phase: "decode",
        phase_pool: role === "decode" ? "decode_pool" : role === "prefill" ? "prefill_pool" : "unified_pool",
        pool_ref: same,
        status: transportResult?.ok ? "completed" : "failed",
        span_id: inferenceSpan.spanId,
        generated_tokens: Number(transportResult?.response?.usage?.completion_tokens) || undefined,
        started_at: startedAt,
        completed_at: completedAt,
        reason: routing.nativeDisaggregation === true ? undefined : "combined inference on the selected workload-optimized instance",
      },
    ],
    ...(!routing.nativeDisaggregation ? { reason: "phase-aware pool selection with combined execution; no native state-transfer claim" } : {}),
  };
}

function cachedDelta(response, cacheKey, onDelta) {
  if (typeof onDelta !== "function") return;
  const choice = response?.choices?.[0];
  onDelta({
    type: "inference.delta",
    synthetic: true,
    headers: { "x-cache-key": cacheKey },
    payload: {
      id: response?.id,
      object: "chat.completion.chunk",
      model: response?.model,
      choices: [{ index: 0, delta: choice?.message || {}, finish_reason: choice?.finish_reason ?? "stop" }],
    },
  });
}

async function rejectedNormalizationResult({
  rawRequest,
  error,
  fetchImpl,
  env,
  now,
  serviceName,
  serviceVersion,
}) {
  const request = rawRequest && typeof rawRequest === "object" ? rawRequest : {};
  const requestId = String(request.request_id || request.requestId || `inf_${Date.now().toString(36)}`);
  const modelTag = String(request.model || request.model_tag || request.modelTag || "");
  const incomingTraceparent = String(request.otel_traceparent || request.traceparent || "");
  const incoming = parseTraceparent(incomingTraceparent);
  const rootContext = createTraceContext(incomingTraceparent, {
    tracestate: normalizeTracestate(request.otel_tracestate || request.tracestate || ""),
  });
  const atMs = now();
  const at = nowIso(() => atMs);
  const safeError = {
    code: String(error?.code || "inference_request_rejected"),
    message: String(error?.message || "inference request rejected").slice(0, 1024),
    retryable: false,
  };
  const requestSha256 = sha256Hex({
    requestId,
    modelTag,
    errorCode: safeError.code,
    grammarHash: String(request.grammar_hash || request.grammarHash || ""),
  });
  const span = buildOtlpSpan({
    context: rootContext,
    name: "growthub.inference.gateway.reject",
    kind: 2,
    startedAtMs: atMs,
    endedAtMs: now(),
    attributes: { "inference.request_sha256": requestSha256, "error.code": safeError.code },
    ok: false,
    error: safeError.message,
  });
  const otlp = await exportOtlpSpans([span], { fetchImpl, env, serviceName, serviceVersion });
  const schemaRequested = Boolean(request.response_schema || request.responseSchema || request.grammar_schema || request.grammarSchema);
  const toolRequested = Boolean((Array.isArray(request.tools) && request.tools.length) || request.tool_openapi || request.toolOpenApi || (Array.isArray(request.tool_results) && request.tool_results.length));
  const receipt = {
    kind: INFERENCE_RECEIPT_KIND,
    version: 1,
    receipt_id: `infr_${requestSha256.slice(0, 20)}_${rootContext.spanId}`,
    request_id: requestId,
    status: "rejected",
    request_sha256: requestSha256,
    conversation_sha256: null,
    output_sha256: null,
    identity: {
      status: "unavailable",
      base_model_ref: null,
      adapter_ref: null,
      lora_ref: null,
      base_model_sha256: null,
      adapter_sha256: null,
      served_alias: null,
      model_tag: modelTag || null,
      model_tag_sha256: null,
      reason: "request rejected before runtime identity resolution",
    },
    schema: schemaRequested ? {
      status: "rejected",
      schema_ref: request.schema_ref || null,
      response_schema_hash: null,
      grammar_hash: null,
      grammar_kind: "json-schema",
      enforced_during_generation: false,
      model_tag_hash_bound: false,
      output_validation_status: "not_run",
      reason: safeError.message,
    } : {
      status: "not_requested", schema_ref: null, response_schema_hash: null, grammar_hash: null,
      grammar_kind: "none", enforced_during_generation: false, model_tag_hash_bound: false,
      output_validation_status: "not_run",
    },
    cache: {
      cache_status: "BYPASS", cache_kind: "none", cache_key: null, cache_key_sha256: null,
      prefix_hash: null, cache_ttl: null, native_prefix_cache_enabled: false,
      warm_instance_selected: false, bypass_reason: "request rejected before cache lookup",
    },
    tool_audit: toolRequested ? { status: "rejected", calls: [], reason: safeError.message } : { status: "not_requested", calls: [] },
    otel: {
      status: incomingTraceparent ? (incoming ? "propagated" : "invalid") : "started",
      otel_traceparent: null,
      trace_id: rootContext.traceId,
      span_id: rootContext.spanId,
      parent_span_id: rootContext.parentSpanId || null,
      runtime_propagated: false,
      transport: otlp.endpointConfigured ? "otlp-http" : null,
      export_status: otlp.status === "exported" ? "exported" : otlp.status === "failed" ? "failed" : "unavailable",
      ...(incomingTraceparent && !incoming ? { reason: "invalid incoming traceparent; a new trace was started" } : otlp.error ? { reason: otlp.error } : {}),
    },
    routing: {
      status: "failed", context_tokens: null, split_threshold_tokens: null, phases: [],
      reason: "request rejected before routing",
    },
    errors: [safeError],
    created_at: at,
    completed_at: nowIso(now),
  };
  return {
    ok: false,
    request_id: requestId,
    requestId,
    status: "rejected",
    httpStatus: 400,
    output: null,
    response: null,
    receipt,
    headers: {},
    error: safeError,
  };
}

/** Execute one inference request through the six-capability control plane. */
export async function executeInferenceGateway({
  request: rawRequest,
  defaults = {},
  transport,
  cache,
  fetchImpl,
  env = process.env,
  onDelta,
  now = () => Date.now(),
  serviceName = "growthub-workspace-inference",
  serviceVersion = "",
  trustedContinuation = null,
  signal,
  timeoutMs = 120_000,
  maxResponseBytes = INFERENCE_MAX_RESPONSE_BYTES,
} = {}) {
  let normalized;
  try {
    normalized = normalizeInferenceRequest(rawRequest, defaults);
  } catch (error) {
    normalized = { error: { code: "inference_request_invalid", message: String(error?.message || "inference request normalization failed") } };
  }
  if (normalized.error) {
    return rejectedNormalizationResult({ rawRequest, error: normalized.error, fetchImpl, env, now, serviceName, serviceVersion });
  }
  const toolContractHash = toolContractDigest(normalized);
  const continuationTrust = trustedContinuationCalls(normalized, trustedContinuation, defaults, toolContractHash);
  const continuationRequest = continuationTrust.ok
    ? withTrustedAssistantToolCalls(normalized, continuationTrust.calls)
    : normalized;
  const earlierCalls = continuationTrust.calls.length
    ? continuationTrust.calls
    : priorToolCalls(continuationRequest.messages);
  const priorValidation = earlierCalls.length
    ? validateToolCalls({ choices: [{ message: { tool_calls: earlierCalls } }] }, {
        tools: normalized.tools,
        openapi: normalized.openapi,
        allowedOperationIds: normalized.allowedOperationIds,
      })
    : { ok: true, calls: [], violations: [] };
  const toolResultsAudit = auditToolResults(priorValidation.calls, continuationRequest.toolResults, {
    openapi: continuationRequest.openapi,
  });
  let continuationValid = continuationTrust.ok && priorValidation.ok && toolResultsAudit.ok;
  // Never expose an unvalidated/unmatched external result to the model. A
  // rejected continuation still receives a receipt below, but no transport
  // call is made.
  let request = continuationValid ? withToolResults(continuationRequest) : continuationRequest;
  const combinedMessagesValid = messagesWithinBound(request.messages);
  if (!combinedMessagesValid) {
    continuationTrust.ok = false;
    continuationValid = false;
    continuationTrust.violations.push({ code: "tool_continuation_too_large", message: "messages plus tool results exceed 256 entries or 1 MiB" });
  }
  const startedAt = nowIso(now);
  const startedAtMs = now();
  const incomingTraceContext = parseTraceparent(request.traceparent);
  const rootContext = createTraceContext(request.traceparent, { tracestate: request.tracestate });
  const spans = [];
  const errors = [];
  if (!continuationTrust.ok || !priorValidation.ok || !toolResultsAudit.ok) {
    errors.push({
      code: "tool_result_rejected",
      message: [...continuationTrust.violations, ...priorValidation.violations, ...toolResultsAudit.violations].map((item) => item.message).join("; "),
      retryable: false,
    });
  }
  const grammarHash = request.schemaContract?.grammarHash || "";
  const declaredIdentity = identityScope(request, defaults.identity || {});
  const prefixHash = sha256Hex(request.prefix);
  const requestHashInput = {
    modelTag: request.modelTag,
    messages: request.messages,
    maxTokens: request.maxTokens,
    temperature: request.temperature,
    baseModelSha256: declaredIdentity.expectedBaseSha,
    adapterSha256: declaredIdentity.expectedAdapterSha,
    adapterScale: declaredIdentity.adapterScale,
    grammarHash,
    toolContractHash,
    tenantScope: defaults.tenantScope || request.metadata?.workspace_id || "workspace-local",
    appScope: defaults.appScope || "workspace-wide",
    integrationId: defaults.integrationId || request.metadata?.integration_id || "unbound",
  };
  const requestSha256 = sha256Hex(requestHashInput);
  const scopeKey = sha256Hex({ ...requestHashInput, messages: undefined, prefixHash });
  const cacheKey = requestSha256;
  const semanticBody = semanticText(request.messages);
  const cacheClient = cache || getInferenceSemanticCache({ env, fetchImpl });
  const cacheBackend = typeof cacheClient?.describeBackend === "function"
    ? cacheClient.describeBackend()
    : { kind: "memory", remoteEnabled: false, credentialSource: "", disabledReason: "" };
  const cacheAllowed = request.cacheTtl > 0 && request.cacheMode !== "bypass" && request.tools.length === 0 && request.toolResults.length === 0;
  const cacheSpanContext = createChildTraceContext(rootContext);
  const cacheStarted = now();
  let cacheLookup = { hit: false, hitType: "", similarity: 0, entry: null };
  if (cacheAllowed && request.cacheMode !== "refresh") {
    try {
      cacheLookup = await cacheClient.lookup({
        cacheKey,
        scopeKey,
        prefixHash,
        semanticText: semanticBody,
        semantic: request.semanticCache && request.temperature === 0,
        threshold: request.semanticThreshold,
      });
    } catch (error) {
      errors.push({ code: "cache_lookup_failed", message: String(error?.message || "cache lookup failed"), retryable: true });
    }
  }
  spans.push(buildOtlpSpan({
    context: cacheSpanContext,
    name: "growthub.inference.cache.lookup",
    kind: 1,
    startedAtMs: cacheStarted,
    endedAtMs: now(),
    attributes: { "cache.hit": cacheLookup.hit, "cache.key": cacheKey, "cache.prefix_hash": prefixHash, "cache.kind": cacheLookup.hitType || "miss" },
    ok: !errors.some((error) => error.code === "cache_lookup_failed"),
  }));

  let body = null;
  let transportResult = null;
  let inferenceSpanContext = createChildTraceContext(rootContext);
  let inferenceStartedAt = nowIso(now);
  let inferenceStartedMs = now();
  const boundedTimeoutMs = Math.max(1_000, Math.min(120_000, Math.floor(Number(timeoutMs) || 120_000)));
  const deadlineController = new AbortController();
  const deadlineTimer = setTimeout(
    () => deadlineController.abort(new Error(`inference request exceeded ${boundedTimeoutMs}ms`)),
    boundedTimeoutMs,
  );
  deadlineTimer.unref?.();
  const deadlineSignal = deadlineController.signal;
  const transportSignal = signal && typeof AbortSignal.any === "function"
    ? AbortSignal.any([signal, deadlineSignal])
    : signal || deadlineSignal;
  if (!continuationValid) {
    transportResult = {
      ok: false,
      status: 400,
      response: null,
      error: errors[0]?.message || "tool continuation rejected",
      providerKind: "governed-tool-interceptor",
      routing: { status: "unified", poolRole: "unified", nativeDisaggregation: false },
      nativeCache: { enabled: false, cachedTokens: 0 },
    };
  } else if (cacheLookup.hit) {
    body = cacheLookup.entry.response;
    cachedDelta(body, cacheKey, onDelta);
    transportResult = {
      ok: true,
      status: 200,
      response: body,
      providerKind: cacheLookup.entry.metadata?.providerKind || "cached",
      schemaEngine: cacheLookup.entry.metadata?.schemaEngine || "cached-generation-proof",
      schemaGenerationEnforced: cacheLookup.entry.metadata?.schemaGenerationEnforced === true,
      identity: cacheLookup.entry.metadata?.identity || declaredIdentity,
      routing: {
        status: "bypassed",
        poolRole: "cache_replay",
        cacheReplay: true,
        nativeDisaggregation: false,
        origin: cacheLookup.entry.metadata?.routing || null,
      },
      nativeCache: { enabled: false, cachedTokens: 0 },
      coldStart: false,
    };
  } else if (typeof transport !== "function") {
    transportResult = { ok: false, status: 0, response: null, error: "inference transport is not configured" };
  } else {
    const requestBody = buildInferenceRequestBody(request, {
      llamaCpp: defaults.llamaCpp === true,
      nativeLora: defaults.nativeLora || null,
    });
    let removeAbortListener = () => {};
    try {
      const transportPromise = Promise.resolve().then(() => transport({
          request,
          requestBody,
          traceContext: inferenceSpanContext,
          prefixHash,
          onDelta,
          signal: transportSignal,
          maxResponseBytes,
        })).catch((error) => ({
          ok: false,
          status: 0,
          response: null,
          error: transportSignal.aborted
            ? `inference request exceeded ${boundedTimeoutMs}ms or was aborted`
            : String(error?.message || "inference transport failed"),
        }));
      const abortPromise = new Promise((resolve) => {
        const onAbort = () => resolve({
          ok: false,
          status: 0,
          response: null,
          error: `inference request exceeded ${boundedTimeoutMs}ms or was aborted`,
        });
        if (transportSignal.aborted) {
          onAbort();
          return;
        }
        transportSignal.addEventListener("abort", onAbort, { once: true });
        removeAbortListener = () => transportSignal.removeEventListener("abort", onAbort);
      });
      transportResult = await Promise.race([transportPromise, abortPromise]);
    } catch (error) {
      transportResult = {
        ok: false,
        status: 0,
        response: null,
        error: transportSignal.aborted
          ? `inference request exceeded ${boundedTimeoutMs}ms or was aborted`
          : String(error?.message || "inference transport failed"),
      };
    } finally {
      removeAbortListener();
    }
    body = transportResult?.response ?? null;
  }
  clearTimeout(deadlineTimer);
  const inferenceCompletedAt = nowIso(now);
  spans.push(buildOtlpSpan({
    context: inferenceSpanContext,
    name: cacheLookup.hit ? "growthub.inference.cache.replay" : "growthub.inference.runtime",
    kind: cacheLookup.hit ? 1 : 3,
    startedAtMs: inferenceStartedMs,
    endedAtMs: now(),
    attributes: {
      "inference.model": request.modelTag,
      "inference.adapter_id": loraId(request.loraRef),
      "inference.schema_hash": grammarHash,
      "inference.pool_role": transportResult?.routing?.poolRole || "unified",
      "inference.context_tokens": request.contextTokens,
      "inference.context_token_basis": request.contextTokenBasis,
      "inference.cached_tokens": Number(transportResult?.nativeCache?.cachedTokens) || 0,
      "http.status_code": Number(transportResult?.status) || 0,
    },
    ok: transportResult?.ok === true,
    error: transportResult?.error,
  }));

  if (continuationValid && (!transportResult?.ok || !body || typeof body !== "object")) {
    errors.push({ code: "inference_transport_failed", message: String(transportResult?.error || `HTTP ${transportResult?.status || 0}`), retryable: true });
  }
  const actualIdentity = identityScope(request, transportResult?.identity || declaredIdentity);
  const identityEvidence = receiptIdentity(request, actualIdentity, grammarHash, body?.model);
  const identityValid = identityEvidence.status !== "mismatch"
    && (defaults.llamaCpp !== true || identityEvidence.status === "verified");
  if (transportResult?.ok && !identityValid) {
    errors.push({
      code: "model_identity_unverified",
      message: identityEvidence.reason || "inference runtime did not prove the governed model identity",
      retryable: false,
    });
  }
  const schemaValidation = transportResult?.ok
    ? validateStructuredCompletion(body, request.schemaContract)
    : { ok: false, enforced: Boolean(request.schemaContract), errors: [] };
  if (request.schemaContract && !schemaValidation.ok) {
    errors.push({ code: "structured_output_invalid", message: `generated output failed schema validation: ${schemaValidation.errors.map((item) => item.message).join("; ")}`, retryable: true });
  }
  const schemaGenerationProven = !request.schemaContract || transportResult?.schemaGenerationEnforced === true;
  if (transportResult?.ok && request.schemaContract && !schemaGenerationProven) {
    errors.push({
      code: "schema_generation_unproven",
      message: "response schema was not proven to constrain generation at the inference runtime",
      retryable: false,
    });
  }

  const currentToolValidation = transportResult?.ok
    ? validateToolCalls(body, { tools: request.tools, openapi: request.openapi, allowedOperationIds: request.allowedOperationIds })
    : { ok: false, calls: [], violations: [], toolContractHash };
  if (!currentToolValidation.ok && currentToolValidation.violations.length) {
    errors.push({ code: "tool_call_rejected", message: currentToolValidation.violations.map((item) => item.message).join("; "), retryable: false });
  }
  for (const item of toolResultsAudit.audit) {
    const toolSpanContext = createChildTraceContext(rootContext);
    spans.push(buildOtlpSpan({
      context: toolSpanContext,
      name: `growthub.tool.${item.operationId || "unknown"}`,
      kind: 3,
      startedAtMs,
      endedAtMs: now(),
      attributes: {
        "tool.call_id": item.toolCallId,
        "tool.operation_id": item.operationId,
        "tool.arguments_sha256": item.argumentsHash,
        "tool.request_sha256": item.externalRequestHash,
        "tool.result_sha256": item.externalResultHash,
        "tool.http_status_code": item.externalStatus,
        "tool.request": stableStringify(item.externalRequest).slice(0, 4096),
        "tool.result": stableStringify(item.externalResult).slice(0, 4096),
        "tool.evidence_source": item.source,
      },
      ok: item.externalStatus >= 200 && item.externalStatus < 400,
    }));
    item.spanId = toolSpanContext.spanId;
  }

  const completedSuccessfully = transportResult?.ok === true
    && identityValid
    && schemaValidation.ok
    && schemaGenerationProven
    && currentToolValidation.ok
    && continuationTrust.ok
    && priorValidation.ok
    && toolResultsAudit.ok;
  const awaitingToolResult = completedSuccessfully && currentToolValidation.calls.length > 0;
  let cacheStoreResult = null;
  if (completedSuccessfully && !awaitingToolResult && cacheAllowed && !cacheLookup.hit) {
    try {
      cacheStoreResult = await cacheClient.store({
        cacheKey,
        scopeKey,
        prefixHash,
        semanticText: semanticBody,
        semantic: request.semanticCache && request.temperature === 0,
        response: body,
        ttlSeconds: request.cacheTtl,
        metadata: {
          providerKind: transportResult.providerKind,
          schemaEngine: transportResult.schemaEngine,
          schemaGenerationEnforced: transportResult.schemaGenerationEnforced === true,
          // Cache replay may reuse an answer only with the exact request
          // identity scope. Persist the runtime-attested fields in the same
          // provider-identity shape consumed by identityScope; storing its
          // derived `runtimeVerified` flag alone would be dropped on replay
          // and incorrectly demote a verified llama.cpp hit.
          identity: {
            verified: actualIdentity.runtimeVerified === true,
            baseModelSha256: actualIdentity.baseModelSha256,
            adapterSha256: actualIdentity.adapterSha256,
            adapterId: actualIdentity.adapterId,
            adapterScale: actualIdentity.adapterScale,
            servedAlias: actualIdentity.servedAlias,
            instanceId: actualIdentity.instanceId,
          },
          routing: transportResult.routing,
          nativeCache: transportResult.nativeCache,
        },
      });
    } catch (error) {
      errors.push({ code: "cache_store_failed", message: String(error?.message || "cache store failed"), retryable: true });
    }
  }

  const completedAt = nowIso(now);
  const rootOk = completedSuccessfully;
  spans.push(buildOtlpSpan({
    context: rootContext,
    name: "growthub.inference.gateway",
    kind: 2,
    startedAtMs,
    endedAtMs: now(),
    attributes: {
      "inference.request_sha256": requestSha256,
      "inference.output_sha256": body ? sha256Hex(body) : "",
      "inference.cache_status": cacheLookup.hit ? "HIT" : transportResult?.coldStart ? "COLD_START" : cacheAllowed ? "MISS" : "BYPASS",
      "inference.tool_contract_sha256": currentToolValidation.toolContractHash || toolContractHash,
      "inference.schema_sha256": grammarHash,
    },
    ok: rootOk,
    error: errors[0]?.message,
  }));
  const otlp = await exportOtlpSpans(spans, { fetchImpl, env, serviceName, serviceVersion });
  const schemaRequested = Boolean(request.schemaContract);
  const cacheStatus = cacheLookup.hit ? "HIT" : transportResult?.coldStart ? "COLD_START" : cacheAllowed ? "MISS" : "BYPASS";
  const remoteCacheStatus = cacheLookup.hit && cacheLookup.cacheSource === "remote"
    ? "hit"
    : cacheStoreResult?.remote || (cacheBackend.remoteEnabled ? "ready" : "disabled");
  const receipt = {
    kind: INFERENCE_RECEIPT_KIND,
    version: 1,
    receipt_id: `infr_${requestSha256.slice(0, 20)}_${rootContext.spanId}`,
    request_id: request.requestId,
    status: !completedSuccessfully ? (errors.some((error) => !error.retryable) ? "rejected" : "failed")
      : identityEvidence.status === "verified" && (!schemaRequested || schemaValidation.ok) ? "verified" : "partial",
    request_sha256: requestSha256,
    conversation_sha256: sha256Hex(request.messages),
    output_sha256: body ? sha256Hex(body) : null,
    identity: identityEvidence,
    schema: schemaRequested ? {
      status: schemaValidation.ok && schemaGenerationProven ? "enforced" : "failed",
      schema_ref: {
        ...(request.schemaContract.schemaRef || {}),
        schema_id: request.schemaContract.name,
        schema_version: request.schemaContract.version,
      },
      response_schema_hash: request.schemaContract.schemaHash,
      grammar_hash: grammarHash,
      grammar_kind: "json-schema",
      enforced_during_generation: schemaGenerationProven,
      model_tag_hash_bound: true,
      output_validation_status: schemaValidation.ok ? "valid" : "invalid",
      ...(!schemaValidation.ok
        ? { reason: "final JSON Schema validation failed" }
        : !schemaGenerationProven ? { reason: "generation-time schema enforcement was not proven" } : {}),
    } : {
      status: "not_requested", schema_ref: null, response_schema_hash: null, grammar_hash: null, grammar_kind: "none",
      enforced_during_generation: false, model_tag_hash_bound: false, output_validation_status: "not_run",
    },
    cache: {
      cache_status: cacheStatus,
      cache_kind: cacheLookup.hit ? `gateway-${cacheLookup.hitType}` : transportResult?.nativeCache?.enabled ? "llama-prefix" : "none",
      cache_key: cacheAllowed ? cacheKey : null,
      cache_key_sha256: cacheAllowed ? sha256Hex(cacheKey) : null,
      prefix_hash: prefixHash,
      cache_ttl: cacheAllowed ? request.cacheTtl : null,
      ...(cacheLookup.hitType === "semantic" ? { semantic_similarity: cacheLookup.similarity } : {}),
      semantic_cache_requested: request.semanticCache,
      semantic_cache_status: cacheLookup.hitType === "semantic" ? "hit"
        : cacheLookup.semanticUnavailable ? "unavailable"
          : request.semanticCache ? "miss" : "not_requested",
      ...(cacheLookup.semanticReason ? { semantic_cache_reason: cacheLookup.semanticReason } : {}),
      native_prefix_cache_enabled: Boolean(transportResult?.nativeCache?.enabled),
      warm_instance_selected: Boolean(transportResult?.routing?.warmPrefix),
      remote_cache_backend: cacheBackend.kind,
      remote_cache_status: remoteCacheStatus,
      remote_cache_credential_source: cacheBackend.credentialSource || null,
      cache_scope_sha256: sha256Hex(String(defaults.tenantScope || request.metadata?.workspace_id || "workspace-local")),
      ...(cacheBackend.disabledReason ? { remote_cache_reason: cacheBackend.disabledReason } : {}),
      ...(!cacheAllowed ? { bypass_reason: request.cacheTtl <= 0 ? "cache_ttl is zero" : request.tools.length ? "tool-bearing requests are not replay cached" : "cache policy bypass" } : {}),
    },
    tool_audit: request.tools.length || currentToolValidation.calls.length || request.toolResults.length ? {
      status: !continuationTrust.ok || !currentToolValidation.ok || !priorValidation.ok || !toolResultsAudit.ok ? "rejected"
        : currentToolValidation.calls.length ? "awaiting_result"
          : toolResultsAudit.audit.length ? "completed" : "no_tool_calls",
      calls: [
        ...currentToolValidation.calls.map((call) => ({
          tool_call: body?.choices?.[0]?.message?.tool_calls?.find((item) => item.id === call.toolCallId) || null,
          validation: {
            status: call.valid ? "valid" : "invalid",
            spec_sha256: currentToolValidation.toolContractHash || toolContractHash || null,
            operation_id: call.operationId || null,
            violations: currentToolValidation.violations.filter((item) => item.toolCallId === call.toolCallId),
          },
          external_request: null,
          external_result: null,
          span_id: null,
          continuation_request_id: null,
        })),
        ...toolResultsAudit.audit.map((item) => ({
          tool_call: priorToolCalls(request.messages).find((call) => call.id === item.toolCallId) || null,
          validation: { status: "valid", spec_sha256: toolContractHash || null, operation_id: item.operationId || null, violations: [] },
          external_request: {
            request_id: item.toolCallId,
            method: item.externalMethod,
            endpoint_ref: item.externalEndpointRef,
            ...(item.externalRequestHeadersHash ? { headers_sha256: item.externalRequestHeadersHash } : {}),
            body: { sha256: item.externalRequestHash, value: item.externalRequest, redacted: true },
            sent_at: item.sentAt || completedAt,
            source: item.source,
            authority: item.source === "governed-api-registry" ? "governed" : "caller-asserted",
            ...(item.executorReceiptRef ? { executor_receipt_ref: item.executorReceiptRef } : {}),
          },
          external_result: {
            request_id: item.toolCallId,
            status_code: item.externalStatus || undefined,
            ...(item.externalResponseHeadersHash ? { headers_sha256: item.externalResponseHeadersHash } : {}),
            response: { sha256: item.externalResultHash, value: item.externalResult, redacted: true },
            received_at: item.receivedAt || completedAt,
            ...(item.durationMs ? { duration_ms: item.durationMs } : {}),
          },
          span_id: item.spanId || null,
          continuation_request_id: request.requestId,
        })),
      ],
      ...(toolResultsAudit.audit.some((item) => item.source !== "governed-api-registry")
        ? { reason: "external execution result was returned by the caller and hash-correlated; no server-owned executor receipt was supplied" }
        : {}),
    } : { status: "not_requested", calls: [] },
    otel: {
      status: request.traceparent ? (incomingTraceContext ? "propagated" : "invalid") : "started",
      // Null on cache replay because no inference runtime received a header.
      // Otherwise this is the exact child context sent downstream.
      otel_traceparent: cacheLookup.hit ? null : inferenceSpanContext.traceparent,
      trace_id: rootContext.traceId,
      span_id: rootContext.spanId,
      parent_span_id: rootContext.parentSpanId || null,
      runtime_propagated: !cacheLookup.hit && transportResult?.ok === true,
      transport: otlp.endpointConfigured ? "otlp-http" : null,
      export_status: otlp.status === "exported" ? "exported" : otlp.status === "failed" ? "failed" : "unavailable",
      ...(request.traceparent && !incomingTraceContext
        ? { reason: "invalid incoming traceparent; a new trace was started" }
        : otlp.error ? { reason: otlp.error } : {}),
    },
    routing: routingEvidence(request, transportResult, inferenceSpanContext, inferenceStartedAt, inferenceCompletedAt),
    errors,
    created_at: startedAt,
    completed_at: completedAt,
  };
  return {
    ok: completedSuccessfully,
    request_id: request.requestId,
    requestId: request.requestId,
    status: !completedSuccessfully ? (receipt.status === "rejected" ? "rejected" : "failed") : awaitingToolResult ? "awaiting_tool_result" : "completed",
    httpStatus: Number(transportResult?.status) || (cacheLookup.hit ? 200 : 0),
    // A rejected schema/tool response is evidence, not releasable output.
    // Its bounded hashes/audit stay in the receipt; callers never receive the
    // raw invalid tool call or schema-breaking completion.
    response: completedSuccessfully ? body : null,
    output: completedSuccessfully ? {
      id: String(body?.id || request.requestId),
      model: String(body?.model || request.modelTag),
      role: String(body?.choices?.[0]?.message?.role || "assistant"),
      content: body?.choices?.[0]?.message?.content ?? "",
      ...(Array.isArray(body?.choices?.[0]?.message?.tool_calls) ? { tool_calls: body.choices[0].message.tool_calls } : {}),
      finish_reason: body?.choices?.[0]?.finish_reason ?? null,
      ...(body?.usage ? { usage: body.usage } : {}),
      ...(cacheLookup.hit ? { cache_replay: true } : {}),
    } : null,
    receipt,
    headers: cacheAllowed ? { "x-cache-key": cacheKey } : {},
    error: completedSuccessfully ? null : errors[0] || { code: "inference_failed", message: "inference failed" },
  };
}
