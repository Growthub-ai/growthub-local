export interface SessionCompactionPolicy {
    enabled: boolean;
    maxSessionRuns: number;
    maxRawInputTokens: number;
    maxSessionAgeHours: number;
}
export type NativeContextManagement = "confirmed" | "likely" | "unknown" | "none";
export interface AdapterSessionManagement {
    supportsSessionResume: boolean;
    nativeContextManagement: NativeContextManagement;
    defaultSessionCompaction: SessionCompactionPolicy;
}
export interface ResolvedSessionCompactionPolicy {
    policy: SessionCompactionPolicy;
    adapterSessionManagement: AdapterSessionManagement | null;
    explicitOverride: Partial<SessionCompactionPolicy>;
    source: "adapter_default" | "agent_override" | "legacy_fallback";
}
export declare const LEGACY_SESSIONED_ADAPTER_TYPES: Set<string>;
export declare const ADAPTER_SESSION_MANAGEMENT: Record<string, AdapterSessionManagement>;
export declare function getAdapterSessionManagement(adapterType: string | null | undefined): AdapterSessionManagement | null;
export declare function readSessionCompactionOverride(runtimeConfig: unknown): Partial<SessionCompactionPolicy>;
export declare function resolveSessionCompactionPolicy(adapterType: string | null | undefined, runtimeConfig: unknown): ResolvedSessionCompactionPolicy;
export declare function hasSessionCompactionThresholds(policy: Pick<SessionCompactionPolicy, "maxSessionRuns" | "maxRawInputTokens" | "maxSessionAgeHours">): boolean;
//# sourceMappingURL=session-compaction.d.ts.map