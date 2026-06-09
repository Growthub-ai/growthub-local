/**
 * GET /api/workspace/activation-summary
 *
 * Combined readiness + activation lens for the governed creation loop.
 * Never returns secret values.
 */

import { NextResponse } from "next/server";
import {
  readWorkspaceConfig,
  readWorkspaceSourceRecords,
  describePersistenceMode,
} from "@/lib/workspace-config";
import { deriveWorkspaceReadiness } from "@/lib/workspace-readiness";
import { deriveActivationLens } from "@/lib/workspace-activation-lens";
import { deriveWorkspaceActivationState } from "@/lib/workspace-activation";

async function GET() {
  const workspaceConfig = await readWorkspaceConfig();
  const workspaceSourceRecords = await readWorkspaceSourceRecords();
  const persistence = describePersistenceMode();

  const readiness = deriveWorkspaceReadiness({ workspaceConfig, persistence });
  const lens = deriveActivationLens({ workspaceConfig, workspaceSourceRecords });
  const activation = deriveWorkspaceActivationState({ workspaceConfig, workspaceSourceRecords });

  return NextResponse.json({
    kind: "growthub-activation-summary-v1",
    readiness,
    lens,
    activation: {
      complete: activation.complete,
      completedCount: activation.completedCount,
      totalCount: activation.totalCount,
      nextStepId: activation.nextStepId,
    },
    persistence,
  });
}

export { GET };
