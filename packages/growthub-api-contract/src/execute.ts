/**
 * Growthub API v1 — Execution Types
 *
 * Typed contracts for the hosted workflow execution bridge and the
 * NDJSON event stream the hosted runtime emits.
 */

export interface HostedExecuteNodePayload {
  nodeId: string;
  slug: string;
  bindings: Record<string, unknown>;
  upstreamNodeIds?: string[];
}

export interface HostedExecuteWorkflowInput {
  pipelineId: string;
  workflowId?: string;
  threadId?: string;
  userPrompt?: string;
  nodes: HostedExecuteNodePayload[];
  executionMode: "local" | "hosted" | "hybrid";
  metadata?: Record<string, unknown>;
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

export interface HostedExecuteWorkflowSummary {
  outputText?: string;
  imageCount?: number;
  slideCount?: number;
  videoCount?: number;
  workflowRunId?: string;
  keyboardShortcutHint?: string;
}

export interface HostedExecuteWorkflowResult {
  executionId: string;
  threadId?: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  nodeResults: Record<string, HostedNodeResult>;
  artifacts: HostedExecutionArtifactRef[];
  startedAt?: string;
  completedAt?: string;
  executionLog?: Array<Record<string, unknown>>;
  summary?: HostedExecuteWorkflowSummary;
}

/**
 * Typed union of the NDJSON events emitted by POST /api/execute-workflow.
 * The legacy loose `ExecuteWorkflowEvent` shape is kept as a superset for
 * back-compat; callers should prefer this typed union when possible.
 */
export type ExecuteWorkflowStreamEvent =
  | NodeStartEvent
  | NodeCompleteEvent
  | NodeErrorEvent
  | WorkflowStartEvent
  | WorkflowCompleteEvent
  | WorkflowErrorEvent;

export interface NodeStartEvent {
  type: "node_start";
  nodeId: string;
  slug?: string;
  startedAt?: string;
}

export interface NodeCompleteEvent {
  type: "node_complete";
  nodeId: string;
  slug?: string;
  output?: Record<string, unknown>;
  completedAt?: string;
}

export interface NodeErrorEvent {
  type: "node_error";
  nodeId: string;
  slug?: string;
  error: string;
}

export interface WorkflowStartEvent {
  type: "start";
  executionId?: string;
  workflowId?: string;
  threadId?: string;
}

export interface WorkflowCompleteEvent {
  type: "complete";
  executionId?: string;
  executionLog?: Array<Record<string, unknown>>;
}

export interface WorkflowErrorEvent {
  type: "error";
  error: string;
  nodeId?: string;
}

// ---------------------------------------------------------------------------
// Provider assembly (POST /api/sandbox/provider-report)
// ---------------------------------------------------------------------------

export interface HostedProviderAssemblyInput {
  capabilitySlug: string;
  executionContext: "local" | "hosted" | "hybrid";
  connectionId?: string;
  parameters?: Record<string, unknown>;
}

export interface HostedProviderRecord {
  providerId: string;
  providerType: string;
  capabilities: string[];
  status: "active" | "degraded" | "unavailable";
  metadata?: Record<string, unknown>;
}

export interface HostedProviderAssemblyResult {
  providers: HostedProviderRecord[];
  status: "ready" | "partial" | "unavailable";
  notes?: string[];
}

// ---------------------------------------------------------------------------
// Hosted profile (GET /api/cli/profile)
// ---------------------------------------------------------------------------

export interface HostedProfileExecutionDefaults {
  preferredMode: "local" | "serverless" | "browser" | "auto";
  allowServerlessFallback: boolean;
  allowBrowserBridge: boolean;
}

export interface HostedProfile {
  userId: string;
  email?: string;
  displayName?: string;
  orgId?: string;
  orgName?: string;
  entitlements: string[];
  gatedKitSlugs: string[];
  executionDefaults: HostedProfileExecutionDefaults;
}
