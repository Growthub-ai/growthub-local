/**
 * GET /api/workspace/readiness
 *
 * Operator-facing runtime readiness — persistence, env catalog, API registry,
 * data sources, sandbox, scheduler, activation blockers, and next best action.
 * Never returns secret values.
 */

import { NextResponse } from "next/server";
import {
  describePersistenceMode,
  readWorkspaceConfig,
  readWorkspaceSourceRecords,
} from "@/lib/workspace-config";
import { deriveWorkspaceReadiness } from "@/lib/workspace-readiness";

async function GET() {
  const workspaceConfig = await readWorkspaceConfig();
  const persistence = describePersistenceMode();
  let workspaceSourceRecords = {};
  try {
    workspaceSourceRecords = (await readWorkspaceSourceRecords()) || {};
  } catch {
    workspaceSourceRecords = {};
  }
  const readiness = deriveWorkspaceReadiness(workspaceConfig, workspaceSourceRecords, persistence, process.env);
  return NextResponse.json(readiness);
}

export { GET };
