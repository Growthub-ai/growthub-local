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
export type InferenceJsonPrimitive = string | number | boolean | null;
export type InferenceJsonValue = InferenceJsonPrimitive | InferenceJsonValue[] | {
    [key: string]: InferenceJsonValue;
};
export type InferenceJsonObject = {
    [key: string]: InferenceJsonValue;
};
/** JSON Schema stays open-ended so newer drafts remain wire-compatible. */
export type InferenceJsonSchema = InferenceJsonObject;
/** Secret-safe pointer to immutable evidence or a model artifact. */
export interface InferenceArtifactRef {
    id: string;
    /** SHA-256 of the referenced bytes, lowercase hex when known. */
    sha256?: string;
    /** Governed source-record/artifact URI; never an embedded credential. */
    uri?: string;
    version?: string;
    media_type?: string;
}
export interface BaseModelRef {
    model_id: string;
    canonical_model_id?: string;
    format?: "gguf" | "safetensors" | (string & {});
    artifact_ref?: InferenceArtifactRef;
    /** Expected GGUF/model artifact hash supplied by the caller. */
    base_model_sha256?: string;
}
/** The transport/runtime adapter selected to service an inference request. */
export interface InferenceAdapterRef {
    adapter_id: string;
    kind: "llama.cpp-server" | "ollama" | "lmstudio" | "vllm" | "openai-compatible" | (string & {});
    version?: string;
    /** Secret-safe registry reference, not a raw authenticated endpoint. */
    endpoint_ref?: string;
    instance_id?: string;
    alias?: string;
}
/** A QLoRA/LoRA artifact that may be loaded with the base model. */
export interface LoraAdapterRef {
    lora_id: string;
    adapter_ref: InferenceArtifactRef;
    /** Expected adapter hash; the gateway still resolves and verifies it. */
    adapter_sha256?: string;
    /** Per-request scale applied to a preloaded llama-server adapter. */
    scale?: number;
    base_model_id?: string;
    alias?: string;
}
export type ModelIdentityVerificationStatus = "verified" | "unverified" | "mismatch" | "unavailable";
export interface ModelIdentityEvidence {
    status: ModelIdentityVerificationStatus;
    base_model_ref: BaseModelRef | null;
    adapter_ref: InferenceAdapterRef | null;
    /** Null is an explicit base-model-only execution. */
    lora_ref: LoraAdapterRef | null;
    /** Resolved hashes, not merely caller-supplied expectations. */
    base_model_sha256: string | null;
    adapter_sha256: string | null;
    /** Alias actually served by the selected process, if observable. */
    served_alias: string | null;
    model_tag: string | null;
    /** Hash binding the resolved model identity and enforced schema. */
    model_tag_sha256: string | null;
    reason?: string;
}
export interface InferenceSchemaRef {
    schema_id: string;
    schema_version: string;
    artifact_ref?: InferenceArtifactRef;
}
/** Versioned JSON Schema contract; every wrapper field is hash-bound. */
export interface InferenceResponseSchemaContract {
    name: string;
    version: string;
    strict?: boolean;
    schema: InferenceJsonSchema;
    schema_ref?: InferenceSchemaRef;
}
export type SchemaEnforcementStatus = "enforced" | "not_requested" | "rejected" | "failed" | "unavailable";
export type SchemaOutputValidationStatus = "valid" | "invalid" | "not_run" | "unavailable";
export interface SchemaEnforcementEvidence {
    status: SchemaEnforcementStatus;
    schema_ref: InferenceSchemaRef | null;
    response_schema_hash: string | null;
    /** SHA-256 of the canonical grammar/JSON Schema used for generation. */
    grammar_hash: string | null;
    grammar_kind: "json-schema" | "gbnf" | "none" | (string & {});
    enforced_during_generation: boolean;
    model_tag_hash_bound: boolean;
    output_validation_status: SchemaOutputValidationStatus;
    reason?: string;
}
export type InferenceCacheStatus = "HIT" | "MISS" | "COLD_START" | "BYPASS" | "ERROR" | "UNAVAILABLE";
export type InferenceCacheKind = "gateway-exact" | "gateway-semantic" | "llama-prefix" | "none" | (string & {});
export interface InferenceCachePolicy {
    mode?: "use" | "refresh" | "bypass";
    semantic?: boolean;
    similarity_threshold?: number;
    native_prefix_cache?: boolean;
}
export interface InferenceCacheEvidence {
    cache_status: InferenceCacheStatus;
    cache_kind: InferenceCacheKind;
    /** Value exposed as the synthetic `X-Cache-Key`, when one was emitted. */
    cache_key: string | null;
    cache_key_sha256: string | null;
    /** Hash of the stable system/RAG prefix used for instance affinity. */
    prefix_hash?: string | null;
    cache_ttl: number | null;
    semantic_similarity?: number;
    semantic_cache_requested?: boolean;
    semantic_cache_status?: "hit" | "miss" | "unavailable" | "not_requested";
    semantic_cache_reason?: string;
    native_prefix_cache_enabled: boolean;
    warm_instance_selected: boolean;
    /** Runtime cache backend selected after governed marketplace/env resolution. */
    remote_cache_backend?: "memory" | "upstash-redis-rest" | (string & {});
    /** Whether the remote backend was disabled, ready, written, failed, or supplied the hit. */
    remote_cache_status?: "disabled" | "ready" | "stored" | "failed" | "hit" | (string & {});
    /** Credential family only; never a URL, token, or secret value. */
    remote_cache_credential_source?: "growthub" | "upstash" | "vercel-marketplace-upstash" | null | (string & {});
    /** Hash of the server-owned deployment/tenant cache namespace. */
    cache_scope_sha256?: string | null;
    remote_cache_reason?: string;
    /** `CACHE_BYPASS_POISONED` marks a poisoned-neighborhood bypass. */
    bypass_reason?: string;
    /** Signed-envelope verification state for the entry actually consulted. */
    envelope_signature_state?: "verified" | "invalid" | "unsigned" | "not_checked";
    /** Credential-binding cache version active for this lookup/store. */
    cache_version?: string | null;
    /** Correction receipt that poisoned the bypassed entry, when applicable. */
    poisoned_by?: string | null;
    /** Identity-scoped semantic bucket (hash pair) for feedback poisoning. */
    semantic_bucket?: string | null;
}
/** Position of this receipt in the workflow receipt DAG. */
export type InferenceSpanKind = "ROOT" | "CHILD_TOOL" | "CHILD_WORKFLOW";
export type ChildReceiptStatus = "COMPLETED" | "FAILED" | "MISSING";
/**
 * One Merkle edge from a parent receipt to a child receipt. The parent stores
 * the SHA-256 of the child's full canonical receipt JSON, so the parent's own
 * receipt hash transitively covers every descendant
 * (`parent_hash -> child_hash -> grandchild_hash`).
 */
