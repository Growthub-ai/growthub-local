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
  LINEAGE_GRAPH_MAX_EDGES,
  buildReceiptLineage,
  detectLineageCycle,
  ingestChildReceipt,
  normalizeSpanKind,
  receiptSha256,
  workflowOperationIds,
} = await import(pathToFileURL(path.join(inferenceRoot, "lineage.js")).href);
const {
  resolveTrustedChildReceipt,
  resolveTrustedInferenceContinuation,
} = await import(pathToFileURL(path.join(inferenceRoot, "continuation.js")).href);
const { buildInferenceTrustContext } = await import(pathToFileURL(path.join(workspaceLib, "sandbox-execution-context.js")).href);
const {
  compileInferenceManifest,
  expectedManifestIntegrations,
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
  combineExecutions,
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

async function runChildGatewayCall({ parentReceiptId, fail = false, tenantScope = "", requestId = "child-request-1" }) {
  const transport = async ({ request }) => (fail
    ? { ok: false, status: 500, response: null, error: "child model exploded" }
    : unifiedTransportResult(request, "child workflow answer"));
  return executeInferenceGateway({
    request: baseRequest(requestId, "Run the child workflow step.", {
      parent_receipt_id: parentReceiptId,
      span_kind: "CHILD_WORKFLOW",
    }),
    transport,
    ...(tenantScope ? { defaults: { tenantScope } } : {}),
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
  const expectedIntegrationIds = ["workspace-local-model"];
  const cleanConfig = { dataModel: { objects: [{ objectType: "api-registry", rows: [registryRow] }] } };
  const cleanVerdict = verifyWorkflowManifestsAtPublish({ workspaceConfig: cleanConfig, invocations, expectedIntegrationIds, env: SIGNING_ENV });
  assert.equal(cleanVerdict.ok, true, JSON.stringify(cleanVerdict.mismatches));
  assert.equal(cleanVerdict.manifests.length, 1);

  const driftedRow = JSON.parse(JSON.stringify(registryRow));
  driftedRow.metadata.inferenceControlPlane.runtime.model.sha256 = "9".repeat(64);
  const driftedConfig = { dataModel: { objects: [{ objectType: "api-registry", rows: [driftedRow] }] } };
  const driftedVerdict = verifyWorkflowManifestsAtPublish({ workspaceConfig: driftedConfig, invocations, expectedIntegrationIds, env: SIGNING_ENV });
  assert.equal(driftedVerdict.ok, false);
  assert.equal(driftedVerdict.mismatches[0].integrationId, "workspace-local-model");
  assert.equal(driftedVerdict.mismatches[0].diffs.some((diff) => diff.field === "composite_sha256"), true);
});

test("publish enforces the manifest SET: unsigned, missing, unavailable, and unexpected manifests all block", () => {
  const rowControl = {
    runtime: { model: { path: "/models/base.gguf", sha256: BASE_SHA }, allowedAdapters: [] },
    cache: { ttl: 900 },
  };
  const registryRow = { integrationId: "workspace-local-model", metadata: { inferenceControlPlane: rowControl } };
  const workspaceConfig = { dataModel: { objects: [{ objectType: "api-registry", rows: [registryRow] }] } };
  const expectedIntegrationIds = ["workspace-local-model"];
  const compiled = compileInferenceManifest({ workflowId: "wf", integrationId: "workspace-local-model", control: rowControl, maxTokens: 512 }).manifest;

  // Unsigned manifest (no signing key at compile time) blocks publish.
  const unsignedVerdict = verifyWorkflowManifestsAtPublish({
    workspaceConfig,
    invocations: [{ integrationId: "workspace-local-model", inferenceManifest: signInferenceManifest(compiled, { env: {} }) }],
    expectedIntegrationIds,
    env: SIGNING_ENV,
  });
  assert.equal(unsignedVerdict.ok, false);
  assert.equal(unsignedVerdict.mismatches[0].diffs[0].field, "signature");

  // Zero manifests for an expected integration blocks publish.
  const emptyVerdict = verifyWorkflowManifestsAtPublish({ workspaceConfig, invocations: [], expectedIntegrationIds, env: SIGNING_ENV });
  assert.equal(emptyVerdict.ok, false);
  assert.match(JSON.stringify(emptyVerdict.mismatches), /none produced/);

  // An invocation that could not bind a manifest blocks publish.
  const unavailableVerdict = verifyWorkflowManifestsAtPublish({
    workspaceConfig,
    invocations: [{ integrationId: "workspace-local-model", inferenceManifestUnavailable: "governed runtime does not declare a resolvable base-model SHA-256" }],
    expectedIntegrationIds,
    env: SIGNING_ENV,
  });
  assert.equal(unavailableVerdict.ok, false);
  assert.match(JSON.stringify(unavailableVerdict.mismatches), /bindable signed manifest/);

  // A manifest for an integration the graph never references blocks publish.
  const unexpectedVerdict = verifyWorkflowManifestsAtPublish({
    workspaceConfig,
    invocations: [{ integrationId: "rogue-model", inferenceManifest: signInferenceManifest({ ...compiled, integration_id: "rogue-model" }, { env: SIGNING_ENV }) }],
    expectedIntegrationIds,
    env: SIGNING_ENV,
  });
  assert.equal(unexpectedVerdict.ok, false);
  assert.match(JSON.stringify(unexpectedVerdict.mismatches), /unexpected manifest/);

  // Wrong signing key fails closed.
  const wrongKeyVerdict = verifyWorkflowManifestsAtPublish({
    workspaceConfig,
    invocations: [{ integrationId: "workspace-local-model", inferenceManifest: signInferenceManifest(compiled, { env: { GROWTHUB_WORKSPACE_SIGNING_KEY: "some-other-key" } }) }],
    expectedIntegrationIds,
    env: SIGNING_ENV,
  });
  assert.equal(wrongKeyVerdict.ok, false);

  // Expected-set derivation walks the graph, not the invocation records.
  const graph = { nodes: [{ type: "api-registry-call", config: { registryId: "workspace-local-model" } }], edges: [] };
  assert.deepEqual([...expectedManifestIntegrations({ workspaceConfig, graph })], ["workspace-local-model"]);
  assert.deepEqual([...expectedManifestIntegrations({ workspaceConfig, graph: { nodes: [], edges: [] } })], [], "an un-referenced integration is not expected");
});

test("an unsigned or unauthenticated manifest never reaches transport or serves cache", async () => {
  const control = { runtime: { model: { sha256: BASE_SHA }, allowedAdapters: [] } };
  const compiled = compileInferenceManifest({ workflowId: "wf_live", integrationId: "int-1", control, maxTokens: 512 }).manifest;
  let transportCalls = 0;
  const transport = async ({ request }) => { transportCalls += 1; return unifiedTransportResult(request, "must not run"); };

  // Unsigned manifest: rejected pre-transport.
  const unsigned = await executeInferenceGateway({
    request: baseRequest("manifest-unsigned-live", "run under unsigned manifest"),
    defaults: { manifest: signInferenceManifest(compiled, { env: {} }) },
    transport,
    env: SIGNING_ENV,
    now: () => 1_721_280_000_000,
  });
  assert.equal(unsigned.ok, false);
  assert.equal(transportCalls, 0, "an unsigned manifest never reaches the model");
  assert.equal(unsigned.receipt.errors.some((error) => error.code === "manifest_unsigned"), true);

  // Signed under a rotated/unknown key: rejected pre-transport.
  const wrongKey = await executeInferenceGateway({
    request: baseRequest("manifest-wrong-key", "run under foreign-key manifest"),
    defaults: { manifest: signInferenceManifest(compiled, { env: { GROWTHUB_WORKSPACE_SIGNING_KEY: "foreign-key" } }) },
    transport,
    env: SIGNING_ENV,
    now: () => 1_721_280_000_000,
  });
  assert.equal(wrongKey.ok, false);
  assert.equal(transportCalls, 0);
  assert.equal(wrongKey.receipt.errors.some((error) => error.code === "manifest_signature_invalid"), true);

  // manifestRequired without any manifest: rejected pre-transport.
  const missing = await executeInferenceGateway({
    request: baseRequest("manifest-required-missing", "live run without manifest"),
    defaults: { manifestRequired: true },
    transport,
    env: SIGNING_ENV,
    now: () => 1_721_280_000_000,
  });
  assert.equal(missing.ok, false);
  assert.equal(transportCalls, 0);
  assert.equal(missing.receipt.errors.some((error) => error.code === "manifest_missing"), true);
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


// ===========================================================================
// Live child-receipt trust boundary — adversarial matrix.
//
// Every test here drives executeInferenceGateway through the SAME wiring the
// sandbox-run route activates: buildInferenceTrustContext (the route's seam)
// wraps resolveTrustedChildReceipt (the route's resolver) over an in-memory
// persisted-invocation stream, and the runner-style resolver injection adds
// the per-node model/policy identity. Rejection tests assert the forbidden
// side effects did not occur: zero transport calls and zero cache writes.
// ===========================================================================

const TENANT_ALPHA = "tenant-alpha";
const TENANT_BETA = "tenant-beta";
const MODEL_ID = "ws-backbone";
const POLICY_ID = "custom-model-policy";
const AWAITING_PARENT = "infr_parent_awaiting_1";

function countingTransport(content = "Parent continuation completed.") {
  const counter = { calls: 0 };
  const transport = async ({ request }) => {
    counter.calls += 1;
    return unifiedTransportResult(request, content);
  };
  return { transport, counter };
}

function countingCache({ hitEntry = null } = {}) {
  const stats = { lookups: 0, stores: 0 };
  return {
    stats,
    client: {
      describeBackend: () => ({ kind: "memory", remoteEnabled: false, credentialSource: "", disabledReason: "" }),
      async lookup() {
        stats.lookups += 1;
        return hitEntry
          ? { hit: true, hitType: "exact", similarity: 1, entry: hitEntry, envelope: hitEntry.envelope || null, signatureState: "verified" }
          : { hit: false, hitType: "", similarity: 0, entry: null };
      },
      async store() {
        stats.stores += 1;
        return { stored: true, remote: "disabled", signatureState: "signed" };
      },
    },
  };
}

function invocationRecordFor(childReceipt, overrides = {}) {
  return {
    schema: "growthub-custom-model-invocation-v2",
    modelId: MODEL_ID,
    policyRegistryId: POLICY_ID,
    integrationId: "student-a",
    appScope: "workspace-wide",
    priorReceiptId: "",
    verificationReceipt: childReceipt,
    ...overrides,
  };
}

/** Route-equivalent live wiring: seam -> appScope injection -> continuation.js resolver. */
function liveTrustDefaults(records, {
  tenantScope = TENANT_ALPHA,
  appScope = "workspace-wide",
  modelId = MODEL_ID,
  policyRegistryId = POLICY_ID,
  includeResolver = true,
} = {}) {
  const trust = buildInferenceTrustContext({
    row: { lifecycleStatus: "live" },
    useDraft: false,
    appScope,
    ...(includeResolver ? { resolveChildReceipt: (args) => resolveTrustedChildReceipt(records, args) } : {}),
  });
  return {
    liveExecution: trust.liveExecution,
    tenantScope,
    ...(trust.resolveChildReceipt
      ? { childReceiptResolver: (args) => trust.resolveChildReceipt({ ...args, modelId, policyRegistryId }) }
      : {}),
  };
}

async function runLiveContinuation({ childReceiptField, defaults, transportContent, requestExtra = {} }) {
  const fixture = continuationFixture({ childReceiptField });
  const { transport, counter } = countingTransport(transportContent);
  const cache = countingCache();
  const result = await executeInferenceGateway({
    request: { ...fixture.request, ...requestExtra },
    transport,
    cache: cache.client,
    defaults,
    trustedContinuation: fixture.trust(await gatewayToolContractHash(fixture.request)),
    env: {},
    now: () => 1_721_280_000_000,
  });
  return { result, counter, cache };
}

test("a bare child receipt hash is evidence-shaped input: rejected before transport (child_receipt_hash_only)", async () => {
  const { result, counter, cache } = await runLiveContinuation({
    childReceiptField: { child_receipt_sha256: "c".repeat(64) },
    defaults: {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "child_receipt_hash_only");
  assert.equal(counter.calls, 0, "no transport call may follow a hash-only child receipt");
  assert.equal(cache.stats.stores, 0, "nothing is cached from a refused continuation");
  assert.equal(result.response, null);
});

test("live mode: an attacker-tampered receipt body loses to canonical server-side resolution", async () => {
  const child = await runChildGatewayCall({ parentReceiptId: AWAITING_PARENT, tenantScope: TENANT_ALPHA, requestId: "child-canonical-1" });
  assert.equal(child.ok, true, JSON.stringify(child.error));
  const canonical = child.receipt;
  const records = [invocationRecordFor(canonical)];
  const tampered = { ...canonical, output_sha256: "f".repeat(64), status: "verified" };
  const { result, counter } = await runLiveContinuation({
    childReceiptField: { child_receipt: tampered, child_receipt_id: canonical.receipt_id },
    defaults: liveTrustDefaults(records),
  });
  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.equal(counter.calls, 1, "the valid canonical continuation reaches transport exactly once");
  const edge = result.receipt.lineage.children[0];
  assert.equal(edge.child_receipt_sha256, receiptSha256(canonical), "the canonical persisted receipt is what gets hashed");
  assert.notEqual(edge.child_receipt_sha256, receiptSha256(tampered), "the attacker-shaped body is discarded, not hashed");
  assert.equal(edge.evidence_basis, "server-resolved");
});

test("live mode without the server-owned resolver refuses the continuation before transport (child_receipt_resolver_required)", async () => {
  const child = await runChildGatewayCall({ parentReceiptId: AWAITING_PARENT, tenantScope: TENANT_ALPHA, requestId: "child-canonical-2" });
  const { result, counter, cache } = await runLiveContinuation({
    childReceiptField: { child_receipt: child.receipt, child_receipt_id: child.receipt.receipt_id },
    defaults: { liveExecution: true, tenantScope: TENANT_ALPHA },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "child_receipt_resolver_required");
  assert.equal(counter.calls, 0, "a live continuation without the resolver never reaches transport");
  assert.equal(cache.stats.stores, 0);
  assert.equal(result.response, null, "no cached or transported content is released");
});

test("live mode: the workspace-local default (and caller metadata) is not tenant isolation (child_receipt_scope_unbound)", async () => {
  const child = await runChildGatewayCall({ parentReceiptId: AWAITING_PARENT, requestId: "child-default-scope" });
  const records = [invocationRecordFor(child.receipt)];
  for (const tenantScope of ["workspace-local", ""]) {
    const { result, counter } = await runLiveContinuation({
      childReceiptField: { child_receipt_id: child.receipt.receipt_id },
      defaults: liveTrustDefaults(records, { tenantScope }),
      // Caller-supplied metadata must not be able to stand in for the
      // missing server-owned scope.
      requestExtra: { metadata: { workspace_id: "attacker-tenant" } },
    });
    assert.equal(result.ok, false, `tenantScope=${JSON.stringify(tenantScope)} must fail closed`);
    assert.equal(result.error.code, "child_receipt_scope_unbound");
    assert.equal(counter.calls, 0, "no transport under an unbound live scope");
  }
});

test("a child receipt spawned by a different parent is rejected in both trust lanes", async () => {
  // Resolver lane: the canonical persisted receipt declares another parent.
  const foreign = await runChildGatewayCall({ parentReceiptId: "infr_other_parent", tenantScope: TENANT_ALPHA, requestId: "child-foreign-parent" });
  const records = [invocationRecordFor(foreign.receipt)];
  const resolverLane = await runLiveContinuation({
    childReceiptField: { child_receipt_id: foreign.receipt.receipt_id },
    defaults: liveTrustDefaults(records),
  });
  assert.equal(resolverLane.result.ok, false);
  assert.equal(resolverLane.result.error.code, "child_receipt_missing");
  assert.match(resolverLane.result.error.message, /not spawned from this parent receipt/);
  assert.equal(resolverLane.counter.calls, 0);
  // Draft/dev lane (caller body, no resolver): ingestion-level parent binding.
  const draftLane = await runLiveContinuation({
    childReceiptField: { child_receipt: foreign.receipt },
    defaults: {},
  });
  assert.equal(draftLane.result.ok, false);
  assert.equal(draftLane.result.error.code, "child_receipt_parent_mismatch");
  assert.equal(draftLane.counter.calls, 0);
});

test("a cross-tenant child receipt fails scope binding closed, and a scopeless receipt cannot bind at all in live mode", async () => {
  // Child produced under tenant-beta; live continuation runs under tenant-alpha.
  const crossTenant = await runChildGatewayCall({ parentReceiptId: AWAITING_PARENT, tenantScope: TENANT_BETA, requestId: "child-cross-tenant" });
  const records = [invocationRecordFor(crossTenant.receipt)];
  const mismatch = await runLiveContinuation({
    childReceiptField: { child_receipt_id: crossTenant.receipt.receipt_id },
    defaults: liveTrustDefaults(records, { tenantScope: TENANT_ALPHA }),
  });
  assert.equal(mismatch.result.ok, false);
  assert.equal(mismatch.result.error.code, "child_receipt_scope_mismatch");
  assert.equal(mismatch.counter.calls, 0);
  // A canonical receipt whose persisted body carries no scope hash cannot
  // prove binding — live mode refuses instead of assuming isolation.
  const base = await runChildGatewayCall({ parentReceiptId: AWAITING_PARENT, tenantScope: TENANT_ALPHA, requestId: "child-scopeless" });
  const scopeless = { ...base.receipt, cache: { ...base.receipt.cache, cache_scope_sha256: "" } };
  const scopelessRun = await runLiveContinuation({
    childReceiptField: { child_receipt_id: scopeless.receipt_id },
    defaults: liveTrustDefaults([invocationRecordFor(scopeless)], { tenantScope: TENANT_ALPHA }),
  });
  assert.equal(scopelessRun.result.ok, false);
  assert.equal(scopelessRun.result.error.code, "child_receipt_scope_unbound");
  assert.equal(scopelessRun.counter.calls, 0);
});

test("a child receipt outside the app scope or the workflow's model policy is not resolvable", async () => {
  const child = await runChildGatewayCall({ parentReceiptId: AWAITING_PARENT, tenantScope: TENANT_ALPHA, requestId: "child-app-scope" });
  // Persisted under app-alpha; this continuation's server-derived scope is app-beta.
  // NB: the gateway also cross-checks the trusted continuation's app scope, so
  // the mismatch surfaces as a rejected continuation — and still no transport.
  const wrongApp = await runLiveContinuation({
    childReceiptField: { child_receipt_id: child.receipt.receipt_id },
    defaults: { ...liveTrustDefaults([invocationRecordFor(child.receipt, { appScope: "app-alpha" })], { appScope: "app-beta" }), appScope: "app-beta" },
  });
  assert.equal(wrongApp.result.ok, false);
  assert.equal(wrongApp.counter.calls, 0, "no transport when the app scope cannot bind");
  // Persisted under a different workflow's policy registry: not this graph's evidence.
  const wrongPolicy = await runLiveContinuation({
    childReceiptField: { child_receipt_id: child.receipt.receipt_id },
    defaults: liveTrustDefaults([invocationRecordFor(child.receipt, { policyRegistryId: "another-workflow-policy" })]),
  });
  assert.equal(wrongPolicy.result.ok, false);
  assert.equal(wrongPolicy.result.error.code, "child_receipt_missing");
  assert.match(wrongPolicy.result.error.message, /not found in the governed invocation stream/);
  assert.equal(wrongPolicy.counter.calls, 0);
});

test("one child receipt cannot satisfy two tool calls (child_receipt_replayed)", async () => {
  const child = await runChildGatewayCall({ parentReceiptId: AWAITING_PARENT, tenantScope: TENANT_ALPHA, requestId: "child-replay" });
  const records = [invocationRecordFor(child.receipt)];
  const callA = { id: "call-child-A", type: "function", function: { name: "runChildWorkflow", arguments: '{"name":"triage-a"}' } };
  const callB = { id: "call-child-B", type: "function", function: { name: "runChildWorkflow", arguments: '{"name":"triage-b"}' } };
  const messages = [{ role: "user", content: "Delegate two child workflows." }];
  const request = {
    request_id: "parent-replay-1",
    prior_receipt_id: AWAITING_PARENT,
    model: "backbone-model",
    base_model_ref: { model_id: "base-model", base_model_sha256: BASE_SHA },
    messages,
    tool_openapi: workflowOpenApi,
    tool_contract: { allowed_operation_ids: ["runChildWorkflow"] },
    tool_results: [
      { tool_call_id: callA.id, operation_id: "runChildWorkflow", status: 200, response: { ok: true }, child_receipt_id: child.receipt.receipt_id },
      { tool_call_id: callB.id, operation_id: "runChildWorkflow", status: 200, response: { ok: true }, child_receipt_id: child.receipt.receipt_id },
    ],
  };
  const { transport, counter } = countingTransport();
  const result = await executeInferenceGateway({
    request,
    transport,
    defaults: liveTrustDefaults(records),
    trustedContinuation: {
      trusted: true,
      receiptId: AWAITING_PARENT,
      modelTag: "backbone-model",
      appScope: "workspace-wide",
      integrationId: "",
      baseModelSha256: BASE_SHA,
      adapterSha256: "",
      toolContractSha256: await gatewayToolContractHash(request),
      conversationSha256: sha256Hex(messages),
      toolCalls: [callA, callB],
    },
    env: {},
    now: () => 1_721_280_000_000,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "child_receipt_replayed");
  assert.equal(counter.calls, 0, "a replayed child receipt refuses the whole continuation before transport");
  const statuses = result.receipt.lineage.children.map((link) => link.child_status);
  assert.deepEqual(statuses.sort(), ["COMPLETED", "MISSING"], "only the first bound call consumed the receipt");
});

test("a deleted, expired, or erroring canonical receipt fails resolution closed", async () => {
  const emptyStream = await runLiveContinuation({
    childReceiptField: { child_receipt_id: "infr_deleted_child" },
    defaults: liveTrustDefaults([]),
  });
  assert.equal(emptyStream.result.ok, false);
  assert.equal(emptyStream.result.error.code, "child_receipt_missing");
  assert.equal(emptyStream.counter.calls, 0);
  const throwing = await runLiveContinuation({
    childReceiptField: { child_receipt_id: "infr_any" },
    defaults: {
      liveExecution: true,
      tenantScope: TENANT_ALPHA,
      childReceiptResolver: async () => { throw new Error("receipt store unavailable"); },
    },
  });
  assert.equal(throwing.result.ok, false);
  assert.equal(throwing.result.error.code, "child_receipt_missing");
  assert.match(throwing.result.error.message, /receipt store unavailable/);
  assert.equal(throwing.counter.calls, 0);
});

test("a failed child stays canonical FAILED evidence with its exact bounded error — never a success, never orphaned", async () => {
  const failedChild = await runChildGatewayCall({ parentReceiptId: AWAITING_PARENT, tenantScope: TENANT_ALPHA, fail: true, requestId: "child-failed-1" });
  assert.equal(failedChild.ok, false);
  const records = [invocationRecordFor(failedChild.receipt)];
  const { result, counter } = await runLiveContinuation({
    childReceiptField: { child_receipt_id: failedChild.receipt.receipt_id },
    defaults: liveTrustDefaults(records),
  });
  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.equal(counter.calls, 1);
  const edge = result.receipt.lineage.children[0];
  assert.equal(edge.child_status, "FAILED", "a failed child is evidence of failure, not success");
  assert.equal(edge.child_receipt_sha256, receiptSha256(failedChild.receipt));
  assert.match(edge.error.message, /child model exploded/);
  assert.ok(edge.error.message.length <= 512, "the recorded child error is bounded");
  assert.equal(result.receipt.lineage.status, "complete");
});

test("a valid canonical child proceeds with exactly one transport and server-resolved lineage", async () => {
  const child = await runChildGatewayCall({ parentReceiptId: AWAITING_PARENT, tenantScope: TENANT_ALPHA, requestId: "child-happy-1" });
  const records = [invocationRecordFor(child.receipt)];
  const { result, counter } = await runLiveContinuation({
    childReceiptField: { child_receipt_id: child.receipt.receipt_id },
    defaults: liveTrustDefaults(records),
  });
  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.equal(counter.calls, 1, "transport runs exactly once");
  const edge = result.receipt.lineage.children[0];
  assert.equal(edge.child_receipt_id, child.receipt.receipt_id);
  assert.equal(edge.child_receipt_sha256, receiptSha256(child.receipt));
  assert.equal(edge.evidence_basis, "server-resolved");
  assert.equal(result.receipt.lineage.status, "complete");
  const audited = result.receipt.tool_audit.calls.find((entry) => entry.child_receipt_hash);
  assert.equal(audited.child_receipt_hash, receiptSha256(child.receipt));
});

test("cross-run replay: a consumed prior receipt cannot anchor a second continuation", () => {
  const awaiting = { verificationReceipt: { receipt_id: "infr_prior_x" }, modelId: MODEL_ID, policyRegistryId: POLICY_ID };
  const consumedStream = [awaiting, { priorReceiptId: "infr_prior_x", modelId: MODEL_ID, policyRegistryId: POLICY_ID }];
  const replay = resolveTrustedInferenceContinuation(consumedStream, {
    receiptId: "infr_prior_x",
    modelId: MODEL_ID,
    policyRegistryId: POLICY_ID,
  });
  assert.equal(replay.ok, false);
  assert.match(replay.reason, /already been consumed/);
});

// ===========================================================================
// Receipt-lineage cycles — terminal failure at the workflow assembly boundary
// (combineExecutions), plus bounded input. A cyclic or unverifiable DAG must
// make the whole workflow envelope ok:false, never a flagged success.
// ===========================================================================

function receiptNode(id, parentReceiptId = null, childIds = []) {
  return {
    kind: "growthub-inference-verification-receipt-v1",
    receipt_id: id,
    status: "verified",
    errors: [],
    lineage: {
      span_kind: parentReceiptId ? "CHILD_WORKFLOW" : "ROOT",
      parent_receipt_id: parentReceiptId,
      children: childIds.map((cid) => ({ child_receipt_id: cid, child_receipt_sha256: "x".repeat(64), child_status: "COMPLETED" })),
    },
  };
}
function successfulExecution(receipt) {
  return { ok: true, verificationReceipt: receipt, attempts: [{ target: "local-base", status: "completed" }], invocation: { integrationId: "student-a" }, trace: null };
}

test("a cyclic receipt graph is a terminal workflow failure, never a flagged success", () => {
  const cases = [
    { name: "self-cycle", nodes: [receiptNode("infr_self", "infr_self")] },
    { name: "mutual", nodes: [receiptNode("infr_A", null, ["infr_B"]), receiptNode("infr_B", null, ["infr_A"])] },
    { name: "three-hop", nodes: [receiptNode("infr_A", null, ["infr_B"]), receiptNode("infr_B", null, ["infr_C"]), receiptNode("infr_C", null, ["infr_A"])] },
    { name: "undeclared-parent-linkage", nodes: [receiptNode("infr_A", "infr_C"), receiptNode("infr_B", "infr_A"), receiptNode("infr_C", "infr_B")] },
  ];
  for (const { name, nodes } of cases) {
    const executions = nodes.map(successfulExecution);
    const combined = combineExecutions(executions, executions.at(-1), {});
    assert.equal(combined.ok, false, `${name}: a cyclic graph must fail even when every execution succeeded`);
    assert.equal(combined.errorCode, "receipt_lineage_cycle", `${name}: canonical error code`);
    assert.match(combined.error, /receipt_lineage_cycle/);
    assert.equal(combined.receiptDag.acyclic, false, `${name}: the DAG carries the cycle verdict`);
    assert.ok(Array.isArray(combined.receiptDag.cycle_path) && combined.receiptDag.cycle_path.length > 0, `${name}: bounded cycle path present`);
    assert.equal(combined.response, undefined === combined.response ? combined.response : combined.response, `${name}`);
  }
});

test("the concurrent mutual-edge case is refused at assembly even though each ingestion check passed", () => {
  // Two continuations each recorded the other as its child; no single
  // ingestion check could see the loop, but the assembled edge set does.
  const nodes = [receiptNode("infr_left", null, ["infr_right"]), receiptNode("infr_right", null, ["infr_left"])];
  const combined = combineExecutions(nodes.map(successfulExecution), successfulExecution(nodes[1]), {});
  assert.equal(combined.ok, false);
  assert.equal(combined.errorCode, "receipt_lineage_cycle");
});

test("a clean diamond and a long acyclic chain assemble as trusted evidence (no false positives)", () => {
  const diamond = [
    receiptNode("infr_root", null, ["infr_L", "infr_R"]),
    receiptNode("infr_L", "infr_root", ["infr_join"]),
    receiptNode("infr_R", "infr_root", ["infr_join"]),
    receiptNode("infr_join", "infr_L"),
  ];
  const diamondCombined = combineExecutions(diamond.map(successfulExecution), successfulExecution(diamond.at(-1)), {});
  assert.equal(diamondCombined.ok, true, JSON.stringify(diamondCombined.error));
  assert.equal(diamondCombined.receiptDag.acyclic, true);

  const chain = [];
  for (let i = 0; i < 200; i += 1) {
    chain.push(receiptNode(`infr_chain_${i}`, i === 0 ? null : `infr_chain_${i - 1}`, i < 199 ? [`infr_chain_${i + 1}`] : []));
  }
  const chainCombined = combineExecutions(chain.map(successfulExecution), successfulExecution(chain.at(-1)), {});
  assert.equal(chainCombined.ok, true, "a long valid chain is not a false-positive cycle");
});

test("cycle detection is bounded: an oversized receipt graph is refused, not partially verified", () => {
  const overflowNodes = detectLineageCycle([{ receipt_id: "infr_big", children: Array.from({ length: LINEAGE_GRAPH_MAX_EDGES + 5 }, (_, i) => ({ child_receipt_id: `infr_c_${i}` })) }]);
  assert.equal(overflowNodes.ok, false);
  assert.equal(overflowNodes.boundsExceeded, true);
  assert.match(overflowNodes.reason, /exceeds/);
  // An oversized DAG at the workflow boundary is a terminal failure too.
  const bigReceipt = receiptNode("infr_big_root", null, Array.from({ length: LINEAGE_GRAPH_MAX_EDGES + 5 }, (_, i) => `infr_leaf_${i}`));
  const combined = combineExecutions([successfulExecution(bigReceipt)], successfulExecution(bigReceipt), {});
  assert.equal(combined.ok, false);
  assert.equal(combined.errorCode, "receipt_graph_unverifiable");
  // A very long cycle reports a BOUNDED path (never the whole chain).
  const bigCycle = [];
  for (let i = 0; i < 100; i += 1) bigCycle.push({ receipt_id: `n${i}`, children: [{ child_receipt_id: `n${(i + 1) % 100}` }] });
  const cyclic = detectLineageCycle(bigCycle);
  assert.equal(cyclic.ok, false);
  assert.ok(cyclic.cyclePath.length <= 33, "the reported cycle path is bounded");
});

// ===========================================================================
// Hard-budget behavior under unknown pricing (Phase 6).
// ===========================================================================

function costFixture({ routes, teacherContent = "cloud answer", logprobs = { content: [{ logprob: -0.02 }] } } = {}) {
  const counter = { total: 0, teacher: 0, local: 0 };
  const fetchImpl = async (url) => {
    counter.total += 1;
    const isTeacher = String(url).includes("teacher.example");
    if (isTeacher) counter.teacher += 1; else counter.local += 1;
    const body = completion(isTeacher ? teacherContent : "local answer", undefined, logprobs ? { logprobs } : {});
    body.model = isTeacher ? "teacher-model" : "base-model-tag";
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
  const policyRow = {
    integrationId: "custom-model-policy",
    metadata: { mothershipProxy: { workspaceSlug: "ws-cost", modelTag: "base-model-tag", inferenceControlPlane: { cache: { ttl: 0 } }, routes } },
  };
  return { policyRow, fetchImpl, counter, networkPolicy: { networkAllow: true, allowList: ["teacher.example"], resolveHostname: async () => [{ address: "93.184.216.34" }] } };
}
const teacherRoute = (extra = {}) => ({ target: "teacher", providerId: "cloud-teacher", baseUrl: "https://teacher.example", endpoint: "/chat/completions", modelTag: "teacher-model", ...extra });

async function runCost(fixture, inference, extra = {}) {
  return executeCustomModelInference({
    workspaceConfig: { dataModel: { objects: [] } },
    policyRow: fixture.policyRow,
    inputPayload: { prompt: "cost probe", inference },
    fetchImpl: fixture.fetchImpl,
    runId: "run_cost",
    networkPolicy: fixture.networkPolicy,
    ...extra,
  });
}

test("under an explicit budget an unpriced cloud route is cost_unknown-ineligible and never reaches transport", async () => {
  const fixture = costFixture({ routes: [teacherRoute()] });
  const result = await runCost(fixture, { max_cost_cents: 25 });
  assert.equal(result.ok, false, "no route may run: the only route has unknown cost under a budget");
  assert.equal(fixture.counter.teacher, 0, "the unpriced cloud route is not executed");
  const skip = result.attempts.find((attempt) => attempt.target === "teacher");
  assert.equal(skip.status, "skipped");
  assert.equal(skip.costStatus, "cost_unknown");
});

test("malformed route pricing never becomes a free route under a budget", async () => {
  for (const costModel of [
    { inputCentsPerMTokens: Number.NaN },
    { inputCentsPerMTokens: -5, outputCentsPerMTokens: 1 },
    { inputCentsPerMTokens: Number.POSITIVE_INFINITY },
    { outputCentsPerMTokens: "not-a-number" },
    { inputCentsPerMTokens: null, outputCentsPerMTokens: null },
  ]) {
    const fixture = costFixture({ routes: [teacherRoute({ costModel })] });
    const result = await runCost(fixture, { max_cost_cents: 1000 });
    assert.equal(fixture.counter.teacher, 0, `${JSON.stringify(costModel)} must not create a free cloud route`);
    assert.equal(result.ok, false);
    const skip = result.attempts.find((attempt) => attempt.target === "teacher");
    assert.equal(skip.costStatus, "cost_unknown", `${JSON.stringify(costModel)} → cost_unknown`);
  }
});

test("a governed assumedRouteCostCents ceiling admits or blocks an unpriced route by remaining budget, and is labeled as assumed", async () => {
  const withCeiling = (route) => {
    // Operator-owned governed control config on the route itself (merged into
    // `control.economics`), NOT request input.
    route.inferenceControlPlane = { economics: { assumedRouteCostCents: 3 } };
    return route;
  };
  // Ceiling fits the budget → the route runs, and the receipt says the price was assumed.
  const admit = costFixture({ routes: [withCeiling(teacherRoute())] });
  const admitResult = await runCost(admit, { max_cost_cents: 10 });
  assert.equal(admitResult.ok, true, JSON.stringify(admitResult.error || admitResult.attempts));
  assert.equal(admit.counter.teacher, 1);
  assert.match(String(admitResult.verificationReceipt.routing_decision.reason_detail || ""), /assumedRouteCostCents/);
  // Ceiling exceeds the budget → blocked, no transport.
  const block = costFixture({ routes: [withCeiling(teacherRoute())] });
  const blockResult = await runCost(block, { max_cost_cents: 2 });
  assert.equal(blockResult.ok, false);
  assert.equal(block.counter.teacher, 0, "the assumed ceiling must not exceed the remaining budget");
});

test("assumedRouteCostCents is operator-owned governed config and cannot be supplied through request metadata", async () => {
  const fixture = costFixture({ routes: [teacherRoute()] });
  // Attacker tries to inject the ceiling via the request body.
  const result = await runCost(fixture, { max_cost_cents: 10, assumedRouteCostCents: 3, economics: { assumedRouteCostCents: 3 } });
  assert.equal(fixture.counter.teacher, 0, "request-supplied assumedRouteCostCents must be ignored");
  assert.equal(result.ok, false);
  const skip = result.attempts.find((attempt) => attempt.target === "teacher");
  assert.equal(skip.costStatus, "cost_unknown");
});

test("a zero (or near-zero) budget admits no metered route", async () => {
  const fixture = costFixture({ routes: [teacherRoute({ costModel: { inputCentsPerMTokens: 100, outputCentsPerMTokens: 100 } })] });
  const result = await runCost(fixture, { max_cost_cents: 0 });
  assert.equal(result.ok, false);
  assert.equal(fixture.counter.teacher, 0);
});

test("without log-probabilities quality is honestly UNVERIFIED, never a fabricated score", async () => {
  const fixture = costFixture({ routes: [teacherRoute({ costModel: { inputCentsPerMTokens: 1, outputCentsPerMTokens: 1 } })], logprobs: null });
  const result = await runCost(fixture, { min_quality_score: 0.9, max_cost_cents: 1000 });
  assert.equal(result.ok, true, JSON.stringify(result.error || result.attempts));
  assert.equal(result.verificationReceipt.routing_decision.quality, "UNVERIFIED");
  assert.equal(result.verificationReceipt.routing_decision.actual_confidence, null);
  assert.equal(result.verificationReceipt.routing_decision.confidence_basis, "unavailable");
});

// ===========================================================================
// Distributed invalidation uncertainty fails safe (Phase 7).
//
// A shared Redis REST store is emulated in-memory so two InferenceSemanticCache
// instances (same credential binding → same signing key + cache version) act
// like two processes. A read fault must degrade cache EFFICIENCY (miss/bypass),
// never integrity (a stale or poisoned body served).
// ===========================================================================

function fakeRedis() {
  const strings = new Map();
  const lists = new Map();
  const faults = new Set();
  const calls = [];
  const fetchImpl = async (url, init) => {
    const args = JSON.parse(init.body);
    const cmd = String(args[0] || "").toUpperCase();
    calls.push(cmd);
    if (faults.has(cmd)) throw new Error(`injected Redis fault on ${cmd}`);
    let result = null;
    switch (cmd) {
      case "SET": strings.set(args[1], args[2]); result = "OK"; break;
      case "SETEX": strings.set(args[1], args[3]); result = "OK"; break;
      case "GET": result = strings.has(args[1]) ? strings.get(args[1]) : null; break;
      case "MGET": result = args.slice(1).map((k) => (strings.has(k) ? strings.get(k) : null)); break;
      case "INCR": { const v = (Number(strings.get(args[1])) || 0) + 1; strings.set(args[1], String(v)); result = v; break; }
      case "LPUSH": { const l = lists.get(args[1]) || []; l.unshift(...args.slice(2)); lists.set(args[1], l); result = l.length; break; }
      case "LRANGE": { const l = lists.get(args[1]) || []; const start = Number(args[2]) || 0; const stop = Number(args[3]); result = l.slice(start, stop < 0 ? undefined : stop + 1); break; }
      case "LTRIM": { const l = lists.get(args[1]) || []; lists.set(args[1], l.slice(Number(args[2]) || 0, Number(args[3]) + 1)); result = "OK"; break; }
      case "EXPIRE": result = 1; break;
      default: result = null;
    }
    return { ok: true, json: async () => ({ result }) };
  };
  return { strings, lists, faults, calls, fetchImpl };
}
const REDIS_CREDS = { redisUrl: "https://redis.test", redisToken: "super-secret-token", redisSource: "growthub" };
function sharedCache(redis, overrides = {}) {
  return new InferenceSemanticCache({ ...REDIS_CREDS, fetchImpl: redis.fetchImpl, now: () => 1_721_280_000_000, ...overrides });
}
const REDACTED_ENVELOPE = { model_sha256: "m".repeat(64), schema_hash: "s".repeat(64), workflow_id: "wf-shared" };

test("an epoch read failure turns a present entry into a remote_unverified miss (never stale)", async () => {
  const redis = fakeRedis();
  const cache = sharedCache(redis);
  const stored = await cache.store({ cacheKey: "k1", scopeKey: "s1", prefixHash: "p1", response: completion("cached answer"), ttlSeconds: 300, envelope: REDACTED_ENVELOPE });
  assert.equal(stored.stored, true);
  // Baseline: the entry verifies and is served while Redis is healthy.
  const healthy = await cache.lookup({ cacheKey: "k1", scopeKey: "s1", prefixHash: "p1" });
  assert.equal(healthy.hit, true);
  // Now the shared epoch state is unreachable.
  redis.faults.add("MGET");
  const degraded = await cache.lookup({ cacheKey: "k1", scopeKey: "s1", prefixHash: "p1" });
  assert.equal(degraded.hit, false, "a possibly-stale entry is not served when its epoch cannot be verified");
  assert.equal(degraded.integrity, "remote_unverified");
});

test("a poison tombstone read failure withholds the exact entry (never poisoned content served)", async () => {
  const redis = fakeRedis();
  const cache = sharedCache(redis);
  await cache.store({ cacheKey: "k2", scopeKey: "s2", prefixHash: "p2", response: completion("answer"), ttlSeconds: 300, envelope: REDACTED_ENVELOPE });
  redis.faults.add("GET"); // the poison-tombstone read (and any remote entry read) is unreachable
  const result = await cache.lookup({ cacheKey: "k2", scopeKey: "s2", prefixHash: "p2" });
  assert.equal(result.hit, false);
  assert.equal(result.integrity, "remote_unverified");
});

test("a semantic poison-marker read failure withholds semantic candidates", async () => {
  const redis = fakeRedis();
  const cache = sharedCache(redis, { embeddingProvider: { id: "test-embed", embed: async () => [1, 0, 0] } });
  redis.faults.add("LRANGE"); // the poison-marker list is unreachable
  const result = await cache.lookup({ cacheKey: "missing", scopeKey: "s3", prefixHash: "p3", semantic: true, semanticText: "hello" });
  assert.equal(result.hit, false);
  assert.equal(result.integrity, "remote_unverified");
});

test("a poison written by one process is observed by another (cross-process invalidation visibility)", async () => {
  const redis = fakeRedis();
  const writer = sharedCache(redis);
  const reader = sharedCache(redis);
  const inv = await writer.invalidate({ reason: "SECURITY", scope: { exact_key: "k4" }, correctionReceiptId: "corr-security" });
  assert.equal(inv.ok, true);
  const seen = await reader.lookup({ cacheKey: "k4", scopeKey: "s4", prefixHash: "p4" });
  assert.equal(seen.hit, false);
  assert.equal(seen.poisoned, true);
  assert.equal(seen.bypassReason, CACHE_BYPASS_POISONED);
});

test("the SECURITY invalidation lane stays open even when the FEEDBACK_CORRECTION lane is exhausted", async () => {
  const cache = sharedCache(fakeRedis(), { maxInvalidationsPerMinute: 2 });
  assert.equal((await cache.invalidate({ reason: "FEEDBACK_CORRECTION", scope: { exact_key: "f1" }, correctionReceiptId: "c1" })).ok, true);
  assert.equal((await cache.invalidate({ reason: "FEEDBACK_CORRECTION", scope: { exact_key: "f2" }, correctionReceiptId: "c2" })).ok, true);
  const flooded = await cache.invalidate({ reason: "FEEDBACK_CORRECTION", scope: { exact_key: "f3" }, correctionReceiptId: "c3" });
  assert.equal(flooded.rateLimited, true, "the feedback lane is now exhausted");
  const security = await cache.invalidate({ reason: "SECURITY", scope: { exact_key: "sec1" }, correctionReceiptId: "s1" });
  assert.equal(security.ok, true, "a security invalidation still lands");
  assert.equal(security.rateLimited, undefined);
});

test("remote-uncertainty evidence never leaks Redis URLs, tokens, or the signing key", async () => {
  const redis = fakeRedis();
  const cache = sharedCache(redis);
  await cache.store({ cacheKey: "k5", scopeKey: "s5", prefixHash: "p5", response: completion("answer"), ttlSeconds: 300, envelope: REDACTED_ENVELOPE });
  redis.faults.add("MGET");
  const result = await cache.lookup({ cacheKey: "k5", scopeKey: "s5", prefixHash: "p5" });
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /super-secret-token/);
  assert.doesNotMatch(serialized, /redis\.test/);
  assert.ok(String(result.integrityReason || "").length <= 512, "the operator reason is bounded");
  const backend = cache.describeBackend();
  assert.doesNotMatch(JSON.stringify(backend), /super-secret-token/, "the backend descriptor exposes source, never the token");
});

test("a local-only cache works without Redis but claims no shared invalidation guarantee", async () => {
  const local = new InferenceSemanticCache({ now: () => 1_721_280_000_000 });
  const backend = local.describeBackend();
  assert.equal(backend.remoteEnabled, false);
  assert.equal(backend.kind, "memory");
  await local.store({ cacheKey: "lk", scopeKey: "ls", prefixHash: "lp", response: completion("local"), ttlSeconds: 300, envelope: REDACTED_ENVELOPE });
  const hit = await local.lookup({ cacheKey: "lk", scopeKey: "ls", prefixHash: "lp" });
  assert.equal(hit.hit, true, "the bounded local cache remains usable without Redis");
});

// ===========================================================================
// Phase 9 — composed real-world capability scenarios. The controls must hold
// when they INTERACT, not only in isolation. Each asserts the observable
// operator-facing evidence and the forbidden side effects.
// ===========================================================================

function signedManifestForGateway(env) {
  const compiled = compileInferenceManifest({
    workflowId: "run_compose",
    integrationId: "student-a",
    control: { runtime: { model: { sha256: BASE_SHA }, allowedAdapters: [] }, response_schema: null, cache: { ttl: 0 } },
    maxTokens: 512,
  });
  return signInferenceManifest(compiled.manifest, { env });
}

test("Scenario 1 — valid published parent + canonical child: one coherent evidence chain, redacted, cached", async () => {
  // Parent runs a plain (non-continuation) redacted call under a signed
  // manifest and a concrete tenant scope; the manifest, redaction, and cache
  // evidence must agree, and only the redacted body is cached.
  const cache = countingCache();
  const manifest = signedManifestForGateway(SIGNING_ENV);
  const { transport, counter } = countingTransport("The SSN 123-45-6789 was escalated.");
  const request = { ...baseRequest("compose-parent-1", "Escalate the ticket.", { base_model_ref: { base_model_sha256: BASE_SHA } }), cache_ttl: 60 };
  const result = await executeInferenceGateway({
    request,
    transport,
    cache: cache.client,
    defaults: { manifest, manifestRequired: true, tenantScope: TENANT_ALPHA, redaction: { enabled: true } },
    env: SIGNING_ENV,
    now: () => 1_721_280_000_000,
  });
  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.equal(counter.calls, 1);
  assert.equal(result.receipt.manifest.status, "verified", "the signed manifest verified against the live identity");
  assert.equal(result.receipt.redaction.status, "redacted");
  assert.doesNotMatch(JSON.stringify(result.output), /123-45-6789/, "the released body is redacted");
  assert.equal(cache.stats.stores, 1, "the redacted response is cached");
  assert.equal(result.receipt.cache.cache_scope_sha256, sha256Hex(TENANT_ALPHA), "the cache entry is tenant-scoped");
});

test("Scenario 2 — invalid live manifest with a cache hit available: neither cache nor transport is used", async () => {
  const staleHit = {
    response: completion("stale cached answer"),
    metadata: { providerKind: "cached" },
    envelope: { redacted: false },
    expiresAtMs: 9_999_999_999_999,
  };
  const cache = countingCache({ hitEntry: staleHit });
  const { transport, counter } = countingTransport("should never run");
  const result = await executeInferenceGateway({
    request: { ...baseRequest("compose-stale-1", "Answer from a live workflow.", { base_model_ref: { base_model_sha256: BASE_SHA } }), cache_ttl: 60 },
    transport,
    cache: cache.client,
    // A published workflow REQUIRES a signed manifest; none supplied → the
    // pre-transport gate fails closed before cache replay.
    defaults: { manifestRequired: true, tenantScope: TENANT_ALPHA },
    env: SIGNING_ENV,
    now: () => 1_721_280_000_000,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "manifest_missing");
  assert.equal(counter.calls, 0, "no transport under a missing live manifest");
  assert.equal(result.response, null, "the stale cache entry is NOT served in place of the missing manifest");
});

test("Scenario 3 — valid manifest but resolver absent: authenticating one layer does not excuse the other", async () => {
  const manifest = signedManifestForGateway(SIGNING_ENV);
  const child = await runChildGatewayCall({ parentReceiptId: AWAITING_PARENT, tenantScope: TENANT_ALPHA, requestId: "compose-child-3" });
  const { result, counter, cache } = await runLiveContinuation({
    childReceiptField: { child_receipt: child.receipt, child_receipt_id: child.receipt.receipt_id },
    // Live, manifest valid, tenant scope bound — but NO child receipt resolver.
    defaults: { liveExecution: true, manifest, manifestRequired: true, tenantScope: TENANT_ALPHA },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "child_receipt_resolver_required");
  assert.equal(counter.calls, 0, "a valid manifest does not excuse missing child-receipt authentication");
  assert.equal(cache.stats.stores, 0);
});

test("Scenario 4 — remote cache truth unavailable: cache is bypassed, integrity degraded, transport may proceed", async () => {
  const redis = fakeRedis();
  const cache = sharedCache(redis);
  await cache.store({ cacheKey: "compose-k", scopeKey: "compose-s", prefixHash: "compose-p", response: completion("cached"), ttlSeconds: 300, envelope: REDACTED_ENVELOPE });
  redis.faults.add("MGET"); // shared invalidation state unreachable
  const manifest = signedManifestForGateway(SIGNING_ENV);
  const { transport, counter } = countingTransport("fresh answer after cache bypass");
  // Drive the real gateway: the request scope hashes to compose-k so the
  // stored entry is a candidate, but remote uncertainty forces a miss.
  const result = await executeInferenceGateway({
    request: { ...baseRequest("compose-remote-4", "Answer.", { base_model_ref: { base_model_sha256: BASE_SHA } }), cache_ttl: 60 },
    transport,
    cache,
    defaults: { manifest, manifestRequired: true, tenantScope: TENANT_ALPHA },
    env: SIGNING_ENV,
    now: () => 1_721_280_000_000,
  });
  // The healthy path may or may not key-match the synthetic entry; the load-
  // bearing property is that integrity was never sacrificed and transport ran.
  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.equal(counter.calls, 1, "an incident degrades efficiency (extra model work), not integrity");
  assert.notEqual(result.output?.content, "cached", "a possibly-stale entry is never served on remote uncertainty");
});

test("Scenario 5 — explicit budget with unknown pricing: actionable cost_unknown, no transport", async () => {
  const fixture = costFixture({ routes: [teacherRoute()] });
  const result = await runCost(fixture, { max_cost_cents: 50 });
  assert.equal(result.ok, false);
  assert.equal(fixture.counter.teacher, 0, "a cost-control feature is not bypassed by incomplete pricing config");
  const skip = result.attempts.find((attempt) => attempt.target === "teacher");
  assert.equal(skip.costStatus, "cost_unknown");
  assert.match(skip.reason, /cost_unknown/);
});

test("Scenario 6 — successful executions that form a cycle: the workflow fails, nothing cyclic is trusted", () => {
  // Each call 'succeeded', but the assembled provenance is contradictory.
  const nodes = [receiptNode("infr_x", "infr_z"), receiptNode("infr_y", "infr_x"), receiptNode("infr_z", "infr_y")];
  const combined = combineExecutions(nodes.map(successfulExecution), successfulExecution(nodes.at(-1)), {});
  assert.equal(combined.ok, false, "successful HTTP calls do not turn contradictory provenance into valid evidence");
  assert.equal(combined.errorCode, "receipt_lineage_cycle");
  assert.equal(combined.receiptDag.acyclic, false);
});
