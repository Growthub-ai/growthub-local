/**
 * Kit Fork Remote Git Operations
 *
 * Thin shell around `git` (child_process) for the operations fork-sync needs:
 *   - detect whether a fork directory is a git repo
 *   - read/write the `origin` remote URL
 *   - create a branch, commit, push
 *   - fetch + diff against origin
 *
 * All operations are scoped to the fork directory — no global git config
 * mutation, no interactive credential prompts (callers pass an access token
 * for HTTPS auth via the URL).
 */

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { GithubRepoRef } from "../github/types.js";

export interface GitOpResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number;
}

function runGit(cwd: string, args: string[], opts?: { input?: string }): GitOpResult {
  const res = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    input: opts?.input,
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    ok: res.status === 0,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    code: res.status ?? -1,
  };
}

export function isGitRepo(forkPath: string): boolean {
  if (!fs.existsSync(path.resolve(forkPath, ".git"))) return false;
  const res = runGit(forkPath, ["rev-parse", "--is-inside-work-tree"]);
  return res.ok && res.stdout.trim() === "true";
}

export function initGitRepo(forkPath: string): GitOpResult {
  return runGit(forkPath, ["init", "-q"]);
}

export function getOriginUrl(forkPath: string): string | null {
  const res = runGit(forkPath, ["remote", "get-url", "origin"]);
  if (!res.ok) return null;
  const url = res.stdout.trim();
  return url || null;
}

export function setOrigin(forkPath: string, cloneUrl: string): GitOpResult {
  const has = getOriginUrl(forkPath);
  if (has) return runGit(forkPath, ["remote", "set-url", "origin", cloneUrl]);
  return runGit(forkPath, ["remote", "add", "origin", cloneUrl]);
}

export function currentBranch(forkPath: string): string | null {
  const res = runGit(forkPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!res.ok) return null;
  const name = res.stdout.trim();
  return name === "HEAD" ? null : name;
}

export function createBranch(forkPath: string, branchName: string, from?: string): GitOpResult {
  const args = from ? ["checkout", "-b", branchName, from] : ["checkout", "-b", branchName];
  return runGit(forkPath, args);
}

export function stageAll(forkPath: string): GitOpResult {
  return runGit(forkPath, ["add", "-A"]);
}

export function commit(forkPath: string, message: string): GitOpResult {
  return runGit(forkPath, ["commit", "-m", message, "--allow-empty"]);
}

export function fetchOrigin(forkPath: string): GitOpResult {
  return runGit(forkPath, ["fetch", "origin"]);
}

export function pushBranch(forkPath: string, branchName: string): GitOpResult {
  return runGit(forkPath, ["push", "-u", "origin", branchName]);
}

/**
 * Build an HTTPS clone URL that embeds a token for push auth.
 * Token is passed once at invocation time; never stored in the repo config.
 */
export function buildTokenCloneUrl(repo: GithubRepoRef, token: string): string {
  return `https://x-access-token:${encodeURIComponent(token)}@github.com/${repo.owner}/${repo.repo}.git`;
}

/**
 * One-shot: switch to / create a heal branch, stage, commit, push.
 * Returns the pushed branch name on success.
 */
export function pushHealCommit(opts: {
  forkPath: string;
  branchName: string;
  commitMessage: string;
  baseBranch?: string;
}): { branch: string; pushed: boolean; detail: string } {
  const { forkPath, branchName, commitMessage, baseBranch } = opts;
  const create = createBranch(forkPath, branchName, baseBranch);
  if (!create.ok && !create.stderr.includes("already exists")) {
    return { branch: branchName, pushed: false, detail: create.stderr || "createBranch failed" };
  }
  const stage = stageAll(forkPath);
  if (!stage.ok) return { branch: branchName, pushed: false, detail: stage.stderr };
  const c = commit(forkPath, commitMessage);
  if (!c.ok) return { branch: branchName, pushed: false, detail: c.stderr };
  const pushed = pushBranch(forkPath, branchName);
  return {
    branch: branchName,
    pushed: pushed.ok,
    detail: pushed.ok ? "pushed" : pushed.stderr,
  };
}

/** Quick sanity: `git --version` is callable on this system. */
export function gitAvailable(): boolean {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
