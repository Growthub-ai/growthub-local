/**
 * Native Intelligence — Contract Types
 *
 * Stable types that define what the intelligence layer is allowed to see
 * and what it can return. This is the boundary contract between the
 * existing Growthub runtime and the Gemma model layer.
 *
 * Guardrails:
 *   - Model layer does not directly run tools
 *   - Model layer only shapes, recommends, explains, and drafts
 *   - Final compile/save/execute still goes through existing contract pipeline
 *   - Hosted runtime remains canonical execution truth
 *   - CMS nodes remain canonical execution primitives
 */

import type { CmsCapabilityNode } from "../cms-capability-registry/index.js";
import type { DynamicRegistryPipeline, DynamicRegistryPipelineNode } from "../dynamic-registry-pipeline/index.js";
import type { WorkflowLabel } from "../workflow-hygiene/types.js";
// Import and re-export NodeContractSummary so it's both usable here and accessible to consumers
import type { NodeContractSummary as _NodeContractSummary } from "../cms-node-contracts/types.js";
export type { NodeContractSummary } from "../cms-node-contracts/types.js";
type NodeContractSummary = _NodeContractSummary;

// ---------------------------------------------------------------------------
// Model provider identity
// ---------------------------------------------------------------------------

export type NativeIntelligenceModelId = "gemma3" | "gemma3n" | "codegemma";

/**
 * Extended provider types for multi-provider intelligence routing.
 * "local" = Ollama / vLLM / local OpenAI-compatible (default, existing behavior)
 * "claude" = Anthropic Messages API
 * "openai" = OpenAI Chat Completions API
 * "gemini" = Google Gemini API
 * "openrouter" = OpenRouter (OpenAI-compatible proxy)
 */
export type IntelligenceProviderType = "local" | "claude" | "openai" | "gemini" | "openrouter";

// ---------------------------------------------------------------------------
// Execution mode context
// ---------------------------------------------------------------------------

export type ExecutionModeContext = "local" | "hosted" | "hybrid";

// ---------------------------------------------------------------------------
// Workflow summary (what the model sees about saved workflows)
// ---------------------------------------------------------------------------

export interface WorkflowSummaryForIntelligence {
  workflowId: string;
  name: string;
  description?: string;
  nodeCount: number;
  nodeSlugs: string[];
  label: WorkflowLabel | null;
  createdAt: string;
  updatedAt?: string;
  versionCount: number;
}

// ---------------------------------------------------------------------------
// 1. Workflow Planning (planner.ts)
// ---------------------------------------------------------------------------

export interface WorkflowPlanningInput {
  userIntent: string;
  availableContracts: NodeContractSummary[];
  existingWorkflows?: WorkflowSummaryForIntelligence[];
  executionMode?: ExecutionModeContext;
  constraints?: PlanningConstraints;
}

export interface PlanningConstraints {
  maxNodes?: number;
  requiredOutputTypes?: string[];
  preferredFamilies?: string[];
  avoidSlugs?: string[];
}

export interface ProposedPipelineNode {
  slug: string;
  displayName: string;
  reason: string;
  suggestedBindings: Record<string, unknown>;
  upstreamNodeSlugs?: string[];
}

