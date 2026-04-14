import type { CmsCapabilityNode } from "../cms-capability-registry/index.js";

export type ContractFieldType =
  | "string"
  | "number"
  | "boolean"
  | "array"
  | "object"
  | "unknown";

export interface NodeInputFieldContract {
  key: string;
  label: string;
  type: ContractFieldType;
  required: boolean;
  defaultValue?: unknown;
}

export interface NodeOutputFieldContract {
  key: string;
  type: ContractFieldType | string;
  required: boolean;
}

export interface NodeContractSummary {
  slug: string;
  displayName: string;
  family: string;
  nodeType: string;
  executionKind: string;
  executionStrategy: string;
  requiredBindings: string[];
  outputTypes: string[];
  inputs: NodeInputFieldContract[];
  outputs: NodeOutputFieldContract[];
}

export interface NormalizedBindings {
  bindings: Record<string, unknown>;
  providedCount: number;
  defaultedCount: number;
  normalizedCount: number;
}

export interface ContractValidationResult {
  valid: boolean;
  missingRequiredInputs: string[];
  missingRequiredBindings: string[];
  warnings: string[];
}

export interface PipelineLikeNode {
  id: string;
  slug: string;
  bindings: Record<string, unknown>;
  upstreamNodeIds?: string[];
}

export interface PipelineLike {
  pipelineId: string;
  executionMode: string;
  nodes: PipelineLikeNode[];
  metadata?: Record<string, unknown>;
}

export interface CompiledHostedWorkflowConfig extends Record<string, unknown> {
  name: string;
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
}

export interface PreExecutionNodeSummary {
  nodeId: string;
  slug: string;
  requiredMissing: string[];
  bindingCount: number;
  assetCount: number;
  outputTypes: string[];
}

export interface PreExecutionSummary {
  pipelineId: string;
  executionMode: string;
  nodeCount: number;
  warnings: string[];
  nodes: PreExecutionNodeSummary[];
  compiledConfig: CompiledHostedWorkflowConfig;
}

export interface PreExecutionSummaryInput {
  pipeline: PipelineLike;
  registryBySlug: Map<string, CmsCapabilityNode>;
}
