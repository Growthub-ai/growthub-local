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

/**
 * Connector kind a governed API Registry row resolves through. Provider-
 * agnostic by design — adding a provider is adding a row, never a new kind.
 * `"none"` means raw passthrough (no shaping resolver wired).
 */
export type ResolverConnectorKind =
  | "custom-http"
  | "nango"
  | "mcp"
  | "webhook"
  | "chrome"
  | "none";

/**
 * How a resolver came to exist for its record:
 *   - "config-driven"    in-memory, built from the row every request (Nango precedent)
 *   - "static-file"      a hand-dropped resolver file under the resolvers dir
 *   - "helper-generated" a resolver file written by the governed helper lane
 *   - "passthrough"      no shaping resolver — the tested response is used raw
 *   - "missing"          the row expects a resolver that is not registered/present
 */
export type ResolverProvenance =
  | "config-driven"
  | "static-file"
  | "helper-generated"
  | "passthrough"
  | "missing";

/** The governed record a resolver projects from. `rowName` is the capital-N identity column. */
export interface ResolverRecordRef {
  /** Data Model object id holding the api-registry row. */
  objectId: string;
  /** Capital-N row identity (Data Model convention). */
  rowName: string;
  /** Stable provider slug — the resolver registry key. */
  integrationId: string;
}

/** Response-shape facts derived from the row's last successful test (`profileApiResponse`). */
export interface ResolverShapeProfile {
  /** Dotted path to the record array (e.g. "data.items"); "" for a top-level array. */
  arrayPath: string;
  /** Field used as the stable row id. */
  idField: string;
  /** Suggested entity type for governed rows. */
  entityType: string;
  /** True when pagination markers were detected — a paging-aware resolver is required. */
  hasPagination: boolean;
}

/** The single derived next move for a record's resolver journey. */
export interface ResolverNextAction {
  /** Step id from the API Registry creation journey (e.g. "resolver", "test"). */
  stepId: string;
  /** Action id the cockpit maps to a governed handler (e.g. "construct-resolver"). */
  id: string;
  label: string;
}

/**
 * One entry per governed API Registry row — the correlation that did not exist
 * before 1.5.1. Secret-safe: ids, slugs, counts, booleans, and paths only.
 */
export interface ResolverRegistryEntry {
  recordRef: ResolverRecordRef;
  integrationId: string;
  /**
   * Canonical resolver identity — the slug of `integrationId`. The governed
   * record keeps its human integrationId; the resolver file, registry key, and
   * endpoint path all use `resolverId`. Two integrationIds that normalize to the
   * same resolverId are reported in `ResolverRegistryIndex.collisions`.
   */
  resolverId: string;
  connectorKind: ResolverConnectorKind;
  provenance: ResolverProvenance;
  /** Resolver file path when materialized (helper-generated / static-file); null otherwise. */
  filePath: string | null;
  /** True when present in the in-memory source-resolver registry. */
  registered: boolean;
  /** True when the row's last test indicates success. */
  tested: boolean;
  /** Shape facts from the last test; null until tested. */
  shape: ResolverShapeProfile | null;
  /** Milestone activation score (0–100) from the creation journey. */
  score: number;
  /** The single next move for this record, or null when complete. */
  nextAction: ResolverNextAction | null;
  /**
   * The addressable governed endpoint this record is exposed at across the
   * monorepo when registered (Phase 3): `/api/resolvers/<resolverId>`.
   * null when the resolver is not registered (nothing to expose).
   */
  endpoint: string | null;
}

/** Two records normalizing to the same `resolverId` — a hard governance error. */
export interface ResolverIdentityCollision {
  resolverId: string;
  /** `"<objectId>:<rowName>:<integrationId>"` for each colliding record. */
  records: string[];
}

/** Rollup over all entries — the aggregate-first surface for the cockpit and Fleet lens. */
export interface ResolverRegistrySummary {
  total: number;
  registered: number;
  tested: number;
  /** Records whose resolver is recommended/required but not yet wired. */
  needsResolver: number;
  /** Records exposed as governed endpoints. */
  exposed: number;
  /** Number of resolverId collisions (must be 0 in a healthy workspace). */
  collisions: number;
}

/**
 * The unified, externalizable index. Written (gated) to the resolvers dir as a
 * do-not-edit artifact so agents read one file instead of re-deriving — and
 * returned additively from `GET /api/workspace/resolvers`.
 */
