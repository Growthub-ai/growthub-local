/**
 * Fleet-level fork operations — canonical types.
 *
 * Fleet is a pure read/plan composition layer over the Self-Healing Fork
 * Sync Agent primitives: listKitForkRegistrations, detectKitForkDrift,
 * readKitForkPolicy, listKitForkSyncJobs, readKitForkTrace, buildKitForkHealPlan.
 *
 * It introduces NO new storage, NO new transport, NO new auth surface. Every
 * field below is derived at read time from already-durable in-fork state.
 */

import type { KitForkPolicy } from "../kits/fork-policy.js";
import type {
  KitForkDriftReport,
  KitForkHealPlan,
  KitForkSyncJob,
  KitForkRegistration,
  KitDriftSeverity,
} from "../kits/fork-types.js";

export type ForkHealthLevel =
  | "clean"                  // no drift, no pending jobs, no errors
  | "drift-minor"            // severity info
  | "drift-major"            // severity warning or critical
  | "awaiting-confirmation"  // at least one job parked on confirmations
  | "error"                  // last job failed
  | "unknown";               // probe failed (e.g. fork path missing)

export interface ForkSummary {
  forkId: string;
  kitId: string;
  label?: string;
  forkPath: string;
  baseVersion: string;
  upstreamVersion?: string;
  lastSyncedAt?: string;
  driftSeverity: KitDriftSeverity;
  hasUpstreamUpdate: boolean;
  fileDriftCount: number;
  packageDriftCount: number;
  customSkillCount: number;
  /** policy.remoteSyncMode surfaced for at-a-glance fleet review */
  remoteSyncMode: KitForkPolicy["remoteSyncMode"];
  autoApprove: KitForkPolicy["autoApprove"];
  autoApproveDepUpdates: KitForkPolicy["autoApproveDepUpdates"];
  untouchableCount: number;
  /** Last heal job status + timestamps */
  lastJob?: {
    jobId: string;
    status: KitForkSyncJob["status"];
    createdAt: string;
    completedAt?: string;
    appliedCount?: number;
    skippedCount?: number;
    errorCount?: number;
  };
  /** Number of jobs currently parked awaiting_confirmation */
  pendingConfirmationJobs: number;
  /** Most recent remote event type from trace, when applicable */
  lastRemoteEvent?:
    | "remote_connected"
    | "remote_pushed"
    | "remote_pr_opened"
    | "conflict_encountered"
    | null;
  lastRemoteEventAt?: string;
  /** Remote binding at-a-glance */
  remote?: {
    owner: string;
    repo: string;
    defaultBranch: string;
    lastPushedAt?: string;
    lastHealPr?: { number: number; htmlUrl: string };
  };
  health: ForkHealthLevel;
}

export interface FleetSummary {
  generatedAt: string;
  totalForks: number;
  byHealth: Record<ForkHealthLevel, number>;
  bySeverity: Record<KitDriftSeverity, number>;
  byKit: Record<string, number>;
  forksWithRemote: number;
  forksAwaitingConfirmation: number;
  pendingApprovalCount: number;
  forks: ForkSummary[];
}

// ---------------------------------------------------------------------------
// Artifact / path-level drift summary
// ---------------------------------------------------------------------------

/**
 * Human-readable drift breakdown for a single fork. Produced by projecting
 * a KitForkDriftReport through the fork's KitForkPolicy so operators can
 * quickly distinguish:
 *   - what changed upstream (new files we can safely add)
 *   - what upstream modified but is safe because we can align (manifest)
 *   - what was skipped because the user modified or protected it
 *   - what remains unresolved (deleted upstream, user customizations, etc.)
 */
export interface DriftArtifactSummary {
  forkId: string;
  kitId: string;
  fromVersion: string;
  toVersion: string;
  severity: KitDriftSeverity;
  buckets: {
    /** Upstream-added scaffold the heal can safely add. */
    safeAdditions: DriftEntry[];
    /** Upstream-modified files the heal can align (manifest, deps). */
    safeUpdates: DriftEntry[];
    /** User-modified files the heal will skip (preservedPaths). */
    skippedUserModified: DriftEntry[];
    /** Files declared untouchable by policy — never modified. */
    skippedUntouchable: DriftEntry[];
    /** Files flagged for explicit confirmation per policy. */
    needsConfirmation: DriftEntry[];
    /** Detected user-authored custom skills — noted, never mutated. */
    customSkills: DriftEntry[];
    /** Upstream deleted the file — user must decide. */
    unresolvedUpstreamDeletion: DriftEntry[];
    /** Package dep additions. */
    packageAdditions: PackageDriftEntry[];
    /** Package dep upgrades (additive-only by default). */
    packageUpgrades: PackageDriftEntry[];
  };
  packageDriftCount: number;
  fileDriftCount: number;
}

export interface DriftEntry {
  path: string;
  note: string;
}

export interface PackageDriftEntry {
  packageName: string;
  fromVersion: string | null;
  toVersion: string;
  changeType: "added" | "updated" | "removed";
}

// ---------------------------------------------------------------------------
// Approval queue
// ---------------------------------------------------------------------------

export interface ApprovalQueueEntry {
  jobId: string;
  forkId: string;
  kitId: string;
  forkLabel?: string;
  createdAt: string;
  pendingPaths: string[];
  plan: KitForkHealPlan;
}

// ---------------------------------------------------------------------------
// Agent-led heal plan document
// ---------------------------------------------------------------------------

/**
 * A durable, human-reviewable plan document produced by an agent.
 * The document is materialised as a trace event and optionally rendered to
 * the user; it is NEVER applied automatically — the operator must explicitly
 * resume via `growthub kit fork heal <fork-id>` or `fleet heal`.
 */
export interface AgentHealPlanDocument {
  forkId: string;
  kitId: string;
  generatedAt: string;
  summary: string;
  driftReport: KitForkDriftReport;
  plan: KitForkHealPlan;
  artifactBreakdown: DriftArtifactSummary;
  policySnapshot: KitForkPolicy;
  /** Paths the agent wants the operator to confirm before applying. */
  awaitsConfirmation: string[];
  /** What the agent would do, in narrative form, suitable for reading aloud. */
  narrative: string[];
  registrationAtDraftTime: KitForkRegistration;
}
