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
import { createOperatorKitConfig } from "./factory/operator-kit.js";
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
// Reference config: Postiz Social Media Studio Kit (growthub-postiz-social-v1)
// Operator family reference wrapping the Postiz open-source social media platform.
// Supports 28+ platforms, BullMQ scheduling, AI captions, and multi-workspace.
// ---------------------------------------------------------------------------

export function buildPostizSocialConfig(): ForkAdapterCoreConfig {
  return createOperatorKitConfig({
    kitId: "growthub-postiz-social-v1",
    vertical: "social-media",
    apiKeyEnvVar: "ANTHROPIC_API_KEY",
    apiKeyPlaceholder: "your_anthropic_key_here",
    providerId: "postiz",
    providerName: "Postiz (self-hosted)",
    providerBaseUrl: "http://localhost:3000",
    providerAuthField: "Authorization",
    providerReferenceDocPath: "docs/postiz-fork-integration.md",
    additionalRequiredEnvVars: ["POSTIZ_API_URL"],
    artifacts: [
      { name: "Social Campaign Brief", relativePath: "templates/social-campaign-brief.md", required: true, description: "Campaign objectives, platforms, audience, and KPI targets" },
      { name: "Content Calendar", relativePath: "templates/content-calendar.md", required: true, description: "30/60/90-day posting plan with theme pillars and cadence" },
      { name: "Platform Publishing Plan", relativePath: "templates/platform-publishing-plan.md", required: true, description: "Per-platform format, frequency, and content mix specs" },
      { name: "Caption Copy Deck", relativePath: "templates/caption-copy-deck.md", required: true, description: "A/B/C caption variants per post with hashtag sets" },
      { name: "Scheduling Manifest", relativePath: "templates/scheduling-manifest.md", required: false, description: "BullMQ-compatible JSON manifest for Postiz API bulk scheduling" },
      { name: "Analytics Brief", relativePath: "templates/analytics-brief.md", required: false, description: "Per-platform performance report with recommendations" },
      { name: "Client Proposal", relativePath: "templates/client-proposal.md", required: false, description: "Agency-ready pitch with platform mix and ROI projection" },
    ],
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
