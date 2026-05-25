/**
 * Nango Thin Adapter — server-only auth/proxy authority for API Registry rows.
 *
 * Architecture invariant:
 *   - API Registry remains the governed business object.
 *   - Nango is a row-level auth/proxy delegate, never a top-level adapter.
 *   - NANGO_SECRET_KEY is read from process.env only. It is never returned
 *     to the browser, never persisted to growthub.config.json, and never
 *     leaks into adapter metadata.
 *   - Provider tokens (OAuth access/refresh tokens, API keys held by Nango)
 *     never leave this module. We use Nango's Proxy so the credential
 *     resolution happens on Nango's side; we receive only the provider's
 *     response.
 *
 * V1 surface (intentionally narrow):
 *   - describeNangoAdapter()        — safe summary of env wiring
 *   - getNangoServerConfig()        — server-only config bundle (has secret)
 *   - createNangoConnectSession()   — POST /connect/sessions
 *   - getNangoConnectionSummary()   — GET /connection/{id} (safe fields)
 *   - executeNangoProxyRequest()    — POST/GET/PATCH/PUT/DELETE /proxy/{endpoint}
 *   - redactNangoError()            — scrub secret-shaped substrings
 *
 * Implementation note: this module uses plain fetch against Nango's REST API
 * (matching what @nangohq/node does internally) so the workspace starter does
 * not need to add a runtime dependency for a thin adapter. The trade-off is
 * we do not get Nango SDK retries; for V1 that is acceptable since the proxy
 * path itself already implements provider-side rate limit handling.
 */

const DEFAULT_NANGO_HOST = "https://api.nango.dev";
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;
const MAX_REQUEST_TIMEOUT_MS = 120000;

const SAFE_CONNECTION_FIELDS = [
  "connection_id",
  "provider_config_key",
  "provider",
  "created_at",
  "updated_at",
  "last_fetched_at",
  "metadata",
  "end_user",
  "tags",
  "errors",
];

function normalizeMethod(value) {
  const method = String(value || "GET").trim().toUpperCase();
  return ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method) ? method : "GET";
}

function clampTimeoutMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_REQUEST_TIMEOUT_MS;
  return Math.min(Math.max(n, 1000), MAX_REQUEST_TIMEOUT_MS);
}

function safeString(value) {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : String(value);
}

/**
 * Server-only Nango configuration. Reads `NANGO_SECRET_KEY` and the optional
 * `NANGO_HOST` env var. Throws when no secret is present so callers can
 * surface a structured error instead of silently failing the proxy request.
 */
function getNangoServerConfig() {
  const secretKey = safeString(process.env.NANGO_SECRET_KEY).trim();
  if (!secretKey) {
    const error = new Error("NANGO_SECRET_KEY is not set");
    error.code = "NANGO_SECRET_MISSING";
    throw error;
  }
  const host = safeString(process.env.NANGO_HOST).trim() || DEFAULT_NANGO_HOST;
  return { secretKey, host };
}

/**
 * Safe describer for the env wiring. Never returns the secret value, only
 * a presence boolean and the host string. Suitable for /api/workspace/route
 * status payloads.
 */
function describeNangoAdapter() {
  return {
    id: "nango",
    label: "Nango (auth/proxy authority)",
    scope: "api-registry-row",
    hasSecretKey: Boolean(safeString(process.env.NANGO_SECRET_KEY).trim()),
    host: safeString(process.env.NANGO_HOST).trim() || DEFAULT_NANGO_HOST,
  };
}

function buildNangoHeaders(secretKey, extras) {
  return {
    accept: "application/json",
    authorization: `Bearer ${secretKey}`,
    ...(extras || {}),
  };
}

/**
 * Strip credential-shaped fields from a connection payload. Never returns
 * `credentials`, `access_token`, `refresh_token`, or any header containing
 * secrets back to a route handler.
 */
function pickSafeConnectionFields(payload) {
  if (!payload || typeof payload !== "object") return {};
  const out = {};
  for (const key of SAFE_CONNECTION_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      out[key] = payload[key];
    }
  }
  return out;
}

/**
 * Replace any secret-shaped substrings in an error message. Defensive — we
 * already pass NANGO_SECRET_KEY in headers (never the URL) but a server-side
 * proxy error could include the auth header echo.
 */
