/**
 * Fork Sync — shared types.
 *
 * The sync surface is intentionally small and boundary-typed so that the CLI
 * command layer, the service layer, and the test layer all agree on wire
 * format. Job state, drift entries, and registry records are persisted to
 * disk as JSON and must remain forward-compatible.
 */

export type FileClassification =
  | "unchanged"
  | "upstream-only"
  | "local-only"
  | "upstream-modified"
  | "local-modified"
  | "both-modified"
  | "upstream-removed";

export type MergeAction =
  | "noop"
  | "apply-upstream"
  | "preserve-local"
  | "merge-package-json"
  | "escalate-review"
  | "skip-frozen-conflict";

export interface DriftEntry {
  path: string;
  classification: FileClassification;
  action: MergeAction;
  frozen: boolean;
  reason: string;
}

export interface DriftSummary {
  kitId: string;
  forkId: string;
  baselineVersion: string;
  upstreamVersion: string;
  totals: {
    unchanged: number;
    applyUpstream: number;
    preserveLocal: number;
    mergePackageJson: number;
    escalateReview: number;
    frozenConflicts: number;
  };
  entries: DriftEntry[];
  generatedAt: string;
}

export interface ForkRegistryRecord {
  forkId: string;
  kitId: string;
  forkPath: string;
  baselineVersion: string;
  baselineCapturedAt: string;
  lastSyncAt?: string;
  lastSyncJobId?: string;
  notes?: string;
}

export interface ForkRegistry {
  schemaVersion: 1;
  forks: ForkRegistryRecord[];
}

export type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "needs-review";

export interface JobState {
  jobId: string;
  forkId: string;
  kitId: string;
  status: JobStatus;
  mode: "inline" | "detached";
  autoApply: boolean;
  baselineVersion: string;
  upstreamVersion: string;
  startedAt: string;
  endedAt?: string;
  pid?: number;
  branch?: string;
  logPath: string;
  reportPath: string;
  summary?: {
    applied: number;
    preserved: number;
    escalated: number;
    frozenConflicts: number;
    errors: number;
  };
  error?: string;
}
