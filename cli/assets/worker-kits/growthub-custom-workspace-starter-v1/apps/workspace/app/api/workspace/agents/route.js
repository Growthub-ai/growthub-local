import { NextResponse } from "next/server";
import { listAgentBindings } from "@/lib/adapters/agents";

async function GET() {
  try {
    const result = await listAgentBindings();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message || "agent lookup failed" }, { status: 500 });
  }
}

export { GET };
