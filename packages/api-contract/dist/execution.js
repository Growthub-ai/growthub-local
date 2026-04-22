/**
 * @growthub/api-contract — Execution (CMS SDK v1)
 *
 * Frozen public surface for the hosted execution bridge.
 *
 * These types mirror the already-shipped growthub-local hosted execution
 * client contract in `cli/src/runtime/hosted-execution-client/types.ts`.
 * They are the *public, stable* version of that contract.
 *
 * Rules:
 *   - Execution payloads are transport-neutral.
 *   - Provider readiness is NOT part of execution results — see
 *     `./providers.ts` for the provider assembly contract.
 *   - Streaming events are NOT part of these payloads — see
 *     `./events.ts` for the canonical event union.
 */
export {};
//# sourceMappingURL=execution.js.map