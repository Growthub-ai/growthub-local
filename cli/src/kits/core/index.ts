/**
 * Fork Adapter Core — Top-Level Barrel
 *
 * The primary import surface for the entire core module.
 * Consuming code imports from here.
 *
 * @example
 * import {
 *   createStudioKitConfig,
 *   runAdapterValidation,
 *   buildMuapiProviderContract,
 * } from '../kits/core/index.js';
 */

// Types
export * from "./types/index.js";

// Adapter core contracts and validators
export * from "./adapter-core/index.js";

// Kit factory — family templates
export {
  createStudioKitConfig,
  STUDIO_KIT_DEFAULTS,
  createWorkflowKitConfig,
  WORKFLOW_KIT_DEFAULTS,
  createOperatorKitConfig,
  OPERATOR_KIT_DEFAULTS,
  createOpsKitConfig,
  OPS_KIT_DEFAULTS,
} from "./factory/index.js";

export type {
  StudioKitOptions,
  WorkflowKitOptions,
  OperatorKitOptions,
  OpsKitOptions,
} from "./factory/index.js";

// Validation runner
export {
  runAdapterValidation,
  formatAdapterValidationReport,
} from "./validation/index.js";

export type {
  AdapterValidationReport,
  AdapterValidationSection,
} from "./validation/index.js";

// ---------------------------------------------------------------------------
// Reference config: Open Higgsfield Studio Kit (growthub-open-higgsfield-studio-v1)
// The canonical Studio family reference — used in tests and as a living example.
// ---------------------------------------------------------------------------

import { createStudioKitConfig } from "./factory/studio-kit.js";
import type { ForkAdapterCoreConfig } from "./adapter-core/contracts.js";

export function buildOpenHiggsfieldStudioConfig(): ForkAdapterCoreConfig {
  return createStudioKitConfig({
    kitId: "growthub-open-higgsfield-studio-v1",
    upstreamRepoUrl: "https://github.com/Anil-matcha/Open-Higgsfield-AI",
    defaultLocalPath: "~/open-higgsfield-ai",
    defaultDevPort: 3001,
    apiKeyEnvVar: "MUAPI_API_KEY",
    providerId: "muapi",
  });
}

// ---------------------------------------------------------------------------
// Reference config: AI Website Cloner Kit (growthub-ai-website-cloner-v1)
// Studio family — local fork of ai-website-cloner-template by JCodesMore.
// No provider API key required — all AI work is done by the local agent.
// ---------------------------------------------------------------------------

export function buildAiWebsiteClonerConfig(): ForkAdapterCoreConfig {
  return createStudioKitConfig({
    kitId: "growthub-ai-website-cloner-v1",
    upstreamRepoUrl: "https://github.com/JCodesMore/ai-website-cloner-template",
    defaultLocalPath: "~/ai-website-cloner-template",
    defaultDevPort: 3000,
    apiKeyEnvVar: "AI_CLONER_FORK_PATH",
    providerId: "local-agent",
  });
}