function redactNangoError(error) {
  const message = safeString(error?.message || error || "").trim() || "nango request failed";
  let redacted = message;
  const secret = safeString(process.env.NANGO_SECRET_KEY).trim();
  if (secret) {
    redacted = redacted.split(secret).join("[redacted]");
  }
  for (const pattern of [
    /(Bearer\s+)[^\s"']+/gi,
    /(authorization["']?\s*[:=]\s*["']?Bearer\s+)[^\s"',}]+/gi,
    /(access_token["']?\s*[:=]\s*)["']?[^\s"',}]+/gi,
    /(refresh_token["']?\s*[:=]\s*)["']?[^\s"',}]+/gi,
  ]) {
    redacted = redacted.replace(pattern, "$1[redacted]");
  }
  return redacted;
}

async function nangoFetch(path, init, timeoutMs) {
  const { secretKey, host } = getNangoServerConfig();
  const url = new URL(path.startsWith("/") ? path : `/${path}`, host).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), clampTimeoutMs(timeoutMs));
  try {
    const response = await fetch(url, {
      ...(init || {}),
      headers: buildNangoHeaders(secretKey, init?.headers),
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function sanitizeConnectSessionInput(input) {
  const providerConfigKey = safeString(input?.providerConfigKey).trim();
  if (!providerConfigKey) {
    const error = new Error("providerConfigKey is required");
    error.code = "NANGO_PROVIDER_CONFIG_KEY_MISSING";
    throw error;
  }
  const out = { allowed_integrations: [providerConfigKey] };
  const endUser = {};
  const endUserId = safeString(input?.endUserId || input?.connectionId).trim();
  if (endUserId) endUser.id = endUserId;
  const endUserEmail = safeString(input?.endUserEmail).trim();
  if (endUserEmail) endUser.email = endUserEmail;
  const endUserDisplayName = safeString(input?.endUserDisplayName).trim();
  if (endUserDisplayName) endUser.display_name = endUserDisplayName;
  if (Object.keys(endUser).length) out.end_user = endUser;
  if (input?.tags && typeof input.tags === "object" && !Array.isArray(input.tags)) {
    const safeTags = {};
    for (const [k, v] of Object.entries(input.tags)) {
      if (typeof k !== "string") continue;
      const key = k.trim();
      if (!key) continue;
      const value = safeString(v).trim();
      if (!value) continue;
      safeTags[key] = value;
    }
    if (Object.keys(safeTags).length) out.tags = safeTags;
  }
  if (Array.isArray(input?.allowedIntegrations) && input.allowedIntegrations.length) {
    const list = input.allowedIntegrations
      .map((entry) => safeString(entry).trim())
      .filter(Boolean);
    if (list.length) out.allowed_integrations = list;
  }
  return out;
}

/**
 * Create a Nango Connect session. Returns `{ token, connect_link, expires_at }`
 * — never the secret. The session token is short-lived and only useful for
 * the user to complete the handshake in their browser.
 */
async function createNangoConnectSession(input) {
  const body = sanitizeConnectSessionInput(input);
  const response = await nangoFetch("/connect/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }, input?.timeoutMs);
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
    const error = new Error(redactNangoError(message));
    error.code = "NANGO_CONNECT_SESSION_FAILED";
    error.status = response.status;
    throw error;
  }
  const data = payload?.data || payload || {};
  return {
    token: safeString(data.token).trim(),
    connect_link: safeString(data.connect_link || data.connectLink).trim(),
    expires_at: safeString(data.expires_at || data.expiresAt).trim(),
  };
}

/**
 * Fetch a safe summary of a Nango connection. The response strips
 * `credentials` and any other secret-shaped fields before returning.
 */
async function getNangoConnectionSummary(input) {
  const providerConfigKey = safeString(input?.providerConfigKey).trim();
  const connectionId = safeString(input?.connectionId).trim();
  if (!providerConfigKey) {
    const error = new Error("providerConfigKey is required");
    error.code = "NANGO_PROVIDER_CONFIG_KEY_MISSING";
    throw error;
  }
  if (!connectionId) {
    const error = new Error("connectionId is required");
    error.code = "NANGO_CONNECTION_ID_MISSING";
    throw error;
  }
  const search = new URLSearchParams({
    provider_config_key: providerConfigKey,
    refresh_token: "false",
    force_refresh: "false",
  });
  const response = await nangoFetch(
    `/connection/${encodeURIComponent(connectionId)}?${search.toString()}`,
    { method: "GET" },
    input?.timeoutMs,
  );
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
    const error = new Error(redactNangoError(message));
    error.code = "NANGO_CONNECTION_SUMMARY_FAILED";
    error.status = response.status;
    throw error;
  }
  return {
    status: response.status === 200 ? "connected" : "unknown",
    ...pickSafeConnectionFields(payload || {}),
  };
}

function buildProxyEndpoint(registryRecord, inputPayload, substituteVariables) {
  const baseUrl = safeString(registryRecord?.baseUrl).trim();
  let endpoint = safeString(registryRecord?.endpoint).trim();
  if (typeof substituteVariables === "function") {
    endpoint = substituteVariables(endpoint, inputPayload);
  }
  if (!endpoint && !baseUrl) {
    throw new Error("baseUrl or endpoint is required for Nango proxy request");
  }
  // Nango proxy accepts either an absolute URL or a relative endpoint scoped
  // to the provider's base URL configured in the integration. We pass the
  // endpoint as-is when relative; Nango resolves it against the integration's
  // base. When the registry row encodes a custom baseUrl we pass the full URL.
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  if (baseUrl) return `${baseUrl.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
  return endpoint;
}

/**
 * Execute an authenticated provider request through Nango's Proxy.
 *
 * @param {object} registryRecord  merged API Registry row + node config
 * @param {object} inputPayload    run input payload (used for endpoint substitution)
 * @param {object} options         { timeoutMs, substituteVariables, body }
 * @returns {object} result shape matching executeApiRegistryCall
 */
async function executeNangoProxyRequest(registryRecord, inputPayload, options) {
  const providerConfigKey = safeString(registryRecord?.nangoProviderConfigKey).trim();
  const connectionId = safeString(registryRecord?.nangoConnectionId).trim();
  const method = normalizeMethod(registryRecord?.method);
  const timeoutMs = clampTimeoutMs(options?.timeoutMs);
  const startedAt = Date.now();
  const adapterMetaBase = {
    authAuthority: "nango",
    nangoProviderConfigKey: providerConfigKey,
    nangoConnectionId: connectionId ? "[set]" : "",
    method,
  };

  if (!providerConfigKey || !connectionId) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: Date.now() - startedAt,
      stdout: "",
      stderr: "",
      error: "Nango row missing providerConfigKey or connectionId",
      adapterMeta: { ...adapterMetaBase, mode: "nango-proxy", nangoStatus: "missing" },
    };
  }

  let endpoint;
  try {
    endpoint = buildProxyEndpoint(registryRecord, inputPayload, options?.substituteVariables);
  } catch (err) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: Date.now() - startedAt,
      stdout: "",
      stderr: "",
      error: redactNangoError(err),
      adapterMeta: { ...adapterMetaBase, mode: "nango-proxy" },
    };
  }

  let config;
  try {
    config = getNangoServerConfig();
  } catch (err) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: Date.now() - startedAt,
      stdout: "",
      stderr: "",
      error: "NANGO_SECRET_KEY is not configured on this server",
      adapterMeta: { ...adapterMetaBase, mode: "nango-proxy", nangoStatus: "error" },
    };
  }

  const proxyUrl = new URL("/proxy/" + endpoint.replace(/^\/+/, ""), config.host).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    accept: "application/json, text/plain;q=0.9,*/*;q=0.8",
    authorization: `Bearer ${config.secretKey}`,
    "provider-config-key": providerConfigKey,
    "connection-id": connectionId,
  };
  const bodyValue = options?.body;
  let bodyInit;
  if (method !== "GET" && bodyValue !== undefined && bodyValue !== null && bodyValue !== "") {
    if (typeof bodyValue === "string") {
      bodyInit = bodyValue;
      if (!headers["content-type"]) headers["content-type"] = "application/json";
    } else {
      bodyInit = JSON.stringify(bodyValue);
      headers["content-type"] = "application/json";
    }
  }

  try {
    const response = await fetch(proxyUrl, {
      method,
      headers,
      ...(bodyInit !== undefined ? { body: bodyInit } : {}),
      signal: controller.signal,
    });
    const durationMs = Date.now() - startedAt;
    const responseContentType = response.headers.get("content-type") || "";
    const payload = responseContentType.includes("application/json")
      ? await response.json()
      : await response.text();
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
        ...adapterMetaBase,
        mode: "nango-proxy",
        httpStatus: response.status,
        nangoStatus: response.ok ? "connected" : "error",
      },
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const safeError = redactNangoError(
      error?.name === "AbortError" ? `request timed out after ${timeoutMs}ms` : error?.message || "nango proxy failed",
    );
    return {
      ok: false,
      exitCode: null,
      durationMs,
      stdout: "",
      stderr: "",
      error: safeError,
      adapterMeta: {
        ...adapterMetaBase,
        mode: "nango-proxy",
        aborted: error?.name === "AbortError",
        nangoStatus: "error",
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

export {
  DEFAULT_NANGO_HOST,
  SAFE_CONNECTION_FIELDS,
  createNangoConnectSession,
  describeNangoAdapter,
  executeNangoProxyRequest,
  getNangoConnectionSummary,
  getNangoServerConfig,
  pickSafeConnectionFields,
  redactNangoError,
};
