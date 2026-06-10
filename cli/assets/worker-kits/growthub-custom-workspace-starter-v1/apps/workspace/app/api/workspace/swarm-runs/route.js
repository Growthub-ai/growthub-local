/**
 * /api/workspace/swarm-runs — governed swarm-run surface.
 *
 *   GET            → { running: [...], finished: [...] } cockpit projection
 *   POST propose   → validate proposal, register run, write proposal receipt
 *   POST start     → approve + launch (honors per-workflow approval memory;
 *                    `remember: true` persists the approval)
 *   POST clear     → drop finished runs from the cockpit list
 *
 * Authority invariants:
 *   - propose NEVER executes anything; start is the explicit approval step
 *   - every transition leaves a receipt in the source-records sidecar
 *   - caps: ≤ MAX_AGENTS_PER_RUN agents, concurrency ≤ 16 (enforced in the
 *     plan runner), token budget honored mid-run
 */

import { NextResponse } from "next/server";
import {
  createRun,
  getRun,
  projectRunList,
  clearFinishedRuns,
  MAX_AGENTS_PER_RUN
} from "@/lib/swarm-run-events.js";
import { launchSwarmRun } from "@/lib/swarm-run-launcher.js";
import { recordProposalReceipt, recordApprovalReceipt } from "@/lib/swarm-receipts.js";
import { validatePlan, findSavedWorkflow } from "@/lib/saved-workflows.js";
import { isWorkflowApproved, rememberWorkflowApproval } from "@/lib/swarm-approval-memory.js";

function badRequest(error) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

async function normalizeProposal(body) {
  const proposal = {
    name: String(body?.name || "").trim(),
    runKind: body?.runKind === "agent" ? "agent" : "workflow",
    description: String(body?.description || "").trim().slice(0, 500),
    plan: null,
    workflowRef: null,
    workflowName: "",
    goal: null,
    outcome: null,
    budget: body?.budget && typeof body.budget === "object" ? { maxTokens: body.budget.maxTokens } : null,
    resumeFromRunId: String(body?.resumeFromRunId || "").trim() || null
  };

  if (body?.workflowName) {
    const workflow = await findSavedWorkflow(body.workflowName);
    if (!workflow) return { error: `unknown workflow: ${body.workflowName}` };
    proposal.workflowName = workflow.name;
    proposal.name = proposal.name || workflow.name;
    proposal.description = proposal.description || workflow.description;
    if (workflow.kind === "plan") proposal.plan = workflow.plan;
    else proposal.workflowRef = workflow.workflowRef;
  } else if (body?.plan) {
    const planError = validatePlan(body.plan);
    if (planError) return { error: planError };
    proposal.plan = body.plan;
    proposal.workflowName = proposal.name || "ad-hoc";
  } else if (body?.workflowRef?.objectId && body?.workflowRef?.rowId) {
    proposal.workflowRef = {
      objectId: String(body.workflowRef.objectId),
      rowId: String(body.workflowRef.rowId)
    };
    proposal.workflowName = proposal.name || proposal.workflowRef.rowId;
  } else {
    return { error: "proposal needs workflowName, plan, or workflowRef" };
  }

  if (!proposal.name) return { error: "proposal needs a name" };

  if (proposal.plan) {
    const agentCount = proposal.plan.phases.reduce((sum, phase) => sum + phase.agents.length, 0);
    if (agentCount > MAX_AGENTS_PER_RUN) {
      return { error: `plan exceeds agent cap: ${agentCount} > ${MAX_AGENTS_PER_RUN}` };
    }
  }
  if (body?.goal?.condition) {
    proposal.goal = { condition: String(body.goal.condition).slice(0, 4096) };
  }
  if (body?.outcome?.rubric) {
    proposal.outcome = {
      rubric: String(body.outcome.rubric).slice(0, 8192),
      maxIterations: body.outcome.maxIterations
    };
  }
  return { proposal };
}

async function GET() {
  return NextResponse.json({ ok: true, ...projectRunList() });
}

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("invalid JSON body");
  }
  const action = String(body?.action || "").trim();

  if (action === "propose") {
    const { proposal, error } = await normalizeProposal(body);
    if (error) return badRequest(error);
    const run = createRun(proposal);
    const receipt = await recordProposalReceipt(run, body?.reviewedBy);
    const remembered = await isWorkflowApproved(proposal.workflowName);
    return NextResponse.json({
      ok: true,
      runId: run.runId,
      status: run.status,
      autoApproved: remembered,
      receiptPersisted: receipt.persisted,
      warning: receipt.warning || undefined
    });
  }

  if (action === "start") {
    const run = getRun(body?.runId);
    if (!run) return badRequest("run not found");
    if (run.status !== "pending") return badRequest(`run is ${run.status}, not pending`);
    const remembered = await isWorkflowApproved(run.proposal.workflowName);
    if (!remembered && body?.approve !== true) {
      return badRequest("explicit approval required: pass approve: true (or remember the workflow first)");
    }
    if (body?.remember === true && run.proposal.workflowName) {
      await rememberWorkflowApproval(run.proposal.workflowName, body?.approvedBy);
    }
    await recordApprovalReceipt(run, { approvedBy: body?.approvedBy, remembered });
    launchSwarmRun(run);
    return NextResponse.json({ ok: true, runId: run.runId, status: run.status });
  }

  if (action === "clear") {
    const cleared = clearFinishedRuns();
    return NextResponse.json({ ok: true, cleared });
  }

  return badRequest(`unknown action: ${action || "(none)"} — use propose | start | clear`);
}

export { GET, POST };
