/**
 * Production custom-model inference over the governed mothership policy.
 *
 * This module performs no persistence and creates no mutation lane. The
 * orchestration runner calls it while executing an api-registry-call; the
 * sandbox-run route persists the returned invocation/trace evidence through
 * the existing source-record store.
 */

import {
  createOpenAiChatTransport,
  estimateRequestCostCents,
  executeInferenceGateway,
} from "./adapters/inference/gateway.js";
import { receiptSha256 } from "./adapters/inference/lineage.js";
import { compileInferenceManifest, signInferenceManifest } from "./adapters/inference/manifest.js";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createLlamaCppTransport } from "./adapters/inference/llama-transport.js";
import { normalizeDistillationTrace } from "./distillation-gateway.js";
import { deriveEndpointVerification } from "./training-verification.js";

function registryRows(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  return objects
    .filter((object) => object?.objectType === "api-registry")
    .flatMap((object) => Array.isArray(object.rows) ? object.rows : [])
    .filter((row) => row && typeof row === "object");
}

function findRegistryRow(workspaceConfig, integrationId) {
  const wanted = String(integrationId || "").trim();
  return registryRows(workspaceConfig).find((row) => String(row?.integrationId || "").trim() === wanted) || null;
}

function promptFromInput(inputPayload) {
  const input = inputPayload && typeof inputPayload === "object" ? inputPayload : {};
  if (Array.isArray(input.messages)) {
    const last = [...input.messages].reverse().find((message) => String(message?.role || "") === "user");
    if (last) return String(last.content || "");
  }
  return String(input.prompt ?? input.text ?? input.instruction ?? "");
}

function responseContent(body) {
  return String(body?.choices?.[0]?.message?.content || "");
}

function isChatCompletion(body) {
  const message = body?.choices?.[0]?.message;
  return Boolean(
    body
      && typeof body === "object"
      && Array.isArray(body.choices)
      && message
      && (typeof message.content === "string" || Array.isArray(message.tool_calls)),
  );
}

function inferenceControlPlane(policyRow, route, registryRow) {
  const sources = [
    policyRow?.metadata?.inferenceControlPlane,
    policyRow?.metadata?.mothershipProxy?.inferenceControlPlane,
    route?.inferenceControlPlane,
    registryRow?.metadata?.inferenceControlPlane,
  ].filter((value) => value && typeof value === "object" && !Array.isArray(value));
  return sources.reduce((merged, source) => ({
    ...merged,
    ...source,
    runtime: { ...(merged.runtime || {}), ...(source.runtime || {}) },
    cache: { ...(merged.cache || {}), ...(source.cache || {}) },
    routing: { ...(merged.routing || {}), ...(source.routing || {}) },
    otel: { ...(merged.otel || {}), ...(source.otel || {}) },
    tools: { ...(merged.tools || {}), ...(source.tools || {}) },
  }), {});
}

