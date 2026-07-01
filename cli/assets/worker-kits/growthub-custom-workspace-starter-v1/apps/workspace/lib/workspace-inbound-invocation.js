/**
 * Workspace Inbound Invocation — provider-agnostic webhook / API-request input
 * methods for governed workflows.
 *
 * This is the EXACT mirror of `workspace-add-on-scheduler.js` for inbound
 * (push) invocation instead of provider-cron (pull) scheduling. A marketplace
 * product whose `executionLane` is `inbound-webhook` or `api-request` declares
 * a `connectorKind`; this module maps that kind to an InboundAdapter that knows
 * how to verify the inbound request the same way the QStash adapter verifies a
 * signed delivery:
 *
 *   1. verify the inbound proof (HMAC signature or bearer scheme) over the RAW
 *      body, bound to THIS destination URL (anti-replay), within a clock
 *      tolerance,
 *   2. never expose or persist a secret value — env-ref resolution only.
 *
 * The destination route (`/api/workspace/workflows/[providerId]`) stays
 * provider-agnostic and delegates the wire details here — the same triple
 * binding validation (payload id ↔ owning row ↔ published trigger node) applies
 * to every input method. A third input method is added by registering another
 * adapter — no route changes.
 *
 * Everything here is pure (only `node:crypto`) so signature verification and
 * binding-id determinism are testable offline with `node --test`.
 *
 * SECRET RULE: signing secrets / invoke tokens are inputs to verification
 * ONLY. Nothing returned by this module contains a secret value.
 */

import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { deriveScheduleId, SIGNATURE_CLOCK_TOLERANCE_S } from "./workspace-add-on-scheduler.js";

const INBOUND_WEBHOOK_LANE = "inbound-webhook";
const API_REQUEST_LANE = "api-request";
const INBOUND_INVOCATION_LANES = [INBOUND_WEBHOOK_LANE, API_REQUEST_LANE];

// Webhook senders are external systems with real clock drift; QStash's ±10s is
// for a first-party signer. 5 minutes is the industry envelope (Stripe/GitHub).
const WEBHOOK_TIMESTAMP_TOLERANCE_S = 300;

/**
 * The canonical trigger kinds a workflow row's trigger node may carry — the
 * scheduler value plus the two inbound input methods. `inputMode` is the
 * canvas-facing value on `input`-type trigger nodes; `triggerKind` is the
 * runtime binding value validated by the destination route.
 */
const BINDING_TRIGGER_KINDS = ["serverless-scheduler", INBOUND_WEBHOOK_LANE, API_REQUEST_LANE];

const TRIGGER_KIND_BY_LANE = {
  "serverless-scheduler": "serverless-scheduler",
  [INBOUND_WEBHOOK_LANE]: INBOUND_WEBHOOK_LANE,
  [API_REQUEST_LANE]: API_REQUEST_LANE,
};

const INPUT_MODE_BY_TRIGGER_KIND = {
  "serverless-scheduler": "serverless-schedule",
  [INBOUND_WEBHOOK_LANE]: "webhook",
  [API_REQUEST_LANE]: "api-request",
};

// Receipt vocabulary for the inbound lanes (mirrors workspace-scheduled-run /
// workspace-add-on-schedule).
const INVOKED_RUN_KIND = "workspace-invoked-run";
const BINDING_RECEIPT_KIND = "workspace-add-on-binding";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function triggerKindForLane(lane) {
  return TRIGGER_KIND_BY_LANE[clean(lane)] || "";
}

function inputModeForTriggerKind(kind) {
  return INPUT_MODE_BY_TRIGGER_KIND[clean(kind)] || "";
}

/** Deterministic binding id — the SAME derivation the scheduler uses, so one
 * row identity always maps to one id regardless of input method. */
function deriveBindingId(args) {
  return deriveScheduleId(args);
}

/** Normalize a URL the same way the QStash `sub`-claim comparison does. */
function normalizeUrlForCompare(value) {
  const raw = clean(value).replace(/\/+$/, "");
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch {
    return raw.toLowerCase();
  }
}

function sha256Hex(value) {
  return createHash("sha256").update(typeof value === "string" ? value : "", "utf8").digest("hex");
}

