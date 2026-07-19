/**
 * @growthub/api-contract — Governed inference gateway (type-only)
 *
 * Additive wire contracts for local/OpenAI-compatible inference. These types
 * describe the evidence a gateway must return for model identity, LoRA
 * selection, caching, schema-forced generation, tool-call governance, OTLP
 * tracing, and prefill/decode routing. They do not claim that a particular
 * runtime implements those capabilities.
 *
 * Evidence states are explicit and required on {@link VerificationReceipt}.
 * A runtime that cannot prove a capability reports `unavailable`, `failed`,
 * `unverified`, or `not_requested`; it must not silently omit the evidence.
 * Secret values do not belong in these structures. Large schemas, tool
 * payloads, and traces may be represented by hashes plus governed source-record
 * references instead of being copied into a workspace row.
 */
export {};
//# sourceMappingURL=inference.js.map