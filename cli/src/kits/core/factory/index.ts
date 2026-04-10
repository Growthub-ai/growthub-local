/**
 * Kit Factory — Family Template System
 *
 * Provides canonical ForkAdapterCoreConfig factories for each kit family:
 *
 *   studio   — AI studio (image/video/audio/cinema generation)
 *   workflow — Multi-step agentic pipeline or automation workflow
 *   operator — Domain-specific operator (email, growth, content, social)
 *   ops      — Infrastructure, devops, or execution surface operator
 *
 * Each factory produces a complete ForkAdapterCoreConfig that wires together:
 *   provider, envGate, setup, forkInspection, runtimeSurface, output
 *
 * Kits override the factory output for their specific values.
 * The factory ensures all required fields are present by default.
 */

export { createStudioKitConfig, STUDIO_KIT_DEFAULTS } from "./studio-kit.js";
export { createWorkflowKitConfig, WORKFLOW_KIT_DEFAULTS } from "./workflow-kit.js";
export { createOperatorKitConfig, OPERATOR_KIT_DEFAULTS } from "./operator-kit.js";
export { createOpsKitConfig, OPS_KIT_DEFAULTS } from "./ops-kit.js";

export type { StudioKitOptions } from "./studio-kit.js";
export type { WorkflowKitOptions } from "./workflow-kit.js";
export type { OperatorKitOptions } from "./operator-kit.js";
export type { OpsKitOptions } from "./ops-kit.js";
