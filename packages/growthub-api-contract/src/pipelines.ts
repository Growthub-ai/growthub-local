/**
 * Growthub API v1 — Pipeline Types
 *
 * Typed DAG that describes how CMS capability nodes compose into a
 * runnable workflow. The builder assembles pipelines from registered
 * capability contracts, not from ad-hoc instructions.
 */

export interface DynamicRegistryPipelineNode {
  /** Unique node instance id within this pipeline. */
  id: string;
  /** CMS capability slug. */
  slug: string;
  /** Resolved bindings for this node. */
  bindings: Record<string, unknown>;
  /** Upstream node ids whose outputs feed into this node. */
  upstreamNodeIds?: string[];
}

export type PipelineExecutionMode = "local" | "hosted" | "hybrid";

export interface DynamicRegistryPipeline {
  threadId?: string;
  pipelineId: string;
  nodes: DynamicRegistryPipelineNode[];
  executionMode: PipelineExecutionMode;
  metadata?: Record<string, unknown>;
}

export type PipelineValidationSeverity = "error" | "warning";

export interface PipelineValidationIssue {
  severity: PipelineValidationSeverity;
  nodeId?: string;
  field?: string;
  message: string;
}

export interface PipelineValidationResult {
  valid: boolean;
  issues: PipelineValidationIssue[];
}

export interface PipelineExecutionPackage {
  pipeline: DynamicRegistryPipeline;
  executionRoute: "hosted-execute" | "provider-assembly" | "mixed";
  nodeRoutes: Record<string, "hosted-execute" | "provider-assembly" | "local-only">;
}

export interface SerializedPipeline {
  version: 1;
  pipeline: DynamicRegistryPipeline;
  createdAt: string;
  source: "cli-assemble" | "file-import" | "agent";
}
