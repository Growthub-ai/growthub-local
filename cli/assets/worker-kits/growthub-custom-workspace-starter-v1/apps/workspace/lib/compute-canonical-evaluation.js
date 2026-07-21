/**
 * Workspace-owned canonical evaluation for verified compute artifacts.
 *
 * Provider output may identify artifact bytes, but it cannot grade itself.
 * This module selects a governed holdout task set from workspace evidence and
 * executes the already-shipped `eval-vs-base` custom-model workflow:
 *
 *   verified tuned route → governed base route → governed teacher judge
 *
 * Only compact hashes, verdicts, model identities, and receipt-DAG identities
 * enter the compute journal. Raw holdout prompts and model answers remain in
 * their existing invocation/trace receipt lanes.
 */

import { executeCustomModelWorkflow } from "./custom-model-inference.js";
import { buildBenchmarkReceiptFields, deriveBenchmarkWins } from "./distillation-eval-harness.js";
import { hashComputeValue, sha256Hex } from "./compute-work-spec.js";
import { TRACES_OBJECT_ID, DEFAULT_MIN_SCORE } from "./training-ledger.js";

export const COMPUTE_CANONICAL_EVALUATION_SCHEMA = "growthub-compute-canonical-evaluation-v1";
export const COMPUTE_EVALUATION_TASK_SET_SCHEMA = "growthub-compute-evaluation-task-set-v1";
export const COMPUTE_EVALUATOR_VERSION = "custom-model-eval-vs-base-v1";
export const DEFAULT_COMPUTE_EVALUATION_MIN_TASKS = 5;
export const DEFAULT_COMPUTE_EVALUATION_MAX_TASKS = 20;

function str(value) {
  return String(value ?? "").trim();
}

function clamp(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : min;
}

function traceRows(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects)
    ? workspaceConfig.dataModel.objects
    : [];
  const object = objects.find((entry) => entry?.id === TRACES_OBJECT_ID || entry?.objectType === TRACES_OBJECT_ID);
  return Array.isArray(object?.rows) ? object.rows : [];
}

function eligibleHoldout(row) {
  if (!row || typeof row !== "object") return false;
  if (!str(row.inputPrompt)) return false;
  if (str(row.redactionStatus).toLowerCase() === "blocked") return false;
  if (Number(row.qualityScore) < DEFAULT_MIN_SCORE) return false;
  return true;
}

function taskFromRow(row) {
  const prompt = str(row.inputPrompt);
  const promptSha256 = sha256Hex(prompt);
  return {
    taskId: `holdout-${promptSha256.slice(0, 24)}`,
    prompt,
    promptSha256,
    sourceRowHash: hashComputeValue({
      sessionDate: str(row.sessionDate),
      qualityScore: Number(row.qualityScore) || 0,
      reason: str(row.reason),
      promptSha256,
    }),
  };
}

/**
 * Derive a deterministic holdout manifest. Explicit `evaluationHoldout` rows
 * win; otherwise high-quality rows not exported into the training corpus are
 * used. Training examples are never silently reused as evaluation examples.
 */
