/**
 * @growthub/api-contract — Node input / output schemas (CMS SDK v1)
 *
 * Schema-driven node contract.
 *
 * This is the one machine-readable surface every Growthub consumer
 * (CLI, hosted UI, harnesses, local intelligence, third-party
 * adapters) is expected to render, validate, and reason over.
 *
 * Today the CLI derives forms from {@link CapabilityExecutionTokens}
 * `input_template` and `output_mapping`. This file freezes the richer,
 * explicit form of that contract so surfaces can share a single form
 * renderer and a single validator.
 *
 * Rules:
 *   - Additive only.
 *   - Every field union member MUST carry a `fieldType` discriminator.
 *   - No provider-specific fields. Provider routing is in `./providers.ts`.
 */
export {};
//# sourceMappingURL=schemas.js.map