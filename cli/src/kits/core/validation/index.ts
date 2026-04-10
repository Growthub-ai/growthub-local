/**
 * Fork Adapter Core — Shared Validation Runner
 *
 * Runs all adapter-core validators against a ForkAdapterCoreConfig.
 * Used by:
 *   - CLI kit validate command (authoring time)
 *   - Export QA scripts (packaging time)
 *   - Agent session init (runtime time, via CLAUDE.md Step 0)
 *
 * Aggregates results from:
 *   - env-gate
 *   - setup-validation
 *   - fork-inspector
 *   - provider-adapter
 *   - runtime-surface
 *   - output-contract
 */

import type { ForkAdapterCoreConfig } from "../adapter-core/contracts.js";
import { runEnvGate } from "../adapter-core/env-gate.js";
import { validateSetup } from "../adapter-core/setup-validation.js";
import { inspectFork } from "../adapter-core/fork-inspector.js";
import { validateProviderContract } from "../adapter-core/provider-adapter.js";
import { validateRuntimeSurfaceContract } from "../adapter-core/runtime-surface.js";
import { validateOutputContract } from "../adapter-core/output-contract.js";
import type {
  CoreValidationResult,
  ValidationIssue,
  ValidationSeverity,
} from "../types/index.js";

// ---------------------------------------------------------------------------
// Full adapter validation result
// ---------------------------------------------------------------------------

export interface AdapterValidationReport {
  kitId: string;
  family: string;
  overallValid: boolean;
  sections: AdapterValidationSection[];
  totalErrors: number;
  totalWarnings: number;
  totalInfos: number;
  passedChecks: string[];
}

export interface AdapterValidationSection {
  name: string;
  valid: boolean;
  issues: ValidationIssue[];
  passedChecks: string[];
}

// ---------------------------------------------------------------------------
// Run full validation
// ---------------------------------------------------------------------------

export function runAdapterValidation(
  kitRoot: string,
  config: ForkAdapterCoreConfig,
  options: {
    skipEnvGate?: boolean;
    skipForkInspection?: boolean;
    includeFileHashes?: boolean;
  } = {},
): AdapterValidationReport {
  const sections: AdapterValidationSection[] = [];

  // Provider contract
  const providerResult = validateProviderContract(kitRoot, config.provider);
  sections.push({
    name: "provider-contract",
    valid: providerResult.valid,
    issues: providerResult.issues,
    passedChecks: providerResult.passedChecks,
  });

  // Setup validation
  const setupResult = validateSetup(kitRoot, config.setup);
  sections.push({
    name: "setup-validation",
    valid: setupResult.valid,
    issues: setupResult.issues,
    passedChecks: setupResult.passedChecks,
  });

  // Env gate (optional skip for pure authoring/packaging contexts)
  if (!options.skipEnvGate) {
    const envResult = runEnvGate(kitRoot, config.envGate);
    sections.push({
      name: "env-gate",
      valid: envResult.valid,
      issues: envResult.issues,
      passedChecks: envResult.passedChecks,
    });
  }

  // Fork inspection (optional skip)
  if (!options.skipForkInspection) {
    const forkResult = inspectFork(config.forkInspection, {
      includeHashes: options.includeFileHashes,
    });
    sections.push({
      name: "fork-inspection",
      valid: forkResult.valid,
      issues: forkResult.issues,
      passedChecks: forkResult.passedChecks,
    });
  }

  // Runtime surface
  const surfaceResult = validateRuntimeSurfaceContract(config.runtimeSurface);
  sections.push({
    name: "runtime-surface",
    valid: surfaceResult.valid,
    issues: surfaceResult.issues,
    passedChecks: surfaceResult.passedChecks,
  });

  // Output contract
  const outputResult = validateOutputContract(kitRoot, config.output);
  sections.push({
    name: "output-contract",
    valid: outputResult.valid,
    issues: outputResult.issues,
    passedChecks: outputResult.passedChecks,
  });

  // Aggregate
  const allIssues = sections.flatMap((s) => s.issues);
  const allPassedChecks = sections.flatMap((s) => s.passedChecks);

  const totalErrors   = countBySeverity(allIssues, "error");
  const totalWarnings = countBySeverity(allIssues, "warning");
  const totalInfos    = countBySeverity(allIssues, "info");

  return {
    kitId: config.kitId,
    family: config.family,
    overallValid: sections.every((s) => s.valid),
    sections,
    totalErrors,
    totalWarnings,
    totalInfos,
    passedChecks: allPassedChecks,
  };
}

// ---------------------------------------------------------------------------
// Format report for CLI output
// ---------------------------------------------------------------------------

export function formatAdapterValidationReport(report: AdapterValidationReport): string {
  const lines: string[] = [
    `=== Adapter Validation Report ===`,
    `Kit: ${report.kitId}  Family: ${report.family}`,
    `Result: ${report.overallValid ? "PASSED" : "FAILED"}  Errors: ${report.totalErrors}  Warnings: ${report.totalWarnings}`,
    "",
  ];

  for (const section of report.sections) {
    lines.push(`[${section.valid ? "OK" : "FAIL"}] ${section.name}`);
    for (const issue of section.issues) {
      const prefix = issue.severity === "error" ? "  ERROR" : issue.severity === "warning" ? "  WARN " : "  INFO ";
      lines.push(`${prefix}  ${issue.message}`);
    }
    if (section.passedChecks.length > 0) {
      lines.push(`  Passed: ${section.passedChecks.join(", ")}`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countBySeverity(issues: ValidationIssue[], severity: ValidationSeverity): number {
  return issues.filter((i) => i.severity === severity).length;
}
