/**
 * Growthub API v1 — Metrics + Policy Telemetry
 *
 * Stable shapes for the metrics and policy observations surfaced through
 * the CLI and hosted app. All enterprise-management views (fleet,
 * authority, policy, cost leaderboard) bind to these types so the same
 * numbers render in every surface.
 */

export interface RegistryMetrics {
  registryHash: string;
  fetchedAt: string;
  cached: boolean;
  ageSeconds: number;
  nodeCount: number;
  enabledCount: number;
  localExtensionCount: number;
  /** Per-family breakdown. */
  familyCounts: Record<string, number>;
  /** Last drift evaluation, if any. */
  drift?: {
    severity: "none" | "node-added" | "node-removed" | "node-mutated" | "hash-mismatch";
    addedSlugs: string[];
    removedSlugs: string[];
    mutatedSlugs: string[];
  };
}

export interface ExecutionMetrics {
  executionId: string;
  pipelineId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  nodeCount: number;
  succeededNodes: number;
  failedNodes: number;
  artifactCount: number;
  totalCostUsd?: number;
  providerIds: string[];
}

export interface PolicyObservation {
  /** Policy key the observation was attached to (e.g. "allowedCapabilities"). */
  key: string;
  /** What the observation refers to (e.g. a capability slug). */
  subject: string;
  /** Result: allowed, denied, or skipped. */
  outcome: "allowed" | "denied" | "skipped";
  /** Reason string for the outcome. */
  reason: string;
  evaluatedAt: string;
}

export interface PolicyDocument {
  version: 1;
  /** Capability slugs this fork may execute. Empty = unrestricted (default). */
  allowedCapabilities?: string[];
  /** Provider ids this fork may call. Empty = unrestricted (default). */
  allowedProviders?: string[];
  /** Data residency label (e.g. "us-east", "eu"). */
  dataResidency?: string;
  /** Per-provider rate limits in calls-per-minute. */
  perProviderRateLimits?: Record<string, number>;
  /** Operator free-form notes. */
  notes?: string;
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  reason: string;
  observations: PolicyObservation[];
}

export interface FleetForkSummary {
  forkId: string;
  forkPath?: string;
  label?: string;
  policyHash?: string;
  authorityPresent: boolean;
  lastTraceAt?: string;
  capabilityCount?: number;
  localExtensionCount?: number;
}

export interface FleetSnapshot {
  generatedAt: string;
  forks: FleetForkSummary[];
}

/**
 * Authority attestation envelope summary. The full ed25519 envelope lives
 * under `<forkPath>/.growthub-fork/authority.json`; this is the CLI-facing
 * summary used in renderers and fleet views.
 */
export interface AuthorityAttestationSummary {
  kitId: string;
  policyHash: string;
  grants: {
    capabilities: string[];
  };
  expiresAt: string;
  nonce: string;
  signer: {
    publicKeyId: string;
    algorithm: "ed25519";
  };
  /** Verification outcome when last checked. */
  verification?: {
    valid: boolean;
    reason: string;
    checkedAt: string;
  };
}