function inferenceRequest({ inputPayload, expectedModel, prompt, maxTokens, runId, traceparent, tracestate, appScope, control, policy, registryRow }) {
  const input = inputPayload && typeof inputPayload === "object" ? inputPayload : {};
  const inferenceOverrides = input.inference && typeof input.inference === "object" ? input.inference : {};
  // `inference` is an additive control envelope. It must not silently discard
  // top-level system/developer/history messages supplied by the workflow.
  const dynamic = { ...input, ...inferenceOverrides };
  const messages = Array.isArray(dynamic.messages) && dynamic.messages.length
    ? dynamic.messages
    : [{ role: "user", content: prompt }];
  const requestedLora = dynamic.lora_ref ?? control.lora_ref ?? null;
  const requestedLoraId = String(
    requestedLora?.lora_id || requestedLora?.loraId || requestedLora?.id || requestedLora || "",
  );
  const allowedLora = (control.runtime?.allowedAdapters || control.runtime?.loraAdapters || [])
    .find((adapter) => String(adapter?.ref || adapter?.lora_ref || adapter?.lora_id || adapter?.adapter_ref?.id || "") === requestedLoraId);
  const governedLora = allowedLora ? {
    lora_id: requestedLoraId,
    adapter_ref: {
      id: requestedLoraId,
      uri: String(allowedLora.path || allowedLora.artifactPath || allowedLora.adapter_ref?.uri || ""),
      sha256: String(allowedLora.sha256 || allowedLora.adapterSha256 || allowedLora.adapter_sha256 || allowedLora.adapter_ref?.sha256 || ""),
    },
    adapter_sha256: String(allowedLora.sha256 || allowedLora.adapterSha256 || allowedLora.adapter_sha256 || allowedLora.adapter_ref?.sha256 || ""),
    scale: Number(requestedLora?.scale ?? allowedLora.defaultScale ?? allowedLora.scale ?? 1),
  } : requestedLoraId ? { lora_id: requestedLoraId, adapter_ref: { id: requestedLoraId } } : null;
  const configuredCacheTtl = Math.max(0, Math.min(86_400, Math.floor(Number(control.cache?.ttl ?? control.cache_ttl) || 0)));
  const requestedCacheTtl = dynamic.cache_ttl ?? dynamic.cacheTtl;
  const effectiveCacheTtl = configuredCacheTtl > 0 && requestedCacheTtl !== undefined
    ? Math.min(configuredCacheTtl, Math.max(0, Math.floor(Number(requestedCacheTtl) || 0)))
    : configuredCacheTtl;
  const requestedCacheMode = String(dynamic.cache_policy?.mode || dynamic.cachePolicy?.mode || "use");
  const cacheMode = ["use", "refresh", "bypass"].includes(requestedCacheMode) ? requestedCacheMode : "use";
  const requestedCachePolicy = dynamic.cache_policy && typeof dynamic.cache_policy === "object"
    ? dynamic.cache_policy
    : dynamic.cachePolicy && typeof dynamic.cachePolicy === "object" ? dynamic.cachePolicy : {};
  return {
    request_id: String(dynamic.request_id || `${runId || "run"}:${registryRow?.integrationId || expectedModel}`),
    prior_receipt_id: String(dynamic.prior_receipt_id || dynamic.priorReceiptId || ""),
    parent_receipt_id: String(dynamic.parent_receipt_id || dynamic.parentReceiptId || ""),
    ...(dynamic.span_kind || dynamic.spanKind ? { span_kind: dynamic.span_kind || dynamic.spanKind } : {}),
    ...((dynamic.max_cost_cents ?? dynamic.maxCostCents) != null
      ? { max_cost_cents: Number(dynamic.max_cost_cents ?? dynamic.maxCostCents) }
      : {}),
    ...((dynamic.min_quality_score ?? dynamic.minQualityScore) != null
      ? { min_quality_score: Number(dynamic.min_quality_score ?? dynamic.minQualityScore) }
      : {}),
    model: expectedModel,
    messages,
    stream: dynamic.stream === true,
    max_tokens: Number(dynamic.max_tokens ?? dynamic.maxTokens) || maxTokens,
    temperature: dynamic.temperature,
    base_model_ref: control.base_model_ref || control.runtime?.model || control.runtime?.baseModel || null,
    adapter_ref: control.adapter_ref || null,
    lora_ref: governedLora,
    response_schema: dynamic.response_schema || dynamic.responseSchema || dynamic.grammar_schema || control.response_schema || null,
    grammar_hash: dynamic.grammar_hash || "",
    context_prefix: dynamic.context_prefix || "",
    context_tokens: dynamic.context_tokens,
    cache_ttl: effectiveCacheTtl,
    cache_policy: {
      mode: cacheMode,
      semantic: control.cache?.semantic === true && requestedCachePolicy.semantic !== false,
      similarity_threshold: control.cache?.similarityThreshold,
      native_prefix_cache: control.cache?.nativePrefix !== false
        && requestedCachePolicy.native_prefix_cache !== false
        && requestedCachePolicy.nativePrefixCache !== false,
    },
    otel_traceparent: traceparent || "",
    otel_tracestate: tracestate || "",
    phase_pool: String(control.routing?.phasePool || ""),
    tools: Array.isArray(control.tools?.definitions) ? control.tools.definitions : [],
    tool_openapi: control.tools?.openapi || null,
    tool_contract: {
      allowed_operation_ids: control.tools?.allowedOperationIds || [],
    },
    tool_results: Array.isArray(dynamic.tool_results) ? dynamic.tool_results : [],
    metadata: {
      workspace_id: String(policy?.workspaceSlug || "workspace-local"),
      app_id: String(appScope || ""),
      integration_id: String(registryRow?.integrationId || ""),
    },
  };
}

function isLlamaCppControl(control, registryRow) {
  const kind = String(
    control.providerKind
      || control.runtime?.kind
      || control.runtime?.provider
      || registryRow?.connectorKind
      || "",
  ).toLowerCase();
  return ["llama.cpp", "llama-cpp", "llamacpp", "llama.cpp-server", "llama-cpp-server"].includes(kind);
}

function routeRegistryRow(workspaceConfig, route) {
  const target = String(route?.target || "");
  if (target === "local-student") return findRegistryRow(workspaceConfig, route?.registryId);
  if (target === "local-base") {
    return {
      integrationId: `local-base:${String(route?.modelTag || "")}`,
      baseUrl: String(route?.baseUrl || "http://127.0.0.1:11434"),
      endpoint: String(route?.endpoint || "/v1/chat/completions"),
      expectedModelTag: String(route?.modelTag || ""),
      capabilities: "chat-completions",
    };
  }
  if (target === "teacher") {
    return {
      integrationId: `teacher:${String(route?.providerId || "custom")}`,
      baseUrl: String(route?.baseUrl || ""),
      endpoint: String(route?.endpoint || "/chat/completions"),
      expectedModelTag: String(route?.modelTag || ""),
      capabilities: "chat-completions",
    };
  }
  return null;
}

