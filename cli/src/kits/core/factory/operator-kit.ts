/**
 * Kit Factory — Operator Kit Template
 *
 * Canonical ForkAdapterCoreConfig for Operator kits.
 *
 * Operator kits wrap a domain-specific operator agent — a specialist that
 * executes within a defined vertical (email marketing, growth, content,
 * social, SEO, ads). They are typically not fork-backed but are provider-backed
 * and produce structured output document packages.
 *
 * The growthub-email-marketing-v1 kit is an example of this family.
 *
 * Defaults:
 *   surfaces      — browser-hosted (primary)
 *   fork          — none
 *   output        — operator-specific artifact set (overridden per kit)
 *   env gate      — single primary API key required
 */

import type { ForkAdapterCoreConfig } from "../adapter-core/contracts.js";
import type { OutputArtifactDeclaration } from "../types/index.js";

export interface OperatorKitOptions {
  kitId: string;
  /** Domain vertical this operator serves */
  vertical: string;
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
  /** Output artifacts for this operator */
  artifacts?: OutputArtifactDeclaration[];
  /** Additional required env vars beyond the primary API key */
  additionalRequiredEnvVars?: string[];
}

export const OPERATOR_KIT_DEFAULTS = {
  apiKeyPlaceholder: "your_api_key_here",
  providerAuthField: "x-api-key",
  providerReferenceDocPath: "docs/provider-adapter-layer.md",
} as const;

export function createOperatorKitConfig(options: OperatorKitOptions): ForkAdapterCoreConfig {
  const {
    kitId,
    vertical,
    apiKeyEnvVar,
    apiKeyPlaceholder = OPERATOR_KIT_DEFAULTS.apiKeyPlaceholder,
    providerId,
    providerName,
    providerBaseUrl,
    providerAuthField = OPERATOR_KIT_DEFAULTS.providerAuthField,
    providerReferenceDocPath = OPERATOR_KIT_DEFAULTS.providerReferenceDocPath,
    artifacts = [],
    additionalRequiredEnvVars = [],
  } = options;

  return {
    kitId,
    family: "operator",

    provider: {
      providerId,
      providerName,
      operations: [
        "SUBMIT_GENERATION",
        "POLL_RESULT",
        "NORMALIZE_RESULT",
        "LIST_MODEL_CAPABILITIES",
        "UPLOAD_ASSET",
      ],
      referenceDocPath: providerReferenceDocPath,
      authMechanism: "api-key-header",
      authField: providerAuthField,
      baseUrl: providerBaseUrl,
    },

    envGate: {
      requiredEnvVars: [apiKeyEnvVar, ...additionalRequiredEnvVars],
      placeholderGuardedVars: [{ key: apiKeyEnvVar, placeholder: apiKeyPlaceholder }],
      verifyCommandPath: "setup/verify-env.mjs",
    },

    setup: {
      quickstart: "QUICKSTART.md",
      envExample: ".env.example",
      setupDir: "setup/",
      outputDir: "output/",
      files: [
        { relativePath: "setup/verify-env.mjs", required: true,  description: "Validate the API key" },
      ],
      requiredBinaries: [],
    },

    // Operator kits are typically not fork-backed
    forkInspection: {
      upstreamRepoUrl: "",
      defaultLocalPath: "",
      integrationDocPath: "docs/provider-adapter-layer.md",
      inspectionRules: {
        requiredPlanningFiles: [],
        sourceOfTruthFiles: [],
        note: `Operator kit for "${vertical}" vertical — no fork inspection required. Plan against provider docs and brand kit.`,
      },
    },

    runtimeSurface: {
      supportedSurfaces: ["browser-hosted"],
      defaultSurface: "browser-hosted",
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
