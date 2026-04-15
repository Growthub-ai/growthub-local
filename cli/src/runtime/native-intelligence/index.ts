/**
 * Native Intelligence Module
 *
 * A contract-driven intelligence layer that plugs into existing Growthub
 * runtime contracts. Sits above the contract pipeline and below user intent,
 * helping plan, normalize, recommend, and summarize without replacing the
 * hosted runtime or CMS node substrate.
 *
 * Architecture:
 *   Growthub runtime/orchestrator = OS
 *   CMS nodes / workflows / kits = executable primitives
 *   Gemma layer = planner / router / normalizer / recommender
 *
 * Model mapping:
 *   - Gemma 3: hosted reasoning/planning/summaries (128K context)
 *   - Gemma 3n: local/on-machine multimodal assistance (32K context)
 *   - CodeGemma: code/graph synthesis tasks
 *
 * Guardrails:
 *   - Hosted runtime remains canonical execution truth
 *   - CMS nodes remain canonical execution primitives
 *   - Model layer does not directly run tools
 *   - Model layer only shapes, recommends, explains, and drafts
 *   - Final compile/save/execute still goes through existing contract pipeline
 */

import fs from "node:fs";
import path from "node:path";
import { resolvePaperclipHomeDir } from "../../config/home.js";
import type {
  NativeIntelligenceProvider,
  NativeIntelligenceBackend,
  NativeIntelligenceConfig,
  NativeIntelligenceModelId,
  WorkflowPlanningInput,
  WorkflowPlanningResult,
  BindingNormalizationInput,
  BindingNormalizationResult,
  WorkflowRecommendationInput,
  WorkflowRecommendationResult,
  ExecutionSummaryInput,
  ExecutionSummaryResult,
} from "./contract.js";
import { DEFAULT_INTELLIGENCE_CONFIG } from "./contract.js";
import { createNativeIntelligenceBackend, createStubBackend, checkBackendHealth } from "./provider.js";
import { summarizeExecution, buildDeterministicSummary } from "./summarizer.js";
import { intelligentNormalizeBindings, buildDeterministicNormalization } from "./normalizer.js";
import { recommendWorkflow, buildDeterministicRecommendation } from "./recommender.js";
import { planWorkflow, buildDeterministicPlan } from "./planner.js";
import { buildMarketingContext, buildDeterministicContext } from "./marketing-context-builder.js";

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type {
  NativeIntelligenceProvider,
  NativeIntelligenceBackend,
  NativeIntelligenceConfig,
  NativeIntelligenceModelId,
  ModelCompletionInput,
  ModelCompletionResult,
  WorkflowPlanningInput,
  WorkflowPlanningResult,
  ProposedPipelineNode,
  PlanningConstraints,
  BindingNormalizationInput,
  BindingNormalizationResult,
  NormalizedField,
  WorkflowRecommendationInput,
  WorkflowRecommendationResult,
  WorkflowRecommendation,
  RecommendationStrategy,
  ExecutionSummaryInput,
  ExecutionSummaryResult,
  PipelineSummaryForIntelligence,
  ExecutionResultForIntelligence,
  ExecutionModeContext,
  WorkflowSummaryForIntelligence,
} from "./contract.js";

export { DEFAULT_INTELLIGENCE_CONFIG } from "./contract.js";
export { createNativeIntelligenceBackend, createStubBackend, checkBackendHealth, NativeIntelligenceBackendError } from "./provider.js";
export { summarizeExecution, buildDeterministicSummary } from "./summarizer.js";
export { intelligentNormalizeBindings, buildDeterministicNormalization } from "./normalizer.js";
export { recommendWorkflow, buildDeterministicRecommendation } from "./recommender.js";
export { planWorkflow, buildDeterministicPlan } from "./planner.js";
export { buildMarketingContext, buildDeterministicContext } from "./marketing-context-builder.js";
export type { MarketingContextInput, MarketingContextResult } from "./marketing-context-builder.js";

// ---------------------------------------------------------------------------
// Configuration persistence
// ---------------------------------------------------------------------------

function resolveConfigPath(): string {
  return path.resolve(resolvePaperclipHomeDir(), "native-intelligence", "config.json");
}

export function readIntelligenceConfig(): NativeIntelligenceConfig {
  const configPath = resolveConfigPath();
  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_INTELLIGENCE_CONFIG };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Partial<NativeIntelligenceConfig>;
    return {
      modelId: validateModelId(raw.modelId),
      backendType: raw.backendType === "hosted" ? "hosted" : "local",
      endpoint: typeof raw.endpoint === "string" ? raw.endpoint : DEFAULT_INTELLIGENCE_CONFIG.endpoint,
      localModel: typeof raw.localModel === "string" ? raw.localModel : undefined,
      apiKey: typeof raw.apiKey === "string" ? raw.apiKey : undefined,
      defaultTemperature: typeof raw.defaultTemperature === "number" ? raw.defaultTemperature : DEFAULT_INTELLIGENCE_CONFIG.defaultTemperature,
      defaultMaxTokens: typeof raw.defaultMaxTokens === "number" ? raw.defaultMaxTokens : DEFAULT_INTELLIGENCE_CONFIG.defaultMaxTokens,
      timeoutMs: typeof raw.timeoutMs === "number" ? raw.timeoutMs : DEFAULT_INTELLIGENCE_CONFIG.timeoutMs,
    };
  } catch {
    return { ...DEFAULT_INTELLIGENCE_CONFIG };
  }
}

export function writeIntelligenceConfig(config: NativeIntelligenceConfig): void {
  const configPath = resolveConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

function validateModelId(id: unknown): NativeIntelligenceModelId {
  if (id === "gemma3" || id === "gemma3n" || id === "codegemma") return id;
  return "gemma3";
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

export function createNativeIntelligenceProvider(
  configOverride?: Partial<NativeIntelligenceConfig>,
): NativeIntelligenceProvider {
  const config = { ...readIntelligenceConfig(), ...configOverride };
  const backend = createNativeIntelligenceBackend(config);

  return {
    id: config.modelId,

    async planWorkflow(input: WorkflowPlanningInput): Promise<WorkflowPlanningResult> {
      return planWorkflow(input, backend);
    },

    async normalizeBindings(input: BindingNormalizationInput): Promise<BindingNormalizationResult> {
      return intelligentNormalizeBindings(input, backend);
    },

    async recommendWorkflow(input: WorkflowRecommendationInput): Promise<WorkflowRecommendationResult> {
      return recommendWorkflow(input, backend);
    },

    async summarizeExecution(input: ExecutionSummaryInput): Promise<ExecutionSummaryResult> {
      return summarizeExecution(input, backend);
    },
  };
}

// ---------------------------------------------------------------------------
// Deterministic-only provider (no model backend needed)
// ---------------------------------------------------------------------------

export function createDeterministicProvider(): NativeIntelligenceProvider {
  return {
    id: "gemma3",

    async planWorkflow(input: WorkflowPlanningInput): Promise<WorkflowPlanningResult> {
      return buildDeterministicPlan(input);
    },

    async normalizeBindings(input: BindingNormalizationInput): Promise<BindingNormalizationResult> {
      return buildDeterministicNormalization(input);
    },

    async recommendWorkflow(input: WorkflowRecommendationInput): Promise<WorkflowRecommendationResult> {
      return buildDeterministicRecommendation(input);
    },

    async summarizeExecution(input: ExecutionSummaryInput): Promise<ExecutionSummaryResult> {
      return buildDeterministicSummary(input);
    },
  };
}
