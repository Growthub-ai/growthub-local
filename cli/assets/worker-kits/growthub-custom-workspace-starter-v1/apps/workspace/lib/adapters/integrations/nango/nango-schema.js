/**
 * Nango adapter — input validation.
 *
 * Pure server-side input validation for the Nango API routes. Mirrors the
 * `api-registry` row contract owned by `lib/workspace-schema.js`. No
 * @nangohq/node import here — this module only validates shapes.
 *
 * Authority contract: every value passed to a Nango SDK call must flow
 * through these validators first. Credentials never appear in inputs; the
 * server resolves the Nango secret key from env (`NANGO_SECRET_KEY`).
 */

import {
  KNOWN_NANGO_MODES,
  NANGO_PROVIDER_CONFIG_KEY_MAX,
  NANGO_PROVIDER_CONFIG_KEY_PATTERN
} from "../../../workspace-schema.js";

const KNOWN_HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function makeInvalidInputError(message, details) {
  const error = new Error(message);
  error.code = "NANGO_INVALID_INPUT";
  if (Array.isArray(details) && details.length) {
    error.details = details;
  }
  return error;
}

function validateProviderConfigKey(value, fieldPath = "providerConfigKey") {
  const errors = [];
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${fieldPath} must be a non-empty string`);
  } else if (
    value.length > NANGO_PROVIDER_CONFIG_KEY_MAX
    || !NANGO_PROVIDER_CONFIG_KEY_PATTERN.test(value)
  ) {
    errors.push(`${fieldPath} must be alphanumeric (with _.- separators), starting alphanumeric, and <= ${NANGO_PROVIDER_CONFIG_KEY_MAX} chars`);
  }
  return errors;
}

function validateConnectionId(value, fieldPath = "connectionId") {
  const errors = [];
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${fieldPath} must be a non-empty string`);
  } else if (value.length > 256) {
    errors.push(`${fieldPath} must be <= 256 chars`);
  }
  return errors;
}

function validateNangoMode(value, fieldPath = "mode") {
  if (value === undefined || value === null || value === "") return [];
  if (!KNOWN_NANGO_MODES.includes(value)) {
    return [`${fieldPath} must be one of ${KNOWN_NANGO_MODES.join(", ")}`];
  }
  return [];
}

function validateHostUrl(value, fieldPath = "hostUrl") {
  if (value === undefined || value === null || value === "") return [];
  if (typeof value !== "string") {
    return [`${fieldPath} must be a string when present`];
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    return [`${fieldPath} must be a valid URL`];
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return [`${fieldPath} must use http:// or https://`];
  }
  return [];
}

/**
 * Proxy request shape used by POST /api/workspace/integrations/nango/proxy.
 * Mirrors the upstream `@nangohq/node` proxy contract (method, endpoint,
 * optional headers/params/data) while keeping credentials out of band.
 */
function validateProxyRequest(input) {
  if (!isPlainObject(input)) {
    throw makeInvalidInputError("proxy request body must be a plain object");
  }
  const errors = [];
  errors.push(...validateProviderConfigKey(input.providerConfigKey));
  errors.push(...validateConnectionId(input.connectionId));

  const method = String(input.method || "GET").toUpperCase();
  if (!KNOWN_HTTP_METHODS.includes(method)) {
    errors.push(`method must be one of ${KNOWN_HTTP_METHODS.join(", ")}`);
  }
  if (typeof input.endpoint !== "string" || !input.endpoint.trim()) {
    errors.push("endpoint must be a non-empty string (path or absolute URL)");
  } else if (input.endpoint.length > 2048) {
    errors.push("endpoint must be <= 2048 chars");
  }
  if (input.headers !== undefined && !isPlainObject(input.headers)) {
    errors.push("headers must be a plain object when present");
  }
  if (input.params !== undefined && !isPlainObject(input.params)) {
    errors.push("params must be a plain object when present");
  }
  if (input.retries !== undefined) {
    const r = Number(input.retries);
    if (!Number.isFinite(r) || r < 0 || r > 10) {
      errors.push("retries must be a finite number between 0 and 10");
    }
  }
  if (input.timeoutMs !== undefined) {
    const ms = Number(input.timeoutMs);
    if (!Number.isFinite(ms) || ms < 0 || ms > 60000) {
      errors.push("timeoutMs must be between 0 and 60000");
    }
  }
  // Reject any header that looks like an auth-credential carrier. The Nango
  // SDK injects credentials server-side from the connection — callers MUST
  // NOT forward Authorization headers from the browser.
  if (isPlainObject(input.headers)) {
    const forbiddenHeaders = ["authorization", "x-api-key", "x-auth-token", "cookie"];
    for (const key of Object.keys(input.headers)) {
      if (forbiddenHeaders.includes(key.toLowerCase())) {
        errors.push(`headers.${key} is not allowed — Nango injects credentials from the connection`);
      }
    }
  }

  if (errors.length) {
    throw makeInvalidInputError("invalid proxy request", errors);
  }

  return {
    providerConfigKey: input.providerConfigKey.trim(),
    connectionId: input.connectionId.trim(),
    method,
    endpoint: input.endpoint.trim(),
    headers: isPlainObject(input.headers) ? { ...input.headers } : undefined,
    params: isPlainObject(input.params) ? { ...input.params } : undefined,
    data: input.data,
    retries: input.retries !== undefined ? Number(input.retries) : undefined,
    timeoutMs: input.timeoutMs !== undefined ? Number(input.timeoutMs) : undefined
  };
}

