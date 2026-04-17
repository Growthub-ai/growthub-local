/**
 * Source Import Agent — canonical types (v1).
 *
 * The Source Import Agent converts a *portable source* (a public/private
 * GitHub repository OR a skills.sh skill) into a starter-derived Custom
 * Workspace registered as a Growthub fork. It is deliberately a
 * source-agnostic pipeline that treats "GitHub repo" and "skills.sh skill"
 * as two first-class source types flowing into the same materializer.
 *
 * Architecture: Portable Source → Agent Environment Pipeline.
 *
 *   Source A: GitHub repository   ─┐
 *   Source B: skills.sh skill     ─┤
 *                                  ├─► source probe
 *                                  ├─► security inspection
 *                                  ├─► import plan builder
 *                                  ├─► starter-derived materializer
 *                                  ├─► fork registration
 *                                  ├─► policy + trace + background job
 *                                  └─► optional Growthub bridge enhancement
 *
 * This module introduces NO new storage locations, NO new transport layers,
 * and NO Paperclip coupling. Every piece of canonical state lives inside
 * the fork at `<forkPath>/.growthub-fork/` (the same kernel-packet-style
 * location used by the Fork Sync Agent and Custom Workspace Starter).
 */

import type { GithubRepoRef } from "../../github/types.js";
import type { GithubTokenSource } from "../../integrations/github-resolver.js";

// ---------------------------------------------------------------------------
// Source kinds
// ---------------------------------------------------------------------------

/**
 * First-class source types recognised by the pipeline. Keep this union
 * tight — adding a new source means shipping a new adapter + plan
 * specialisation, not layering options onto an existing adapter.
 */
export type SourceKind = "github-repo" | "skills-skill";

/**
 * Controls how the imported source payload is materialised inside the
 * starter-derived workspace.
 *
 *   - "wrap":    imported payload lives under `imported/` inside the
 *                starter shell. Every starter asset stays intact.
 *   - "overlay": same as "wrap" PLUS a pointer doc at the workspace root
 *                (for discovery by agents browsing the tree).
 *
 * Aggressive rewrites are deliberately out of scope in v1.
 */
export type SourceImportMode = "wrap" | "overlay";

// ---------------------------------------------------------------------------
// Source-specific inputs
// ---------------------------------------------------------------------------

export interface GithubRepoSourceInput {
  kind: "github-repo";
  /** Raw user input — owner/repo, https URL, or ssh-style shorthand. */
  repo: string;
  /** Optional branch override. Defaults to the repo's default branch. */
  branch?: string;
  /** Optional repo subdirectory (relative to repo root). */
  subdirectory?: string;
  /** Hint the repo is private — forces an auth probe before cloning. */
  privateRepo?: boolean;
  /**
   * When true, skip the GitHub API probe. Useful for offline scripted runs
   * where the caller already knows the repo is public + reachable.
   */
  skipProbe?: boolean;
}

export interface SkillsSkillSourceInput {
  kind: "skills-skill";
  /**
   * Full skill URL (e.g. `https://skills.sh/<author>/<skill>`) OR the
   * short "author/skill" identifier. The resolver accepts both.
   */
  skillRef: string;
  /** Optional skill version tag. Defaults to the resolver's "latest". */
  version?: string;
  /**
   * When true, skip the skills.sh metadata probe (used by scripted tests
   * that pre-stage skill payloads locally).
   */
  skipProbe?: boolean;
}

export type SourceInput = GithubRepoSourceInput | SkillsSkillSourceInput;

// ---------------------------------------------------------------------------
// Top-level import input
// ---------------------------------------------------------------------------

export interface SourceImportInput {
  source: SourceInput;
  /** Destination directory for the imported workspace. */
  out: string;
  /** Human label (defaults to basename of `out`). */
  name?: string;
  /** Import layout strategy — defaults to "wrap". */
  importMode?: SourceImportMode;
  /**
   * Initial remote-sync policy mode seeded into `.growthub-fork/policy.json`.
   *   - "off"    (default) — purely local workspace
   *   - "branch" — push heal branches, no PR
   *   - "pr"     — push heal branches + open draft PR
   */
  remoteSyncMode?: "off" | "branch" | "pr";
  /** Source kit id to scaffold the starter shell from. */
  starterKitId?: string;
  /** Emit machine-readable JSON output. */
  json?: boolean;
  /**
   * Progress callback, mirroring the Fork Sync Agent agent-progress contract.
   * Every phase emits at least one event.
   */
  onProgress?: (step: string) => void;
  /**
   * Explicit operator confirmations (by `targetPath`) for actions the planner
   * flagged as `needsConfirmation`. Skills imports ALWAYS require at least
   * one confirmation (the security report); non-empty destinations add more.
   */
  confirmations?: string[];
}

