/**
 * @growthub/api-contract — Worker Kits (CMS SDK v1)
 *
 * Public, type-only surface for the **Worker Kit** primitive — the
 * foundational unit of Growthub's governed-workspace model.
 *
 * Mirrors the internal `cli/src/kits/contract.ts` types so the CLI's
 * truth (list / inspect / validate / download surfaces) becomes a
 * public contract without a single semantic change. Every kit on
 * `main` conforms to this shape.
 *
 * Schema versions
 * ---------------
 *
 * **v1 and v2 are variations of the same Worker Kit primitive.**
 * Neither is a successor to the other; they express the same
 * governed-workspace contract at two different scopes.
 *
 *   v1  — Worker Kit **core primitive**. Baseline, localized,
 *         open-source agent environment: `kit.json` + `SKILL.md` +
 *         agent contract + frozen assets + bundle. No UI surface.
 *
 *   v2  — Same primitive, **extended to package full applications**
 *         inside the governed workspace. Adds:
 *           * `kit.type` capability taxonomy (`worker | workflow |
 *             output | ui`) — the `"ui"` value declares an app kit
 *           * `kit.family` (`studio | workflow | operator | ops`)
 *           * `executionMode` / `activationModes[]` (`export | install
 *             | mount | run`) — supports app kits that install / mount
 *             rather than only export
 *           * `compatibility` (cliMinVersion, requiredCapabilities)
 *           * `install?` metadata (installable, scopeDefault, postInstallHint)
 *           * `ui?` metadata (icon, color, category, tags) — UI surface
 *             registration for app kits
 *           * `provenance?` metadata (frozenBy, checksum)
 *
 * Both schemas are first-class. v1 is not deprecated; it is the
 * correct shape when the kit ships only the core primitive with no UI
 * surface. v2 is the correct shape when the kit ALSO ships a full
 * application inside the governed workspace.
 *
 * Optional, orthogonal companions (declared per-kit when needed):
 *
 *   - `SkillManifest`              (./skills)        — every kit's SKILL.md
 *   - `PipelineKitManifest`        (./pipeline-kits) — multi-stage kits
 *   - `WorkspaceDependencyManifest`(./workspaces)    — kits with external repos
 *   - `AdapterContractRef`         (./adapters)      — kits with provider boundaries
 *   - `KitHealthReport`            (./health)        — universal readiness shape
 *   - `PipelineTraceEvent`         (./pipeline-trace)— additive trace events
 *
 * Rules:
 *   - Additive only. v2 is a superset of v1; new fields are optional.
 *   - No runtime behavior. The SDK describes the shape; the CLI parses
 *     it.
 */
/**
 * What kind of capability the kit packages. v2 extension over v1.
 *
 *   - `worker`   — agent operator kit (the most common shape)
 *   - `workflow` — multi-step workflow operator
 *   - `output`   — produces typed output artifacts
 *   - `ui`       — full app kit (Vercel-deployable Next.js, Vite
 *                  studio shell, or both) inside the governed workspace
 */
export type WorkerKitCapabilityType = "worker" | "workflow" | "output" | "ui";
/**
 * How the kit is materialized inside a governed workspace.
 *
 *   - `export`  — copied as a self-contained directory (default)
 *   - `install` — installed under a scope (user / project)
 *   - `mount`   — mounted into an existing workspace
 *   - `run`     — executed in place
 *
 * v2 introduced `install / mount / run` to support app kits that
 * cannot be expressed as a pure export.
 */
export type WorkerKitExecutionMode = "export" | "install" | "mount" | "run";
/**
 * Same union as `WorkerKitExecutionMode`, used for `activationModes[]`
 * (which modes the kit advertises to operators).
 */
export type WorkerKitActivationMode = WorkerKitExecutionMode;
/**
 * Kit family taxonomy. Open-ended union so new families can be
 * introduced without an SDK release.
 *
 *   - `studio`   — AI generation studio, often backed by a local fork
 *   - `workflow` — multi-step pipeline operator across tools or APIs
 *   - `operator` — domain-vertical specialist
 *   - `ops`      — infrastructure / toolchain operator
 */
export type WorkerKitFamily = "studio" | "workflow" | "operator" | "ops" | (string & {});
/** Standard family literals, mirrored from the CLI's `KIT_FAMILIES`. */
export declare const WORKER_KIT_FAMILIES: ReadonlyArray<"studio" | "workflow" | "operator" | "ops">;
export type WorkerKitVisibility = "public-open-source" | "public" | "private" | "internal" | (string & {});
/**
 * Compatibility floor for the kit. v2-only.
 */
export interface WorkerKitCompatibility {
    cliMinVersion?: string;
    platformMinVersion?: string;
    requiredCapabilities?: string[];
}
/**
 * Install metadata for kits that install rather than just export. v2-only.
 */
export interface WorkerKitInstallMetadata {
    installable: boolean;
    scopeDefault?: "user" | "project";
    postInstallHint?: string;
}
/**
 * UI surface registration for app kits. v2-only.
 *
 * App kits (`type: "ui"`) typically declare:
 *   - `icon`     — a glyph or asset reference for surface menus
 *   - `color`    — an accent color used by the discovery hub
 *   - `category` — a category bucket for surface listings
 *   - `tags[]`   — searchable tags
 *
 * Worker kits without an app surface MAY also set this block to
 * influence how `growthub kit` and `growthub discover` render them.
 */
