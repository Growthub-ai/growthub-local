/**
 * @growthub/api-contract
 *
 * Growthub API v1 — canonical typed contract shared by the CLI, hosted
 * server, and external adapter authors.
 *
 * Entry points:
 *   - `@growthub/api-contract`               — barrel export
 *   - `@growthub/api-contract/capabilities`  — CMS capability primitives
 *   - `@growthub/api-contract/pipelines`     — pipeline DAG types
 *   - `@growthub/api-contract/execute`       — hosted execution bridge
 *   - `@growthub/api-contract/provider`      — provider adapter contract
 *   - `@growthub/api-contract/manifest`      — capability manifest envelope
 *   - `@growthub/api-contract/metrics`       — metrics, policy, fleet types
 *   - `@growthub/api-contract/routes`        — canonical v1 route names
 */

export * from "./capabilities.js";
export * from "./pipelines.js";
export * from "./execute.js";
export * from "./provider.js";
export * from "./manifest.js";
export * from "./metrics.js";
export * from "./routes.js";
