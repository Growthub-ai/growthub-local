/**
 * Swarm run launcher — turns an approved SwarmRunProposal into a live run.
 *
 * Two execution modes, one event stream, one receipt path:
 *
 *   plan mode      — proposal.plan (declarative phases/agents) walked by the
 *                    JS plan runner. Supports outcome-rubric revision loops.
 *   workflow mode  — proposal.workflowRef points at a sandbox-environment row
 *                    whose agent-swarm-v1 orchestrationGraph is executed by
 *                    the existing runtime; live transitions arrive through
 *                    the additive onSwarmEvent hook.
 *
 * The launcher NEVER mutates growthub.config.json. Receipts (approval,
 * completion) go to the source-records sidecar via swarm-receipts.
 */

import { parseOrchestrationGraph } from "./orchestration-graph.js";
import { runAgentSwarmGraphIfPresent } from "./orchestration-agent-swarm.js";
import { findSandboxRowByWorkflowRef } from "./nav-workflows.js";
import { readWorkspaceConfig } from "./workspace-config.js";
import { runSwarmPlan } from "./swarm-plan-runner.js";
import { evaluateAgainstCriteria } from "./outcome-grader.js";
import {
  markRunStarted,
  openPhase,
  closePhase,
  startAgent,
  endAgent,
  finishRun,
  getRun,
  emitCustomRunEvent,
  estimateTokens
} from "./swarm-run-events.js";
import { recordCompletionReceipt } from "./swarm-receipts.js";

const GRAPH_PHASE_LABELS = { plan: "Plan", dispatch: "Dispatch", synthesize: "Synthesize" };

function buildExecutionContext(run, row = null) {
  return {
    runId: run.runId,
    ranAt: new Date().toISOString(),
    runtime: "node",
    adapterId: String(row?.adapter || run.proposal?.adapter || "local-intelligence").trim() || "local-intelligence",
    agentHost: String(row?.agentHost || run.proposal?.agentHost || "").trim(),
    env: {},
    envRefSlugs: [],
    envRefsMissing: [],
    networkAllow: false,
    allowList: [],
    timeoutMs: 60_000,
    sandboxName: run.name
  };
}

/** Map onSwarmEvent transitions from the graph runtime onto run/phase/agent nodes. */
function buildGraphEventBridge(run) {
  const phasesByKey = new Map();
  const agentsByKey = new Map();
  return (payload) => {
    const phaseKey = String(payload?.phase || "dispatch");
    const label = GRAPH_PHASE_LABELS[phaseKey] || phaseKey;
    let phase = phasesByKey.get(phaseKey);
    if (!phase) {
      phase = openPhase(run, label);
      phasesByKey.set(phaseKey, phase);
    }
    const agentKey = `${phaseKey}::${String(payload?.node || "agent")}`;
    if (payload?.status === "running") {
      if (!agentsByKey.has(agentKey)) {
        agentsByKey.set(agentKey, startAgent(run, phase, payload.node));
      }
      return;
    }
    const agent = agentsByKey.get(agentKey) || startAgent(run, phase, payload?.node);
    agentsByKey.set(agentKey, agent);
    endAgent(run, phase, agent, {
      status: payload?.status === "completed" ? "done" : "error",
      output: payload?.output || "",
      tokens: estimateTokens(payload?.output || ""),
      durationMs: payload?.durationMs
    });
    const allDone = phase.agents.every((a) => a.status !== "running");
    if (allDone && phaseKey !== "dispatch") {
      closePhase(run, phase, phase.agents.every((a) => a.status === "done") ? "done" : "error");
    }
  };
}

async function executeWorkflowMode(run) {
  const workspaceConfig = (await readWorkspaceConfig()) || {};
  const ref = run.proposal?.workflowRef || {};
  const { row } = findSandboxRowByWorkflowRef(workspaceConfig, String(ref.objectId || ""), String(ref.rowId || ""));
  if (!row) {
    finishRun(run, "error", `workflow not found: ${ref.objectId}/${ref.rowId}`);
    return { ok: false, finalOutput: "" };
  }
  const graph = parseOrchestrationGraph(row.orchestrationGraph || row.orchestrationConfig);
  const executionContext = buildExecutionContext(run, row);
  executionContext.onSwarmEvent = buildGraphEventBridge(run);
  const result = await runAgentSwarmGraphIfPresent({
    workspaceConfig,
    row,
    graph,
    timeoutMs: executionContext.timeoutMs,
    runInputs: run.proposal?.runInputs || null,
    executionContext
  });
  if (!result) {
    finishRun(run, "error", "referenced row does not hold an agent-swarm-v1 graph");
    return { ok: false, finalOutput: "" };
  }
  // Close any phase the bridge left open (dispatch closes here, after the run).
  for (const phase of run.phases) {
    if (phase.status === "running") {
      closePhase(run, phase, phase.agents.every((a) => a.status === "done") ? "done" : "error");
    }
  }
  return { ok: result.ok === true, finalOutput: result.swarm?.synthesis?.answer || result.stdout || "" };
}

