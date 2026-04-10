/**
 * Fork Adapter Core — Runtime Surface
 *
 * Reusable declaration and validation for the execution surfaces a kit supports.
 *
 * A runtime surface is the environment where generation actually executes:
 *   local-fork     — cloned repo running locally (e.g. localhost:3001)
 *   browser-hosted — hosted web app (e.g. muapi.ai/open-higgsfield-ai)
 *   desktop-app    — Electron or native app installed locally
 *   custom         — any other surface declared by the kit
 *
 * Surfaces are declared in ForkAdapterCoreConfig.runtimeSurface.
 * The agent picks one surface per session in Step 8 of the CLAUDE.md workflow.
 */

import type { RuntimeSurfaceContract } from "./contracts.js";
import {
  RUNTIME_SURFACE_TYPES,
  type RuntimeSurfaceType,
  type ReachabilityProbe,
  type CoreValidationResult,
  type ValidationIssue,
  makeError,
  makeWarning,
  makeInfo,
} from "../types/index.js";

// ---------------------------------------------------------------------------
// Surface validation result
// ---------------------------------------------------------------------------

export interface RuntimeSurfaceValidationResult extends CoreValidationResult {
  supportedSurfaces: RuntimeSurfaceType[];
  defaultSurface: RuntimeSurfaceType;
  invalidSurfaces: string[];
}

// ---------------------------------------------------------------------------
// Validate a runtime surface contract declaration
// ---------------------------------------------------------------------------

export function validateRuntimeSurfaceContract(
  contract: RuntimeSurfaceContract,
): RuntimeSurfaceValidationResult {
  const issues: ValidationIssue[] = [];
  const passedChecks: string[] = [];
  const invalidSurfaces: string[] = [];

  // At least one surface must be declared
  if (contract.supportedSurfaces.length === 0) {
    issues.push(makeError("NO_SURFACES_DECLARED", "At least one runtime surface must be declared in supportedSurfaces."));
  } else {
    passedChecks.push("surfaces-declared");
  }

  // All declared surfaces must be valid types
  for (const surface of contract.supportedSurfaces) {
    if (!RUNTIME_SURFACE_TYPES.includes(surface)) {
      invalidSurfaces.push(surface);
      issues.push(
        makeError(
          "INVALID_SURFACE_TYPE",
          `"${surface}" is not a valid runtime surface type. Valid: ${RUNTIME_SURFACE_TYPES.join(", ")}`,
          "supportedSurfaces",
        ),
      );
    }
  }

  // Default surface must be in supported surfaces
  if (!contract.supportedSurfaces.includes(contract.defaultSurface)) {
    issues.push(
      makeError(
        "DEFAULT_SURFACE_NOT_SUPPORTED",
        `defaultSurface "${contract.defaultSurface}" is not in supportedSurfaces.`,
        "defaultSurface",
      ),
    );
  } else {
    passedChecks.push("default-surface-valid");
  }

  // Warn if local-fork is declared but no probe is configured
  if (
    contract.supportedSurfaces.includes("local-fork") &&
    !contract.surfaceProbes["local-fork"]
  ) {
    issues.push(
      makeWarning(
        "LOCAL_FORK_NO_PROBE",
        "local-fork surface is declared but no reachability probe is configured. Consider adding an HTTP probe for localhost.",
      ),
    );
  } else if (contract.supportedSurfaces.includes("local-fork")) {
    passedChecks.push("local-fork-probe-configured");
  }

  return {
    valid: issues.filter((i) => i.severity === "error").length === 0,
    issues,
    passedChecks,
    supportedSurfaces: contract.supportedSurfaces,
    defaultSurface: contract.defaultSurface,
    invalidSurfaces,
  };
}

// ---------------------------------------------------------------------------
// Standard surface contract factory for Open Higgsfield / Studio kits
// ---------------------------------------------------------------------------

export function buildStudioRuntimeSurfaceContract(): RuntimeSurfaceContract {
  return {
    supportedSurfaces: ["local-fork", "browser-hosted", "desktop-app"],
    defaultSurface: "local-fork",
    surfaceProbes: {
      "local-fork": {
        id: "local-fork-http",
        type: "http",
        target: "http://localhost:3001",
        required: false,
        description: "Open Higgsfield AI local fork dev server",
      },
      "browser-hosted": {
        id: "browser-hosted-http",
        type: "http",
        target: "https://muapi.ai/open-higgsfield-ai",
        required: false,
        description: "Open Higgsfield AI hosted browser app",
      },
      "desktop-app": null,
      "custom": null,
    },
  };
}

// ---------------------------------------------------------------------------
// Format surface selection for agent handoff doc
// ---------------------------------------------------------------------------

export function formatSurfaceSelectionNote(surface: RuntimeSurfaceType): string {
  const notes: Record<RuntimeSurfaceType, string> = {
    "local-fork": "Execute against the local fork running at http://localhost:3001. Inspect fork source files before planning.",
    "browser-hosted": "Execute against the hosted browser app. UI behavior follows the public hosted workflow.",
    "desktop-app": "Execute against the locally installed Electron app. UI behavior matches browser but with local asset history.",
    "custom": "Execute against a custom-declared surface. Verify the surface contract before planning.",
  };
  return notes[surface];
}
