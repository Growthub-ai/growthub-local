/**
 * @growthub/api-contract — Adapters (CMS SDK v1)
 *
 * Public, type-only surface for the generic adapter contract.
 *
 * The adapter rule (frozen in `docs/ADAPTER_CONTRACTS_V1.md`) is:
 *
 *   adapter = env-or-config selector
 *           + provider-specific implementation
 *           + normalized output shape
 *
 * Domain code (skills, helpers, app routes, pipeline stages) consumes
 * the normalized output. It MUST NOT branch on provider internals.
 *
 * This module describes adapter boundaries. It does not call providers.
 *
 * Rules:
 *   - Additive only. Existing adapter docs and env names stay valid.
 *   - No runtime behavior. The SDK describes the boundary; the kit owns
 *     the implementation behind it.
 *   - SDK types are preferred where they exist (e.g.
 *     `DynamicRegistryPipeline`, `ExecutionEvent` from `./execution`
 *     and `./events`).
 *   - BYOK is first-class. A `byo-api-key` mode is never a second-tier
 *     code path.
 */
// ---------------------------------------------------------------------------
// Version sentinel
// ---------------------------------------------------------------------------
/**
 * Sentinel for adapter-contract consumers. Additive changes keep this
 * literal `1`.
 */
export const ADAPTER_CONTRACT_VERSION = 1;
//# sourceMappingURL=adapters.js.map