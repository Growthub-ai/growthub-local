import { NextResponse } from "next/server";
import { readWorkspaceConfig } from "@/lib/workspace-config";
import { readServerSecret } from "@/lib/workspace-env-resolver";

const DEFAULT_TIMEOUT_MS = 15000;

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

function findRegistryRecord(workspaceConfig, registryId) {
  const id = String(registryId || "").trim();
  if (!id) return null;
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  for (const object of objects) {
    if (object?.objectType !== "api-registry") continue;
    const match = (object.rows || []).find((row) => row?.integrationId === id || row?.id === id || row?.Name === id);
    if (match) return match;
  }
  return null;
}

function buildAuthHeaders(record, secret) {
  if (!secret) return {};
  const headerName = String(record?.authHeaderName || record?.authHeader || "x-api-key").trim();
  if (!headerName) return {};
  const prefix = String(record?.authPrefix || "").trim();
  return { [headerName]: prefix ? `${prefix} ${secret}` : secret };
}

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const workspaceConfig = await readWorkspaceConfig();
  const dataSourceRecord = body?.dataSourceRecord && typeof body.dataSourceRecord === "object"
    ? body.dataSourceRecord
    : null;
  const registryRecord = dataSourceRecord ? findRegistryRecord(workspaceConfig, dataSourceRecord.registryId) : null;
  const record = {
    ...(registryRecord || {}),
    ...(body?.record || {}),
    ...(dataSourceRecord || {}),
  };

  let url;
  try {
    url = buildUrl(record);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  const method = normalizeMethod(record.method);
  const authRef = record.authRef || record.integrationId || dataSourceRecord?.registryId;
  const secret = readServerSecret(authRef);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        accept: "application/json",
        ...(method !== "GET" ? { "content-type": "application/json" } : {}),
        ...buildAuthHeaders(record, secret),
      },
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();
    return NextResponse.json({
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      url,
      authRef: authRef || null,
      usedServerSecret: Boolean(secret),
      response: payload,
    }, { status: response.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error.name === "AbortError" ? "request timed out" : error.message || "request failed",
      url,
      authRef: authRef || null,
    }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

export { POST };