export interface ResolverRegistryIndex {
  kind: "growthub-resolver-registry-index-v1";
  version: 1;
  /** ISO timestamp the index was derived. */
  generatedAt: string;
  entries: ResolverRegistryEntry[];
  summary: ResolverRegistrySummary;
  /** resolverId collisions — empty in a healthy workspace. */
  collisions: ResolverIdentityCollision[];
}

export type ResolverRegistryStatus = "ok" | "degraded";

/**
 * Additive response of `GET /api/workspace/resolvers`. The legacy fields
 * (`files`, `registeredIds`, `resolvers`, `canUpload`) are preserved verbatim
 * for back-compat; `registry` is the 1.5.1 correlation surface.
 *
 * Registry derivation failure is NEVER hidden: `registry` is `null` with
 * `registryStatus: "degraded"` and a structured `registryError`, so an agent
 * can distinguish "no entries" from "registry failed". On a writable runtime
 * the artifact write-through outcome is reported (`artifactWritten` / reason),
 * not swallowed.
 */
export interface UnifiedResolverRegistryResponse {
  files: string[];
  registeredIds: string[];
  resolvers: Array<Record<string, unknown>>;
  canUpload: boolean;
  registry: ResolverRegistryIndex | null;
  registryStatus: ResolverRegistryStatus;
  registryError: { reason: string; message: string } | null;
  artifactWritten: boolean;
  artifactReason: string | null;
}

/** Manifest of governed resolver endpoints exposed across the monorepo (Phase 3). */
export interface ResolverEndpointManifest {
  kind: "growthub-resolver-endpoint-manifest-v1";
  version: 1;
  generatedAt: string;
  /** Base path every exposed resolver is addressable under. */
  basePath: typeof RESOLVER_ENDPOINT_BASE;
  endpoints: Array<{
    integrationId: string;
    path: string;
    connectorKind: ResolverConnectorKind;
    recordRef: ResolverRecordRef;
  }>;
}

/** Frozen connector-kind vocabulary. */
export const RESOLVER_CONNECTOR_KINDS = [
  "custom-http",
  "nango",
  "mcp",
  "webhook",
  "chrome",
  "none",
] as const;

/** Frozen provenance vocabulary. */
export const RESOLVER_PROVENANCE_VALUES = [
  "config-driven",
  "static-file",
  "helper-generated",
  "passthrough",
  "missing",
] as const;

/** Index artifact kind. */
export const RESOLVER_REGISTRY_INDEX_KIND = "growthub-resolver-registry-index-v1" as const;
/** Endpoint manifest kind. */
export const RESOLVER_ENDPOINT_MANIFEST_KIND = "growthub-resolver-endpoint-manifest-v1" as const;

/** Resolvers dir (repo-relative inside the workspace app). */
export const RESOLVER_REGISTRY_DIR = "lib/adapters/integrations/resolvers" as const;
/** Externalized, agent-readable index artifact (do-not-edit, gated write). */
export const RESOLVER_REGISTRY_INDEX_FILE =
  "lib/adapters/integrations/resolvers/_registry.generated.json" as const;
/** Endpoint manifest artifact (do-not-edit, gated/build write). */
export const RESOLVER_ENDPOINT_MANIFEST_FILE =
  "lib/adapters/integrations/resolvers/_endpoints.generated.json" as const;
/** Base path every governed resolver endpoint is addressable under. */
export const RESOLVER_ENDPOINT_BASE = "/api/resolvers" as const;

/**
 * The banner every generated resolver file / artifact carries. Its presence is
 * how the deriver tags `helper-generated` provenance and how the drift guard
 * recognizes managed files. Generated code is a projection of the governed
 * record — never hand-edited.
 */
export const RESOLVER_GENERATED_BANNER =
  "@growthub-resolver generated — do not edit; edit the governed api-registry record" as const;

export function isResolverRegistryIndex(value: unknown): value is ResolverRegistryIndex {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === RESOLVER_REGISTRY_INDEX_KIND &&
    Array.isArray((value as { entries?: unknown }).entries)
  );
}

/** Additive changes keep the literal `1`. */
export const WORKSPACE_RESOLVER_REGISTRY_CONTRACT_VERSION = 1 as const;
