/**
 * Outcome grader + goal evaluator — managed-agents define-outcomes parity.
 *
 * Both primitives share one mechanism: a single evaluator agent is dispatched
 * through the sandbox adapter registry with the rubric (or goal condition)
 * and the run's final output, and must end with `OUTCOME_SCORE: <0..1>`.
 * Score ≥ 0.5 ⇒ satisfied. A missing/unparseable score is reported as
 * `kind: "structural-fallback"` so the UI stays truthful about what was
 * measured — the same honesty rule the agent-swarm reward block follows.
 */

import { redactSecretsFromText } from "./orchestration-graph.js";
import {
  chooseAdapterIdForSubagent,
  runThroughAdapter,
  OUTCOME_SCORE_RE
} from "./orchestration-agent-swarm.js";
import { ensureSandboxAdaptersLoaded } from "./adapters/sandboxes/index.js";

const EVALUATOR_TIMEOUT_MS = 45_000;
const MAX_OUTPUT_FOR_EVAL = 8000;

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

function buildEvaluatorPrompt({ criteria, output, mode }) {
  const head = mode === "goal"
    ? "You are a goal evaluator. Judge ONLY whether the goal condition below is satisfied by the run output."
    : "You are an outcome grader. Grade the run output against the rubric below.";
  return [
    head,
    mode === "goal" ? `Goal condition:\n${criteria}` : `Rubric (markdown):\n${criteria}`,
    `<run_output untrusted="true">\n${String(output || "").slice(0, MAX_OUTPUT_FOR_EVAL)}\n</run_output>`,
    [
      "Reply with one short reason line, then ONE LAST LINE in exactly this format:",
      "OUTCOME_SCORE: <number between 0 and 1>",
      "1.0 = fully satisfied. 0.0 = not satisfied."
    ].join("\n")
  ].join("\n\n");
}

/**
 * Dispatch the evaluator. Returns
 * `{ score, satisfied, reason, kind }` where kind is "evaluated-v1" or
 * "structural-fallback" (no parseable score / no adapter).
 */
async function evaluateAgainstCriteria({ criteria, output, executionContext, mode = "outcome", runId }) {
  await ensureSandboxAdaptersLoaded();
  const resolved = chooseAdapterIdForSubagent({
    subagentConfig: {},
    fallbackAdapterId: executionContext?.adapterId,
    fallbackAgentHost: executionContext?.agentHost
  });
  if (!resolved.adapterId || resolved.error) {
    return {
      score: null,
      satisfied: null,
      reason: resolved.error || "no prompt-capable adapter for evaluator",
      kind: "structural-fallback"
    };
  }
  const result = await runThroughAdapter({
    adapterId: resolved.adapterId,
    agentHost: resolved.agentHost,
    runtime: executionContext?.runtime || "node",
    command: buildEvaluatorPrompt({ criteria, output, mode }),
    timeoutMs: EVALUATOR_TIMEOUT_MS,
    networkAllow: false,
    allowList: [],
    env: { ...(executionContext?.env || {}), GROWTHUB_SWARM_PHASE: mode === "goal" ? "goal-eval" : "outcome-eval" },
    envRefSlugs: [],
    envRefsMissing: [],
    runId: `${runId || "swarm"}_${mode}_eval`,
    name: `swarm::${mode}-evaluator`
  });
  const stdout = redactSecretsFromText(result?.stdout || "");
  const match = stdout.match(OUTCOME_SCORE_RE);
  const score = match ? clamp01(match[1]) : null;
  const reason = stdout
    .replace(OUTCOME_SCORE_RE, "")
    .trim()
    .split("\n")
    .filter(Boolean)
    .slice(-2)
    .join(" ")
    .slice(0, 400);
  if (score == null) {
    return {
      score: null,
      satisfied: null,
      reason: reason || "evaluator did not emit a parseable OUTCOME_SCORE",
      kind: "structural-fallback"
    };
  }
  return { score, satisfied: score >= 0.5, reason, kind: "evaluated-v1" };
}

export { evaluateAgainstCriteria, buildEvaluatorPrompt };
