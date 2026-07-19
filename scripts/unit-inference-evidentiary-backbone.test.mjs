#!/usr/bin/env node
/**
 * Evidentiary backbone certification: receipt DAG lineage, signed cache
 * envelopes + feedback poisoning, multi-tier economic routing, deterministic
 * streaming redaction, and the inference-manifest draft -> publish -> runtime
 * handshake.
 *
 * Run with: node --test scripts/unit-inference-evidentiary-backbone.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceLib = path.join(
  repoRoot,
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib",
);
const inferenceRoot = path.join(workspaceLib, "adapters/inference");

const { sha256Hex } = await import(pathToFileURL(path.join(inferenceRoot, "contracts.js")).href);
const {
  completionConfidence,
  estimateRequestCostCents,
  executeInferenceGateway,
} = await import(pathToFileURL(path.join(inferenceRoot, "gateway.js")).href);
const {
  CACHE_BYPASS_POISONED,
  InferenceSemanticCache,
  deriveCacheVersion,
  poisonCacheFromFeedback,
  resolveCacheSigningKey,
} = await import(pathToFileURL(path.join(inferenceRoot, "cache.js")).href);
const {
  buildReceiptLineage,
  detectLineageCycle,
  ingestChildReceipt,
  normalizeSpanKind,
  receiptSha256,
  workflowOperationIds,
} = await import(pathToFileURL(path.join(inferenceRoot, "lineage.js")).href);
const {
  compileInferenceManifest,
  signInferenceManifest,
  verifyManifestAgainstIdentity,
  verifySignedInferenceManifest,
  verifyWorkflowManifestsAtPublish,
} = await import(pathToFileURL(path.join(inferenceRoot, "manifest.js")).href);
const {
  createStreamingRedactor,
  redactText,
  resolveRedactionPreviewKey,
} = await import(pathToFileURL(path.join(inferenceRoot, "redaction.js")).href);
const resolveKeyFor = (env) => resolveRedactionPreviewKey(env);
const {
  executeCustomModelInference,
  executeCustomModelWorkflow,
} = await import(pathToFileURL(path.join(workspaceLib, "custom-model-inference.js")).href);

const BASE_SHA = "b".repeat(64);
const SIGNING_ENV = { GROWTHUB_WORKSPACE_SIGNING_KEY: "workspace-signing-key-test" };

function completion(content, toolCalls = undefined, extra = {}) {
  return {
    id: "chatcmpl-backbone",
    object: "chat.completion",
    choices: [{
      index: 0,
      finish_reason: toolCalls ? "tool_calls" : "stop",
      message: { role: "assistant", content, ...(toolCalls ? { tool_calls: toolCalls } : {}) },
      ...(extra.logprobs ? { logprobs: extra.logprobs } : {}),
    }],
    usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 },
  };
}

function transportIdentity(request) {
  return {
    verified: true,
    baseModelSha256: request.baseModelRef?.base_model_sha256 || "",
    adapterSha256: request.loraRef?.adapter_sha256 || "",
    adapterId: request.loraRef?.lora_id || "",
    adapterScale: request.loraRef?.scale ?? 1,
    servedAlias: request.modelTag,
    instanceId: "backbone-instance-1",
  };
}

function unifiedTransportResult(request, content, overrides = {}) {
  const response = completion(content, undefined, overrides);
  response.model = request.modelTag;
  return {
    ok: true,
    status: 200,
    response,
    providerKind: "test-openai-compatible",
    schemaEngine: "post-hoc",
    identity: transportIdentity(request),
    routing: { status: "unified", poolRole: "unified", poolId: "unified_pool", instanceId: "backbone-instance-1", nativeDisaggregation: false },
    nativeCache: { enabled: false, cachedTokens: 0 },
    coldStart: false,
    ...overrides.transport,
  };
}

function baseRequest(id, prompt, extra = {}) {
  return {
    request_id: id,
    model: "backbone-model",
    base_model_ref: { model_id: "base-model", base_model_sha256: BASE_SHA },
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
    ...extra,
  };
}

const workflowOpenApi = {
  openapi: "3.1.0",
  info: { title: "Governed workflow tools", version: "1" },
  paths: {
    "/api/workspace/sandbox-run": {
      post: {
        operationId: "runChildWorkflow",
        summary: "Invoke a governed child workflow",
        "x-growthub-workflow": true,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { name: { type: "string", minLength: 1 } },
                required: ["name"],
                additionalProperties: false,
              },
            },
          },
        },
      },
    },
  },
};

const childCall = {
  id: "call-child-workflow-1",
  type: "function",
  function: { name: "runChildWorkflow", arguments: '{"name":"support-triage"}' },
};

async function runChildGatewayCall({ parentReceiptId, fail = false }) {
  const transport = async ({ request }) => (fail
    ? { ok: false, status: 500, response: null, error: "child model exploded" }
    : unifiedTransportResult(request, "child workflow answer"));
  return executeInferenceGateway({
    request: baseRequest("child-request-1", "Run the child workflow step.", {
      parent_receipt_id: parentReceiptId,
      span_kind: "CHILD_WORKFLOW",
    }),
    transport,
    env: {},
    now: () => 1_721_280_000_000,
  });
}

function continuationFixture({ childReceiptField }) {
  const priorReceiptId = "infr_parent_awaiting_1";
  return {
    request: {
      request_id: "parent-continuation-1",
      prior_receipt_id: priorReceiptId,
      model: "backbone-model",
      base_model_ref: { model_id: "base-model", base_model_sha256: BASE_SHA },
      messages: [{ role: "user", content: "Delegate triage to the child workflow." }],
      tool_openapi: workflowOpenApi,
      tool_contract: { allowed_operation_ids: ["runChildWorkflow"] },
      tool_results: [{
        tool_call_id: childCall.id,
        operation_id: "runChildWorkflow",
        status: 200,
        response: { childRun: "run_child_1", ok: true },
        ...childReceiptField,
      }],
    },
    trust: (toolContractHash) => ({
      trusted: true,
      receiptId: priorReceiptId,
      modelTag: "backbone-model",
      appScope: "workspace-wide",
      integrationId: "",
      baseModelSha256: BASE_SHA,
      adapterSha256: "",
      toolContractSha256: toolContractHash,
      conversationSha256: sha256Hex([{ role: "user", content: "Delegate triage to the child workflow." }]),
      toolCalls: [childCall],
    }),
  };
}

// Reproduce the gateway's tool-contract hash: it hashes its own OpenAPI
// projection plus the raw spec and the operation allowlist.
const { projectOpenApiTools } = await import(pathToFileURL(path.join(inferenceRoot, "contracts.js")).href);
function gatewayToolContractHash(request) {
  return sha256Hex({
    tools: projectOpenApiTools(request.tool_openapi, { allowedOperationIds: request.tool_contract.allowed_operation_ids }),
    openapi: request.tool_openapi,
    allowedOperationIds: request.tool_contract.allowed_operation_ids.map(String),
  });
}

test("span kinds and lineage assembly are validated and Merkle-linked", () => {
  assert.deepEqual(normalizeSpanKind("", ""), { ok: true, spanKind: "ROOT", parentReceiptId: "" });
  assert.equal(normalizeSpanKind("CHILD_TOOL", "").ok, false, "CHILD_* without a parent is invalid");
  assert.equal(normalizeSpanKind("ROOT", "infr_x").ok, false, "ROOT with a parent is invalid");
  assert.deepEqual(normalizeSpanKind(undefined, "infr_parent"), { ok: true, spanKind: "CHILD_WORKFLOW", parentReceiptId: "infr_parent" });

  const childReceipt = { kind: "growthub-inference-verification-receipt-v1", receipt_id: "infr_child_1", status: "verified", errors: [] };
  const ingested = ingestChildReceipt({ toolCallId: "call-1", childReceipt });
  assert.equal(ingested.ok, true);
  assert.equal(ingested.link.child_status, "COMPLETED");
  assert.equal(ingested.link.child_receipt_sha256, receiptSha256(childReceipt));

  const lineage = buildReceiptLineage({ spanKind: "ROOT", parentReceiptId: "", children: [ingested.link] });
  assert.equal(lineage.status, "complete");
  assert.match(lineage.lineage_sha256, /^[0-9a-f]{64}$/);
  assert.equal(buildReceiptLineage({}).status, "leaf");
  assert.equal(buildReceiptLineage({}).lineage_sha256, null);

  assert.deepEqual([...workflowOperationIds(workflowOpenApi)], ["runChildWorkflow"]);
});

test("parent continuation ingests the child receipt into a complete receipt DAG", async () => {
  const child = await runChildGatewayCall({ parentReceiptId: "infr_parent_awaiting_1" });
  assert.equal(child.ok, true, JSON.stringify(child.error));
  assert.equal(child.receipt.lineage.span_kind, "CHILD_WORKFLOW");
  assert.equal(child.receipt.lineage.parent_receipt_id, "infr_parent_awaiting_1");

  const fixture = continuationFixture({ childReceiptField: { child_receipt: child.receipt } });
  const transport = async ({ request }) => unifiedTransportResult(request, "Child triage complete: escalated to tier 2.");
  const result = await executeInferenceGateway({
    request: fixture.request,
    transport,
    trustedContinuation: fixture.trust(await gatewayToolContractHash(fixture.request)),
    env: {},
    now: () => 1_721_280_000_000,
  });
  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.equal(result.receipt.lineage.status, "complete");
  assert.equal(result.receipt.lineage.children.length, 1);
  const edge = result.receipt.lineage.children[0];
  assert.equal(edge.child_receipt_id, child.receipt.receipt_id);
  assert.equal(edge.child_receipt_sha256, receiptSha256(child.receipt));
  assert.equal(edge.child_status, "COMPLETED");
  assert.match(result.receipt.lineage.lineage_sha256, /^[0-9a-f]{64}$/);
  const audited = result.receipt.tool_audit.calls.find((entry) => entry.continuation_request_id === "parent-continuation-1");
  assert.equal(audited.child_receipt_hash, receiptSha256(child.receipt));
  assert.equal(audited.child_status, "COMPLETED");
});

test("a declared child workflow call without an ingested receipt fails the parent closed", async () => {
  const fixture = continuationFixture({ childReceiptField: {} });
  let transportCalls = 0;
  const result = await executeInferenceGateway({
    request: fixture.request,
    transport: async ({ request }) => { transportCalls += 1; return unifiedTransportResult(request, "must not run"); },
    trustedContinuation: fixture.trust(await gatewayToolContractHash(fixture.request)),
    env: {},
    now: () => 1_721_280_000_000,
  });
  assert.equal(result.ok, false);
  assert.equal(transportCalls, 0, "a continuation with a missing child receipt never reaches the model");
  assert.equal(result.receipt.errors.some((error) => error.code === "child_receipt_missing"), true);
  assert.equal(result.receipt.lineage.status, "incomplete");
  assert.equal(result.receipt.lineage.children[0].child_status, "MISSING");
});

test("a failed child is recorded with its exact error instead of orphaned", async () => {
  const child = await runChildGatewayCall({ parentReceiptId: "infr_parent_awaiting_1", fail: true });
  assert.equal(child.ok, false);
  const fixture = continuationFixture({ childReceiptField: { child_receipt: child.receipt } });
  const result = await executeInferenceGateway({
    request: fixture.request,
    transport: async ({ request }) => unifiedTransportResult(request, "Parent handled the child failure."),
    trustedContinuation: fixture.trust(await gatewayToolContractHash(fixture.request)),
    env: {},
    now: () => 1_721_280_000_000,
  });
  assert.equal(result.ok, true, JSON.stringify(result.error));
  const edge = result.receipt.lineage.children[0];
  assert.equal(edge.child_status, "FAILED");
  assert.equal(typeof edge.error.message, "string");
  assert.equal(edge.child_receipt_sha256, receiptSha256(child.receipt));
  assert.equal(result.receipt.lineage.status, "complete", "a FAILED-but-ingested child completes the DAG honestly");
});

test("an awaiting turn hands the executor child-receipt binding headers", async () => {
  const transport = async ({ request }) => {
    const response = completion(null, [childCall]);
    response.model = request.modelTag;
    return { ...unifiedTransportResult(request, null), response };
  };
  const result = await executeInferenceGateway({
    request: baseRequest("parent-first-turn", "Delegate triage to the child workflow.", {
      tool_openapi: workflowOpenApi,
      tool_contract: { allowed_operation_ids: ["runChildWorkflow"] },
    }),
    transport,
    env: {},
    now: () => 1_721_280_000_000,
  });
  assert.equal(result.status, "awaiting_tool_result");
  assert.deepEqual(result.childExecution.required_call_ids, [childCall.id]);
  assert.equal(result.childExecution.headers["x-growthub-child-receipt-required"], "true");
  assert.equal(result.childExecution.headers["x-growthub-parent-receipt-id"], result.receipt.receipt_id);
  assert.match(result.childExecution.headers["x-growthub-parent-span-id"], /^[0-9a-f]{16}$/);
});

test("streaming redaction is deterministic, boundary-safe, and hash-only", () => {
  const text = "Reach me at jane.roe@example.org, SSN 123-45-6789, card 4111 1111 1111 1111, phone 555-867-5309. Order 1234 stays.";
  const oneShot = redactText(text);
  assert.equal(oneShot.events.map((event) => event.type).join(","), "PII_EMAIL,PII_SSN,PII_CREDIT_CARD,PII_PHONE");
  assert.doesNotMatch(JSON.stringify(oneShot), /123-45-6789|4111|jane\.roe/);
  for (const chunkSize of [1, 3, 7, 64]) {
    const redactor = createStreamingRedactor({});
    let streamed = "";
    for (let index = 0; index < text.length; index += chunkSize) streamed += redactor.process(text.slice(index, index + chunkSize));
    streamed += redactor.flush();
    assert.equal(streamed, oneShot.text, `chunk size ${chunkSize} must equal one-shot redaction`);
    assert.deepEqual(redactor.events(), oneShot.events);
  }
  // Luhn-invalid digit runs are not cards.
  assert.equal(redactText("number 1234 5678 9012 3456 here").events.length, 0);
});

test("gateway releases and caches only the redacted response, with receipt evidence", async () => {
  const cache = new InferenceSemanticCache({ now: () => 1_721_280_000_000 });
  const deltas = [];
  const rawContent = "Customer SSN is 123-45-6789 and email bob@corp.example — resolved.";
  let transportCalls = 0;
  const transport = async ({ request, onDelta }) => {
    transportCalls += 1;
    for (const piece of [rawContent.slice(0, 20), rawContent.slice(20, 41), rawContent.slice(41)]) {
      onDelta({ type: "inference.delta", payload: { choices: [{ index: 0, delta: { content: piece }, finish_reason: null }] } });
    }
    return unifiedTransportResult(request, rawContent);
  };
  const run = () => executeInferenceGateway({
    request: baseRequest("redacted-cache-1", "Summarize the customer record.", { cache_ttl: 300 }),
    defaults: { redaction: { enabled: true } },
    transport,
    cache,
    onDelta: (event) => deltas.push(event),
    env: {},
    now: () => 1_721_280_000_000,
  });
  const first = await run();
  assert.equal(first.ok, true, JSON.stringify(first.error));
  const streamedText = deltas.map((event) => event?.payload?.choices?.[0]?.delta?.content || "").join("");
  assert.doesNotMatch(streamedText, /123-45-6789|bob@corp\.example/, "no raw PII crosses the client stream");
  assert.match(streamedText, /\[REDACTED\]/);
  assert.equal(first.receipt.redaction.status, "redacted");
  assert.equal(first.receipt.redaction.event_count, 2);
  assert.doesNotMatch(JSON.stringify(first.receipt), /123-45-6789|bob@corp\.example/, "receipts never store raw PII");
  assert.match(first.output.content, /\[REDACTED\]/);
  assert.equal(first.receipt.cache.envelope_signature_state, "verified");

  const replay = await run();
  assert.equal(replay.receipt.cache.cache_status, "HIT");
  assert.equal(transportCalls, 1);
  assert.match(replay.output.content, /\[REDACTED\]/);
  assert.doesNotMatch(String(replay.output.content), /123-45-6789/, "the cache holds only the redacted response");
  assert.equal(replay.receipt.redaction.status, "redacted");
  assert.equal(replay.receipt.redaction.event_count, 2);
});

test("cache envelopes fail closed on tamper, epoch invalidation, and version rotation", async () => {
  const cache = new InferenceSemanticCache({ now: () => 1_721_280_000_000 });
  const envelope = {
    receipt_id: "infr_env_1",
    request_sha256: "c".repeat(64),
    model_sha256: BASE_SHA,
    adapter_sha256: "",
    schema_hash: "",
    workflow_version: "3",
  };
  await cache.store({ cacheKey: "sealed-key", scopeKey: "scope-a", prefixHash: "prefix-a", response: { answer: 41 }, ttlSeconds: 60, envelope });
  const clean = await cache.lookup({ cacheKey: "sealed-key" });
  assert.equal(clean.hit, true);
  assert.equal(clean.signatureState, "verified");
  assert.equal(clean.envelope.cache_version, cache.cacheVersion);

  cache.entries.get("sealed-key").response.answer = 42;
  const tampered = await cache.lookup({ cacheKey: "sealed-key" });
  assert.equal(tampered.hit, false, "a tampered envelope is a MISS, never served");
  assert.equal(tampered.integrity, "invalid");

  await cache.store({ cacheKey: "epoch-key", scopeKey: "scope-a", prefixHash: "prefix-a", response: { answer: 1 }, ttlSeconds: 60, envelope });
  const invalidation = await cache.invalidate({ reason: "MODEL_UPDATE", scope: { model_sha256: BASE_SHA } });
  assert.deepEqual(invalidation.epochsBumped, [`model:${BASE_SHA}`]);
  const epochMiss = await cache.lookup({ cacheKey: "epoch-key" });
  assert.equal(epochMiss.hit, false);
  assert.equal(epochMiss.integrity, "invalidated");

  // Credential rotation: same entry bytes, different credential binding.
  const rotated = new InferenceSemanticCache({ now: () => 1_721_280_000_000, cacheVersion: deriveCacheVersion({ credentials: { source: "upstash", url: "https://r.example", token: "rotated" }, namespace: "ns" }) });
  await cache.store({ cacheKey: "rotate-key", scopeKey: "scope-a", prefixHash: "prefix-a", response: { answer: 7 }, ttlSeconds: 60, envelope });
  rotated.remember(JSON.parse(JSON.stringify(cache.entries.get("rotate-key"))));
  const rotatedMiss = await rotated.lookup({ cacheKey: "rotate-key" });
  assert.equal(rotatedMiss.hit, false, "rotated credentials must strand old envelopes");
  assert.equal(rotatedMiss.integrity, "invalid");

  const operatorKey = resolveCacheSigningKey({ env: { GROWTHUB_INFERENCE_CACHE_HMAC_KEY: "operator-key" } });
  assert.equal(operatorKey.source, "operator");
  assert.doesNotMatch(JSON.stringify({ keyId: operatorKey.keyId }), /operator-key/, "key ids never leak the key");
});

test("feedback correction poisons the exact key and the semantic neighborhood", async () => {
  const embeddingProvider = {
    id: "backbone-embedding-v1",
    async embed(value) {
      return String(value).toLowerCase().includes("refund") ? [0.9, 0.4359, 0] : [0, 0, 1];
    },
  };
  const cache = new InferenceSemanticCache({ now: () => 1_721_280_000_000, embeddingProvider });
  let transportCalls = 0;
  const transport = async ({ request }) => {
    transportCalls += 1;
    return unifiedTransportResult(request, "Refunds take 90 days (hallucinated).");
  };
  const run = (id, prompt) => executeInferenceGateway({
    request: baseRequest(id, prompt, { cache_ttl: 300, cache_policy: { semantic: true, similarity_threshold: 0.9 } }),
    transport,
    cache,
    env: {},
    now: () => 1_721_280_000_000,
  });
  const original = await run("poison-original", "How long do refunds take?");
  assert.equal(original.ok, true, JSON.stringify(original.error));
  assert.equal(original.receipt.cache.cache_status, "MISS");
  assert.match(original.receipt.cache.semantic_bucket, /^[0-9a-f]{64}:[0-9a-f]{64}$/);

  const exactReplay = await run("poison-replay", "How long do refunds take?");
  assert.equal(exactReplay.receipt.cache.cache_status, "HIT");
  assert.equal(transportCalls, 1);

  // Thumbs-down with corrected ground truth: poison from the original receipt.
  const poisoned = await poisonCacheFromFeedback(cache, {
    originalReceipt: original.receipt,
    correctionReceiptId: "correction_receipt_9",
    correctedText: "Refunds take 5 business days.",
  });
  assert.equal(poisoned.ok, true);
  assert.deepEqual(poisoned.poisonedExactKeys, [original.receipt.cache.cache_key]);
  assert.equal(poisoned.poisonMarkersAdded, 1);

  const bypass = await run("poison-bypass", "How long do refunds take?");
  assert.equal(bypass.receipt.cache.cache_status, "BYPASS");
  assert.equal(bypass.receipt.cache.bypass_reason, CACHE_BYPASS_POISONED);
  assert.equal(bypass.receipt.cache.poisoned_by, "correction_receipt_9");
  assert.equal(transportCalls, 2, "a poisoned neighborhood re-executes the model instead of replaying");

  const semanticSibling = await run("poison-semantic", "What is the refund turnaround time?");
  assert.equal(semanticSibling.receipt.cache.bypass_reason, CACHE_BYPASS_POISONED, "semantically similar queries bypass the unreliable neighborhood");
  assert.equal(transportCalls, 3);
});

test("confidence and cost primitives are honest about their inputs", () => {
  assert.deepEqual(completionConfidence({}), { confidence: null, basis: "unavailable" });
  const confident = completionConfidence({ choices: [{ logprobs: { content: [{ logprob: -0.05 }, { logprob: -0.15 }] } }] });
  assert.equal(confident.basis, "avg-token-logprob");
  assert.ok(Math.abs(confident.confidence - Math.exp(-0.1)) < 1e-9);
  assert.equal(estimateRequestCostCents({ contextTokens: 500_000, maxTokens: 500_000 }, { inputCentsPerMTokens: 30, outputCentsPerMTokens: 60 }), 45);
  assert.equal(estimateRequestCostCents({ contextTokens: 500_000, maxTokens: 500_000 }, {}), 0);
});

function economicFixture({ teacherCost = { inputCentsPerMTokens: 100, outputCentsPerMTokens: 100 }, lowConfidence = true } = {}) {
  const policyRow = {
    integrationId: "custom-model-policy",
    metadata: {
      mothershipProxy: {
        workspaceSlug: "ws-backbone",
        modelTag: "base-model-tag",
        inferenceControlPlane: { cache: { ttl: 0 } },
        routes: [
          { target: "local-base", baseUrl: "http://127.0.0.1:11434", endpoint: "/v1/chat/completions", modelTag: "base-model-tag" },
          { target: "teacher", providerId: "cloud-teacher", baseUrl: "https://teacher.example", endpoint: "/chat/completions", modelTag: "teacher-model", costModel: teacherCost },
        ],
      },
    },
  };
  const fetchImpl = async (url) => {
    const target = String(url);
    const isTeacher = target.includes("teacher.example");
    const body = completion(
      isTeacher ? "High-quality cloud answer." : "Low-confidence local answer.",
      undefined,
      { logprobs: { content: [{ logprob: isTeacher ? -0.02 : (lowConfidence ? -2.5 : -0.02) }] } },
    );
    body.model = isTeacher ? "teacher-model" : "base-model-tag";
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
  return {
    policyRow,
    fetchImpl,
    networkPolicy: {
      networkAllow: true,
      allowList: ["teacher.example"],
      resolveHostname: async () => [{ address: "93.184.216.34" }],
    },
  };
}

test("economic router fails over to the cloud tier when local confidence is below min_quality_score", async () => {
  const fixture = economicFixture();
  const result = await executeCustomModelInference({
    workspaceConfig: { dataModel: { objects: [] } },
    policyRow: fixture.policyRow,
    inputPayload: { prompt: "Explain the outage remediation.", inference: { min_quality_score: 0.8, max_cost_cents: 10 } },
    fetchImpl: fixture.fetchImpl,
    runId: "run_econ_fallback",
    networkPolicy: fixture.networkPolicy,
  });
  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.equal(result.route.target, "teacher");
  assert.equal(result.qualityUnmet, undefined);
  const localAttempt = result.attempts.find((attempt) => attempt.target === "local-base");
  assert.equal(localAttempt.status, "quality_unmet");
  assert.equal(localAttempt.quality, "QUALITY_UNMET");
  const teacherReceipt = result.verificationReceipt;
  assert.equal(teacherReceipt.routing_decision.status, "applied");
  assert.equal(teacherReceipt.routing_decision.reason, "quality_fallback");
  assert.equal(teacherReceipt.routing_decision.quality, "MET");
  assert.equal(teacherReceipt.routing_decision.confidence_basis, "avg-token-logprob");
  assert.equal(result.invocations.length, 2, "the bypassed local invocation stays in evidence");
});

test("a budget-exhausted fallback returns the local result flagged QUALITY_UNMET", async () => {
  const fixture = economicFixture({ teacherCost: { inputCentsPerMTokens: 5_000_000, outputCentsPerMTokens: 5_000_000 } });
  const result = await executeCustomModelInference({
    workspaceConfig: { dataModel: { objects: [] } },
    policyRow: fixture.policyRow,
    inputPayload: { prompt: "Explain the incident timeline.", inference: { min_quality_score: 0.8, max_cost_cents: 1 } },
    fetchImpl: fixture.fetchImpl,
    runId: "run_econ_capped",
    maxTokens: 512,
    networkPolicy: fixture.networkPolicy,
  });
  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.equal(result.qualityUnmet, true);
  assert.equal(result.route.target, "local-base");
  assert.equal(result.verificationReceipt.routing_decision.quality, "QUALITY_UNMET");
  const teacherSkip = result.attempts.find((attempt) => attempt.target === "teacher" && attempt.status === "skipped");
  assert.match(teacherSkip.reason, /exceeds the remaining budget|exceeds the/);
});

test("manifest compiles, signs, verifies, and diffs honestly", () => {
  const control = {
    runtime: {
      model: { path: "/models/base.gguf", sha256: BASE_SHA },
      allowedAdapters: [{ ref: "support-v3", path: "/models/support.gguf", sha256: "d".repeat(64) }],
    },
    cache: { ttl: 900 },
    economics: { maxCostCents: 10 },
  };
  const compiled = compileInferenceManifest({ workflowId: "wf_1", integrationId: "workspace-local-model", control, maxTokens: 4096 });
  assert.equal(compiled.available, true, compiled.reason);
  assert.equal(compiled.manifest.cost_policy.max_cents, 10);
  const signed = signInferenceManifest(compiled.manifest, { env: SIGNING_ENV });
  assert.equal(signed.algorithm, "hmac-sha256");
  assert.equal(verifySignedInferenceManifest(signed, { env: SIGNING_ENV }).ok, true);
  assert.equal(verifySignedInferenceManifest({ ...signed, signature: "0".repeat(64) }, { env: SIGNING_ENV }).ok, false);

  const verified = verifyManifestAgainstIdentity(signed, { baseModelSha256: BASE_SHA, adapterSha256: "d".repeat(64), schemaHash: "", env: SIGNING_ENV });
  assert.equal(verified.status, "verified");
  const drifted = verifyManifestAgainstIdentity(signed, { baseModelSha256: "e".repeat(64), adapterSha256: "", schemaHash: "", env: SIGNING_ENV });
  assert.equal(drifted.status, "mismatch");
  assert.equal(drifted.diffs[0].field, "base_model_sha256");

  const missingSha = compileInferenceManifest({ workflowId: "wf_1", control: { runtime: { model: { path: "/models/base.gguf" } } } });
  assert.equal(missingSha.available, false, "no fabricated composite from a missing artifact hash");
});

test("gateway enforces the published manifest against the live resolved identity", async () => {
  const control = { runtime: { model: { sha256: BASE_SHA }, allowedAdapters: [] } };
  const signed = signInferenceManifest(
    compileInferenceManifest({ workflowId: "wf_live", integrationId: "int-1", control, maxTokens: 512 }).manifest,
    { env: SIGNING_ENV },
  );
  const good = await executeInferenceGateway({
    request: baseRequest("manifest-good", "Answer under the manifest."),
    defaults: { manifest: signed },
    transport: async ({ request }) => unifiedTransportResult(request, "bound answer"),
    env: SIGNING_ENV,
    now: () => 1_721_280_000_000,
  });
  assert.equal(good.ok, true, JSON.stringify(good.error));
  assert.equal(good.receipt.manifest.status, "verified");
  assert.equal(good.receipt.manifest.manifest_sha256, signed.manifest_sha256);

  const badTransport = async ({ request }) => {
    const result = unifiedTransportResult(request, "wrong bytes");
    result.identity = { ...result.identity, baseModelSha256: "f".repeat(64) };
    return result;
  };
  const bad = await executeInferenceGateway({
    request: baseRequest("manifest-bad", "Answer under the manifest, wrong pool.", {
      base_model_ref: { model_id: "base-model", base_model_sha256: "f".repeat(64) },
    }),
    defaults: { manifest: signed },
    transport: badTransport,
    env: SIGNING_ENV,
    now: () => 1_721_280_000_000,
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.receipt.manifest.status, "mismatch");
  assert.equal(bad.receipt.errors.some((error) => error.code === "manifest_composite_mismatch"), true);
});

test("publish gate blocks when the live registry drifts from the tested manifest", () => {
  const rowControl = {
    runtime: { model: { path: "/models/base.gguf", sha256: BASE_SHA }, allowedAdapters: [] },
    cache: { ttl: 900 },
  };
  const registryRow = { integrationId: "workspace-local-model", metadata: { inferenceControlPlane: rowControl } };
  const testedManifest = signInferenceManifest(
    compileInferenceManifest({ workflowId: "run_draft_test", integrationId: "workspace-local-model", control: rowControl, maxTokens: 512 }).manifest,
    { env: SIGNING_ENV },
  );
  const invocations = [{ integrationId: "workspace-local-model", inferenceManifest: testedManifest }];
  const cleanConfig = { dataModel: { objects: [{ objectType: "api-registry", rows: [registryRow] }] } };
  const cleanVerdict = verifyWorkflowManifestsAtPublish({ workspaceConfig: cleanConfig, invocations, env: SIGNING_ENV });
  assert.equal(cleanVerdict.ok, true, JSON.stringify(cleanVerdict.mismatches));
  assert.equal(cleanVerdict.manifests.length, 1);

  const driftedRow = JSON.parse(JSON.stringify(registryRow));
  driftedRow.metadata.inferenceControlPlane.runtime.model.sha256 = "9".repeat(64);
  const driftedConfig = { dataModel: { objects: [{ objectType: "api-registry", rows: [driftedRow] }] } };
  const driftedVerdict = verifyWorkflowManifestsAtPublish({ workspaceConfig: driftedConfig, invocations, env: SIGNING_ENV });
  assert.equal(driftedVerdict.ok, false);
  assert.equal(driftedVerdict.mismatches[0].integrationId, "workspace-local-model");
  assert.equal(driftedVerdict.mismatches[0].diffs.some((diff) => diff.field === "composite_sha256"), true);
});

test("redaction preview hashes are keyed — no brute-forceable plain hash of low-entropy PII", () => {
  const ssn = "123-45-6789";
  const keyedA = redactText(`SSN ${ssn}`, { previewKey: "workspace-key-a" });
  const keyedB = redactText(`SSN ${ssn}`, { previewKey: "workspace-key-b" });
  assert.equal(keyedA.events.length, 1);
  assert.notEqual(keyedA.events[0].redacted_preview_hash, sha256Hex(ssn), "an unkeyed sha256 of a 9-digit SSN is enumerable and must never be emitted");
  assert.notEqual(keyedA.events[0].redacted_preview_hash, keyedB.events[0].redacted_preview_hash, "different workspace keys yield uncorrelatable hashes");
  assert.equal(
    keyedA.events[0].redacted_preview_hash,
    redactText(`card? no: ${ssn}`, { previewKey: "workspace-key-a" }).events[0].redacted_preview_hash,
    "the same key correlates the same value within a workspace",
  );
});

test("a child receipt that closes a cycle onto its own lineage is rejected", () => {
  const selfReferential = {
    kind: "growthub-inference-verification-receipt-v1",
    receipt_id: "infr_parent_awaiting_1",
    status: "verified",
    errors: [],
  };
  const direct = ingestChildReceipt({ toolCallId: "call-1", childReceipt: selfReferential, forbiddenReceiptIds: ["infr_parent_awaiting_1"] });
  assert.equal(direct.ok, false);
  assert.equal(direct.error.code, "child_receipt_cycle");
  const indirect = ingestChildReceipt({
    toolCallId: "call-1",
    childReceipt: {
      kind: "growthub-inference-verification-receipt-v1",
      receipt_id: "infr_grandchild",
      status: "verified",
      errors: [],
      lineage: { span_kind: "CHILD_WORKFLOW", parent_receipt_id: "x", children: [{ child_receipt_id: "infr_parent_awaiting_1", child_receipt_sha256: "a".repeat(64), child_status: "COMPLETED" }], lineage_sha256: null, status: "complete" },
    },
    forbiddenReceiptIds: ["infr_parent_awaiting_1"],
  });
  assert.equal(indirect.ok, false);
  assert.equal(indirect.error.code, "child_receipt_cycle");
});

test("cache invalidation is rate-limited against stampedes", async () => {
  let nowMs = 1_721_280_000_000;
  const cache = new InferenceSemanticCache({ now: () => nowMs, maxInvalidationsPerMinute: 3 });
  for (let index = 0; index < 3; index += 1) {
    const verdict = await cache.invalidate({ reason: "SECURITY", scope: { exact_key: `key-${index}` } });
    assert.equal(verdict.ok, true);
  }
  const flooded = await cache.invalidate({ reason: "SECURITY", scope: { exact_key: "key-flood" } });
  assert.equal(flooded.ok, false);
  assert.equal(flooded.rateLimited, true);
  assert.deepEqual(flooded.poisonedExactKeys, [], "a rate-limited call mutates nothing");
  nowMs += 61_000;
  const recovered = await cache.invalidate({ reason: "SECURITY", scope: { exact_key: "key-later" } });
  assert.equal(recovered.ok, true, "the window resets after a minute");
});

test("local budget buffer ratio is governed configuration", async () => {
  const fixture = economicFixture({ teacherCost: { inputCentsPerMTokens: 0, outputCentsPerMTokens: 0 } });
  // Give the LOCAL route a real cost model and a buffer ratio that admits it
  // at 90% of budget; the default 50% buffer would have skipped it.
  fixture.policyRow.metadata.mothershipProxy.routes[0].costModel = { inputCentsPerMTokens: 1_000_000, outputCentsPerMTokens: 0 };
  fixture.policyRow.metadata.mothershipProxy.inferenceControlPlane.economics = { localBudgetBufferRatio: 0.9 };
  const admitted = await executeCustomModelInference({
    workspaceConfig: { dataModel: { objects: [] } },
    policyRow: fixture.policyRow,
    inputPayload: { prompt: "Cheap enough under a wide buffer.", inference: { max_cost_cents: 10 } },
    fetchImpl: fixture.fetchImpl,
    runId: "run_buffer_admit",
    networkPolicy: fixture.networkPolicy,
  });
  assert.equal(admitted.ok, true, JSON.stringify(admitted.error));
  assert.equal(admitted.route.target, "local-base");

  fixture.policyRow.metadata.mothershipProxy.inferenceControlPlane.economics = { localBudgetBufferRatio: 0.1 };
  const skipped = await executeCustomModelInference({
    workspaceConfig: { dataModel: { objects: [] } },
    policyRow: fixture.policyRow,
    inputPayload: { prompt: "Too costly under a tight buffer.", inference: { max_cost_cents: 10 } },
    fetchImpl: fixture.fetchImpl,
    runId: "run_buffer_skip",
    networkPolicy: fixture.networkPolicy,
  });
  const localSkip = skipped.attempts.find((attempt) => attempt.target === "local-base" && attempt.status === "skipped");
  assert.ok(localSkip, "a tight governed buffer skips the local route");
  assert.match(localSkip.reason, /buffered local budget/);
});

test("invalidation budgets are per reason — a feedback flood cannot starve SECURITY", async () => {
  let nowMs = 1_721_280_000_000;
  const cache = new InferenceSemanticCache({ now: () => nowMs, maxInvalidationsPerMinute: 2 });
  // Exhaust the FEEDBACK_CORRECTION lane completely.
  for (let index = 0; index < 2; index += 1) {
    assert.equal((await cache.invalidate({ reason: "FEEDBACK_CORRECTION", scope: { exact_key: `fb-${index}` } })).ok, true);
  }
  const floodedFeedback = await cache.invalidate({ reason: "FEEDBACK_CORRECTION", scope: { exact_key: "fb-flood" } });
  assert.equal(floodedFeedback.rateLimited, true);
  // SECURITY still lands in the same window: its lane is untouched.
  const security = await cache.invalidate({ reason: "SECURITY", scope: { exact_key: "sec-urgent" } });
  assert.equal(security.ok, true, "a feedback flood must never delay a security invalidation");
  assert.deepEqual(security.poisonedExactKeys, ["sec-urgent"]);
});

test("transitive cycle detection catches loops the per-continuation guard cannot see", () => {
  // Mutual edges recorded by two concurrent continuations: A lists B as its
  // child while B lists A. Each local ingestion check passed; the global DFS
  // over the recorded edge set still refuses the graph.
  const mutual = detectLineageCycle([
    { receipt_id: "infr_A", parent_receipt_id: null, children: [{ child_receipt_id: "infr_B" }] },
    { receipt_id: "infr_B", parent_receipt_id: null, children: [{ child_receipt_id: "infr_A" }] },
  ]);
  assert.equal(mutual.ok, false);
  assert.ok(mutual.cyclePath.includes("infr_A") && mutual.cyclePath.includes("infr_B"));
  // Multi-hop loop through undeclared span linkage: A -> B -> C -> A.
  const deep = detectLineageCycle([
    { receipt_id: "infr_A", children: [{ child_receipt_id: "infr_B" }] },
    { receipt_id: "infr_B", children: [{ child_receipt_id: "infr_C" }] },
    { receipt_id: "infr_C", children: [{ child_receipt_id: "infr_A" }] },
  ]);
  assert.equal(deep.ok, false);
  // A clean chain plus a diamond (two parents, one child) stays acyclic.
  const clean = detectLineageCycle([
    { receipt_id: "infr_root", children: [{ child_receipt_id: "infr_L" }, { child_receipt_id: "infr_R" }] },
    { receipt_id: "infr_L", parent_receipt_id: "infr_root", children: [{ child_receipt_id: "infr_join" }] },
    { receipt_id: "infr_R", parent_receipt_id: "infr_root", children: [{ child_receipt_id: "infr_join" }] },
  ]);
  assert.equal(clean.ok, true);
});

test("workflow ancestry travels to ingestion depth and the assembled DAG is verified acyclic", async () => {
  const fixture = economicFixture({ lowConfidence: false });
  const result = await executeCustomModelWorkflow({
    workspaceConfig: { dataModel: { objects: [] } },
    policyRow: fixture.policyRow,
    inputPayload: { prompt: "Verify the assembled DAG." },
    fetchImpl: fixture.fetchImpl,
    runId: "run_dag_acyclic",
    workflowVariant: "agentic",
    networkPolicy: fixture.networkPolicy,
  });
  assert.equal(result.ok, true, JSON.stringify(result.error || result.attempts));
  assert.equal(result.receiptDag.acyclic, true, "the assembled workflow DAG carries a global cycle verdict");
  // Ingestion-depth ancestry: a grandchild receipt looping onto the chain's
  // ROOT (not just the immediate parent) is refused.
  const rootId = result.receiptDag.edges[0].receipt_id;
  const looping = ingestChildReceipt({
    toolCallId: "call-loop",
    childReceipt: { kind: "growthub-inference-verification-receipt-v1", receipt_id: rootId, status: "verified", errors: [] },
    forbiddenReceiptIds: [rootId, result.receiptDag.edges[1].receipt_id],
  });
  assert.equal(looping.ok, false);
  assert.equal(looping.error.code, "child_receipt_cycle");
});

test("redaction receipts record the preview key tier, and rotation is visible", async () => {
  const withWorkspaceKey = redactText("SSN 123-45-6789", { previewKey: resolveKeyFor({ GROWTHUB_WORKSPACE_SIGNING_KEY: "ws-key-1" }) });
  assert.equal(withWorkspaceKey.keyInfo.source, "workspace");
  const rotated = redactText("SSN 123-45-6789", { previewKey: resolveKeyFor({ GROWTHUB_WORKSPACE_SIGNING_KEY: "ws-key-2" }) });
  assert.notEqual(withWorkspaceKey.keyInfo.keyId, rotated.keyInfo.keyId, "rotation changes the recorded fingerprint");
  assert.notEqual(
    withWorkspaceKey.events[0].redacted_preview_hash,
    rotated.events[0].redacted_preview_hash,
    "old previews stop correlating after rotation — visible via the key id, never silent",
  );
  const ephemeral = redactText("SSN 123-45-6789", { previewKey: resolveKeyFor({}) });
  assert.equal(ephemeral.keyInfo.source, "process-ephemeral");

  // End-to-end: the gateway stamps the tier into the receipt evidence.
  const cache = new InferenceSemanticCache({ now: () => 1_721_280_000_000 });
  const result = await executeInferenceGateway({
    request: baseRequest("redaction-key-evidence", "SSN 123-45-6789 in output."),
    defaults: { redaction: { enabled: true } },
    transport: async ({ request }) => unifiedTransportResult(request, "The SSN is 123-45-6789."),
    cache,
    env: { GROWTHUB_WORKSPACE_SIGNING_KEY: "ws-key-evidence" },
    now: () => 1_721_280_000_000,
  });
  assert.equal(result.receipt.redaction.preview_key_source, "workspace");
  assert.match(result.receipt.redaction.preview_key_id, /^[0-9a-f]{16}$/);
  assert.doesNotMatch(JSON.stringify(result.receipt.redaction), /ws-key-evidence/, "the key itself never enters the receipt");
});

test("feedback poisoning rejects forged receipts and enforces server-side resolution", async () => {
  const cache = new InferenceSemanticCache({ now: () => 1_721_280_000_000 });
  const forged = await poisonCacheFromFeedback(cache, {
    originalReceipt: { kind: "not-a-receipt", cache: { cache_key: "victim-key", semantic_bucket: "free-form-bucket-injection" } },
    correctionReceiptId: "attacker",
  });
  assert.equal(forged.ok, false);
  assert.match(forged.reason, /server-resolved/);
  // A resolver-backed call discards the caller-shaped object entirely.
  const persisted = {
    kind: "growthub-inference-verification-receipt-v1",
    receipt_id: "infr_real",
    cache: { cache_key: "real-key", semantic_bucket: `${"a".repeat(64)}:${"b".repeat(64)}` },
  };
  const resolved = await poisonCacheFromFeedback(cache, {
    originalReceipt: { receipt_id: "infr_real", kind: "growthub-inference-verification-receipt-v1", cache: { cache_key: "attacker-key" } },
    correctionReceiptId: "corr-1",
    receiptResolver: async (id) => (id === "infr_real" ? persisted : null),
  });
  assert.equal(resolved.ok, true);
  assert.deepEqual(resolved.poisonedExactKeys, ["real-key"], "the resolver's receipt wins; the caller-shaped key is ignored");
  // An invalid free-form bucket never becomes a poison marker target.
  const badBucket = await poisonCacheFromFeedback(cache, {
    originalReceipt: { ...persisted, cache: { ...persisted.cache, cache_key: "k2", semantic_bucket: "../../other-tenant" } },
    correctionReceiptId: "corr-2",
    correctedText: "truth",
  });
  assert.equal(badBucket.ok, true);
  assert.equal(badBucket.poisonMarkersAdded, 0, "a malformed bucket is dropped, not poisoned");
});

test("malformed budget-buffer config never tightens the buffer silently", async () => {
  // Adversarial config inputs: each must fall back to the 0.5 default (or
  // clamp sanely), never crash, and never collapse to the tightest buffer.
  for (const malformed of [null, "garbage", Number.NaN, 0, -3, {}]) {
    const fixture = economicFixture({ teacherCost: { inputCentsPerMTokens: 0, outputCentsPerMTokens: 0 } });
    fixture.policyRow.metadata.mothershipProxy.routes[0].costModel = { inputCentsPerMTokens: 1_000_000, outputCentsPerMTokens: 0 };
    fixture.policyRow.metadata.mothershipProxy.inferenceControlPlane.economics = { localBudgetBufferRatio: malformed };
    // Local estimate ≈ a few cents against max 10¢: admitted under the 0.5
    // default (cap 5¢), which a silent 0.1 collapse (cap 1¢) would skip.
    const result = await executeCustomModelInference({
      workspaceConfig: { dataModel: { objects: [] } },
      policyRow: fixture.policyRow,
      inputPayload: { prompt: "buffer probe", inference: { max_cost_cents: 10 } },
      fetchImpl: fixture.fetchImpl,
      runId: `run_buffer_malformed_${String(malformed)}`,
      networkPolicy: fixture.networkPolicy,
    });
    assert.equal(result.ok, true, `${String(malformed)} must not crash or over-tighten: ${JSON.stringify(result.error || result.attempts)}`);
    assert.equal(result.route.target, "local-base", `${String(malformed)} must fall back to the 0.5 default buffer`);
  }
});

test("multi-step workflow chains a Merkle receipt DAG across its steps", async () => {
  const fixture = economicFixture({ lowConfidence: false });
  const result = await executeCustomModelWorkflow({
    workspaceConfig: { dataModel: { objects: [] } },
    policyRow: fixture.policyRow,
    inputPayload: { prompt: "Ship the evidentiary backbone." },
    fetchImpl: fixture.fetchImpl,
    runId: "run_dag_workflow",
    workflowVariant: "agentic",
    networkPolicy: fixture.networkPolicy,
  });
  assert.equal(result.ok, true, JSON.stringify(result.error || result.attempts));
  assert.equal(result.receiptDag.schema, "growthub-receipt-dag-v1");
  assert.equal(result.receiptDag.edges.length, 3);
  const [plan, critique, final] = result.receiptDag.edges;
  assert.equal(plan.span_kind, "ROOT");
  assert.equal(plan.parent_receipt_id, null);
  assert.equal(critique.span_kind, "CHILD_WORKFLOW");
  assert.equal(critique.parent_receipt_id, plan.receipt_id);
  assert.equal(final.parent_receipt_id, critique.receipt_id);
  for (const edge of result.receiptDag.edges) assert.match(edge.receipt_sha256, /^[0-9a-f]{64}$/);
  assert.match(result.receiptDag.dag_sha256, /^[0-9a-f]{64}$/);
  const invocationReceipts = result.invocations.map((invocation) => invocation.verificationReceipt);
  assert.deepEqual(
    result.receiptDag.edges.map((edge) => edge.receipt_sha256),
    invocationReceipts.map((receipt) => receiptSha256(receipt)),
    "DAG edges hash the exact persisted receipts",
  );
});

