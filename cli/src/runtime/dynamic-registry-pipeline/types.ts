/**
 * Dynamic Registry Pipeline — Type Definitions
 *
 * Types for assembling, validating, and executing dynamic pipelines from
 * CMS-backed node primitives. Modeled after:
 *   - manifest registry workflow thinking
 *   - GH MAX mode pipeline selection
 *   - node orchestration contracts already in production
 *
 * The builder assembles pipelines from registered node contracts, not from
 * arbitrary ad hoc instructions.
 */

// ---------------------------------------------------------------------------
// Pipeline node
// ---------------------------------------------------------------------------

export interface DynamicRegistryPipelineNode {
  /** Unique node instance ID within this pipeline. */
  id: string;
  /** CMS capability slug. */
  slug: string;
  /** Resolved bindings for this node. */
  bindings: Record<string, unknown>;
  /** IDs of upstream nodes whose outputs feed into this node. */
  upstreamNodeIds?: string[];
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export type PipelineExecutionMode = "local" | "hosted" | "hybrid";

export interface DynamicRegistryPipeline {
  /** Optional thread/conversation ID for scoping. */
  threadId?: string;
  /** Unique pipeline ID. */
  pipelineId: string;
  /** Ordered list of pipeline nodes. */
  nodes: DynamicRegistryPipelineNode[];
  /** Execution mode for the pipeline. */
  executionMode: PipelineExecutionMode;
  /** Pipeline-level metadata. */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Execution packaging
// ---------------------------------------------------------------------------

export interface PipelineExecutionPackage {
  /** The validated pipeline. */
  pipeline: DynamicRegistryPipeline;
  /** Execution route: which hosted endpoint to target. */
  executionRoute: "hosted-execute" | "provider-assembly" | "mixed";
  /** Per-node execution route mapping. */
  nodeRoutes: Record<string, "hosted-execute" | "provider-assembly" | "local-only">;
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export interface SerializedPipeline {
  version: 1;
  pipeline: DynamicRegistryPipeline;
  createdAt: string;
  source: "cli-assemble" | "file-import" | "agent";
}
