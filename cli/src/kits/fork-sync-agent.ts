/**
 * Kit Fork Sync Agent
 *
 * Orchestrates asynchronous fork-sync jobs within the CLI process.  Each job:
 *   1. Loads the fork registration
 *   2. Runs the drift detector (detectKitForkDrift)
 *   3. Builds a heal plan (buildKitForkHealPlan)
 *   4. Executes the plan (applyKitForkHealPlan)
 *   5. Persists the updated registration on success
 *
 * Jobs are persisted as JSON files under:
 *   PAPERCLIP_HOME/kit-forks/.jobs/<job-id>.json
 *
 * This keeps them lightweight (no child processes, no port binding),
 * human-inspectable, and restartable between CLI sessions.
 *
 * Two dispatch modes:
 *   runKitForkSyncJob()               — awaitable foreground execution
 *   dispatchKitForkSyncJobBackground() — fire-and-forget via setImmediate,
 *                                        returns job ID immediately
 */

import fs from "node:fs";
import path from "node:path";
import { resolvePaperclipHomeDir } from "../config/home.js";
import { loadKitForkRegistration, updateKitForkRegistration } from "./fork-registry.js";
import { detectKitForkDrift, buildKitForkHealPlan, applyKitForkHealPlan } from "./fork-sync.js";
import type {
  KitForkSyncJob,
  KitForkSyncJobStatus,
  KitForkHealOptions,
} from "./fork-types.js";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function resolveJobsRoot(): string {
  return path.resolve(resolvePaperclipHomeDir(), "kit-forks", ".jobs");
}

