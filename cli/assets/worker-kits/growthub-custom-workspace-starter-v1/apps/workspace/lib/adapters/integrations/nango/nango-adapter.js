/**
 * Nango thin adapter — server-side only.
 *
 * Wraps `@nangohq/node` and exposes four operations consumed by the workspace:
 *   - getStatus()         connection health (secret + reachability check)
 *   - proxyRequest()      proxy an API call through Nango
 *   - listActions()       enumerate enabled action functions for a provider
 *   - executeAction()     execute a Nango action function
 *
 * The adapter operates on the EXISTING `objectType: "api-registry"` row
 * shape owned by `lib/workspace-data-model.js`. Nango-backed rows declare
 * `connectorKind: "nango"`. Their `integrationId` is the resolver key, and
 * (when no `providerConfigKey` is set explicitly) the Nango providerConfigKey
 * defaults to that same `integrationId`. The `authRef` column names the env
 * var that holds the Nango secret (defaults to `NANGO_SECRET_KEY`).
 *
 * Authority invariants (do not violate):
 *   1. Nango secret key is resolved from env on every call. It is NEVER
 *      read from request bodies, config files, or browser state.
 *   2. The Nango SDK is loaded via dynamic import. When the package is not
 *      installed, `getStatus()` reports `status: "disconnected"` with a
 *      diagnostic reason so the rest of the workspace keeps building.
 *   3. Every public method takes already-validated input from `nango-schema`.
 *      This module does not re-validate; it dispatches.
 */

import { readAdapterConfig } from "../../env.js";

const DEFAULT_NANGO_SECRET_ENV = "NANGO_SECRET_KEY";

let cachedNangoModule = null;
let nangoModuleLoadError = null;

async function loadNangoModule() {
  if (cachedNangoModule) return cachedNangoModule;
  if (nangoModuleLoadError) return null;
  try {
    // eslint-disable-next-line import/no-unresolved
    const mod = await import("@nangohq/node");
    cachedNangoModule = mod;
    return mod;
  } catch (error) {
    nangoModuleLoadError = error;
    return null;
  }
}

/**
 * Resolve a Nango env profile. `override` lets callers (e.g. a per-row
 * api-registry record) pin a different mode / host / environment without
 * mutating process.env.
 */
function resolveNangoEnv(override = {}) {
  const env = readAdapterConfig().nango || {};
  const secretEnvName = String(override.secretEnvName || DEFAULT_NANGO_SECRET_ENV).trim() || DEFAULT_NANGO_SECRET_ENV;
  const secretKey = process.env[secretEnvName] || null;
  const mode = override.mode || env.mode || "cloud";
  const hostUrl = override.hostUrl || env.hostUrl || null;
  const environment = override.environment || env.environment || "dev";
  return {
    mode,
    hostUrl,
    environment,
    secretEnvName,
    hasSecretKey: Boolean(secretKey),
    // Internal-only; never returned to callers.
    _secretKey: secretKey
  };
}

function buildClientOptions(env) {
  const opts = { secretKey: env._secretKey };
  if (env.mode === "self-hosted" && env.hostUrl) {
    opts.host = env.hostUrl;
  }
  return opts;
}

async function getNangoClient(envOverride) {
  const env = resolveNangoEnv(envOverride);
  if (!env.hasSecretKey) {
    return { client: null, env, reason: "missing-secret" };
  }
  const mod = await loadNangoModule();
  if (!mod) {
    return { client: null, env, reason: "sdk-not-installed" };
  }
  const Ctor = mod.Nango || mod.default;
  if (typeof Ctor !== "function") {
    return { client: null, env, reason: "sdk-shape-unrecognized" };
  }
  const client = new Ctor(buildClientOptions(env));
  return { client, env, reason: null };
}

function stripSecrets(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stripSecrets);
  const REDACTED_KEYS = [
    "secret",
    "secretKey",
    "secret_key",
    "apiKey",
    "api_key",
    "access_token",
    "accessToken",
    "refresh_token",
    "refreshToken",
    "client_secret",
    "clientSecret"
  ];
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (REDACTED_KEYS.includes(key)) continue;
    out[key] = stripSecrets(raw);
  }
  return out;
}

/**
 * Project a row from an `objectType: "api-registry"` object into the
 * Nango-specific binding shape used by this adapter. Returns null when the
 * row is not Nango-backed (so callers can early-out without throwing).
 */
