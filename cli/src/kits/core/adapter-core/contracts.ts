/**
 * Fork Adapter Core — Typed Contracts
 *
 * Defines the canonical interface contracts for any kit that wraps:
 *   - a forked open-source repo
 *   - a hosted/browser UI
 *   - a desktop/local app
 *   - a provider-backed execution flow
 *
 * These contracts are intentionally planning/authoring contracts —
 * they are not provider client implementations. They express what a
 * kit declares it supports so the agent and CLI can validate it.
 *
 * Shared across Studio, Workflow, Operator, and Ops kit families.
 */

import type {
  KitFamily,
  ProviderOperation,
  RuntimeSurfaceType,
  ReachabilityProbe,
  SetupFileDeclaration,
  RequiredBinaryDeclaration,
  ForkInspectionRule,
  OutputArtifactDeclaration,
} from "../types/index.js";

// ---------------------------------------------------------------------------
// Provider operation contract
// ---------------------------------------------------------------------------

export interface ProviderOperationContract {
  /** Unique provider identifier (e.g. "muapi", "replicate", "fal") */
  providerId: string;
  /** Human-readable provider name */
  providerName: string;
  /** Operations this provider implements */
  operations: ProviderOperation[];
  /** Path to the provider adapter reference doc inside the kit (relative to kit root) */
  referenceDocPath: string;
  /** Auth mechanism used by the provider */
  authMechanism: "api-key-header" | "bearer-token" | "oauth" | "custom";
  /** Header or field name for the auth value */
  authField: string;
  /** Base URL assumption for the provider API */
  baseUrl: string;
}

// ---------------------------------------------------------------------------
// Environment gate contract
// ---------------------------------------------------------------------------

export interface EnvironmentGateContract {
  /** Required env var keys the kit needs to operate */
  requiredEnvVars: string[];
  /** Env vars that must not be the placeholder value */
  placeholderGuardedVars?: Array<{
    key: string;
    placeholder: string;
  }>;
  /** Optional verification command path (relative to kit root) */
  verifyCommandPath?: string;
  /** Optional reachability probes checked during the gate */
  requiredReachableSurfaces?: ReachabilityProbe[];
}

// ---------------------------------------------------------------------------
// Setup path contract
// ---------------------------------------------------------------------------

export interface SetupPathContract {
  /** Path to the QUICKSTART file (relative to kit root) */
  quickstart: string;
  /** Path to the .env.example file (relative to kit root) */
  envExample: string;
  /** Path to the setup scripts directory (relative to kit root) */
  setupDir: string;
  /** Path to the output directory (relative to kit root) */
  outputDir: string;
  /** Individual declared setup files */
  files: SetupFileDeclaration[];
  /** Required system binaries for local-fork or frame-analysis workflows */
  requiredBinaries?: RequiredBinaryDeclaration[];
}

// ---------------------------------------------------------------------------
// Fork inspection contract
// ---------------------------------------------------------------------------

export interface ForkInspectionContract {
  /** GitHub repo URL for the upstream fork */
  upstreamRepoUrl: string;
  /** Default local clone path (supports ~ prefix) */
  defaultLocalPath: string;
  /** Default dev server port for local-fork mode */
  defaultDevPort?: number;
  /** Inspection rules the agent must follow before planning */
  inspectionRules: ForkInspectionRule;
  /** Path to the fork integration doc inside the kit (relative to kit root) */
  integrationDocPath: string;
}

// ---------------------------------------------------------------------------
// Runtime surface contract
// ---------------------------------------------------------------------------

export interface RuntimeSurfaceContract {
  /** Declared surfaces this kit supports */
  supportedSurfaces: RuntimeSurfaceType[];
  /** Default surface if not specified by operator */
  defaultSurface: RuntimeSurfaceType;
  /** Per-surface reachability probes */
  surfaceProbes: Record<RuntimeSurfaceType, ReachabilityProbe | null>;
}

// ---------------------------------------------------------------------------
// Output contract
// ---------------------------------------------------------------------------

export interface OutputContract {
  /** Root output directory pattern (e.g. "output/<client-slug>/<project-slug>/") */
  outputRootPattern: string;
  /** Declared output artifacts in production order */
  artifacts: OutputArtifactDeclaration[];
  /** Whether outputs must be logged in the active brand kit */
  requiresDeliverableLog: boolean;
  /** Path to the output standards doc inside the kit (relative to kit root) */
  outputStandardsDocPath: string;
}

// ---------------------------------------------------------------------------
// Top-level Fork Adapter Core config
// Assembled by a kit's factory definition to describe the full adapter surface
// ---------------------------------------------------------------------------

export interface ForkAdapterCoreConfig {
  /** Kit identifier (must match kit.json kit.id) */
  kitId: string;
  /** Kit family this config belongs to */
  family: KitFamily;
  /** Provider operation contract — what provider is declared and how */
  provider: ProviderOperationContract;
  /** Environment gate contract — what the env gate checks at session start */
  envGate: EnvironmentGateContract;
  /** Setup path contract — what setup files the kit declares */
  setup: SetupPathContract;
  /** Fork inspection contract — how the agent inspects the upstream fork */
  forkInspection: ForkInspectionContract;
  /** Runtime surface contract — which surfaces the kit supports */
  runtimeSurface: RuntimeSurfaceContract;
  /** Output contract — how outputs are structured and logged */
  output: OutputContract;
}