export interface ChildReceiptLink {
    child_receipt_id: string;
    /** SHA-256 of the child's canonical receipt JSON; null when MISSING. */
    child_receipt_sha256: string | null;
    child_status: ChildReceiptStatus;
    /** Tool call that produced the child invocation, when applicable. */
    tool_call_id?: string;
    /** Governed workflow reference the child executed, when applicable. */
    workflow_ref?: string;
    /** Exact child failure; a failed child is recorded, never orphaned. */
    error?: {
        code: string;
        message: string;
    };
}
export interface ReceiptLineageEvidence {
    span_kind: InferenceSpanKind;
    parent_receipt_id: string | null;
    children: ChildReceiptLink[];
    /**
     * Merkle aggregation over the ordered child receipt hashes and statuses.
     * Null for a leaf receipt with no declared children.
     */
    lineage_sha256: string | null;
    /** `incomplete` means a declared child never ingested a receipt. */
    status: "leaf" | "complete" | "incomplete";
    reason?: string;
}
export type CacheInvalidationReason = "MODEL_UPDATE" | "SCHEMA_CHANGE" | "FEEDBACK_CORRECTION" | "SECURITY";
/**
 * Identity metadata bound to every cache entry. The runtime signs the entry
 * body plus this envelope with a workspace-scoped HMAC key; a signature or
 * `cache_version` mismatch on lookup is treated as a MISS, never served.
 */
