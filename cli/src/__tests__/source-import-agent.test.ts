/**
 * Source Import Agent — agent.ts lifecycle tests.
 *
 * Covers: job creation, listing/filtering, cancellation, pruning, and the
 * park-on-confirmation behaviour for skill imports (using skipProbe so no
 * network is required).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  runSourceImportJob,
  getSourceImportJob,
  listSourceImportJobs,
  cancelSourceImportJob,
  pruneSourceImportJobs,
} from "../starter/source-import/agent.js";

const ORIGINAL_ENV = { ...process.env };

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  process.env.GROWTHUB_KIT_FORKS_HOME = makeTempDir("sourceimport-home-");
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("runSourceImportJob — skill source parks on confirmation", () => {
  it("emits awaiting_confirmation for a skill import when confirmations are missing", async () => {
    const outDir = makeTempDir("si-out-");
    fs.rmSync(outDir, { recursive: true, force: true });

    const job = await runSourceImportJob({
      source: {
        kind: "skills-skill",
        skillRef: "acme/demo",
        version: "latest",
        skipProbe: true,
      },
      out: outDir,
    });

    expect(job.status).toBe("awaiting_confirmation");
    expect(job.pendingConfirmations?.length ?? 0).toBeGreaterThan(0);
    expect(job.plan).toBeTruthy();
    expect(job.sourceKind).toBe("skills-skill");
  });

  it("writes the job record into GROWTHUB_KIT_FORKS_HOME/source-import-jobs/", async () => {
    const outDir = makeTempDir("si-out-layout-");
    fs.rmSync(outDir, { recursive: true, force: true });
    const job = await runSourceImportJob({
      source: { kind: "skills-skill", skillRef: "acme/demo", skipProbe: true },
      out: outDir,
    });
    const jobsDir = path.resolve(
      process.env.GROWTHUB_KIT_FORKS_HOME!,
      "source-import-jobs",
    );
    const jobPath = path.resolve(jobsDir, `${job.jobId}.json`);
    expect(fs.existsSync(jobPath)).toBe(true);
  });
});

describe("getSourceImportJob / listSourceImportJobs", () => {
  it("returns null for unknown jobIds", () => {
    expect(getSourceImportJob("sij-missing")).toBeNull();
  });

  it("filters by status and sourceKind", async () => {
    const outDir = makeTempDir("si-out-list-");
    fs.rmSync(outDir, { recursive: true, force: true });
    await runSourceImportJob({
      source: { kind: "skills-skill", skillRef: "acme/demo", skipProbe: true },
      out: outDir,
    });
    const all = listSourceImportJobs();
    expect(all.length).toBeGreaterThan(0);
    const byStatus = listSourceImportJobs({ status: "awaiting_confirmation" });
    expect(byStatus.length).toBeGreaterThan(0);
    const skills = listSourceImportJobs({ sourceKind: "skills-skill" });
    expect(skills.every((j) => j.sourceKind === "skills-skill")).toBe(true);
    const empty = listSourceImportJobs({ sourceKind: "github-repo" });
    expect(empty).toEqual([]);
  });
});

describe("cancelSourceImportJob", () => {
  it("transitions a parked job to cancelled", async () => {
    const outDir = makeTempDir("si-out-cancel-");
    fs.rmSync(outDir, { recursive: true, force: true });
    const job = await runSourceImportJob({
      source: { kind: "skills-skill", skillRef: "acme/demo", skipProbe: true },
      out: outDir,
    });
    expect(cancelSourceImportJob(job.jobId)).toBe(true);
    const after = getSourceImportJob(job.jobId);
    expect(after?.status).toBe("cancelled");
  });

  it("refuses to cancel an already-terminal job", async () => {
    const outDir = makeTempDir("si-out-cancel-term-");
    fs.rmSync(outDir, { recursive: true, force: true });
    const job = await runSourceImportJob({
      source: { kind: "skills-skill", skillRef: "acme/demo", skipProbe: true },
      out: outDir,
    });
    cancelSourceImportJob(job.jobId);
    expect(cancelSourceImportJob(job.jobId)).toBe(false);
  });

  it("returns false for unknown jobIds", () => {
    expect(cancelSourceImportJob("sij-nope")).toBe(false);
  });
});

describe("pruneSourceImportJobs", () => {
  it("removes old terminal jobs and leaves fresh ones", async () => {
    const outDir = makeTempDir("si-out-prune-");
    fs.rmSync(outDir, { recursive: true, force: true });
    const job = await runSourceImportJob({
      source: { kind: "skills-skill", skillRef: "acme/demo", skipProbe: true },
      out: outDir,
    });
    cancelSourceImportJob(job.jobId);

    // Back-date the record by editing completedAt
    const jobsDir = path.resolve(
      process.env.GROWTHUB_KIT_FORKS_HOME!,
      "source-import-jobs",
    );
    const jobPath = path.resolve(jobsDir, `${job.jobId}.json`);
    const raw = JSON.parse(fs.readFileSync(jobPath, "utf8"));
    raw.completedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    fs.writeFileSync(jobPath, JSON.stringify(raw, null, 2) + "\n");

    const pruned = pruneSourceImportJobs(7 * 24 * 60 * 60 * 1000);
    expect(pruned).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(jobPath)).toBe(false);
  });

  it("returns 0 when no jobs directory exists", () => {
    expect(pruneSourceImportJobs()).toBe(0);
  });
});