function timingSafeHexEqual(a, b) {
  const bufA = Buffer.from(clean(a), "utf8");
  const bufB = Buffer.from(clean(b), "utf8");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Compute the v1 inbound-webhook signature for a request. Exported so senders
 * (and tests) build the exact bytes the verifier checks:
 *
 *   signingInput = `${timestamp}.${normalizedDestinationUrl}.${sha256hex(rawBody)}`
 *   signature    = `v1=${hmacSHA256hex(secret, signingInput)}`
 *
 * Binding the destination URL into the signed input is the mirror of the
 * QStash `sub` claim (a signature minted for another endpoint never verifies
 * here); binding the body hash mirrors the QStash `body` claim.
 */
function signInboundWebhook({ secret, rawBody, destinationUrl, timestampS } = {}) {
  const ts = Number.isFinite(timestampS) ? Math.floor(timestampS) : Math.floor(Date.now() / 1000);
  const signingInput = `${ts}.${normalizeUrlForCompare(destinationUrl)}.${sha256Hex(typeof rawBody === "string" ? rawBody : "")}`;
  const digest = createHmac("sha256", clean(secret)).update(signingInput).digest("hex");
  return { timestamp: String(ts), signature: `v1=${digest}` };
}

/**
 * Verify a `x-growthub-signature` / `x-growthub-timestamp` signed webhook.
 * Mirrors the QStash verification checklist:
 *   - secret must resolve from env (never from the request),
 *   - scheme locked to `v1=` HMAC-SHA256 (reject anything else explicitly),
 *   - timestamp within tolerance (replay window),
 *   - signature covers timestamp + THIS destination URL + raw-body hash,
 *   - constant-time comparison.
 * Returns { ok, reason } — never a secret.
 */
function verifyInboundWebhookSignature({ signature, timestamp, rawBody, expectedUrl, secret, currentTimeS } = {}) {
  if (!clean(secret)) return { ok: false, reason: "no-signing-secret" };
  const token = clean(signature);
  if (!token) return { ok: false, reason: "missing-signature" };
  if (!token.startsWith("v1=")) return { ok: false, reason: "unsupported-scheme" };
  const ts = Number(clean(timestamp));
  if (!Number.isFinite(ts) || ts <= 0) return { ok: false, reason: "missing-timestamp" };
  const now = Number.isFinite(currentTimeS) ? currentTimeS : Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > WEBHOOK_TIMESTAMP_TOLERANCE_S) {
    return { ok: false, reason: now > ts ? "expired" : "not-yet-valid" };
  }
  const expected = signInboundWebhook({
    secret,
    rawBody: typeof rawBody === "string" ? rawBody : "",
    destinationUrl: expectedUrl,
    timestampS: ts,
  }).signature;
  if (!timingSafeHexEqual(expected, token)) return { ok: false, reason: "signature-mismatch" };
  return { ok: true, reason: "verified" };
}

/**
 * Verify an authenticated API-request invocation: `Authorization: Bearer <token>`
 * (or `x-growthub-api-key`) checked against the env-resolved invoke token.
 * Comparison is over SHA-256 digests so length never leaks and the secret is
 * never re-materialized. TLS + the workspace-scoped token bind the request;
 * the destination route still enforces the row/trigger binding on top.
 */
function verifyApiRequestAuth({ authorization, apiKeyHeader, expectedToken } = {}) {
  if (!clean(expectedToken)) return { ok: false, reason: "no-invoke-token" };
  let presented = "";
  const auth = clean(authorization);
  if (auth.toLowerCase().startsWith("bearer ")) presented = clean(auth.slice(7));
  if (!presented) presented = clean(apiKeyHeader);
  if (!presented) return { ok: false, reason: "missing-credentials" };
  if (!timingSafeHexEqual(sha256Hex(presented), sha256Hex(clean(expectedToken)))) {
    return { ok: false, reason: "credential-mismatch" };
  }
  return { ok: true, reason: "verified" };
}