function resolveJobPath(jobId: string): string {
  return path.resolve(resolveJobsRoot(), `${jobId}.json`);
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

function generateJobId(): string {
  return `kfj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function readJob(jobId: string): KitForkSyncJob | null {
  const p = resolveJobPath(jobId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as KitForkSyncJob;
  } catch {
    return null;
  }
}

function writeJob(job: KitForkSyncJob): void {
  const dir = resolveJobsRoot();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(resolveJobPath(job.jobId), JSON.stringify(job, null, 2) + "\n", "utf8");
}

function patchJob(jobId: string, status: KitForkSyncJobStatus, patch?: Partial<KitForkSyncJob>): KitForkSyncJob | null {
  const job = readJob(jobId);
  if (!job) return null;
  const updated: KitForkSyncJob = { ...job, ...patch, status };
  writeJob(updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Public read API
// ---------------------------------------------------------------------------

/** Return a specific job by ID. */
export function getKitForkSyncJob(jobId: string): KitForkSyncJob | null {
  return readJob(jobId);
}

/** List all jobs, optionally filtered by forkId or status. */
export function listKitForkSyncJobs(filter?: {
  forkId?: string;
  status?: KitForkSyncJobStatus;
}): KitForkSyncJob[] {
  const root = resolveJobsRoot();
  if (!fs.existsSync(root)) return [];

  const jobs: KitForkSyncJob[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const job = readJob(entry.name.replace(/\.json$/, ""));
    if (!job) continue;
    if (filter?.forkId && job.forkId !== filter.forkId) continue;
    if (filter?.status && job.status !== filter.status) continue;
    jobs.push(job);
  }

  return jobs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Cancel a pending or running job.  Returns false if not found or already terminal. */
export function cancelKitForkSyncJob(jobId: string): boolean {
  const job = readJob(jobId);
  if (!job) return false;
  const terminal: KitForkSyncJobStatus[] = ["completed", "failed", "cancelled"];
  if (terminal.includes(job.status)) return false;
  patchJob(jobId, "cancelled");
  return true;
}

/** Purge terminal jobs older than retentionMs (default: 7 days). Returns pruned count. */
export function pruneKitForkSyncJobs(retentionMs = 7 * 24 * 60 * 60 * 1000): number {
  const root = resolveJobsRoot();
  if (!fs.existsSync(root)) return 0;

  const cutoff = Date.now() - retentionMs;
  let pruned = 0;

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const job = readJob(entry.name.replace(/\.json$/, ""));
    if (!job) continue;
    const terminal: KitForkSyncJobStatus[] = ["completed", "failed", "cancelled"];
    if (terminal.includes(job.status)) {
      const ts = new Date(job.completedAt ?? job.createdAt).getTime();
      if (ts < cutoff) {
        fs.rmSync(resolveJobPath(job.jobId), { force: true });
        pruned++;
      }
    }
  }

  return pruned;
}

// ---------------------------------------------------------------------------
// Job runner
// ---------------------------------------------------------------------------

/** Run a fork-sync job synchronously and return the completed job. */
export async function runKitForkSyncJob(
  forkId: string,
  kitId: string,
  opts: KitForkHealOptions = {},
): Promise<KitForkSyncJob> {
  const jobId = generateJobId();
  const job: KitForkSyncJob = {
    jobId,
    forkId,
    kitId,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  writeJob(job);

  const running = patchJob(jobId, "running", { startedAt: new Date().toISOString() });
  if (!running) throw new Error(`Job ${jobId} disappeared immediately after creation`);

  try {
    opts.onProgress?.(`[kit-fork-agent] Starting drift detection for fork: ${forkId}`);

    const reg = loadKitForkRegistration(kitId, forkId);
    if (!reg) {
      throw new Error(`Fork registration not found: kitId=${kitId} forkId=${forkId}`);
    }

    opts.onProgress?.("[kit-fork-agent] Detecting drift against upstream bundled kit...");
    const driftReport = detectKitForkDrift(reg);
    patchJob(jobId, "running", { driftReport });

    if (!driftReport.hasUpstreamUpdate && driftReport.overallSeverity === "none") {
      opts.onProgress?.("[kit-fork-agent] Fork is already in sync — no changes needed.");
      return patchJob(jobId, "completed", { driftReport, completedAt: new Date().toISOString() })!;
    }

    opts.onProgress?.("[kit-fork-agent] Building heal plan...");
    const healPlan = buildKitForkHealPlan(driftReport);
    patchJob(jobId, "running", { healPlan });

    if (healPlan.actions.length === 0) {
      opts.onProgress?.("[kit-fork-agent] No actionable changes — fork structure is clean.");
      return patchJob(jobId, "completed", {
        driftReport, healPlan, completedAt: new Date().toISOString(),
      })!;
    }

    opts.onProgress?.(`[kit-fork-agent] Applying ${healPlan.actions.length} heal action(s)...`);
    const healResult = applyKitForkHealPlan(healPlan, {
      dryRun: opts.dryRun ?? false,
      skipFiles: opts.skipFiles ?? [],
      onProgress: opts.onProgress,
      registration: reg,
    });

    if (healResult.updatedRegistration) {
      updateKitForkRegistration(healResult.updatedRegistration);
    }

    const completed = patchJob(jobId, "completed", {
      driftReport, healPlan, healResult, completedAt: new Date().toISOString(),
    })!;

    opts.onProgress?.(
      `[kit-fork-agent] Job ${jobId} complete — applied: ${healResult.appliedCount}, skipped: ${healResult.skippedCount}, errors: ${healResult.errorCount}`,
    );
    return completed;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    opts.onProgress?.(`[kit-fork-agent] Job ${jobId} failed: ${errMsg}`);
    return patchJob(jobId, "failed", { error: errMsg, completedAt: new Date().toISOString() })!;
  }
}

/**
 * Dispatch a fork-sync job asynchronously (fire-and-forget via setImmediate).
 * Returns the job ID immediately; the caller can poll with getKitForkSyncJob.
 */
export function dispatchKitForkSyncJobBackground(
  forkId: string,
  kitId: string,
  opts: KitForkHealOptions = {},
): string {
  const jobId = generateJobId();
  writeJob({
    jobId,
    forkId,
    kitId,
    status: "pending",
    createdAt: new Date().toISOString(),
  });

  setImmediate(() => {
    void runKitForkSyncJob(forkId, kitId, opts);
  });

  return jobId;
}
