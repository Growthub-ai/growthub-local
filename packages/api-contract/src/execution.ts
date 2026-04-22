/**
 * CMS SDK v1 — Execution contract.
 *
 * Payloads and results for hosted workflow execution. Mirrors the existing
 * hosted execution client surface so CLI, hosted, and third-party callers
 * share one typed shape.
 */

export type ExecutionMode = "local" | "hosted" | "hybrid";

export type ExecutionStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type NodeExecutionStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped";

export interface ExecuteNodePayload {
  nodeId: string;
  slug: string;
  bindings: Record<string, unknown>;
  upstreamNodeIds?: string[];
}

export interface ExecuteWorkflowInput {
  pipelineId: string;
  workflowId?: string;
  threadId?: string;
  userPrompt?: string;
  nodes: ExecuteNodePayload[];
  executionMode: ExecutionMode;
  metadata?: Record<string, unknown>;
}

export interface NodeResult {
  nodeId: string;
  slug: string;
  status: NodeExecutionStatus;
  output?: Record<string, unknown>;
  error?: string;
}

export interface ExecutionArtifactRef {
  artifactId: string;
  artifactType: string;
  nodeId: string;
  url?: string;
  storagePath?: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutionSummary {
  outputText?: string;
  imageCount?: number;
  slideCount?: number;
  videoCount?: number;
  workflowRunId?: string;
  keyboardShortcutHint?: string;
}

export interface ExecuteWorkflowResult {
  executionId: string;
  threadId?: string;
  status: ExecutionStatus;
  nodeResults: Record<string, NodeResult>;
  artifacts: ExecutionArtifactRef[];
  startedAt?: string;
  completedAt?: string;
  executionLog?: Array<Record<string, unknown>>;
  summary?: ExecutionSummary;
}
