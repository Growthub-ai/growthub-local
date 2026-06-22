/**
 * @growthub/api-contract — Workspaces (CMS SDK v1)
 *
 * Public, type-only surface for the Workspace Dependency Manifest v1.
 *
 * A governed Growthub workspace may delegate work to external repos,
 * forks, or app surfaces. The Workspace Dependency Manifest makes those
 * dependencies explicit so agents and the CLI can verify them without
 * scanning shell scripts or running clones.
 *
 * The workspace starter is the canonical implementation. Dependency manifests
 * stay additive and are only used when an exported workspace declares external
 * repos, forks, services, or app surfaces.
 *
 * Rules:
 *   - Additive only. Kits without `workspace.dependencies.json` stay valid.
 *   - No runtime behavior. The SDK describes; it does not install.
 *   - The env var is the only contract for locating the dependency at
 *     runtime. Hardcoded absolute paths are not part of this surface.
 */
// ---------------------------------------------------------------------------
// Version sentinel
// ---------------------------------------------------------------------------
/**
 * Sentinel for `WorkspaceDependencyManifest.version`. Additive changes
 * keep this literal `1`.
 */
export const WORKSPACE_DEPENDENCY_MANIFEST_VERSION = 1;
//# sourceMappingURL=workspaces.js.map