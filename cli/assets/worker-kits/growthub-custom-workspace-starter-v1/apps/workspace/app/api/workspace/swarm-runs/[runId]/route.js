/**
 * /api/workspace/swarm-runs/[runId]
 *
 *   GET  → full run detail (phases, agents, outputs) for the drill-in view
 *   POST → control: { action: "stop" }
 */

import { NextResponse } from "next/server";
import { getRun, projectRun, requestStop } from "@/lib/swarm-run-events.js";

async function GET(_request, context) {
  const params = await context.params;
  const run = getRun(params?.runId);
  if (!run) {
    return NextResponse.json({ ok: false, error: "run not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, run: projectRun(run, { includeOutputs: true }) });
}

async function POST(request, context) {
  const params = await context.params;
  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const action = String(body?.action || "").trim();
  if (action !== "stop") {
    return NextResponse.json({ ok: false, error: "unknown action — use stop" }, { status: 400 });
  }
  const run = requestStop(params?.runId);
  if (!run) {
    return NextResponse.json({ ok: false, error: "run not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, runId: run.runId, status: run.status, stopRequested: run.stopRequested });
}

export { GET, POST };
