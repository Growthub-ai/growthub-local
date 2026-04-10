/**
 * Fork Adapter Core — Provider Adapter Contract & Validator
 *
 * Defines the typed planning/validation contract for provider adapters.
 * This is NOT a provider client implementation — it validates that a kit's
 * declared provider contract is complete, consistent, and documented.
 *
 * Any kit that wraps a provider-backed generation workflow declares a
 * ProviderOperationContract in its ForkAdapterCoreConfig. This module
 * validates that declaration at authoring time (CLI) and planning time (agent).
 *
 * Current reference provider: Muapi (muapi.io)
 * Extension path: implement same contract for Replicate, fal.ai, RunPod, etc.
 */

import fs from "node:fs";
import path from "node:path";
import type { ProviderOperationContract } from "./contracts.js";
import {
  REQUIRED_PROVIDER_OPERATIONS,
  type ProviderOperation,
  type CoreValidationResult,
  type ValidationIssue,
  makeError,
  makeWarning,
  makeInfo,
} from "../types/index.js";

// ---------------------------------------------------------------------------
// Provider adapter validation result
// ---------------------------------------------------------------------------

export interface ProviderAdapterValidationResult extends CoreValidationResult {
  providerId: string;
  declaredOperations: ProviderOperation[];
  missingRequiredOperations: ProviderOperation[];
  referenceDocPresent: boolean;
}

// ---------------------------------------------------------------------------
// Validate a provider operation contract declaration
// ---------------------------------------------------------------------------

export function validateProviderContract(
  kitRoot: string,
  contract: ProviderOperationContract,
): ProviderAdapterValidationResult {
  const issues: ValidationIssue[] = [];
  const passedChecks: string[] = [];
  const missingRequiredOperations: ProviderOperation[] = [];

  // Check provider ID is non-empty
  if (!contract.providerId.trim()) {
    issues.push(makeError("PROVIDER_ID_EMPTY", "providerId must be a non-empty string.", "providerId"));
  } else {
    passedChecks.push("provider-id-present");
  }

  // Check all required operations are declared
  for (const op of REQUIRED_PROVIDER_OPERATIONS) {
    if (!contract.operations.includes(op)) {
      missingRequiredOperations.push(op);
      issues.push(
        makeError(
          "PROVIDER_OPERATION_MISSING",
          `Required provider operation "${op}" is not declared for provider "${contract.providerId}".`,
          "operations",
        ),
      );
    }
  }

  if (missingRequiredOperations.length === 0) {
    passedChecks.push("required-operations-complete");
  }

  // Check auth fields are set
  if (!contract.authMechanism) {
    issues.push(makeError("PROVIDER_AUTH_MISSING", "authMechanism must be declared.", "authMechanism"));
  } else {
    passedChecks.push("auth-mechanism-declared");
  }

  if (!contract.authField.trim()) {
    issues.push(makeError("PROVIDER_AUTH_FIELD_EMPTY", "authField must be a non-empty string.", "authField"));
  } else {
    passedChecks.push("auth-field-declared");
  }

  if (!contract.baseUrl.trim()) {
    issues.push(makeError("PROVIDER_BASE_URL_EMPTY", "baseUrl must be a non-empty string.", "baseUrl"));
  } else {
    passedChecks.push("base-url-declared");
  }

  // Check reference doc exists in kit
  const refDocPath = path.resolve(kitRoot, contract.referenceDocPath);
  const referenceDocPresent = fs.existsSync(refDocPath);

  if (!referenceDocPresent) {
    issues.push(
      makeWarning(
        "PROVIDER_REF_DOC_MISSING",
        `Provider reference doc not found at ${contract.referenceDocPath}. Agents will plan without adapter documentation.`,
        "referenceDocPath",
      ),
    );
  } else {
    passedChecks.push("reference-doc-present");
  }

  return {
    valid: issues.filter((i) => i.severity === "error").length === 0,
    issues,
    passedChecks,
    providerId: contract.providerId,
    declaredOperations: contract.operations,
    missingRequiredOperations,
    referenceDocPresent,
  };
}

// ---------------------------------------------------------------------------
// Muapi reference provider contract factory
// Used by Studio kits that wrap the Open Higgsfield AI → Muapi workflow
// ---------------------------------------------------------------------------

export function buildMuapiProviderContract(
  overrides: Partial<ProviderOperationContract> = {},
): ProviderOperationContract {
  return {
    providerId: "muapi",
    providerName: "Muapi",
    operations: [
      "UPLOAD_ASSET",
      "SUBMIT_GENERATION",
      "POLL_RESULT",
      "NORMALIZE_RESULT",
      "LIST_MODEL_CAPABILITIES",
      "CANCEL_JOB",
      "LIST_HISTORY",
      "HEALTHCHECK",
    ],
    referenceDocPath: "docs/provider-adapter-layer.md",
    authMechanism: "api-key-header",
    authField: "x-api-key",
    baseUrl: "https://api.muapi.io",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Generic provider contract builder for future extension
// ---------------------------------------------------------------------------

export function buildProviderContract(
  providerId: string,
  providerName: string,
  baseUrl: string,
  authField: string,
  referenceDocPath: string,
  additionalOperations: ProviderOperation[] = [],
): ProviderOperationContract {
  return {
    providerId,
    providerName,
    operations: [...REQUIRED_PROVIDER_OPERATIONS, ...additionalOperations],
    referenceDocPath,
    authMechanism: "api-key-header",
    authField,
    baseUrl,
  };
}
