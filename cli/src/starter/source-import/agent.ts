/**
 * Source Import Agent — background job runner.
 *
 * Orchestrates asynchronous source-import jobs within the CLI process.
 * Each job:
 *   1. Probes the source (github-source or skills-source).
 *   2. Builds a deterministic import plan.
 *   3. Either parks on `awaiting_confirmation` (skill imports + non-empty
 *      destinations + non-safe risk classes always park), or proceeds to
 *      materialize the plan.
 *   4. On success, resolves to a `SourceImportResult`.
 *
 * Job state layout (mirrors the Fork Sync Agent job pattern, zero
 * Paperclip coupling):
 *
 *   GROWTHUB_KIT_FORKS_HOME/source-import-jobs/<job-id>.json
 *     — canonical location for source-import jobs.  The fork does not yet
 *       exist when the job is created (import-in-flight) so unlike
 *       fork-sync jobs we do not try to co-locate them inside the fork.
 *
 * Two dispatch modes:
 *   runSourceImportJob()                — awaitable foreground execution
 *   dispatchSourceImportJobBackground() — fire-and-forget via setImmediate
 */

import fs from "node:fs";
import path from "node:path";
import { resolveKitForksHomeDir } from "../../config/kit-forks-home.js";
import { probeGithubRepoSource } from "./github-source.js";
import { probeSkillsSource } from "./skills-source.js";
import { buildSourceImportPlan, pendingConfirmations } from "./plan.js";
import { materializeImportPlan, PendingConfirmationError } from "./materialize.js";
import { DEFAULT_STARTER_KIT_ID } from "../init.js";
import type {
  SourceImportInput,
  SourceImportJob,
  SourceImportJobStatus,
  SourceImportPlan,
  SourceImportResult,
  SourceKind,
} from "./types.js";

// ---------------------------------------------------------------------------
// Job storage
// ---------------------------------------------------------------------------

function resolveJobsDir(): string {
  return path.resolve(resolveKitForksHomeDir(), "source-import-jobs");
}

function resolveJobPath(jobId: string): string {
  return path.resolve(resolveJobsDir(), `${jobId}.json`);
}

