import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { resolvePaperclipHomeDir } from "../config/home.js";
import {
  copyBundledKitSource,
  getBundledKitSourceInfo,
  validateKitDirectory,
} from "./service.js";

const REGISTRY_VERSION = 1;
const BASELINE_VERSION = 1;

export type KitForkSyncJobStatus = "queued" | "running" | "succeeded" | "needs_review" | "failed";

export interface KitForkRegistration {
  id: string;
  kitId: string;
  localKitId: string;
  forkPath: string;
  repoRoot: string;
  repoRelativePath: string;
  baseBranch: string;
  branchPrefix: string;
  createdAt: string;
  updatedAt: string;
  baselineVersion: string | null;
  lastSyncedAt: string | null;
  lastSyncedUpstreamVersion: string | null;
  lastJobId: string | null;
}

interface KitForkSyncRegistry {
  version: number;
  forks: KitForkRegistration[];
}

interface KitForkBaselineMetadata {
  version: number;
  forkId: string;
  kitId: string;
  upstreamVersion: string;
  createdAt: string;
}

export interface KitForkSyncPlan {
  registration: KitForkRegistration;
  upstreamVersion: string;
  baselineVersion: string | null;
  dirtyWorkingTree: boolean;
  upstreamChangedFiles: number;
  forkCustomizedFiles: number;
  potentialConflictFiles: string[];
  localOnlyFiles: string[];
  upstreamOnlyFiles: string[];
  packageJsonFiles: string[];
  previewFiles: string[];
}

export interface KitForkSyncPackageUpdate {
  filePath: string;
  field: string;
  packageName: string;
  previousValue: string | null;
  nextValue: string | null;
  source: "upstream" | "fork";
  reason: string;
}

export interface KitForkSyncJobSummary {
  upstreamVersion: string;
  baselineVersion: string | null;
  upstreamChangedFiles: number;
  forkCustomizedFiles: number;
  mergedFiles: number;
  upstreamAppliedFiles: number;
  preservedForkFiles: number;
  removedFiles: number;
  conflictFiles: string[];
  localOnlyFiles: string[];
  validationErrors: string[];
  packageUpdates: KitForkSyncPackageUpdate[];
  commitCreated: boolean;
}

export interface KitForkSyncJobState {
  id: string;
  forkId: string;
  kitId: string;
  status: KitForkSyncJobStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  pid: number | null;
  branchName: string;
  worktreePath: string;
  logPath: string;
  reportPath: string;
  skillPath: string;
  error: string | null;
  summary: KitForkSyncJobSummary | null;
}

export interface RegisterKitForkInput {
  forkId?: string;
  kitId: string;
  forkPath: string;
  baseBranch?: string;
  branchPrefix?: string;
  refreshBaseline?: boolean;
}

export interface RegisterKitForkResult {
  registration: KitForkRegistration;
  baselinePath: string;
  upstreamVersion: string;
}

export interface StartKitForkSyncJobResult {
  job: KitForkSyncJobState;
}

type FileSnapshot = {
  exists: boolean;
  buffer: Buffer | null;
  isText: boolean;
};

type MergeTextResult = {
  text: string;
  conflicted: boolean;
};

type MergePackageJsonResult = {
  text: string;
  updates: KitForkSyncPackageUpdate[];
  conflicts: string[];
};

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeIdentifier(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const sanitized = trimmed.replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (sanitized.length === 0) {
    throw new Error("Fork id must contain at least one letter or number.");
  }
  return sanitized;
}

function sanitizeBranchSegment(value: string): string {
  return sanitizeIdentifier(value).replace(/\.+/g, "-");
}

function resolveForkSyncRoot(): string {
  return path.resolve(resolvePaperclipHomeDir(), "kits", "fork-sync");
}

function resolveRegistryPath(): string {
  return path.resolve(resolveForkSyncRoot(), "registry.json");
}

function resolveBaselineRoot(forkId: string): string {
  return path.resolve(resolveForkSyncRoot(), "baselines", sanitizeIdentifier(forkId));
}

function resolveBaselineSnapshotPath(forkId: string): string {
  return path.resolve(resolveBaselineRoot(forkId), "snapshot");
}

function resolveBaselineMetaPath(forkId: string): string {
  return path.resolve(resolveBaselineRoot(forkId), "baseline.json");
}

function resolveJobsRoot(): string {
  return path.resolve(resolveForkSyncRoot(), "jobs");
}

function resolveJobStatePath(jobId: string): string {
  return path.resolve(resolveJobsRoot(), `${jobId}.json`);
}

function resolveJobLogPath(jobId: string): string {
  return path.resolve(resolveJobsRoot(), `${jobId}.log`);
}

function resolveJobReportPath(jobId: string): string {
  return path.resolve(resolveJobsRoot(), `${jobId}-report.json`);
}

