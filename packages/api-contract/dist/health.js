/**
 * @growthub/api-contract — Kit Health (CMS SDK v1)
 *
 * Public, type-only surface for kit health reports and maturity scoring.
 *
 * Lets the CLI, agents, and hosted surfaces agree on what "ready" means
 * for a Growthub worker kit without each surface reinventing its own
 * readiness format.
 *
 * The reference implementations are
 * `cli/assets/worker-kits/growthub-creative-video-pipeline-v1/helpers/check-pipeline-health.sh`
 * and `scripts/score-worker-kits.mjs`. Both already emit JSON shapes
 * compatible with this surface.
 *
 * Rules:
 *   - Additive only. Existing health helpers (e.g. `setup/verify-env.mjs`,
 *     `helpers/check-generative-adapter.sh`) stay valid; this surface
 *     standardizes their report shape.
 *   - No runtime behavior. The SDK describes; the kit and CLI compute.
 *   - Health does not decide deployment policy. Consumers (e.g. CI
 *     gates, hosted activation) make that decision from the report.
 */
// ---------------------------------------------------------------------------
// Version sentinel
// ---------------------------------------------------------------------------
/**
 * Sentinel for `KitHealthReport.version`. Additive changes keep this
 * literal `1`.
 */
export const KIT_HEALTH_REPORT_VERSION = 1;
//# sourceMappingURL=health.js.map