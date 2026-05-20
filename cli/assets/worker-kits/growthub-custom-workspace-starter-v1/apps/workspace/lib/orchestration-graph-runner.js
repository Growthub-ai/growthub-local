/**
 * Server-side growthub-native orchestration graph execution for sandbox-run.
 */

import {
  extractApiRegistryCallNode,
  extractNormalizeConfig,
  normalizeJsonAtPath,
  parseOrchestrationGraph
} from "./orchestration-graph.js";

function normalizeMethod(value) {
  const method = String(value || "GET").trim().toUpperCase();
  return ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method) ? method : "GET";
}

function buildUrl(record) {
  const baseUrl = String(record?.baseUrl || "").trim();
  const endpoint = String(record?.endpoint || "").trim();
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
  const headerName = String(record?.authHeaderName || record?.authHeader || "x-api-key").trim();
  if (!headerName) return {};
  const prefix = String(record?.authPrefix || "").trim();
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

async function executeApiRegistryCall(workspaceConfig, nodeConfig, timeoutMs) {
  const registryId = String(nodeConfig?.registryId || "").trim();
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
    authRef: nodeConfig?.authRef || registryRecord.authRef || registryId
  };

  let url;
  try {
    url = buildUrl(merged);
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

  try {
    const response = await fetch(url, {
      method,
      headers: {
        accept: "application/json, text/plain;q=0.9,*/*;q=0.8",
        ...(method !== "GET" ? { "content-type": "application/json" } : {}),
        ...buildAuthHeaders(merged, secret)
      },
      signal: controller.signal
    });
    const durationMs = Date.now() - startedAt;
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();

    return {
      ok: response.ok,
      exitCode: response.ok ? 0 : 1,
      durationMs,
      stdout: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
      stderr: "",
      error: response.ok ? undefined : `HTTP ${response.status}`,
      rawPayload: payload,
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
    return {
      ok: false,
      exitCode: null,
      durationMs,
      stdout: "",
      stderr: "",
      error: error.name === "AbortError" ? `request timed out after ${outboundTimeout}ms` : (error.message || "fetch failed"),
      adapterMeta: { mode: "orchestration-graph", registryId, url, aborted: error.name === "AbortError" }
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run a growthub-native orchestration graph when present on the sandbox row.
 * Returns null when the row has no executable graph (caller falls back to adapter path).
 */
async function runOrchestrationGraphIfPresent({ workspaceConfig, row, timeoutMs }) {
  const graph = parseOrchestrationGraph(row?.orchestrationGraph);
  if (!graph || String(graph.provider || "").trim() !== "growthub-native") return null;

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

  const raw = await executeApiRegistryCall(workspaceConfig, apiNode.config, timeoutMs);
  const normalizeConfig = extractNormalizeConfig(graph);
  if (raw.ok && raw.rawPayload !== undefined) {
    raw.stdout = normalizeJsonAtPath(raw.rawPayload, normalizeConfig.rootPath);
    delete raw.rawPayload;
  }

  return {
    ...raw,
    adapterMeta: {
      ...(raw.adapterMeta || {}),
      orchestrationProvider: graph.provider,
      orchestrationVersion: graph.version
    }
  };
}

export { runOrchestrationGraphIfPresent };
