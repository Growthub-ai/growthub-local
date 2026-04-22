/**
 * @growthub/api-contract — Capabilities (CMS SDK v1)
 *
 * Frozen public surface for the Growthub capability registry.
 *
 * These types mirror the already-shipped growthub-local CLI capability
 * registry contract in `cli/src/runtime/cms-capability-registry/types.ts`.
 * They are the *public, stable* version of that contract.
 *
 * Rules:
 *   - Additive only.
 *   - No runtime behavior.
 *   - Hosted records remain the source of truth; locally-derived /
 *     locally-extended records are represented with explicit provenance.
 */
export const CAPABILITY_FAMILIES = [
    "video",
    "image",
    "slides",
    "text",
    "data",
    "ops",
    "research",
    "vision",
];
//# sourceMappingURL=capabilities.js.map