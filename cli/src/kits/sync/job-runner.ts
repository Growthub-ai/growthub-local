/**
 * Detached sync job runner.
 *
 * Spawned by `startSyncJob({ detach: true })` via `node <this-file>`. Reads
 * fork id, job id, and flags from env, then calls executeSyncJob. Exits with
 * code 0 on successful execution (regardless of needs-review vs succeeded —
 * the job state captures that distinction), and code 1 on failure so an
 * orchestrator can tell the two apart cheaply.
 */

import { executeSyncJob } from "./service.js";

function main(): void {
  const forkId = process.env.GROWTHUB_SYNC_FORK_ID;
  const jobId = process.env.GROWTHUB_SYNC_JOB_ID;
  const autoApply = process.env.GROWTHUB_SYNC_AUTO_APPLY === "true";
  const branchOverride = process.env.GROWTHUB_SYNC_BRANCH?.trim() || undefined;

  if (!forkId || !jobId) {
    console.error("GROWTHUB_SYNC_FORK_ID and GROWTHUB_SYNC_JOB_ID must be set for the detached runner.");
    process.exit(1);
  }

  const state = executeSyncJob({ forkId, jobId, autoApply, branchOverride, mode: "detached" });
  process.exit(state.status === "failed" ? 1 : 0);
}

main();
