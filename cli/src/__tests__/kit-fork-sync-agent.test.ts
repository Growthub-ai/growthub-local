/**
 * Kit Fork Sync Agent — Unit Tests
 *
 * Covers:
 *   - Job lifecycle: pending → running → completed / failed
 *   - getKitForkSyncJob, listKitForkSyncJobs, cancelKitForkSyncJob
 *   - pruneKitForkSyncJobs (retention-based cleanup)
 *   - dispatchKitForkSyncJobBackground (fire-and-forget ID return)
 *   - runKitForkSyncJob: fails gracefully for missing registration
 *   - runKitForkSyncJob: completes for a fork that is already in sync
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  runKitForkSyncJob,
  dispatchKitForkSyncJobBackground,
  getKitForkSyncJob,
  listKitForkSyncJobs,
  cancelKitForkSyncJob,
  pruneKitForkSyncJobs,
} from "../kits/fork-sync-agent.js";
import {
  registerKitFork,
  deregisterKitFork,
} from "../kits/fork-registry.js";

const ORIGINAL_ENV = { ...process.env };

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function copyKitAssets(destRoot: string, kitId = "creative-strategist-v1"): void {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const sourceRoot = path.resolve(moduleDir, `../../assets/worker-kits/${kitId}`);
  fs.cpSync(sourceRoot, destRoot, { recursive: true });
}

function resolveOrphanJobsRoot(): string {
  const home = process.env.GROWTHUB_KIT_FORKS_HOME!;
  return path.resolve(home, "orphan-jobs");
}

function writeRawJob(jobId: string, data: object): void {
  const dir = resolveOrphanJobsRoot();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.resolve(dir, `${jobId}.json`), JSON.stringify(data, null, 2) + "\n");
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  process.env.GROWTHUB_KIT_FORKS_HOME = makeTempDir("growthub-kit-forks-");
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

// ---------------------------------------------------------------------------
// runKitForkSyncJob
// ---------------------------------------------------------------------------

describe("runKitForkSyncJob", () => {
  it("returns failed status when fork registration is not found", async () => {
    const job = await runKitForkSyncJob("nonexistent-fork", "creative-strategist-v1");
    expect(job.status).toBe("failed");
    expect(job.error).toMatch(/not found/i);
    expect(job.completedAt).toBeTruthy();
  });

  it("completes successfully when fork is already at same version as upstream", async () => {
    const forkDir = makeTempDir("fork-insync-");
    copyKitAssets(forkDir, "creative-strategist-v1");

    // Register the fork at a very high version to guarantee "already in sync" path
    const reg = registerKitFork({
      forkPath: forkDir,
      kitId: "creative-strategist-v1",
      baseVersion: "99.99.99",
    });

    const progressSteps: string[] = [];
    const job = await runKitForkSyncJob(reg.forkId, reg.kitId, {
      onProgress: (s) => progressSteps.push(s),
    });

    expect(job.status).toBe("completed");
    expect(job.forkId).toBe(reg.forkId);
    expect(job.kitId).toBe(reg.kitId);
    expect(job.completedAt).toBeTruthy();
    expect(progressSteps.some((s) => s.includes("drift"))).toBe(true);

    deregisterKitFork(reg.kitId, reg.forkId);
  });

  it("persists job to disk and is readable via getKitForkSyncJob", async () => {
    const job = await runKitForkSyncJob("ghost-fork", "creative-strategist-v1");

    const fromDisk = getKitForkSyncJob(job.jobId);
    expect(fromDisk).not.toBeNull();
    expect(fromDisk!.jobId).toBe(job.jobId);
    expect(fromDisk!.status).toBe(job.status);
  });

  it("executes a dry-run without writing files to the fork", async () => {
    const forkDir = makeTempDir("fork-dryrun-");
    copyKitAssets(forkDir, "creative-strategist-v1");

    // Remove skills.md (a real upstream file) to create drift
    const skillsPath = path.resolve(forkDir, "skills.md");
    if (fs.existsSync(skillsPath)) fs.rmSync(skillsPath);

    const reg = registerKitFork({
      forkPath: forkDir,
      kitId: "creative-strategist-v1",
      baseVersion: "0.0.1",
    });

    await runKitForkSyncJob(reg.forkId, reg.kitId, { dryRun: true });

    // skills.md must still not exist (dry run — no files should be written)
    expect(fs.existsSync(skillsPath)).toBe(false);

    deregisterKitFork(reg.kitId, reg.forkId);
  });
});

// ---------------------------------------------------------------------------
// getKitForkSyncJob
// ---------------------------------------------------------------------------

describe("getKitForkSyncJob", () => {
  it("returns null for a non-existent job ID", () => {
    const result = getKitForkSyncJob("nonexistent-job-xyz");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listKitForkSyncJobs
// ---------------------------------------------------------------------------

describe("listKitForkSyncJobs", () => {
  it("returns empty array when jobs directory does not exist", () => {
    expect(listKitForkSyncJobs()).toEqual([]);
  });

  it("returns all persisted jobs", async () => {
    const j1 = await runKitForkSyncJob("fork-a", "creative-strategist-v1");
    const j2 = await runKitForkSyncJob("fork-b", "creative-strategist-v1");

    const all = listKitForkSyncJobs();
    expect(all.some((j) => j.jobId === j1.jobId)).toBe(true);
    expect(all.some((j) => j.jobId === j2.jobId)).toBe(true);
  });

  it("filters by forkId", async () => {
    await runKitForkSyncJob("fork-alpha", "creative-strategist-v1");
    await runKitForkSyncJob("fork-beta", "creative-strategist-v1");

    const alpha = listKitForkSyncJobs({ forkId: "fork-alpha" });
    expect(alpha.every((j) => j.forkId === "fork-alpha")).toBe(true);
  });

  it("filters by status", async () => {
    await runKitForkSyncJob("some-fork", "creative-strategist-v1");

    const failed = listKitForkSyncJobs({ status: "failed" });
    expect(failed.every((j) => j.status === "failed")).toBe(true);
  });

  it("returns jobs sorted by createdAt", () => {
    // Write two jobs with distinct, deterministic timestamps
    const jobId1 = "sort-test-job-a";
    const jobId2 = "sort-test-job-b";
    writeRawJob(jobId1, {
      jobId: jobId1, forkId: "fork-x", kitId: "creative-strategist-v1",
      status: "completed", createdAt: "2024-01-01T00:00:00.000Z",
    });
    writeRawJob(jobId2, {
      jobId: jobId2, forkId: "fork-y", kitId: "creative-strategist-v1",
      status: "completed", createdAt: "2024-02-01T00:00:00.000Z",
    });

    const all = listKitForkSyncJobs();
    const idx1 = all.findIndex((j) => j.jobId === jobId1);
    const idx2 = all.findIndex((j) => j.jobId === jobId2);
    expect(idx1).toBeLessThan(idx2);
  });
});

// ---------------------------------------------------------------------------
// cancelKitForkSyncJob
// ---------------------------------------------------------------------------

describe("cancelKitForkSyncJob", () => {
  it("cancels a pending job", () => {
    const jobId = "test-pending-cancel";
    writeRawJob(jobId, {
      jobId,
      forkId: "some-fork",
      kitId: "creative-strategist-v1",
      status: "pending",
      createdAt: new Date().toISOString(),
    });

    expect(cancelKitForkSyncJob(jobId)).toBe(true);
    const job = getKitForkSyncJob(jobId);
    expect(job!.status).toBe("cancelled");
  });

  it("returns false for a non-existent job", () => {
    expect(cancelKitForkSyncJob("no-such-job")).toBe(false);
  });

  it("returns false for an already-completed job", () => {
    const jobId = "test-completed-cancel";
    writeRawJob(jobId, {
      jobId,
      forkId: "some-fork",
      kitId: "creative-strategist-v1",
      status: "completed",
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });

    expect(cancelKitForkSyncJob(jobId)).toBe(false);
  });

  it("returns false for an already-failed job", () => {
    const jobId = "test-failed-cancel";
    writeRawJob(jobId, {
      jobId,
      forkId: "some-fork",
      kitId: "creative-strategist-v1",
      status: "failed",
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });

    expect(cancelKitForkSyncJob(jobId)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// pruneKitForkSyncJobs
// ---------------------------------------------------------------------------

describe("pruneKitForkSyncJobs", () => {
  it("returns 0 when no jobs directory", () => {
    expect(pruneKitForkSyncJobs()).toBe(0);
  });

  it("prunes completed jobs older than retention window", () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const jobId = "old-completed-job";
    writeRawJob(jobId, {
      jobId,
      forkId: "some-fork",
      kitId: "creative-strategist-v1",
      status: "completed",
      createdAt: tenDaysAgo,
      completedAt: tenDaysAgo,
    });

    const pruned = pruneKitForkSyncJobs(7 * 24 * 60 * 60 * 1000);
    expect(pruned).toBeGreaterThanOrEqual(1);
    expect(getKitForkSyncJob(jobId)).toBeNull();
  });

  it("does not prune jobs within the retention window", () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const jobId = "recent-completed-job";
    writeRawJob(jobId, {
      jobId,
      forkId: "some-fork",
      kitId: "creative-strategist-v1",
      status: "completed",
      createdAt: oneHourAgo,
      completedAt: oneHourAgo,
    });

    pruneKitForkSyncJobs(7 * 24 * 60 * 60 * 1000);
    expect(getKitForkSyncJob(jobId)).not.toBeNull();
  });

  it("does not prune running or pending jobs regardless of age", () => {
    const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const jobId = "old-pending-job";
    writeRawJob(jobId, {
      jobId,
      forkId: "some-fork",
      kitId: "creative-strategist-v1",
      status: "pending",
      createdAt: oldDate,
    });

    pruneKitForkSyncJobs(7 * 24 * 60 * 60 * 1000);
    expect(getKitForkSyncJob(jobId)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// dispatchKitForkSyncJobBackground
// ---------------------------------------------------------------------------

describe("dispatchKitForkSyncJobBackground", () => {
  it("returns a job ID string immediately", () => {
    const jobId = dispatchKitForkSyncJobBackground("some-fork", "creative-strategist-v1");
    expect(typeof jobId).toBe("string");
    expect(jobId).toMatch(/^kfj-/);
  });

  it("creates a pending job on disk immediately", () => {
    const jobId = dispatchKitForkSyncJobBackground("some-fork", "creative-strategist-v1");
    const job = getKitForkSyncJob(jobId);
    expect(job).not.toBeNull();
    expect(["pending", "running", "completed", "failed"]).toContain(job!.status);
  });
});