function availabilityForRoute({
  workspaceConfig,
  policy,
  route,
  verificationProbe = false,
  resolvedEnv = {},
  allowedEnvRefs = [],
}) {
  const target = String(route?.target || "");
  const row = routeRegistryRow(workspaceConfig, route);
  if (!row) return { available: false, row: null, reason: "governed API Registry target is missing" };
  const control = inferenceControlPlane({ metadata: { mothershipProxy: policy } }, route, row);
  if (!String(row.baseUrl || "").trim() && !isLlamaCppControl(control, row)) {
    return { available: false, row, reason: "target endpoint is not configured" };
  }
  if (!String(route?.modelTag || row?.expectedModelTag || "").trim()) {
    return { available: false, row, reason: "target model tag is missing" };
  }
  if (target === "local-student" && !verificationProbe) {
    const verification = deriveEndpointVerification({
      registryRow: row,
      expectedTag: String(route?.modelTag || policy?.modelTag || ""),
      baseModel: String(policy?.fallbackBaseModel || ""),
    });
    if (!verification.verified) {
      return { available: false, row, reason: verification.reason || "student is not tuned-tag verified" };
    }
  }
  if (target !== "teacher") {
    const authRef = String(row?.authRef || "").trim();
    if (authRef) {
      const envAllowlist = new Set((Array.isArray(allowedEnvRefs) ? allowedEnvRefs : []).map(String));
      if (!envAllowlist.has(authRef)) {
        return { available: false, row, reason: `model credential ${authRef} is not declared by this sandbox` };
      }
      const secret = String(resolvedEnv?.[authRef] || "");
      if (!secret) return { available: false, row, reason: `model credential ${authRef} is not resolved for this run` };
      return { available: true, row, authToken: secret, reason: "" };
    }
  }
  if (target === "teacher") {
    const authEnvVar = String(route?.authEnvVar || "").trim();
    const envAllowlist = new Set((Array.isArray(allowedEnvRefs) ? allowedEnvRefs : []).map(String));
    if (authEnvVar && !envAllowlist.has(authEnvVar)) {
      return { available: false, row, reason: `teacher credential ${authEnvVar} is not declared by this sandbox` };
    }
    const secret = authEnvVar ? String(resolvedEnv?.[authEnvVar] || "") : "";
    if (authEnvVar && !secret) return { available: false, row, reason: `teacher connection ${authEnvVar} is not resolved for this run` };
    return { available: true, row, authToken: secret, reason: "" };
  }
  return { available: true, row, authToken: "", reason: "" };
}

function loopbackHostname(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "localhost" || host === "::1" || host === "[::1]" || host.startsWith("127.");
}

function privateOrReservedAddress(address) {
  const value = String(address || "").toLowerCase();
  const family = isIP(value);
  if (family === 4) {
    const [a, b] = value.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19));
  }
  if (family === 6) {
    if (value === "::1" || value === "::") return true;
    if (/^f[cd]/.test(value) || /^fe[89ab]/.test(value)) return true;
    const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? privateOrReservedAddress(mapped[1]) : false;
  }
  return true;
}

function allowlistMatches(hostname, allowList) {
  const host = String(hostname || "").toLowerCase();
  return (Array.isArray(allowList) ? allowList : []).some((entry) => {
    const raw = String(entry || "").trim().toLowerCase();
    if (!raw) return false;
    let allowedHost = raw;
    try { allowedHost = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.toLowerCase(); } catch { /* compare raw */ }
    return allowedHost.startsWith("*.")
      ? host.endsWith(allowedHost.slice(1)) && host !== allowedHost.slice(2)
      : host === allowedHost;
  });
}

function inferenceEndpoint(row) {
  const baseUrl = String(row?.baseUrl || "").trim();
  const endpoint = String(row?.endpoint || "/chat/completions").trim();
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  return new URL(endpoint.replace(/^\/+/, ""), `${baseUrl.replace(/\/+$/, "")}/`).toString();
}

export async function verifyInferenceNetworkAccess(row, {
  networkAllow = false,
  allowList = [],
  resolveHostname = dnsLookup,
  operatorPrivateAllowList = String(process.env.GROWTHUB_INFERENCE_PRIVATE_NETWORK_ALLOWLIST || "").split(","),
} = {}) {
  let url;
  try { url = new URL(inferenceEndpoint(row)); } catch {
    return { ok: false, reason: "inference endpoint is not a valid absolute URL" };
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    return { ok: false, reason: "inference endpoint must be credential-free HTTP(S)" };
  }
  const hostname = url.hostname.toLowerCase();
  if (loopbackHostname(hostname)) return { ok: true, url: url.toString(), locality: "loopback" };
  if (networkAllow !== true) return { ok: false, reason: `sandbox network policy blocks ${hostname}` };
  if (!allowlistMatches(hostname, allowList)) return { ok: false, reason: `sandbox allowList does not include ${hostname}` };
  let addresses;
  try {
    addresses = isIP(hostname)
      ? [{ address: hostname }]
      : await resolveHostname(hostname, { all: true, verbatim: true });
  } catch {
    return { ok: false, reason: `inference endpoint hostname ${hostname} did not resolve` };
  }
  if (!Array.isArray(addresses) || addresses.length === 0) return { ok: false, reason: `inference endpoint hostname ${hostname} did not resolve` };
  const privateAllowed = allowlistMatches(hostname, operatorPrivateAllowList);
  if (!privateAllowed && addresses.some((entry) => privateOrReservedAddress(entry?.address))) {
    return { ok: false, reason: `inference endpoint ${hostname} resolves to a private, link-local, or reserved address` };
  }
  return { ok: true, url: url.toString(), locality: privateAllowed ? "operator-approved-private" : "public" };
}

/**
 * Execute a governed custom-model identity through its mothership routes.
 * Every attempt is a real HTTP request. A student response must report the
 * expected tuned tag; malformed or mismatched responses fall through to the
 * next governed route.
 */
