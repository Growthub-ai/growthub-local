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
 * A callback/destination origin a provider could never actually reach (or that
 * would leak over plaintext). Registering one produces a false "installed
 * scheduler" that never calls back — exactly what we are trying to avoid.
 */
function isUnsafeCallbackUrl(url) {
  const u = clean(url).toLowerCase();
  if (!u) return true;
  if (!u.startsWith("https://")) return true; // QStash callbacks require https
  return /^https:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)([:/]|$)/.test(u);
}

/**
 * Resolve the public base URL the provider will call back to. Explicit env
 * override wins (the only reliable value on serverless hosts behind proxies);
 * otherwise fall back to the request origin. Returns "" for an unsafe origin
 * (localhost / non-https) unless `GROWTHUB_ALLOW_INSECURE_CALLBACK_URL=true`
 * is set for a local tunnel test — so callers fail loudly instead of
 * registering a callback the provider can never deliver to.
 */
function resolveWorkspacePublicUrl(env = process.env, requestOrigin = "") {
  const source = env && typeof env === "object" ? env : {};
  const explicit = clean(
    source.GROWTHUB_WORKSPACE_PUBLIC_URL ||
      source.WORKSPACE_PUBLIC_URL ||
      (source.VERCEL_URL ? `https://${clean(source.VERCEL_URL)}` : ""),
  );
  const allowInsecure = clean(source.GROWTHUB_ALLOW_INSECURE_CALLBACK_URL) === "true";
  const base = (explicit || clean(requestOrigin)).replace(/\/+$/, "");
  if (!base) return "";
  if (allowInsecure) return base;
  return isUnsafeCallbackUrl(base) ? "" : base;
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

/** Normalize a URL for `sub`-claim comparison (trailing slash + case-insensitive host). */
function normalizeUrlForCompare(value) {
  const raw = clean(value).replace(/\/+$/, "");
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch {
    return raw.toLowerCase();
  }
}

/**
 * Verify a QStash-style signed request. The `Upstash-Signature` header is a
 * JWT (HS256) signed with one of the rotating signing keys. We verify EVERY
 * claim Upstash's manual verification + `Receiver.verify()` require:
 *   - HMAC-SHA256 over `${headerB64}.${payloadB64}` matches for the current OR
 *     next signing key (key rotation),
 *   - `iss === "Upstash"`,
 *   - `sub === expectedUrl` (binds the signature to THIS endpoint — prevents
 *     replaying a /callback signature against /workflows and vice-versa),
 *   - the `body` claim is present for a non-empty body and equals SHA-256
 *     (base64) of the RAW request body (raw body must NOT be re-stringified),
 *   - `exp`/`nbf` within tolerance.
 *
 * Returns { ok, reason, claims }. Implemented natively (node:crypto) so it is
 * wire-compatible with `@upstash/qstash`'s Receiver without a runtime dep, and
 * fully testable offline. `expectedUrl` MUST come from the canonical public
 * URL / route, never from an attacker-controlled header.
 */
function verifyQstashSignature({ signature, body, signingKeys, expectedUrl, expectedIssuer = "Upstash", currentTimeS } = {}) {
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

  // Issuer must be Upstash.
  if (expectedIssuer && clean(claims.iss) !== expectedIssuer) {
    return { ok: false, reason: "issuer-mismatch", claims };
  }

  // Subject must equal the endpoint this request actually hit (anti-replay).
  if (expectedUrl) {
    if (!clean(claims.sub)) return { ok: false, reason: "missing-subject", claims };
    if (normalizeUrlForCompare(claims.sub) !== normalizeUrlForCompare(expectedUrl)) {
      return { ok: false, reason: "subject-mismatch", claims };
    }
  }

  // The body claim binds the signature to the exact bytes received.
  const rawBody = typeof body === "string" ? body : "";
  if (rawBody.length > 0 && !clean(claims.body)) {
    return { ok: false, reason: "missing-body-claim", claims };
  }
  if (clean(claims.body)) {
    const expectedDigest = normalizeDigestClaim(createHash("sha256").update(rawBody, "utf8").digest("base64"));
    if (normalizeDigestClaim(claims.body) !== expectedDigest) {
      return { ok: false, reason: "body-mismatch", claims };
    }
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
    // QStash STRIPS the `Upstash-Forward-` prefix before delivering to the
    // destination, so we forward canonical `x-growthub-*` names that the
    // destination route reads back verbatim (e.g. `x-growthub-object-id`).
    const forwardHeaderMap = {
      "x-growthub-workspace-id": forward.workspaceId,
      "x-growthub-object-id": forward.objectId,
      "x-growthub-row-id": forward.rowId,
      "x-growthub-version": forward.version,
      "x-growthub-schedule-id": forward.scheduleId,
    };
    for (const [name, value] of Object.entries(forwardHeaderMap)) {
      if (clean(value)) headers[`upstash-forward-${name}`] = clean(value);
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
  verifyCallback({ signature, rawBody, expectedUrl, env = process.env, currentTimeS } = {}) {
    return verifyQstashSignature({
      signature,
      body: rawBody,
      signingKeys: this.resolveSigningKeys(env),
      expectedUrl,
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
    const retried = Number(envelope?.retried);
    const maxRetries = Number(envelope?.maxRetries);
    return {
      kind,
      succeeded,
      status: Number.isFinite(status) ? status : null,
      messageId: clean(envelope?.sourceMessageId) || clean(envelope?.messageId),
      scheduleId: clean(envelope?.scheduleId),
      bodyPreview,
      // Retry counters distinguish "first attempt failed" from "retries exhausted".
      retried: Number.isFinite(retried) ? retried : null,
      maxRetries: Number.isFinite(maxRetries) ? maxRetries : null,
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

/**
 * Pure decision for whether a signed callback may mutate workspace config. A
 * governed scheduled callback MUST carry the installed schedule identity:
 * the registry row must own a scheduleId, the callback must carry one, and
 * they must match. Returns { ok, code } where code maps to a violation/HTTP.
 */
function evaluateCallbackScheduleMatch({ rowScheduleId, parsedScheduleId } = {}) {
  if (!clean(rowScheduleId)) return { ok: false, code: "callback_no_installed_schedule" };
  if (!clean(parsedScheduleId)) return { ok: false, code: "callback_missing_schedule_id" };
  if (clean(parsedScheduleId) !== clean(rowScheduleId)) return { ok: false, code: "callback_schedule_id_mismatch" };
  return { ok: true, code: "" };
}

export {
  SERVERLESS_SCHEDULER_LANE,
  SIGNATURE_CLOCK_TOLERANCE_S,
  deriveScheduleId,
  resolveWorkspacePublicUrl,
  buildSchedulerCallbackUrls,
  verifyQstashSignature,
  isUnsafeCallbackUrl,
  getSchedulerAdapter,
  isSchedulerProduct,
  evaluateCallbackScheduleMatch,
  upstashQstashAdapter,
};
