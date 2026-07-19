/**
 * W3C trace-context + OTLP/HTTP JSON export for custom-model inference.
 *
 * This module deliberately does not create an observability database. The
 * governed invocation receipt stores correlation identifiers; operational
 * spans go to the operator's configured OTLP collector. Training and
 * distillation traces remain governed corpus evidence, not telemetry.
 */

import { randomBytes } from "node:crypto";

const TRACEPARENT_RE = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;
const ZERO_TRACE_ID = "0".repeat(32);
const ZERO_SPAN_ID = "0".repeat(16);

function nonZeroHex(bytes, zero) {
  let value = bytes.toString("hex");
  if (value === zero) value = `${value.slice(0, -1)}1`;
  return value;
}

export function parseTraceparent(value) {
  const match = String(value || "").trim().match(TRACEPARENT_RE);
  if (!match || match[1] === ZERO_TRACE_ID || match[2] === ZERO_SPAN_ID) return null;
  return {
    version: "00",
    traceId: match[1].toLowerCase(),
    spanId: match[2].toLowerCase(),
    traceFlags: match[3].toLowerCase(),
  };
}

export function normalizeTracestate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length > 512 || /[\0\r\n]/.test(text)) return "";
  const members = text.split(",").map((member) => member.trim());
  if (members.length > 32 || members.some((member) => {
    const at = member.indexOf("=");
    if (at <= 0) return true;
    const key = member.slice(0, at);
    const item = member.slice(at + 1);
    return !/^[a-z0-9][a-z0-9_\-*\/@]{0,255}$/.test(key)
      || !item
      || item.length > 256
      || item.trim() !== item
      || /[,=]/.test(item)
      || !/^[\x20-\x7e]+$/.test(item);
  })) return "";
  return members.join(",");
}

export function createTraceContext(incomingTraceparent = "", { randomBytesImpl = randomBytes, tracestate = "" } = {}) {
  const incoming = parseTraceparent(incomingTraceparent);
  const traceId = incoming?.traceId || nonZeroHex(randomBytesImpl(16), ZERO_TRACE_ID);
  const spanId = nonZeroHex(randomBytesImpl(8), ZERO_SPAN_ID);
  const traceFlags = incoming?.traceFlags || "01";
  const normalizedTracestate = normalizeTracestate(tracestate);
  return {
    traceId,
    spanId,
    parentSpanId: incoming?.spanId || "",
    traceFlags,
    traceparent: `00-${traceId}-${spanId}-${traceFlags}`,
    ...(normalizedTracestate ? { tracestate: normalizedTracestate } : {}),
  };
}

export function createChildTraceContext(parent, { randomBytesImpl = randomBytes } = {}) {
  const traceId = String(parent?.traceId || "");
  if (!/^[0-9a-f]{32}$/.test(traceId) || traceId === ZERO_TRACE_ID) {
    throw new Error("a valid parent trace context is required");
  }
  const spanId = nonZeroHex(randomBytesImpl(8), ZERO_SPAN_ID);
  const traceFlags = /^[0-9a-f]{2}$/.test(String(parent?.traceFlags || "")) ? parent.traceFlags : "01";
  return {
    traceId,
    spanId,
    parentSpanId: String(parent?.spanId || ""),
    traceFlags,
    traceparent: `00-${traceId}-${spanId}-${traceFlags}`,
    ...(parent?.tracestate ? { tracestate: parent.tracestate } : {}),
  };
}

function unixNano(nowMs) {
  return String(BigInt(Math.max(0, Math.floor(Number(nowMs) || Date.now()))) * 1_000_000n);
}

function attributeValue(value) {
  if (typeof value === "boolean") return { boolValue: value };
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(attributeValue) } };
  if (value && typeof value === "object") return { stringValue: JSON.stringify(value) };
  return { stringValue: String(value ?? "") };
}

function otlpAttributes(attributes) {
  return Object.entries(attributes || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => ({ key, value: attributeValue(value) }));
}

export function buildOtlpSpan({
  context,
  name,
  kind = 1,
  startedAtMs,
  endedAtMs,
  attributes = {},
  ok = true,
  error = "",
} = {}) {
  if (!context?.traceId || !context?.spanId) throw new Error("span context is required");
  return {
    traceId: context.traceId,
    spanId: context.spanId,
    ...(context.parentSpanId ? { parentSpanId: context.parentSpanId } : {}),
    ...(context.tracestate ? { traceState: context.tracestate } : {}),
    name: String(name || "growthub.inference"),
    kind: Number(kind) || 1,
    startTimeUnixNano: unixNano(startedAtMs),
    endTimeUnixNano: unixNano(Math.max(Number(startedAtMs) || 0, Number(endedAtMs) || Date.now())),
    attributes: otlpAttributes(attributes),
    status: ok ? { code: 1 } : { code: 2, message: String(error || "inference stage failed").slice(0, 512) },
  };
}

function tracesEndpoint(env) {
  const explicit = String(env?.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || "").trim();
  if (explicit) return explicit;
  const base = String(env?.OTEL_EXPORTER_OTLP_ENDPOINT || "").trim().replace(/\/+$/, "");
  return base ? `${base}/v1/traces` : "";
}

function parseHeaders(value) {
  const headers = {};
  for (const pair of String(value || "").split(",")) {
    const at = pair.indexOf("=");
    if (at <= 0) continue;
    const key = decodeURIComponent(pair.slice(0, at).trim());
    const headerValue = decodeURIComponent(pair.slice(at + 1).trim());
    if (key && headerValue) headers[key] = headerValue;
  }
  return headers;
}

export function buildOtlpPayload(spans, { serviceName = "growthub-workspace-inference", serviceVersion = "" } = {}) {
  return {
    resourceSpans: [{
      resource: {
        attributes: otlpAttributes({
          "service.name": String(serviceName || "growthub-workspace-inference"),
          "service.version": String(serviceVersion || ""),
        }),
      },
      scopeSpans: [{
        scope: { name: "growthub.inference-control-plane", version: "1" },
        spans: (Array.isArray(spans) ? spans : []).filter(Boolean),
      }],
    }],
  };
}

/** Export completed spans through standard OTLP/HTTP JSON. Never throws. */
export async function exportOtlpSpans(spans, {
  fetchImpl,
  env = process.env,
  serviceName,
  serviceVersion,
  timeoutMs = 5000,
} = {}) {
  const endpoint = tracesEndpoint(env);
  if (!endpoint) return { status: "disabled", endpointConfigured: false };
  const f = fetchImpl || globalThis.fetch;
  if (typeof f !== "function") return { status: "failed", endpointConfigured: true, error: "fetch unavailable" };
  try {
    const headers = {
      "content-type": "application/json",
      ...parseHeaders(env?.OTEL_EXPORTER_OTLP_HEADERS),
    };
    const response = await f(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(buildOtlpPayload(spans, { serviceName, serviceVersion })),
      signal: AbortSignal.timeout(Math.max(250, Number(timeoutMs) || 5000)),
    });
    return response.ok
      ? { status: "exported", endpointConfigured: true, httpStatus: response.status }
      : { status: "failed", endpointConfigured: true, httpStatus: response.status, error: `OTLP HTTP ${response.status}` };
  } catch (error) {
    return { status: "failed", endpointConfigured: true, error: String(error?.message || "OTLP export failed").slice(0, 256) };
  }
}
