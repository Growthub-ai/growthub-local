/** Production custom-model mothership execution tests.
 * Run with: node --test scripts/unit-custom-model-inference.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(repoRoot, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const { buildMothershipProxyRow } = await import(pathToFileURL(path.join(appRoot, "lib/distillation-fleet.js")).href);
const { executeCustomModelInference, executeCustomModelWorkflow } = await import(
  pathToFileURL(path.join(appRoot, "lib/custom-model-inference.js")).href
);
const { classifySandboxRunResult, runOrchestrationGraphIfPresent } = await import(
  pathToFileURL(path.join(appRoot, "lib/orchestration-graph-runner.js")).href
);
const { buildCustomModelWorkflowVariants } = await import(
  pathToFileURL(path.join(appRoot, "lib/custom-models-ledger.js")).href
);
const { buildLlamaCppInferenceControlPlane } = await import(
  pathToFileURL(path.join(appRoot, "lib/adapters/fine-tune-targets.js")).href
);

const completion = (model, content, usage = {}) => ({
  id: `cmpl-${model}`,
  object: "chat.completion",
  model,
  choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
  usage: { prompt_tokens: 7, completion_tokens: 5, total_tokens: 12, ...usage },
});

function fixture({ liveStudentModel = "workspace-tuned-v2" } = {}) {
  const student = {
    integrationId: "workspace-student",
    kind: "custom-model",
    capabilities: "chat-completions",
    baseUrl: "http://127.0.0.1:4101/v1",
    endpoint: "/chat/completions",
    expectedModelTag: "workspace-tuned-v2",
    status: "connected",
    lastTested: "2026-07-18T12:00:00.000Z",
    lastResponse: JSON.stringify(completion("workspace-tuned-v2", "verified")),
  };
  const policyRow = buildMothershipProxyRow({
    workspaceSlug: "workspace-local",
    modelTag: "workspace-tuned-v2",
    studentRegistryId: student.integrationId,
    fallbackBaseModel: "gemma3:1b",
    fallbackBaseUrl: "http://127.0.0.1:4102",
    teacher: {
      providerId: "teacher-test",
      baseUrl: "http://127.0.0.1:4103/v1",
      modelTag: "teacher-v1",
      authEnvVar: "",
    },
  });
  const workspaceConfig = { dataModel: { objects: [{ id: "api-registry", objectType: "api-registry", rows: [student, policyRow] }] } };
  const requests = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    const prompt = String(body.messages?.at(-1)?.content || "");
    requests.push({ url: String(url), body, headers: init.headers });
    if (String(url).startsWith("http://127.0.0.1:4101")) {
      const content = prompt.includes("Score the following answer")
        ? JSON.stringify({ score: 4.2, feedback: "add a concrete check" })
        : `student:${prompt}`;
      return new Response(JSON.stringify(completion(liveStudentModel, content)), { status: 200 });
    }
    if (String(url).startsWith("http://127.0.0.1:4102")) {
      return new Response(JSON.stringify(completion("gemma3:1b", `base:${prompt}`)), { status: 200 });
    }
    const content = prompt.includes("Evaluate two answers")
      ? JSON.stringify({ winner: "tuned", score: 4.5, reason: "more specific" })
      : prompt.includes("Score the following answer")
        ? JSON.stringify({ score: 4.2, feedback: "add a concrete check" })
        : `teacher:${prompt}`;
    return new Response(JSON.stringify(completion("teacher-v1", content)), { status: 200 });
  };
  return { workspaceConfig, policyRow, fetchImpl, requests };
}

test("production inference performs a strict OpenAI call and records real invocation evidence", async () => {
  const f = fixture();
  const result = await executeCustomModelInference({
    ...f,
    inputPayload: { messages: [{ role: "user", content: "Summarize the release" }] },
    runId: "run_chat_1",
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.invocation.route, "local-student");
  assert.equal(result.invocation.servedModel, "workspace-tuned-v2");
  assert.equal(result.invocation.status, 200);
  assert.equal(result.trace.prompt, "Summarize the release");
  assert.match(result.trace.response, /^student:/);
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].body.model, "workspace-tuned-v2");
  assert.equal(f.requests[0].body.messages[0].content, "Summarize the release");
});

test("live student identity mismatch cannot impersonate the tuned model and falls back to base", async () => {
  const f = fixture({ liveStudentModel: "gemma3:1b" });
  const result = await executeCustomModelInference({ ...f, inputPayload: { prompt: "Do the task" }, runId: "run_fallback" });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.invocation.route, "local-base");
  assert.equal(result.invocation.fallbackCount, 1);
  assert.equal(result.attempts[0].status, "failed");
  assert.match(result.attempts[0].reason, /expected workspace-tuned-v2/);
  assert.equal(f.requests.length, 2);
});

test("proof-gated llama.cpp student uses the supervised pool and returns verified composite identity", async () => {
  const baseSha = "a".repeat(64);
  const adapterSha = "b".repeat(64);
  const control = buildLlamaCppInferenceControlPlane({
    baseModel: { id: "base-gguf", path: "/models/base.gguf", sha256: baseSha },
    loraAdapters: [{ id: "support-v1", path: "/models/support-v1.gguf", sha256: adapterSha, scale: 0.75 }],
    defaultLoraId: "support-v1",
    servedAlias: "workspace-tuned-v2",
    cacheTtl: 0,
  });
  const f = fixture();
  const student = f.workspaceConfig.dataModel.objects[0].rows.find((row) => row.integrationId === "workspace-student");
  student.baseUrl = "";
  student.connectorKind = "llama.cpp-server";
  student.metadata = { inferenceControlPlane: control };
  const events = [];
  const llamaPool = {
    select(configuration) {
      events.push({ kind: "select", configuration });
      return null;
    },
    async ensure(configuration) {
      events.push({ kind: "ensure", configuration });
      return {
        instanceId: "llama-1",
        modelSha256: baseSha,
        adapterSha256: adapterSha,
        loraRef: "support-v1",
        loraScale: 0.75,
        alias: "workspace-tuned-v2",
        poolRole: "decode_pool",
        baseUrl: "http://127.0.0.1:40123",
        warmPrefix: false,
        coldStart: true,
      };
    },
    async dispatch(instanceId, request) {
      events.push({ kind: "dispatch", instanceId, request });
      return {
        response: new Response(JSON.stringify(completion("workspace-tuned-v2", "llama:verified")), { status: 200 }),
        release(options) { events.push({ kind: "release", options }); },
      };
    },
  };
  const result = await executeCustomModelInference({
    ...f,
    inputPayload: {
      messages: [
        { role: "system", content: "Use the support policy." },
        { role: "user", content: "Answer with the tuned adapter" },
      ],
      inference: { lora_ref: { lora_id: "support-v1", scale: 0.75 } },
    },
    runId: "run_llama_pool",
    llamaPool,
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.invocation.route, "local-student");
  assert.equal(result.invocation.verificationReceipt.identity.status, "verified");
  assert.equal(result.invocation.verificationReceipt.identity.base_model_sha256, baseSha);
  assert.equal(result.invocation.verificationReceipt.identity.adapter_sha256, adapterSha);
  const ensured = events.find((event) => event.kind === "ensure").configuration;
  assert.equal(ensured.servedAlias, "workspace-tuned-v2");
  assert.equal(ensured.loraRef, "support-v1");
  assert.equal(ensured.loraScale, 0.75);
  const dispatched = events.find((event) => event.kind === "dispatch").request;
  assert.equal(dispatched.headers.traceparent, result.invocation.verificationReceipt.otel.otel_traceparent);
  assert.equal(dispatched.loraRef, "support-v1");
  assert.equal(dispatched.body.messages[0].role, "system", "nested inference controls preserve top-level history");
  assert.equal(events.at(-1).kind, "release");
});

test("recursive and agentic workflows execute every claimed model step", async () => {
  const recursive = fixture();
  const learned = await executeCustomModelWorkflow({
    ...recursive,
    inputPayload: { prompt: "Draft a support answer" },
    runId: "run_recursive",
    workflowVariant: "recursive-learning",
  });
  assert.equal(learned.ok, true, learned.error);
  assert.equal(learned.invocations.length, 3);
  assert.equal(learned.traces.length, 3);
  assert.equal(learned.trace.recursiveLearning, true);
  assert.equal(learned.score, 4.2);
  assert.equal(recursive.requests.length, 3);

  const agentic = fixture();
  const result = await executeCustomModelWorkflow({
    ...agentic,
    inputPayload: { prompt: "Plan a safe migration" },
    runId: "run_agentic",
    workflowVariant: "agentic",
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.agenticSteps, 3);
  assert.equal(result.invocations.length, 3);
  assert.equal(agentic.requests.length, 3);
});

test("synthetic output is harvested but remains unaccepted until review", async () => {
  const f = fixture();
  const result = await executeCustomModelWorkflow({
    ...f,
    inputPayload: { prompt: "Create a billing support example" },
    runId: "run_synthetic",
    workflowVariant: "synthetic-scaling",
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.trace.synthetic, true);
  assert.equal(result.trace.accepted, false);
  assert.equal(result.trace.qualityStatus, "ungraded");
  assert.equal(result.trace.redactionStatus, "pending");
});

test("evaluation executes tuned, base, and teacher judge calls and returns the verdict", async () => {
  const f = fixture();
  const result = await executeCustomModelWorkflow({
    ...f,
    inputPayload: { prompt: "Answer the holdout question" },
    runId: "run_eval",
    workflowVariant: "eval-vs-base",
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.invocations.length, 3);
  assert.deepEqual(result.invocations.map((item) => item.route), ["local-student", "local-base", "teacher"]);
  assert.equal(result.evaluation.verdict.winner, "tuned");
  assert.equal(result.evaluation.verdict.score, 4.5);
  assert.equal(result.response.object, "custom_model.evaluation");
  assert.equal(f.requests.length, 3);
});

test("unsupported workflow variants and empty prompts fail without making a request", async () => {
  const f = fixture();
  const unsupported = await executeCustomModelWorkflow({ ...f, inputPayload: { prompt: "x" }, workflowVariant: "pretend-mode" });
  assert.equal(unsupported.ok, false);
  assert.match(unsupported.error, /unsupported/);
  const empty = await executeCustomModelInference({ ...f, inputPayload: {} });
  assert.equal(empty.ok, false);
  assert.match(empty.error, /requires a prompt/);
  assert.equal(f.requests.length, 0);
});

test("the production orchestration runner executes the shipped recursive graph and stamps every real node", async () => {
  const f = fixture();
  const model = {
    id: "workspace-local",
    name: "workspace-local",
    localModel: "workspace-tuned-v2",
    baseModel: "gemma3:1b",
    apiRegistryId: "workspace-student",
    verificationStatus: "verified",
    evidenceState: "complete",
  };
  const graph = buildCustomModelWorkflowVariants(model, { workspaceConfig: f.workspaceConfig })["recursive-learning"];
  const priorFetch = globalThis.fetch;
  globalThis.fetch = f.fetchImpl;
  try {
    const result = await runOrchestrationGraphIfPresent({
      workspaceConfig: f.workspaceConfig,
      row: { orchestrationConfig: JSON.stringify(graph) },
      timeoutMs: 30000,
      executionContext: { runId: "run_runner_recursive", workflowVariant: "recursive-learning" },
    });
    assert.equal(result.ok, true, result.error);
    assert.equal(result.adapterMeta.transport, "mothership-policy");
    assert.equal(result.adapterMeta.customModel.invocations.length, 3);
    assert.deepEqual(
      result.nodeTrace.map((entry) => [entry.id, entry.status]),
      [["input", "completed"], ["model-call", "completed"], ["self-grade", "completed"], ["improve", "completed"], ["write-trace", "completed"]],
    );
    assert.equal(f.requests.length, 3);
  } finally {
    globalThis.fetch = priorFetch;
  }
});

test("an awaiting tool result remains pending evidence and cannot become completed workflow proof", async () => {
  const f = fixture();
  const student = f.workspaceConfig.dataModel.objects[0].rows.find((row) => row.integrationId === "workspace-student");
  student.baseUrl = "http://127.0.0.1:40141/v1";
  const toolDefinition = {
    type: "function",
    function: {
      name: "createTicket",
      description: "Create a support ticket",
      parameters: {
        type: "object",
        properties: { subject: { type: "string", minLength: 3 } },
        required: ["subject"],
        additionalProperties: false,
      },
    },
  };
  const toolOpenApi = {
    openapi: "3.1.0",
    info: { title: "Support API", version: "1" },
    paths: {
      "/tickets": {
        post: {
          operationId: "createTicket",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: toolDefinition.function.parameters },
            },
          },
        },
      },
    },
  };
  f.policyRow.metadata.inferenceControlPlane = {
    tools: {
      definitions: [toolDefinition],
      openapi: toolOpenApi,
      allowedOperationIds: ["createTicket"],
    },
  };
  const model = {
    id: "workspace-local",
    name: "workspace-local",
    localModel: "workspace-tuned-v2",
    baseModel: "gemma3:1b",
    apiRegistryId: "workspace-student",
    verificationStatus: "verified",
    evidenceState: "complete",
  };
  const graph = buildCustomModelWorkflowVariants(model, { workspaceConfig: f.workspaceConfig }).chat;
  const events = [];
  const priorFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    id: "cmpl-tool-pending",
    object: "chat.completion",
    model: "workspace-tuned-v2",
    choices: [{
      index: 0,
      finish_reason: "tool_calls",
      message: {
        role: "assistant",
        content: null,
        tool_calls: [{
          id: "call-ticket-1",
          type: "function",
          function: { name: "createTicket", arguments: '{"subject":"Cannot sign in"}' },
        }],
      },
    }],
    usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 },
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const result = await runOrchestrationGraphIfPresent({
      workspaceConfig: f.workspaceConfig,
      row: { orchestrationConfig: JSON.stringify(graph) },
      timeoutMs: 30000,
      executionContext: {
        runId: "run_runner_tool_pending",
        workflowVariant: "chat",
        onEvent: (event) => events.push(event),
      },
    });
    assert.equal(result.ok, false, "the workflow is not complete until the tool result returns");
    assert.equal(result.exitCode, null, "pending is neither exit 0 proof nor a fabricated failure code");
    assert.equal(result.executionStatus, "awaiting_tool_result");
    assert.equal(result.awaitingToolResult, true);
    assert.equal(result.stdout, "", "raw tool-call output is not promoted as a final workflow result");
    assert.equal("rawPayload" in result, false);
    assert.equal(result.continuation.kind, "tool_result");
    assert.equal(result.continuation.status, "pending");
    assert.match(result.continuation.prior_receipt_id, /^infr_/);
    assert.equal(result.continuation.tool_calls[0].id, "call-ticket-1");
    assert.deepEqual(
      result.nodeTrace.map((entry) => [entry.id, entry.status, entry.awaiting || ""]),
      [["input", "completed", ""], ["model-call", "pending", "tool_result"], ["result", "skipped", ""]],
    );
    assert.equal(result.nodeTrace.find((entry) => entry.id === "model-call")?.generation, "completed");
    assert.ok(events.some((event) => event.type === "orchestration.node.pending"
      && event.awaiting === "tool_result"
      && event.generation === "completed"));
    assert.equal(result.adapterMeta.customModel.gatewayStatus, "awaiting_tool_result");
    assert.equal(result.adapterMeta.customModel.invocations[0].outcomeStatus, "awaiting_tool_result");
    assert.deepEqual(result.adapterMeta.customModel.traces, [], "pending tool calls never enter distillation");
    assert.deepEqual(classifySandboxRunResult(result), {
      awaitingToolResult: true,
      auditUnpersisted: false,
      runOk: false,
      executionStatus: "awaiting_tool_result",
      rowStatus: "pending",
      outcomeStatus: "drafted",
    });
  } finally {
    globalThis.fetch = priorFetch;
  }
});

test("sandbox run classification leaves ordinary completed runs unchanged", () => {
  assert.deepEqual(classifySandboxRunResult({ exitCode: 0, stdout: "done" }), {
    awaitingToolResult: false,
    auditUnpersisted: false,
    runOk: true,
    executionStatus: "completed",
    rowStatus: "connected",
    outcomeStatus: "tested",
  });
});

test("custom-model success is demoted when its governed audit receipt is not durable", () => {
  assert.deepEqual(
    classifySandboxRunResult(
      { exitCode: 0, stdout: "generated answer" },
      { auditRequired: true, auditPersisted: false },
    ),
    {
      awaitingToolResult: false,
      auditUnpersisted: true,
      runOk: false,
      executionStatus: "audit_unpersisted",
      rowStatus: "failed",
      outcomeStatus: "failed",
    },
  );
});

test("sandbox route persists custom-model audit before proof and maps pending outcomes without a tested claim", () => {
  const source = readFileSync(path.join(appRoot, "app/api/workspace/sandbox-run/route.js"), "utf8");
  const terminal = source.slice(source.indexOf("const auditRequired = hasCustomModelInvocationEvidence(response)"));
  assert.ok(terminal.length > 0, "terminal audit gate must exist");
  assert.ok(
    terminal.indexOf("persistCustomModelExecutionEvidence(response, ranAt)")
      < terminal.indexOf("appendWorkspaceSourceRecords(sourceId, [response]"),
    "verification invocation receipt is durable before sandbox proof is appended",
  );
  assert.match(terminal, /outcomeStatus:\s*completion\.outcomeStatus/);
  assert.match(terminal, /completion\.awaitingToolResult[\s\S]*draft remains untested and unpublishable/);
  assert.match(terminal, /completion\.auditUnpersisted[\s\S]*Restore writable workspace persistence/);
  assert.doesNotMatch(terminal, /outcomeStatus:\s*runOk\s*\?\s*"tested"/);
});
