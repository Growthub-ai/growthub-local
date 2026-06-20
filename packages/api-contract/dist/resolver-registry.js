/**
 * @growthub/api-contract — Unified API Resolver Registry (CMS SDK v1.5.1)
 *
 * The additive 1.5.1 enhancement of the frozen 1.5 contract. It does NOT
 * change, deprecate, or destabilize any existing governed object, the API
 * Registry row shape, the PATCH allowlist, or the resolver dispatch contract
 * (`registerSourceResolver`). It names — as type-only truth — the single,
 * dynamic registry that ties every resolver to the governed `api-registry`
 * record it serves, so the no-code cockpit can construct resolvers under the
 * hood and agents can read one externalized index instead of re-deriving the
 * workspace.
 *
 * The source of truth stays the governed record: the `api-registry` row in
 * `growthub.config.json#dataModel.objects[]`. A resolver (server file or
 * config-driven, in-memory) and an endpoint are *projections* of that record —
 * generated, re-derivable, and never the authority. Generated artifacts carry a
 * do-not-edit banner and are edited only through the two governed lanes: the
 * approval/patch API (helper `resolver.create` apply + `PATCH /api/workspace`)
 * and the no-code browser cockpit.
 *
 * Runtime truth lives in the workspace app:
 *   - lib/unified-resolver-registry.js          (pure deriver — Phase 1)
 *   - lib/resolver-constructor.js               (intent+shape → proposal — Phase 2)
 *   - app/api/resolvers/[integrationId]/route.js (governed endpoint — Phase 3)
 *   - app/api/workspace/resolvers/route.js      (read surface, additive `registry`)
 *
 * Additive contract: type definitions plus runtime-safe vocabulary constants
 * and one runtime guard (`isResolverRegistryIndex`). No existing 1.5 export is
 * changed; the package is tree-shakeable (`sideEffects: false`).
 */
/** Frozen connector-kind vocabulary. */
export const RESOLVER_CONNECTOR_KINDS = [
    "custom-http",
    "nango",
    "mcp",
    "webhook",
    "chrome",
    "none",
];
/** Frozen provenance vocabulary. */
export const RESOLVER_PROVENANCE_VALUES = [
    "config-driven",
    "static-file",
    "helper-generated",
    "passthrough",
    "missing",
];
/** Index artifact kind. */
export const RESOLVER_REGISTRY_INDEX_KIND = "growthub-resolver-registry-index-v1";
/** Endpoint manifest kind. */
export const RESOLVER_ENDPOINT_MANIFEST_KIND = "growthub-resolver-endpoint-manifest-v1";
/** Resolvers dir (repo-relative inside the workspace app). */
export const RESOLVER_REGISTRY_DIR = "lib/adapters/integrations/resolvers";
/** Externalized, agent-readable index artifact (do-not-edit, gated write). */
export const RESOLVER_REGISTRY_INDEX_FILE = "lib/adapters/integrations/resolvers/_registry.generated.json";
/** Endpoint manifest artifact (do-not-edit, gated/build write). */
export const RESOLVER_ENDPOINT_MANIFEST_FILE = "lib/adapters/integrations/resolvers/_endpoints.generated.json";
/** Base path every governed resolver endpoint is addressable under. */
export const RESOLVER_ENDPOINT_BASE = "/api/resolvers";
/**
 * The banner every generated resolver file / artifact carries. Its presence is
 * how the deriver tags `helper-generated` provenance and how the drift guard
 * recognizes managed files. Generated code is a projection of the governed
 * record — never hand-edited.
 */
export const RESOLVER_GENERATED_BANNER = "@growthub-resolver generated — do not edit; edit the governed api-registry record";
export function isResolverRegistryIndex(value) {
    return (typeof value === "object" &&
        value !== null &&
        value.kind === RESOLVER_REGISTRY_INDEX_KIND &&
        Array.isArray(value.entries));
}
/** Additive changes keep the literal `1`. */
export const WORKSPACE_RESOLVER_REGISTRY_CONTRACT_VERSION = 1;
//# sourceMappingURL=resolver-registry.js.map