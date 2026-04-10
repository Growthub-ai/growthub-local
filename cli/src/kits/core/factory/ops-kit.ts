/**
 * Kit Factory — Ops Kit Template
 *
 * Canonical ForkAdapterCoreConfig for Ops kits.
 *
 * Ops kits wrap infrastructure, devops, or execution surface operators.
 * They typically deal with file systems, CLI toolchains, deployment pipelines,
 * or monitoring surfaces rather than AI generation APIs.
 *
 * Characteristics:
 *   - May have zero provider (pure local execution)
 *   - Fork inspection is critical (they often wrap a local tool or repo)
 *   - Binary dependency checking is high priority
 *   - Output artifacts are typically reports, logs, or runbooks
 *
 * Example use cases:
 *   - CI/CD pipeline operator
 *   - Infrastructure audit operator
 *   - Release checklist runner
 */

import type { ForkAdapterCoreConfig } from "../adapter-core/contracts.js";
import type { RuntimeSurfaceType, RequiredBinaryDeclaration, OutputArtifactDeclaration } from "../types/index.js";

export interface OpsKitOptions {
  kitId: string;
  /** What this ops kit manages */
  domain: string;
  /** Optional provider if the kit calls an external API */
  provider?: {
    providerId: string;
    providerName: string;
    providerBaseUrl: string;
    apiKeyEnvVar: string;
    apiKeyPlaceholder?: string;
    authField?: string;
    referenceDocPath?: string;
  };
  /** Optional fork details */
  fork?: {
    upstreamRepoUrl: string;
    defaultLocalPath: string;
    requiredPlanningFiles: string[];
    sourceOfTruthFiles?: string[];
  };
  /** Required system binaries */
  requiredBinaries?: RequiredBinaryDeclaration[];
  /** Supported surfaces */
  supportedSurfaces?: RuntimeSurfaceType[];
  /** Output artifacts */
  artifacts?: OutputArtifactDeclaration[];
  /** Additional required env vars */
  requiredEnvVars?: string[];
}

export const OPS_KIT_DEFAULTS = {
  supportedSurfaces: ["local-fork"] as RuntimeSurfaceType[],
} as const;

export function createOpsKitConfig(options: OpsKitOptions): ForkAdapterCoreConfig {
  const {
    kitId,
    domain,
    provider,
    fork,
    requiredBinaries = [],
    supportedSurfaces = OPS_KIT_DEFAULTS.supportedSurfaces,
    artifacts = [],
    requiredEnvVars = [],
  } = options;

  const providerContract: ForkAdapterCoreConfig["provider"] = provider
    ? {
        providerId: provider.providerId,
        providerName: provider.providerName,
        operations: [
          "SUBMIT_GENERATION",
          "POLL_RESULT",
          "NORMALIZE_RESULT",
          "LIST_MODEL_CAPABILITIES",
          "UPLOAD_ASSET",
        ],
        referenceDocPath: provider.referenceDocPath ?? "docs/provider-adapter-layer.md",
        authMechanism: "api-key-header",
        authField: provider.authField ?? "x-api-key",
        baseUrl: provider.providerBaseUrl,
      }
    : {
        providerId: "none",
        providerName: "No external provider — local execution only",
        operations: [],
        referenceDocPath: "docs/provider-adapter-layer.md",
        authMechanism: "custom",
        authField: "none",
        baseUrl: "",
      };

  const allRequiredEnvVars = provider
    ? [provider.apiKeyEnvVar, ...requiredEnvVars]
    : requiredEnvVars;

  return {
    kitId,
    family: "ops",

    provider: providerContract,

    envGate: {
      requiredEnvVars: allRequiredEnvVars,
      placeholderGuardedVars: provider
        ? [{ key: provider.apiKeyEnvVar, placeholder: provider.apiKeyPlaceholder ?? "your_api_key_here" }]
        : [],
      verifyCommandPath: allRequiredEnvVars.length > 0 ? "setup/verify-env.mjs" : undefined,
    },

    setup: {
      quickstart: "QUICKSTART.md",
      envExample: ".env.example",
      setupDir: "setup/",
      outputDir: "output/",
      files: [
        { relativePath: "setup/check-deps.sh",  required: true,  description: "Check system dependencies" },
        { relativePath: "setup/verify-env.mjs", required: !!provider, description: "Validate the API key" },
      ],
      requiredBinaries,
    },

    forkInspection: fork
      ? {
          upstreamRepoUrl: fork.upstreamRepoUrl,
          defaultLocalPath: fork.defaultLocalPath,
          integrationDocPath: "docs/fork-integration.md",
          inspectionRules: {
            requiredPlanningFiles: fork.requiredPlanningFiles,
            sourceOfTruthFiles: fork.sourceOfTruthFiles ?? fork.requiredPlanningFiles,
            note: `Ops kit for "${domain}" — inspect fork before generating any runbooks or execution plans.`,
          },
        }
      : {
          upstreamRepoUrl: "",
          defaultLocalPath: "",
          integrationDocPath: "docs/provider-adapter-layer.md",
          inspectionRules: {
            requiredPlanningFiles: [],
            sourceOfTruthFiles: [],
            note: `Ops kit for "${domain}" — no fork. Plan against local toolchain and declared binary surface.`,
          },
        },

    runtimeSurface: {
      supportedSurfaces,
      defaultSurface: supportedSurfaces[0] ?? "local-fork",
      surfaceProbes: {
        "local-fork": null,
        "browser-hosted": null,
        "desktop-app": null,
        "custom": null,
      },
    },

    output: {
      outputRootPattern: "output/<project-slug>/",
      requiresDeliverableLog: false,
      outputStandardsDocPath: "output-standards.md",
      artifacts,
    },
  };
}
