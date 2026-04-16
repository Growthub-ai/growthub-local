/**
 * Approval queue builder — pure composition over fork-sync-agent state.
 *
 * Scans every registered fork's job log (via listKitForkSyncJobs under the
 * hood) and surfaces jobs parked in `awaiting_confirmation`. No new storage
 * — this is literally a view into existing durable state.
 */

import { listKitForkRegistrations } from "../kits/fork-registry.js";
import { listKitForkSyncJobs } from "../kits/fork-sync-agent.js";
import type { ApprovalQueueEntry } from "./types.js";

export function buildApprovalQueue(): ApprovalQueueEntry[] {
  const regs = listKitForkRegistrations();
  const entries: ApprovalQueueEntry[] = [];

  for (const reg of regs) {
    const jobs = listKitForkSyncJobs({ forkId: reg.forkId });
    for (const job of jobs) {
      if (job.status !== "awaiting_confirmation") continue;
      if (!job.healPlan) continue;
      entries.push({
        jobId: job.jobId,
        forkId: reg.forkId,
        kitId: reg.kitId,
        forkLabel: reg.label,
        createdAt: job.createdAt,
        pendingPaths: job.pendingConfirmations ?? [],
        plan: job.healPlan,
      });
    }
  }

  return entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
