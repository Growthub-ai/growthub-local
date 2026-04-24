// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Type-narrowing helper for declaring compositions inside a
 * `growthub.config.ts`. Runtime identity function.
 */
export function defineComposition(composition) {
    return composition;
}
/**
 * Type-narrowing helper for declaring pipeline references.
 * Runtime identity function.
 */
export function definePipeline(pipeline) {
    return pipeline;
}
/**
 * Type-narrowing helper for declaring artifact references.
 * Runtime identity function.
 */
export function defineArtifact(artifact) {
    return artifact;
}
/**
 * Type-narrowing helper for declaring per-capability manifest entries.
 *
 * This is a thin convenience around {@link CapabilityManifest} so authors
 * can colocate a local capability definition inside a composition file.
 * Runtime identity function.
 */
export function defineCapability(capability) {
    return capability;
}
//# sourceMappingURL=compositions.js.map