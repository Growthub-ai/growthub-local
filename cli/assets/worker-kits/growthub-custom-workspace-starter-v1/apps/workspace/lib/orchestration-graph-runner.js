/**
 * Server-side growthub-native orchestration graph execution for sandbox-run.
 */

import {
  applyFieldMap,
  applyFilters,
  extractApiRegistryCallNode,
  extractInputNode,
  extractResendEmailNode,
  extractStripeCommerceNode,
  extractSupabaseDataNode,
  extractTransformConfig,
  isAgentSwarmGraph,
  normalizeJsonAtPath,
  parseOrchestrationGraph,
  redactSecretsFromText,
  substituteVariables
} from "./orchestration-graph.js";
import { buildInputPayloadForRunner } from "./orchestration-run-inputs.js";
import { runAgentSwarmGraphIfPresent } from "./orchestration-agent-swarm.js";
import { readEnvVar, readServerSecret } from "./server-secrets.js";
import { executeCustomModelWorkflow } from "./custom-model-inference.js";

/** The governed record (or its resolved URL) declares a chat endpoint. */
function isChatCompletionsRecord(record, url) {
  return String(record?.capabilities || "").includes("chat-completions")
    || /\/chat\/completions\/?$/.test(String(url || "").split("?")[0]);
}

/**
 * Canonical OpenAI chat body from the input payload — rooted in the atomic
 * api-registry record's own fields (expectedModelTag), never runner guesses.
 * Pass-through when the input already carries `messages`; otherwise the
 * payload's prompt/text/instruction becomes the user turn. JSON-safe by
 * construction for any content.
 */
function buildChatCompletionsBody(record, nodeConfig, inputPayload) {
  const input = inputPayload && typeof inputPayload === "object" ? inputPayload : {};
  const messages = Array.isArray(input.messages) && input.messages.length
    ? input.messages.map((m) => ({ role: String(m?.role || "user"), content: String(m?.content || "") }))
    : [{ role: "user", content: String(input.prompt ?? input.text ?? input.instruction ?? "") }];
  return {
    model: String(nodeConfig?.modelTag || record?.expectedModelTag || record?.modelTag || ""),
    messages,
    max_tokens: Math.max(1, Math.floor(Number(nodeConfig?.maxTokens) || 512)),
  };
}

function normalizeMethod(value) {
  const method = String(value || "GET").trim().toUpperCase();
  return ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method) ? method : "GET";
}

