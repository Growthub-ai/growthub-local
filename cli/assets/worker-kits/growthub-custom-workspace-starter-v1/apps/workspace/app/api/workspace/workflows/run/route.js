import { NextResponse } from "next/server";
import { runWorkflow } from "@/lib/adapters/workflows";

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }
  const workflowId = body?.workflowId;
  if (typeof workflowId !== "string" || !workflowId) {
    return NextResponse.json({ error: "workflowId required" }, { status: 400 });
  }
  try {
    const result = await runWorkflow(workflowId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message || "workflow run failed" }, { status: 500 });
  }
}

export { POST };
