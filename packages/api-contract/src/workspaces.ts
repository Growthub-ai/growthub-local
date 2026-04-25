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
 * The reference implementation is
 * `growthub-creative-video-pipeline-v1`, whose Stage 3 delegates to the
 * external `video-use` fork via `VIDEO_USE_HOME` and an `edit-plan.md`
 * handoff artifact.
 *
 * The convention is documented in
 * `docs/PIPELINE_KIT_CONTRACT_V1.md` and referenced from
 * `cli/assets/worker-kits/<kit>/workspace.dependencies.json`.
 *
 * Rules:
 *   - Additive only. Kits without `workspace.dependencies.json` stay valid.
 *   - No runtime behavior. The SDK describes; it does not install.
 *   - The env var is the only contract for locating the dependency at
 *     runtime. Hardcoded absolute paths are not part of this surface.
 */

// ---------------------------------------------------------------------------
// Workspace dependency kind
// ---------------------------------------------------------------------------

/**
 * What kind of external thing the dependency is. Open-ended string union
 * so kits can introduce new kinds without an SDK release.
 */
export type WorkspaceDependencyKind =
  | "git-fork"
  | "git-repo"
  | "npm-package"
  | "system-binary"
  | "external-service"
  | (string & {});

// ---------------------------------------------------------------------------
// Workspace surface reference — apps + studios inside the kit
// ---------------------------------------------------------------------------

/**
 * A surface inside the kit (e.g. a Vercel-deployable Next.js app, a Vite
 * studio shell). Surfaces are NOT external dependencies — they live
 * inside the exported workspace — but they are declared here so a single
 * inspection path can answer "what does this workspace contain?".
 */
export interface WorkspaceSurfaceRef {
  /** Stable surface identifier (e.g. `studio`, `vercel-app`). */
  id: string;
  /** Path under the kit root (e.g. `studio/`, `apps/creative-video-pipeline/`). */
  path: string;
  /** Free-form kind descriptor (e.g. `vite`, `nextjs`, `cli`). */
  kind?: string;
  /** One-line description of the surface's purpose. */
  description?: string;
}

// ---------------------------------------------------------------------------
// Workspace output topology — the writable root the workspace produces
// ---------------------------------------------------------------------------

/**
 * The output root + bucket layout the workspace writes to. Mirrors
 * `PipelineOutputTopology` for kits that don't ship a pipeline manifest
 * but still want to declare their output disk shape.
 */
export interface WorkspaceOutputTopology {
  /** Root, typically `output/<client>/<project>`. */
  root: string;
  /** Bucket names directly under the root. */
  buckets?: string[];
}

// ---------------------------------------------------------------------------
// Workspace dependency reference — one external repo / tool / service
// ---------------------------------------------------------------------------

/**
 * One external dependency the workspace delegates to.
 */
export interface WorkspaceDependencyRef {
  /** Stable dependency identifier (kebab-case). */
  id: string;
  /** What kind of dependency it is. */
  kind: WorkspaceDependencyKind;
  /** Env var name pointing at the dependency at runtime (e.g. `VIDEO_USE_HOME`). */
  env: string;
  /** Optional setup script path (e.g. `setup/clone-fork.sh`). */
  setup?: string;
  /** Optional install script path (e.g. `setup/install-skill.sh`). */
  install?: string;
  /** Optional health-check script path (e.g. `setup/verify-env.mjs`). */
  health?: string;
  /** Pipeline stage ids that depend on this. */
  usedByStages?: string[];
  /**
   * The artifact the upstream stage hands off to this dependency
   * (the dependency's input boundary).
   */
  interfaceArtifact?: string;
  /**
   * The artifact this dependency produces and writes back to the workspace
   * (the dependency's output boundary).
   */
  handoffArtifact?: string;
  /** Free-form human description. */
  description?: string;
}

// ---------------------------------------------------------------------------
// Workspace dependency manifest — the canonical kit-local file
// ---------------------------------------------------------------------------

/**
 * Convention envelope mirroring `PipelineConventionEnvelope`.
 */
export interface WorkspaceConventionEnvelope {
  spec?: string;
  version?: number;
  interpretedBy?: string;
  runtimeEnforcement?: "none" | "warn" | "error";
}

/**
 * Top-level workspace dependency manifest. Lives at
 * `cli/assets/worker-kits/<kit>/workspace.dependencies.json`.
 */
export interface WorkspaceDependencyManifest {
  /** Manifest schema version. Matches `WORKSPACE_DEPENDENCY_MANIFEST_VERSION`. */
  version: number;
  /** Kit identifier (matches `kit.json#kit.id`). */
  kitId: string;
  /** External dependencies. */
  dependencies: WorkspaceDependencyRef[];
  /** Optional kit-internal surfaces (apps, studios). */
  surfaces?: WorkspaceSurfaceRef[];
  /** Optional output topology declaration. */
  outputTopology?: WorkspaceOutputTopology;
  /** Convention envelope. */
  convention?: WorkspaceConventionEnvelope;
}

// ---------------------------------------------------------------------------
// Version sentinel
// ---------------------------------------------------------------------------

/**
 * Sentinel for `WorkspaceDependencyManifest.version`. Additive changes
 * keep this literal `1`.
 */
export const WORKSPACE_DEPENDENCY_MANIFEST_VERSION = 1 as const;