function projectNangoBinding(row) {
  if (!row || typeof row !== "object") return null;
  if (row.connectorKind !== "nango") return null;
  const integrationId = String(row.integrationId || "").trim();
  const providerConfigKey = String(row.providerConfigKey || integrationId || "").trim();
  if (!providerConfigKey) return null;
  const connectionIds = Array.isArray(row.connectionIds)
    ? row.connectionIds.filter((c) => typeof c === "string" && c.trim()).map((c) => c.trim())
    : typeof row.connectionIds === "string"
      ? row.connectionIds.split(",").map((c) => c.trim()).filter(Boolean)
      : [];
  const enabledActions = Array.isArray(row.enabledActions)
    ? row.enabledActions.filter((a) => typeof a === "string" && a.trim()).map((a) => a.trim())
    : typeof row.enabledActions === "string"
      ? row.enabledActions.split(",").map((a) => a.trim()).filter(Boolean)
      : [];
  return {
    integrationId,
    providerConfigKey,
    connectionIds,
    enabledActions,
    endpoint: typeof row.endpoint === "string" ? row.endpoint.trim() : "",
    method: typeof row.method === "string" && row.method.trim() ? row.method.trim().toUpperCase() : "GET",
    secretEnvName: typeof row.authRef === "string" && row.authRef.trim() ? row.authRef.trim() : DEFAULT_NANGO_SECRET_ENV,
    mode: row.nangoMode || undefined,
    hostUrl: row.nangoHostUrl || undefined,
    environment: row.nangoEnvironment || undefined
  };
}

/**
 * Describe the Nango configuration state. Used by GET /status. Never throws:
 * returns one of `connected | disconnected | unconfigured` so the no-code UI
 * can render a status badge without try/catch.
 */
async function getStatus(input = {}) {
  const env = resolveNangoEnv(input);
  if (!env.hasSecretKey) {
    return {
      status: "unconfigured",
      mode: env.mode,
      environment: env.environment,
      hostUrl: env.hostUrl,
      secretEnvName: env.secretEnvName,
      reason: `Set ${env.secretEnvName} in this runtime's environment to enable Nango.`,
      sdkAvailable: cachedNangoModule != null
    };
  }
  const { client, reason } = await getNangoClient(input);
  if (!client) {
    return {
      status: "disconnected",
      mode: env.mode,
      environment: env.environment,
      hostUrl: env.hostUrl,
      secretEnvName: env.secretEnvName,
      reason: reason === "sdk-not-installed"
        ? "Install `@nangohq/node` in apps/workspace to enable Nango operations."
        : `Nango client unavailable: ${reason}`,
      sdkAvailable: false
    };
  }
  let connectionCount = null;
  let providerCount = null;
  try {
    if (input.providerConfigKey && input.connectionId && typeof client.getConnection === "function") {
      const conn = await client.getConnection(input.providerConfigKey, input.connectionId);
      return {
        status: "connected",
        mode: env.mode,
        environment: env.environment,
        hostUrl: env.hostUrl,
        secretEnvName: env.secretEnvName,
        sdkAvailable: true,
        probedProvider: input.providerConfigKey,
        probedConnection: input.connectionId,
        connection: stripSecrets(conn)
      };
    }
    if (typeof client.listConnections === "function") {
      const list = await client.listConnections();
      if (Array.isArray(list?.connections)) connectionCount = list.connections.length;
      else if (Array.isArray(list)) connectionCount = list.length;
    }
    if (typeof client.listIntegrations === "function") {
      const list = await client.listIntegrations();
      if (Array.isArray(list?.configs)) providerCount = list.configs.length;
      else if (Array.isArray(list)) providerCount = list.length;
    }
  } catch (error) {
    return {
      status: "disconnected",
      mode: env.mode,
      environment: env.environment,
      hostUrl: env.hostUrl,
      secretEnvName: env.secretEnvName,
      sdkAvailable: true,
      reason: error?.message || "nango reachability probe failed"
    };
  }
  return {
    status: "connected",
    mode: env.mode,
    environment: env.environment,
    hostUrl: env.hostUrl,
    secretEnvName: env.secretEnvName,
    sdkAvailable: true,
    connectionCount,
    providerCount
  };
}

