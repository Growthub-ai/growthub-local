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
/** Standard family literals, mirrored from the CLI's `KIT_FAMILIES`. */
export const WORKER_KIT_FAMILIES = ["studio", "workflow", "operator", "ops"];
// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------
export function isWorkerKitManifestV2(manifest) {
    return manifest.schemaVersion === 2;
}
export function isWorkerKitManifestV1(manifest) {
    return manifest.schemaVersion === 1;
}
export function isWorkerKitBundleManifestV2(manifest) {
    return manifest.schemaVersion === 2;
}
export function isWorkerKitBundleManifestV1(manifest) {
    return manifest.schemaVersion === 1;
}
/**
 * Returns `true` when the kit is an app kit (`type: "ui"`). v1
 * manifests do not carry the `type` field and therefore cannot be app
 * kits.
 */
export function isAppKit(manifest) {
    return isWorkerKitManifestV2(manifest) && manifest.kit.type === "ui";
}
// ---------------------------------------------------------------------------
// Version sentinels
// ---------------------------------------------------------------------------
/** Currently supported schema versions. */
export const WORKER_KIT_SUPPORTED_SCHEMA_VERSIONS = [1, 2];
/** Latest schema version (every kit on `main` declares this). */
export const WORKER_KIT_LATEST_SCHEMA_VERSION = 2;
//# sourceMappingURL=worker-kits.js.map