/**
 * CMS SDK v1 — Provider assembly contract.
 *
 * Provider assembly is a first-class primitive and is kept separate from
 * node execution so that provider readiness and capability execution can
 * evolve independently.
 */

import type { CapabilityExecutionKind } from "./capabilities.js";

export type ProviderStatus = "active" | "degraded" | "unavailable";

export type ProviderAssemblyStatus = "ready" | "partial" | "unavailable";

export interface ProviderAssemblyInput {
  capabilitySlug: string;
  executionContext: "local" | "hosted" | "hybrid";
  connectionId?: string;
  parameters?: Record<string, unknown>;
}

export interface ProviderRecord {
  providerId: string;
  providerType: string;
  capabilities: string[];
  status: ProviderStatus;
  metadata?: Record<string, unknown>;
}

export interface ProviderAssemblyResult {
  providers: ProviderRecord[];
  status: ProviderAssemblyStatus;
  notes?: string[];
}

/**
 * Advisory hints describing which providers a capability can use.
 * Sits beside `ProviderAssemblyResult`, not inside node execution results.
 */
export interface ProviderAssemblyHints {
  validProviders: string[];
  preferredProvider?: string;
  fallbackProviders?: string[];
  requiresConnection?: boolean;
  requiresHostedBridge?: boolean;
  executionKind?: CapabilityExecutionKind;
}
