/**
 * Workspace Add-on Scheduler — provider-agnostic serverless scheduler capability.
 *
 * This is the reusable entry path the add-ons marketplace installs *into* the
 * governed universe. A marketplace product whose `executionLane` is
 * `serverless-scheduler` declares a `connectorKind`; this module maps that kind
 * to a SchedulerAdapter that knows how to:
 *
 *   1. build a deterministic, idempotent schedule create/update request,
 *   2. build the matching delete request,
 *   3. verify the signed callback the provider POSTs back, and
 *   4. parse that callback into NON-SECRET proof fields.
 *
 * Routes (`/api/workspace/add-ons/[providerId]/schedule|callback|failure`,
 * `/api/workspace/workflows/[providerId]`) stay provider-agnostic and delegate
 * the provider-specific wire details here. Upstash QStash is the first adapter;
 * a second provider is added by registering another adapter — no route changes.
 *
 * Everything here is pure (only `node:crypto`) so the whole loop —
 * schedule-id determinism, signature verification, callback parsing — is
 * deterministically testable offline with `node --test`.
 *
 * SECRET RULE: tokens/signing keys are inputs to request building and signature
 * verification ONLY. Nothing in the returned schedule metadata or parsed
 * callback proof contains a secret value.
 */

import { createHmac, createHash, timingSafeEqual } from "node:crypto";

const SERVERLESS_SCHEDULER_LANE = "serverless-scheduler";
const SCHEDULE_ID_NAMESPACE = "growthub";
// Clock skew tolerance for signed-callback exp/nbf checks (QStash Receiver default).
const SIGNATURE_CLOCK_TOLERANCE_S = 10;
const MAX_BODY_PREVIEW_CHARS = 240;

function clean(value) {
  return String(value == null ? "" : value).trim();
}

/** Header-safe slug for one schedule-id segment (stable for identical input). */
function slugSegment(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "default";
}

/**
 * Deterministic, idempotent schedule id derived from governed row identity.
 * Same (providerId, workspaceId, objectId, rowId, version) → same id, so a
 * create/update on the provider is an upsert, never a duplicate schedule.
 *
 *   growthub:{providerId}:{workspaceId}:{objectId}:{rowId}:{version}
 */
function deriveScheduleId({ providerId, workspaceId, objectId, rowId, version } = {}) {
  return [
    SCHEDULE_ID_NAMESPACE,
    slugSegment(providerId),
    slugSegment(workspaceId || "workspace"),
    slugSegment(objectId),
    slugSegment(rowId),
    slugSegment(version || "v1"),
  ].join(":");
}

/**
 * Resolve the public base URL the provider will call back to. Explicit env
 * override wins (the only reliable value on serverless hosts behind proxies);
 * otherwise fall back to the request origin. Returns "" if neither is usable so
 * callers can fail loudly instead of registering a localhost callback.
 */
function resolveWorkspacePublicUrl(env = process.env, requestOrigin = "") {
  const source = env && typeof env === "object" ? env : {};
  const explicit = clean(
    source.GROWTHUB_WORKSPACE_PUBLIC_URL ||
      source.WORKSPACE_PUBLIC_URL ||
      (source.VERCEL_URL ? `https://${clean(source.VERCEL_URL)}` : ""),
  );
  const base = explicit || clean(requestOrigin);
  return base.replace(/\/+$/, "");
}

/** The three governed URLs a scheduled run needs, all under one provider. */
function buildSchedulerCallbackUrls(baseUrl, providerId) {
  const root = clean(baseUrl).replace(/\/+$/, "");
  const pid = encodeURIComponent(slugSegment(providerId));
  return {
    destinationUrl: `${root}/api/workspace/workflows/${pid}`,
    callbackUrl: `${root}/api/workspace/add-ons/${pid}/callback`,
    failureCallbackUrl: `${root}/api/workspace/add-ons/${pid}/failure`,
  };
}