function buildUrl(record, inputPayload) {
  const baseUrl = String(record?.baseUrl || "").trim();
  let endpoint = String(record?.endpoint || "").trim();
  endpoint = substituteVariables(endpoint, inputPayload);
  const raw = endpoint || baseUrl;
  if (!raw) throw new Error("baseUrl or endpoint is required");
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  if (!baseUrl) throw new Error("baseUrl is required when endpoint is relative");
  return `${baseUrl.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
}

// readServerSecret is the single canonical resolver from ./server-secrets.js.

function buildAuthHeaders(record, secretValue) {
  if (!secretValue) return {};
  const meta = record?.requestHeadersMetadata || {};
  const headerName = String(meta.authHeaderName || record?.authHeaderName || record?.authHeader || "x-api-key").trim();
  if (!headerName) return {};
  const prefix = String(meta.authPrefix || record?.authPrefix || "").trim();
  return { [headerName]: prefix ? `${prefix} ${secretValue}` : secretValue };
}

function executeFeatureSeedMock(url, { registryId, method, startedAt }) {
  if (!String(url || "").startsWith("mock://growthub-feature-seed/")) return null;
  return {
    ok: true,
    exitCode: 0,
    durationMs: Date.now() - startedAt,
    stdout: JSON.stringify({ ok: true, status: 200, data: [{ id: "rec-1", label: "Probe record", registryId }] }, null, 2),
    stderr: "",
    rawPayload: { ok: true, status: 200, data: [{ id: "rec-1", label: "Probe record", registryId }] },
    httpStatus: 200,
    adapterMeta: {
      mode: "orchestration-graph",
      registryId,
      url,
      httpStatus: 200,
      method,
      transport: "feature-seed-mock"
    }
  };
}

function findRegistryRecord(workspaceConfig, registryId) {
  const id = String(registryId || "").trim();
  if (!id) return null;
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  for (const objectItem of objects) {
    if (objectItem?.objectType !== "api-registry") continue;
    const rows = Array.isArray(objectItem.rows) ? objectItem.rows : [];
    const match = rows.find(
      (r) => String(r?.integrationId || "").trim() === id
        || String(r?.id || "").trim() === id
        || String(r?.Name || "").trim() === id
    );
    if (match) return match;
  }
  return null;
}

function parseInputPayload(inputNode) {
  const config = inputNode?.config || {};
  const mode = String(config.inputMode || "manual").trim();
  if (mode === "manual") {
    const sample = config.samplePayload;
    if (sample && typeof sample === "object") return sample;
    if (typeof sample === "string" && sample.trim()) {
      try {
        return JSON.parse(sample);
      } catch {
        return {};
      }
    }
    return {};
  }
  return {};
}

/**
 * A model can finish one inference turn without finishing the workflow: a
 * governed tool call has been generated and now needs a correlated external
 * result. Keep that state distinct from both success and failure so callers
 * cannot accidentally convert a resumable turn into publishable run proof.
 */
function isAwaitingToolResult(result) {
  const customModel = result?.adapterMeta?.customModel;
  return result?.awaitingToolResult === true
    || String(result?.executionStatus || "") === "awaiting_tool_result"
    || customModel?.awaitingToolResult === true
    || String(customModel?.gatewayStatus || "") === "awaiting_tool_result";
}

/** Pure terminal classifier shared by the runner and sandbox route. */
function classifySandboxRunResult(result, { auditRequired = false, auditPersisted = true } = {}) {
  const awaitingToolResult = isAwaitingToolResult(result);
  const auditUnpersisted = auditRequired && !auditPersisted;
  // A pending provider-compute continuation is a live governed run, not a
  // terminal outcome: the paid allocation is journaled and observation
  // continues through the same route. It must never classify as failed.
  const computePending = !awaitingToolResult
    && !auditUnpersisted
    && result?.adapterMeta?.compute?.pending === true
    && !result?.error;
  const runOk = !awaitingToolResult && !auditUnpersisted && (computePending || (result?.exitCode === 0 && !result?.error));
  return {
    awaitingToolResult,
    auditUnpersisted,
    computePending,
    runOk,
    executionStatus: auditUnpersisted ? "audit_unpersisted" : awaitingToolResult ? "awaiting_tool_result" : computePending ? "pending" : runOk ? "completed" : "failed",
    rowStatus: auditUnpersisted ? "failed" : awaitingToolResult ? "pending" : computePending ? "pending" : runOk ? "connected" : "failed",
    outcomeStatus: auditUnpersisted ? "failed" : awaitingToolResult ? "drafted" : computePending ? "drafted" : runOk ? "tested" : "failed",
  };
}

function transformProviderPayload(rawPayload, transformConfig) {
  const config = transformConfig || {};
  const rootPath = String(config.rootPath || "").trim();
  let cursor = rootPath ? getValueAtPath(rawPayload, rootPath) : rawPayload;
  if (cursor === undefined) cursor = rawPayload;

  const fieldMap = config.fieldMap && typeof config.fieldMap === "object" ? config.fieldMap : {};
  if (Object.keys(fieldMap).length) {
    if (Array.isArray(cursor)) {
      cursor = cursor.map((row) => applyFieldMap(row, fieldMap));
    } else if (cursor && typeof cursor === "object") {
      cursor = applyFieldMap(cursor, fieldMap);
    }
  }

  if (Array.isArray(cursor)) {
    const filtered = applyFilters(cursor, config.filters, config.filterMode);
    const maxRows = Number(config.maxRows);
    if (Number.isFinite(maxRows) && maxRows > 0) {
      return filtered.slice(0, maxRows);
    }
    return filtered;
  }

  return cursor;
}

function getValueAtPath(obj, path) {
  if (!path) return obj;
  const parts = String(path).split(".").filter(Boolean);
  let cursor = obj;
  for (const part of parts) {
    if (cursor == null || typeof cursor !== "object") return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

async function executeApiRegistryCall(workspaceConfig, nodeConfig, inputPayload, timeoutMs, executionContext = {}) {
  const registryId = String(nodeConfig?.registryId || nodeConfig?.integrationId || "").trim();
  const registryRecord = findRegistryRecord(workspaceConfig, registryId);
  if (!registryRecord) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: `no API Registry row for integrationId ${registryId}`,
      adapterMeta: { mode: "orchestration-graph", registryId }
    };
  }

  const merged = {
    ...registryRecord,
    method: nodeConfig?.method || registryRecord.method,
    endpoint: nodeConfig?.endpoint || registryRecord.endpoint,
    baseUrl: nodeConfig?.baseUrl || registryRecord.baseUrl,
    authRef: nodeConfig?.authRef || registryRecord.authRef || registryId,
    requestHeadersMetadata: {
      ...(registryRecord.requestHeadersMetadata || {}),
      ...(nodeConfig?.requestHeadersMetadata || {})
    },
    authHeaderName: nodeConfig?.requestHeadersMetadata?.authHeaderName
      || registryRecord.authHeaderName
      || registryRecord.authHeader,
    authPrefix: nodeConfig?.requestHeadersMetadata?.authPrefix || registryRecord.authPrefix
  };

  if (merged?.metadata?.mothershipProxy) {
    const startedAt = Date.now();
    const effectiveInputPayload = executionContext?.inferenceContinuation
      ? {
          ...(inputPayload && typeof inputPayload === "object" ? inputPayload : {}),
          inference: {
            ...(inputPayload?.inference && typeof inputPayload.inference === "object" ? inputPayload.inference : {}),
            ...executionContext.inferenceContinuation,
          },
        }
      : inputPayload;
    const priorReceiptId = String(
      effectiveInputPayload?.inference?.prior_receipt_id
        || effectiveInputPayload?.inference?.priorReceiptId
        || effectiveInputPayload?.prior_receipt_id
        || effectiveInputPayload?.priorReceiptId
        || "",
    ).trim();
    let trustedContinuation = null;
    if (priorReceiptId) {
      if (typeof executionContext?.resolveInferenceContinuation !== "function") {
        return {
          ok: false,
          exitCode: 1,
          durationMs: Date.now() - startedAt,
          stdout: "",
          stderr: "",
          error: "tool continuation is unavailable because governed receipt resolution is not configured",
          adapterMeta: { mode: "orchestration-graph", registryId },
        };
      }
      const continuationResolution = await executionContext.resolveInferenceContinuation({
        receiptId: priorReceiptId,
        modelId: String(merged.metadata.mothershipProxy.workspaceSlug || "workspace-local"),
        policyRegistryId: String(merged.integrationId || registryId),
        appScope: String(executionContext?.appScope || "workspace-wide"),
      });
      if (!continuationResolution?.ok || !continuationResolution?.continuation) {
        return {
          ok: false,
          exitCode: 1,
          durationMs: Date.now() - startedAt,
          stdout: "",
          stderr: "",
          error: continuationResolution?.reason || "prior inference receipt could not be authorized",
          adapterMeta: { mode: "orchestration-graph", registryId },
        };
      }
      trustedContinuation = continuationResolution.continuation;
    }
    const inference = await executeCustomModelWorkflow({
      workspaceConfig,
      policyRow: merged,
      inputPayload: effectiveInputPayload,
      runId: executionContext?.runId,
      clusterId: String(nodeConfig?.clusterId || nodeConfig?.workflowVariant || "workflow"),
      maxTokens: Number(nodeConfig?.maxTokens) || 512,
      workflowVariant: String(executionContext?.workflowVariant || nodeConfig?.workflowVariant || "chat"),
      traceparent: String(executionContext?.traceparent || ""),
      tracestate: String(executionContext?.tracestate || ""),
      appScope: String(executionContext?.appScope || ""),
      onEvent: executionContext?.onEvent,
      networkPolicy: {
        networkAllow: executionContext?.networkAllow === true,
        allowList: Array.isArray(executionContext?.allowList) ? executionContext.allowList : [],
      },
      resolvedEnv: executionContext?.resolvedSecretsByRef || {},
      allowedEnvRefs: Array.isArray(executionContext?.envRefSlugs) ? executionContext.envRefSlugs : [],
      trustedContinuation,
      signal: executionContext?.signal,
      timeoutMs: Math.min(Math.max(Number(timeoutMs) || 1_000, 1_000), 120_000),
      inferenceManifests: Array.isArray(executionContext?.inferenceManifests) ? executionContext.inferenceManifests : [],
      inferenceManifestsRequired: executionContext?.inferenceManifestsRequired === true,
      liveExecution: executionContext?.liveExecution === true,
      childReceiptResolver: typeof executionContext?.resolveChildReceipt === "function"
        ? (args) => executionContext.resolveChildReceipt({
            ...args,
            modelId: String(merged.metadata.mothershipProxy.workspaceSlug || "workspace-local"),
            policyRegistryId: String(merged.integrationId || registryId),
          })
        : null,
    });
    if (!inference.ok) {
      return {
        ok: false,
        exitCode: 1,
        durationMs: Date.now() - startedAt,
        stdout: "",
        stderr: "",
        error: inference.error || "custom-model mothership inference failed",
        adapterMeta: {
          mode: "orchestration-graph",
          registryId,
          customModel: {
            attempts: inference.attempts || [],
            invocations: inference.invocations || [],
            traces: [],
          },
        },
      };
    }
    return {
      ok: true,
      exitCode: 0,
      durationMs: Date.now() - startedAt,
      stdout: JSON.stringify(inference.response, null, 2),
      stderr: "",
      rawPayload: inference.response,
      httpStatus: inference.status,
      ...(inference.continuation ? { continuation: inference.continuation } : {}),
      adapterMeta: {
        mode: "orchestration-graph",
        registryId,
        nodeType: "api-registry-call",
        transport: "mothership-policy",
        customModel: {
          route: String(inference.route?.target || ""),
          gatewayStatus: String(inference.gatewayStatus || "completed"),
          awaitingToolResult: inference.awaitingToolResult === true,
          attempts: inference.attempts,
          invocation: inference.invocation,
          trace: inference.trace,
          invocations: inference.invocations || (inference.invocation ? [inference.invocation] : []),
          traces: inference.traces || (inference.trace ? [inference.trace] : []),
          evaluation: inference.evaluation || null,
        },
      },
    };
  }

  let url;
  try {
    url = buildUrl(merged, inputPayload);
  } catch (err) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: err.message || "invalid URL",
      adapterMeta: { mode: "orchestration-graph", registryId }
    };
  }

  const method = normalizeMethod(merged.method);
  const authRef = merged.authRef || registryId;
  const secretEntry = readServerSecret(authRef);
  const secret = secretEntry?.value || "";
  const outboundTimeout = Math.min(Math.max(timeoutMs, 1000), 120000);
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), outboundTimeout);

  const meta = nodeConfig?.requestHeadersMetadata || {};
  const contentType = String(meta.contentType || "").trim() || (method === "GET" ? "" : "application/json");

  let body;
  const bodyTemplate = substituteVariables(String(nodeConfig?.bodyTemplate || ""), inputPayload);
  if (method !== "GET" && bodyTemplate) {
    try {
      body = JSON.parse(bodyTemplate);
    } catch {
      body = bodyTemplate;
    }
  } else if (method !== "GET" && isChatCompletionsRecord(merged, url)) {
    // The governed api-registry record DECLARES its capability — when it is a
    // chat-completions endpoint and the node carries no explicit bodyTemplate,
    // build the canonical OpenAI body from the input payload. This derives
    // from the persisted record (works identically across every workspace
    // persistence adapter — filesystem, Supabase/Postgres, or others), is
    // JSON-safe for any prompt content (no string templating), and fixes the
    // real defect where a bodyless POST to a compliant server (Ollama, vLLM)
    // is a 400 — which previously made every custom-model workflow node fail.
    body = buildChatCompletionsBody(merged, nodeConfig, inputPayload);
  }

  const mockResult = executeFeatureSeedMock(url, { registryId, method, startedAt });
  if (mockResult) {
    clearTimeout(timer);
    return mockResult;
  }

  try {
    const response = await fetch(url, {
      method,
      headers: {
        accept: "application/json, text/plain;q=0.9,*/*;q=0.8",
        ...(contentType ? { "content-type": contentType } : {}),
        ...buildAuthHeaders(merged, secret)
      },
      ...(body !== undefined ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
      signal: controller.signal
    });
    const durationMs = Date.now() - startedAt;
    const responseContentType = response.headers.get("content-type") || "";
    const payload = responseContentType.includes("application/json") ? await response.json() : await response.text();

    return {
      ok: response.ok,
      exitCode: response.ok ? 0 : 1,
      durationMs,
      stdout: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
      stderr: "",
      error: response.ok ? undefined : `HTTP ${response.status}`,
      rawPayload: payload,
      httpStatus: response.status,
      adapterMeta: {
        mode: "orchestration-graph",
        registryId,
        url,
        httpStatus: response.status,
        method,
        authRefSlug: authRef
      }
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const safeError = redactSecretsFromText(
      error.name === "AbortError" ? `request timed out after ${outboundTimeout}ms` : (error.message || "fetch failed")
    );
    return {
      ok: false,
      exitCode: null,
      durationMs,
      stdout: "",
      stderr: "",
      error: safeError,
      adapterMeta: { mode: "orchestration-graph", registryId, url, aborted: error.name === "AbortError" }
    };
  } finally {
    clearTimeout(timer);
  }
}

const SUPABASE_DATA_OPERATIONS = ["select", "insert", "update", "upsert", "delete", "rpc"];

/**
 * Execute the `supabase-data` node — governed PostgREST database operations
 * against the installed supabase-postgrest registry row. Mirrors
 * executeApiRegistryCall's envelope exactly (ok / exitCode / stdout /
 * rawPayload / httpStatus / adapterMeta) so the downstream transform/result
 * stages and receipts treat both HTTP stages identically.
 *
 * Secrets resolve server-side only: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * via the canonical env contract; the key rides the `apikey` header (gateway)
 * and Authorization Bearer (PostgREST) and never appears in results — errors
 * pass through redactSecretsFromText like every other stage.
 */
async function executeSupabaseData(workspaceConfig, nodeConfig, inputPayload, timeoutMs) {
  const registryId = String(nodeConfig?.registryId || nodeConfig?.integrationId || "supabase-postgrest").trim();
  const registryRecord = findRegistryRecord(workspaceConfig, registryId);
  if (!registryRecord) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: `no API Registry row for integrationId ${registryId} — install the Supabase product from the Add-ons Marketplace first`,
      adapterMeta: { mode: "orchestration-graph", nodeType: "supabase-data", registryId }
    };
  }

  const operation = String(nodeConfig?.operation || "select").trim().toLowerCase();
  if (!SUPABASE_DATA_OPERATIONS.includes(operation)) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: `unsupported supabase-data operation "${operation}" (expected ${SUPABASE_DATA_OPERATIONS.join("/")})`,
      adapterMeta: { mode: "orchestration-graph", nodeType: "supabase-data", registryId }
    };
  }

  const table = substituteVariables(String(nodeConfig?.table || "").trim(), inputPayload);
  const rpcFunction = substituteVariables(String(nodeConfig?.rpcFunction || "").trim(), inputPayload);
  if (operation === "rpc" ? !rpcFunction : !table) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: operation === "rpc" ? "supabase-data rpc requires rpcFunction" : "supabase-data requires a table",
      adapterMeta: { mode: "orchestration-graph", nodeType: "supabase-data", registryId, operation }
    };
  }

  const query = substituteVariables(String(nodeConfig?.query || "").trim(), inputPayload).replace(/^\?+/, "");
  // Guardrail: an update/delete with no PostgREST filter would mutate the
  // whole table — refuse instead of forwarding.
  if ((operation === "update" || operation === "delete") && !query) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: `supabase-data ${operation} requires a row filter query (e.g. id=eq.{{input.id}})`,
      adapterMeta: { mode: "orchestration-graph", nodeType: "supabase-data", registryId, operation, table }
    };
  }

  // Env resolution order matches product truth: row baseUrl (stamped from the
  // verified sync probe) → SUPABASE_URL; key via declared concrete env → the
  // row's authRef candidates.
  const baseUrl = String(nodeConfig?.baseUrl || registryRecord.baseUrl || "").trim()
    || String(readEnvVar("SUPABASE_URL")?.value || "").trim();
  const authRef = String(nodeConfig?.authRef || registryRecord.authRef || "SUPABASE").trim();
  const secret = String(
    readEnvVar("SUPABASE_SERVICE_ROLE_KEY")?.value
    || readServerSecret(authRef)?.value
    || ""
  );
  if (!baseUrl || !secret) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: `Supabase runtime env is not resolved (${!baseUrl ? "SUPABASE_URL" : "SUPABASE_SERVICE_ROLE_KEY"} missing) — verify the product in Add-ons`,
      adapterMeta: { mode: "orchestration-graph", nodeType: "supabase-data", registryId, operation, table }
    };
  }

  const resource = operation === "rpc" ? `rpc/${rpcFunction}` : table;
  const url = `${baseUrl.replace(/\/+$/, "")}/rest/v1/${resource}${query ? `?${query}` : ""}`;
  const methodByOperation = { select: "GET", insert: "POST", upsert: "POST", update: "PATCH", delete: "DELETE", rpc: "POST" };
  const method = methodByOperation[operation];

  const preferParts = [];
  if (operation === "upsert") preferParts.push("resolution=merge-duplicates");
  if (["insert", "upsert", "update", "delete"].includes(operation) && nodeConfig?.returnRepresentation !== false) {
    preferParts.push("return=representation");
  }

  let body;
  if (method !== "GET" && method !== "DELETE") {
    const bodyTemplate = substituteVariables(String(nodeConfig?.bodyTemplate || ""), inputPayload);
    if (bodyTemplate) {
      try {
        body = JSON.parse(bodyTemplate);
      } catch {
        return {
          ok: false,
          exitCode: 1,
          durationMs: 0,
          stdout: "",
          stderr: "",
          error: "supabase-data bodyTemplate is not valid JSON after input substitution",
          adapterMeta: { mode: "orchestration-graph", nodeType: "supabase-data", registryId, operation, table }
        };
      }
    } else if (operation !== "rpc") {
      return {
        ok: false,
        exitCode: 1,
        durationMs: 0,
        stdout: "",
        stderr: "",
        error: `supabase-data ${operation} requires a JSON bodyTemplate`,
        adapterMeta: { mode: "orchestration-graph", nodeType: "supabase-data", registryId, operation, table }
      };
    }
  }

  const outboundTimeout = Math.min(Math.max(Number(timeoutMs) || 30000, 1000), 120000);
  const startedAt = Date.now();

  const mockResult = executeFeatureSeedMock(url, { registryId, method, startedAt });
  if (mockResult) return mockResult;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), outboundTimeout);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        accept: "application/json",
        apikey: secret,
        authorization: `Bearer ${secret}`,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(preferParts.length ? { prefer: preferParts.join(",") } : {})
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal
    });
    const durationMs = Date.now() - startedAt;
    const responseContentType = response.headers.get("content-type") || "";
    const payload = responseContentType.includes("json") ? await response.json() : await response.text();

    return {
      ok: response.ok,
      exitCode: response.ok ? 0 : 1,
      durationMs,
      stdout: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
      stderr: "",
      error: response.ok ? undefined : `HTTP ${response.status}`,
      rawPayload: payload,
      httpStatus: response.status,
      adapterMeta: {
        mode: "orchestration-graph",
        nodeType: "supabase-data",
        registryId,
        operation,
        table: operation === "rpc" ? "" : table,
        rpcFunction: operation === "rpc" ? rpcFunction : "",
        url,
        httpStatus: response.status,
        method,
        authRefSlug: authRef
      }
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const safeError = redactSecretsFromText(
      error.name === "AbortError" ? `request timed out after ${outboundTimeout}ms` : (error.message || "fetch failed")
    );
    return {
      ok: false,
      exitCode: null,
      durationMs,
      stdout: "",
      stderr: "",
      error: safeError,
      adapterMeta: { mode: "orchestration-graph", nodeType: "supabase-data", registryId, operation, url, aborted: error.name === "AbortError" }
    };
  } finally {
    clearTimeout(timer);
  }
}

// Read-only allowlist — the stripe-commerce node NEVER mutates commerce
// state in V1. Anything outside this list is refused structurally (mirror of
// the supabase-data filterless-mutation guard discipline).
const STRIPE_COMMERCE_OPERATIONS = ["list-payment-intents", "list-customers", "list-products", "retrieve-balance"];
const STRIPE_COMMERCE_PATHS = {
  "list-payment-intents": "/v1/payment_intents",
  "list-customers": "/v1/customers",
  "list-products": "/v1/products",
  "retrieve-balance": "/v1/balance",
};

/**
 * Execute the `stripe-commerce` node — governed READ-ONLY revenue lookups
 * against the installed stripe-payments registry row (workspace-commerce
 * lane). Mirrors executeSupabaseData's envelope exactly so transform/result
 * stages and receipts treat every HTTP stage identically.
 *
 * Secrets resolve server-side only (STRIPE_SECRET_KEY via the canonical env
 * contract); errors pass through redactSecretsFromText; adapterMeta carries
 * ref slugs, never values.
 */
async function executeStripeCommerce(workspaceConfig, nodeConfig, inputPayload, timeoutMs) {
  const registryId = String(nodeConfig?.registryId || nodeConfig?.integrationId || "stripe-payments").trim();
  const registryRecord = findRegistryRecord(workspaceConfig, registryId);
  if (!registryRecord) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: `no API Registry row for integrationId ${registryId} — install the Stripe product from the Add-ons Marketplace first`,
      adapterMeta: { mode: "orchestration-graph", nodeType: "stripe-commerce", registryId }
    };
  }

  const operation = String(nodeConfig?.operation || "list-payment-intents").trim().toLowerCase();
  if (!STRIPE_COMMERCE_OPERATIONS.includes(operation)) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: `unsupported stripe-commerce operation "${operation}" (read-only V1: ${STRIPE_COMMERCE_OPERATIONS.join("/")})`,
      adapterMeta: { mode: "orchestration-graph", nodeType: "stripe-commerce", registryId }
    };
  }

  // SECURITY: the bearer secret only ever travels to bases from GOVERNED
  // material — the server-written registry row or runtime env. Canvas node
  // config is browser-editable and must never redirect credentialed calls.
  const baseUrl = String(registryRecord.baseUrl || "").trim()
    || String(readEnvVar("STRIPE_API_URL")?.value || "").trim()
    || "https://api.stripe.com";
  const authRef = String(nodeConfig?.authRef || registryRecord.authRef || "STRIPE").trim();
  const secret = String(
    readEnvVar("STRIPE_SECRET_KEY")?.value
    || readServerSecret(authRef)?.value
    || ""
  );
  if (!secret) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: "Stripe runtime env is not resolved (STRIPE_SECRET_KEY missing) — verify the product in Add-ons",
      adapterMeta: { mode: "orchestration-graph", nodeType: "stripe-commerce", registryId, operation }
    };
  }

  const query = substituteVariables(String(nodeConfig?.queryTemplate || nodeConfig?.query || "").trim(), inputPayload).replace(/^\?+/, "");
  const url = `${baseUrl.replace(/\/+$/, "")}${STRIPE_COMMERCE_PATHS[operation]}${query ? `?${query}` : ""}`;

  const outboundTimeout = Math.min(Math.max(Number(timeoutMs) || 30000, 1000), 120000);
  const startedAt = Date.now();
  const mockResult = executeFeatureSeedMock(url, { registryId, method: "GET", startedAt });
  if (mockResult) return mockResult;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), outboundTimeout);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json", authorization: `Bearer ${secret}` },
      signal: controller.signal
    });
    const durationMs = Date.now() - startedAt;
    const responseContentType = response.headers.get("content-type") || "";
    const payload = responseContentType.includes("json") ? await response.json() : await response.text();
    return {
      ok: response.ok,
      exitCode: response.ok ? 0 : 1,
      durationMs,
      stdout: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
      stderr: "",
      error: response.ok ? undefined : `HTTP ${response.status}`,
      rawPayload: payload,
      httpStatus: response.status,
      adapterMeta: {
        mode: "orchestration-graph",
        nodeType: "stripe-commerce",
        registryId,
        operation,
        url,
        httpStatus: response.status,
        method: "GET",
        authRefSlug: authRef
      }
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const safeError = redactSecretsFromText(
      error.name === "AbortError" ? `request timed out after ${outboundTimeout}ms` : (error.message || "fetch failed")
    );
    return {
      ok: false,
      exitCode: null,
      durationMs,
      stdout: "",
      stderr: "",
      error: safeError,
      adapterMeta: { mode: "orchestration-graph", nodeType: "stripe-commerce", registryId, operation, url, aborted: error.name === "AbortError" }
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Execute the `resend-email` node — one governed outbound email send through
 * the installed resend-email registry row (workspace-messaging lane). Same
 * envelope contract as every other HTTP stage.
 *
 * No-code discipline: `from` falls back to the RESEND_FROM_EMAIL env ref the
 * marketplace install names, so a user never has to hand-wire sender setup
 * into the node; missing prerequisites fail honestly by env NAME.
 */
async function executeResendEmail(workspaceConfig, nodeConfig, inputPayload, timeoutMs) {
  const registryId = String(nodeConfig?.registryId || nodeConfig?.integrationId || "resend-email").trim();
  const registryRecord = findRegistryRecord(workspaceConfig, registryId);
  if (!registryRecord) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: `no API Registry row for integrationId ${registryId} — install the Resend product from the Add-ons Marketplace first`,
      adapterMeta: { mode: "orchestration-graph", nodeType: "resend-email", registryId }
    };
  }

  const authRef = String(nodeConfig?.authRef || registryRecord.authRef || "RESEND").trim();
  const secret = String(
    readEnvVar("RESEND_API_KEY")?.value
    || readServerSecret(authRef)?.value
    || ""
  );
  if (!secret) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: "Resend runtime env is not resolved (RESEND_API_KEY missing) — verify the product in Add-ons",
      adapterMeta: { mode: "orchestration-graph", nodeType: "resend-email", registryId }
    };
  }

  const to = substituteVariables(String(nodeConfig?.toTemplate || nodeConfig?.to || "").trim(), inputPayload);
  const subject = substituteVariables(String(nodeConfig?.subjectTemplate || nodeConfig?.subject || "").trim(), inputPayload);
  const html = substituteVariables(String(nodeConfig?.htmlTemplate || nodeConfig?.html || ""), inputPayload).trim();
  const text = substituteVariables(String(nodeConfig?.textTemplate || nodeConfig?.text || ""), inputPayload).trim();
  const from = substituteVariables(String(nodeConfig?.fromTemplate || nodeConfig?.from || "").trim(), inputPayload)
    || String(readEnvVar("RESEND_FROM_EMAIL")?.value || "").trim();
  if (!to || !subject || (!html && !text)) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: "resend-email requires To, Subject, and an HTML or text body (bind values with {{input.key}})",
      adapterMeta: { mode: "orchestration-graph", nodeType: "resend-email", registryId }
    };
  }
  if (!from) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: "resend-email sender is not resolved — set RESEND_FROM_EMAIL in the runtime or a From value on the node",
      adapterMeta: { mode: "orchestration-graph", nodeType: "resend-email", registryId }
    };
  }

  // SECURITY: the bearer secret only ever travels to bases from GOVERNED
  // material — runtime env or the server-written registry row. Canvas node
  // config is browser-editable and must never redirect credentialed calls.
  const baseUrl = String(readEnvVar("RESEND_API_URL")?.value || "").trim()
    || String(registryRecord.baseUrl || "").trim()
    || "https://api.resend.com";
  const url = `${baseUrl.replace(/\/+$/, "")}/emails`;
  const recipients = to.split(",").map((value) => value.trim()).filter(Boolean);

  const outboundTimeout = Math.min(Math.max(Number(timeoutMs) || 30000, 1000), 120000);
  const startedAt = Date.now();
  const mockResult = executeFeatureSeedMock(url, { registryId, method: "POST", startedAt });
  if (mockResult) return mockResult;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), outboundTimeout);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { accept: "application/json", authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: recipients, subject, ...(html ? { html } : {}), ...(text ? { text } : {}) }),
      signal: controller.signal
    });
    const durationMs = Date.now() - startedAt;
    const responseContentType = response.headers.get("content-type") || "";
    const payload = responseContentType.includes("json") ? await response.json() : await response.text();
    return {
      ok: response.ok,
      exitCode: response.ok ? 0 : 1,
      durationMs,
      stdout: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
      stderr: "",
      error: response.ok ? undefined : `HTTP ${response.status}`,
      rawPayload: payload,
      httpStatus: response.status,
      adapterMeta: {
        mode: "orchestration-graph",
        nodeType: "resend-email",
        registryId,
        operation: "send",
        recipientCount: recipients.length,
        url,
        httpStatus: response.status,
        method: "POST",
        authRefSlug: authRef
      }
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const safeError = redactSecretsFromText(
      error.name === "AbortError" ? `request timed out after ${outboundTimeout}ms` : (error.message || "fetch failed")
    );
    return {
      ok: false,
      exitCode: null,
      durationMs,
      stdout: "",
      stderr: "",
      error: safeError,
      adapterMeta: { mode: "orchestration-graph", nodeType: "resend-email", registryId, url, aborted: error.name === "AbortError" }
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Curated capability-node executor registry — the ONLY place a bespoke node
 * type binds to its server-side executor. Order = dispatch precedence after
 * api-registry-call. Adding a Tier-1 node: one entry here + a manifest
 * `surfaces.node` declaration in workspace-add-ons.js; the palette, canvas
 * badge, and validator derive from those two places.
 */
const CAPABILITY_NODE_EXECUTORS = [
  ["supabase-data", extractSupabaseDataNode, executeSupabaseData],
  ["stripe-commerce", extractStripeCommerceNode, executeStripeCommerce],
  ["resend-email", extractResendEmailNode, executeResendEmail],
];

/**
 * Run a growthub-native orchestration graph when present on the sandbox row.
 * Returns null when the row has no executable graph (caller falls back to adapter path).
 *
 * `runInputs` (V2) — normalized manual run input envelope. When provided, the
 * non-secret values override matching keys in the input node's samplePayload
 * for `human-input` / form workflows. Secret values (those stored as
 * `{ secretRef }`) are never expanded into the runner payload.
 */
async function runOrchestrationGraphIfPresent({ workspaceConfig, row, timeoutMs, runInputs, executionContext }) {
  const graph = parseOrchestrationGraph(row?.orchestrationGraph || row?.orchestrationConfig);
  if (!graph || String(graph.provider || "").trim() !== "growthub-native") return null;

  if (isAgentSwarmGraph(graph)) {
    return await runAgentSwarmGraphIfPresent({
      workspaceConfig,
      row,
      graph,
      timeoutMs,
      runInputs,
      executionContext
    });
  }

  // The single executing HTTP stage: api-registry-call (generic registry row
  // — also the long-tail node-variant lane) or a curated capability node.
  // Precedence is strictly additive — api-registry-call first, then the
  // capability node types in their declared order — so pre-existing graphs
  // never change behavior. Adding a bespoke node = one registry entry here
  // + a manifest `surfaces.node` declaration; nothing else branches.
  const registryCallNode = extractApiRegistryCallNode(graph);
  let apiNode = registryCallNode?.config ? registryCallNode : null;
  let runHttpStage = executeApiRegistryCall;
  if (!apiNode) {
    for (const [, extract, executor] of CAPABILITY_NODE_EXECUTORS) {
      const candidate = extract(graph);
      if (candidate?.config) {
        apiNode = candidate;
        runHttpStage = executor;
        break;
      }
    }
  }
  if (!apiNode?.config) {
    if ((Array.isArray(graph.nodes) ? graph.nodes : []).some((node) => node?.type === "ai-agent")) {
      return null;
    }
    return {
      ok: false,
      exitCode: 1,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: `orchestrationGraph is missing an executing node (api-registry-call or one of: ${CAPABILITY_NODE_EXECUTORS.map(([type]) => type).join(", ")})`,
      adapterMeta: { mode: "orchestration-graph", provider: graph.provider }
    };
  }

  const inputNode = extractInputNode(graph);
  const baseInputPayload = parseInputPayload(inputNode);
  const manualPayload = runInputs ? buildInputPayloadForRunner(runInputs) : {};
  const inputPayload = { ...baseInputPayload, ...manualPayload };
  const consumedInputKeys = Object.keys(manualPayload);
  const transformConfig = extractTransformConfig(graph);
  const transformNode = (Array.isArray(graph.nodes) ? graph.nodes : [])
    .find((n) => n?.type === "transform-filter" || n?.type === "normalize-output");
  const resultNode = graph.nodes?.find((n) => n?.type === "tool-result");
  const successCodes = Array.isArray(resultNode?.config?.successStatusCodes)
    ? resultNode.config.successStatusCodes.map(Number).filter(Number.isFinite)
    : [200];

  // Per-node execution deltas for the GENERAL orchestration pipeline (not
  // swarm-specific): stream node lifecycle through the same onEvent NDJSON hook
  // the route already wires, and record a terminal nodeTrace persisted on the
  // run record. Every event corresponds to a real pipeline stage executing.
  const onEvent = typeof executionContext?.onEvent === "function" ? executionContext.onEvent : null;
  const runId = String(executionContext?.runId || "").trim();
  const nodeTrace = [];
  const emitNode = (nodeId, status, error, details = null) => {
    const id = String(nodeId || "").trim();
    if (!id) return;
    const terminal = status === "completed" || status === "failed" || status === "skipped" || status === "pending";
    const safeDetails = details && typeof details === "object" ? details : {};
    if (terminal) {
      nodeTrace.push({ id, status, ...safeDetails, ...(error ? { error: String(error) } : {}) });
    }
    if (onEvent) {
      onEvent({
        kind: "growthub-sandbox-run-delta-v1",
        type: `orchestration.node.${status}`,
        nodeId: id,
        runId,
        emittedAt: new Date().toISOString(),
        ...safeDetails,
        ...(error ? { error: String(error) } : {})
      });
    }
  };

  // Input stage — payload is assembled above; it ran.
  if (inputNode?.id) { emitNode(inputNode.id, "started"); emitNode(inputNode.id, "completed"); }

  // HTTP stage (API Registry call or Supabase data operation).
  if (apiNode?.id) emitNode(apiNode.id, "started");
  const raw = await runHttpStage(
    workspaceConfig,
    apiNode.config,
    inputPayload,
    Number(apiNode.config?.timeoutMs) || timeoutMs,
    executionContext
  );

  if (raw.ok && raw.rawPayload !== undefined) {
    const httpStatus = Number(raw.httpStatus);
    if (successCodes.length && !successCodes.includes(httpStatus)) {
      raw.ok = false;
      raw.exitCode = 1;
      raw.error = `HTTP ${httpStatus} is not in successStatusCodes`;
    }
  }

  const awaitingToolResult = raw.ok && isAwaitingToolResult(raw);

  if (apiNode?.id) {
    if (awaitingToolResult) emitNode(apiNode.id, "pending", null, { awaiting: "tool_result", generation: "completed" });
    else if (raw.ok) emitNode(apiNode.id, "completed");
    else emitNode(apiNode.id, "failed", raw.error);
  }

  // Custom-model variants execute their additional calls inside the governed
  // mothership executor (recursive, agentic, and eval). Mirror those REAL
  // completed requests onto their declared canvas nodes so the run trace and
  // the visible graph tell the same story. No invocation evidence means no
  // completed badge.
  const additionalApiNodes = (Array.isArray(graph.nodes) ? graph.nodes : [])
    .filter((candidate) => candidate?.type === "api-registry-call" && candidate?.id !== apiNode?.id);
  const customInvocations = Array.isArray(raw?.adapterMeta?.customModel?.invocations)
    ? raw.adapterMeta.customModel.invocations
    : [];
  additionalApiNodes.forEach((candidate, index) => {
    if (!awaitingToolResult && raw.ok && customInvocations[index + 1]) {
      emitNode(candidate.id, "started");
      emitNode(candidate.id, "completed");
    } else {
      emitNode(candidate.id, "skipped");
    }
  });

  if (awaitingToolResult) {
    // The inference receipt/tool call remains in adapterMeta for the governed
    // continuation, but no provider payload is promoted as a final workflow
    // result and no downstream transform/result node is claimed to have run.
    raw.ok = false;
    raw.exitCode = null;
    raw.stdout = "";
    raw.stderr = "";
    raw.awaitingToolResult = true;
    raw.pending = true;
    raw.executionStatus = "awaiting_tool_result";
    raw.continuation = raw.continuation && typeof raw.continuation === "object"
      ? raw.continuation
      : { kind: "tool_result", status: "pending" };
    delete raw.rawPayload;
    delete raw.httpStatus;
    if (transformNode?.id) emitNode(transformNode.id, "skipped");
    if (resultNode?.id) emitNode(resultNode.id, "skipped");
  } else if (raw.ok && raw.rawPayload !== undefined) {
    if (transformNode?.id) emitNode(transformNode.id, "started");
    const transformed = transformProviderPayload(raw.rawPayload, transformConfig);
    raw.stdout = typeof transformed === "string"
      ? transformed
      : normalizeJsonAtPath(transformed, "");
    delete raw.rawPayload;
    delete raw.httpStatus;
    if (transformNode?.id) emitNode(transformNode.id, "completed");
    if (resultNode?.id) { emitNode(resultNode.id, "started"); emitNode(resultNode.id, "completed"); }
  } else if (raw.error) {
    raw.error = redactSecretsFromText(raw.error);
    // Downstream stages never executed → record them as skipped (not-run), not
    // failed: only the api stage actually failed.
    if (transformNode?.id) emitNode(transformNode.id, "skipped");
    if (resultNode?.id) emitNode(resultNode.id, "skipped");
  }

  if (raw.stdout) {
    raw.stdout = redactSecretsFromText(raw.stdout);
  }

  return {
    ...raw,
    nodeTrace,
    adapterMeta: {
      ...(raw.adapterMeta || {}),
      orchestrationProvider: graph.provider,
      orchestrationVersion: graph.version,
      ...(consumedInputKeys.length
        ? { runInputsConsumed: consumedInputKeys, runInputSource: String(runInputs?.source || "manual") }
        : {})
    }
  };
}

export {
  classifySandboxRunResult,
  executeResendEmail,
  executeStripeCommerce,
  executeSupabaseData,
  isAwaitingToolResult,
  runOrchestrationGraphIfPresent,
};