export function deriveCanonicalComputeEvaluationTasks({
  workspaceConfig = null,
  minimumTasks = DEFAULT_COMPUTE_EVALUATION_MIN_TASKS,
  maximumTasks = DEFAULT_COMPUTE_EVALUATION_MAX_TASKS,
} = {}) {
  const minTasks = Math.max(1, Math.floor(Number(minimumTasks) || DEFAULT_COMPUTE_EVALUATION_MIN_TASKS));
  const maxTasks = Math.max(minTasks, Math.min(100, Math.floor(Number(maximumTasks) || DEFAULT_COMPUTE_EVALUATION_MAX_TASKS)));
  const eligible = traceRows(workspaceConfig).filter(eligibleHoldout);
  const explicit = eligible.filter((row) => row.evaluationHoldout === true || str(row.evaluationHoldout).toLowerCase() === "true");
  const candidates = explicit.length > 0
    ? explicit
    : eligible.filter((row) => str(row.exported).toLowerCase() !== "true");

  const deduped = new Map();
  for (const row of candidates) {
    const task = taskFromRow(row);
    if (!deduped.has(task.promptSha256)) deduped.set(task.promptSha256, task);
  }
  const tasks = [...deduped.values()]
    .sort((a, b) => a.taskId.localeCompare(b.taskId))
    .slice(0, maxTasks);
  const publicTasks = tasks.map(({ prompt: _prompt, ...task }) => task);
  const manifestBody = {
    schema: COMPUTE_EVALUATION_TASK_SET_SCHEMA,
    sourceObjectId: TRACES_OBJECT_ID,
    selection: explicit.length > 0 ? "explicit-holdout" : "high-quality-unexported",
    minimumTasks: minTasks,
    taskCount: tasks.length,
    tasks: publicTasks,
  };
  return {
    ok: tasks.length >= minTasks,
    reason: tasks.length >= minTasks
      ? `${tasks.length} governed holdout tasks selected`
      : `canonical evaluation requires at least ${minTasks} high-quality holdout tasks; found ${tasks.length}`,
    manifest: { ...manifestBody, taskSetHash: hashComputeValue(manifestBody) },
    tasks,
  };
}

function registryRows(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects)
    ? workspaceConfig.dataModel.objects
    : [];
  return objects
    .filter((object) => object?.objectType === "api-registry")
    .flatMap((object) => Array.isArray(object.rows) ? object.rows : []);
}

export function findCanonicalEvaluationPolicyRow(workspaceConfig, modelTag) {
  const expected = str(modelTag);
  const matches = registryRows(workspaceConfig).filter((row) => {
    const policy = row?.metadata?.mothershipProxy;
    return policy && str(policy.modelTag) === expected;
  });
  return matches.length === 1 ? matches[0] : null;
}

function qualityPair(verdict) {
  const winner = str(verdict?.winner).toLowerCase();
  const score = clamp(verdict?.score, 0, 5);
  const confidence = score / 10;
  if (winner === "tuned") return { student: 0.5 + confidence, baseline: 0.5 - confidence };
  if (winner === "base") return { student: 0.5 - confidence, baseline: 0.5 + confidence };
  return { student: 0.5, baseline: 0.5 };
}

function compactExecutionEvidence(execution) {
  const invocations = Array.isArray(execution?.invocations) ? execution.invocations : [];
  const receipts = Array.isArray(execution?.receiptDag?.nodes)
    ? execution.receiptDag.nodes.map((node) => str(node?.receipt_id || node?.receiptId)).filter(Boolean)
    : [];
  return {
    receiptDagHash: execution?.receiptDag ? hashComputeValue(execution.receiptDag) : "",
    receiptIdsHash: receipts.length ? hashComputeValue(receipts.sort()) : "",
    tunedModel: str(execution?.evaluation?.tunedModel),
    baseModel: str(execution?.evaluation?.baseModel),
    invocationCount: invocations.length,
  };
}

/**
 * Execute the canonical evaluator. `executeWorkflow` is injectable only for
 * deterministic certification; production defaults to the shipped workflow.
 */
