/** Production custom-model mothership execution tests.
 * Run with: node --test scripts/unit-custom-model-inference.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(repoRoot, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const { buildMothershipProxyRow } = await import(pathToFileURL(path.join(appRoot, "lib/distillation-fleet.js")).href);
const { executeCustomModelInference, executeCustomModelWorkflow } = await import(
  pathToFileURL(path.join(appRoot, "lib/custom-model-inference.js")).href
);
const { runOrchestrationGraphIfPresent } = await import(
  pathToFileURL(path.join(appRoot, "lib/orchestration-graph-runner.js")).href
);
const { buildCustomModelWorkflowVariants } = await import(
  pathToFileURL(path.join(appRoot, "lib/custom-models-ledger.js")).href
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
    baseUrl: "http://student.local/v1",
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
    fallbackBaseUrl: "http://base.local",
    teacher: {
      providerId: "teacher-test",
      baseUrl: "https://teacher.example/v1",
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
    if (String(url).startsWith("http://student.local")) {
      const content = prompt.includes("Score the following answer")
        ? JSON.stringify({ score: 4.2, feedback: "add a concrete check" })
        : `student:${prompt}`;
      return new Response(JSON.stringify(completion(liveStudentModel, content)), { status: 200 });
    }
    if (String(url).startsWith("http://base.local")) {
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
