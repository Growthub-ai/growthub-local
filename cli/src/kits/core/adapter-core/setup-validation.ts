/**
 * Fork Adapter Core — Setup Validation
 *
 * Reusable helpers that validate the setup/ surface of any kit:
 *   - QUICKSTART.md exists and is non-empty
 *   - .env.example exists and declares required vars
 *   - setup/ directory contains declared script files
 *   - output/README.md exists
 *   - required system binaries are declared (not executed — advisory only)
 *
 * Used by the core validation runner and the CLI kit validate command.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import type { SetupPathContract } from "./contracts.js";
import type { CoreValidationResult, ValidationIssue } from "../types/index.js";
import { makeError, makeWarning, makeInfo } from "../types/index.js";

// ---------------------------------------------------------------------------
// Setup validation result
// ---------------------------------------------------------------------------

export interface SetupValidationResult extends CoreValidationResult {
  quickstartExists: boolean;
  envExampleExists: boolean;
  outputReadmeExists: boolean;
  missingFiles: string[];
  missingBinaries: string[];
}

// ---------------------------------------------------------------------------
// Validate setup surface
// ---------------------------------------------------------------------------

export function validateSetup(
  kitRoot: string,
  contract: SetupPathContract,
): SetupValidationResult {
  const issues: ValidationIssue[] = [];
  const passedChecks: string[] = [];
  const missingFiles: string[] = [];
  const missingBinaries: string[] = [];

  // Check QUICKSTART.md
  const quickstartPath = path.resolve(kitRoot, contract.quickstart);
  const quickstartExists = fs.existsSync(quickstartPath);

  if (!quickstartExists) {
    missingFiles.push(contract.quickstart);
    issues.push(makeError("QUICKSTART_MISSING", `QUICKSTART.md not found at ${contract.quickstart}.`, contract.quickstart));
  } else {
    const content = fs.readFileSync(quickstartPath, "utf8").trim();
    if (content.length < 50) {
      issues.push(makeWarning("QUICKSTART_EMPTY", `QUICKSTART.md appears to be empty or too short.`, contract.quickstart));
    } else {
      passedChecks.push("quickstart-exists");
    }
  }

  // Check .env.example
  const envExamplePath = path.resolve(kitRoot, contract.envExample);
  const envExampleExists = fs.existsSync(envExamplePath);

  if (!envExampleExists) {
    missingFiles.push(contract.envExample);
    issues.push(makeError("ENV_EXAMPLE_MISSING", `.env.example not found at ${contract.envExample}.`, contract.envExample));
  } else {
    passedChecks.push("env-example-exists");
  }

  // Check output/README.md
  const outputReadmePath = path.resolve(kitRoot, contract.outputDir, "README.md");
  const outputReadmeExists = fs.existsSync(outputReadmePath);

  if (!outputReadmeExists) {
    issues.push(makeWarning("OUTPUT_README_MISSING", `output/README.md not found. Recommend adding it to document the output structure.`));
  } else {
    passedChecks.push("output-readme-exists");
  }

  // Check declared setup files
  for (const file of contract.files) {
    const filePath = path.resolve(kitRoot, file.relativePath);
    const exists = fs.existsSync(filePath);

    if (!exists && file.required) {
      missingFiles.push(file.relativePath);
      issues.push(makeError("SETUP_FILE_MISSING", `Required setup file missing: ${file.relativePath} — ${file.description}.`, file.relativePath));
    } else if (!exists) {
      issues.push(makeWarning("SETUP_FILE_OPTIONAL_MISSING", `Optional setup file missing: ${file.relativePath} — ${file.description}.`, file.relativePath));
    } else {
      passedChecks.push(`setup-file:${file.relativePath}`);
    }
  }

  // Check required binaries (advisory — does not block but warns)
  for (const bin of contract.requiredBinaries ?? []) {
    const available = isBinaryAvailable(bin.binary);
    if (!available) {
      missingBinaries.push(bin.binary);
      issues.push(
        makeWarning(
          "BINARY_MISSING",
          `Required binary "${bin.binary}" not found. ${bin.installHint} (needed for: ${bin.requiredForSurfaces.join(", ")})`,
          bin.binary,
        ),
      );
    } else {
      passedChecks.push(`binary:${bin.binary}`);
    }
  }

  const valid = issues.filter((i) => i.severity === "error").length === 0;

  return {
    valid,
    issues,
    passedChecks,
    quickstartExists,
    envExampleExists,
    outputReadmeExists,
    missingFiles,
    missingBinaries,
  };
}

// ---------------------------------------------------------------------------
// Binary availability check
// ---------------------------------------------------------------------------

function isBinaryAvailable(binary: string): boolean {
  try {
    execSync(`command -v ${binary}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Validate .env.example declares expected keys
// ---------------------------------------------------------------------------

export function validateEnvExample(
  kitRoot: string,
  expectedKeys: string[],
): { valid: boolean; issues: ValidationIssue[]; declaredKeys: string[] } {
  const issues: ValidationIssue[] = [];
  const envExamplePath = path.resolve(kitRoot, ".env.example");

  if (!fs.existsSync(envExamplePath)) {
    return {
      valid: false,
      issues: [makeError("ENV_EXAMPLE_MISSING", ".env.example not found.")],
      declaredKeys: [],
    };
  }

  const content = fs.readFileSync(envExamplePath, "utf8");
  const declaredKeys: string[] = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex !== -1) {
      declaredKeys.push(trimmed.slice(0, eqIndex).trim());
    }
  }

  for (const key of expectedKeys) {
    if (!declaredKeys.includes(key)) {
      issues.push(makeError("ENV_EXAMPLE_KEY_MISSING", `.env.example does not declare required key: ${key}`, key));
    }
  }

  return {
    valid: issues.filter((i) => i.severity === "error").length === 0,
    issues,
    declaredKeys,
  };
}
