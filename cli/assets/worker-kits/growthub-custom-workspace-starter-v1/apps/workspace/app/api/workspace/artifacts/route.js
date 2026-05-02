import { NextResponse } from "next/server";
import { listArtifacts } from "@/lib/adapters/artifacts";

async function GET() {
  try {
    const result = await listArtifacts();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message || "artifact lookup failed" }, { status: 500 });
  }
}

export { GET };