async function proxyRequest(request) {
  const envOverride = request.secretEnvName ? { secretEnvName: request.secretEnvName } : undefined;
  const { client, env, reason } = await getNangoClient(envOverride);
  if (!client) {
    const error = new Error(reason === "missing-secret"
      ? `Nango secret is missing (set ${env.secretEnvName})`
      : reason === "sdk-not-installed"
        ? "Nango SDK (@nangohq/node) is not installed in apps/workspace"
        : `Nango client unavailable: ${reason}`);
    error.code = reason === "missing-secret" ? "NANGO_NOT_CONFIGURED" : "NANGO_SDK_UNAVAILABLE";
    throw error;
  }
  if (typeof client.proxy !== "function") {
    const error = new Error("@nangohq/node does not expose a proxy method in this version");
    error.code = "NANGO_SDK_SHAPE";
    throw error;
  }
  const sdkRequest = {
    providerConfigKey: request.providerConfigKey,
    connectionId: request.connectionId,
    method: request.method,
    endpoint: request.endpoint,
    headers: request.headers,
    params: request.params,
    data: request.data,
    retries: request.retries,
    timeoutMs: request.timeoutMs
  };
  const result = await client.proxy(sdkRequest);
  const responseStatus = typeof result?.status === "number" ? result.status : null;
  const data = result?.data !== undefined ? result.data : result;
  return {
    status: responseStatus,
    data: stripSecrets(data),
    environment: env.environment
  };
}

async function listActions(input = {}) {
  const { client, reason } = await getNangoClient();
  if (!client) {
    const error = new Error(reason === "missing-secret"
      ? `Nango secret is missing (set ${DEFAULT_NANGO_SECRET_ENV})`
      : `Nango client unavailable: ${reason}`);
    error.code = reason === "missing-secret" ? "NANGO_NOT_CONFIGURED" : "NANGO_SDK_UNAVAILABLE";
    throw error;
  }
  let actions = [];
  let probedShape = null;
  for (const methodName of ["listActions", "getActions", "listScripts"]) {
    if (typeof client[methodName] === "function") {
      try {
        const raw = await client[methodName](input.providerConfigKey);
        probedShape = methodName;
        if (Array.isArray(raw)) {
          actions = raw;
        } else if (Array.isArray(raw?.actions)) {
          actions = raw.actions;
        } else if (Array.isArray(raw?.scripts)) {
          actions = raw.scripts;
        }
        break;
      } catch {
        // try next shape
      }
    }
  }
  return {
    providerConfigKey: input.providerConfigKey || null,
    probedShape,
    actions: actions.map(stripSecrets),
    hint: probedShape
      ? null
      : "This @nangohq/node version does not expose an actions listing method; declare actions in nango.yaml and call /action/execute by name."
  };
}

async function executeAction(request) {
  const envOverride = request.secretEnvName ? { secretEnvName: request.secretEnvName } : undefined;
  const { client, env, reason } = await getNangoClient(envOverride);
  if (!client) {
    const error = new Error(reason === "missing-secret"
      ? `Nango secret is missing (set ${env.secretEnvName})`
      : `Nango client unavailable: ${reason}`);
    error.code = reason === "missing-secret" ? "NANGO_NOT_CONFIGURED" : "NANGO_SDK_UNAVAILABLE";
    throw error;
  }
  if (typeof client.triggerAction !== "function") {
    const error = new Error("@nangohq/node does not expose triggerAction in this version");
    error.code = "NANGO_SDK_SHAPE";
    throw error;
  }
  const raw = await client.triggerAction(
    request.providerConfigKey,
    request.connectionId,
    request.action,
    request.input
  );
  return {
    action: request.action,
    providerConfigKey: request.providerConfigKey,
    connectionId: request.connectionId,
    environment: env.environment,
    result: stripSecrets(raw)
  };
}

function describeNangoAdapter() {
  const env = resolveNangoEnv();
  return {
    id: "nango",
    label: "Nango integration backbone",
    requiredEnv: [DEFAULT_NANGO_SECRET_ENV],
    authority: env.mode === "self-hosted" ? "nango-self-hosted" : "nango-cloud",
    mode: env.mode,
    environment: env.environment,
    hostUrl: env.hostUrl,
    hasSecretKey: env.hasSecretKey,
    secretEnvName: env.secretEnvName
  };
}

export {
  DEFAULT_NANGO_SECRET_ENV,
  describeNangoAdapter,
  executeAction,
  getStatus,
  listActions,
  projectNangoBinding,
  proxyRequest,
  resolveNangoEnv
};
