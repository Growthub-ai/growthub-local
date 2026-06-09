import { NextResponse } from "next/server";
import { readWorkspaceConfig, describePersistenceMode, readWorkspaceSourceRecords } from "@/lib/workspace-config";
import { deriveCreationReadiness } from "@/lib/workspace-creation-readiness";

async function GET() {
  const workspaceConfig = await readWorkspaceConfig();
  const workspaceSourceRecords = await readWorkspaceSourceRecords().catch(() => ({}));
  const persistence = describePersistenceMode();
  const readiness = deriveCreationReadiness({
    workspaceConfig,
    workspaceSourceRecords,
    persistence,
    env: process.env,
  });
  return NextResponse.json(readiness);
}

export { GET };
