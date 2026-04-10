/**
 * Kit Factory — Workflow Kit Template
 *
 * Canonical ForkAdapterCoreConfig for Workflow kits.
 *
 * Workflow kits wrap a multi-step agentic pipeline or automation workflow.
 * They may or may not involve a forked repo — the fork inspection surface
 * is optional. The provider is typically an API that accepts structured inputs
 * and returns async results (same submit/poll pattern as Studio kits).
 *
 * Example use cases:
 *   - Email broadcast pipeline (sequence of generation + review + send steps)
 *   - Content calendar automation (plan → draft → review → schedule)
 *   - Multi-channel campaign runner
 *
 * Defaults:
 *   surfaces      — browser-hosted (primary), local-fork (optional)
 *   fork          — none declared (optional override)
 *   output        — workflow-specific artifact set (overridden per kit)
 */

import type { ForkAdapterCoreConfig } from "../adapter-core/contracts.js";
import type { RuntimeSurfaceType, OutputArtifactDeclaration } from "../types/index.js";

export interface WorkflowKitOptions {
  kitId: string;
  /** Primary env var for the API credential */
  apiKeyEnvVar: string;
  /** API key placeholder value */
  apiKeyPlaceholder?: string;
  /** Provider id */
  providerId: string;
  /** Provider name */
  providerName: string;
  /** Provider base URL */
  providerBaseUrl: string;
  /** Provider auth field */
  providerAuthField?: string;
  /** Reference doc path for the provider adapter */
  providerReferenceDocPath?: string;
  /** Optional fork details */
  fork?: {
    upstreamRepoUrl: string;
    defaultLocalPath: string;
    requiredPlanningFiles: string[];
  };
  /** Supported surfaces (default: browser-hosted + local-fork) */
  supportedSurfaces?: RuntimeSurfaceType[];
  /** Output artifacts for this workflow */
  artifacts?: OutputArtifactDeclaration[];
}

export const WORKFLOW_KIT_DEFAULTS = {
  supportedSurfaces: ["browser-hosted", "local-fork"] as RuntimeSurfaceType[],
  apiKeyPlaceholder: "your_api_key_here",
  providerAuthField: "x-api-key",
  providerReferenceDocPath: "docs/provider-adapter-layer.md",
} as const;

export function createWorkflowKitConfig(options: WorkflowKitOptions): ForkAdapterCoreConfig {
  const {
    kitId,
    apiKeyEnvVar,
    apiKeyPlaceholder = WORKFLOW_KIT_DEFAULTS.apiKeyPlaceholder,
    providerId,
    providerName,
    providerBaseUrl,
    providerAuthField = WORKFLOW_KIT_DEFAULTS.providerAuthField,
    providerReferenceDocPath = WORKFLOW_KIT_DEFAULTS.providerReferenceDocPath,
    fork,
    supportedSurfaces = WORKFLOW_KIT_DEFAULTS.supportedSurfaces,
    artifacts = [],
  } = options;

  return {
    kitId,
    family: "workflow",

    provider: {
      providerId,
      providerName,
      operations: [
        "UPLOAD_ASSET",
        "SUBMIT_GENERATION",
        "POLL_RESULT",
        "NORMALIZE_RESULT",
        "LIST_MODEL_CAPABILITIES",
      ],
      referenceDocPath: providerReferenceDocPath,
      authMechanism: "api-key-header",
      authField: providerAuthField,
      baseUrl: providerBaseUrl,
    },

    envGate: {
      requiredEnvVars: [apiKeyEnvVar],
      placeholderGuardedVars: [{ key: apiKeyEnvVar, placeholder: apiKeyPlaceholder }],
      verifyCommandPath: "setup/verify-env.mjs",
    },

    setup: {
      quickstart: "QUICKSTART.md",
      envExample: ".env.example",
      setupDir: "setup/",
      outputDir: "output/",
      files: [
        { relativePath: "setup/verify-env.mjs", required: true, description: "Validate the API key" },
        { relativePath: "setup/check-deps.sh",  required: false, description: "Check system dependencies" },
      ],
      requiredBinaries: fork
        ? [
            { binary: "node", installHint: "https://nodejs.org",            requiredForSurfaces: ["local-fork"] },
            { binary: "npm",  installHint: "Comes with Node.js",            requiredForSurfaces: ["local-fork"] },
            { binary: "git",  installHint: "https://git-scm.com/downloads", requiredForSurfaces: ["local-fork"] },
          ]
        : [],
    },

    forkInspection: fork
      ? {
          upstreamRepoUrl: fork.upstreamRepoUrl,
          defaultLocalPath: fork.defaultLocalPath,
          integrationDocPath: "docs/fork-integration.md",
          inspectionRules: {
            requiredPlanningFiles: fork.requiredPlanningFiles,
            sourceOfTruthFiles: fork.requiredPlanningFiles,
          },
        }
      : {
          upstreamRepoUrl: "",
          defaultLocalPath: "",
          integrationDocPath: "docs/provider-adapter-layer.md",
          inspectionRules: {
            requiredPlanningFiles: [],
            sourceOfTruthFiles: [],
            note: "No fork declared for this workflow kit — using provider API directly.",
          },
        },

    runtimeSurface: {
      supportedSurfaces,
      defaultSurface: supportedSurfaces[0] ?? "browser-hosted",
      surfaceProbes: {
        "local-fork": null,
        "browser-hosted": null,
        "desktop-app": null,
        "custom": null,
      },
    },

    output: {
      outputRootPattern: "output/<client-slug>/<project-slug>/",
      requiresDeliverableLog: true,
      outputStandardsDocPath: "output-standards.md",
      artifacts,
    },
  };
}
