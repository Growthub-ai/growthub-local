/**
 * Kit Factory — Studio Kit Template
 *
 * Canonical ForkAdapterCoreConfig for Studio kits.
 *
 * Studio kits wrap a forked open-source AI studio (image/video/audio/cinema)
 * backed by a provider API. The Open Higgsfield Studio kit is the reference
 * implementation of this family.
 *
 * Defaults:
 *   provider      — Muapi (pluggable)
 *   surfaces      — local-fork (primary), browser-hosted, desktop-app
 *   env gate      — MUAPI_API_KEY required
 *   fork          — Anil-matcha/Open-Higgsfield-AI (overridable)
 *   output        — 9-artifact visual production package
 */

import type { ForkAdapterCoreConfig } from "../adapter-core/contracts.js";
import { buildMuapiProviderContract } from "../adapter-core/provider-adapter.js";
import { buildStudioRuntimeSurfaceContract } from "../adapter-core/runtime-surface.js";
import { buildStudioOutputContract } from "../adapter-core/output-contract.js";

export interface StudioKitOptions {
  kitId: string;
  /** Override the upstream fork repo URL */
  upstreamRepoUrl?: string;
  /** Override the default local clone path */
  defaultLocalPath?: string;
  /** Override the default dev port */
  defaultDevPort?: number;
  /** Override the primary env var key for the API key */
  apiKeyEnvVar?: string;
  /** Override provider ID for non-Muapi providers */
  providerId?: string;
}

export const STUDIO_KIT_DEFAULTS = {
  upstreamRepoUrl: "https://github.com/Anil-matcha/Open-Higgsfield-AI",
  defaultLocalPath: "~/open-higgsfield-ai",
  defaultDevPort: 3001,
  apiKeyEnvVar: "MUAPI_API_KEY",
  providerId: "muapi",
} as const;

export function createStudioKitConfig(options: StudioKitOptions): ForkAdapterCoreConfig {
  const {
    kitId,
    upstreamRepoUrl = STUDIO_KIT_DEFAULTS.upstreamRepoUrl,
    defaultLocalPath = STUDIO_KIT_DEFAULTS.defaultLocalPath,
    defaultDevPort = STUDIO_KIT_DEFAULTS.defaultDevPort,
    apiKeyEnvVar = STUDIO_KIT_DEFAULTS.apiKeyEnvVar,
    providerId = STUDIO_KIT_DEFAULTS.providerId,
  } = options;

  return {
    kitId,
    family: "studio",

    provider: buildMuapiProviderContract({ providerId }),

    envGate: {
      requiredEnvVars: [apiKeyEnvVar, "MUAPI_BASE_URL"],
      placeholderGuardedVars: [
        { key: apiKeyEnvVar, placeholder: "your_muapi_key_here" },
      ],
      verifyCommandPath: "setup/verify-env.mjs",
      requiredReachableSurfaces: [
        {
          id: "local-fork-http",
          type: "http",
          target: `http://localhost:${defaultDevPort}`,
          required: false,
          description: "Local fork dev server (only required in local-fork mode)",
        },
      ],
    },

    setup: {
      quickstart: "QUICKSTART.md",
      envExample: ".env.example",
      setupDir: "setup/",
      outputDir: "output/",
      files: [
        { relativePath: "setup/clone-fork.sh",  required: true,  description: "Clone and boot the local fork" },
        { relativePath: "setup/verify-env.mjs", required: true,  description: "Validate the API key against the provider" },
        { relativePath: "setup/check-deps.sh",  required: true,  description: "Check system dependencies" },
      ],
      requiredBinaries: [
        { binary: "node",   installHint: "https://nodejs.org",            requiredForSurfaces: ["local-fork"] },
        { binary: "npm",    installHint: "Comes with Node.js",            requiredForSurfaces: ["local-fork"] },
        { binary: "git",    installHint: "https://git-scm.com/downloads", requiredForSurfaces: ["local-fork"] },
        { binary: "ffmpeg", installHint: "brew install ffmpeg",           requiredForSurfaces: ["local-fork"] },
      ],
    },

    forkInspection: {
      upstreamRepoUrl,
      defaultLocalPath,
      defaultDevPort,
      integrationDocPath: "docs/open-higgsfield-fork-integration.md",
      inspectionRules: {
        requiredPlanningFiles: [
          "packages/studio/src/models.js",
          "packages/studio/src/muapi.js",
        ],
        sourceOfTruthFiles: [
          "README.md",
          "package.json",
          "app/studio/page.js",
          "components/StandaloneShell.js",
          "components/ApiKeyModal.js",
          "packages/studio/src/index.js",
          "packages/studio/src/components/ImageStudio.jsx",
          "packages/studio/src/components/VideoStudio.jsx",
          "packages/studio/src/components/LipSyncStudio.jsx",
          "packages/studio/src/components/CinemaStudio.jsx",
          "electron/",
        ],
        note: "models.js and studio components outrank all upstream assumptions. Always inspect before planning.",
      },
    },

    runtimeSurface: buildStudioRuntimeSurfaceContract(),

    output: buildStudioOutputContract(),
  };
}
