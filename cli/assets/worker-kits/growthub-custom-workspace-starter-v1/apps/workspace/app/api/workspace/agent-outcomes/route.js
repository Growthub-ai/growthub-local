/**
 * GET /api/workspace/agent-outcomes
 *
 * The governance cockpit data model (Agent Outcome Loop V1 — contract:
 * `@growthub/api-contract/workspace-outcome::AgentOutcomesResponse`).
 *
 * Returns the unified receipt stream (newest first, bounded) that every
 * mutation lane emits — direct PATCH, preflight rejections, sandbox runs,
 * workflow publishes, helper applies — plus an always-recomputed governance
 * summary derived from the live config:
 *
 *   - blocked policy/gate attempts
 *   - successful publishes
 *   - drafts waiting for a test
 *   - drafts tested but not published
 *   - live workflow rows whose last run failed
 *   - live workflow rows with no recorded run at all
 *   - helper applies
 *
 * Read-only. This is how an operator manages a workspace full of agents
 * without reading logs, and how the next agent inherits context: read the
 * stream, cite receiptIds, continue from `nextActions` / `rollbackRef`.
 */

import { NextResponse } from "next/server";
import { readWorkspaceConfig } from "@/lib/workspace-config";
import { AGENT_OUTCOMES_SOURCE_ID, readOutcomeReceipts } from "@/lib/workspace-outcome-receipts";

function hasValue(v) {
  return Boolean(String(v ?? "").trim());
}

function deriveRowCounters(workspaceConfig) {
  const counters = {
    draftsAwaitingTest: 0,
    draftsTestedNotPublished: 0,
    liveRowsWithFailedLastRun: 0,
    liveRowsWithoutProof: 0
  };
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  for (const object of objects) {
    if (object?.objectType !== "sandbox-environment") continue;
    for (const row of Array.isArray(object.rows) ? object.rows : []) {
      const hasDraft = hasValue(row?.orchestrationDraftConfig) || hasValue(row?.orchestrationDraftGraph);
      const attested = row?.orchestrationDraftTestPassed === true
        || String(row?.orchestrationDraftTestPassed ?? "") === "true";
      if (hasDraft && !attested) counters.draftsAwaitingTest += 1;
      if (hasDraft && attested) counters.draftsTestedNotPublished += 1;
      const isLive = String(row?.lifecycleStatus ?? "").trim().toLowerCase() === "live";
      if (isLive && String(row?.status ?? "") === "failed") counters.liveRowsWithFailedLastRun += 1;
      if (isLive && !hasValue(row?.lastRunId)) counters.liveRowsWithoutProof += 1;
    }
  }
  return counters;
}

async function GET(request) {
  const { searchParams } = new URL(request.url);
  const limitRaw = Number(searchParams.get("limit") || 100);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 200) : 100;

  const receipts = await readOutcomeReceipts(limit);
  let workspaceConfig = null;
  try {
    workspaceConfig = await readWorkspaceConfig();
  } catch {
    workspaceConfig = null;
  }

  const summary = {
    blockedAttempts: receipts.filter((r) => r?.outcomeStatus === "blocked").length,
    publishes: receipts.filter((r) => r?.kind === "workflow-publish" && r?.outcomeStatus === "published").length,
    helperApplies: receipts.filter((r) => r?.kind === "helper-apply").length,
    ...deriveRowCounters(workspaceConfig)
  };

  return NextResponse.json({
    ok: true,
    sourceId: AGENT_OUTCOMES_SOURCE_ID,
    receipts,
    summary
  });
}

export { GET };
