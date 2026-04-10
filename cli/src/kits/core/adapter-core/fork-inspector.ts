/**
 * Fork Adapter Core — Fork Inspector
 *
 * Reusable inspection primitives for any kit that wraps a forked open-source repo.
 *
 * The inspector does not run the fork — it validates that the declared inspection
 * surface (required planning files, source-of-truth files) is present in the
 * local checkout before the agent begins planning.
 *
 * This encodes the core rule: "inspect actual fork before planning".
 * Agents that skip fork inspection must mark their output as `assumption-based`.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { ForkInspectionContract } from "./contracts.js";
import type { CoreValidationResult, ValidationIssue } from "../types/index.js";
import { makeError, makeWarning, makeInfo } from "../types/index.js";

// ---------------------------------------------------------------------------
// Fork inspection result
// ---------------------------------------------------------------------------

export type ForkVerificationStatus = "fork-verified" | "upstream-verified" | "assumption-based";

export interface ForkInspectionResult extends CoreValidationResult {
  forkRoot: string | null;
  forkFound: boolean;
  verificationStatus: ForkVerificationStatus;
  presentPlanningFiles: string[];
  missingPlanningFiles: string[];
  presentSourceOfTruthFiles: string[];
  missingSourceOfTruthFiles: string[];
  fileMetadata: ForkFileMetadata[];
}

export interface ForkFileMetadata {
  relativePath: string;
  exists: boolean;
  sizeBytes?: number;
  sha256?: string;
  mtimeMs?: number;
}

// ---------------------------------------------------------------------------
// Resolve local fork root
// ---------------------------------------------------------------------------

export function resolveForkRoot(
  contract: ForkInspectionContract,
  overridePath?: string,
): string | null {
  const candidates: string[] = [];

  if (overridePath) {
    candidates.push(path.resolve(overridePath));
  }

  // Expand ~ in defaultLocalPath
  const defaultPath = contract.defaultLocalPath.replace(/^~/, process.env["HOME"] ?? "~");
  candidates.push(path.resolve(defaultPath));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Inspect fork at resolved root
// ---------------------------------------------------------------------------

export function inspectFork(
  contract: ForkInspectionContract,
  options: {
    forkRootOverride?: string;
    includeHashes?: boolean;
  } = {},
): ForkInspectionResult {
  const issues: ValidationIssue[] = [];
  const passedChecks: string[] = [];

  const forkRoot = resolveForkRoot(contract, options.forkRootOverride);

  if (!forkRoot) {
    issues.push(
      makeWarning(
        "FORK_NOT_FOUND",
        `Local fork not found at ${contract.defaultLocalPath}. Run: bash setup/clone-fork.sh OR switch to browser-hosted mode.`,
      ),
    );
    issues.push(makeInfo("FORK_VERIFICATION_STATUS", "Proceeding as assumption-based — mark all outputs as assumption-based."));

    return {
      valid: true, // non-blocking — fork is optional, just changes verification status
      issues,
      passedChecks,
      forkRoot: null,
      forkFound: false,
      verificationStatus: "assumption-based",
      presentPlanningFiles: [],
      missingPlanningFiles: contract.inspectionRules.requiredPlanningFiles,
      presentSourceOfTruthFiles: [],
      missingSourceOfTruthFiles: contract.inspectionRules.sourceOfTruthFiles,
      fileMetadata: [],
    };
  }

  passedChecks.push("fork-found");

  const presentPlanningFiles: string[] = [];
  const missingPlanningFiles: string[] = [];
  const presentSourceOfTruthFiles: string[] = [];
  const missingSourceOfTruthFiles: string[] = [];
  const fileMetadata: ForkFileMetadata[] = [];

  // Check required planning files
  for (const relPath of contract.inspectionRules.requiredPlanningFiles) {
    const fullPath = path.resolve(forkRoot, relPath);
    const exists = fs.existsSync(fullPath);
    const meta = buildFileMetadata(fullPath, relPath, exists, options.includeHashes);
    fileMetadata.push(meta);

    if (exists) {
      presentPlanningFiles.push(relPath);
      passedChecks.push(`planning-file:${relPath}`);
    } else {
      missingPlanningFiles.push(relPath);
      issues.push(
        makeWarning(
          "PLANNING_FILE_MISSING",
          `Required planning file not found in fork: ${relPath}. Planning may be inaccurate without it.`,
          relPath,
        ),
      );
    }
  }

  // Check source-of-truth files
  for (const relPath of contract.inspectionRules.sourceOfTruthFiles) {
    if (contract.inspectionRules.requiredPlanningFiles.includes(relPath)) continue; // already checked
    const fullPath = path.resolve(forkRoot, relPath);
    const exists = fs.existsSync(fullPath);
    const meta = buildFileMetadata(fullPath, relPath, exists, options.includeHashes);
    fileMetadata.push(meta);

    if (exists) {
      presentSourceOfTruthFiles.push(relPath);
      passedChecks.push(`sot-file:${relPath}`);
    } else {
      missingSourceOfTruthFiles.push(relPath);
      issues.push(
        makeInfo(
          "SOT_FILE_MISSING",
          `Source-of-truth file not found in fork: ${relPath}. Some planning constraints may rely on upstream assumptions.`,
        ),
      );
    }
  }

  const verificationStatus: ForkVerificationStatus =
    missingPlanningFiles.length === 0 ? "fork-verified" : "upstream-verified";

  if (contract.inspectionRules.note) {
    issues.push(makeInfo("FORK_INSPECTION_NOTE", contract.inspectionRules.note));
  }

  return {
    valid: true,
    issues,
    passedChecks,
    forkRoot,
    forkFound: true,
    verificationStatus,
    presentPlanningFiles,
    missingPlanningFiles,
    presentSourceOfTruthFiles,
    missingSourceOfTruthFiles,
    fileMetadata,
  };
}

// ---------------------------------------------------------------------------
// File metadata builder
// ---------------------------------------------------------------------------

function buildFileMetadata(
  fullPath: string,
  relativePath: string,
  exists: boolean,
  includeHashes = false,
): ForkFileMetadata {
  if (!exists) return { relativePath, exists: false };

  const stat = fs.statSync(fullPath);
  const meta: ForkFileMetadata = {
    relativePath,
    exists: true,
    sizeBytes: stat.size,
    mtimeMs: stat.mtimeMs,
  };

  if (includeHashes) {
    const content = fs.readFileSync(fullPath);
    meta.sha256 = crypto.createHash("sha256").update(content).digest("hex");
  }

  return meta;
}

// ---------------------------------------------------------------------------
// Assert a single file is present in the fork (utility for agent planning checks)
// ---------------------------------------------------------------------------

export function assertForkFileExists(
  forkRoot: string,
  relativePath: string,
): { exists: boolean; fullPath: string } {
  const fullPath = path.resolve(forkRoot, relativePath);
  return { exists: fs.existsSync(fullPath), fullPath };
}
