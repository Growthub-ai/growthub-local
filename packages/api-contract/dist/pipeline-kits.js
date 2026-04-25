/**
 * @growthub/api-contract — Pipeline Kits (CMS SDK v1)
 *
 * Public, type-only surface for the Pipeline Kit Contract v1.
 *
 * A Pipeline Kit is any Growthub worker kit whose `kit.json` payload
 * coordinates two or more sequential stages, each of which has its own
 * sub-skill, consumes a typed input artifact, produces a typed output
 * artifact, and records its boundary in `.growthub-fork/project.md` and
 * `trace.jsonl`.
 *
 * The reference implementation is `growthub-creative-video-pipeline-v1`,
 * which ships `pipeline.manifest.json` matching this shape.
 *
 * The convention is documented in
 * `docs/PIPELINE_KIT_CONTRACT_V1.md`. This module makes the shape
 * machine-readable so CLI, agents, and hosted surfaces can inspect
 * pipeline topology without parsing prose.
 *
 * Rules:
 *   - Additive only. Existing kits without `pipeline.manifest.json` stay
 *     valid.
 *   - No runtime behavior. Consumers parse JSON into these shapes.
 *   - SDK describes what must be true, not how it is done. No fields
 *     reference provider SDKs, model IDs, or kit-specific implementation
 *     details.
 */
// ---------------------------------------------------------------------------
// Version sentinel
// ---------------------------------------------------------------------------
/**
 * Sentinel for `PipelineKitManifest.version`. Surfaces may read this to
 * confirm they are talking to the v1 manifest shape. Additive changes
 * keep this literal `1`.
 */
export const PIPELINE_KIT_MANIFEST_VERSION = 1;
//# sourceMappingURL=pipeline-kits.js.map