export interface CacheEnvelope {
    receipt_id: string;
    request_sha256: string;
    model_sha256: string;
    adapter_sha256: string;
    schema_hash: string;
    workflow_version: string;
    /**
     * Derived from the workspace's cache credential binding (Redis add-on URL,
     * token hash, namespace). Credential rotation changes this value, so stale
     * signatures fail closed and the cache rebuilds safely.
     */
    cache_version: string;
    /** True when the stored value is the redacted response; raw is never cached. */
    redacted: boolean;
    redaction_event_count: number;
    created_at: string;
    ttl_seconds: number;
}
export interface SignedCacheEnvelope {
    envelope: CacheEnvelope;
    /** HMAC-SHA256 over the canonical entry + envelope JSON. */
    signature: string;
    /** Non-secret key fingerprint; never the key itself. */
    key_id: string;
    algorithm: "hmac-sha256";
}
export interface CacheInvalidationScope {
    exact_key?: string;
    semantic_cluster_id?: string;
    model_sha256?: string;
    schema_hash?: string;
    workflow_id?: string;
}
export interface CacheInvalidationRequest {
    reason: CacheInvalidationReason;
    scope: CacheInvalidationScope;
    /** Receipt of the correction that poisoned the entry, closing the loop. */
    correction_receipt_id?: string;
    /** Hash of the corrected ground truth; raw corrections stay out of receipts. */
    corrected_text_sha256?: string;
}
export interface CacheInvalidationResult {
    ok: boolean;
    reason: CacheInvalidationReason;
    poisoned_exact_keys: string[];
    poison_markers_added: number;
    epochs_bumped: string[];
}
export type RoutingDecisionReason = "cost_capability" | "quality_fallback" | "budget_exhausted" | "default";
export type RoutingQualityStatus = "MET" | "QUALITY_UNMET" | "UNVERIFIED" | "NOT_REQUESTED";
/**
 * Economic evidence for one routed completion. Confidence is derived from
 * real generation log-probabilities when the runtime returns them; a runtime
 * that does not return log-probs is reported `unavailable`, never estimated.
 */
export interface RoutingDecisionEvidence {
    status: "applied" | "not_requested";
    reason: RoutingDecisionReason | null;
    max_cost_cents: number | null;
    min_quality_score: number | null;
    local_cost_estimate_cents: number | null;
    cloud_cost_estimate_cents: number | null;
    actual_cost_estimate_cents: number | null;
    /** Mean per-token probability over generated tokens, 0.0–1.0. */
    actual_confidence: number | null;
    confidence_basis: "avg-token-logprob" | "unavailable" | null;
    quality: RoutingQualityStatus;
    reason_detail?: string;
}
export type RedactionEventType = "PII_SSN" | "PII_EMAIL" | "PII_PHONE" | "PII_CREDIT_CARD" | (string & {});
/** One redaction; the raw match is hashed, never persisted. */
export interface RedactionEvent {
    type: RedactionEventType;
    start_char_offset: number;
    length: number;
    redacted_preview_hash: string;
}
export interface StreamRedactionEvidence {
    status: "not_requested" | "clean" | "redacted" | "failed";
    event_count: number;
    events: RedactionEvent[];
    /** Hash of the compiled pattern set actually enforced. */
    patterns_sha256: string | null;
    /** Always false when redaction ran: the raw response is never cached. */
    raw_output_cached: boolean;
    /** Non-secret fingerprint of the HMAC key that hashed the previews. */
    preview_key_id?: string;
    /**
     * Key tier actually used. Under `process-ephemeral`, preview hashes stop
     * correlating across process restarts — visible here, never silent.
     */
    preview_key_source?: "workspace" | "cache-operator" | "process-ephemeral" | (string & {});
    reason?: string;
}
export interface InferenceManifestCostPolicy {
    max_cents?: number;
}
/**
 * Cryptographic binding between a saved workflow configuration and the live
 * gateway state. Compiled at draft save/publish, signed with the workspace
 * signing key, and re-verified on every runtime invocation.
 */
