/**
 * CMS SDK v1 — Profile & entitlements contract.
 *
 * Mirrors the hosted profile overlay already consumed by the CLI. Entitlements
 * and gated capability references let surfaces render the right state without
 * re-deriving policy from internal flags.
 */

export type PreferredExecutionMode =
  | "local"
  | "serverless"
  | "browser"
  | "auto";

export interface ExecutionDefaults {
  preferredMode: PreferredExecutionMode;
  allowServerlessFallback: boolean;
  allowBrowserBridge: boolean;
}

/**
 * Opaque entitlement identifier. Entitlements are simple strings today; the
 * shape is frozen as a named alias so future evolution (scope, expiry) is
 * additive, not breaking.
 */
export type Entitlement = string;

export interface GatedCapabilityRef {
  slug: string;
  reason?: string;
}

export interface Profile {
  userId: string;
  email?: string;
  displayName?: string;
  orgId?: string;
  orgName?: string;
  entitlements: Entitlement[];
  gatedKitSlugs: string[];
  executionDefaults: ExecutionDefaults;
}