// ---------------------------------------------------------------------------
// Source access probe
// ---------------------------------------------------------------------------

/**
 * How access to the source was resolved. Mirrors the Fork Sync Agent auth
 * preference ordering.
 */
export type SourceAccessMode = "public" | GithubTokenSource;

export interface GithubRepoAccessProbe {
  kind: "github-repo";
  mode: SourceAccessMode;
  repo: GithubRepoRef;
  defaultBranch: string;
  htmlUrl: string;
  cloneUrl: string;
  /** Visibility reported by the GitHub API (when probed). */
  visibility?: "public" | "private" | "internal" | "unknown";
  /** Handle of the authenticated user, when known. */
  authHandle?: string;
  /** Reasons the probe surfaced (warnings, fallbacks taken, etc.). */
  warnings: string[];
}

/**
 * skills.sh is a public-by-design catalog — the probe returns metadata but
 * never attempts authenticated fetches in v1.
 */
export interface SkillsSkillAccessProbe {
  kind: "skills-skill";
  mode: "public";
  skillRef: string;
  /** Canonical "author/skill" identifier as reported by skills.sh. */
  skillId: string;
  /** Resolved skill version string. */
  version: string;
  /** Human title. */
  title: string;
  /** Author handle as reported by skills.sh. */
  author: string;
  /** Short description. */
  description?: string;
  /** Browser URL for skill detail. */
  htmlUrl: string;
  /** Manifest-advertised file list (relative paths). */
  files: string[];
  warnings: string[];
}

export type SourceAccessProbe = GithubRepoAccessProbe | SkillsSkillAccessProbe;

// ---------------------------------------------------------------------------
// Skills browse (search + pagination)
// ---------------------------------------------------------------------------

export interface SkillsBrowseQuery {
  /** Free-text search. */
  q?: string;
  /** Page index (1-based). */
  page?: number;
  /** Page size (default 20, capped at 50). */
  pageSize?: number;
}

export interface SkillsBrowseEntry {
  skillId: string;
  title: string;
  author: string;
  description?: string;
  htmlUrl: string;
  version?: string;
}

export interface SkillsBrowseResult {
  query: SkillsBrowseQuery;
  total?: number;
  page: number;
  pageSize: number;
  entries: SkillsBrowseEntry[];
}

// ---------------------------------------------------------------------------
// Detection (shape report of the materialised payload)
// ---------------------------------------------------------------------------

export type DetectedFramework =
  | "vite"
  | "next"
  | "react"
  | "node-service"
  | "cli-tool"
  | "monorepo"
  | "docs"
  | "skill"
  | "unknown";

export type PackageManager = "pnpm" | "yarn" | "npm" | "bun" | "unknown";

export interface DetectedRuntimeScripts {
  build?: string;
  dev?: string;
  start?: string;
  test?: string;
}