function resolveJobSkillPath(jobId: string): string {
  return path.resolve(resolveJobsRoot(), `${jobId}-skill.md`);
}

function resolveWorktreesRoot(): string {
  return path.resolve(resolveForkSyncRoot(), "worktrees");
}

function resolveWorktreePath(forkId: string, jobId: string): string {
  return path.resolve(resolveWorktreesRoot(), sanitizeIdentifier(forkId), jobId);
}

function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeJsonFile(filePath: string, payload: unknown): void {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function appendJobLog(job: KitForkSyncJobState, message: string): void {
  ensureParentDir(job.logPath);
  fs.appendFileSync(job.logPath, `[${new Date().toISOString()}] ${message}\n`, "utf8");
}

function listRelativeFiles(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) return [];
  const files: string[] = [];
  const walk = (currentDir: string) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.resolve(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.isFile()) {
        files.push(path.relative(rootDir, fullPath).split(path.sep).join("/"));
      }
    }
  };
  walk(rootDir);
  return files.sort();
}

function buffersEqual(left: Buffer | null, right: Buffer | null): boolean {
  if (left === null || right === null) return left === right;
  return left.equals(right);
}

function fileSnapshotsEqual(left: FileSnapshot, right: FileSnapshot): boolean {
  return left.exists === right.exists && buffersEqual(left.buffer, right.buffer);
}

function isProbablyText(buffer: Buffer): boolean {
  if (buffer.length === 0) return true;
  const sample = buffer.subarray(0, Math.min(buffer.length, 1024));
  for (const byte of sample) {
    if (byte === 9 || byte === 10 || byte === 13) continue;
    if (byte < 32 || byte === 127) return false;
  }
  return true;
}

function readFileSnapshot(rootDir: string, relativePath: string): FileSnapshot {
  const fullPath = path.resolve(rootDir, relativePath);
  if (!fs.existsSync(fullPath)) {
    return { exists: false, buffer: null, isText: true };
  }
  const buffer = fs.readFileSync(fullPath);
  return {
    exists: true,
    buffer,
    isText: isProbablyText(buffer),
  };
}

