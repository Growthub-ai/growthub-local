/**
 * Fork Adapter Core — Output Contract Validator
 *
 * Reusable output contract validator for any kit that writes structured
 * deliverables to a working directory.
 *
 * Validates:
 *   - required output directories exist (or can be created)
 *   - declared artifact names are non-empty and unique
 *   - output root pattern is well-formed
 *   - output standards doc exists in the kit
 *   - deliverable log requirement is explicitly declared
 */

import fs from "node:fs";
import path from "node:path";
import type { OutputContract } from "./contracts.js";
import type { CoreValidationResult, ValidationIssue } from "../types/index.js";
import { makeError, makeWarning, makeInfo } from "../types/index.js";

// ---------------------------------------------------------------------------
// Output contract validation result
// ---------------------------------------------------------------------------

export interface OutputContractValidationResult extends CoreValidationResult {
  outputRootPattern: string;
  artifactCount: number;
  duplicateArtifactNames: string[];
  missingRequiredArtifacts: string[];
  outputStandardsDocPresent: boolean;
}

// ---------------------------------------------------------------------------
// Validate an output contract declaration
// ---------------------------------------------------------------------------

export function validateOutputContract(
  kitRoot: string,
  contract: OutputContract,
): OutputContractValidationResult {
  const issues: ValidationIssue[] = [];
  const passedChecks: string[] = [];
  const duplicateArtifactNames: string[] = [];
  const missingRequiredArtifacts: string[] = [];

  // Validate output root pattern is declared
  if (!contract.outputRootPattern.trim()) {
    issues.push(makeError("OUTPUT_ROOT_PATTERN_EMPTY", "outputRootPattern must be a non-empty string.", "outputRootPattern"));
  } else if (!contract.outputRootPattern.includes("<client-slug>")) {
    issues.push(
      makeWarning(
        "OUTPUT_ROOT_NO_CLIENT_SLUG",
        'outputRootPattern does not include <client-slug>. Multi-client output namespacing is recommended.',
        "outputRootPattern",
      ),
    );
  } else {
    passedChecks.push("output-root-pattern-valid");
  }

  // Validate artifact names are unique
  const seenNames = new Set<string>();
  for (const artifact of contract.artifacts) {
    if (!artifact.name.trim()) {
      issues.push(makeError("ARTIFACT_NAME_EMPTY", "Artifact name must be non-empty.", "artifacts"));
      continue;
    }
    if (seenNames.has(artifact.name)) {
      duplicateArtifactNames.push(artifact.name);
      issues.push(
        makeError(
          "ARTIFACT_NAME_DUPLICATE",
          `Duplicate artifact name: "${artifact.name}". Artifact names must be unique.`,
          "artifacts",
        ),
      );
    }
    seenNames.add(artifact.name);
  }

  if (duplicateArtifactNames.length === 0 && contract.artifacts.length > 0) {
    passedChecks.push("artifact-names-unique");
  }

  // Validate at least one artifact is declared
  if (contract.artifacts.length === 0) {
    issues.push(makeWarning("NO_ARTIFACTS_DECLARED", "No output artifacts declared. Consider declaring expected deliverables."));
  } else {
    passedChecks.push("artifacts-declared");
  }

  // Validate required artifacts have non-empty relative paths
  for (const artifact of contract.artifacts.filter((a) => a.required)) {
    if (!artifact.relativePath.trim()) {
      missingRequiredArtifacts.push(artifact.name);
      issues.push(
        makeError(
          "REQUIRED_ARTIFACT_NO_PATH",
          `Required artifact "${artifact.name}" has no relativePath declared.`,
          "artifacts",
        ),
      );
    }
  }

  if (missingRequiredArtifacts.length === 0) {
    passedChecks.push("required-artifact-paths-declared");
  }

  // Validate output standards doc exists
  const outputStandardsDocPath = path.resolve(kitRoot, contract.outputStandardsDocPath);
  const outputStandardsDocPresent = fs.existsSync(outputStandardsDocPath);

  if (!outputStandardsDocPresent) {
    issues.push(
      makeWarning(
        "OUTPUT_STANDARDS_DOC_MISSING",
        `Output standards doc not found at ${contract.outputStandardsDocPath}.`,
        "outputStandardsDocPath",
      ),
    );
  } else {
    passedChecks.push("output-standards-doc-present");
  }

  // Validate deliverable log requirement is explicit
  if (contract.requiresDeliverableLog) {
    passedChecks.push("deliverable-log-required");
    issues.push(
      makeInfo(
        "DELIVERABLE_LOG_REQUIRED",
        "This kit requires all completed deliverables to be logged in the active brand kit.",
      ),
    );
  }

  return {
    valid: issues.filter((i) => i.severity === "error").length === 0,
    issues,
    passedChecks,
    outputRootPattern: contract.outputRootPattern,
    artifactCount: contract.artifacts.length,
    duplicateArtifactNames,
    missingRequiredArtifacts,
    outputStandardsDocPresent,
  };
}

// ---------------------------------------------------------------------------
// Standard Open Higgsfield Studio output contract factory
// ---------------------------------------------------------------------------

export function buildStudioOutputContract(): OutputContract {
  return {
    outputRootPattern: "output/<client-slug>/<project-slug>/",
    requiresDeliverableLog: true,
    outputStandardsDocPath: "output-standards.md",
    artifacts: [
      { name: "VisualCampaignBrief",           relativePath: "visual-campaign-brief.md",             required: true,  description: "Campaign goals, brand context, and visual intent" },
      { name: "StudioSelectionBrief",           relativePath: "studio-selection-brief.md",            required: true,  description: "Studio mode selection with rationale and fallback" },
      { name: "ModelSelectionRecommendation",   relativePath: "model-selection-recommendation.md",    required: true,  description: "Model class, endpoint, constraints, and fallback model" },
      { name: "ShotPlan",                       relativePath: "shot-plan.md",                         required: true,  description: "Scene-by-scene shot descriptions and asset requirements" },
      { name: "PromptMatrix",                   relativePath: "prompt-matrix.md",                     required: true,  description: "Prompt variants keyed to shot plan entries" },
      { name: "GenerationBatchPlan",            relativePath: "generation-batch-plan.md",             required: true,  description: "Ordered generation sequence with timing and dependencies" },
      { name: "AssetTracking",                  relativePath: "asset-tracking.md",                    required: true,  description: "Upload history, generation history, and reuse decisions" },
      { name: "ReviewQAChecklist",              relativePath: "review-qa-checklist.md",               required: true,  description: "QA gates before considering the package complete" },
      { name: "PlatformReadyExecutionHandoff",  relativePath: "platform-ready-execution-handoff.md",  required: true,  description: "Complete operator handoff document — executable against the provider" },
    ],
  };
}
