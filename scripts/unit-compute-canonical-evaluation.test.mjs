import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleUrl = pathToFileURL(path.join(
  root,
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-canonical-evaluation.js",
)).href;
const {
  COMPUTE_CANONICAL_EVALUATION_SCHEMA,
  COMPUTE_EVALUATOR_VERSION,
  deriveCanonicalComputeEvaluationTasks,
  findCanonicalEvaluationPolicyRow,
  runCanonicalComputeEvaluation,
} = await import(moduleUrl);

function traces(count, overrides = {}) {
  return Array.from({ length: count }, (_, index) => ({
    inputPrompt: `Holdout prompt ${index}: explain governed fact ${index}.`,
    agentOutput: `Reference output ${index}`,
    qualityScore: 5,
    redactionStatus: "clear",
    exported: "false",
    sessionDate: `2026-07-${String(index + 1).padStart(2, "0")}`,
    ...overrides,
  }));
}

function workspaceConfig({ traceRows = traces(6), duplicatePolicy = false } = {}) {
  const policyRow = {
    integrationId: "mothership-proxy-student-v1",
    metadata: {
      mothershipProxy: {
        schema: "growthub-mothership-proxy-v1",
        modelTag: "student-v1",
        fallbackBaseModel: "base-v1",
        routes: [
          { target: "local-student", registryId: "student-row", modelTag: "student-v1" },
          { target: "local-base", baseUrl: "http://127.0.0.1:11434", modelTag: "base-v1" },
          { target: "teacher", providerId: "teacher-test", baseUrl: "https://teacher.example", modelTag: "teacher-v1", authEnvVar: "" },
        ],
      },
    },
  };
  return {
    dataModel: {
      objects: [
        { id: "training-traces", objectType: "training-traces", rows: traceRows },
        {
          id: "api-registry",
          objectType: "api-registry",
          rows: [
            policyRow,
            ...(duplicatePolicy ? [{ ...policyRow, integrationId: "duplicate-policy" }] : []),
          ],
        },
      ],
    },
  };
}

const artifact = {
  kind: "gguf",
  locator: "/governed/artifacts/student-v1.gguf",
  sha256: "a".repeat(64),
  verifiedSha256: "a".repeat(64),
  sizeBytes: 100,
  workSpecHash: "b".repeat(64),
};
const workSpec = {
  workSpecHash: "b".repeat(64),
  output: { modelTag: "student-v1", expectedKinds: ["gguf"] },
};

test("holdout derivation excludes exported training rows and is deterministic", () => {
  const rows = [
    ...traces(6),
    ...traces(3, { exported: "true", inputPrompt: "This training prompt must not be evaluated" }),
    { inputPrompt: "blocked", qualityScore: 5, redactionStatus: "blocked", exported: "false" },
    { inputPrompt: "low quality", qualityScore: 1, redactionStatus: "clear", exported: "false" },
  ];
  const first = deriveCanonicalComputeEvaluationTasks({ workspaceConfig: workspaceConfig({ traceRows: rows }) });
  const second = deriveCanonicalComputeEvaluationTasks({ workspaceConfig: workspaceConfig({ traceRows: [...rows].reverse() }) });
  assert.equal(first.ok, true);
  assert.equal(first.manifest.taskCount, 6);
  assert.equal(first.manifest.taskSetHash, second.manifest.taskSetHash);
  assert.equal(first.tasks.some((task) => task.prompt.includes("must not be evaluated")), false);
  assert.equal(JSON.stringify(first.manifest).includes("Holdout prompt"), false, "manifest stores only hashes, never raw prompts");
});

test("explicit evaluationHoldout rows take precedence over generic unexported rows", () => {
  const rows = [
    ...traces(6),
    ...traces(5, { evaluationHoldout: true, inputPrompt: "Explicit holdout" }),
  ];
  const result = deriveCanonicalComputeEvaluationTasks({ workspaceConfig: workspaceConfig({ traceRows: rows }) });
  assert.equal(result.ok, true);
  assert.equal(result.manifest.selection, "explicit-holdout");
  assert.equal(result.manifest.taskCount, 1, "duplicate explicit prompt is deduplicated by content identity");
});

test("insufficient governed holdouts keep evaluation pending rather than fabricating a verdict", () => {
  const result = deriveCanonicalComputeEvaluationTasks({ workspaceConfig: workspaceConfig({ traceRows: traces(4) }) });
  assert.equal(result.ok, false);
  assert.match(result.reason, /at least 5/);
});

