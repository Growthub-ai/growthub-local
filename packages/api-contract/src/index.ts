/**
 * @growthub/api-contract — CMS SDK v1 public contract surface.
 *
 * One stable contract spanning capabilities, manifests, node schemas,
 * provider assembly, execution payloads, and streaming events.
 *
 * Phase 1: frozen types only — no runtime behavior is shipped here.
 * The CLI, hosted surfaces, and future third-party adapters import from
 * this package instead of reaching into `cli/src/runtime/*` internals.
 */

export * from "./capabilities.js";
export * from "./execution.js";
export * from "./providers.js";
export * from "./profile.js";
export * from "./events.js";
export * from "./schemas.js";
export * from "./manifests.js";
