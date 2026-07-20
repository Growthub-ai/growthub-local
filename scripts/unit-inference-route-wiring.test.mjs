#!/usr/bin/env node
/**
 * Route-wiring integration certification.
 *
 * Protects the wiring that ACTIVATES the evidentiary enforcement, exercising
 * the exact pure seams the Next.js routes call — not source-text assertions:
 *
 *  - Publish boundary: lib/workflow-publish-promotion.js::evaluateDraftPromotion
 *    (called by app/api/workspace/workflow/publish/route.js). Proves the
 *    inference manifest SET contract gates promotion and that a blocked
 *    publish structurally cannot mutate the workflow row (no `next` config).
 *  - Sandbox/continuation boundary: lib/sandbox-execution-context.js::
 *    buildInferenceTrustContext (spread into the runner's executionContext by
 *    app/api/workspace/sandbox-run/route.js). Proves live mode carries the
 *    server-owned resolver + tenant scope into the gateway, a draft run does
 *    not, and a forged caller receipt cannot bypass server-side resolution
 *    with no transport on trust failure.
 *
 * Full booted-workspace HTTP/browser E2E remains tracked in #295; this suite
 * closes the code-level route-wiring gap that E2E would otherwise be the only
 * thing guarding.
 *
 * Run with: node --test scripts/unit-inference-route-wiring.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceLib = path.join(repoRoot, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib");
const inferenceRoot = path.join(workspaceLib, "adapters/inference");
const load = (rel, base = workspaceLib) => import(pathToFileURL(path.join(base, rel)).href);

const { evaluateDraftPromotion } = await load("workflow-publish-promotion.js");
const { buildInferenceTrustContext } = await load("sandbox-execution-context.js");
const { resolveTrustedChildReceipt } = await load("continuation.js", inferenceRoot);
const { executeInferenceGateway } = await load("gateway.js", inferenceRoot);
const { compileInferenceManifest, signInferenceManifest } = await load("manifest.js", inferenceRoot);
const { receiptSha256 } = await load("lineage.js", inferenceRoot);
const { sha256Hex, stableStringify } = await load("contracts.js", inferenceRoot);
const { projectOpenApiTools } = await load("contracts.js", inferenceRoot);

const SIGNING_ENV = { GROWTHUB_WORKSPACE_SIGNING_KEY: "route-wiring-signing-key" };
const BASE_SHA = "a".repeat(64);
const INTEGRATION_ID = "student-a";

// ---------------------------------------------------------------------------
// Publish boundary
// ---------------------------------------------------------------------------

const CONTROL = {
  runtime: { model: { sha256: BASE_SHA }, allowedAdapters: [] },
  response_schema: null,
  cache: { ttl: 0 },
};

function inferenceWorkspaceConfig() {
  return {
    dataModel: {
      objects: [
        {
          id: "obj-registry",
          objectType: "api-registry",
          rows: [
            { integrationId: INTEGRATION_ID, Name: "Student A", baseUrl: "http://127.0.0.1:11434", metadata: { inferenceControlPlane: CONTROL } },
          ],
        },
      ],
    },
  };
}

const INFERENCE_GRAPH = {
  version: 1,
  provider: "growthub-native",
  nodes: [
    { id: "api-request", type: "api-registry-call", label: "API Registry", config: { registryId: INTEGRATION_ID, integrationId: INTEGRATION_ID } },
    { id: "result", type: "tool-result", label: "Result", config: {} },
  ],
  edges: [{ from: "api-request", to: "result" }],
};

function draftString(graph = INFERENCE_GRAPH) {
  return JSON.stringify(graph);
}
function draftSha(graph = INFERENCE_GRAPH) {
  return createHash("sha256").update(stableStringify(graph), "utf8").digest("hex");
}

function signedManifestFor({ env = SIGNING_ENV } = {}) {
  const compiled = compileInferenceManifest({ workflowId: "run_publish", integrationId: INTEGRATION_ID, control: CONTROL, maxTokens: 512 });
  assert.equal(compiled.available, true, compiled.reason);
  return signInferenceManifest(compiled.manifest, { env });
}

function runRecordWith(invocations, { graph = INFERENCE_GRAPH } = {}) {
  return {
    runId: "run_publish",
    useDraft: true,
    draftSha256: draftSha(graph),
    exitCode: 0,
    adapterMeta: { customModel: { invocations } },
  };
}

function promote(workspaceConfig, runRecord, { graph = INFERENCE_GRAPH } = {}) {
  const row = {
    Name: "Inference Workflow",
    version: 1,
    orchestrationDraftLastRunId: "run_publish",
    orchestrationGraph: "",
    orchestrationDraftGraph: draftString(graph),
  };
  workspaceConfig.dataModel.objects.push({ id: "obj-sandbox", objectType: "sandbox-environment", rows: [row] });
  // Snapshot AFTER the row is set up, so the check isolates the seam: it must
  // not mutate the input config on rejection (patchSandboxRowInConfig returns
  // a fresh `next`).
  const before = JSON.stringify(workspaceConfig);
  const result = evaluateDraftPromotion({
    workspaceConfig,
    objectId: "obj-sandbox",
    rowIndex: 0,
    row,
    draft: draftString(graph),
    liveField: "orchestrationGraph",
    draftField: "orchestrationDraftGraph",
    runRecord,
    serverlessSchedulerProofPassed: false,
    env: SIGNING_ENV,
    now: () => new Date("2026-07-20T00:00:00.000Z"),
  });
  return { result, before, workspaceConfig };
}

test("publish is blocked when an inference workflow has no manifest, and the workflow row is not mutated", () => {
  const { result, before, workspaceConfig } = promote(inferenceWorkspaceConfig(), runRecordWith([{ integrationId: INTEGRATION_ID }]));
  assert.equal(result.ok, false);
  assert.equal(result.code, "inference_manifest_mismatch");
  assert.equal(result.httpStatus, 409);
  assert.equal(result.next, undefined, "a blocked publish produces no mutated config");
  assert.equal(JSON.stringify(workspaceConfig), before, "the source workspace config is untouched on rejection");
});

test("publish is blocked when the tested manifest is unsigned", () => {
  const unsigned = signInferenceManifest(
    compileInferenceManifest({ workflowId: "run_publish", integrationId: INTEGRATION_ID, control: CONTROL, maxTokens: 512 }).manifest,
    { env: {} },
  );
  assert.equal(unsigned.algorithm, "unsigned");
  const { result } = promote(inferenceWorkspaceConfig(), runRecordWith([{ integrationId: INTEGRATION_ID, inferenceManifest: unsigned }]));
  assert.equal(result.ok, false);
  assert.equal(result.code, "inference_manifest_mismatch");
  assert.equal(result.next, undefined);
  const mismatch = result.manifestMismatches.find((entry) => entry.integrationId === INTEGRATION_ID);
  assert.ok(mismatch.diffs.some((diff) => /unsigned/i.test(diff.actual)), "the block reason names the unsigned manifest");
});

test("publish succeeds only with a complete signed manifest set, and promotes to live", () => {
  const { result } = promote(inferenceWorkspaceConfig(), runRecordWith([{ integrationId: INTEGRATION_ID, inferenceManifest: signedManifestFor() }]));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(result.next && result.next.dataModel, "a successful publish produces the mutated config");
  const promotedRow = result.next.dataModel.objects.find((o) => o.id === "obj-sandbox").rows[0];
  assert.equal(promotedRow.lifecycleStatus, "live");
  assert.equal(promotedRow.orchestrationGraph, draftString(), "the tested draft bytes are promoted to the live field");
  assert.equal(promotedRow.orchestrationDraftGraph, "", "the draft field is cleared");
  assert.equal(promotedRow.inferenceManifests.length, 1, "the live row carries the bound manifest for runtime enforcement");
});

test("publish is blocked when a signed manifest no longer matches the live registry identity", () => {
  const signed = signedManifestFor();
  const workspaceConfig = inferenceWorkspaceConfig();
  // Registry drift: the live base-model SHA changed since the tested run.
  workspaceConfig.dataModel.objects[0].rows[0].metadata.inferenceControlPlane = {
    ...CONTROL,
    runtime: { model: { sha256: "d".repeat(64) }, allowedAdapters: [] },
  };
  const { result } = promote(workspaceConfig, runRecordWith([{ integrationId: INTEGRATION_ID, inferenceManifest: signed }]));
  assert.equal(result.ok, false);
  assert.equal(result.code, "inference_manifest_mismatch");
  assert.equal(result.next, undefined);
});

// ---------------------------------------------------------------------------
// Sandbox / continuation boundary
// ---------------------------------------------------------------------------

test("the sandbox seam derives live enforcement from server-owned row state, not request input", () => {
  const liveCtx = buildInferenceTrustContext({ row: { lifecycleStatus: "live" }, useDraft: false, appScope: "app-1", resolveChildReceipt: async () => ({ ok: true }) });
  assert.equal(liveCtx.liveExecution, true);
  assert.equal(liveCtx.inferenceManifestsRequired, true);
  assert.equal(typeof liveCtx.resolveChildReceipt, "function");
  // A "Live" row (case-varied) is still live — an un-normalized check would skip enforcement.
  assert.equal(buildInferenceTrustContext({ row: { lifecycleStatus: "Live" } }).liveExecution, true);
  // A draft run of a live row is the only caller-selectable downgrade.
  const draftCtx = buildInferenceTrustContext({ row: { lifecycleStatus: "live" }, useDraft: true });
  assert.equal(draftCtx.liveExecution, false);
  assert.equal(draftCtx.inferenceManifestsRequired, false);
  // A genuinely draft row never enters live enforcement.
  assert.equal(buildInferenceTrustContext({ row: { lifecycleStatus: "draft" }, useDraft: false }).liveExecution, false);
});

test("the sandbox seam injects the server-derived app scope into every child-receipt resolution", async () => {
  const captured = [];
  const ctx = buildInferenceTrustContext({
    row: { lifecycleStatus: "live" },
    useDraft: false,
    appScope: "app-scope-from-server",
    resolveChildReceipt: async (args) => { captured.push(args); return { ok: false, reason: "n/a" }; },
  });
  await ctx.resolveChildReceipt({ childReceiptId: "infr_x", modelId: "m", policyRegistryId: "p" });
  assert.equal(captured[0].appScope, "app-scope-from-server", "the caller cannot substitute the app scope");
  assert.equal(captured[0].childReceiptId, "infr_x");
});

// A minimal governed workflow OpenAPI + continuation, reused across the
// gateway wiring tests below.
const workflowOpenApi = {
  openapi: "3.1.0",
  info: { title: "Governed workflow tools", version: "1" },
  paths: {
    "/api/workspace/sandbox-run": {
      post: {
        operationId: "runChildWorkflow",
        "x-growthub-workflow": true,
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { name: { type: "string", minLength: 1 } }, required: ["name"], additionalProperties: false } } } },
      },
    },
  },
};
const childCall = { id: "call-child-1", type: "function", function: { name: "runChildWorkflow", arguments: '{"name":"triage"}' } };
const AWAITING = "infr_parent_awaiting";

function unifiedTransport(counter, content = "done") {
  return async ({ request }) => {
    counter.calls += 1;
    const body = {
      id: "chatcmpl-wiring",
      object: "chat.completion",
      model: request.modelTag,
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }],
      usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
    };
    return {
      ok: true, status: 200, response: body,
      providerKind: "test", schemaEngine: "post-hoc", schemaGenerationEnforced: false,
      identity: { verified: true, baseModelSha256: BASE_SHA, adapterSha256: "", servedAlias: request.modelTag, instanceId: "i-1" },
      routing: { status: "unified", poolRole: "unified", nativeDisaggregation: false }, nativeCache: { enabled: false, cachedTokens: 0 }, coldStart: false,
    };
  };
}

async function childGatewayReceipt(tenantScope) {
  const counter = { calls: 0 };
  const child = await executeInferenceGateway({
    request: { request_id: "child-1", model: "backbone-model", base_model_ref: { base_model_sha256: BASE_SHA }, messages: [{ role: "user", content: "child" }], parent_receipt_id: AWAITING, span_kind: "CHILD_WORKFLOW" },
    transport: unifiedTransport(counter, "child answer"),
    defaults: { tenantScope },
    env: {}, now: () => 1_721_280_000_000,
  });
  assert.equal(child.ok, true, JSON.stringify(child.error));
  return child.receipt;
}

function continuationRequest() {
  return {
    request_id: "parent-continuation",
    prior_receipt_id: AWAITING,
    model: "backbone-model",
    base_model_ref: { base_model_sha256: BASE_SHA },
    messages: [{ role: "user", content: "Delegate to the child workflow." }],
    tool_openapi: workflowOpenApi,
    tool_contract: { allowed_operation_ids: ["runChildWorkflow"] },
  };
}

function trustedContinuationFor(request) {
  const toolContractSha256 = sha256Hex({
    tools: projectOpenApiTools(request.tool_openapi, { allowedOperationIds: request.tool_contract.allowed_operation_ids }),
    openapi: request.tool_openapi,
    allowedOperationIds: request.tool_contract.allowed_operation_ids.map(String),
  });
  return {
    trusted: true, receiptId: AWAITING, modelTag: "backbone-model", appScope: "workspace-wide", integrationId: "",
    baseModelSha256: BASE_SHA, adapterSha256: "", toolContractSha256,
    conversationSha256: sha256Hex([{ role: "user", content: "Delegate to the child workflow." }]),
    toolCalls: [childCall],
  };
}

test("a live continuation through the seam resolves the canonical child; a forged body cannot bypass it", async () => {
  const canonical = await childGatewayReceipt("tenant-real");
  const records = [{ modelId: "m", policyRegistryId: "p", integrationId: INTEGRATION_ID, appScope: "workspace-wide", verificationReceipt: canonical }];
  const ctx = buildInferenceTrustContext({
    row: { lifecycleStatus: "live" }, useDraft: false, appScope: "workspace-wide",
    resolveChildReceipt: (args) => resolveTrustedChildReceipt(records, args),
  });
  const counter = { calls: 0 };
  const request = continuationRequest();
  const result = await executeInferenceGateway({
    request: {
      ...request,
      tool_results: [{
        tool_call_id: childCall.id, operation_id: "runChildWorkflow", status: 200, response: { ok: true },
        child_receipt_id: canonical.receipt_id,
        // Attacker-tampered body accompanying the valid id — must be ignored.
        child_receipt: { ...canonical, output_sha256: "f".repeat(64) },
      }],
    },
    transport: unifiedTransport(counter),
    defaults: {
      liveExecution: ctx.liveExecution,
      tenantScope: "tenant-real",
      childReceiptResolver: (args) => ctx.resolveChildReceipt({ ...args, modelId: "m", policyRegistryId: "p" }),
    },
    trustedContinuation: trustedContinuationFor(request),
    env: {}, now: () => 1_721_280_000_000,
  });
  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.equal(counter.calls, 1);
  const edge = result.receipt.lineage.children[0];
  assert.equal(edge.child_receipt_sha256, receiptSha256(canonical), "the canonical receipt is hashed, not the caller body");
  assert.equal(edge.evidence_basis, "server-resolved");
});

test("live mode wired without a resolver refuses the continuation before transport", async () => {
  const canonical = await childGatewayReceipt("tenant-real");
  // The seam for a live row WITHOUT a resolver (a misconfiguration) — the
  // gateway must still fail closed, never fall back to the caller body.
  const ctx = buildInferenceTrustContext({ row: { lifecycleStatus: "live" }, useDraft: false, appScope: "workspace-wide" });
  assert.equal(ctx.resolveChildReceipt, undefined, "no resolver is wired");
  const counter = { calls: 0 };
  const request = continuationRequest();
  const result = await executeInferenceGateway({
    request: { ...request, tool_results: [{ tool_call_id: childCall.id, operation_id: "runChildWorkflow", status: 200, response: { ok: true }, child_receipt: canonical }] },
    transport: unifiedTransport(counter),
    defaults: { liveExecution: ctx.liveExecution, tenantScope: "tenant-real" },
    trustedContinuation: trustedContinuationFor(request),
    env: {}, now: () => 1_721_280_000_000,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "child_receipt_resolver_required");
  assert.equal(counter.calls, 0, "no transport on a live trust-boundary failure");
});