async function executePlanMode(run, resumeRun) {
  const executionContext = buildExecutionContext(run);
  const maxIterations = run.outcome ? run.outcome.maxIterations : 1;
  let finalOutput = "";
  let ok = false;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    if (run.stopRequested) break;
    if (run.outcome) {
      run.outcome.iteration = iteration;
      emitCustomRunEvent(run.runId, { type: "outcome_evaluation_start", iteration });
    }
    const plan = iteration === 1
      ? run.proposal.plan
      : {
          ...run.proposal.plan,
          phases: run.proposal.plan.phases.map((phase) => ({
            ...phase,
            agents: phase.agents.map((agent) => ({
              ...agent,
              prompt: `${agent.prompt}\n\nRevision pass ${iteration}: the previous attempt did not satisfy the outcome rubric (${run.outcome?.lastReason || "no reason recorded"}). Address that gap.`
            }))
          }))
        };
    const result = await runSwarmPlan({ run, plan, executionContext, resumeRun: iteration === 1 ? resumeRun : null });
    finalOutput = result.finalOutput;
    ok = result.ok;

    if (!run.outcome || !run.outcome.rubric) break;
    const grade = await evaluateAgainstCriteria({
      criteria: run.outcome.rubric,
      output: finalOutput,
      executionContext,
      mode: "outcome",
      runId: run.runId
    });
    run.outcome.lastReason = grade.reason;
    const verdict = grade.satisfied === true
      ? "satisfied"
      : iteration >= maxIterations
        ? "max_iterations_reached"
        : "needs_revision";
    run.outcome.status = verdict;
    emitCustomRunEvent(run.runId, {
      type: verdict === "needs_revision" ? "outcome_evaluation_ongoing" : "outcome_evaluation_end",
      iteration,
      verdict,
      score: grade.score,
      reason: grade.reason,
      gradeKind: grade.kind
    });
    if (verdict !== "needs_revision") break;
  }
  return { ok, finalOutput };
}

async function evaluateGoal(run, finalOutput) {
  if (!run.goal || !run.goal.condition) return;
  emitCustomRunEvent(run.runId, { type: "goal.evaluation.start", condition: run.goal.condition.slice(0, 200) });
  const grade = await evaluateAgainstCriteria({
    criteria: run.goal.condition,
    output: finalOutput,
    executionContext: buildExecutionContext(run),
    mode: "goal",
    runId: run.runId
  });
  run.goal.evaluations += 1;
  run.goal.lastScore = grade.score;
  run.goal.lastReason = grade.reason;
  run.goal.status = grade.satisfied === true ? "satisfied" : grade.satisfied === false ? "unsatisfied" : "unknown";
  emitCustomRunEvent(run.runId, {
    type: "goal.evaluation.end",
    status: run.goal.status,
    score: grade.score,
    reason: grade.reason,
    gradeKind: grade.kind
  });
}

/**
 * Fire-and-forget launch of an approved run. All failure paths terminate the
 * run with a truthful status — this function never throws to the caller.
 */
function launchSwarmRun(run) {
  const resumeRun = run.resumeFromRunId ? getRun(run.resumeFromRunId) : null;
  markRunStarted(run);
  (async () => {
    try {
      const hasPlan = run.proposal?.plan && Array.isArray(run.proposal.plan.phases) && run.proposal.plan.phases.length > 0;
      const result = hasPlan
        ? await executePlanMode(run, resumeRun)
        : await executeWorkflowMode(run);
      await evaluateGoal(run, result.finalOutput);
      if (run.status === "running" || run.status === "pending") {
        finishRun(run, run.stopRequested ? "stopped" : result.ok ? "done" : "error", result.ok ? "" : run.error || "one or more agents failed");
      }
      await recordCompletionReceipt(run, result.finalOutput);
    } catch (error) {
      finishRun(run, "error", error?.message || "swarm run crashed");
      await recordCompletionReceipt(run, null);
    }
  })();
  return run;
}

export { launchSwarmRun, buildExecutionContext };
