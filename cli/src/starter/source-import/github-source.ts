/**
 * Source Import Agent — GitHub repo source adapter.
 *
 * Combines two primitives for the `github-repo` source kind:
 *
 *   1. Access probe — mirrors the Fork Sync Agent's fixed-preference auth
 *      ordering (direct CLI → hosted bridge → public), returning a
 *      `GithubRepoAccessProbe` that downstream planners consume without
 *      knowing which source produced the token.
 *   2. Bounded clone — uses the existing `cli/src/kits/fork-remote.ts`
 *      `git` wrapper semantics (child_process-based, token embedded in
 *      HTTPS URL at invocation time, never written to git config).
 *
 * This module deliberately does not introduce a new transport or a new
 * auth primitive. Every token it returns was produced by the existing
 * `resolveGithubAccessToken()` resolver. Bridge-minted credentials remain
 * in-memory only and are discarded at the end of the import run.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveGithubAccessToken } from "../../integrations/github-resolver.js";
import { parseRepoRef } from "../../github/client.js";
import { buildTokenCloneUrl, gitAvailable } from "../../kits/fork-remote.js";
import type { GithubRepoRef } from "../../github/types.js";
import type {
  GithubRepoAccessProbe,
  GithubRepoSourceInput,
  SourceAccessMode,
} from "./types.js";

const GITHUB_API_BASE = "https://api.github.com";

// ---------------------------------------------------------------------------
// Access probe
// ---------------------------------------------------------------------------

function baseHeaders(): Record<string, string> {
  return {
    "User-Agent": "growthub-cli",
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function withToken(token: string): Record<string, string> {
  return { ...baseHeaders(), Authorization: `Bearer ${token}` };
}

function pickVisibility(
  raw: Record<string, unknown>,
): "public" | "private" | "internal" | "unknown" {
  const v = raw.visibility;
  if (v === "public" || v === "private" || v === "internal") return v;
  if (raw.private === true) return "private";
  if (raw.private === false) return "public";
  return "unknown";
}

async function fetchRepoMetadata(
  ref: GithubRepoRef,
  authHeaders: Record<string, string>,
): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${GITHUB_API_BASE}/repos/${ref.owner}/${ref.repo}`, {
    headers: authHeaders,
  });
  if (res.status === 404 || res.status === 401 || res.status === 403) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`GitHub repo probe failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

/**
 * Resolve repo access using the Fork Sync Agent's preference ordering.
 * Returns a `GithubRepoAccessProbe` that downstream planners consume
 * without knowing which source produced the token.
 */
