import { NextResponse } from "next/server";
import { describeDeployStatus } from "@/lib/adapters/deploy-status";

async function GET() {
  try {
    const status = await describeDeployStatus();
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json({ error: error.message || "failed to read deploy status" }, { status: 500 });
  }
}

export { GET };