export async function runCanonicalComputeEvaluation({
  workspaceConfig = null,
  artifact = null,
  workSpec = null,
  trainingRunId = "",
  fetchImpl = fetch,
  networkPolicy = {},
  resolvedEnv = {},
  allowedEnvRefs = [],
  signal,
  timeoutMs = 120_000,
  minimumTasks = DEFAULT_COMPUTE_EVALUATION_MIN_TASKS,
  maximumTasks = DEFAULT_COMPUTE_EVALUATION_MAX_TASKS,
  executeWorkflow = executeCustomModelWorkflow,
  now = () => new Date().toISOString(),
} = {}) {
  const verifiedSha256 = str(artifact?.verifiedSha256);
  const claimedSha256 = str(artifact?.sha256);
  if (!verifiedSha256 || verifiedSha256 !== claimedSha256) {
    return { ok: false, pending: false, reasonCode: "artifact-unverified", reason: "canonical evaluation requires byte-verified artifact identity" };
  }
  if (str(artifact?.workSpecHash) && str(artifact.workSpecHash) !== str(workSpec?.workSpecHash)) {
    return { ok: false, pending: false, reasonCode: "artifact-work-spec-mismatch", reason: "artifact does not belong to the governed work specification" };
  }

  const modelTag = str(workSpec?.output?.modelTag);
  const policyRow = findCanonicalEvaluationPolicyRow(workspaceConfig, modelTag);
  if (!policyRow) {
    return { ok: false, pending: true, reasonCode: "evaluation-policy-missing", reason: `exactly one Mothership policy for model ${modelTag || "(missing)"} is required` };
  }
  const taskSet = deriveCanonicalComputeEvaluationTasks({ workspaceConfig, minimumTasks, maximumTasks });
  if (!taskSet.ok) return { ok: false, pending: true, reasonCode: "evaluation-holdout-insufficient", reason: taskSet.reason, taskSet: taskSet.manifest };

  const measured = [];
  const compactEvidence = [];
  for (const task of taskSet.tasks) {
    const execution = await executeWorkflow({
      workspaceConfig,
      policyRow,
      inputPayload: { prompt: task.prompt },
      fetchImpl,
      runId: `compute_eval_${str(trainingRunId)}_${task.taskId.slice(-12)}`,
      workflowVariant: "eval-vs-base",
      maxTokens: 512,
      appScope: "workspace-compute-evaluation",
      networkPolicy,
      resolvedEnv,
      allowedEnvRefs,
      signal,
      timeoutMs,
      liveExecution: false,
    });
    if (!execution?.ok || !execution?.evaluation?.verdict) {
      return {
        ok: false,
        pending: true,
        reasonCode: "evaluation-task-unmeasured",
        reason: `holdout task ${task.taskId} was not measured: ${str(execution?.error) || "evaluator returned no verdict"}`,
        taskSet: taskSet.manifest,
        measuredCount: measured.length,
      };
    }
    const verdict = execution.evaluation.verdict;
    const pair = qualityPair(verdict);
    measured.push({
      taskId: task.taskId,
      clusterId: "compute-canonical-holdout",
      student: { quality: pair.student, latencyMs: 0, costUsd: 0 },
      baseline: { quality: pair.baseline, latencyMs: 0, costUsd: 0 },
    });
    compactEvidence.push({
      taskId: task.taskId,
      promptSha256: task.promptSha256,
      winner: ["tuned", "base", "tie"].includes(str(verdict.winner).toLowerCase()) ? str(verdict.winner).toLowerCase() : "tie",
      score: clamp(verdict.score, 0, 5),
      reasonHash: sha256Hex(str(verdict.reason)),
      ...compactExecutionEvidence(execution),
    });
  }

  const winRecord = deriveBenchmarkWins({ results: measured });
  const resultBody = {
    schema: COMPUTE_CANONICAL_EVALUATION_SCHEMA,
    source: "workspace-canonical",
    evaluatorVersion: COMPUTE_EVALUATOR_VERSION,
    trainingRunId: str(trainingRunId),
    artifactSha256: verifiedSha256,
    workSpecHash: str(workSpec?.workSpecHash),
    modelTag,
    baselineModel: str(policyRow?.metadata?.mothershipProxy?.fallbackBaseModel),
    taskSetHash: taskSet.manifest.taskSetHash,
    taskCount: taskSet.manifest.taskCount,
    measuredCount: measured.length,
    results: compactEvidence,
    benchmarkWins: buildBenchmarkReceiptFields(winRecord),
    reason: winRecord.reason,
    evaluatedAt: str(now()),
  };
  return {
    ok: true,
    pending: false,
    evaluation: {
      ...resultBody,
      resultsHash: hashComputeValue(compactEvidence),
      evaluationHash: hashComputeValue({ ...resultBody, evaluatedAt: undefined }),
    },
  };
}