test("exactly one matching Mothership policy is required", () => {
  assert.ok(findCanonicalEvaluationPolicyRow(workspaceConfig(), "student-v1"));
  assert.equal(findCanonicalEvaluationPolicyRow(workspaceConfig({ duplicatePolicy: true }), "student-v1"), null);
});

test("verified artifact runs the existing eval-vs-base workflow and produces sealed canonical evidence", async () => {
  let calls = 0;
  const executeWorkflow = async ({ workflowVariant, inputPayload, runId }) => {
    calls += 1;
    assert.equal(workflowVariant, "eval-vs-base");
    assert.match(inputPayload.prompt, /Holdout prompt/);
    const tunedWins = calls <= 4;
    return {
      ok: true,
      evaluation: {
        tunedModel: "student-v1",
        baseModel: "base-v1",
        verdict: {
          winner: tunedWins ? "tuned" : "base",
          score: 5,
          reason: tunedWins ? "tuned answer was better" : "base answer was better",
        },
      },
      receiptDag: {
        schema: "growthub-receipt-dag-v1",
        root_receipt_id: `${runId}-root`,
        nodes: [{ receipt_id: `${runId}-tuned` }, { receipt_id: `${runId}-base` }, { receipt_id: `${runId}-judge` }],
        edges: [],
        acyclic: true,
      },
      invocations: [{ route: "local-student" }, { route: "local-base" }, { route: "teacher" }],
    };
  };
  const outcome = await runCanonicalComputeEvaluation({
    workspaceConfig: workspaceConfig(),
    artifact,
    workSpec,
    trainingRunId: "trainrun-eval-1",
    executeWorkflow,
    now: () => "2026-07-21T12:00:00.000Z",
  });
  assert.equal(outcome.ok, true, outcome.reason);
  assert.equal(calls, 6);
  assert.equal(outcome.evaluation.schema, COMPUTE_CANONICAL_EVALUATION_SCHEMA);
  assert.equal(outcome.evaluation.source, "workspace-canonical");
  assert.equal(outcome.evaluation.evaluatorVersion, COMPUTE_EVALUATOR_VERSION);
  assert.equal(outcome.evaluation.artifactSha256, artifact.sha256);
  assert.equal(outcome.evaluation.workSpecHash, workSpec.workSpecHash);
  assert.equal(outcome.evaluation.taskCount, 6);
  assert.equal(outcome.evaluation.measuredCount, 6);
  assert.equal(outcome.evaluation.benchmarkWins.total, 6);
  assert.equal(outcome.evaluation.benchmarkWins.wins, 4);
  assert.equal(outcome.evaluation.benchmarkWins.promoted, true);
  assert.match(outcome.evaluation.taskSetHash, /^[0-9a-f]{64}$/);
  assert.match(outcome.evaluation.resultsHash, /^[0-9a-f]{64}$/);
  assert.match(outcome.evaluation.evaluationHash, /^[0-9a-f]{64}$/);
  const serialized = JSON.stringify(outcome.evaluation);
  assert.equal(serialized.includes("Holdout prompt"), false);
  assert.equal(serialized.includes("tuned answer was better"), false, "judge prose is represented only by a hash");
});

test("one unmeasured task leaves canonical evaluation pending and writes no benchmark verdict", async () => {
  let calls = 0;
  const outcome = await runCanonicalComputeEvaluation({
    workspaceConfig: workspaceConfig(),
    artifact,
    workSpec,
    trainingRunId: "trainrun-eval-pending",
    executeWorkflow: async () => {
      calls += 1;
      if (calls === 3) return { ok: false, error: "teacher unavailable" };
      return { ok: true, evaluation: { tunedModel: "student-v1", baseModel: "base-v1", verdict: { winner: "tuned", score: 5, reason: "ok" } }, receiptDag: { nodes: [] }, invocations: [] };
    },
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.pending, true);
  assert.equal(outcome.reasonCode, "evaluation-task-unmeasured");
  assert.equal(outcome.evaluation, undefined);
});

test("unverified or wrong-work-spec artifact cannot enter evaluation", async () => {
  const unverified = await runCanonicalComputeEvaluation({ workspaceConfig: workspaceConfig(), artifact: { ...artifact, verifiedSha256: "" }, workSpec, trainingRunId: "r" });
  assert.equal(unverified.ok, false);
  assert.equal(unverified.reasonCode, "artifact-unverified");

  const wrongSpec = await runCanonicalComputeEvaluation({ workspaceConfig: workspaceConfig(), artifact: { ...artifact, workSpecHash: "c".repeat(64) }, workSpec, trainingRunId: "r" });
  assert.equal(wrongSpec.ok, false);
  assert.equal(wrongSpec.reasonCode, "artifact-work-spec-mismatch");
});
