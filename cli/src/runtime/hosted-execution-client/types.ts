/**
 * Hosted Execution Client — Type Definitions
 *
 * Typed contracts for the CLI → hosted execution bridge.
 * These mirror the hosted app's execution surfaces so the CLI can call them
 * safely with the authenticated bridge session (auth/session-store).
 */

// ---------------------------------------------------------------------------
// Workflow execution
// ---------------------------------------------------------------------------

export interface HostedExecuteWorkflowInput {
  /** Pipeline ID from the dynamic registry pipeline builder. */
  pipelineId: string;
  /** Optional persisted hosted workflow id for workflow_runs/chat_messages linkage. */
  workflowId?: string;
  /** Thread/conversation ID to scope execution artifacts. */
  threadId?: string;
  /** User-facing prompt to persist alongside the workflow run when available. */
  userPrompt?: string;
  /** Ordered node execution payloads. */
  nodes: HostedExecuteNodePayload[];
  /** Execution mode hint for the hosted runtime. */
  executionMode: "local" | "hosted" | "hybrid";
  /** Opaque caller metadata forwarded to the hosted runtime. */
  metadata?: Record<string, unknown>;
}

export interface HostedExecuteNodePayload {
  /** Unique node instance ID within the pipeline. */
  nodeId: string;
  /** CMS capability slug identifying the node primitive. */
  slug: string;
  /** Resolved bindings for this node (provider keys, connection refs, etc.). */
  bindings: Record<string, unknown>;
  /** Upstream node IDs whose outputs feed into this node. */
  upstreamNodeIds?: string[];
}

export interface HostedExecuteWorkflowResult {
  /** Server-assigned execution ID. */
  executionId: string;
  /** Hosted thread id used for the run. */
  threadId?: string;
  /** Overall execution status. */
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  /** Per-node results keyed by nodeId. */
  nodeResults: Record<string, HostedNodeResult>;
  /** Artifacts produced by the execution. */
  artifacts: HostedExecutionArtifactRef[];
  /** ISO timestamp when execution started. */
  startedAt?: string;
  /** ISO timestamp when execution completed. */
  completedAt?: string;
  /** Raw execution log returned by the streamed workflow endpoint. */
  executionLog?: Array<Record<string, unknown>>;
  /** Condensed metadata for CLI-facing summaries. */
  summary?: {
    outputText?: string;
    imageCount?: number;
    slideCount?: number;
    videoCount?: number;
    workflowRunId?: string;
    keyboardShortcutHint?: string;
  };
}

export interface HostedNodeResult {
  nodeId: string;
  slug: string;
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  output?: Record<string, unknown>;
  error?: string;
}

export interface HostedExecutionArtifactRef {
  artifactId: string;
  artifactType: string;
  nodeId: string;
  url?: string;
  storagePath?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Provider assembly
// ---------------------------------------------------------------------------

export interface HostedProviderAssemblyInput {
  /** Capability slug to assemble providers for. */
  capabilitySlug: string;
  /** Execution context (local runtime, hosted, hybrid). */
  executionContext: "local" | "hosted" | "hybrid";
  /** Connection ID to scope provider assembly. */
  connectionId?: string;
  /** Additional assembly parameters. */
  parameters?: Record<string, unknown>;
}

export interface HostedProviderAssemblyResult {
  /** Assembled provider configuration. */
  providers: HostedProviderRecord[];
  /** Assembly status. */
  status: "ready" | "partial" | "unavailable";
  /** Human-readable assembly notes. */
  notes?: string[];
}

export interface HostedProviderRecord {
  providerId: string;
  providerType: string;
  capabilities: string[];
  status: "active" | "degraded" | "unavailable";
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Profile & capabilities
// ---------------------------------------------------------------------------

export interface HostedProfile {
  userId: string;
  email?: string;
  displayName?: string;
  orgId?: string;
  orgName?: string;
  entitlements: string[];
  gatedKitSlugs: string[];
  executionDefaults: {
    preferredMode: "local" | "serverless" | "browser" | "auto";
    allowServerlessFallback: boolean;
    allowBrowserBridge: boolean;
  };
}

export interface HostedCapabilityRecord {
  slug: string;
  family: string;
  displayName: string;
  executionKind: "hosted-execute" | "provider-assembly" | "local-only";
  requiredBindings: string[];
  outputTypes: string[];
  enabled: boolean;
  metadata?: Record<string, unknown>;
}
