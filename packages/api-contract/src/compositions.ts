/**
 * @growthub/api-contract — Compositions (CMS SDK v1, composability primitives)
 *
 * A Composition is the top-level assembly unit for a Growthub workspace:
 * it groups capabilities, pipelines, artifacts, and widgets into a single
 * declarative manifest that harnesses and the hosted UI can render.
 *
 * Rules:
 *   - Additive, type-only. No runtime behavior is implied.
 *   - Compositions reference existing primitives by id/slug; they never
 *     duplicate their definitions.
 *   - Compositions ship inside a {@link CapabilityManifestEnvelope} under
 *     the optional `compositions` field, preserving strict backward
 *     compatibility with envelope v1.
 */
import type { CapabilityManifest } from "./manifests.js";
import type { WidgetDefinition } from "./widgets.js";

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

/**
 * Canvas layout for a composition.
 *
 * The canvas is a 12-column grid by default. Harnesses MAY choose a
 * different column count at render time but SHOULD respect widget
 * layouts deterministically.
 */
export interface CanvasLayout {
  /** Number of columns in the grid. Defaults to 12 when unspecified. */
  columns?: number;
  /** Vertical row height in CSS px (consumer-advisory). */
  rowHeight?: number;
  /** Optional container background token (consumer-advisory). */
  background?: string;
  /** Optional dense-pack flag for the grid solver. */
  dense?: boolean;
}

// ---------------------------------------------------------------------------
// Pipeline reference
// ---------------------------------------------------------------------------

/**
 * Reusable reference to a pipeline/workflow inside a composition.
 *
 * A pipeline reference names a saved workflow by id (hosted) or by a
 * local definition path; the composition never owns the pipeline
 * execution plan.
 */
export interface PipelineReference {
  /** Stable reference id, unique within the composition. */
  id: string;
  /** Hosted saved-workflow id, if the pipeline lives on the hosted runtime. */
  hostedWorkflowId?: string;
  /** Local pipeline definition path (relative to the composition file). */
  localPath?: string;
  /** Human-facing label. */
  label?: string;
  /** Optional tags for filtering. */
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Artifact reference
// ---------------------------------------------------------------------------

/**
 * Reusable reference to a known artifact inside a composition.
 */
export interface ArtifactReference {
  /** Stable reference id, unique within the composition. */
  id: string;
  /** Artifact id produced by a prior pipeline execution. */
  artifactId: string;
  /** Optional human-facing label. */
  label?: string;
  /** Optional tags for filtering. */
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/**
 * Top-level composition manifest.
 *
 * A composition is the declarative primitive users (and agents) edit
 * directly inside a `growthub.config.ts`. Harnesses, the hosted UI, and
 * third-party adapters render the same composition identically.
 */
export interface Composition {
  /** Stable composition id, unique within a kit. */
  id: string;
  /** Human-facing composition title. */
  title: string;
  /** Optional subtitle / descriptive caption. */
  subtitle?: string;
  /** Canvas layout for the composition. */
  canvas?: CanvasLayout;
  /** Widgets placed on the canvas. */
  widgets: WidgetDefinition[];
  /** Pipelines referenced by widgets on the canvas. */
  pipelines?: PipelineReference[];
  /** Artifacts referenced by widgets on the canvas. */
  artifacts?: ArtifactReference[];
  /** Capability slugs this composition depends on. */
  capabilities?: string[];
  /** Optional tags for filtering. */
  tags?: string[];
  /** Optional free-form metadata bag. */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Type-narrowing helper for declaring compositions inside a
 * `growthub.config.ts`. Runtime identity function.
 */
export function defineComposition(composition: Composition): Composition {
  return composition;
}

/**
 * Type-narrowing helper for declaring pipeline references.
 * Runtime identity function.
 */
export function definePipeline(pipeline: PipelineReference): PipelineReference {
  return pipeline;
}

/**
 * Type-narrowing helper for declaring artifact references.
 * Runtime identity function.
 */
export function defineArtifact(artifact: ArtifactReference): ArtifactReference {
  return artifact;
}

/**
 * Type-narrowing helper for declaring per-capability manifest entries.
 *
 * This is a thin convenience around {@link CapabilityManifest} so authors
 * can colocate a local capability definition inside a composition file.
 * Runtime identity function.
 */
export function defineCapability(
  capability: CapabilityManifest,
): CapabilityManifest {
  return capability;
}