export interface InferenceManifest {
    manifest_version: "1.0";
    workflow_id: string;
    workflow_version?: string;
    integration_id?: string;
    /** sha256 over base model SHA + ordered adapter SHAs + schema hash. */
    composite_sha256: string;
    base_model_sha256: string;
    adapter_sha256s: string[];
    schema_hash: string;
    tool_openapi_hash: string;
    cache_ttl_seconds: number;
    allowed_adapters: string[];
    max_tokens: number;
    cost_policy?: InferenceManifestCostPolicy;
    created_at: string;
}
export interface SignedInferenceManifest {
    manifest: InferenceManifest;
    manifest_sha256: string;
    /** Null when the workspace signing key is not configured (reported, not faked). */
    signature: string | null;
    key_id: string | null;
    algorithm: "hmac-sha256" | "unsigned";
}
export interface ManifestVerificationEvidence {
    status: "verified" | "mismatch" | "unsigned" | "not_requested" | "unavailable";
    manifest_sha256: string | null;
    composite_sha256: string | null;
    diffs: Array<{
        field: string;
        expected: string;
        actual: string;
    }>;
    reason?: string;
}
export type OpenApiHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | (string & {});
export interface OpenApiOperationRef {
    contract_id: string;
    spec_ref?: InferenceArtifactRef;
    spec_sha256: string;
    operation_id: string;
    method?: OpenApiHttpMethod;
    path_template?: string;
}
export interface InferenceToolDefinition {
    type: "function";
    function: {
        name: string;
        description?: string;
        parameters: InferenceJsonSchema;
        strict?: boolean;
    };
}
/** Tool definition with an immutable pointer to its governing operation. */
export interface OpenApiToolContract extends InferenceToolDefinition {
    openapi: OpenApiOperationRef;
    response_schema?: InferenceJsonSchema;
}
/** Raw tool-call JSON captured before it is released to an executor/client. */
export interface InferenceToolCall {
    id: string;
    type: "function" | (string & {});
    function: {
        name: string;
        /** Raw JSON argument string exactly as emitted by the model. */
        arguments: string;
    };
}
/** Result returned by the governed external executor for a prior tool call. */
export interface InferenceToolResult {
    tool_call_id: string;
    operation_id?: string;
    /** Observed HTTP status from the external call; must be 100–599. */
    status: number;
    /** Actual response; receipts redact and hash this before persistence/export. */
    response: InferenceJsonValue;
    /** Caller input is normalized to `caller-returned` at this public boundary. */
    source?: "governed-api-registry" | "caller-returned" | (string & {});
    /**
     * Correlation input only. Supplying a receipt-shaped value cannot upgrade
     * caller-returned evidence to server-governed authority.
     */
    executor_receipt_ref?: InferenceArtifactRef;
    /**
     * Full verification receipt produced by a governed child workflow that
     * serviced this tool call. Required when the call targeted a Growthub
     * workflow endpoint; the parent gateway hashes it into its receipt DAG.
     */
    child_receipt?: VerificationReceipt;
    /** Pre-computed child receipt hash when the full receipt is stored elsewhere. */
    child_receipt_sha256?: string;
    /** Marks this result as produced by a governed child workflow invocation. */
    child_workflow_ref?: string;
    request?: {
        method?: OpenApiHttpMethod;
        endpoint_ref?: string;
        /** Must equal the hash of the validated model arguments when supplied. */
        arguments_sha256?: string;
        headers?: Record<string, string>;
        body?: InferenceJsonValue;
        sent_at?: string;
    };
    headers?: Record<string, string>;
    received_at?: string;
    duration_ms?: number;
}
export interface ToolCallValidationEvidence {
    status: "valid" | "invalid" | "unvalidated" | "unavailable";
    spec_sha256: string | null;
    operation_id: string | null;
    violations: Array<{
        path?: string;
        /** Runtime validation preserves these camel-case call correlation keys. */
        toolCallId?: string;
        operationId?: string;
        code: string;
        message: string;
        errors?: Array<{
            path: string;
            keyword: string;
            message: string;
        }>;
    }>;
}
/** Inline evidence or a durable source-record pointer, always hash-bound. */
export interface InferencePayloadEvidence {
    sha256: string;
    value?: InferenceJsonValue;
    value_ref?: InferenceArtifactRef;
    redacted: boolean;
}
export interface ExternalToolRequestEvidence {
    request_id: string;
    method: OpenApiHttpMethod;
    /** Secret-redacted URL or governed endpoint reference. */
    endpoint_ref: string;
    headers_sha256?: string;
    body?: InferencePayloadEvidence;
    sent_at: string;
    source?: "governed-api-registry" | "caller-returned" | (string & {});
    authority?: "governed" | "caller-asserted";
    executor_receipt_ref?: InferenceArtifactRef;
}
export interface ExternalToolResultEvidence {
    request_id: string;
    /** Present on every admitted external result and constrained to 100–599. */
    status_code: number;
    headers_sha256?: string;
    /** Actual response evidence, inline when bounded or by source-record ref. */
    response: InferencePayloadEvidence;
    received_at: string;
    duration_ms?: number;
    error?: {
        code: string;
        message: string;
    };
}
export type ToolCallAuditStatus = "not_requested" | "no_tool_calls" | "awaiting_result" | "completed" | "rejected" | "failed" | "unavailable";
export interface ToolCallAuditEntry {
    tool_call: InferenceToolCall | null;
    validation: ToolCallValidationEvidence;
    external_request: ExternalToolRequestEvidence | null;
    external_result: ExternalToolResultEvidence | null;
    /** SHA-256 of the child workflow's full receipt when one serviced this call. */
    child_receipt_hash?: string | null;
    child_status?: ChildReceiptStatus;
    /** OTel child span that joins call validation and external execution. */
    span_id: string | null;
    /** Request that consumed the result to produce the final answer. */
    continuation_request_id: string | null;
}
export interface ToolCallAuditEvidence {
    status: ToolCallAuditStatus;
    calls: ToolCallAuditEntry[];
    reason?: string;
}
export type OtlpTransport = "otlp-grpc" | "otlp-http";
export interface OTelTraceEvidence {
    status: "propagated" | "started" | "invalid" | "failed" | "unavailable";
    /** W3C traceparent sent to the selected inference runtime. */
    otel_traceparent: string | null;
    trace_id: string | null;
    span_id: string | null;
    parent_span_id?: string | null;
    /** False for gateway-cache replay and pre-runtime rejection. */
    runtime_propagated?: boolean;
    transport: OtlpTransport | null;
    export_status: "exported" | "pending" | "failed" | "unavailable";
    reason?: string;
}
export type InferencePhase = "prefill" | "decode";
export type InferencePhasePool = "prefill_pool" | "decode_pool" | "unified_pool" | (string & {});
export interface InferencePoolRef {
    pool_id: string;
    role: "prefill" | "decode" | "unified" | (string & {});
    node_id?: string;
    instance_id?: string;
    endpoint_ref?: string;
}
export interface InferencePhaseEvidence {
    phase: InferencePhase;
    phase_pool: InferencePhasePool;
    pool_ref: InferencePoolRef | null;
    status: "completed" | "failed" | "bypassed" | "unavailable";
    span_id: string | null;
    context_tokens?: number;
    generated_tokens?: number;
    started_at?: string;
    completed_at?: string;
    duration_ms?: number;
    reason?: string;
}
export interface PhaseRoutingEvidence {
    status: "split" | "unified" | "partial" | "failed" | "unavailable";
    context_tokens: number | null;
    split_threshold_tokens: number | null;
    phases: InferencePhaseEvidence[];
    reason?: string;
}
export interface InferenceMessage {
    role: "system" | "developer" | "user" | "assistant" | "tool" | (string & {});
    content: string | InferenceJsonValue;
    name?: string;
    tool_call_id?: string;
    tool_calls?: InferenceToolCall[];
}
/**
 * Additive gateway request. Optional control fields are resolved server-side
 * when omitted; the receipt must still report what was actually used.
 */
