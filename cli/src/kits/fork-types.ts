/**
 * Kit Fork Types
 *
 * Canonical type system for the worker kit fork & self-healing sync subsystem.
 * Lives co-located in cli/src/kits/ alongside the existing kit contract types.
 *
 * A "kit fork" is a directory that was originally exported from a bundled
 * worker kit and may contain user-authored customisations (custom skills,
 * env overrides, modified workers, etc.).  The fork-sync engine tracks drift
 * between the fork and the latest bundled upstream, produces a structured
 * report, and applies a safe non-destructive heal that preserves every user
 * modification while bringing the fork's scaffold and package dependencies
 * up to date.
 */

// ---------------------------------------------------------------------------
// Fork registration — persisted inside the fork itself (self-describing)
// ---------------------------------------------------------------------------

/**
 * A registered fork entry. Canonical state lives inside the fork at:
 *   <forkPath>/.growthub-fork/fork.json
 *
 * A thin CLI-owned discovery index at GROWTHUB_KIT_FORKS_HOME/index.json
 * (default ~/.growthub/kit-forks/index.json) enumerates registered forks
 * without filesystem scans. The in-fork file is authoritative; the index
 * is rebuildable.
 */
export interface KitForkRegistration {
  /** Stable unique ID generated at registration time */
  forkId: string;
  /** Canonical bundled kit ID (matches BUNDLED_KIT_CATALOG entry) */
  kitId: string;
  /** Kit version the fork was based on at registration time */
  baseVersion: string;
  /** Absolute path to the user's fork directory */
  forkPath: string;
  /** ISO-8601 timestamp of registration */
  registeredAt: string;
  /** ISO-8601 timestamp of last successful upstream sync */
  lastSyncedAt?: string;
  /** User-provided label for this fork */
  label?: string;
  /**
   * Relative paths inside forkPath that the user has explicitly declared as
   * custom skills.  The sync engine always preserves these.
   */
  customSkills?: string[];
  /**
   * GitHub remote binding, when the fork is hosted on GitHub. Populated by
   * `growthub kit fork create` (one-click fork) or `growthub kit fork connect`.
   */
  remote?: KitForkRemoteBinding;
}

export interface KitForkRemoteBinding {
  provider: "github";
  /** GitHub owner (user or org) the fork lives under. */
  owner: string;
  /** Repository name on GitHub. */
  repo: string;
  /** Default branch on the remote (e.g. "main"). */
  defaultBranch: string;
  /** HTTPS clone URL. */
  cloneUrl: string;
  /** Browser URL for the fork. */
  htmlUrl: string;
  /** ISO timestamp of last successful remote push. */
  lastPushedAt?: string;
  /** Branch name used for the most recent heal push. */
  lastHealBranch?: string;
  /** PR number + URL opened by the most recent heal, when applicable. */
  lastHealPr?: { number: number; htmlUrl: string };
}

// ---------------------------------------------------------------------------
// Drift detection
// ---------------------------------------------------------------------------

export type KitDriftSeverity = "none" | "info" | "warning" | "critical";

export interface KitFileDrift {
  /** Relative path inside the kit directory */
  relativePath: string;
  /**
   * added    — upstream has this file; fork does not
   * modified — both have the file but content differs
   * deleted  — fork has this file; upstream no longer ships it
   */
  changeType: "added" | "modified" | "deleted";
  severity: KitDriftSeverity;
  description: string;
}

export interface KitPackageDrift {
  packageName: string;
  /** null when the package is new in upstream and absent from fork */
  forkVersion: string | null;
  upstreamVersion: string;
  changeType: "added" | "updated" | "removed";
}

export interface KitForkDriftReport {
  forkId: string;
  kitId: string;
  /** Version the fork is currently at */
  forkVersion: string;
  /** Latest version in the bundled catalog */
  upstreamVersion: string;
  /** true when upstream is strictly newer than forkVersion */
  hasUpstreamUpdate: boolean;
  overallSeverity: KitDriftSeverity;
  fileDrifts: KitFileDrift[];
  packageDrifts: KitPackageDrift[];
  /** Relative paths of user-authored files detected in the fork */
  customSkillsDetected: string[];
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Heal plan
// ---------------------------------------------------------------------------

export type KitHealActionType =
  | "add_file"
  | "update_package_json_deps"
  | "patch_manifest"
  | "add_custom_skill"
  | "skip_user_modified";

export interface KitHealAction {
  actionType: KitHealActionType;
  /** Relative path inside the fork directory */
  targetPath: string;
  description: string;
  /** true = zero risk of overwriting user content */
  safe: boolean;
  /** Action-specific detail payload */
  payload?: Record<string, unknown>;
  /**
   * Set when the user's fork policy demands explicit confirmation before this
   * action can be applied. The agent surfaces these to the user (interactive)
   * or parks them in `requires_confirmation` state (background jobs).
   */
  needsConfirmation?: boolean;
  /** Why confirmation is required — referenced in CLI prompts and trace. */
  confirmationReason?: string;
}

export interface KitForkHealPlan {
  forkId: string;
  kitId: string;
  fromVersion: string;
  toVersion: string;
  actions: KitHealAction[];
  /** Paths the agent deliberately skips because the user modified them */
  preservedPaths: string[];
  estimatedRisk: KitDriftSeverity;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Heal result
// ---------------------------------------------------------------------------

export interface KitHealActionResult {
  action: KitHealAction;
  status: "applied" | "skipped" | "error";
  detail?: string;
}

export interface KitForkHealResult {
  forkId: string;
  kitId: string;
  fromVersion: string;
  toVersion: string;
  actionResults: KitHealActionResult[];
  appliedCount: number;
  skippedCount: number;
  errorCount: number;
  completedAt: string;
  /** Updated registration written to disk after a clean sync */
  updatedRegistration?: KitForkRegistration;
}

// ---------------------------------------------------------------------------
// Background sync job
// ---------------------------------------------------------------------------

export type KitForkSyncJobStatus =
  | "pending"
  | "running"
  | "awaiting_confirmation"
  | "completed"
  | "failed"
  | "cancelled";

export interface KitForkSyncJob {
  jobId: string;
  forkId: string;
  kitId: string;
  status: KitForkSyncJobStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  driftReport?: KitForkDriftReport;
  healPlan?: KitForkHealPlan;
  healResult?: KitForkHealResult;
  /** Action targetPaths still awaiting user confirmation. */
  pendingConfirmations?: string[];
  /** Remote push summary (if policy.remoteSyncMode !== "off"). */
  remotePushSummary?: {
    pushed: boolean;
    branch?: string;
    detail?: string;
    prNumber?: number;
    prUrl?: string;
  };
  error?: string;
}

// ---------------------------------------------------------------------------
// Service options
// ---------------------------------------------------------------------------

export interface RegisterKitForkOptions {
  forkPath: string;
  kitId: string;
  baseVersion: string;
  label?: string;
  customSkills?: string[];
}

export interface KitForkHealOptions {
  dryRun?: boolean;
  skipFiles?: string[];
  onProgress?: (step: string) => void;
  /**
   * Explicit confirmations supplied by the caller for actions that the policy
   * flags as `needsConfirmation`. Each entry is an action targetPath that the
   * user has explicitly approved for this run.
   */
  confirmations?: string[];
}
