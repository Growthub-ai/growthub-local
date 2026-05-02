import { NextResponse } from "next/server";
import { listWorkflows } from "@/lib/adapters/workflows";

async function GET() {
  try {
    const result = await listWorkflows();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message || "workflow lookup failed" }, { status: 500 });
  }
}

export { GET };