function validateActionsListInput(input) {
  if (input === null || input === undefined) {
    return { providerConfigKey: undefined };
  }
  if (!isPlainObject(input)) {
    throw makeInvalidInputError("actions list input must be a plain object");
  }
  if (input.providerConfigKey === undefined || input.providerConfigKey === null || input.providerConfigKey === "") {
    return { providerConfigKey: undefined };
  }
  const errors = validateProviderConfigKey(input.providerConfigKey);
  if (errors.length) throw makeInvalidInputError("invalid actions list input", errors);
  return { providerConfigKey: input.providerConfigKey.trim() };
}

function validateActionExecuteRequest(input) {
  if (!isPlainObject(input)) {
    throw makeInvalidInputError("action execute body must be a plain object");
  }
  const errors = [];
  errors.push(...validateProviderConfigKey(input.providerConfigKey));
  errors.push(...validateConnectionId(input.connectionId));
  if (typeof input.action !== "string" || !input.action.trim()) {
    errors.push("action must be a non-empty string");
  } else if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(input.action) || input.action.length > 128) {
    errors.push("action must be alphanumeric (with _.- separators), <= 128 chars");
  }
  if (input.input !== undefined && !isPlainObject(input.input) && !Array.isArray(input.input)) {
    errors.push("input must be a plain object or array when present");
  }
  if (errors.length) throw makeInvalidInputError("invalid action execute request", errors);
  return {
    providerConfigKey: input.providerConfigKey.trim(),
    connectionId: input.connectionId.trim(),
    action: input.action.trim(),
    input: input.input
  };
}

function validateConnectSessionRequest(input) {
  if (!isPlainObject(input)) {
    throw makeInvalidInputError("connect session body must be a plain object");
  }
  const errors = [];
  errors.push(...validateProviderConfigKey(input.providerConfigKey));
  if (input.connectionId !== undefined && input.connectionId !== null && input.connectionId !== "") {
    errors.push(...validateConnectionId(input.connectionId));
  }
  if (input.endUser !== undefined && input.endUser !== null) {
    if (!isPlainObject(input.endUser)) {
      errors.push("endUser must be a plain object when present");
    } else {
      if (input.endUser.id !== undefined && typeof input.endUser.id !== "string") {
        errors.push("endUser.id must be a string when present");
      }
      if (input.endUser.email !== undefined && typeof input.endUser.email !== "string") {
        errors.push("endUser.email must be a string when present");
      }
    }
  }
  if (errors.length) throw makeInvalidInputError("invalid connect session request", errors);
  return {
    providerConfigKey: input.providerConfigKey.trim(),
    connectionId: input.connectionId ? input.connectionId.trim() : undefined,
    endUser: isPlainObject(input.endUser) ? { ...input.endUser } : undefined
  };
}

function validateConnectionSummaryRequest(input) {
  if (!isPlainObject(input)) {
    throw makeInvalidInputError("connection status body must be a plain object");
  }
  const errors = [];
  errors.push(...validateProviderConfigKey(input.providerConfigKey));
  errors.push(...validateConnectionId(input.connectionId));
  if (errors.length) throw makeInvalidInputError("invalid connection status request", errors);
  return {
    providerConfigKey: input.providerConfigKey.trim(),
    connectionId: input.connectionId.trim()
  };
}

function validateConnectionStatusRequest(input) {
  if (input === null || input === undefined) return {};
  if (!isPlainObject(input)) {
    throw makeInvalidInputError("status request must be a plain object");
  }
  const errors = [];
  if (input.providerConfigKey !== undefined) {
    errors.push(...validateProviderConfigKey(input.providerConfigKey));
  }
  if (input.connectionId !== undefined) {
    errors.push(...validateConnectionId(input.connectionId));
  }
  if (input.mode !== undefined) {
    errors.push(...validateNangoMode(input.mode));
  }
  if (input.hostUrl !== undefined) {
    errors.push(...validateHostUrl(input.hostUrl));
  }
  if (errors.length) throw makeInvalidInputError("invalid status request", errors);
  return {
    providerConfigKey: input.providerConfigKey ? input.providerConfigKey.trim() : undefined,
    connectionId: input.connectionId ? input.connectionId.trim() : undefined,
    mode: input.mode || undefined,
    hostUrl: input.hostUrl ? input.hostUrl.trim() : undefined
  };
}

export {
  KNOWN_HTTP_METHODS,
  validateActionExecuteRequest,
  validateActionsListInput,
  validateConnectSessionRequest,
  validateConnectionId,
  validateConnectionStatusRequest,
  validateConnectionSummaryRequest,
  validateHostUrl,
  validateNangoMode,
  validateProviderConfigKey,
  validateProxyRequest
};
