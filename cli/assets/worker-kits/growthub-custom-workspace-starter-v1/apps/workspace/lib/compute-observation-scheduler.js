/**
 * Durable remote-compute observation through the EXISTING QStash scheduler
 * authority. Starting a provider job still happens only through sandbox-run;
 * this module publishes a signed delayed continuation back to that same route.
 *
 * Security / reliability invariants:
 * - QSTASH_TOKEN is used only to publish and never enters receipts or errors.
 * - callbacks are accepted only after the existing QStash JWT verifier binds
 *   signature + raw body + exact destination URL;
 * - every continuation is bound to trainingRunId + authorityHash + workSpecHash
 *   + monotonically increasing attempt;
 * - Upstash-Deduplication-Id prevents a lost publish acknowledgement from
 *   enqueueing the same observation twice;
 * - production remote compute can require this readiness before paid allocation.
 */

import { createHash } from "node:crypto";
import { getUpstashProduct } from "./workspace-add-ons.js";
import {
  deriveScheduleId,
  resolveWorkspacePublicUrl,
  upstashQstashAdapter,
} from "./workspace-add-on-scheduler.js";

export const COMPUTE_OBSERVATION_SCHEMA = "growthub-compute-observation-v1";
export const COMPUTE_OBSERVATION_MAX_ATTEMPTS_ENV = "GROWTHUB_COMPUTE_OBSERVATION_MAX_ATTEMPTS";
export const COMPUTE_OBSERVATION_INITIAL_DELAY_ENV = "GROWTHUB_COMPUTE_OBSERVATION_INITIAL_DELAY_SECONDS";
export const COMPUTE_OBSERVATION_MAX_DELAY_ENV = "GROWTHUB_COMPUTE_OBSERVATION_MAX_DELAY_SECONDS";
export const COMPUTE_OBSERVATION_QSTASH_REGION_ENV = "GROWTHUB_COMPUTE_QSTASH_REGION";

const SHA256_HEX = /^[a-f0-9]{64}$/;

function str(value) {
  return String(value ?? "").trim();
}