function detectGitRepoRoot(cwd: string): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function detectGitBranch(cwd: string): string | null {
  try {
    const branch = execFileSync("git", ["branch", "--show-current"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return branch.length > 0 ? branch : null;
  } catch {
    return null;
  }
}

function detectPreferredBaseBranch(repoRoot: string): string {
  return detectGitBranch(repoRoot) ?? "main";
}

function pathRelativeToRepo(repoRoot: string, targetPath: string): string {
  const relative = path.relative(repoRoot, targetPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${targetPath} must live inside git repo ${repoRoot}.`);
  }
  return relative.split(path.sep).join("/");
}

function hasGitChanges(repoRoot: string, relativePath: string): boolean {
  try {
    const status = execFileSync("git", ["status", "--porcelain", "--", relativePath], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return status.length > 0;
  } catch {
    return false;
  }
}

function ensureKitIsValid(kitPath: string): string {
  const validation = validateKitDirectory(kitPath);
  if (!validation.valid) {
    const detail = validation.errors.map((error) => `${error.field}: ${error.message}`).join("; ");
    throw new Error(`Fork path is not a valid worker kit: ${detail}`);
  }
  return validation.kitId;
}

function readRegistry(): KitForkSyncRegistry {
  const filePath = resolveRegistryPath();
  if (!fs.existsSync(filePath)) {
    return { version: REGISTRY_VERSION, forks: [] };
  }
  const parsed = readJsonFile<KitForkSyncRegistry>(filePath);
  if (!Array.isArray(parsed.forks)) {
    return { version: REGISTRY_VERSION, forks: [] };
  }
  return {
    version: parsed.version ?? REGISTRY_VERSION,
    forks: parsed.forks,
  };
}

function writeRegistry(registry: KitForkSyncRegistry): void {
  writeJsonFile(resolveRegistryPath(), registry);
}

function readBaselineMetadata(forkId: string): KitForkBaselineMetadata | null {
  const filePath = resolveBaselineMetaPath(forkId);
  if (!fs.existsSync(filePath)) return null;
  return readJsonFile<KitForkBaselineMetadata>(filePath);
}

function writeBaselineSnapshot(forkId: string, kitId: string): KitForkBaselineMetadata {
  const info = copyBundledKitSource(kitId, resolveBaselineSnapshotPath(forkId));
  const metadata: KitForkBaselineMetadata = {
    version: BASELINE_VERSION,
    forkId,
    kitId: info.id,
    upstreamVersion: info.version,
    createdAt: nowIso(),
  };
  writeJsonFile(resolveBaselineMetaPath(forkId), metadata);
  return metadata;
}

function readJobStateRaw(jobId: string): KitForkSyncJobState | null {
  const filePath = resolveJobStatePath(jobId);
  if (!fs.existsSync(filePath)) return null;
  return readJsonFile<KitForkSyncJobState>(filePath);
}

function isPidRunning(pid: number | null): boolean {
  if (!pid || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function writeJobState(job: KitForkSyncJobState): void {
  writeJsonFile(resolveJobStatePath(job.id), job);
}

function normalizeJobState(job: KitForkSyncJobState): KitForkSyncJobState {
  if (
    (job.status === "queued" || job.status === "running")
    && job.finishedAt === null
    && job.pid !== null
    && !isPidRunning(job.pid)
  ) {
    const nextJob: KitForkSyncJobState = {
      ...job,
      status: "failed",
      finishedAt: nowIso(),
      error: job.error ?? "Detached fork sync job stopped before reporting completion.",
    };
    writeJobState(nextJob);
    return nextJob;
  }
  return job;
}

function getRegistrationOrThrow(forkId: string): KitForkRegistration {
  const registry = readRegistry();
  const registration = registry.forks.find((entry) => entry.id === sanitizeIdentifier(forkId));
  if (!registration) {
    throw new Error(`Fork registration "${forkId}" was not found. Run "growthub kit sync init" first.`);
  }
  return registration;
}

function summarizeDrift(
  baselineRoot: string,
  upstreamRoot: string,
  forkRoot: string,
): Omit<KitForkSyncPlan, "registration" | "upstreamVersion" | "baselineVersion" | "dirtyWorkingTree"> {
  const fileSet = new Set<string>([
    ...listRelativeFiles(baselineRoot),
    ...listRelativeFiles(upstreamRoot),
    ...listRelativeFiles(forkRoot),
  ]);
  const potentialConflictFiles: string[] = [];
  const localOnlyFiles: string[] = [];
  const upstreamOnlyFiles: string[] = [];
  const packageJsonFiles: string[] = [];
  let upstreamChangedFiles = 0;
  let forkCustomizedFiles = 0;

  for (const relativePath of [...fileSet].sort()) {
    const baseline = readFileSnapshot(baselineRoot, relativePath);
    const upstream = readFileSnapshot(upstreamRoot, relativePath);
    const fork = readFileSnapshot(forkRoot, relativePath);
    const upstreamChanged = !fileSnapshotsEqual(baseline, upstream);
    const forkChanged = !fileSnapshotsEqual(baseline, fork);

    if (upstreamChanged) upstreamChangedFiles += 1;
    if (forkChanged) forkCustomizedFiles += 1;

    if (!baseline.exists && fork.exists && !upstream.exists) {
      localOnlyFiles.push(relativePath);
    }
    if (!baseline.exists && upstream.exists && !fork.exists) {
      upstreamOnlyFiles.push(relativePath);
    }
    if (relativePath.endsWith("package.json") && (upstreamChanged || forkChanged)) {
      packageJsonFiles.push(relativePath);
    }
    if (upstreamChanged && forkChanged && !fileSnapshotsEqual(fork, upstream)) {
      potentialConflictFiles.push(relativePath);
    }
  }

  return {
    upstreamChangedFiles,
    forkCustomizedFiles,
    potentialConflictFiles,
    localOnlyFiles,
    upstreamOnlyFiles,
    packageJsonFiles,
    previewFiles: [
      ...potentialConflictFiles.slice(0, 5),
      ...upstreamOnlyFiles.slice(0, 3),
      ...localOnlyFiles.slice(0, 2),
    ],
  };
}

function mergeTextTriplet(ours: Buffer, base: Buffer, theirs: Buffer): MergeTextResult {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "growthub-kit-merge-"));
  const oursPath = path.resolve(tempDir, "ours.txt");
  const basePath = path.resolve(tempDir, "base.txt");
  const theirsPath = path.resolve(tempDir, "theirs.txt");

  try {
    fs.writeFileSync(oursPath, ours);
    fs.writeFileSync(basePath, base);
    fs.writeFileSync(theirsPath, theirs);
    try {
      const text = execFileSync(
        "git",
        ["merge-file", "-p", "-L", "fork", "-L", "baseline", "-L", "upstream", oursPath, basePath, theirsPath],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      return { text, conflicted: false };
    } catch (error) {
      const output = error instanceof Error && "stdout" in error
        ? String((error as { stdout?: string | Buffer }).stdout ?? "")
        : "";
      return { text: output, conflicted: true };
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function stableJsonValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJsonValue(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableJsonValue((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function mergeJsonScalar<T>(input: {
  base: T | undefined;
  ours: T | undefined;
  theirs: T | undefined;
  conflictKey: string;
  conflicts: string[];
}): T | undefined {
  const baseStable = stableJsonValue(input.base);
  const oursStable = stableJsonValue(input.ours);
  const theirsStable = stableJsonValue(input.theirs);

  if (oursStable === theirsStable) return input.ours;
  if (oursStable === baseStable) return input.theirs;
  if (theirsStable === baseStable) return input.ours;
  input.conflicts.push(input.conflictKey);
  return input.ours;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function mergeDependencyBlock(input: {
  relativePath: string;
  field: string;
  base: Record<string, unknown>;
  ours: Record<string, unknown>;
  theirs: Record<string, unknown>;
  updates: KitForkSyncPackageUpdate[];
  conflicts: string[];
}): Record<string, unknown> | undefined {
  const nextBlock: Record<string, unknown> = {};
  const packageNames = new Set<string>([
    ...Object.keys(input.base),
    ...Object.keys(input.ours),
    ...Object.keys(input.theirs),
  ]);

  for (const packageName of [...packageNames].sort()) {
    const baseValue = typeof input.base[packageName] === "string" ? input.base[packageName] as string : undefined;
    const oursValue = typeof input.ours[packageName] === "string" ? input.ours[packageName] as string : undefined;
    const theirsValue = typeof input.theirs[packageName] === "string" ? input.theirs[packageName] as string : undefined;

    if (oursValue === theirsValue) {
      if (oursValue !== undefined) nextBlock[packageName] = oursValue;
      continue;
    }

    if (oursValue === baseValue) {
      if (theirsValue !== undefined) {
        nextBlock[packageName] = theirsValue;
      }
      input.updates.push({
        filePath: input.relativePath,
        field: input.field,
        packageName,
        previousValue: oursValue ?? null,
        nextValue: theirsValue ?? null,
        source: "upstream",
        reason: "Applied upstream dependency change because the fork kept the baseline value.",
      });
      continue;
    }

    if (theirsValue === baseValue) {
      if (oursValue !== undefined) {
        nextBlock[packageName] = oursValue;
      }
      input.updates.push({
        filePath: input.relativePath,
        field: input.field,
        packageName,
        previousValue: baseValue ?? null,
        nextValue: oursValue ?? null,
        source: "fork",
        reason: "Preserved local dependency override because upstream kept the baseline value.",
      });
      continue;
    }

    if (oursValue !== undefined) {
      nextBlock[packageName] = oursValue;
    }
    input.conflicts.push(`${input.field}.${packageName}`);
  }

  return Object.keys(nextBlock).length > 0 ? nextBlock : undefined;
}

function mergePackageJsonTriplet(
  relativePath: string,
  oursRaw: string,
  baseRaw: string,
  theirsRaw: string,
): MergePackageJsonResult {
  const oursJson = JSON.parse(oursRaw) as Record<string, unknown>;
  const baseJson = JSON.parse(baseRaw) as Record<string, unknown>;
  const theirsJson = JSON.parse(theirsRaw) as Record<string, unknown>;

  const updates: KitForkSyncPackageUpdate[] = [];
  const conflicts: string[] = [];
  const dependencyFields = new Set([
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ]);

  const merged: Record<string, unknown> = {};
  const topLevelKeys = new Set<string>([
    ...Object.keys(baseJson),
    ...Object.keys(oursJson),
    ...Object.keys(theirsJson),
  ]);

  for (const key of [...topLevelKeys]) {
    if (dependencyFields.has(key)) {
      const mergedBlock = mergeDependencyBlock({
        relativePath,
        field: key,
        base: asRecord(baseJson[key]),
        ours: asRecord(oursJson[key]),
        theirs: asRecord(theirsJson[key]),
        updates,
        conflicts,
      });
      if (mergedBlock !== undefined) {
        merged[key] = mergedBlock;
      }
      continue;
    }

    const mergedValue = mergeJsonScalar({
      base: baseJson[key],
      ours: oursJson[key],
      theirs: theirsJson[key],
      conflictKey: key,
      conflicts,
    });
    if (mergedValue !== undefined) {
      merged[key] = mergedValue;
    }
  }

  return {
    text: `${JSON.stringify(merged, null, 2)}\n`,
    updates,
    conflicts,
  };
}

function applyModeFromReference(targetPath: string, referencePath: string | null): void {
  if (!referencePath || !fs.existsSync(referencePath)) return;
  try {
    const mode = fs.statSync(referencePath).mode & 0o777;
    fs.chmodSync(targetPath, mode);
  } catch {
    // best effort
  }
}

function writeTextFile(targetPath: string, text: string, referencePath: string | null): void {
  ensureParentDir(targetPath);
  fs.writeFileSync(targetPath, text, "utf8");
  applyModeFromReference(targetPath, referencePath);
}

function copyFileToTarget(sourcePath: string, targetPath: string): void {
  ensureParentDir(targetPath);
  fs.copyFileSync(sourcePath, targetPath);
  applyModeFromReference(targetPath, sourcePath);
}

function pruneEmptyParentDirs(startDir: string, stopDir: string): void {
  let current = path.resolve(startDir);
  const boundary = path.resolve(stopDir);
  while (current.startsWith(boundary) && current !== boundary) {
    if (!fs.existsSync(current)) {
      current = path.dirname(current);
      continue;
    }
    if (fs.readdirSync(current).length > 0) return;
    fs.rmdirSync(current);
    current = path.dirname(current);
  }
}

function buildBranchName(registration: KitForkRegistration, jobId: string): string {
  const prefix = sanitizeBranchSegment(registration.branchPrefix || "sync");
  const forkId = sanitizeBranchSegment(registration.id);
  return `${prefix}/${forkId}-${jobId.slice(-8)}`;
}

function buildJobState(registration: KitForkRegistration): KitForkSyncJobState {
  const jobId = `kit-sync-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  return {
    id: jobId,
    forkId: registration.id,
    kitId: registration.kitId,
    status: "queued",
    createdAt: nowIso(),
    startedAt: null,
    finishedAt: null,
    pid: null,
    branchName: buildBranchName(registration, jobId),
    worktreePath: resolveWorktreePath(registration.id, jobId),
    logPath: resolveJobLogPath(jobId),
    reportPath: resolveJobReportPath(jobId),
    skillPath: resolveJobSkillPath(jobId),
    error: null,
    summary: null,
  };
}

function createWorktree(job: KitForkSyncJobState, registration: KitForkRegistration): string {
  fs.mkdirSync(path.dirname(job.worktreePath), { recursive: true });
  execFileSync(
    "git",
    ["worktree", "add", "-b", job.branchName, job.worktreePath, registration.baseBranch],
    {
      cwd: registration.repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  return path.resolve(job.worktreePath, registration.repoRelativePath);
}

function hasStagedChanges(worktreePath: string, relativePath: string): boolean {
  try {
    const status = execFileSync("git", ["status", "--porcelain", "--", relativePath], {
      cwd: worktreePath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return status.length > 0;
  } catch {
    return false;
  }
}

function createGitCommit(job: KitForkSyncJobState, registration: KitForkRegistration, summary: KitForkSyncJobSummary): boolean {
  if (summary.conflictFiles.length > 0 || summary.validationErrors.length > 0) {
    return false;
  }
  if (!hasStagedChanges(job.worktreePath, registration.repoRelativePath)) {
    return false;
  }
  execFileSync("git", ["add", "--", registration.repoRelativePath], {
    cwd: job.worktreePath,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (!hasStagedChanges(job.worktreePath, registration.repoRelativePath)) {
    return false;
  }
  const baselineVersion = summary.baselineVersion ?? "baseline";
  const message = `sync(kit): heal ${registration.id} ${baselineVersion} -> ${summary.upstreamVersion}`;
  execFileSync("git", ["commit", "-m", message], {
    cwd: job.worktreePath,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return true;
}

function writeReportArtifacts(input: {
  job: KitForkSyncJobState;
  registration: KitForkRegistration;
  summary: KitForkSyncJobSummary;
}): void {
  writeJsonFile(input.job.reportPath, {
    jobId: input.job.id,
    forkId: input.registration.id,
    kitId: input.registration.kitId,
    branchName: input.job.branchName,
    worktreePath: input.job.worktreePath,
    status: input.summary.validationErrors.length > 0 || input.summary.conflictFiles.length > 0
      ? "needs_review"
      : "succeeded",
    summary: input.summary,
  });

  const reviewLines = input.summary.conflictFiles.length > 0
    ? input.summary.conflictFiles.map((filePath) => `- ${filePath}`)
    : ["- none"];

  const validationLines = input.summary.validationErrors.length > 0
    ? input.summary.validationErrors.map((message) => `- ${message}`)
    : ["- growthub kit validate passed"];

  const packageLines = input.summary.packageUpdates.length > 0
    ? input.summary.packageUpdates.map((update) => `- ${update.filePath} :: ${update.field}.${update.packageName} -> ${update.nextValue ?? "(removed)"} (${update.source})`)
    : ["- none"];

  const skill = [
    "# Fork Sync Agent Skill Pack",
    "",
    `Fork id: ${input.registration.id}`,
    `Bundled kit: ${input.registration.kitId}`,
    `Sync branch: ${input.job.branchName}`,
    `Worktree: ${input.job.worktreePath}`,
    "",
    "## Objective",
    "",
    "Preserve the user's fork-specific changes while moving the worker kit to the latest bundled Growthub version.",
    "",
    "## Required review files",
    "",
    ...reviewLines,
    "",
    "## Validation status",
    "",
    ...validationLines,
    "",
    "## Package version updates",
    "",
    ...packageLines,
    "",
    "## Recommended commands",
    "",
    `- growthub kit validate "${path.resolve(input.job.worktreePath, input.registration.repoRelativePath)}"`,
    `- git -C "${input.job.worktreePath}" status --short`,
    `- git -C "${input.job.worktreePath}" log --oneline -1`,
    "",
    "## Fork sync guardrails",
    "",
    "- Keep local-only files unless the fork owner explicitly deletes them.",
    "- Prefer upstream dependency version bumps when the fork still matched the previous baseline.",
    "- Escalate any overlap where both the fork and upstream changed the same file.",
    "",
  ].join("\n");

  ensureParentDir(input.job.skillPath);
  fs.writeFileSync(input.job.skillPath, `${skill}\n`, "utf8");
}

function runSyncForPreparedJob(job: KitForkSyncJobState, registration: KitForkRegistration): KitForkSyncJobSummary {
  const baselineRoot = resolveBaselineSnapshotPath(registration.id);
  const baselineMeta = readBaselineMetadata(registration.id);
  if (!fs.existsSync(baselineRoot) || !baselineMeta) {
    throw new Error(`Baseline snapshot for "${registration.id}" is missing. Re-run "growthub kit sync init --refresh-baseline".`);
  }

  const upstream = getBundledKitSourceInfo(registration.kitId);
  appendJobLog(job, `Creating sync worktree from ${registration.baseBranch} -> ${job.branchName}`);
  const targetKitPath = createWorktree(job, registration);
  appendJobLog(job, `Worktree ready at ${job.worktreePath}`);
  appendJobLog(job, `Target fork path: ${targetKitPath}`);

  const fileSet = new Set<string>([
    ...listRelativeFiles(baselineRoot),
    ...listRelativeFiles(upstream.assetRoot),
    ...listRelativeFiles(targetKitPath),
  ]);

  const summary: KitForkSyncJobSummary = {
    upstreamVersion: upstream.version,
    baselineVersion: baselineMeta.upstreamVersion,
    upstreamChangedFiles: 0,
    forkCustomizedFiles: 0,
    mergedFiles: 0,
    upstreamAppliedFiles: 0,
    preservedForkFiles: 0,
    removedFiles: 0,
    conflictFiles: [],
    localOnlyFiles: [],
    validationErrors: [],
    packageUpdates: [],
    commitCreated: false,
  };

  for (const relativePath of [...fileSet].sort()) {
    const baseline = readFileSnapshot(baselineRoot, relativePath);
    const upstreamFile = readFileSnapshot(upstream.assetRoot, relativePath);
    const forkFile = readFileSnapshot(targetKitPath, relativePath);
    const upstreamChanged = !fileSnapshotsEqual(baseline, upstreamFile);
    const forkChanged = !fileSnapshotsEqual(baseline, forkFile);

    if (upstreamChanged) summary.upstreamChangedFiles += 1;
    if (forkChanged) summary.forkCustomizedFiles += 1;
    if (!baseline.exists && forkFile.exists && !upstreamFile.exists) {
      summary.localOnlyFiles.push(relativePath);
      continue;
    }
    if (!upstreamChanged) {
      continue;
    }

    const upstreamPath = path.resolve(upstream.assetRoot, relativePath);
    const targetPath = path.resolve(targetKitPath, relativePath);

    if (!upstreamFile.exists) {
      if (!forkChanged || fileSnapshotsEqual(forkFile, baseline)) {
        fs.rmSync(targetPath, { force: true });
        pruneEmptyParentDirs(path.dirname(targetPath), targetKitPath);
        summary.removedFiles += 1;
        appendJobLog(job, `Removed stale fork file: ${relativePath}`);
      } else {
        summary.conflictFiles.push(relativePath);
        summary.preservedForkFiles += 1;
        appendJobLog(job, `Conflict: upstream removed ${relativePath} but the fork customized it.`);
      }
      continue;
    }

    if (!forkFile.exists) {
      if (!baseline.exists) {
        copyFileToTarget(upstreamPath, targetPath);
        summary.upstreamAppliedFiles += 1;
        appendJobLog(job, `Applied new upstream file: ${relativePath}`);
      } else {
        summary.conflictFiles.push(relativePath);
        appendJobLog(job, `Conflict: fork removed ${relativePath} while upstream changed it.`);
      }
      continue;
    }

    if (!forkChanged) {
      copyFileToTarget(upstreamPath, targetPath);
      summary.upstreamAppliedFiles += 1;
      appendJobLog(job, `Updated fork file from upstream: ${relativePath}`);
      continue;
    }

    if (buffersEqual(forkFile.buffer, upstreamFile.buffer)) {
      continue;
    }

    if (
      relativePath.endsWith("package.json")
      && baseline.isText
      && forkFile.isText
      && upstreamFile.isText
      && baseline.buffer
      && forkFile.buffer
      && upstreamFile.buffer
    ) {
      const merged = mergePackageJsonTriplet(
        relativePath,
        forkFile.buffer.toString("utf8"),
        baseline.buffer.toString("utf8"),
        upstreamFile.buffer.toString("utf8"),
      );
      writeTextFile(targetPath, merged.text, targetPath);
      summary.mergedFiles += 1;
      summary.packageUpdates.push(...merged.updates);
      if (merged.conflicts.length > 0) {
        summary.conflictFiles.push(relativePath);
        appendJobLog(
          job,
          `Package review required for ${relativePath}: ${merged.conflicts.join(", ")}`,
        );
      } else {
        appendJobLog(job, `Merged package manifest: ${relativePath}`);
      }
      continue;
    }

    if (baseline.isText && forkFile.isText && upstreamFile.isText && baseline.buffer && forkFile.buffer && upstreamFile.buffer) {
      const merged = mergeTextTriplet(forkFile.buffer, baseline.buffer, upstreamFile.buffer);
      writeTextFile(targetPath, merged.text, targetPath);
      summary.mergedFiles += 1;
      if (merged.conflicted) {
        summary.conflictFiles.push(relativePath);
        appendJobLog(job, `Text merge produced conflict markers for ${relativePath}`);
      } else {
        appendJobLog(job, `Merged text changes for ${relativePath}`);
      }
      continue;
    }

    summary.conflictFiles.push(relativePath);
    summary.preservedForkFiles += 1;
    appendJobLog(job, `Binary/manual review required for ${relativePath}; preserved fork copy.`);
  }

  const validation = validateKitDirectory(targetKitPath);
  if (!validation.valid) {
    summary.validationErrors = validation.errors.map((error) => `${error.field}: ${error.message}`);
    appendJobLog(job, `Validation failed with ${summary.validationErrors.length} error(s).`);
  } else {
    appendJobLog(job, "growthub kit validate passed in sync worktree.");
  }

  summary.commitCreated = createGitCommit(job, registration, summary);
  appendJobLog(job, summary.commitCreated ? "Created sync commit on worktree branch." : "No sync commit created.");
  return summary;
}

export function listRegisteredKitForks(): KitForkRegistration[] {
  return readRegistry().forks.slice().sort((left, right) => left.id.localeCompare(right.id));
}

export function registerKitFork(input: RegisterKitForkInput): RegisterKitForkResult {
  const resolvedForkPath = path.resolve(input.forkPath);
  if (!fs.existsSync(resolvedForkPath)) {
    throw new Error(`Fork path does not exist: ${resolvedForkPath}`);
  }
  const repoRoot = detectGitRepoRoot(resolvedForkPath);
  if (!repoRoot) {
    throw new Error("Fork sync agent requires the forked worker kit to live inside a git repository.");
  }
  const localKitId = ensureKitIsValid(resolvedForkPath);
  const registry = readRegistry();
  const forkId = sanitizeIdentifier(input.forkId ?? path.basename(resolvedForkPath));
  const repoRelativePath = pathRelativeToRepo(repoRoot, resolvedForkPath);
  const existing = registry.forks.find((entry) => entry.id === forkId);
  const currentTime = nowIso();
  const baselineMeta = existing && !input.refreshBaseline
    ? readBaselineMetadata(forkId)
    : writeBaselineSnapshot(forkId, input.kitId);
  const baseline = baselineMeta ?? writeBaselineSnapshot(forkId, input.kitId);

  const registration: KitForkRegistration = {
    id: forkId,
    kitId: input.kitId,
    localKitId,
    forkPath: resolvedForkPath,
    repoRoot,
    repoRelativePath,
    baseBranch: input.baseBranch?.trim() || existing?.baseBranch || detectPreferredBaseBranch(repoRoot),
    branchPrefix: input.branchPrefix?.trim() || existing?.branchPrefix || "sync",
    createdAt: existing?.createdAt ?? currentTime,
    updatedAt: currentTime,
    baselineVersion: baseline.upstreamVersion,
    lastSyncedAt: existing?.lastSyncedAt ?? null,
    lastSyncedUpstreamVersion: existing?.lastSyncedUpstreamVersion ?? null,
    lastJobId: existing?.lastJobId ?? null,
  };

  const nextForks = registry.forks.filter((entry) => entry.id !== forkId);
  nextForks.push(registration);
  writeRegistry({ version: REGISTRY_VERSION, forks: nextForks.sort((left, right) => left.id.localeCompare(right.id)) });

  return {
    registration,
    baselinePath: resolveBaselineSnapshotPath(forkId),
    upstreamVersion: baseline.upstreamVersion,
  };
}

export function planKitForkSync(forkId: string): KitForkSyncPlan {
  const registration = getRegistrationOrThrow(forkId);
  const baselineMeta = readBaselineMetadata(registration.id);
  const baselineRoot = resolveBaselineSnapshotPath(registration.id);
  if (!fs.existsSync(baselineRoot) || !baselineMeta) {
    throw new Error(`Baseline snapshot for "${registration.id}" is missing. Re-run "growthub kit sync init --refresh-baseline".`);
  }

  const upstream = getBundledKitSourceInfo(registration.kitId);
  const summary = summarizeDrift(baselineRoot, upstream.assetRoot, registration.forkPath);
  return {
    registration,
    upstreamVersion: upstream.version,
    baselineVersion: baselineMeta.upstreamVersion,
    dirtyWorkingTree: hasGitChanges(registration.repoRoot, registration.repoRelativePath),
    ...summary,
  };
}

function updateRegistration(registration: KitForkRegistration): void {
  const registry = readRegistry();
  const nextForks = registry.forks.filter((entry) => entry.id !== registration.id);
  nextForks.push(registration);
  writeRegistry({ version: REGISTRY_VERSION, forks: nextForks.sort((left, right) => left.id.localeCompare(right.id)) });
}

export function prepareKitForkSyncJob(forkId: string): KitForkSyncJobState {
  const registration = getRegistrationOrThrow(forkId);
  const plan = planKitForkSync(forkId);
  if (plan.dirtyWorkingTree) {
    throw new Error(
      `Fork path ${registration.forkPath} has uncommitted changes. Commit or stash them before starting the background sync agent.`,
    );
  }
  const job = buildJobState(registration);
  writeJobState(job);
  updateRegistration({
    ...registration,
    updatedAt: nowIso(),
    lastJobId: job.id,
  });
  return job;
}

export function startKitForkSyncJob(forkId: string): StartKitForkSyncJobResult {
  const job = prepareKitForkSyncJob(forkId);
  const cliEntrypoint = process.argv[1];
  if (!cliEntrypoint) {
    throw new Error("Could not determine the current Growthub CLI entrypoint for the detached sync agent.");
  }

  ensureParentDir(job.logPath);
  const logFd = fs.openSync(job.logPath, "a");
  try {
    const child = spawn(
      process.execPath,
      [...process.execArgv, cliEntrypoint, "kit", "sync", "__run-job", job.id],
      {
        detached: true,
        stdio: ["ignore", logFd, logFd],
        env: process.env,
      },
    );
    child.unref();
    const nextJob: KitForkSyncJobState = {
      ...job,
      pid: child.pid ?? null,
    };
    writeJobState(nextJob);
    appendJobLog(nextJob, `Queued detached fork sync agent with pid ${nextJob.pid ?? "unknown"}.`);
    return { job: nextJob };
  } finally {
    fs.closeSync(logFd);
  }
}

export function readKitForkSyncJob(jobId: string): KitForkSyncJobState | null {
  const job = readJobStateRaw(jobId);
  return job ? normalizeJobState(job) : null;
}

export function listKitForkSyncJobs(forkId?: string): KitForkSyncJobState[] {
  if (!fs.existsSync(resolveJobsRoot())) return [];
  return fs.readdirSync(resolveJobsRoot(), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && !entry.name.endsWith("-report.json"))
    .map((entry) => readKitForkSyncJob(entry.name.replace(/\.json$/u, "")))
    .filter((job): job is KitForkSyncJobState => job !== null)
    .filter((job) => (forkId ? job.forkId === sanitizeIdentifier(forkId) : true))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function runPreparedKitForkSyncJob(jobId: string): Promise<KitForkSyncJobState> {
  const rawJob = readJobStateRaw(jobId);
  if (!rawJob) {
    throw new Error(`Fork sync job "${jobId}" was not found.`);
  }
  const registration = getRegistrationOrThrow(rawJob.forkId);
  const job: KitForkSyncJobState = {
    ...rawJob,
    status: "running",
    startedAt: rawJob.startedAt ?? nowIso(),
    pid: process.pid,
    error: null,
  };
  writeJobState(job);
  appendJobLog(job, `Starting fork sync job for ${registration.id} (${registration.kitId}).`);

  try {
    const summary = runSyncForPreparedJob(job, registration);
    writeReportArtifacts({ job, registration, summary });
    const status: KitForkSyncJobStatus = summary.conflictFiles.length > 0 || summary.validationErrors.length > 0
      ? "needs_review"
      : "succeeded";
    const nextJob: KitForkSyncJobState = {
      ...job,
      status,
      finishedAt: nowIso(),
      summary,
      error: status === "needs_review" ? "Fork sync completed with review items." : null,
    };
    writeJobState(nextJob);
    appendJobLog(nextJob, `Fork sync finished with status ${status}.`);

    if (status === "succeeded") {
      const baseline = writeBaselineSnapshot(registration.id, registration.kitId);
      updateRegistration({
        ...registration,
        updatedAt: nowIso(),
        baselineVersion: baseline.upstreamVersion,
        lastSyncedAt: nowIso(),
        lastSyncedUpstreamVersion: summary.upstreamVersion,
        lastJobId: nextJob.id,
      });
    }

    return nextJob;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const nextJob: KitForkSyncJobState = {
      ...job,
      status: "failed",
      finishedAt: nowIso(),
      error: message,
    };
    writeJobState(nextJob);
    appendJobLog(nextJob, `Fork sync failed: ${message}`);
    return nextJob;
  }
}