function generateJobId(): string {
  return `sij-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function writeJob(job: SourceImportJob): void {
  const p = resolveJobPath(job.jobId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(job, null, 2) + "\n", "utf8");
}

function readJobFile(p: string): SourceImportJob | null {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as SourceImportJob;
  } catch {
    return null;
  }
}

function patchJob(
  jobId: string,
  status: SourceImportJobStatus,
  patch: Partial<SourceImportJob> = {},
): SourceImportJob | null {
  const p = resolveJobPath(jobId);
  const job = readJobFile(p);
  if (!job) return null;
  const updated: SourceImportJob = { ...job, ...patch, status };
  fs.writeFileSync(p, JSON.stringify(updated, null, 2) + "\n", "utf8");
  return updated;
}

// ---------------------------------------------------------------------------
// Public read + lifecycle API
// ---------------------------------------------------------------------------

export function getSourceImportJob(jobId: string): SourceImportJob | null {
  return readJobFile(resolveJobPath(jobId));
}

export function listSourceImportJobs(filter?: {
  status?: SourceImportJobStatus;
  sourceKind?: SourceKind;
}): SourceImportJob[] {
  const dir = resolveJobsDir();
  if (!fs.existsSync(dir)) return [];
  const jobs: SourceImportJob[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const job = readJobFile(path.resolve(dir, entry.name));
    if (!job) continue;
    if (filter?.status && job.status !== filter.status) continue;
    if (filter?.sourceKind && job.sourceKind !== filter.sourceKind) continue;
    jobs.push(job);
  }
  return jobs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function cancelSourceImportJob(jobId: string): boolean {
  const job = getSourceImportJob(jobId);
  if (!job) return false;
  const terminal: SourceImportJobStatus[] = ["completed", "failed", "cancelled"];
  if (terminal.includes(job.status)) return false;
  patchJob(jobId, "cancelled");
  return true;
}

export function pruneSourceImportJobs(retentionMs = 7 * 24 * 60 * 60 * 1000): number {
  const dir = resolveJobsDir();
  if (!fs.existsSync(dir)) return 0;
  const cutoff = Date.now() - retentionMs;
  let pruned = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const full = path.resolve(dir, entry.name);
    const job = readJobFile(full);
    if (!job) continue;
    const terminal: SourceImportJobStatus[] = ["completed", "failed", "cancelled"];
    if (!terminal.includes(job.status)) continue;
    const ts = new Date(job.completedAt ?? job.createdAt).getTime();
    if (ts < cutoff) {
      fs.rmSync(full, { force: true });
      pruned++;
    }
  }
  return pruned;
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

async function probeAndPlan(
  input: SourceImportInput,
  destination: string,
): Promise<SourceImportPlan> {
  const starterKitId = input.starterKitId ?? DEFAULT_STARTER_KIT_ID;
  const importMode = input.importMode ?? "wrap";

  const probe =
    input.source.kind === "github-repo"
      ? await probeGithubRepoSource(input.source)
      : await probeSkillsSource(input.source);

  return buildSourceImportPlan({
    probe,
    destination,
    starterKitId,
    importMode,
  });
}

// ---------------------------------------------------------------------------
// Foreground runner
// ---------------------------------------------------------------------------

/**
 * Run a source-import job synchronously and return the completed job.
 * Jobs that need operator confirmation are parked in
 * `awaiting_confirmation` and can be resumed via `confirmAndResumeJob`.
 */
export async function runSourceImportJob(
  input: SourceImportInput,
): Promise<SourceImportJob> {
  const jobId = generateJobId();
  const destination = path.resolve(input.out);
  const sourceKind: SourceKind = input.source.kind;

  const initial: SourceImportJob = {
    jobId,
    importId: "pending",
    sourceKind,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  writeJob(initial);

  patchJob(jobId, "running", {
    startedAt: new Date().toISOString(),
    lastStep: "[source-import] probing source",
  });

  try {
    input.onProgress?.("[source-import] probing source");
    const plan = await probeAndPlan(input, destination);

    patchJob(jobId, "running", {
      importId: plan.importId,
      plan,
      lastStep: "[source-import] plan built",
    });

    const pending = pendingConfirmations(plan);
    const confirmedSet = new Set(input.confirmations ?? []);
    const outstanding = pending.filter((target) => !confirmedSet.has(target));

    if (outstanding.length > 0) {
      input.onProgress?.(
        `[source-import] ${outstanding.length} action(s) need operator confirmation — job parked`,
      );
      return patchJob(jobId, "awaiting_confirmation", {
        plan,
        pendingConfirmations: outstanding,
        lastStep: `awaiting confirmation: ${outstanding.join(", ")}`,
      })!;
    }

    const result = await materializeImportPlan({
      plan,
      confirmations: input.confirmations,
      remoteSyncMode: input.remoteSyncMode ?? "off",
      label: input.name,
      onProgress: (step) => {
        input.onProgress?.(step);
        patchJob(jobId, "running", { lastStep: step });
      },
      subdirectory:
        input.source.kind === "github-repo" ? input.source.subdirectory : undefined,
      branch:
        input.source.kind === "github-repo" ? input.source.branch : undefined,
    });

    return patchJob(jobId, "completed", {
      importId: result.importId,
      result,
      completedAt: new Date().toISOString(),
      lastStep: "[source-import] completed",
    })!;
  } catch (err) {
    if (err instanceof PendingConfirmationError) {
      return patchJob(jobId, "awaiting_confirmation", {
        pendingConfirmations: err.pending,
        lastStep: err.message,
      })!;
    }
    const msg = err instanceof Error ? err.message : String(err);
    input.onProgress?.(`[source-import] failed: ${msg}`);
    return patchJob(jobId, "failed", {
      error: msg,
      completedAt: new Date().toISOString(),
      lastStep: `[source-import] failed: ${msg}`,
    })!;
  }
}

// ---------------------------------------------------------------------------
// Confirmation resume
// ---------------------------------------------------------------------------

export interface ResumeSourceImportJobInput {
  jobId: string;
  confirmations: string[];
  remoteSyncMode?: "off" | "branch" | "pr";
  label?: string;
  subdirectory?: string;
  branch?: string;
  onProgress?: (step: string) => void;
}

/**
 * Resume a `awaiting_confirmation` source-import job with operator
 * acknowledgements. Any unsatisfied confirmation targets keep the job
 * parked.
 */
export async function confirmAndResumeSourceImportJob(
  input: ResumeSourceImportJobInput,
): Promise<SourceImportJob | null> {
  const job = getSourceImportJob(input.jobId);
  if (!job || job.status !== "awaiting_confirmation" || !job.plan) return null;

  const confirmedSet = new Set(input.confirmations);
  const pending = pendingConfirmations(job.plan).filter(
    (target) => !confirmedSet.has(target),
  );
  if (pending.length > 0) {
    return patchJob(input.jobId, "awaiting_confirmation", {
      pendingConfirmations: pending,
      lastStep: `still awaiting: ${pending.join(", ")}`,
    });
  }

  patchJob(input.jobId, "running", {
    startedAt: job.startedAt ?? new Date().toISOString(),
    pendingConfirmations: [],
    lastStep: "[source-import] resuming after confirmation",
  });

  try {
    const result = await materializeImportPlan({
      plan: job.plan,
      confirmations: input.confirmations,
      remoteSyncMode: input.remoteSyncMode ?? "off",
      label: input.label,
      onProgress: (step) => {
        input.onProgress?.(step);
        patchJob(input.jobId, "running", { lastStep: step });
      },
      subdirectory: input.subdirectory,
      branch: input.branch,
    });

    return patchJob(input.jobId, "completed", {
      importId: result.importId,
      result,
      completedAt: new Date().toISOString(),
      lastStep: "[source-import] completed",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return patchJob(input.jobId, "failed", {
      error: msg,
      completedAt: new Date().toISOString(),
      lastStep: `[source-import] failed: ${msg}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Background dispatch
// ---------------------------------------------------------------------------

/**
 * Dispatch a source-import job asynchronously (fire-and-forget via
 * setImmediate). Returns the job ID immediately; the caller can poll with
 * `getSourceImportJob`.
 */
export function dispatchSourceImportJobBackground(
  input: SourceImportInput,
): string {
  const jobId = generateJobId();
  writeJob({
    jobId,
    importId: "pending",
    sourceKind: input.source.kind,
    status: "pending",
    createdAt: new Date().toISOString(),
  });

  setImmediate(() => {
    void runSourceImportJob({ ...input }).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      patchJob(jobId, "failed", {
        error: msg,
        completedAt: new Date().toISOString(),
        lastStep: `[source-import] failed: ${msg}`,
      });
    });
  });

  return jobId;
}