function int(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function sha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function isoFromMs(value) {
  return new Date(value).toISOString();
}

function failure(reasonCode, reason, extra = {}) {
  return { ok: false, reasonCode, reason: str(reason).slice(0, 400), ...extra };
}

function qstashRegion(product, env = process.env) {
  const requested = str(env?.[COMPUTE_OBSERVATION_QSTASH_REGION_ENV]);
  const options = Array.isArray(product?.regionOptions) ? product.regionOptions : [];
  if (requested && options.some((option) => str(option?.id) === requested)) return requested;
  return str(options[0]?.id) || "us-east-1";
}

export function computeObservationMaxAttempts(env = process.env) {
  return int(env?.[COMPUTE_OBSERVATION_MAX_ATTEMPTS_ENV], 288, 1, 10_000);
}

export function computeObservationDelaySeconds(attempt, env = process.env) {
  const initial = int(env?.[COMPUTE_OBSERVATION_INITIAL_DELAY_ENV], 10, 1, 3600);
  const ceiling = int(env?.[COMPUTE_OBSERVATION_MAX_DELAY_ENV], 300, initial, 86_400);
  const exponent = Math.max(0, Math.min(20, Number(attempt) - 1));
  return Math.min(ceiling, initial * (2 ** exponent));
}

export function computeObservationRequestId({ trainingRunId, authorityHash, workSpecHash, attempt } = {}) {
  return sha256([
    COMPUTE_OBSERVATION_SCHEMA,
    str(trainingRunId),
    str(authorityHash).toLowerCase(),
    str(workSpecHash).toLowerCase(),
    Math.max(1, Math.floor(Number(attempt) || 1)),
  ].join("|"));
}

export function computeObservationDestinationUrl({ env = process.env, requestOrigin = "" } = {}) {
  const base = resolveWorkspacePublicUrl(env, requestOrigin);
  return base ? `${base}/api/workspace/sandbox-run` : "";
}

/** Non-secret readiness proof. */
export function computeObservationSchedulerReadiness({ env = process.env, requestOrigin = "" } = {}) {
  const tokenPresent = Boolean(str(env?.QSTASH_TOKEN));
  const signingKeys = upstashQstashAdapter.resolveSigningKeys(env);
  const destinationUrl = computeObservationDestinationUrl({ env, requestOrigin });
  const missing = [];
  if (!tokenPresent) missing.push("QSTASH_TOKEN");
  if (!signingKeys.length) missing.push("QSTASH_CURRENT_SIGNING_KEY/QSTASH_NEXT_SIGNING_KEY");
  if (!destinationUrl) missing.push("GROWTHUB_WORKSPACE_PUBLIC_URL (reachable HTTPS origin)");
  return {
    ready: missing.length === 0,
    mode: missing.length === 0 ? "qstash" : "manual",
    missing,
    destinationUrl,
    signingKeyCount: signingKeys.length,
  };
}

function validateBinding({ trainingRunId, authorityHash, workSpecHash, attempt } = {}) {
  const runId = str(trainingRunId);
  const authority = str(authorityHash).toLowerCase();
  const spec = str(workSpecHash).toLowerCase();
  const n = Math.floor(Number(attempt));
  if (!runId || runId.length > 256 || !/^[A-Za-z0-9._:-]+$/.test(runId)) {
    return failure("observation-run-id-invalid", "trainingRunId is missing or invalid");
  }
  if (!SHA256_HEX.test(authority)) return failure("observation-authority-invalid", "authorityHash must be a SHA-256 digest");
  if (!SHA256_HEX.test(spec)) return failure("observation-work-spec-invalid", "workSpecHash must be a SHA-256 digest");
  if (!Number.isInteger(n) || n < 1 || n > 10_000) return failure("observation-attempt-invalid", "observation attempt is outside the governed range");
  return { ok: true, trainingRunId: runId, authorityHash: authority, workSpecHash: spec, attempt: n };
}

/**
 * Publish the next signed continuation. Returns only non-secret journal fields.
 */
export async function scheduleComputeObservation({
  trainingRunId = "",
  authorityHash = "",
  workSpecHash = "",
  attempt = 1,
  env = process.env,
  requestOrigin = "",
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
} = {}) {
  const binding = validateBinding({ trainingRunId, authorityHash, workSpecHash, attempt });
  if (!binding.ok) return binding;
  const maxAttempts = computeObservationMaxAttempts(env);
  if (binding.attempt > maxAttempts) {
    return failure("observation-attempts-exhausted", `remote observation exhausted its ${maxAttempts}-attempt ceiling`, {
      exhausted: true,
      attempt: binding.attempt,
      maxAttempts,
    });
  }
  const readiness = computeObservationSchedulerReadiness({ env, requestOrigin });
  if (!readiness.ready) {
    return failure("observation-scheduler-unavailable", `durable observation is unavailable: ${readiness.missing.join(", ")}`, {
      readiness,
      attempt: binding.attempt,
      maxAttempts,
    });
  }
  if (typeof fetchImpl !== "function") return failure("observation-publish-unavailable", "fetch implementation unavailable");

  const product = getUpstashProduct("upstash-qstash");
  if (!product) return failure("observation-product-missing", "the shipped QStash scheduler product is unavailable");
  const requestId = computeObservationRequestId(binding);
  const workspaceId = str(env?.GROWTHUB_WORKSPACE_CONFIG_ID || env?.GROWTHUB_WORKSPACE_ID || "workspace");
  const scheduleId = deriveScheduleId({
    providerId: "upstash",
    workspaceId,
    objectId: "model-training-runner",
    rowId: binding.trainingRunId,
    version: "compute-observe-v1",
  });
  const delaySeconds = computeObservationDelaySeconds(binding.attempt, env);
  const scheduledAtMs = Number(now());
  const built = upstashQstashAdapter.buildRunRequest({
    product,
    region: qstashRegion(product, env),
    token: str(env?.QSTASH_TOKEN),
    scheduleId,
    destinationUrl: readiness.destinationUrl,
    callbackUrl: "",
    failureCallbackUrl: "",
    env,
    forward: {
      workspaceId,
      objectId: "model-training-runner",
      rowId: binding.trainingRunId,
      version: "compute-observe-v1",
      scheduleId,
      observationKind: COMPUTE_OBSERVATION_SCHEMA,
      name: binding.trainingRunId,
      computeAction: "observe",
      intent: "model-training-observe",
      actor: "qstash-compute-observer",
      authorityHash: binding.authorityHash,
      workSpecHash: binding.workSpecHash,
      observationAttempt: binding.attempt,
      observationRequestId: requestId,
    },
  });
  built.headers = {
    ...(built.headers || {}),
    "upstash-delay": `${delaySeconds}s`,
    "upstash-retries": "3",
    "upstash-deduplication-id": requestId,
    "upstash-label": `growthub-compute-observe-${binding.trainingRunId.slice(0, 80)}`,
    "upstash-redact-fields": "body,header[authorization]",
  };

  let response;
  let text = "";
  try {
    response = await fetchImpl(built.url, {
      method: built.method,
      headers: built.headers,
      body: built.body,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    text = await response.text();
  } catch (error) {
    return failure("observation-publish-failed", `QStash observation publish failed: ${str(error?.message || error)}`, {
      attempt: binding.attempt,
      maxAttempts,
      requestId,
    });
  }
  const parsed = upstashQstashAdapter.parseRunResponse({ status: response.status, body: text });
  if (!parsed.ok) {
    return failure("observation-publish-failed", parsed.proof, {
      attempt: binding.attempt,
      maxAttempts,
      requestId,
      httpStatus: response.status,
    });
  }
  return {
    ok: true,
    evidence: {
      schema: COMPUTE_OBSERVATION_SCHEMA,
      mode: "qstash",
      status: "scheduled",
      attempt: binding.attempt,
      maxAttempts,
      requestId,
      messageId: str(parsed.messageId),
      scheduleId,
      scheduledAt: isoFromMs(scheduledAtMs),
      nextObservationAt: isoFromMs(scheduledAtMs + delaySeconds * 1000),
      lastObservedAt: "",
      lastErrorCode: "",
      authorityHash: binding.authorityHash,
      workSpecHash: binding.workSpecHash,
    },
  };
}

/** Verify and parse the signed continuation before it reaches sandbox-run. */
export function verifyComputeObservationRequest({
  signature = "",
  rawBody = "",
  requestUrl = "",
  env = process.env,
  requestOrigin = "",
  currentTimeS,
} = {}) {
  const expectedUrl = computeObservationDestinationUrl({ env, requestOrigin });
  if (!expectedUrl) return failure("observation-destination-unavailable", "canonical public sandbox-run URL is unavailable");
  const verdict = upstashQstashAdapter.verifyCallback({
    signature,
    rawBody,
    expectedUrl,
    env,
    currentTimeS,
  });
  if (!verdict?.ok) return failure("observation-signature-invalid", `QStash signature refused: ${str(verdict?.reason || "verification failed")}`);
  let body;
  try { body = JSON.parse(rawBody); } catch {
    return failure("observation-body-invalid", "signed observation body is not valid JSON");
  }
  if (body?.kind !== "growthub-scheduled-run-v1" || body?.observationKind !== COMPUTE_OBSERVATION_SCHEMA) {
    return failure("observation-body-invalid", "signed request is not a governed compute observation");
  }
  if (body?.objectId !== "model-training-runner" || body?.computeAction !== "observe") {
    return failure("observation-target-invalid", "signed observation must target model-training-runner with computeAction=observe");
  }
  const binding = validateBinding({
    trainingRunId: body?.name,
    authorityHash: body?.authorityHash,
    workSpecHash: body?.workSpecHash,
    attempt: body?.observationAttempt,
  });
  if (!binding.ok) return binding;
  const expectedRequestId = computeObservationRequestId(binding);
  if (str(body?.observationRequestId) !== expectedRequestId) {
    return failure("observation-request-id-invalid", "observationRequestId does not match its governed binding");
  }
  // requestUrl is diagnostic only; signature subject is checked against the
  // canonical public URL, never an attacker-controlled Host header.
  return {
    ok: true,
    body: {
      ...body,
      name: binding.trainingRunId,
      authorityHash: binding.authorityHash,
      workSpecHash: binding.workSpecHash,
      observationAttempt: binding.attempt,
      observationRequestId: expectedRequestId,
      actor: "qstash-compute-observer",
      intent: "model-training-observe",
      stream: false,
    },
    expectedUrl,
    receivedUrl: str(requestUrl),
  };
}