export async function executeCustomModelInference({
  workspaceConfig,
  policyRow,
  inputPayload,
  fetchImpl,
  runId = "",
  clusterId = "workflow",
  maxTokens = 512,
  allowedTargets = null,
  traceparent = "",
  tracestate = "",
  appScope = "",
  onEvent,
  llamaPool,
  verificationProbe = false,
  networkPolicy = {},
  resolvedEnv = {},
  allowedEnvRefs = [],
  trustedContinuation = null,
  signal,
  timeoutMs = 120_000,
  inferenceManifests = [],
} = {}) {
  const policy = policyRow?.metadata?.mothershipProxy;
  const routes = Array.isArray(policy?.routes) ? policy.routes : [];
  if (!policy || routes.length === 0) {
    return { ok: false, error: "custom-model Registry row has no executable mothership policy", attempts: [] };
  }

  const prompt = promptFromInput(inputPayload);
  if (!prompt && !Array.isArray(inputPayload?.messages)) {
    return { ok: false, error: "custom-model inference requires a prompt or messages", attempts: [] };
  }

  // Multi-tier economic routing controls. Cost is a token-count estimate
  // against each route's declared cost model (cents per million tokens);
  // routes without a declared cost model estimate zero and cannot be
  // budget-gated, which stays visible in the receipt rather than guessed at.
  const economicInput = inputPayload?.inference && typeof inputPayload.inference === "object" ? inputPayload.inference : {};
  const rawMaxCost = economicInput.max_cost_cents ?? economicInput.maxCostCents ?? inputPayload?.max_cost_cents;
  const maxCostCents = rawMaxCost != null && Number.isFinite(Number(rawMaxCost)) ? Math.max(0, Number(rawMaxCost)) : null;
  const rawMinQuality = economicInput.min_quality_score ?? economicInput.minQualityScore ?? inputPayload?.min_quality_score;
  const minQualityScore = rawMinQuality != null && Number.isFinite(Number(rawMinQuality)) ? Number(rawMinQuality) : null;
  const roughContextTokens = Math.max(1, Math.ceil(String(prompt || "").length / 4));
  const routeCostModel = (route, control) => route?.costModel || control?.economics?.costModel || null;
  const routeEstimate = (route, control) => estimateRequestCostCents(
    { contextTokens: roughContextTokens, maxTokens },
    routeCostModel(route, control) || {},
  );
  let spentEstimateCents = 0;
  let qualityFallbackActive = false;
  let stashedQualityEnvelope = null;
  let stashedQualityEstimate = 0;

  const attempts = [];
  const failedInvocations = [];
  const targetAllow = Array.isArray(allowedTargets) && allowedTargets.length ? new Set(allowedTargets.map(String)) : null;
  // A first-invocation probe has to reach an unverified student in order to
  // create verification evidence. Keep that exception server-bounded: it is
  // active only when this call is constrained to the student route alone, so
  // it cannot weaken ordinary mothership routing or silently enable fallback.
  const mayProbeUnverifiedStudent = verificationProbe === true
    && targetAllow?.size === 1
    && targetAllow.has("local-student");
  for (const route of routes) {
    const target = String(route?.target || "");
    if (targetAllow && !targetAllow.has(target)) continue;
    // A tool continuation is bound to the route that produced the persisted
    // call. Never fail over its external result to another model/provider.
    if (trustedContinuation?.route && target !== String(trustedContinuation.route)) continue;
    const availability = availabilityForRoute({
      workspaceConfig,
      policy,
      route,
      verificationProbe: mayProbeUnverifiedStudent,
      resolvedEnv,
      allowedEnvRefs,
    });
    if (!availability.available) {
      attempts.push({ target, status: "skipped", reason: availability.reason });
      continue;
    }

    const expectedModel = String(route?.modelTag || availability.row?.expectedModelTag || "").trim();
    const control = inferenceControlPlane(policyRow, route, availability.row);
    const cloudRoute = target === "teacher";
    const thisRouteEstimate = routeEstimate(route, control);
    if (maxCostCents !== null) {
      // Local routes keep a 50% budget buffer so a quality fallback can still
      // afford a cloud retry; every route is capped by the remaining budget.
      const remainingBudget = maxCostCents - spentEstimateCents;
      const routeCap = cloudRoute ? remainingBudget : Math.min(remainingBudget, maxCostCents * 0.5);
      if (thisRouteEstimate > routeCap) {
        attempts.push({
          target,
          status: "skipped",
          reason: `estimated cost ${thisRouteEstimate}¢ exceeds the ${cloudRoute ? "remaining" : "buffered local"} budget ${Math.max(0, routeCap)}¢ of max_cost_cents ${maxCostCents}`,
          costEstimateCents: thisRouteEstimate,
        });
        continue;
      }
    }
    const request = inferenceRequest({
      inputPayload,
      expectedModel,
      prompt,
      maxTokens,
      runId,
      traceparent,
      tracestate,
      appScope,
      control,
      policy,
      registryRow: availability.row,
    });
    const llamaCpp = isLlamaCppControl(control, availability.row);
    if (!llamaCpp) {
      const network = await verifyInferenceNetworkAccess(availability.row, networkPolicy);
      if (!network.ok) {
        attempts.push({ target, status: "skipped", reason: network.reason });
        continue;
      }
    }
    const transport = llamaCpp
      ? createLlamaCppTransport({ control, fetchImpl, pool: llamaPool })
      : createOpenAiChatTransport({
          baseUrl: availability.row.baseUrl,
          endpoint: availability.row.endpoint || "/chat/completions",
          fetchImpl,
          authToken: availability.authToken,
          providerKind: String(control.providerKind || availability.row.connectorKind || route?.providerId || "openai-compatible"),
          schemaEngine: String(control.schemaEngine || "post-hoc"),
          identity: {
            baseModelSha256: String(request.base_model_ref?.base_model_sha256 || request.base_model_ref?.sha256 || request.base_model_ref?.artifact_ref?.sha256 || ""),
            adapterSha256: String(request.lora_ref?.adapter_sha256 || request.lora_ref?.adapter_ref?.sha256 || ""),
            adapterId: String(request.lora_ref?.lora_id || ""),
            adapterScale: Number(request.lora_ref?.scale ?? 1),
            servedAlias: String(control.servedAlias || ""),
          },
        });
    // Runtime manifest binding: the published workflow row supplies signed
    // manifests keyed by integration; the gateway rejects a pool serving a
    // different composite SHA than the manifest that was proven at publish.
    const signedManifest = (Array.isArray(inferenceManifests) ? inferenceManifests : [])
      .find((entry) => String(entry?.manifest?.integration_id || "") === String(availability.row?.integrationId || "")) || null;
    const localRoutes = routes.filter((entry) => String(entry?.target || "") !== "teacher");
    const cloudRoutes = routes.filter((entry) => String(entry?.target || "") === "teacher");
    const result = await executeInferenceGateway({
      request,
      transport,
      defaults: {
        llamaCpp,
        tenantScope: String(
          process.env.GROWTHUB_INFERENCE_CACHE_NAMESPACE
            || workspaceConfig?.id
            || workspaceConfig?.workspaceId
            || policy?.workspaceSlug
            || "workspace-local",
        ),
        appScope: String(appScope || "workspace-wide"),
        integrationId: String(availability.row?.integrationId || ""),
        maxTokensLimit: Math.max(1, Number(control.maxTokensLimit) || 32_768),
        redaction: control.redaction,
        ...(signedManifest ? { manifest: signedManifest } : {}),
        economics: {
          reason: qualityFallbackActive ? "quality_fallback" : maxCostCents !== null ? "cost_capability" : "default",
          costModel: routeCostModel(route, control) || {},
          localCostEstimateCents: localRoutes.length ? routeEstimate(localRoutes[0], control) : null,
          cloudCostEstimateCents: cloudRoutes.length ? routeEstimate(cloudRoutes[0], control) : null,
        },
      },
      fetchImpl,
      onDelta: typeof onEvent === "function" ? (event) => onEvent({
        kind: "growthub-inference-delta-v1",
        emittedAt: new Date().toISOString(),
        target,
        ...event,
      }) : undefined,
      serviceName: String(control.otel?.serviceName || "growthub-workspace-inference"),
      trustedContinuation,
      signal,
      timeoutMs,
    });
    // Budget accounting tracks estimates of executed inference only; a cache
    // replay consumed no model compute.
    if (Number(result.httpStatus) > 0 && String(result.receipt?.cache?.cache_status || "") !== "HIT") {
      spentEstimateCents += thisRouteEstimate;
    }
    const body = result.response;
    const servedModel = String(body?.model || "").trim();
    const validBody = result.ok && isChatCompletion(body);
    const identityMatches = target !== "local-student" || (
      servedModel === expectedModel
      && (!llamaCpp || result.receipt?.identity?.status === "verified")
    );
    if (!validBody || !identityMatches) {
      const failureReason = !result.ok
        ? String(result.error?.message || result.error || `HTTP ${result.httpStatus || 0}`)
        : !validBody ? "upstream did not return an OpenAI chat completion"
          : llamaCpp && result.receipt?.identity?.status !== "verified"
            ? String(result.receipt?.identity?.reason || "llama.cpp runtime could not prove the governed model/adapter hashes")
            : `student served ${servedModel || "an unnamed model"}; expected ${expectedModel}`;
      if (result.receipt) {
        failedInvocations.push({
          schema: "growthub-custom-model-invocation-v2",
          runId: String(runId || ""),
          modelId: String(policy.workspaceSlug || "workspace-local"),
          policyRegistryId: String(policyRow?.integrationId || ""),
          integrationId: String(availability.row?.integrationId || ""),
          appScope: String(appScope || "workspace-wide"),
          priorReceiptId: String(request.prior_receipt_id || ""),
          route: target,
          providerId: String(route?.providerId || target),
          expectedModel,
          servedModel,
          status: Number(result.httpStatus) || 0,
          outcomeStatus: result.status || "failed",
          failureReason,
          completedAt: new Date().toISOString(),
          verificationReceipt: result.receipt,
        });
      }
      attempts.push({
        target,
        status: "failed",
        httpStatus: Number(result.httpStatus) || 0,
        servedModel,
        reason: failureReason,
        verificationReceipt: result.receipt || null,
      });
      continue;
    }

    const usage = body?.usage && typeof body.usage === "object" ? body.usage : {};
    const completedAt = new Date().toISOString();
    const verificationReceipt = result.receipt;
    // Execution-time manifest: compiled and signed from the governed control
    // config this call actually enforced. The draft test run persists it, and
    // the publish gate later verifies live registry state against it.
    const compiledManifest = compileInferenceManifest({
      workflowId: String(runId || ""),
      integrationId: String(availability.row?.integrationId || ""),
      control,
      maxTokens,
    });
    const executionManifest = compiledManifest.available
      ? signInferenceManifest(compiledManifest.manifest)
      : null;
    const invocation = {
      schema: "growthub-custom-model-invocation-v2",
      runId: String(runId || ""),
      modelId: String(policy.workspaceSlug || "workspace-local"),
      policyRegistryId: String(policyRow?.integrationId || ""),
      integrationId: String(availability.row?.integrationId || ""),
      appScope: String(appScope || "workspace-wide"),
      priorReceiptId: String(request.prior_receipt_id || ""),
      route: target,
      providerId: String(route?.providerId || target),
      expectedModel,
      servedModel,
      status: Number(result.httpStatus) || 200,
      promptTokens: Math.max(0, Number(usage.prompt_tokens) || 0),
      completionTokens: Math.max(0, Number(usage.completion_tokens) || 0),
      completedAt,
      fallbackCount: attempts.filter((attempt) => attempt.status === "failed").length,
      baseModelSha256: String(verificationReceipt?.identity?.base_model_sha256 || ""),
      adapterSha256: String(verificationReceipt?.identity?.adapter_sha256 || ""),
      adapterId: String(verificationReceipt?.identity?.lora_ref?.lora_id || ""),
      grammarHash: String(verificationReceipt?.schema?.grammar_hash || ""),
      schemaVersion: String(verificationReceipt?.schema?.schema_ref?.schema_version || ""),
      cacheStatus: String(verificationReceipt?.cache?.cache_status || "BYPASS"),
      cacheKey: String(verificationReceipt?.cache?.cache_key || ""),
      otelTraceparent: String(verificationReceipt?.otel?.otel_traceparent || ""),
      traceId: String(verificationReceipt?.otel?.trace_id || ""),
      spanId: String(verificationReceipt?.otel?.span_id || ""),
      phasePools: verificationReceipt?.routing?.phases || [],
      toolAudit: verificationReceipt?.tool_audit || { status: "not_requested", calls: [] },
      receiptSha256: receiptSha256(verificationReceipt),
      parentReceiptId: String(verificationReceipt?.lineage?.parent_receipt_id || ""),
      spanKind: String(verificationReceipt?.lineage?.span_kind || "ROOT"),
      routingDecision: verificationReceipt?.routing_decision || null,
      redactionEventCount: Number(verificationReceipt?.redaction?.event_count) || 0,
      ...(executionManifest ? { inferenceManifest: executionManifest } : {}),
      ...(compiledManifest.available ? {} : { inferenceManifestUnavailable: compiledManifest.reason }),
      verificationReceipt,
      outcomeStatus: result.status,
    };
    const awaitingToolResult = result.status === "awaiting_tool_result";
    const trace = awaitingToolResult ? null : normalizeDistillationTrace({
      traceId: `trace_${String(runId || Date.now().toString(36))}_${target}`,
      capturedAt: completedAt,
      teacherModel: servedModel,
      teacherProviderId: String(route?.providerId || target),
      clusterId: String(inputPayload?.clusterId || clusterId || "workflow"),
      prompt,
      response: responseContent(body),
      reasoning: String(body?.choices?.[0]?.message?.reasoning || body?.reasoning || ""),
      promptTokens: invocation.promptTokens,
      completionTokens: invocation.completionTokens,
      score: 0,
      kvCacheHint: {
        prefixHash: String(verificationReceipt?.cache?.prefix_hash || ""),
        reusable: ["HIT", "MISS"].includes(String(verificationReceipt?.cache?.cache_status || "")),
      },
    });
    const qualityUnmet = String(verificationReceipt?.routing_decision?.quality || "") === "QUALITY_UNMET";
    const laterRoutes = routes.slice(routes.indexOf(route) + 1)
      .filter((entry) => !targetAllow || targetAllow.has(String(entry?.target || "")));
    const stashForQualityFallback = qualityUnmet
      && !awaitingToolResult
      && !trustedContinuation
      && !stashedQualityEnvelope
      && laterRoutes.length > 0;
    attempts.push({
      target,
      status: awaitingToolResult ? "awaiting_tool_result" : stashForQualityFallback ? "quality_unmet" : "completed",
      httpStatus: invocation.status,
      servedModel,
      cacheStatus: invocation.cacheStatus,
      ...(qualityUnmet ? { quality: "QUALITY_UNMET", confidence: verificationReceipt?.routing_decision?.actual_confidence ?? null } : {}),
      verificationReceipt,
    });
    const successEnvelope = {
      ok: true,
      status: invocation.status,
      gatewayStatus: result.status,
      awaitingToolResult,
      ...(awaitingToolResult ? {
        continuation: {
          kind: "tool_result",
          status: "pending",
          prior_receipt_id: String(verificationReceipt?.receipt_id || ""),
          tool_calls: (verificationReceipt?.tool_audit?.calls || []).map((entry) => entry?.tool_call).filter(Boolean),
          ...(result.childExecution ? { child_execution: result.childExecution } : {}),
        },
      } : {}),
      response: body,
      route,
      attempts,
      invocation,
      trace,
      invocations: [
        ...failedInvocations,
        ...(stashedQualityEnvelope ? [stashedQualityEnvelope.invocation] : []),
        invocation,
      ],
      traces: trace ? [trace] : [],
      verificationReceipt,
    };
    if (stashForQualityFallback) {
      // The local answer is below min_quality_score and a governed fallback
      // route remains. Keep this result as honest evidence, mark the router
      // state, and try the next tier within the remaining budget. If nothing
      // affordable improves on it, this local result is returned flagged
      // QUALITY_UNMET rather than silently discarded.
      qualityFallbackActive = true;
      stashedQualityEnvelope = successEnvelope;
      stashedQualityEstimate = thisRouteEstimate;
      continue;
    }
    return successEnvelope;
  }

  if (stashedQualityEnvelope) {
    return {
      ...stashedQualityEnvelope,
      qualityUnmet: true,
      qualityUnmetReason: maxCostCents !== null && spentEstimateCents + stashedQualityEstimate >= maxCostCents
        ? "cloud fallback exceeded max_cost_cents; the local result is returned flagged QUALITY_UNMET"
        : "no governed fallback route produced a better-confidence result; the local result is returned flagged QUALITY_UNMET",
    };
  }

  return {
    ok: false,
    error: attempts.length ? attempts[attempts.length - 1].reason : "no mothership route is configured",
    attempts,
    invocations: failedInvocations,
    traces: [],
  };
}

