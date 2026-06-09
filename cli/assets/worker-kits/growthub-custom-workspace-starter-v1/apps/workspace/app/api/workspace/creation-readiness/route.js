/**
 * GET /api/workspace/creation-readiness
 *
 * Governed creation loop readiness — derived from real workspace state.
 * Never returns secret values.
 */

import { NextResponse } from "next/server";
import { readWorkspaceConfig, readWorkspaceSourceRecords, describePersistenceMode } from "@/lib/workspace-config";
import { deriveWorkspaceCreationReadiness } from "@/lib/workspace-creation-readiness";

async function GET() {
  const workspaceConfig = await readWorkspaceConfig();
  let workspaceSourceRecords = {};
  try {
    workspaceSourceRecords = (await readWorkspaceSourceRecords()) || {};
  } catch {
    workspaceSourceRecords = {};
  }
  const persistence = describePersistenceMode();
  const readiness = deriveWorkspaceCreationReadiness({
    workspaceConfig,
    workspaceSourceRecords,
    persistence,
    canWriteEnv: persistence.canSave === true,
    env: process.env,
  });
  return NextResponse.json({ ok: true, ...readiness, persistence });
}

export { GET };
