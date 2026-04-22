/**
 * @growthub/api-contract — Provider assembly (CMS SDK v1)
 *
 * Provider assembly is a first-class public primitive. It is deliberately
 * separated from execution so:
 *
 *   - execution stays deterministic
 *   - provider resolution stays modular
 *   - later policy / governance layers can compose cleanly
 *
 * Frozen from the growthub-local hosted execution client
 * (`HostedProviderAssemblyInput`, `HostedProviderAssemblyResult`,
 * `HostedProviderRecord`).
 */

import type { ExecutionMode } from "./execution.js";

// ---------------------------------------------------------------------------
// Provider record
// ---------------------------------------------------------------------------

export type ProviderStatus = "active" | "degraded" | "unavailable";

export interface ProviderRecord {
  providerId: string;
  providerType: string;
  /** Capability slugs this provider is willing to service. */
  capabilities: string[];
  status: ProviderStatus;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Assembly input
// ---------------------------------------------------------------------------

export interface ProviderAssemblyInput {
  /** Capability slug to assemble providers for. */
  capabilitySlug: string;
  /** Execution context this assembly is targeting. */
  executionContext: ExecutionMode;
  /** Optional connection id scoping the assembly. */
  connectionId?: string;
  /** Additional assembly parameters. */
  parameters?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Assembly result
// ---------------------------------------------------------------------------

export type ProviderAssemblyStatus = "ready" | "partial" | "unavailable";

export interface ProviderAssemblyResult {
  providers: ProviderRecord[];
  status: ProviderAssemblyStatus;
  notes?: string[];
}

// ---------------------------------------------------------------------------
// Assembly hints
// ---------------------------------------------------------------------------

/**
 * Hints the SDK exposes so callers can reason about providers *before*
 * dispatching execution.
 *
 * These are deliberately additive — hints never gate execution by
 * themselves. The authoritative answer always comes from
 * {@link ProviderAssemblyResult}.
 */
export interface ProviderAssemblyHints {
  /** Providers that are structurally valid for this capability. */
  validProviders: string[];
  /** Preferred provider for the current principal, if any. */
  preferredProvider?: string;
  /** Ordered fallbacks when the preferred provider is unavailable. */
  fallbackProviders?: string[];
  /** Whether this capability requires a user-configured connection. */
  requiresConnection?: boolean;
  /** Whether this capability requires the hosted execution bridge. */
  requiresHostedBridge?: boolean;
}
