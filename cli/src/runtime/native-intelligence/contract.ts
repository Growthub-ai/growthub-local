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

/**
 * Canonical model family id. Bounded on purpose — concrete adapter tags
 * (e.g. "gemma3:4b", "qwen2.5-coder:32b", "minimax-m1-80k") live on
 * `NativeIntelligenceConfig.localModel` and in `MODEL_CATALOG`.
 *
 * When adding a new family:
 *   1. Add the family id here.
 *   2. Add one or more entries to `MODEL_CATALOG` with that family.
 *   3. If the family has a distinct default endpoint, extend
 *      `getBackendConfig` in `provider.ts`.
 */
export type NativeIntelligenceModelId =
  | "gemma3"
  | "gemma3n"
  | "codegemma"
  | "qwen-coder"
  | "minimax"
  | "kimi"
  | "deepseek"
  | "glm";

export type LocalModelFamily = NativeIntelligenceModelId;

// ---------------------------------------------------------------------------
// Local model variant (catalog entry shape)
// ---------------------------------------------------------------------------

/**
 * Single entry in the static local-model catalog.
 *
 * All concrete model tags that Growthub Local treats as "first-class"
 * live here. The catalog is pure typed data — no FS, no imports from other
 * CLI modules — mirroring `cli/src/templates/catalog.ts` and
 * `cli/src/kits/catalog.ts`.
 */
export interface LocalModelVariant {
  /** Concrete adapter tag (e.g. "gemma3:4b", "qwen2.5-coder:32b"). Unique. */
  id: string;
  /** Canonical family id used by the intelligence layer. */
  family: LocalModelFamily;
  /** Human display label. */
  displayName: string;
  /** Hugging Face repo id, when the model originates there. */
  hfRepoId?: string;
  /** Typical Ollama pull tag, if distinct from `id`. */
  ollamaTag?: string;
  /** Advertised context window (tokens). */
  contextLength: number;
  /** Recommended quantization for local inference. */
  recommendedQuant: string;
  /** Short capability tags — free-form strings used for UI hints. */
  strengths: string[];
  /** Free-form hardware hint shown in the picker. */
  hardwareHint: string;
  /** Env var name that, when set, overrides the per-family base URL. */
  defaultEndpointEnv?: string;
  /** Fallback base URL when the env var is unset. */
  defaultEndpointUrl?: string;
  /** If true, this variant is the recommended/validated default. */
  recommended?: boolean;
}

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
