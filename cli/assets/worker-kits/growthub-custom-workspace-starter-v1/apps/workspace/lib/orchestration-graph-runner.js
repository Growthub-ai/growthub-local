/**
 * Server-side growthub-native orchestration graph execution for sandbox-run.
 */

import {
  applyFieldMap,
  applyFilters,
  extractApiRegistryCallNode,
  extractInputNode,
  extractTransformConfig,
  isAgentSwarmGraph,
  normalizeJsonAtPath,
  parseOrchestrationGraph,
  redactSecretsFromText,
  substituteVariables
} from "./orchestration-graph.js";
import { buildInputPayloadForRunner } from "./orchestration-run-inputs.js";
import { runAgentSwarmGraphIfPresent } from "./orchestration-agent-swarm.js";

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

function envKeyCandidates(ref) {
  const token = String(ref || "")
    .trim()
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return Array.from(new Set([
    token,
    token ? `${token}_API_KEY` : "",
    token ? `${token}_TOKEN` : ""
  ].filter(Boolean)));
}

function readServerSecret(authRef) {
  for (const key of envKeyCandidates(authRef)) {
    if (process.env[key]) return { key, value: process.env[key] };
  }
  return null;
}

function buildAuthHeaders(record, secretValue) {
  if (!secretValue) return {};
  const meta = record?.requestHeadersMetadata || {};
  const headerName = String(meta.authHeaderName || record?.authHeaderName || record?.authHeader || "x-api-key").trim();
  if (!headerName) return {};
  const prefix = String(meta.authPrefix || record?.authPrefix || "").trim();
  return { [headerName]: prefix ? `${prefix} ${secretValue}` : secretValue };
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

async function executeApiRegistryCall(workspaceConfig, nodeConfig, inputPayload, timeoutMs) {
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

  const apiNode = extractApiRegistryCallNode(graph);
  if (!apiNode?.config) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: "orchestrationGraph is missing an api-registry-call node",
      adapterMeta: { mode: "orchestration-graph", provider: graph.provider }
    };
  }

  const inputNode = extractInputNode(graph);
  const baseInputPayload = parseInputPayload(inputNode);
  const manualPayload = runInputs ? buildInputPayloadForRunner(runInputs) : {};
  const inputPayload = { ...baseInputPayload, ...manualPayload };
  const consumedInputKeys = Object.keys(manualPayload);
  const transformConfig = extractTransformConfig(graph);
  const resultNode = graph.nodes?.find((n) => n?.type === "tool-result");
  const successCodes = Array.isArray(resultNode?.config?.successStatusCodes)
    ? resultNode.config.successStatusCodes.map(Number).filter(Number.isFinite)
    : [200];

  const raw = await executeApiRegistryCall(
    workspaceConfig,
    apiNode.config,
    inputPayload,
    Number(apiNode.config?.timeoutMs) || timeoutMs
  );

  if (raw.ok && raw.rawPayload !== undefined) {
    const httpStatus = Number(raw.httpStatus);
    if (successCodes.length && !successCodes.includes(httpStatus)) {
      raw.ok = false;
      raw.exitCode = 1;
      raw.error = `HTTP ${httpStatus} is not in successStatusCodes`;
    }
    const transformed = transformProviderPayload(raw.rawPayload, transformConfig);
    raw.stdout = typeof transformed === "string"
      ? transformed
      : normalizeJsonAtPath(transformed, "");
    delete raw.rawPayload;
    delete raw.httpStatus;
  } else if (raw.error) {
    raw.error = redactSecretsFromText(raw.error);
  }

  if (raw.stdout) {
    raw.stdout = redactSecretsFromText(raw.stdout);
  }

  return {
    ...raw,
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

export { runOrchestrationGraphIfPresent };
