/**
 * Fork Sync — service layer.
 *
 * Bridges the validated bundled kit source (upstream of truth inside the CLI)
 * and a user's forked kit directory. Owns registration, baseline snapshots,
 * drift planning, job lifecycle (inline + detached self-heal), log and report
 * artifacts, and the worktree-branch hand-off.
 *
 * Storage layout (under $PAPERCLIP_HOME/kits/sync):
 *   registry.json                              — map of registered forks
 *   <forkId>/baseline/<kitVersion>/...         — frozen baseline snapshot
 *   <forkId>/jobs/<jobId>.json                 — structured job state
 *   <forkId>/jobs/<jobId>.log                  — streaming log
 *   <forkId>/reports/<jobId>.md                — human-readable report
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expandHomePrefix, resolvePaperclipHomeDir } from "../../config/home.js";
import {
  copyBundledKitSource,
  getBundledKitSource,
  validateKitDirectory,
  type BundledKitSourceInfo,
} from "../service.js";
import { buildTreeSnapshot, computeDriftSummary } from "./drift.js";
import { mergePackageJson, type PackageJsonMergeTrace } from "./merger.js";
import type {
  DriftSummary,
  ForkRegistry,
  ForkRegistryRecord,
  JobState,
  JobStatus,
} from "./types.js";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export function resolveSyncRoot(): string {
  return path.resolve(resolvePaperclipHomeDir(), "kits", "sync");
}

export function resolveRegistryPath(): string {
  return path.resolve(resolveSyncRoot(), "registry.json");
}

function resolveForkRoot(forkId: string): string {
  return path.resolve(resolveSyncRoot(), forkId);
}

function resolveBaselineRoot(forkId: string, version: string): string {
  return path.resolve(resolveForkRoot(forkId), "baseline", version);
}

function resolveJobsDir(forkId: string): string {
  return path.resolve(resolveForkRoot(forkId), "jobs");
}

function resolveReportsDir(forkId: string): string {
  return path.resolve(resolveForkRoot(forkId), "reports");
}

function resolveJobPaths(forkId: string, jobId: string): { statePath: string; logPath: string; reportPath: string } {
  return {
    statePath: path.resolve(resolveJobsDir(forkId), `${jobId}.json`),
    logPath: path.resolve(resolveJobsDir(forkId), `${jobId}.log`),
    reportPath: path.resolve(resolveReportsDir(forkId), `${jobId}.md`),
  };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

function readRegistry(): ForkRegistry {
  const registryPath = resolveRegistryPath();
  if (!fs.existsSync(registryPath)) {
    return { schemaVersion: 1, forks: [] };
  }
  const raw = JSON.parse(fs.readFileSync(registryPath, "utf8")) as ForkRegistry;
  if (raw.schemaVersion !== 1) {
    throw new Error(`Unsupported fork sync registry schema: ${raw.schemaVersion}`);
  }
  return raw;
}

function writeRegistry(registry: ForkRegistry): void {
  const registryPath = resolveRegistryPath();
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
}

function deriveForkId(kitId: string, forkPath: string, explicit?: string): string {
  if (explicit?.trim()) {
    const normalized = explicit.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(normalized)) {
      throw new Error(`Invalid fork id '${explicit}'. Use letters, digits, '-', or '_'.`);
    }
    return normalized;
  }
  const digest = crypto.createHash("sha1").update(forkPath).digest("hex").slice(0, 8);
  return `${kitId}-${digest}`;
}

function resolveForkPath(forkPath: string): string {
  return path.resolve(expandHomePrefix(forkPath));
}

// ---------------------------------------------------------------------------
// Tree hashing
// ---------------------------------------------------------------------------

function listFilesRecursively(root: string): string[] {
  const files: string[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      files.push(path.relative(root, full).split(path.sep).join("/"));
    }
  };
  walk(root);
  return files.sort();
}

function hashFile(absolutePath: string): string {
  const data = fs.readFileSync(absolutePath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

function snapshotTree(root: string): { path: string; hash: string }[] {
  if (!fs.existsSync(root)) return [];
  return listFilesRecursively(root).map((rel) => ({
    path: rel,
    hash: hashFile(path.resolve(root, rel)),
  }));
}

// ---------------------------------------------------------------------------
// Public init/list
// ---------------------------------------------------------------------------

export interface InitForkSyncInput {
  kitId: string;
  forkPath: string;
  forkId?: string;
  notes?: string;
}

export interface InitForkSyncResult {
  record: ForkRegistryRecord;
  baselineRoot: string;
  source: BundledKitSourceInfo;
}

export function initForkSync(input: InitForkSyncInput): InitForkSyncResult {
  const resolvedForkPath = resolveForkPath(input.forkPath);
  if (!fs.existsSync(resolvedForkPath) || !fs.statSync(resolvedForkPath).isDirectory()) {
    throw new Error(`Fork path does not exist or is not a directory: ${resolvedForkPath}`);
  }

  const source = getBundledKitSource(input.kitId);
  const forkId = deriveForkId(input.kitId, resolvedForkPath, input.forkId);
  const baselineRoot = resolveBaselineRoot(forkId, source.version);
  copyBundledKitSource(input.kitId, baselineRoot);

  const registry = readRegistry();
  const existing = registry.forks.findIndex((fork) => fork.forkId === forkId);
  const record: ForkRegistryRecord = {
    forkId,
    kitId: input.kitId,
    forkPath: resolvedForkPath,
    baselineVersion: source.version,
    baselineCapturedAt: new Date().toISOString(),
    notes: input.notes,
  };
  if (existing >= 0) {
    registry.forks[existing] = { ...registry.forks[existing], ...record };
  } else {
    registry.forks.push(record);
  }
  writeRegistry(registry);
  return { record, baselineRoot, source };
}

export function listRegisteredForks(): ForkRegistryRecord[] {
  return [...readRegistry().forks].sort((a, b) => a.forkId.localeCompare(b.forkId));
}

function requireForkRecord(forkId: string): ForkRegistryRecord {
  const record = readRegistry().forks.find((fork) => fork.forkId === forkId);
  if (!record) {
    throw new Error(`Unknown fork id '${forkId}'. Run 'growthub kit sync init' first.`);
  }
  return record;
}

// ---------------------------------------------------------------------------
// Plan (drift preview)
// ---------------------------------------------------------------------------

export interface PlanForkSyncResult {
  record: ForkRegistryRecord;
  summary: DriftSummary;
  upstreamVersion: string;
}

export function planForkSync(forkId: string): PlanForkSyncResult {
  const record = requireForkRecord(forkId);
  const source = getBundledKitSource(record.kitId);
  const baselineRoot = resolveBaselineRoot(forkId, record.baselineVersion);

  if (!fs.existsSync(baselineRoot)) {
    throw new Error(`Baseline snapshot missing for fork ${forkId} (expected at ${baselineRoot}). Re-run 'kit sync init'.`);
  }

  const baseline = buildTreeSnapshot(snapshotTree(baselineRoot));
  const upstream = buildTreeSnapshot(snapshotTree(source.assetRoot));
  const fork = buildTreeSnapshot(snapshotTree(record.forkPath));

  const summary = computeDriftSummary({
    kitId: record.kitId,
    forkId,
    baseline,
    upstream,
    fork,
    baselineVersion: record.baselineVersion,
    upstreamVersion: source.version,
    frozenPaths: source.frozenAssetPaths,
  });

  return { record, summary, upstreamVersion: source.version };
}

// ---------------------------------------------------------------------------
// Job state IO
// ---------------------------------------------------------------------------

function writeJobState(state: JobState): void {
  const { statePath } = resolveJobPaths(state.forkId, state.jobId);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function readJobState(forkId: string, jobId: string): JobState {
  const { statePath } = resolveJobPaths(forkId, jobId);
  if (!fs.existsSync(statePath)) {
    throw new Error(`Job ${jobId} not found for fork ${forkId}.`);
  }
  return JSON.parse(fs.readFileSync(statePath, "utf8")) as JobState;
}

function appendJobLog(logPath: string, line: string): void {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${line}\n`, "utf8");
}

function makeJobId(): string {
  const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const rand = crypto.randomBytes(3).toString("hex");
  return `${stamp}-${rand}`;
}

export function listJobs(forkId: string): JobState[] {
  const dir = resolveJobsDir(forkId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as JobState)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export function getJobStatus(forkId: string, jobId?: string): JobState {
  if (jobId) return readJobState(forkId, jobId);
  const jobs = listJobs(forkId);
  if (jobs.length === 0) throw new Error(`No sync jobs recorded for fork ${forkId}.`);
  return jobs[jobs.length - 1];
}

export function readJobReport(forkId: string, jobId?: string): string {
  const state = getJobStatus(forkId, jobId);
  if (!fs.existsSync(state.reportPath)) {
    throw new Error(`Report not found for job ${state.jobId} (${state.reportPath}).`);
  }
  return fs.readFileSync(state.reportPath, "utf8");
}

// ---------------------------------------------------------------------------
// Self-heal execution
// ---------------------------------------------------------------------------

export interface StartForkSyncInput {
  forkId: string;
  autoApply?: boolean;
  detach?: boolean;
  branchOverride?: string;
}

export interface StartForkSyncResult {
  state: JobState;
  detached: boolean;
}

function isGitRepo(root: string): boolean {
  return fs.existsSync(path.resolve(root, ".git"));
}

function runGit(cwd: string, args: string[]): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return {
    ok: result.status === 0,
    stdout: (result.stdout ?? "").toString(),
    stderr: (result.stderr ?? "").toString(),
  };
}

function createWorktreeBranch(forkPath: string, branch: string, log: (line: string) => void): boolean {
  if (!isGitRepo(forkPath)) {
    log(`fork is not a git repo — skipping branch creation`);
    return false;
  }
  const check = runGit(forkPath, ["rev-parse", "--verify", branch]);
  if (check.ok) {
    log(`branch ${branch} already exists — checking out`);
    const checkout = runGit(forkPath, ["checkout", branch]);
    if (!checkout.ok) log(`git checkout failed: ${checkout.stderr.trim()}`);
    return checkout.ok;
  }
  const create = runGit(forkPath, ["checkout", "-b", branch]);
  if (!create.ok) {
    log(`git checkout -b failed: ${create.stderr.trim()}`);
    return false;
  }
  log(`created branch ${branch}`);
  return true;
}

function applyDriftToFork(
  summary: DriftSummary,
  upstreamRoot: string,
  baselineRoot: string,
  forkRoot: string,
  autoApply: boolean,
  log: (line: string) => void,
): { applied: number; preserved: number; escalated: number; frozenConflicts: number; errors: number; packageTraces: PackageJsonMergeTrace[] } {
  let applied = 0;
  let preserved = 0;
  let escalated = 0;
  let frozenConflicts = 0;
  let errors = 0;
  const packageTraces: PackageJsonMergeTrace[] = [];

  for (const entry of summary.entries) {
    const absoluteForkPath = path.resolve(forkRoot, entry.path);
    try {
      switch (entry.action) {
        case "noop":
          break;
        case "preserve-local":
          preserved += 1;
          break;
        case "apply-upstream": {
          if (!autoApply) {
            log(`would apply upstream: ${entry.path}`);
            break;
          }
          const source = path.resolve(upstreamRoot, entry.path);
          if (!fs.existsSync(source)) {
            fs.rmSync(absoluteForkPath, { force: true });
            log(`applied upstream removal: ${entry.path}`);
            applied += 1;
            break;
          }
          fs.mkdirSync(path.dirname(absoluteForkPath), { recursive: true });
          fs.copyFileSync(source, absoluteForkPath);
          applied += 1;
          log(`applied upstream: ${entry.path}`);
          break;
        }
        case "merge-package-json": {
          const baselineFile = path.resolve(baselineRoot, entry.path);
          const upstreamFile = path.resolve(upstreamRoot, entry.path);
          if (!fs.existsSync(baselineFile) || !fs.existsSync(upstreamFile) || !fs.existsSync(absoluteForkPath)) {
            log(`package.json merge skipped (missing side): ${entry.path}`);
            escalated += 1;
            break;
          }
          const result = mergePackageJson(
            fs.readFileSync(baselineFile, "utf8"),
            fs.readFileSync(upstreamFile, "utf8"),
            fs.readFileSync(absoluteForkPath, "utf8"),
          );
          packageTraces.push(...result.trace);
          if (autoApply) {
            fs.writeFileSync(absoluteForkPath, `${JSON.stringify(result.merged, null, 2)}\n`, "utf8");
            applied += 1;
            log(`merged package.json: ${entry.path}`);
          } else {
            log(`would merge package.json: ${entry.path}`);
          }
          break;
        }
        case "escalate-review":
          escalated += 1;
          log(`escalate: ${entry.path} — ${entry.reason}`);
          break;
        case "skip-frozen-conflict":
          frozenConflicts += 1;
          log(`frozen conflict held: ${entry.path} — ${entry.reason}`);
          break;
      }
    } catch (err) {
      errors += 1;
      log(`error handling ${entry.path}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { applied, preserved, escalated, frozenConflicts, errors, packageTraces };
}

function writeReport(
  reportPath: string,
  state: JobState,
  summary: DriftSummary,
  packageTraces: PackageJsonMergeTrace[],
): void {
  const lines: string[] = [];
  lines.push(`# Fork Sync Report — ${state.kitId}`);
  lines.push("");
  lines.push(`- Fork ID: ${state.forkId}`);
  lines.push(`- Job ID: ${state.jobId}`);
  lines.push(`- Status: ${state.status}`);
  lines.push(`- Mode: ${state.mode}  Auto-apply: ${state.autoApply ? "yes" : "no"}`);
  lines.push(`- Baseline version: ${state.baselineVersion}`);
  lines.push(`- Upstream version: ${state.upstreamVersion}`);
  if (state.branch) lines.push(`- Worktree branch: ${state.branch}`);
  lines.push(`- Started: ${state.startedAt}`);
  if (state.endedAt) lines.push(`- Ended: ${state.endedAt}`);
  lines.push("");

  lines.push("## Totals");
  lines.push("");
  lines.push(`- unchanged: ${summary.totals.unchanged}`);
  lines.push(`- apply-upstream: ${summary.totals.applyUpstream}`);
  lines.push(`- preserve-local: ${summary.totals.preserveLocal}`);
  lines.push(`- merge-package-json: ${summary.totals.mergePackageJson}`);
  lines.push(`- escalate-review: ${summary.totals.escalateReview}`);
  lines.push(`- frozen-conflicts: ${summary.totals.frozenConflicts}`);
  lines.push("");

  const escalations = summary.entries.filter((entry) => entry.action === "escalate-review" || entry.action === "skip-frozen-conflict");
  if (escalations.length > 0) {
    lines.push("## Review queue");
    lines.push("");
    for (const entry of escalations) {
      lines.push(`- \`${entry.path}\` — ${entry.classification} — ${entry.reason}`);
    }
    lines.push("");
  }

  if (packageTraces.length > 0) {
    lines.push("## package.json merge trace");
    lines.push("");
    for (const trace of packageTraces) {
      lines.push(`- ${trace.field}: ${trace.action}${trace.detail ? ` — ${trace.detail}` : ""}`);
    }
    lines.push("");
  }

  lines.push("## Per-file actions");
  lines.push("");
  lines.push("| Path | Classification | Action | Frozen |");
  lines.push("| --- | --- | --- | --- |");
  for (const entry of summary.entries) {
    if (entry.action === "noop") continue;
    lines.push(`| \`${entry.path}\` | ${entry.classification} | ${entry.action} | ${entry.frozen ? "yes" : "no"} |`);
  }

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");
}

function deriveStatus(summary: { escalated: number; frozenConflicts: number; errors: number }, autoApply: boolean): JobStatus {
  if (summary.errors > 0) return "failed";
  if (!autoApply) return "needs-review";
  if (summary.escalated > 0 || summary.frozenConflicts > 0) return "needs-review";
  return "succeeded";
}

export function executeSyncJob(input: {
  forkId: string;
  jobId: string;
  autoApply: boolean;
  branchOverride?: string;
  mode: "inline" | "detached";
}): JobState {
  const record = requireForkRecord(input.forkId);
  const source = getBundledKitSource(record.kitId);
  const baselineRoot = resolveBaselineRoot(input.forkId, record.baselineVersion);
  const branch = input.branchOverride?.trim() || `sync/${record.kitId}-${source.version}-${input.jobId.slice(-6)}`;
  const { logPath, reportPath } = resolveJobPaths(input.forkId, input.jobId);
  const log = (line: string) => appendJobLog(logPath, line);

  let state: JobState = {
    jobId: input.jobId,
    forkId: input.forkId,
    kitId: record.kitId,
    status: "running",
    mode: input.mode,
    autoApply: input.autoApply,
    baselineVersion: record.baselineVersion,
    upstreamVersion: source.version,
    startedAt: new Date().toISOString(),
    pid: process.pid,
    branch,
    logPath,
    reportPath,
  };
  writeJobState(state);
  log(`starting sync job ${input.jobId} for fork ${input.forkId} (${record.kitId})`);
  log(`baseline=${record.baselineVersion}  upstream=${source.version}  autoApply=${input.autoApply}`);

  try {
    const baseline = buildTreeSnapshot(snapshotTree(baselineRoot));
    const upstream = buildTreeSnapshot(snapshotTree(source.assetRoot));
    const fork = buildTreeSnapshot(snapshotTree(record.forkPath));

    const summary = computeDriftSummary({
      kitId: record.kitId,
      forkId: input.forkId,
      baseline,
      upstream,
      fork,
      baselineVersion: record.baselineVersion,
      upstreamVersion: source.version,
      frozenPaths: source.frozenAssetPaths,
    });

    if (input.autoApply) {
      const branchCreated = createWorktreeBranch(record.forkPath, branch, log);
      if (!branchCreated && isGitRepo(record.forkPath)) {
        log(`proceeding without dedicated branch — changes will land on current branch`);
      }
    }

    const applyResult = applyDriftToFork(
      summary,
      source.assetRoot,
      baselineRoot,
      record.forkPath,
      input.autoApply,
      log,
    );

    const validation = validateKitDirectory(record.forkPath);
    if (!validation.valid) {
      log(`post-sync validation failed with ${validation.errors.length} errors`);
      applyResult.errors += validation.errors.length;
    } else {
      log(`post-sync validation: VALID`);
    }

    state = {
      ...state,
      status: deriveStatus(applyResult, input.autoApply),
      endedAt: new Date().toISOString(),
      summary: {
        applied: applyResult.applied,
        preserved: applyResult.preserved,
        escalated: applyResult.escalated,
        frozenConflicts: applyResult.frozenConflicts,
        errors: applyResult.errors,
      },
    };
    writeJobState(state);
    writeReport(reportPath, state, summary, applyResult.packageTraces);

    if (input.autoApply && applyResult.errors === 0) {
      const registry = readRegistry();
      const idx = registry.forks.findIndex((fork) => fork.forkId === input.forkId);
      if (idx >= 0) {
        registry.forks[idx].lastSyncAt = state.endedAt;
        registry.forks[idx].lastSyncJobId = state.jobId;
        registry.forks[idx].baselineVersion = source.version;
        registry.forks[idx].baselineCapturedAt = state.endedAt ?? new Date().toISOString();
        writeRegistry(registry);
        const newBaselineRoot = resolveBaselineRoot(input.forkId, source.version);
        copyBundledKitSource(record.kitId, newBaselineRoot);
        log(`baseline advanced to ${source.version}`);
      }
    }

    log(`sync job ${input.jobId} finished with status=${state.status}`);
    return state;
  } catch (err) {
    state = {
      ...state,
      status: "failed",
      endedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    };
    writeJobState(state);
    log(`sync job ${input.jobId} failed: ${state.error}`);
    return state;
  }
}

export function startSyncJob(input: StartForkSyncInput): StartForkSyncResult {
  const record = requireForkRecord(input.forkId);
  const jobId = makeJobId();
  const { statePath, logPath, reportPath } = resolveJobPaths(input.forkId, jobId);

  const initialState: JobState = {
    jobId,
    forkId: input.forkId,
    kitId: record.kitId,
    status: "queued",
    mode: input.detach ? "detached" : "inline",
    autoApply: input.autoApply ?? false,
    baselineVersion: record.baselineVersion,
    upstreamVersion: record.baselineVersion,
    startedAt: new Date().toISOString(),
    branch: input.branchOverride,
    logPath,
    reportPath,
  };
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  writeJobState(initialState);

  if (input.detach) {
    const childScript = resolveChildRunnerScript();
    const child = spawn(process.execPath, [childScript], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        GROWTHUB_SYNC_FORK_ID: input.forkId,
        GROWTHUB_SYNC_JOB_ID: jobId,
        GROWTHUB_SYNC_AUTO_APPLY: String(input.autoApply ?? false),
        GROWTHUB_SYNC_BRANCH: input.branchOverride ?? "",
      },
    });
    child.unref();
    const updated: JobState = { ...initialState, status: "running", pid: child.pid };
    writeJobState(updated);
    return { state: updated, detached: true };
  }

  const finalState = executeSyncJob({
    forkId: input.forkId,
    jobId,
    autoApply: input.autoApply ?? false,
    branchOverride: input.branchOverride,
    mode: "inline",
  });
  return { state: finalState, detached: false };
}

function resolveChildRunnerScript(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "job-runner.js");
}