export interface WorkerKitUIMetadata {
    icon?: string;
    color?: string;
    category?: string;
    tags?: string[];
}
/**
 * Provenance metadata. v2-only (v1 had `kit.sourceRepo` only).
 */
export interface WorkerKitProvenance {
    sourceRepo?: string;
    /** ISO-8601 UTC timestamp the kit was frozen at. */
    frozenAt?: string;
    frozenBy?: string;
    checksum?: string;
}
/**
 * Identity block. v1 has the bare fields; v2 adds `type` (capability
 * taxonomy) and `family`.
 */
export interface WorkerKitIdentityV1 {
    id: string;
    version: string;
    name: string;
    description: string;
    visibility?: WorkerKitVisibility;
    sourceRepo?: string;
}
export interface WorkerKitIdentityV2 extends WorkerKitIdentityV1 {
    /** Capability taxonomy (v2 addition; `"ui"` represents app kits). */
    type: WorkerKitCapabilityType;
    family?: WorkerKitFamily;
}
export interface WorkerKitEntrypoint {
    workerId: string;
    /** Path to the agent contract file (typically `workers/<id>/CLAUDE.md`). */
    path: string;
}
export interface WorkerKitBundleRef {
    id: string;
    version: string;
    /** Path (relative to kit root) of the bundle JSON. */
    path: string;
}
export type WorkerKitOutputType = "working-directory" | (string & {});
export interface WorkerKitOutputStandard {
    type: WorkerKitOutputType;
    description?: string;
    /** Paths the validator requires to exist after a fresh export. */
    requiredPaths: string[];
}
/**
 * Worker Kit manifest — schema v1.
 *
 * Backwards-compatible parsing target. New kits should declare
 * `schemaVersion: 2`.
 */
export interface WorkerKitManifestV1 {
    schemaVersion: 1;
    kit: WorkerKitIdentityV1;
    entrypoint: WorkerKitEntrypoint;
    workerIds: string[];
    agentContractPath: string;
    brandTemplatePath: string;
    publicExampleBrandPaths?: string[];
    frozenAssetPaths: string[];
    outputStandard: WorkerKitOutputStandard;
    bundles: WorkerKitBundleRef[];
}
/**
 * Worker Kit manifest — schema v2.
 *
 * Capability packaging schema. Extends v1 with `type` taxonomy
 * (including `"ui"` for app kits), execution modes, compatibility,
 * install / UI / provenance metadata. This is the current shape.
 */
export interface WorkerKitManifestV2 {
    schemaVersion: 2;
    kit: WorkerKitIdentityV2;
    entrypoint: WorkerKitEntrypoint;
    workerIds: string[];
    agentContractPath: string;
    brandTemplatePath: string;
    publicExampleBrandPaths?: string[];
    frozenAssetPaths: string[];
    outputStandard: WorkerKitOutputStandard;
    bundles: WorkerKitBundleRef[];
    executionMode: WorkerKitExecutionMode;
    activationModes: WorkerKitActivationMode[];
    compatibility: WorkerKitCompatibility;
    install?: WorkerKitInstallMetadata;
    ui?: WorkerKitUIMetadata;
    provenance?: WorkerKitProvenance;
}
/**
 * Any supported Worker Kit manifest version. Discriminate on
 * `schemaVersion` (or use `isWorkerKitManifestV2` / `V1`).
 */
export type WorkerKitManifest = WorkerKitManifestV1 | WorkerKitManifestV2;
export interface WorkerKitBundleIdentity {
    id: string;
    version: string;
    kitId: string;
    workerId: string;
}
export interface WorkerKitBundleExportSpec {
    folderName: string;
    zipFileName: string;
}
export interface WorkerKitBundleManifestV1 {
    schemaVersion: 1;
    bundle: WorkerKitBundleIdentity;
    briefType: string;
    publicExampleBrandPaths?: string[];
    requiredFrozenAssets: string[];
    optionalPresets: string[];
    export: WorkerKitBundleExportSpec;
}
export interface WorkerKitBundleManifestV2 {
    schemaVersion: 2;
    bundle: WorkerKitBundleIdentity;
    briefType: string;
    publicExampleBrandPaths?: string[];
    requiredFrozenAssets: string[];
    optionalPresets: string[];
    export: WorkerKitBundleExportSpec;
    activationModes?: WorkerKitActivationMode[];
}
export type WorkerKitBundleManifest = WorkerKitBundleManifestV1 | WorkerKitBundleManifestV2;
export declare function isWorkerKitManifestV2(manifest: WorkerKitManifest): manifest is WorkerKitManifestV2;
export declare function isWorkerKitManifestV1(manifest: WorkerKitManifest): manifest is WorkerKitManifestV1;
export declare function isWorkerKitBundleManifestV2(manifest: WorkerKitBundleManifest): manifest is WorkerKitBundleManifestV2;
export declare function isWorkerKitBundleManifestV1(manifest: WorkerKitBundleManifest): manifest is WorkerKitBundleManifestV1;
/**
 * Returns `true` when the kit is an app kit (`type: "ui"`). v1
 * manifests do not carry the `type` field and therefore cannot be app
 * kits.
 */
export declare function isAppKit(manifest: WorkerKitManifest): boolean;
/** Currently supported schema versions. */
export declare const WORKER_KIT_SUPPORTED_SCHEMA_VERSIONS: readonly [1, 2];
/** Latest schema version (every kit on `main` declares this). */
export declare const WORKER_KIT_LATEST_SCHEMA_VERSION: 2;
//# sourceMappingURL=worker-kits.d.ts.map