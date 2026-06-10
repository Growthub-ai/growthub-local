/**
 * /api/workspace/swarm-workflows — saved workflows + loops + commands.
 *
 *   GET                 → { workflows, loops, commands, receipts }
 *   POST save           → persist a named declarative plan
 *   POST loop.start     → start a self-paced loop on a saved workflow
 *   POST loop.stop      → stop a loop
 *   POST forget-approval→ drop a remembered per-workflow approval
 */

import { NextResponse } from "next/server";
import { listSavedWorkflows, saveWorkflowPlan, findSavedWorkflow } from "@/lib/saved-workflows.js";
import { listCommands } from "@/lib/command-registry.js";
import { startLoop, stopLoop, listLoops } from "@/lib/loop-runner.js";
import { listSwarmReceipts } from "@/lib/swarm-receipts.js";
import { createRun, getRun } from "@/lib/swarm-run-events.js";
import { launchSwarmRun } from "@/lib/swarm-run-launcher.js";
import { recordProposalReceipt, recordApprovalReceipt } from "@/lib/swarm-receipts.js";
import { isWorkflowApproved, forgetWorkflowApproval } from "@/lib/swarm-approval-memory.js";

function badRequest(error) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

async function GET() {
  const [workflows, commands, receipts] = await Promise.all([
    listSavedWorkflows(),
    listCommands(),
    listSwarmReceipts(25)
  ]);
  return NextResponse.json({ ok: true, workflows, loops: listLoops(), commands, receipts });
}

async function loopIteration(workflow) {
  const run = createRun({
    name: workflow.name,
    runKind: "workflow",
    description: `loop iteration · ${workflow.description || workflow.name}`,
    plan: workflow.kind === "plan" ? workflow.plan : null,
    workflowRef: workflow.kind === "graph" ? workflow.workflowRef : null,
    workflowName: workflow.name
  });
  await recordProposalReceipt(run, "loop-runner");
  await recordApprovalReceipt(run, { approvedBy: "loop-runner", remembered: true });
  launchSwarmRun(run);
  // Resolve when the run terminates so dynamic pacing can read durationMs.
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const poll = setInterval(() => {
      const current = getRun(run.runId);
      if (!current || ["done", "error", "stopped"].includes(current.status)) {
        clearInterval(poll);
        resolve({
          ok: current?.status === "done",
          runId: run.runId,
          durationMs: current?.durationMs ?? (Date.now() - startedAt)
        });
      }
    }, 1000);
    if (typeof poll.unref === "function") poll.unref();
  });
}

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("invalid JSON body");
  }
  const action = String(body?.action || "").trim();

  if (action === "save") {
    const result = await saveWorkflowPlan({
      name: body?.name,
      label: body?.label,
      description: body?.description,
      plan: body?.plan
    });
    if (!result.ok) return badRequest(result.error);
    return NextResponse.json({ ok: true, name: result.name });
  }

  if (action === "loop.start") {
    const workflow = await findSavedWorkflow(body?.workflowName);
    if (!workflow) return badRequest(`unknown workflow: ${body?.workflowName}`);
    // Loops automate cadence, never authority: a loop requires the workflow's
    // approval to already be remembered.
    const approved = await isWorkflowApproved(workflow.name);
    if (!approved) {
      return badRequest("loop requires a remembered approval — start the workflow once with remember: true");
    }
    const result = startLoop({
      workflowName: workflow.name,
      intervalMs: body?.intervalMs,
      iterate: () => loopIteration(workflow)
    });
    if (!result.ok) return badRequest(result.error);
    return NextResponse.json({ ok: true, loopId: result.loopId });
  }

  if (action === "loop.stop") {
    const result = stopLoop(body?.loopId);
    if (!result.ok) return badRequest(result.error);
    return NextResponse.json({ ok: true });
  }

  if (action === "forget-approval") {
    const result = await forgetWorkflowApproval(body?.workflowName);
    if (!result.ok) return badRequest(result.error);
    return NextResponse.json({ ok: true });
  }

  return badRequest(`unknown action: ${action || "(none)"} — use save | loop.start | loop.stop | forget-approval`);
}

export { GET, POST };
