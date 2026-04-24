/**
 * @growthub/api-contract — public entry point (CMS SDK v1)
 *
 * One contract, many surfaces.
 *
 * This package freezes the existing growthub-local CLI truth into a
 * single stable public surface for capabilities, manifests, provider
 * assembly, execution payloads, streaming events, and hosted profile.
 *
 * Phase 1 of the CMS SDK v1 plan is intentionally type-only: CLI
 * imports can migrate onto these contracts without any runtime
 * behavior change.
 *
 * See individual modules for narrow imports:
 *
 *   - `@growthub/api-contract/capabilities`
 *   - `@growthub/api-contract/execution`
 *   - `@growthub/api-contract/providers`
 *   - `@growthub/api-contract/profile`
 *   - `@growthub/api-contract/events`
 *   - `@growthub/api-contract/manifests`
 *   - `@growthub/api-contract/schemas`
 *   - `@growthub/api-contract/widgets`
 *   - `@growthub/api-contract/compositions`
 */
export { CAPABILITY_FAMILIES } from "./capabilities.js";
export { isExecutionEvent } from "./events.js";
export { defineWidget } from "./widgets.js";
export { defineComposition, definePipeline, defineArtifact, defineCapability, } from "./compositions.js";
export { SKILL_MANIFEST_VERSION } from "./skills.js";
// Version sentinel — surfaces may read this to confirm they are talking
// to the v1 contract surface. Additive changes keep this literal `1`.
export const API_CONTRACT_VERSION = 1;
//# sourceMappingURL=index.js.map