function numericScore(body) {
  const content = responseContent(body);
  try {
    const parsed = JSON.parse(content);
    const raw = Number(parsed.score ?? parsed.rating ?? parsed.winnerScore);
    if (Number.isFinite(raw)) return Math.max(0, Math.min(5, raw > 5 ? raw / 20 : raw));
  } catch {
    const match = content.match(/(?:score|rating)\s*[:=]\s*(\d+(?:\.\d+)?)/i);
    if (match) return Math.max(0, Math.min(5, Number(match[1]) > 5 ? Number(match[1]) / 20 : Number(match[1])));
  }
  return 0;
}

function combineExecutions(executions, response, extra = {}) {
  const successful = executions.filter((entry) => entry?.ok);
  // Workflow-level receipt DAG: every step receipt is hashed and its
  // parent linkage recorded, so the multi-step workflow's evidence is a
  // Merkle chain (root_hash -> child_hash -> grandchild_hash), not a list
  // of disconnected spans.
  const receipts = executions.map((entry) => entry?.verificationReceipt).filter(Boolean);
  const edges = receipts.map((receipt) => ({
    receipt_id: String(receipt.receipt_id || ""),
    parent_receipt_id: receipt.lineage?.parent_receipt_id || null,
    span_kind: String(receipt.lineage?.span_kind || "ROOT"),
    receipt_sha256: receiptSha256(receipt),
  }));
  const receiptDag = receipts.length ? {
    schema: "growthub-receipt-dag-v1",
    root_receipt_id: edges[0].receipt_id,
    edges,
    dag_sha256: receiptSha256(edges),
  } : null;
  return {
    ok: successful.length === executions.length,
    status: Number(response?.status) || 200,
    response: response?.response,
    route: response?.route,
    ...(receiptDag ? { receiptDag } : {}),
    attempts: executions.flatMap((entry) => entry?.attempts || []),
    invocations: executions.flatMap((entry) => Array.isArray(entry?.invocations)
      ? entry.invocations
      : entry?.invocation ? [entry.invocation] : []),
    traces: executions.flatMap((entry) => Array.isArray(entry?.traces)
      ? entry.traces
      : entry?.trace ? [entry.trace] : []),
    invocation: response?.invocation,
    trace: response?.trace,
    ...extra,
  };
}