export async function probeGithubRepoSource(
  input: GithubRepoSourceInput,
): Promise<GithubRepoAccessProbe> {
  const ref = parseRepoRef(input.repo);
  const warnings: string[] = [];

  if (input.skipProbe) {
    return {
      kind: "github-repo",
      mode: "public",
      repo: ref,
      defaultBranch: "main",
      htmlUrl: `https://github.com/${ref.owner}/${ref.repo}`,
      cloneUrl: `https://github.com/${ref.owner}/${ref.repo}.git`,
      visibility: "unknown",
      warnings: ["--skip-probe set; default branch assumed 'main'"],
    };
  }

  const resolved = await resolveGithubAccessToken();
  const orderedProbes: Array<{
    mode: SourceAccessMode;
    headers: Record<string, string>;
    handle?: string;
  }> = [];

  if (resolved) {
    orderedProbes.push({
      mode: resolved.source,
      headers: withToken(resolved.accessToken),
      handle: resolved.handle,
    });
  }
  orderedProbes.push({ mode: "public", headers: baseHeaders() });

  let meta: Record<string, unknown> | null = null;
  let successfulProbe: (typeof orderedProbes)[number] | null = null;
  let lastError: string | null = null;

  for (const probe of orderedProbes) {
    try {
      const result = await fetchRepoMetadata(ref, probe.headers);
      if (result) {
        meta = result;
        successfulProbe = probe;
        break;
      }
      if (probe.mode !== "public") {
        warnings.push(
          `repo metadata not readable via ${probe.mode} auth — falling through`,
        );
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      warnings.push(`${probe.mode} probe errored: ${lastError}`);
    }
  }

  if (!meta || !successfulProbe) {
    if (input.privateRepo) {
      throw new Error(
        `Private repo requested but no credential resolved access. ` +
          `Run 'growthub github login' or connect GitHub inside Growthub. ` +
          `Last error: ${lastError ?? "repo not found / not accessible"}`,
      );
    }
    throw new Error(
      `Unable to resolve GitHub repo '${ref.owner}/${ref.repo}'. ` +
        `Verify the slug and your auth. Last error: ${lastError ?? "not found"}`,
    );
  }

  const visibility = pickVisibility(meta);
  if (visibility === "private" && successfulProbe.mode === "public") {
    throw new Error(
      `Repo '${ref.owner}/${ref.repo}' is private but only public access was probed. ` +
        `This indicates a logic error — please report this probe trace.`,
    );
  }

  const defaultBranch = typeof meta.default_branch === "string" ? meta.default_branch : "main";
  const htmlUrl = typeof meta.html_url === "string"
    ? meta.html_url
    : `https://github.com/${ref.owner}/${ref.repo}`;
  const cloneUrl = typeof meta.clone_url === "string"
    ? meta.clone_url
    : `https://github.com/${ref.owner}/${ref.repo}.git`;

  return {
    kind: "github-repo",
    mode: successfulProbe.mode,
    repo: ref,
    defaultBranch,
    htmlUrl,
    cloneUrl,
    visibility,
    authHandle: successfulProbe.handle,
    warnings,
  };
}

/**
 * Resolve an access token usable for a git clone over HTTPS.
 * Returns null for public probes — the caller should clone unauthenticated.
 *
 * IMPORTANT: this token is returned in memory only. The caller must not
 * persist it. For bridge-sourced tokens, this honours the fork-sync
 * invariant "bridge-minted credentials are never persisted to disk".
 */
export async function resolveGithubCloneToken(
  probe: GithubRepoAccessProbe,
): Promise<{ token: string; source: SourceAccessMode } | null> {
  if (probe.mode === "public") return null;
  const resolved = await resolveGithubAccessToken();
  if (!resolved) return null;
  return { token: resolved.accessToken, source: resolved.source };
}

// ---------------------------------------------------------------------------
// Bounded clone
// ---------------------------------------------------------------------------

export interface CloneGithubRepoInput {
  probe: GithubRepoAccessProbe;
  branch?: string;
  destination: string;
  /** Optional token (required for private clones). */
  token?: string;
  /** Optional depth. Defaults to 1 for safe, bounded clones. */
  depth?: number;
}

export interface CloneGithubRepoResult {
  destination: string;
  branch: string;
  sha?: string;
  cloneUrl: string;
}

function runGit(
  cwd: string,
  args: string[],
): { ok: boolean; stdout: string; stderr: string; code: number } {
  const res = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  return {
    ok: res.status === 0,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    code: res.status ?? -1,
  };
}

/**
 * Clone a GitHub repo into `destination`. Defaults to `--depth 1` to keep
 * the agent's blast radius small; callers can override via `input.depth=0`
 * for a full clone. The destination must not already exist — the agent is
 * responsible for its lifecycle (caller places it in a staging zone).
 */
export function cloneGithubRepo(input: CloneGithubRepoInput): CloneGithubRepoResult {
  if (!gitAvailable()) {
    throw new Error("`git` is not available on PATH — cannot clone.");
  }
  if (fs.existsSync(input.destination)) {
    throw new Error(`Clone destination already exists: ${input.destination}`);
  }

  const cloneUrl = input.token
    ? buildTokenCloneUrl(input.probe.repo, input.token)
    : input.probe.cloneUrl;

  const parent = path.dirname(input.destination);
  fs.mkdirSync(parent, { recursive: true });

  const depth = input.depth ?? 1;
  const branch = input.branch ?? input.probe.defaultBranch;

  const args = ["clone"];
  if (depth > 0) args.push("--depth", String(depth));
  args.push("--single-branch", "--branch", branch, cloneUrl, input.destination);

  const cloneRes = runGit(parent, args);
  if (!cloneRes.ok) {
    const sanitized = (cloneRes.stderr || "git clone failed").replace(
      /https:\/\/x-access-token:[^@]+@/g,
      "https://x-access-token:<redacted>@",
    );
    throw new Error(`git clone failed: ${sanitized}`);
  }

  const shaRes = runGit(input.destination, ["rev-parse", "HEAD"]);
  const sha = shaRes.ok ? shaRes.stdout.trim() : undefined;

  // Detach remote so a leaked token in history never lingers. The imported
  // payload is a point-in-time snapshot; users can re-init git if they want
  // their own origin.
  runGit(input.destination, ["remote", "remove", "origin"]);

  return {
    destination: input.destination,
    branch,
    sha,
    cloneUrl: input.probe.cloneUrl,
  };
}

/**
 * Narrow a cloned worktree to a single subdirectory. Moves
 * `<root>/<subdirectory>` into place and removes everything else. Keeps
 * the operator's subdirectory choice bounded and obvious on disk.
 */
export function narrowToSubdirectory(rootDir: string, subdirectory: string): void {
  const normalizedSub = subdirectory.replace(/^\/+|\/+$/g, "");
  if (!normalizedSub) return;

  const abs = path.resolve(rootDir, normalizedSub);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    throw new Error(`Subdirectory not found in cloned repo: ${subdirectory}`);
  }

  const tmp = path.resolve(
    path.dirname(rootDir),
    `.${path.basename(rootDir)}-narrow-${Date.now().toString(36)}`,
  );
  fs.renameSync(abs, tmp);
  fs.rmSync(rootDir, { recursive: true, force: true });
  fs.renameSync(tmp, rootDir);
}
