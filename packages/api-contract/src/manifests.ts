/**
 * CMS SDK v1 — Manifest registry contract.
 *
 * Makes the manifest envelope the canonical discovery primitive. The envelope
 * is portable, inspectable, cache-friendly, and provenance-aware so local
 * extensions and hosted records can cleanly coexist.
 */

import type {
  CapabilityFamily,
  CapabilityExecutionKind,
  CapabilityExecutionBinding,
  CapabilityExecutionTokens,
} from "./capabilities.js";
import type { NodeInputSchema, NodeOutputSchema } from "./schemas.js";
import type { ProviderAssemblyHints } from "./providers.js";

export type ManifestSource = "hosted" | "local-extension" | "derived";

export type ManifestOriginType =
  | "hosted"
  | "local-extension"
  | "derived-from-workflow";

export interface ManifestProvenance {
  originType: ManifestOriginType;
  sourceHost?: string;
  sourceWorkflowId?: string;
  sourceManifestId?: string;
  localExtensionPath?: string;
  fetchedAt?: string;
}

export interface ExecutionHints {
  defaultMode?: "local" | "hosted" | "hybrid";
  requiresHostedBridge?: boolean;
  estimatedDurationMs?: number;
  estimatedCredits?: number;
}

/**
 * Single capability manifest entry. Carries everything a consumer needs to
 * render, bind, validate, and dispatch the capability without reading
 * CLI-internal code.
 */
export interface CapabilityManifest {
  slug: string;
  family: CapabilityFamily;
  displayName: string;
  executionKind: CapabilityExecutionKind;
  requiredBindings: string[];
  outputTypes: string[];
  inputSchema: NodeInputSchema;
  outputSchema: NodeOutputSchema;
  executionBinding?: CapabilityExecutionBinding;
  executionTokens?: CapabilityExecutionTokens;
  providerHints?: ProviderAssemblyHints;
  executionHints?: ExecutionHints;
  provenance: ManifestProvenance;
  icon?: string;
  description?: string;
  experimental?: boolean;
}

export interface ManifestDriftReport {
  /** Manifest slugs present in the current envelope but missing upstream. */
  addedSlugs?: string[];
  /** Manifest slugs missing from the current envelope but present upstream. */
  removedSlugs?: string[];
  /** Slugs whose shape changed between envelopes. */
  changedSlugs?: string[];
  notes?: string[];
}

/**
 * Top-level registry envelope. One envelope represents one cache / fetch /
 * local-extension load and is self-describing.
 */
export interface CapabilityManifestEnvelope {
  version: 1;
  host: string;
  fetchedAt: string;
  source: ManifestSource;
  capabilities: CapabilityManifest[];
  provenance?: ManifestProvenance;
  drift?: ManifestDriftReport;
}