/** Execute the shipped custom-model workflow variations as real model calls.
 * The canvas remains declarative; this server-side executor is the production
 * behavior behind those existing variants. */
export async function executeCustomModelWorkflow({
  workspaceConfig,
  policyRow,
  inputPayload,
  fetchImpl,
  runId = "",
  workflowVariant = "chat",
  maxTokens = 512,
  traceparent = "",
  tracestate = "",
  appScope = "",
  onEvent,
  llamaPool,
  networkPolicy = {},
  resolvedEnv = {},
  allowedEnvRefs = [],
  trustedContinuation = null,
  signal,
  timeoutMs = 120_000,
  inferenceManifests = [],
} = {}) {
  const baseArgs = {
    workspaceConfig,
    policyRow,
    fetchImpl,
    runId,
    maxTokens,
    traceparent,
    tracestate,
    appScope,
    onEvent,
    llamaPool,
    networkPolicy,
    resolvedEnv,
    allowedEnvRefs,
    trustedContinuation,
    signal,
    timeoutMs,
    inferenceManifests,
  };
  const prompt = promptFromInput(inputPayload);
  // Multi-step variants chain the receipt DAG: each step after the first
  // executes as a CHILD_WORKFLOW span of the preceding step's receipt.
  const call = (suffix, nextPrompt, options = {}) => executeCustomModelInference({
    ...baseArgs,
    runId: `${runId}${suffix ? `_${suffix}` : ""}`,
    inputPayload: {
      ...inputPayload,
      prompt: nextPrompt,
      messages: undefined,
      ...(options.parentReceiptId ? {
        inference: {
          ...(inputPayload?.inference && typeof inputPayload.inference === "object" ? inputPayload.inference : {}),
          parent_receipt_id: options.parentReceiptId,
          span_kind: "CHILD_WORKFLOW",
        },
      } : {}),
    },
    clusterId: workflowVariant,
    allowedTargets: options.allowedTargets,
  });
  const needsToolResult = (execution) => execution?.awaitingToolResult === true;
  const parentOf = (execution) => String(execution?.verificationReceipt?.receipt_id || "");

  if (workflowVariant === "chat") return call("", prompt);

  if (workflowVariant === "synthetic-scaling") {
    const generated = await call("synthetic", `${prompt}\n\nReturn one diverse training example as JSON with instruction, input, and output fields. Do not include secrets or personal data.`);
    if (!generated.ok || needsToolResult(generated)) return generated;
    generated.trace = { ...generated.trace, synthetic: true, accepted: false, qualityStatus: "ungraded", redactionStatus: "pending" };
    generated.traces = [generated.trace];
    return generated;
  }

  if (workflowVariant === "recursive-learning") {
    const answer = await call("answer", prompt);
    if (!answer.ok || needsToolResult(answer)) return answer;
    const answerText = responseContent(answer.response);
    const grade = await call("grade", `Score the following answer from 0 to 5 for correctness, usefulness, and safety. Return JSON only: {"score": number, "feedback": string}.\n\nTask: ${prompt}\n\nAnswer: ${answerText}`, { parentReceiptId: parentOf(answer) });
    if (!grade.ok || needsToolResult(grade)) return grade;
    const score = numericScore(grade.response);
    const improved = await call("improve", `Improve the answer using this grader feedback. Return only the improved answer.\n\nTask: ${prompt}\n\nOriginal answer: ${answerText}\n\nFeedback: ${responseContent(grade.response)}`, { parentReceiptId: parentOf(grade) });
    if (!improved.ok || needsToolResult(improved)) return improved;
    improved.trace = { ...improved.trace, score, recursiveLearning: true, accepted: score >= 4, qualityStatus: score >= 4 ? "qualified" : "needs-review" };
    return combineExecutions([answer, grade, improved], improved, { score, feedback: responseContent(grade.response) });
  }

  if (workflowVariant === "agentic") {
    const plan = await call("plan", `Create a concise multi-step plan for this goal. Identify assumptions and success criteria.\n\nGoal: ${prompt}`);
    if (!plan.ok || needsToolResult(plan)) return plan;
    const critique = await call("critique", `Critique this plan for missing steps, unsafe assumptions, and verification gaps.\n\nGoal: ${prompt}\n\nPlan: ${responseContent(plan.response)}`, { parentReceiptId: parentOf(plan) });
    if (!critique.ok || needsToolResult(critique)) return critique;
    const result = await call("result", `Produce the final answer for the goal using the plan and critique. State the completed result and remaining external dependencies honestly.\n\nGoal: ${prompt}\n\nPlan: ${responseContent(plan.response)}\n\nCritique: ${responseContent(critique.response)}`, { parentReceiptId: parentOf(critique) });
    if (!result.ok || needsToolResult(result)) return result;
    return combineExecutions([plan, critique, result], result, { agenticSteps: 3 });
  }

  if (workflowVariant === "eval-vs-base") {
    const tuned = await call("tuned", prompt, { allowedTargets: ["local-student"] });
    if (!tuned.ok || needsToolResult(tuned)) return { ...tuned, error: tuned.error || (needsToolResult(tuned) ? "trained student requested a tool result before evaluation can continue" : "the trained student is not available for evaluation") };
    const base = await call("base", prompt, { allowedTargets: ["local-base"], parentReceiptId: parentOf(tuned) });
    if (!base.ok || needsToolResult(base)) return { ...base, error: base.error || (needsToolResult(base) ? "base route requested a tool result before evaluation can continue" : "the governed base route is not available for evaluation") };
    const judgePrompt = `Evaluate two answers to the same holdout prompt. Return JSON only: {"winner":"tuned"|"base"|"tie","score":0-5,"reason":string}.\n\nPrompt: ${prompt}\n\nTuned answer: ${responseContent(tuned.response)}\n\nBase answer: ${responseContent(base.response)}`;
    const judge = await call("judge", judgePrompt, { allowedTargets: ["teacher"], parentReceiptId: parentOf(base) });
    if (!judge.ok || needsToolResult(judge)) return { ...judge, error: judge.error || (needsToolResult(judge) ? "judge requested a tool result before evaluation can continue" : "a configured teacher route is required to judge the holdout evaluation") };
    let verdict = { winner: "", score: numericScore(judge.response), reason: responseContent(judge.response) };
    try { verdict = { ...verdict, ...JSON.parse(responseContent(judge.response)) }; } catch { /* retain evidence text */ }
    const response = {
      id: `eval-${runId}`,
      object: "custom_model.evaluation",
      model: String(policyRow?.metadata?.mothershipProxy?.modelTag || ""),
      tuned: tuned.response,
      base: base.response,
      judge: judge.response,
      verdict,
    };
    return combineExecutions([tuned, base, judge], { ...judge, response }, { evaluation: { prompt, verdict, tunedModel: tuned.invocation?.servedModel, baseModel: base.invocation?.servedModel } });
  }

  return { ok: false, error: `unsupported custom-model workflow variant "${workflowVariant}"`, attempts: [] };
}

export { findRegistryRow };
