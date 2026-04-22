/**
 * @growthub/api-contract — Profile & entitlements (CMS SDK v1)
 *
 * Frozen from the growthub-local hosted execution client
 * (`HostedProfile`). This is the stable public shape of the hosted
 * profile surface.
 */
export type PreferredExecutionMode = "local" | "serverless" | "browser" | "auto";
export interface ExecutionDefaults {
    /** Preferred execution surface for this principal. */
    preferredMode: PreferredExecutionMode;
    /** Whether serverless fallback is allowed when local cannot service a run. */
    allowServerlessFallback: boolean;
    /** Whether browser-bridge execution is allowed. */
    allowBrowserBridge: boolean;
}
/**
 * Entitlement identifier. Stays a branded string alias so the public SDK
 * can evolve the shape later without consumer breakage.
 */
export type Entitlement = string;
/**
 * A gated capability reference — used to express which capabilities are
 * locked behind a specific entitlement / kit / plan.
 */
export interface GatedCapabilityRef {
    /** Capability slug that is gated. */
    slug: string;
    /** Entitlement that unlocks the capability. */
    entitlement: Entitlement;
    /** Optional kit slug scoping the gate. */
    kitSlug?: string;
    /** Optional human-facing reason string. */
    reason?: string;
}
export interface Profile {
    userId: string;
    email?: string;
    displayName?: string;
    orgId?: string;
    orgName?: string;
    /** Flat list of entitlements held by this principal. */
    entitlements: Entitlement[];
    /** Kit slugs that are gated for this principal. */
    gatedKitSlugs: string[];
    /** Execution defaults resolved for this principal. */
    executionDefaults: ExecutionDefaults;
}
//# sourceMappingURL=profile.d.ts.map