export interface SourceDetectionReport {
  framework: DetectedFramework;
  packageManager: PackageManager;
  /** Relative path (from payload root) to the app root the agent will wrap. */
  appRoot: string;
  /** `.env`-style files detected at the payload root (for operator awareness). */
  envFiles: string[];
  /** True when the payload root package.json declares a workspaces array. */
  isMonorepo: boolean;
  scripts: DetectedRuntimeScripts;
  /** Confidence score 0..1 for the overall detection. */
  confidence: number;
  /** Non-fatal warnings surfaced to the operator. */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Security inspection
// ---------------------------------------------------------------------------

export type SourceRiskClass = "safe" | "caution" | "high-risk" | "blocked";

export type SecurityFindingCategory =
  | "shell-script"
  | "install-hook"
  | "external-download"
  | "suspicious-binary"
  | "prompt-injection"
  | "env-mutation"
  | "network-heavy-setup"
  | "privileged-instruction"
  | "unexpected-archive";

export interface SecurityFinding {
  category: SecurityFindingCategory;
  severity: "info" | "caution" | "high-risk" | "blocking";
  /** Relative path inside the payload. */
  path: string;
  /** Human-readable explanation. */
  message: string;
  /** Optional matched excerpt (truncated to 120 chars). */
  excerpt?: string;
}

export interface SourceSecurityReport {
  /** When the inspection ran. */
  inspectedAt: string;
  /** Total file count inspected. */
  filesInspected: number;
  /** Number of bytes read during inspection (bounded). */
  bytesInspected: number;
  /** Individual findings — may be empty for "safe" payloads. */
  findings: SecurityFinding[];
  /** Aggregate risk classification. */
  riskClass: SourceRiskClass;
  /**
   * When true, the agent MUST NOT continue even if the operator confirms.
   * Only set when a finding has severity === "blocking".
   */
  blocked: boolean;
  /**
   * Operator-facing summary lines rendered into the confirmation prompt.
   */
  summaryLines: string[];
}

// ---------------------------------------------------------------------------
// Import plan
// ---------------------------------------------------------------------------

export type ImportActionType =
  | "fetch_source"
  | "inspect_security"
  | "materialize_starter_shell"
  | "place_imported_payload"
  | "write_import_manifest"
  | "register_fork"
  | "seed_policy"
  | "seed_trace"
  | "summarize";

export interface ImportPlanAction {
  actionType: ImportActionType;
  /** Relative path inside the destination workspace this action targets. */
  targetPath: string;
  description: string;
  /** Extra structured detail for trace. */
  detail?: Record<string, unknown>;
  /**
   * When true the action requires explicit operator confirmation before
   * execution. v1 sets this for:
   *   - any skill import (the security report),
   *   - non-empty destinations,
   *   - any finding of severity "caution" or "high-risk".
   */
  needsConfirmation?: boolean;
  /** Short tag shown in the confirmation prompt. */
  confirmationLabel?: string;
}

export interface SourceImportPlan {
  importId: string;
  source: SourceAccessProbe;
  destination: {
    forkPath: string;
    starterKitId: string;
    importMode: SourceImportMode;
  };
  detection?: SourceDetectionReport;
  security?: SourceSecurityReport;
  actions: ImportPlanAction[];
  generatedAt: string;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// In-fork manifest
// ---------------------------------------------------------------------------

/**
 * Written to `<forkPath>/.growthub-fork/source-import.json` so the agent can
 * be resumed / audited after the fact. Canonical location; no duplicate
 * state in CLI-owned homes.
 */
export interface SourceImportManifest {
  version: 1;
  importId: string;
  sourceKind: SourceKind;
  source: SourceAccessProbe;
  importMode: SourceImportMode;
  starterKitId: string;
  starterKitVersion: string;
  importedAt: string;
  detection: SourceDetectionReport;
  security: SourceSecurityReport;
  payloadRelativePath: string;
  /** SHA of HEAD at import time, when the source was a git tree. */
  payloadGitSha?: string;
  /** Summary lines written to IMPORT_SUMMARY.md for the operator. */
  summary: string[];
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface SourceImportResult {
  importId: string;
  forkId: string;
  kitId: string;
  forkPath: string;
  baseVersion: string;
  sourceKind: SourceKind;
  source: SourceAccessProbe;
  importMode: SourceImportMode;
  payloadRelativePath: string;
  detection: SourceDetectionReport;
  security: SourceSecurityReport;
  summaryPath: string;
  manifestPath: string;
  policyMode: "off" | "branch" | "pr";
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Background job
// ---------------------------------------------------------------------------

export type SourceImportJobStatus =
  | "pending"
  | "running"
  | "awaiting_confirmation"
  | "completed"
  | "failed"
  | "cancelled";

export interface SourceImportJob {
  jobId: string;
  importId: string;
  sourceKind: SourceKind;
  status: SourceImportJobStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  /** Populated on success. */
  result?: SourceImportResult;
  /** Populated when the job parks on confirmations. */
  plan?: SourceImportPlan;
  pendingConfirmations?: string[];
  error?: string;
  /** Most recent progress step for UI tail views. */
  lastStep?: string;
}
