/**
 * Fork Adapter Core — Shared Type Primitives
 *
 * Kit family taxonomy and shared primitive types consumed across
 * adapter-core, factory, and validation modules.
 *
 * Kit families map to vertical use cases:
 *   studio   — wraps a forked open-source AI studio (image/video/audio/cinema)
 *   workflow — wraps a multi-step agentic pipeline or automation workflow
 *   operator — wraps a domain-specific operator (e.g. email, growth, content)
 *   ops      — wraps an infrastructure or devops execution surface
 */

// ---------------------------------------------------------------------------
// Kit family taxonomy
// ---------------------------------------------------------------------------

export type KitFamily = "studio" | "workflow" | "operator" | "ops";

export const KIT_FAMILIES: readonly KitFamily[] = [
  "studio",
  "workflow",
  "operator",
  "ops",
] as const;

// ---------------------------------------------------------------------------
// Provider operation contract
// ---------------------------------------------------------------------------

export type ProviderOperation =
  | "UPLOAD_ASSET"
  | "SUBMIT_GENERATION"
  | "POLL_RESULT"
  | "NORMALIZE_RESULT"
  | "LIST_MODEL_CAPABILITIES"
  | "CANCEL_JOB"
  | "LIST_HISTORY"
  | "HEALTHCHECK";

export const REQUIRED_PROVIDER_OPERATIONS: readonly ProviderOperation[] = [
  "UPLOAD_ASSET",
  "SUBMIT_GENERATION",
  "POLL_RESULT",
  "NORMALIZE_RESULT",
  "LIST_MODEL_CAPABILITIES",
] as const;

export const OPTIONAL_PROVIDER_OPERATIONS: readonly ProviderOperation[] = [
  "CANCEL_JOB",
  "LIST_HISTORY",
  "HEALTHCHECK",
] as const;

// ---------------------------------------------------------------------------
// Runtime surface types
// ---------------------------------------------------------------------------

export type RuntimeSurfaceType = "local-fork" | "browser-hosted" | "desktop-app" | "custom";

export const RUNTIME_SURFACE_TYPES: readonly RuntimeSurfaceType[] = [
  "local-fork",
  "browser-hosted",
  "desktop-app",
  "custom",
] as const;

// ---------------------------------------------------------------------------
// Reachability probe types
// ---------------------------------------------------------------------------

export type ReachabilityProbeType = "http" | "file" | "process";

export interface ReachabilityProbe {
  id: string;
  type: ReachabilityProbeType;
  target: string;
  required: boolean;
  description?: string;
}

// ---------------------------------------------------------------------------
// Setup file declarations
// ---------------------------------------------------------------------------

export interface SetupFileDeclaration {
  relativePath: string;
  required: boolean;
  description: string;
}

export interface RequiredBinaryDeclaration {
  binary: string;
  installHint: string;
  requiredForSurfaces: RuntimeSurfaceType[];
}

// ---------------------------------------------------------------------------
// Fork inspection rule
// ---------------------------------------------------------------------------

export interface ForkInspectionRule {
  requiredPlanningFiles: string[];
  sourceOfTruthFiles: string[];
  note?: string;
}

// ---------------------------------------------------------------------------
// Output artifact declaration
// ---------------------------------------------------------------------------

export interface OutputArtifactDeclaration {
  name: string;
  relativePath: string;
  required: boolean;
  description: string;
}

// ---------------------------------------------------------------------------
// Validation result primitive (shared across all validators)
// ---------------------------------------------------------------------------

export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
  field?: string;
  path?: string;
}

export interface CoreValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  passedChecks: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function makeError(code: string, message: string, field?: string): ValidationIssue {
  return { severity: "error", code, message, field };
}

export function makeWarning(code: string, message: string, field?: string): ValidationIssue {
  return { severity: "warning", code, message, field };
}

export function makeInfo(code: string, message: string): ValidationIssue {
  return { severity: "info", code, message };
}