/**
 * Pure triple-binding agreement check — payload id ↔ owning row ↔ published
 * trigger node, including the method's trigger kind. This is the SAME
 * checklist the validated QStash destination applies, extracted so the
 * destination route AND the uninstall core prove ownership with one function:
 * an uninstall for one input method must never clear a row bound to another
 * product/method (a scheduler row cleared locally would keep firing remotely —
 * a local lie over remote reality).
 * Returns { ok, code } where code names the first mismatch.
 */
function evaluateBindingMatch({ row, triggerBinding, provider, product, expectedTriggerKind, scheduleId } = {}) {
  const id = clean(scheduleId);
  if (!id) return { ok: false, code: "missing_binding_id" };
  if (clean(row?.runLocality) !== "serverless") return { ok: false, code: "row_not_serverless" };
  if (clean(row?.schedulerRegistryId) !== clean(product?.integrationId)) return { ok: false, code: "row_registry_mismatch" };
  if (clean(row?.scheduleId) !== id) return { ok: false, code: "row_binding_id_mismatch" };
  if (!triggerBinding || clean(triggerBinding.triggerKind) !== clean(expectedTriggerKind)) return { ok: false, code: "trigger_kind_mismatch" };
  if (triggerBinding.enabled !== true) return { ok: false, code: "trigger_disabled" };
  if (clean(triggerBinding.scheduleId) !== id) return { ok: false, code: "trigger_binding_id_mismatch" };
  if (clean(triggerBinding.schedulerRegistryId) !== clean(product?.integrationId)) return { ok: false, code: "trigger_registry_mismatch" };
  if (clean(triggerBinding.providerId) && clean(triggerBinding.providerId) !== clean(provider?.providerId)) return { ok: false, code: "trigger_provider_mismatch" };
  if (clean(triggerBinding.productId) && clean(triggerBinding.productId) !== clean(product?.productId)) return { ok: false, code: "trigger_product_mismatch" };
  return { ok: true, code: "" };
}

/* ------------------------------------------------------------------ *
 * Duplicate-delivery guard                                            *
 * ------------------------------------------------------------------ */

// Bounded per-instance replay cache. External webhook senders (Stripe/Shopify
// class) retry on slow or non-2xx responses; a retry re-sends the SAME signed
// bytes, so (bindingId, timestamp, body-hash) identifies the delivery. This is
// best-effort WITHIN one runtime instance — inbound invocation is bounded
// synchronous execution (60s graph budget), and callers needing cross-instance
// idempotency send `x-growthub-idempotency-key`, which scopes the key they
// control. Duplicates are ACKed (2xx, `duplicate: true`) without re-executing,
// so provider retry loops terminate instead of hammering the graph.
const DELIVERY_DEDUPE_CAP = 512;
const deliveryCache = new Map(); // key -> expiresAtS

function inboundDeliveryKey({ bindingId, rawBody, timestamp, idempotencyKey } = {}) {
  if (clean(idempotencyKey)) return `${clean(bindingId)}:idem:${clean(idempotencyKey)}`;
  return `${clean(bindingId)}:${clean(timestamp)}:${sha256Hex(typeof rawBody === "string" ? rawBody : "")}`;
}

function registerInboundDelivery({ bindingId, rawBody, timestamp, idempotencyKey, currentTimeS } = {}) {
  const now = Number.isFinite(currentTimeS) ? currentTimeS : Math.floor(Date.now() / 1000);
  const key = inboundDeliveryKey({ bindingId, rawBody, timestamp, idempotencyKey });
  for (const [cachedKey, expiresAtS] of deliveryCache) {
    if (expiresAtS <= now) deliveryCache.delete(cachedKey);
  }
  if (deliveryCache.has(key)) return { duplicate: true, key };
  deliveryCache.set(key, now + WEBHOOK_TIMESTAMP_TOLERANCE_S * 2);
  while (deliveryCache.size > DELIVERY_DEDUPE_CAP) {
    deliveryCache.delete(deliveryCache.keys().next().value);
  }
  return { duplicate: false, key };
}

/** Test hook — clears the per-instance replay cache. */
function resetInboundDeliveryCache() {
  deliveryCache.clear();
}

/* ------------------------------------------------------------------ *
 * Inbound adapters (mirror of SCHEDULER_ADAPTERS)                     *
 * ------------------------------------------------------------------ */

