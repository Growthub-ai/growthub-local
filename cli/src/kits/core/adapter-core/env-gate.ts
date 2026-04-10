/**
 * Fork Adapter Core — Environment Gate
 *
 * Reusable env gate runner that standardizes Step 0 behavior across all kit families.
 *
 * Checks (in order):
 *   1. .env file exists at kit root
 *   2. Required env vars are present and non-empty
 *   3. Placeholder-guarded vars are not set to their placeholder value
 *   4. Optional: verify command exists (does not run it — surfaced to operator)
 *
 * This module is side-effect free and path-based — it operates on resolved
 * filesystem paths so it can be used by both the CLI validation layer and
 * by agents reading kit documentation.
 */

import fs from "node:fs";
import path from "node:path";
import type { EnvironmentGateContract } from "./contracts.js";
import type { CoreValidationResult, ValidationIssue } from "../types/index.js";
import { makeError, makeWarning, makeInfo } from "../types/index.js";

// ---------------------------------------------------------------------------
// Env file parser (subset of dotenv — no dependency required)
// ---------------------------------------------------------------------------

export function parseEnvFile(filePath: string): Record<string, string> {
  const vars: Record<string, string> = {};
  const lines = fs.readFileSync(filePath, "utf8").split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (key) vars[key] = value;
  }

  return vars;
}

// ---------------------------------------------------------------------------
// Gate result
// ---------------------------------------------------------------------------

export interface EnvGateResult extends CoreValidationResult {
  envFilePath: string;
  envFileExists: boolean;
  presentVars: string[];
  missingVars: string[];
  placeholderVars: string[];
  verifyCommandPath?: string;
}

// ---------------------------------------------------------------------------
// Gate runner
// ---------------------------------------------------------------------------

export function runEnvGate(
  kitRoot: string,
  contract: EnvironmentGateContract,
): EnvGateResult {
  const issues: ValidationIssue[] = [];
  const passedChecks: string[] = [];
  const envFilePath = path.resolve(kitRoot, ".env");
  const envExamplePath = path.resolve(kitRoot, ".env.example");

  const presentVars: string[] = [];
  const missingVars: string[] = [];
  const placeholderVars: string[] = [];

  // Check 1 — .env exists
  const envFileExists = fs.existsSync(envFilePath);

  if (!envFileExists) {
    issues.push(
      makeError(
        "ENV_FILE_MISSING",
        `.env not found at ${envFilePath}. Run: cp .env.example .env then add your credentials.`,
        ".env",
      ),
    );

    // Surface .env.example hint if it exists
    if (fs.existsSync(envExamplePath)) {
      issues.push(makeInfo("ENV_EXAMPLE_AVAILABLE", `.env.example is present — copy it to get started.`));
    }

    return {
      valid: false,
      issues,
      passedChecks,
      envFilePath,
      envFileExists: false,
      presentVars,
      missingVars: contract.requiredEnvVars,
      placeholderVars,
      verifyCommandPath: contract.verifyCommandPath,
    };
  }

  passedChecks.push("env-file-exists");

  // Parse env file
  const env = parseEnvFile(envFilePath);

  // Check 2 — required vars present and non-empty
  for (const key of contract.requiredEnvVars) {
    const value = env[key];
    if (!value || value.trim() === "") {
      missingVars.push(key);
      issues.push(
        makeError(
          "ENV_VAR_MISSING",
          `Required env var ${key} is not set in .env.`,
          key,
        ),
      );
    } else {
      presentVars.push(key);
    }
  }

  if (missingVars.length === 0) {
    passedChecks.push("required-vars-present");
  }

  // Check 3 — placeholder guard
  for (const guard of contract.placeholderGuardedVars ?? []) {
    const value = env[guard.key];
    if (value === guard.placeholder) {
      placeholderVars.push(guard.key);
      issues.push(
        makeError(
          "ENV_VAR_IS_PLACEHOLDER",
          `${guard.key} is still set to the placeholder value "${guard.placeholder}". Replace it with your actual credential.`,
          guard.key,
        ),
      );
    }
  }

  if (placeholderVars.length === 0 && (contract.placeholderGuardedVars?.length ?? 0) > 0) {
    passedChecks.push("placeholder-guard-passed");
  }

  // Check 4 — verify command path (existence only — does not execute)
  if (contract.verifyCommandPath) {
    const verifyPath = path.resolve(kitRoot, contract.verifyCommandPath);
    if (!fs.existsSync(verifyPath)) {
      issues.push(
        makeWarning(
          "VERIFY_COMMAND_MISSING",
          `Verify command declared at ${contract.verifyCommandPath} does not exist.`,
          contract.verifyCommandPath,
        ),
      );
    } else {
      passedChecks.push("verify-command-available");
    }
  }

  const valid = issues.filter((i) => i.severity === "error").length === 0;

  return {
    valid,
    issues,
    passedChecks,
    envFilePath,
    envFileExists: true,
    presentVars,
    missingVars,
    placeholderVars,
    verifyCommandPath: contract.verifyCommandPath,
  };
}

// ---------------------------------------------------------------------------
// Format gate result for CLI or agent output
// ---------------------------------------------------------------------------

export function formatEnvGateResult(result: EnvGateResult): string {
  const lines: string[] = ["=== Environment Gate ==="];

  lines.push(`Env file: ${result.envFileExists ? "found" : "MISSING"} (${result.envFilePath})`);

  if (result.presentVars.length > 0) {
    lines.push(`Present: ${result.presentVars.join(", ")}`);
  }
  if (result.missingVars.length > 0) {
    lines.push(`Missing: ${result.missingVars.join(", ")}`);
  }
  if (result.placeholderVars.length > 0) {
    lines.push(`Placeholder (not set): ${result.placeholderVars.join(", ")}`);
  }

  for (const issue of result.issues) {
    const prefix = issue.severity === "error" ? "ERROR" : issue.severity === "warning" ? "WARN" : "INFO";
    lines.push(`[${prefix}] ${issue.message}`);
  }

  lines.push(result.valid ? "Gate: PASSED" : "Gate: FAILED — session blocked until resolved");

  return lines.join("\n");
}