export interface InferenceRequest {
    request_id: string;
    /**
     * Required for a tool-result continuation. The gateway resolves this only
     * from its persisted, same-model/same-integration/same-app-scope receipt;
     * caller-supplied prior tool calls are not trusted as continuation proof.
     */
    prior_receipt_id?: string;
    /** Receipt of the parent span when this request executes inside a DAG. */
    parent_receipt_id?: string;
    /** Defaults to ROOT; CHILD_* requires a parent_receipt_id. */
    span_kind?: InferenceSpanKind;
    /** Hard spend ceiling for this request across local + fallback routes. */
    max_cost_cents?: number;
    /** Minimum acceptable confidence (0.0–1.0) before quality fallback. */
    min_quality_score?: number;
    model?: string;
    messages: InferenceMessage[];
    stream?: boolean;
    max_tokens?: number;
    temperature?: number;
    base_model_ref?: BaseModelRef;
    adapter_ref?: InferenceAdapterRef;
    lora_ref?: LoraAdapterRef | null;
    response_schema?: InferenceJsonSchema | InferenceResponseSchemaContract;
    grammar_schema?: InferenceJsonSchema | InferenceResponseSchemaContract;
    /** Expected canonical schema/grammar hash; the gateway must recompute it. */
    grammar_hash?: string;
    schema_ref?: InferenceSchemaRef;
    /** Stable system/RAG prefix used for native-cache instance affinity. */
    context_prefix?: string;
    /** Tokenizer-derived count when available; the gateway records an estimate basis otherwise. */
    context_tokens?: number;
    cache_ttl?: number;
    cache_policy?: InferenceCachePolicy;
    otel_traceparent?: string;
    otel_tracestate?: string;
    /** Caller routing hint; authoritative selection is recorded in the receipt. */
    phase_pool?: InferencePhasePool;
    prefill_pool?: InferencePoolRef;
    decode_pool?: InferencePoolRef;
    tools?: Array<InferenceToolDefinition | OpenApiToolContract>;
    /** Inline OpenAPI is for bounded contracts; large specs use tools[].openapi.spec_ref. */
    tool_openapi?: InferenceJsonObject;
    tool_contract?: {
        allowed_operation_ids?: string[];
    };
    /** Governed results for tool calls emitted by the prior continuation turn. */
    tool_results?: InferenceToolResult[];
    tool_choice?: "auto" | "none" | "required" | {
        function: {
            name: string;
        };
    };
    metadata?: Record<string, InferenceJsonValue>;
}
export type VerificationReceiptStatus = "verified" | "partial" | "rejected" | "failed";
/**
 * Closed-loop evidence for one gateway request. Every capability evidence
 * block is required so missing support cannot be mistaken for successful
 * enforcement.
 */
