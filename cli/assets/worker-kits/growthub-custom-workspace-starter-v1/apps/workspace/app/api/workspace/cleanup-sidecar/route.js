/**
 * POST /api/workspace/cleanup-sidecar
 *
 * Prune named keys from growthub.source-records.json after governed delete.
 * Request: { keys: string[] }
 * Response: { pruned: string[], skipped: string[] }
 */

import { NextResponse } from "next/server";
import { pruneWorkspaceSourceRecords } from "@/lib/workspace-config";

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const keys = Array.isArray(body?.keys)
    ? body.keys.map((key) => String(key || "").trim()).filter(Boolean)
    : [];

  if (!keys.length) {
    return NextResponse.json({ error: "keys must be a non-empty array" }, { status: 400 });
  }

  try {
    const result = await pruneWorkspaceSourceRecords(keys);
    return NextResponse.json(result);
  } catch (error) {
    if (error.code === "WORKSPACE_PERSISTENCE_READ_ONLY") {
      return NextResponse.json(
        {
          error: "sidecar cleanup requires a writable filesystem runtime",
          guidance: error.guidance
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message || "cleanup failed" }, { status: 500 });
  }
}

export { POST };