function headerValue(headers, name) {
  if (!headers) return "";
  if (typeof headers.get === "function") return clean(headers.get(name));
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? clean(headers[key]) : "";
}

const growthubWebhookAdapter = {
  connectorKind: "growthub-inbound-webhook",
  executionLane: INBOUND_WEBHOOK_LANE,
  secretEnv: "GROWTHUB_WEBHOOK_SIGNING_SECRET",
  /** True when the request carries this method's proof material. */
  matchesRequest(headers) {
    return Boolean(headerValue(headers, "x-growthub-signature"));
  },
  resolveSecret(env = process.env) {
    const source = env && typeof env === "object" ? env : {};
    return clean(source[this.secretEnv]);
  },
  verifyInbound({ headers, rawBody, expectedUrl, env = process.env, currentTimeS } = {}) {
    return verifyInboundWebhookSignature({
      signature: headerValue(headers, "x-growthub-signature"),
      timestamp: headerValue(headers, "x-growthub-timestamp"),
      rawBody,
      expectedUrl,
      secret: this.resolveSecret(env),
      currentTimeS,
    });
  },
};

const growthubApiRequestAdapter = {
  connectorKind: "growthub-api-request",
  executionLane: API_REQUEST_LANE,
  secretEnv: "GROWTHUB_API_INVOKE_TOKEN",
  matchesRequest(headers) {
    return Boolean(headerValue(headers, "authorization") || headerValue(headers, "x-growthub-api-key"));
  },
  resolveSecret(env = process.env) {
    const source = env && typeof env === "object" ? env : {};
    return clean(source[this.secretEnv]);
  },
  verifyInbound({ headers, env = process.env } = {}) {
    return verifyApiRequestAuth({
      authorization: headerValue(headers, "authorization"),
      apiKeyHeader: headerValue(headers, "x-growthub-api-key"),
      expectedToken: this.resolveSecret(env),
    });
  },
};

const INBOUND_ADAPTERS = [growthubWebhookAdapter, growthubApiRequestAdapter];

/** Resolve the inbound adapter for a marketplace product (by connectorKind). */
function getInboundAdapter(product) {
  const kind = clean(product?.connectorKind);
  if (!kind) return null;
  return INBOUND_ADAPTERS.find((adapter) => adapter.connectorKind === kind) || null;
}

function isInboundInvocationProduct(product) {
  return INBOUND_INVOCATION_LANES.includes(clean(product?.executionLane)) && Boolean(getInboundAdapter(product));
}

/**
 * Pick the provider's inbound product that matches the proof material actually
 * on the request (webhook signature header vs bearer credentials). Signature
 * wins when both are present — the stronger, destination-bound proof.
 */
function resolveInboundProductForRequest(provider, headers) {
  const products = Array.isArray(provider?.products) ? provider.products : [];
  const candidates = products.filter((p) => isInboundInvocationProduct(p));
  if (!candidates.length) return null;
  const matched = candidates
    .map((product) => ({ product, adapter: getInboundAdapter(product) }))
    .filter(({ adapter }) => adapter.matchesRequest(headers));
  if (!matched.length) return null;
  const webhook = matched.find(({ adapter }) => adapter.executionLane === INBOUND_WEBHOOK_LANE);
  return (webhook || matched[0]).product;
}

export {
  API_REQUEST_LANE,
  BINDING_RECEIPT_KIND,
  BINDING_TRIGGER_KINDS,
  INBOUND_INVOCATION_LANES,
  INBOUND_WEBHOOK_LANE,
  INVOKED_RUN_KIND,
  SIGNATURE_CLOCK_TOLERANCE_S,
  WEBHOOK_TIMESTAMP_TOLERANCE_S,
  deriveBindingId,
  evaluateBindingMatch,
  getInboundAdapter,
  inboundDeliveryKey,
  registerInboundDelivery,
  resetInboundDeliveryCache,
  growthubApiRequestAdapter,
  growthubWebhookAdapter,
  inputModeForTriggerKind,
  isInboundInvocationProduct,
  resolveInboundProductForRequest,
  signInboundWebhook,
  triggerKindForLane,
  verifyApiRequestAuth,
  verifyInboundWebhookSignature,
};