export interface WorkflowPlanningResult {
  proposedNodes: ProposedPipelineNode[];
  explanation: string;
  alternativeExistingWorkflowId?: string;
  alternativeExistingWorkflowReason?: string;
  confidence: number;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// 2. Binding Normalization (normalizer.ts)
// ---------------------------------------------------------------------------

export interface BindingNormalizationInput {
  nodeSlug: string;
  rawBindings: Record<string, unknown>;
  contract: NodeContractSummary;
  userIntent?: string;
  executionMode?: ExecutionModeContext;
}

export interface NormalizedField {
  key: string;
  originalValue: unknown;
  normalizedValue: unknown;
  action: "kept" | "coerced" | "defaulted" | "cleared" | "inferred";
  reason?: string;
}

export interface BindingNormalizationResult {
  normalizedBindings: Record<string, unknown>;
  fields: NormalizedField[];
  missingRequired: string[];
  warnings: string[];
  confidence: number;
}

// ---------------------------------------------------------------------------
// 3. Workflow Recommendation (recommender.ts)
// ---------------------------------------------------------------------------

export interface WorkflowRecommendationInput {
  userIntent: string;
  savedWorkflows: WorkflowSummaryForIntelligence[];
  availableContracts: NodeContractSummary[];
  executionMode?: ExecutionModeContext;
}

export type RecommendationStrategy = "reuse-existing" | "start-from-template" | "synthesize-new";

export interface WorkflowRecommendation {
  strategy: RecommendationStrategy;
  workflowId?: string;
  workflowName?: string;
  templateSlug?: string;
  reason: string;
  confidence: number;
}

export interface WorkflowRecommendationResult {
  topRecommendation: WorkflowRecommendation;
  alternatives: WorkflowRecommendation[];
  explanation: string;
}

// ---------------------------------------------------------------------------
// 4. Execution Summary (summarizer.ts)
// ---------------------------------------------------------------------------

export interface ExecutionSummaryInput {
  pipeline: PipelineSummaryForIntelligence;
  registryContext: NodeContractSummary[];
  phase: "pre-save" | "pre-execution" | "post-execution" | "recommendation";
  executionResult?: ExecutionResultForIntelligence;
}

export interface PipelineSummaryForIntelligence {
  pipelineId: string;
  executionMode: ExecutionModeContext;
  nodes: Array<{
    slug: string;
    bindingCount: number;
    missingRequired: string[];
    outputTypes: string[];
    assetCount: number;
  }>;
  warnings: string[];
}

export interface ExecutionResultForIntelligence {
  status: "succeeded" | "failed" | "partial";
  nodeStatuses: Record<string, "succeeded" | "failed" | "pending" | "running">;
  artifactCount: number;
  outputText?: string;
  errorMessages?: string[];
}

export interface ExecutionSummaryResult {
  title: string;
  explanation: string;
  missingBindingGuidance: string[];
  runtimeModeNote?: string;
  outputExpectation?: string;
  costLatencyCautions: string[];
  warnings: string[];
  confidence: number;
}

// ---------------------------------------------------------------------------
// Model backend contract (provider.ts)
// ---------------------------------------------------------------------------

export interface ModelCompletionInput {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "json" | "text";
}

export interface ModelCompletionResult {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  modelId: string;
  latencyMs: number;
}

// ---------------------------------------------------------------------------
// Top-level provider interface
// ---------------------------------------------------------------------------

export interface NativeIntelligenceProvider {
  id: NativeIntelligenceModelId;

  planWorkflow(input: WorkflowPlanningInput): Promise<WorkflowPlanningResult>;
  normalizeBindings(input: BindingNormalizationInput): Promise<BindingNormalizationResult>;
  recommendWorkflow(input: WorkflowRecommendationInput): Promise<WorkflowRecommendationResult>;
  summarizeExecution(input: ExecutionSummaryInput): Promise<ExecutionSummaryResult>;
}

// ---------------------------------------------------------------------------
// Backend adapter interface
// ---------------------------------------------------------------------------

export interface NativeIntelligenceBackend {
  complete(input: ModelCompletionInput): Promise<ModelCompletionResult>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface NativeIntelligenceConfig {
  modelId: NativeIntelligenceModelId;
  backendType: "local" | "hosted";
  endpoint: string;
  localModel?: string;
  apiKey?: string;
  defaultTemperature?: number;
  defaultMaxTokens?: number;
  timeoutMs?: number;
  /** Extended provider type for multi-provider routing. */
  providerType?: IntelligenceProviderType;
  /** Provider-specific model identifier (e.g. "claude-sonnet-4-6", "gpt-4o", "gemini-2.5-flash"). */
  providerModelId?: string;
}

export const DEFAULT_INTELLIGENCE_CONFIG: NativeIntelligenceConfig = {
  modelId: "gemma3",
  backendType: "local",
  endpoint: "http://localhost:8080/v1/chat/completions",
  defaultTemperature: 0.3,
  defaultMaxTokens: 4096,
  timeoutMs: 30_000,
};
