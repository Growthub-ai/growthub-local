import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleUrl = pathToFileURL(path.join(
  root,
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-observation-scheduler.js",
)).href;
const {
  COMPUTE_OBSERVATION_SCHEMA,
  computeObservationDelaySeconds,
  computeObservationRequestId,
  computeObservationSchedulerReadiness,
  scheduleComputeObservation,
  verifyComputeObservationRequest,
} = await import(moduleUrl);

const KEY = "qstash-signing-key-for-tests";
const BASE_ENV = {
  NODE_ENV: "production",
  QSTASH_TOKEN: "qstash-publish-token-secret",
  QSTASH_CURRENT_SIGNING_KEY: KEY,
  GROWTHUB_WORKSPACE_PUBLIC_URL: "https://workspace.example",
  QSTASH_URL: "https://qstash.example",
  GROWTHUB_WORKSPACE_CONFIG_ID: "workspace-test",
};
const BINDING = {
  trainingRunId: "trainrun-observe-1",
  authorityHash: "a".repeat(64),
  workSpecHash: "b".repeat(64),
};

function b64url(value) {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
}

function qstashSignature(rawBody, { key = KEY, sub = "https://workspace.example/api/workspace/sandbox-run", now = 1_700_000_000 } = {}) {
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const body = createHash("sha256").update(rawBody, "utf8").digest("base64url");
  const payload = b64url({ iss: "Upstash", sub, body, nbf: now - 5, exp: now + 60 });
  const signature = createHmac("sha256", key).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

test("scheduler readiness is fail-closed and non-secret", () => {
  const absent = computeObservationSchedulerReadiness({ env: { NODE_ENV: "production", VERCEL: "1" } });
  assert.equal(absent.ready, false);
  assert.ok(absent.missing.includes("QSTASH_TOKEN"));
  const ready = computeObservationSchedulerReadiness({ env: BASE_ENV });
  assert.equal(ready.ready, true);
  assert.equal(ready.destinationUrl, "https://workspace.example/api/workspace/sandbox-run");
  assert.equal(JSON.stringify(ready).includes(BASE_ENV.QSTASH_TOKEN), false);
  assert.equal(JSON.stringify(ready).includes(KEY), false);
});

test("delays are bounded exponential backoff", () => {
  assert.equal(computeObservationDelaySeconds(1, BASE_ENV), 10);
  assert.equal(computeObservationDelaySeconds(2, BASE_ENV), 20);
  assert.equal(computeObservationDelaySeconds(6, BASE_ENV), 300);
  assert.equal(computeObservationDelaySeconds(100, BASE_ENV), 300);
});

test("publish uses delayed signed destination, deduplication, and secret-free evidence", async () => {
  let captured = null;
  const fetchImpl = async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify({ messageId: "msg-observe-1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const result = await scheduleComputeObservation({
    ...BINDING,
    attempt: 3,
    env: BASE_ENV,
    fetchImpl,
    now: () => Date.parse("2026-07-21T03:00:00.000Z"),
  });
  assert.equal(result.ok, true, result.reason);
  assert.match(captured.url, /^https:\/\/qstash\.example\/v2\/publish\/https:\/\/workspace\.example\/api\/workspace\/sandbox-run$/);
  assert.equal(captured.init.headers.authorization, `Bearer ${BASE_ENV.QSTASH_TOKEN}`);
  assert.equal(captured.init.headers["upstash-delay"], "40s");
  assert.equal(captured.init.headers["upstash-retries"], "3");
  assert.equal(captured.init.headers["upstash-deduplication-id"], result.evidence.requestId);
  const payload = JSON.parse(captured.init.body);
  assert.equal(payload.kind, "growthub-scheduled-run-v1");
  assert.equal(payload.observationKind, COMPUTE_OBSERVATION_SCHEMA);
  assert.equal(payload.computeAction, "observe");
  assert.equal(payload.name, BINDING.trainingRunId);
  assert.equal(payload.observationAttempt, 3);
  assert.equal(payload.observationRequestId, result.evidence.requestId);
  assert.equal(result.evidence.messageId, "msg-observe-1");
  assert.equal(result.evidence.nextObservationAt, "2026-07-21T03:00:40.000Z");
  const exposed = JSON.stringify(result);
  assert.equal(exposed.includes(BASE_ENV.QSTASH_TOKEN), false);
  assert.equal(exposed.includes(KEY), false);
});

test("valid callback is signature/body/url bound; replay-shaped mutation is refused", async () => {
  let rawBody = "";
  await scheduleComputeObservation({
    ...BINDING,
    attempt: 1,
    env: BASE_ENV,
    fetchImpl: async (_url, init) => {
      rawBody = init.body;
      return new Response(JSON.stringify({ messageId: "msg" }), { status: 200 });
    },
    now: () => 1_700_000_000_000,
  });
  const now = 1_700_000_000;
  const signature = qstashSignature(rawBody, { now });
  const verified = verifyComputeObservationRequest({
    signature,
    rawBody,
    requestUrl: "https://internal-runtime.invalid/api/workspace/sandbox-run",
    env: BASE_ENV,
    currentTimeS: now,
  });
  assert.equal(verified.ok, true, verified.reason);
  assert.equal(verified.body.actor, "qstash-compute-observer");
  assert.equal(verified.body.observationRequestId, computeObservationRequestId({ ...BINDING, attempt: 1 }));

  const tampered = rawBody.replace(BINDING.trainingRunId, "other-run");
  const bodyMismatch = verifyComputeObservationRequest({ signature, rawBody: tampered, env: BASE_ENV, currentTimeS: now });
  assert.equal(bodyMismatch.ok, false);
  assert.equal(bodyMismatch.reasonCode, "observation-signature-invalid");

  const parsed = JSON.parse(rawBody);
  parsed.observationRequestId = "0".repeat(64);
  const wrongIdBody = JSON.stringify(parsed);
  const wrongId = verifyComputeObservationRequest({
    signature: qstashSignature(wrongIdBody, { now }),
    rawBody: wrongIdBody,
    env: BASE_ENV,
    currentTimeS: now,
  });
  assert.equal(wrongId.ok, false);
  assert.equal(wrongId.reasonCode, "observation-request-id-invalid");
});

test("attempt ceiling and missing scheduler fail without publishing", async () => {
  let calls = 0;
  const exhausted = await scheduleComputeObservation({
    ...BINDING,
    attempt: 2,
    env: { ...BASE_ENV, GROWTHUB_COMPUTE_OBSERVATION_MAX_ATTEMPTS: "1" },
    fetchImpl: async () => { calls += 1; return new Response("{}"); },
  });
  assert.equal(exhausted.ok, false);
  assert.equal(exhausted.reasonCode, "observation-attempts-exhausted");
  const unavailable = await scheduleComputeObservation({
    ...BINDING,
    attempt: 1,
    env: { NODE_ENV: "production", GROWTHUB_WORKSPACE_PUBLIC_URL: "https://workspace.example" },
    fetchImpl: async () => { calls += 1; return new Response("{}"); },
  });
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.reasonCode, "observation-scheduler-unavailable");
  assert.equal(calls, 0);
});