function base64UrlToBuffer(value) {
  const normalized = clean(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

/** Normalize any base64/base64url digest claim to padding-free base64url. */
function normalizeDigestClaim(value) {
  return clean(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function constantTimeEqual(a, b) {
  const bufA = Buffer.from(String(a), "utf8");
  const bufB = Buffer.from(String(b), "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verify a QStash-style signed request. The `Upstash-Signature` header is a
 * JWT (HS256) signed with one of the rotating signing keys. We verify:
 *   - HMAC-SHA256 over `${headerB64}.${payloadB64}` matches the signature for
 *     the current OR next signing key (key rotation),
 *   - the `body` claim equals the SHA-256 (base64) of the RAW request body
 *     (so a tampered body is rejected — the raw body must NOT be re-stringified),
 *   - `exp`/`nbf` are within tolerance.
 *
 * Returns { ok, reason, claims }. Implemented natively (node:crypto) so it is
 * wire-compatible with `@upstash/qstash`'s Receiver without a runtime dep, and
 * fully testable offline.
 */
function verifyQstashSignature({ signature, body, signingKeys, currentTimeS } = {}) {
  const token = clean(signature);
  if (!token) return { ok: false, reason: "missing-signature" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed-jwt" };
  const [headerB64, payloadB64, signatureB64] = parts;
  const keys = (Array.isArray(signingKeys) ? signingKeys : [signingKeys])
    .map((k) => clean(k))
    .filter(Boolean);
  if (!keys.length) return { ok: false, reason: "no-signing-keys" };

  const signingInput = `${headerB64}.${payloadB64}`;
  const providedSig = base64UrlToBuffer(signatureB64);
  const signatureMatches = keys.some((key) => {
    const expected = createHmac("sha256", key).update(signingInput).digest();
    return expected.length === providedSig.length && timingSafeEqual(expected, providedSig);
  });
  if (!signatureMatches) return { ok: false, reason: "signature-mismatch" };

  const claims = safeJsonParse(base64UrlToBuffer(payloadB64).toString("utf8"));
  if (!claims || typeof claims !== "object") return { ok: false, reason: "bad-claims" };

  // The body claim binds the signature to the exact bytes received.
  const rawBody = typeof body === "string" ? body : "";
  const expectedDigest = normalizeDigestClaim(createHash("sha256").update(rawBody, "utf8").digest("base64"));
  if (claims.body && normalizeDigestClaim(claims.body) !== expectedDigest) {
    return { ok: false, reason: "body-mismatch", claims };
  }

  const now = Number.isFinite(currentTimeS) ? currentTimeS : Math.floor(Date.now() / 1000);
  if (Number.isFinite(claims.exp) && now > claims.exp + SIGNATURE_CLOCK_TOLERANCE_S) {
    return { ok: false, reason: "expired", claims };
  }
  if (Number.isFinite(claims.nbf) && now + SIGNATURE_CLOCK_TOLERANCE_S < claims.nbf) {
    return { ok: false, reason: "not-yet-valid", claims };
  }
  return { ok: true, reason: "verified", claims };
}

/* ------------------------------------------------------------------ *
 * Upstash QStash adapter                                              *
 * ------------------------------------------------------------------ */

function qstashBaseUrl({ product, region, env = process.env }) {
  const source = env && typeof env === "object" ? env : {};
  const configured = clean(source.QSTASH_URL);
  if (configured) return configured.replace(/\/+$/, "");
  const options = Array.isArray(product?.regionOptions) ? product.regionOptions : [];
  const selected = options.find((option) => option.id === region) || options[0];
  return clean(selected?.baseUrl).replace(/\/+$/, "");
}

const upstashQstashAdapter = {
  connectorKind: "upstash-qstash",
  /**
   * Build the QStash schedule create/update request. QStash upserts by
   * `Upstash-Schedule-Id`, so re-issuing with the same id edits in place.
   * The bearer token is placed in the Authorization header only.
   */
  buildScheduleRequest({ product, region, token, scheduleId, cron, destinationUrl, callbackUrl, failureCallbackUrl, forward = {}, env = process.env } = {}) {
    const base = qstashBaseUrl({ product, region, env });
    if (!base) throw new Error("could not resolve QStash base URL (set QSTASH_URL or pick a region)");
    if (!clean(token)) throw new Error("QSTASH_TOKEN is required to create a schedule");
    if (!clean(destinationUrl)) throw new Error("destination URL is required");
    if (!clean(cron)) throw new Error("cron expression is required");
    const headers = {
      authorization: `Bearer ${clean(token)}`,
      "content-type": "application/json",
      "upstash-cron": clean(cron),
      "upstash-schedule-id": clean(scheduleId),
    };
    if (clean(callbackUrl)) headers["upstash-callback"] = clean(callbackUrl);
    if (clean(failureCallbackUrl)) headers["upstash-failure-callback"] = clean(failureCallbackUrl);
    for (const [key, value] of Object.entries(forward || {})) {
      if (clean(value)) headers[`upstash-forward-${slugSegment(key)}`] = clean(value);
    }
    return {
      url: `${base}/v2/schedules/${encodeURIComponent(clean(destinationUrl))}`,
      method: "POST",
      headers,
      // Governed, non-secret run pointer. The destination resolves the row from
      // these ids and the canonical env entry — secrets never ride the body.
      body: JSON.stringify({
        kind: "growthub-scheduled-run-v1",
        scheduleId: clean(scheduleId),
        ...forward,
      }),
    };
  },
  buildDeleteRequest({ product, region, token, scheduleId, env = process.env } = {}) {
    const base = qstashBaseUrl({ product, region, env });
    if (!base) throw new Error("could not resolve QStash base URL");
    if (!clean(token)) throw new Error("QSTASH_TOKEN is required to delete a schedule");
    if (!clean(scheduleId)) throw new Error("scheduleId is required");
    return {
      url: `${base}/v2/schedules/${encodeURIComponent(clean(scheduleId))}`,
      method: "DELETE",
      headers: { authorization: `Bearer ${clean(token)}` },
    };
  },
  /** Map the schedule HTTP response into non-secret proof. */
  parseScheduleResponse({ status, body, scheduleId } = {}) {
    const ok = Number.isFinite(status) && status >= 200 && status < 300;
    const parsed = typeof body === "string" ? safeJsonParse(body) : body;
    const returnedId = clean(parsed?.scheduleId) || clean(scheduleId);
    return {
      ok,
      scheduleId: returnedId,
      proof: ok
        ? `QStash schedule ${returnedId} upserted (HTTP ${status}).`
        : `QStash schedule create failed (HTTP ${status}).`,
    };
  },
  /** Signing keys for callback verification, resolved from the run env. */
  resolveSigningKeys(env = process.env) {
    const source = env && typeof env === "object" ? env : {};
    return [clean(source.QSTASH_CURRENT_SIGNING_KEY), clean(source.QSTASH_NEXT_SIGNING_KEY)].filter(Boolean);
  },
  verifyCallback({ signature, rawBody, env = process.env, currentTimeS } = {}) {
    return verifyQstashSignature({
      signature,
      body: rawBody,
      signingKeys: this.resolveSigningKeys(env),
      currentTimeS,
    });
  },
  /**
   * Parse a QStash callback envelope into NON-SECRET proof. QStash posts the
   * destination's response wrapped as { status, body(base64), sourceMessageId,
   * scheduleId, ... }. We decode a short preview only — never persist the full
   * body or any header.
   */
  parseCallback({ rawBody, kind = "callback" } = {}) {
    const envelope = typeof rawBody === "string" ? safeJsonParse(rawBody) : rawBody;
    const status = Number(envelope?.status);
    let bodyPreview = "";
    if (clean(envelope?.body)) {
      try {
        bodyPreview = base64UrlToBuffer(envelope.body).toString("utf8").slice(0, MAX_BODY_PREVIEW_CHARS);
      } catch {
        bodyPreview = clean(envelope.body).slice(0, MAX_BODY_PREVIEW_CHARS);
      }
    }
    const succeeded = kind !== "failure" && Number.isFinite(status) && status >= 200 && status < 300;
    return {
      kind,
      succeeded,
      status: Number.isFinite(status) ? status : null,
      messageId: clean(envelope?.sourceMessageId) || clean(envelope?.messageId),
      scheduleId: clean(envelope?.scheduleId),
      bodyPreview,
      failureReason: succeeded ? "" : clean(envelope?.error) || clean(envelope?.dlqId) || (Number.isFinite(status) ? `HTTP ${status}` : "unknown"),
    };
  },
};

const SCHEDULER_ADAPTERS = [upstashQstashAdapter];

/** Resolve the scheduler adapter for a marketplace product (by connectorKind). */
function getSchedulerAdapter(product) {
  const kind = clean(product?.connectorKind);
  if (!kind) return null;
  return SCHEDULER_ADAPTERS.find((adapter) => adapter.connectorKind === kind) || null;
}

function isSchedulerProduct(product) {
  return clean(product?.executionLane) === SERVERLESS_SCHEDULER_LANE && Boolean(getSchedulerAdapter(product));
}

export {
  SERVERLESS_SCHEDULER_LANE,
  SIGNATURE_CLOCK_TOLERANCE_S,
  deriveScheduleId,
  resolveWorkspacePublicUrl,
  buildSchedulerCallbackUrls,
  verifyQstashSignature,
  getSchedulerAdapter,
  isSchedulerProduct,
  upstashQstashAdapter,
};