export interface VerificationReceipt {
    kind: "growthub-inference-verification-receipt-v1";
    version: 1;
    receipt_id: string;
    request_id: string;
    status: VerificationReceiptStatus;
    request_sha256: string;
    /** Hash of the exact pre-tool conversation used for single-use continuation binding; null when normalization failed. */
    conversation_sha256: string | null;
    output_sha256: string | null;
    identity: ModelIdentityEvidence;
    schema: SchemaEnforcementEvidence;
    cache: InferenceCacheEvidence;
    tool_audit: ToolCallAuditEvidence;
    otel: OTelTraceEvidence;
    routing: PhaseRoutingEvidence;
    /**
     * Evidentiary-backbone blocks (contract 1.7.0). Optional on the wire so
     * pre-1.7.0 receipts stay valid; a 1.7.0 runtime always emits all four
     * with explicit `not_requested`/`leaf` states.
     */
    lineage?: ReceiptLineageEvidence;
    routing_decision?: RoutingDecisionEvidence;
    redaction?: StreamRedactionEvidence;
    manifest?: ManifestVerificationEvidence;
    /** Durable receipt/trace location in governed source-record storage. */
    evidence_ref?: InferenceArtifactRef;
    errors: Array<{
        code: string;
        message: string;
        retryable?: boolean;
    }>;
    created_at: string;
    completed_at?: string;
}
export interface InferenceUsage {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
}
export interface InferenceGatewayOutput {
    id: string;
    model: string;
    role?: string;
    content?: string | InferenceJsonValue;
    tool_calls?: InferenceToolCall[];
    finish_reason?: string | null;
    usage?: InferenceUsage;
    /** True when completion chunks were replayed from gateway cache. */
    cache_replay?: boolean;
}
export type InferenceGatewayStatus = "completed" | "awaiting_tool_result" | "rejected" | "failed";
/** A receipt is returned for success, rejection, and failure alike. */
export interface InferenceGatewayResult {
    ok: boolean;
    request_id: string;
    /** Compatibility alias used by existing JavaScript consumers. */
    requestId?: string;
    status: InferenceGatewayStatus;
    httpStatus: number;
    /** Validated raw OpenAI-compatible body; null on rejection/failure. */
    response: InferenceJsonValue | null;
    output: InferenceGatewayOutput | null;
    receipt: VerificationReceipt;
    /** Includes the synthetic x-cache-key when caching is active. */
    headers: Record<string, string>;
    error: {
        code: string;
        message: string;
        retryable?: boolean;
    } | null;
}
//# sourceMappingURL=inference.d.ts.map