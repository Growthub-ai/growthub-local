# Governed Inference Control Plane V1

The Governed Inference Control Plane makes custom-model inference an
evidence-bearing workspace capability. It adds six required controls to the
existing custom-model path: verified LoRA selection, exact and semantic
completion caching, schema-forced generation, OpenAPI-backed tool-call
governance, OTLP tracing, and workload-aware prefill/decode pool selection.

It does not add a model endpoint, mutation route, audit database, or training
subsystem. The integration stays inside the existing governed path:

```text
API Registry + model-training receipts
              |
              v
POST /api/workspace/sandbox-run
              |
              v
custom-model workflow -> inference gateway -> selected transport
                              |                    |
                              |                    +-> llama-server process pool
                              |                    +-> OpenAI-compatible endpoint
                              |
                              +-> bounded completion cache
                              +-> schema and tool contracts
                              +-> OTLP/HTTP spans
              |
              v
source-record run proof + growthub-custom-model-invocation-v2
                       + growthub-inference-verification-receipt-v1
```

Configuration remains an API Registry row inside
`dataModel.objects[]`, changed through the normal read -> preflight -> PATCH
protocol. Execution remains `POST /api/workspace/sandbox-run`. No caller may
use the control plane to bypass the workspace mutation policy, workflow
publish boundary, app scope, Agent Outcome receipts, or human review.

Generated custom-model workflows apply one 120-second timeout to both the
sandbox row and every model-call node. This bounded allowance covers cold GGUF
or adapter loads from external storage; generic non-model workflow timeouts are
unchanged. Existing imported rows retain their governed values until repaired
through preflight plus `PATCH /api/workspace` or deliberately re-applied.

## Product capabilities

### 1. Verified LoRA selection

The llama.cpp transport supervises loopback-only `llama-server` processes. A
process is keyed by the verified base GGUF, the verified set of preloaded LoRA
artifacts, its exact served alias, workload role, KV cache type, and bounded
operator role tuning. Before a process starts, the runtime resolves every
local artifact inside an operator-approved root, streams it through SHA-256,
and rejects a mismatch. The governed `runtime.servedAlias` must exactly match
the activated custom-model tag; a response reporting another model is an
identity failure.

Allowed adapters are started with repeated `--lora` / `--lora-scaled` flags
and `--lora-init-without-apply`. A request supplies a governed `lora_id` and
optional scale; the transport maps the id to llama.cpp's zero-based preloaded
adapter id and sends `lora: [{ id, scale }]`. A request-supplied path is never
added to the allowlist. Selecting a different adapter in the same preloaded
set therefore does not restart the process. A new adapter set gets a separate
pooled process, without restarting unrelated model pools.

The receipt records the resolved base-model SHA, adapter SHA, adapter id,
scale, exact process alias, and a `model_tag_sha256` that also binds the schema
contract hash.

### 2. Gateway cache plus native prefix reuse

Caching happens before transport selection. Exact completion identity covers
the full normalized request, model and adapter hashes, adapter scale, schema,
tool contract, and tenant/workspace scope. Semantic reuse is opt-in and is
further restricted to that identity scope and the same stable-prefix bucket;
sharing a system prompt alone is never sufficient for a hit. Tool-bearing
requests are not replay-cached.

The default cache is bounded and process-local. An operator may opt into an
Upstash-compatible Redis REST store. The cache accepts an explicit Growthub
credential pair, the direct `UPSTASH_REDIS_REST_URL` /
`UPSTASH_REDIS_REST_TOKEN` pair installed by the governed Upstash Redis add-on,
or the `KV_REST_API_URL` / `KV_REST_API_TOKEN` aliases injected by a Vercel
Marketplace Redis integration. Shared storage is enabled only when
`GROWTHUB_INFERENCE_CACHE_NAMESPACE` also names a deployment/tenant boundary;
Redis credentials without that boundary fall back to the local cache. QStash
tokens, URLs, and signing keys are scheduler/queue credentials and are never
used as Redis inference-cache credentials. Semantic matching requires an
explicitly configured OpenAI-compatible embedding
endpoint and compares real embedding vectors. Without one, exact caching
continues normally and semantic lookup reports unavailable instead of using a
lexical similarity approximation. A hit bypasses the model and emits a
synthetic streaming delta carrying `x-cache-key` metadata. The receipt reports
`HIT`, `MISS`, `COLD_START`, or `BYPASS`, the cache kind and key, semantic
similarity when used, TTL, prefix hash, and whether a warm process was chosen.

The llama.cpp process also starts with `--cache-prompt`; each request sends
`cache_prompt`. `--cache-type-k` selects KV key-cache precision. It does not
enable prefix caching by itself, and the gateway does not describe it that
way.

### 3. Schema-forced generation

`response_schema` accepts JSON Schema directly or as a wrapper containing
`name`, `version`, `strict`, `schema`, and an optional `schema_ref`. The gateway
canonicalizes and separately hashes the schema body and the full versioned
generation contract before routing. A caller-supplied `grammar_hash` must
match the full contract hash or the request is rejected.

For llama.cpp, the adapter rejects schema features not safely supported by the
pinned upstream converter, then sends OpenAI-compatible
`response_format.type = "json_schema"`; llama.cpp constrains sampling from the
schema. Structured streaming is buffered until the completed content also
passes strict-schema AJV 2020 validation. This final check remains required
because a token, context, or stop limit can truncate otherwise
grammar-constrained JSON. Invalid output is recorded but is not released as
successful output.

The receipt distinguishes generation-time enforcement from post-hoc-only
validation. A generic OpenAI-compatible transport must identify its schema
engine before the receipt can claim generation-time enforcement.

### 4. Tool-call governance and continuation audit

The gateway accepts bounded OpenAPI plus an optional operation-id allowlist.
It projects operations into model tool definitions, buffers a completed
`tool_calls` array, parses the raw arguments, and validates them against both
the declared tool schema and the matching OpenAPI operation before release.
An undeclared tool, disallowed operation, missing call id, malformed JSON, or
schema violation is rejected.

llama.cpp and this gateway do not execute external tools. The first turn is
persisted with `tool_audit.status: "awaiting_result"`. An executor outside the
gateway performs the call, then the continuation supplies:

- `prior_receipt_id`, pointing to that persisted invocation;
- `tool_results[]` keyed by `tool_call_id`; and
- the same governed model/adapter identity.

The server resolves the prior receipt from the same model-policy source-record
stream, requires the same integration and app scope, and reconstructs the raw
assistant `tool_calls`; caller-supplied prior assistant messages are not the
trust source. The gateway then correlates one bounded result per call, appends
the `role: "tool"` messages, and routes the continuation under the same
model/base/adapter/tool-contract identity. The pool prefers a matching warm
process, but the receipt is authoritative about the instance actually used.

Wire `tool_results` are always recorded as `source: "caller-returned"` and
`authority: "caller-asserted"`. Supplying an `executor_receipt_ref` cannot
upgrade that authority. Result values are secret-redacted, bounded, hashed,
and exported as child-span evidence. A future server-owned executor may create
governed execution evidence, but this version never claims that llama.cpp or
the gateway sent the external HTTP request.

### 5. W3C trace context and OTLP

The sandbox route accepts `traceparent` and `tracestate`; the gateway preserves
the trace id, creates a gateway span and an inference child span, and sends the
child `traceparent` to the selected model server. Tool continuations produce
child spans. Operational spans are exported as OTLP/HTTP JSON using the
standard `OTEL_EXPORTER_OTLP_*` environment variables.

There is no proprietary telemetry database or dashboard in this layer. The
governed receipt retains correlation and enforcement evidence; the OTLP
backend retains operational span detail. Training/distillation source records
remain governed corpus evidence and are not replaced by telemetry.

### 6. Prefill/decode-aware routing without a false native split claim

The supervised pool has `prefill_pool`, `decode_pool`, and `unified_pool`
roles. Operators may tune those roles independently through
`GROWTHUB_LLAMA_SERVER_CONFIG_JSON`. With the default 2,048-token threshold:

- a context-heavy request selects a prefill-optimized role;
- a shorter streaming request selects a decode-optimized role; and
- other requests select the unified role.

Stock llama.cpp at the pinned integration baseline does not expose a verified,
stable prefill-to-decode KV-state handoff; proposed native P/D work outside
that release is not a shipped contract. One role-aware process therefore
performs both phases. Both phases and the actual pool/instance are recorded in
the receipt with `status: "unified"`. Setting
`routing.nativeDisaggregationRequired: true` fails closed with
`NATIVE_PD_HANDOFF_UNAVAILABLE`; it never turns an RPC tensor backend into a
fictional P/D handoff.

## Governed configuration

Attach `metadata.inferenceControlPlane` to the target custom-model API Registry
row. It may also be supplied at the mothership policy or route level; the
target Registry row is the most specific source and wins during merge. This is
a row fragment, not a full PATCH body:

```json
{
  "integrationId": "workspace-local-model",
  "name": "workspace-local-tuned-v1",
  "kind": "custom-model",
  "connectorKind": "llama-cpp-server",
  "capabilityType": "custom-model-inference",
  "expectedModelTag": "workspace-local-tuned-v1",
  "metadata": {
    "inferenceControlPlane": {
      "schema": "growthub-inference-control-plane-v1",
      "providerKind": "llama.cpp-server",
      "base_model_ref": {
        "model_id": "base-model-v1",
        "format": "gguf",
        "base_model_sha256": "<64-lowercase-hex>",
        "artifact_ref": {
          "id": "base-model-v1",
          "sha256": "<64-lowercase-hex>",
          "uri": "/operator-approved/models/base-model.gguf"
        }
      },
      "runtime": {
        "kind": "llama.cpp-server",
        "servedAlias": "workspace-local-tuned-v1",
        "cacheTypeK": "q8_0",
        "model": {
          "path": "/operator-approved/models/base-model.gguf",
          "sha256": "<64-lowercase-hex>",
          "format": "gguf"
        },
        "allowedAdapters": [
          {
            "ref": "support-v3",
            "path": "/operator-approved/models/support-v3-lora.gguf",
            "sha256": "<64-lowercase-hex>",
            "defaultScale": 1,
            "format": "gguf",
            "compatibility": "llama.cpp-lora-gguf"
          }
        ],
        "artifactVerification": "sha256-reverified-before-process-start"
      },
      "cache": {
        "ttl": 900,
        "semantic": true,
        "similarityThreshold": 0.98,
        "nativePrefix": true
      },
      "routing": {
        "prefillPool": "prefill_pool",
        "decodePool": "decode_pool",
        "splitThresholdTokens": 2048,
        "nativeDisaggregationRequired": false
      },
      "otel": {
        "protocol": "otlp-http",
        "propagateTraceparent": true,
        "serviceName": "growthub-workspace-inference"
      },
      "tools": {
        "interceptor": "openapi-governed",
        "closedLoopReceipt": true,
        "allowedOperationIds": ["lookupCustomer"],
        "openapi": {
          "openapi": "3.1.0",
          "info": { "title": "Governed tools", "version": "1" },
          "paths": {
            "/customers/{customerId}": {
              "get": {
                "operationId": "lookupCustomer",
                "parameters": [
                  {
                    "name": "customerId",
                    "in": "path",
                    "required": true,
                    "schema": { "type": "string" }
                  }
                ]
              }
            }
          }
        }
      }
    }
  }
}
```

`runtime.servedAlias` is the exact activated `expectedModelTag`, not a label the
caller may override. The workspace row may select verified artifacts and
bounded protocol knobs; it cannot select the executable, pool capacity,
artifact roots, or hardware/role tuning. Those controls are operator-owned
environment settings described below.

Only a server-side, local workspace runtime should use local artifact paths and
spawn `llama-server`. Serverless deployments should use their governed remote
OpenAI-compatible target instead. Credentials remain named environment
references; they do not belong in `metadata`, model requests, OpenAPI examples,
or receipts.

An invocation may select and constrain that governed configuration:

```json
{
  "prompt": "Return the account status as JSON.",
  "inference": {
    "lora_ref": { "lora_id": "support-v3", "scale": 0.8 },
    "context_prefix": "<stable system or RAG prefix>",
    "context_tokens": 4096,
    "cache_ttl": 900,
    "response_schema": {
      "name": "account_status",
      "version": "2026-07-19",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {
          "status": { "type": "string" }
        },
        "required": ["status"],
        "additionalProperties": false
      }
    }
  }
}
```

The request selects an adapter id and scale only. Local artifact paths and
hashes are always resolved from `runtime.allowedAdapters`. Request cache
controls may shorten/bypass the governed TTL or disable semantic/native-prefix
reuse; they cannot enable a cache mode the row disabled or raise its TTL.

A tool continuation does not resend a caller-authored assistant tool call. It
names the persisted first turn and supplies bounded external results:

```json
{
  "objectId": "sandbox-environments",
  "name": "workspace-model-chat",
  "inference": {
    "prior_receipt_id": "inference-receipt-<persisted-id>",
    "tool_results": [
      {
        "tool_call_id": "call_lookup_customer",
        "operation_id": "lookupCustomer",
        "status": 200,
        "response": { "status": "active" }
      }
    ]
  }
}
```

The prior receipt must still be awaiting results and must resolve in the same
model policy, integration, and app scope. All calls must share the same
canonical tool-contract hash, and every validated call requires exactly one
result before the continuation reaches a model. The pending sandbox response
returns this `prior_receipt_id` plus the validated `tool_calls`. The receipt
also binds the exact pre-tool conversation hash; changing the prompt or
history rejects before transport. A persisted receipt is single-use after any
later invocation consumes it, preventing replay.

The additive wire contract is `InferenceRequest` in
`@growthub/api-contract/inference`. Control fields are optional at the call
site because the Registry row supplies policy, but their meanings are fixed:

| Request field | Contract |
| --- | --- |
| `request_id`, `model`, `messages`, `stream`, `max_tokens`, `temperature` | OpenAI-compatible inference identity and payload. |
| `base_model_ref` | Expected base identity/artifact reference. For local llama.cpp, the runtime resolves and verifies the configured file. |
| `adapter_ref` | Runtime/provider adapter identity. It is not the LoRA artifact. |
| `lora_ref` | `{ lora_id, adapter_ref?, adapter_sha256?, scale? }`; the custom-model path accepts the id/scale but resolves path and SHA from the governed allowlist. |
| `response_schema` / `grammar_schema` | JSON Schema or the named/versioned wrapper shown above. |
| `grammar_hash` | Optional expected SHA-256 of the full name/version/strict/schema/ref generation contract; a mismatch rejects before inference. |
| `context_prefix`, `context_tokens` | Stable prefix affinity and an authoritative token count when the caller has one; otherwise the gateway records its estimate basis. |
| `cache_ttl`, `cache_policy` | Bounded TTL plus `mode`, semantic opt-in/threshold, and native prefix-cache choice. Zero TTL bypasses replay caching. |
| `otel_traceparent`, `otel_tracestate` | W3C context; the normal sandbox HTTP headers populate these without duplicating them in the payload. |
| `phase_pool`, `prefill_pool`, `decode_pool` | Caller hints/references. Actual phase and process selection is authoritative only in the receipt. |
| `tools`, `tool_openapi`, `tool_choice` | Bounded tool definitions, inline governed OpenAPI, and model selection policy. |
| `prior_receipt_id` | Server-resolved persisted invocation that is awaiting tool results; caller messages cannot replace this trust anchor. |
| `tool_results` | Caller-returned external results keyed by a previously validated `tool_call_id`, including an HTTP status from 100–599; never an instruction for llama.cpp to execute HTTP. |
| `metadata` | Non-secret workspace/tenant correlation used for safe cache scope and traces. |

Every terminal outcome carries a
`growthub-inference-verification-receipt-v1`. Its required evidence blocks are
`identity`, `schema`, `cache`, `tool_audit`, `otel`, and `routing`, plus request
and output hashes and explicit errors. Unsupported or unrequested capabilities
use explicit states such as `unavailable`, `not_requested`, or `BYPASS`; a
missing proof is never serialized as success.

## Training-to-serving handoff

Training and serving prove different facts:

- `model-training-run` and `training:*` evidence prove what training produced;
- the API Registry test proves the configured endpoint serves the tuned tag;
- the inference receipt proves which bytes, adapter, schema, cache decision,
  tool contract, trace, and pool answered a particular call.

A model tag is not a file identity. Do not derive a local path or SHA from it.
The existing merged/quantized GGUF output can be configured as a standalone
base model when its exact path and SHA are present. Dynamic LoRA selection
requires two separately provable, compatible artifacts: an unmerged base GGUF
and a LoRA GGUF, each with its own real path and SHA. If a training receipt
only identifies the merged output, serving must remain base-model-only or on
the existing Ollama/OpenAI-compatible route until the separate adapter and
base artifacts are recorded. No runtime field is synthesized from a missing
artifact.

This extension does not change the completion gates in
[`CUSTOM_MODEL_TRAINING_RUNTIME_V1.md`](./CUSTOM_MODEL_TRAINING_RUNTIME_V1.md):
an artifact still does not become a completed capability until endpoint
verification and the governed sandbox/workflow proof succeed.

## Security and retention

- `llama-server` is spawned with argv and `shell: false`, bound only to
  `127.0.0.1`, and called only through loopback HTTP.
- Base and adapter files must resolve to regular files inside
  `GROWTHUB_LLAMA_ARTIFACT_ROOTS` and are SHA-verified before a process starts.
  Unknown LoRA ids, out-of-root paths, symlink escapes, and hash mismatches fail
  closed.
- Structured content and tool-call deltas are buffered until their contracts
  pass. Rejected model output is evidence, not releasable output.
- Cache keys include workspace/tenant scope. Semantic cache is opt-in. The
  process-local cache is the default; Redis is an operator retention decision
  because cached completions can contain business data.
- Redis tokens and OTLP authorization headers remain environment-only. Tool
  result receipts redact credential-shaped keys and values, bound inline
  evidence, and retain hashes.
- Generic remote inference requires the sandbox network policy and hostname
  allowlist. Private/reserved DNS results additionally require an operator
  entry in `GROWTHUB_INFERENCE_PRIVATE_NETWORK_ALLOWLIST`; the operator setting
  does not grant sandbox network access by itself.
- OTLP telemetry is operational evidence, not a training corpus. Do not feed
  raw spans into training without the normal governed curation/redaction path.

## Runtime setup

The workspace app recognizes these server-side operator variables. A local
llama.cpp target requires an approved artifact-root list; other groups are
needed only when their capability is enabled:

```bash
# Local llama.cpp supervisor
LLAMA_SERVER_BIN=llama-server
GROWTHUB_LLAMA_ARTIFACT_ROOTS=/srv/growthub/models:/srv/growthub/adapters
GROWTHUB_LLAMA_MAX_INSTANCES=4

# Optional role-specific llama-server tuning. Roles and setting names are
# allowlisted; supported settings are threads, ctxSize, batchSize, ubatchSize,
# and gpuLayers.
GROWTHUB_LLAMA_SERVER_CONFIG_JSON='{"prefill_pool":{"ctxSize":32768,"batchSize":2048,"ubatchSize":512},"decode_pool":{"ctxSize":8192,"batchSize":512,"ubatchSize":128},"unified_pool":{"ctxSize":16384,"batchSize":1024,"ubatchSize":256}}'

# Optional shared completion cache; process-local caching works without these.
# Namespace is mandatory for every shared Redis credential source.
GROWTHUB_INFERENCE_CACHE_NAMESPACE=production-workspace-a

# Explicit Growthub cache credentials take precedence when set.
GROWTHUB_INFERENCE_CACHE_REDIS_URL=
GROWTHUB_INFERENCE_CACHE_REDIS_TOKEN=

# The governed Upstash Redis add-on writes these direct product credentials.
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# A Vercel Marketplace Redis integration injects these aliases.
KV_REST_API_URL=
KV_REST_API_TOKEN=

# Optional semantic matching. URL must be the full OpenAI-compatible
# /v1/embeddings endpoint; API key is optional for private/loopback services.
GROWTHUB_INFERENCE_EMBEDDINGS_URL=
GROWTHUB_INFERENCE_EMBEDDINGS_MODEL=
GROWTHUB_INFERENCE_EMBEDDINGS_API_KEY=

# Remote endpoint controls. These are comma-separated host/ref allowlists.
# Private-network approval supplements—and never replaces—the sandbox policy.
GROWTHUB_INFERENCE_PRIVATE_NETWORK_ALLOWLIST=
GROWTHUB_INFERENCE_TEST_ALLOWLIST=
GROWTHUB_INFERENCE_TEST_AUTH_REFS=

# Optional OTLP/HTTP collector. TRACES_ENDPOINT wins when both are set.
OTEL_EXPORTER_OTLP_ENDPOINT=
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=
OTEL_EXPORTER_OTLP_HEADERS=
```

`GROWTHUB_LLAMA_ARTIFACT_ROOTS` uses the platform path delimiter (`:` on
POSIX, `;` on Windows). The runtime resolves the roots and artifacts with
`realpath`, so an in-root symlink to an out-of-root file is rejected. The
process limit must be an integer from 1 through 32. The role JSON accepts only
`prefill_pool`, `decode_pool`, and `unified_pool` (or their documented aliases)
and is part of the exact process key, so differently tuned roles cannot be
mistaken for the same instance.

### Redis credential fusion

The inference cache recognizes three Redis REST credential families, in this
order: `GROWTHUB_INFERENCE_CACHE_REDIS_URL` /
`GROWTHUB_INFERENCE_CACHE_REDIS_TOKEN`, `UPSTASH_REDIS_REST_URL` /
`UPSTASH_REDIS_REST_TOKEN`, then `KV_REST_API_URL` /
`KV_REST_API_TOKEN`. Configure one complete URL/token pair. The second pair is
the direct output of the governed Upstash Redis product install and
verification flow in Settings -> Add-ons. The third pair is the environment
contract used by a Vercel Marketplace Redis resource. Both reuse the same
verified cache backend; operators do not have to copy either pair into
Growthub-prefixed variables.

`GROWTHUB_INFERENCE_CACHE_NAMESPACE` is still required whichever credential
family supplies Redis. It is the deployment/tenant isolation boundary, not an
optional label. If the namespace is absent or blank, or the selected credential
pair is incomplete, the gateway keeps the bounded process-local cache and does
not issue Redis requests.

Do not substitute `QSTASH_TOKEN`, `QSTASH_URL`,
`QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, or the legacy
`QSTASH_KV_REST_*` persistence-adapter fields. QStash is the governed
scheduler/queue delivery lane; those credentials do not identify the Redis
completion-cache product.

There is an explicit local diagnostic break-glass,
`GROWTHUB_LLAMA_ALLOW_UNCONFINED_ARTIFACTS=true`, but it disables the artifact
root boundary and is not a production or release-ready setting.

`GROWTHUB_INFERENCE_TEST_ALLOWLIST` is the operator list of external hosts the
read-only custom-model `/test-source` probe may contact.
`GROWTHUB_INFERENCE_TEST_AUTH_REFS` independently lists the secret-reference
names that probe may resolve. An authenticated remote verification requires
both approvals. Normal sandbox inference still requires its own runtime
`networkAllow` and `allowList` policy.

`OTEL_EXPORTER_OTLP_ENDPOINT` is expanded to `/v1/traces`.
`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is used as-is. Header values use the
standard comma-separated `key=value` form and must stay out of logs and config.

## Upstream llama.cpp boundary

The adapter mapping is pinned and tested against official llama.cpp
[`b10068`](https://github.com/ggml-org/llama.cpp/releases/tag/b10068), commit
[`571d0d540df04f25298d0e159e520d9fc62ed121`](https://github.com/ggml-org/llama.cpp/commit/571d0d540df04f25298d0e159e520d9fc62ed121).
The pin describes the verified integration contract; it is not a claim that an
operator's installed binary is automatically that build.

| Concern | Upstream truth at the integration pin | Growthub responsibility |
| --- | --- | --- |
| LoRA | `--lora`, `--lora-scaled`, preloaded adapter ids, and per-request scale are supported. Upstream does not accept an arbitrary new adapter path in a chat request. | Hash artifacts, supervise process sets, enforce the allowlist, map ids, and receipt the selected SHA. |
| Prefix cache | `--cache-prompt` / `cache_prompt` enable prompt-prefix reuse. `--cache-type-k` selects KV precision only. | Full-request exact/semantic replay cache and warm-prefix process affinity. |
| JSON Schema | `response_format.json_schema` constrains sampling; the built-in converter does not implement every JSON Schema feature. | Canonical schema hash, model-tag binding, buffered release, and final AJV validation. |
| Tool calls | The server can format/parse tool calls; it does not execute an external API or provide the workspace audit loop. | OpenAPI projection, validation, result correlation, redaction, hashing, and child spans. |
| OTel | The server exposes its own metrics but no native Growthub OTLP trace contract. | W3C propagation, span construction, OTLP/HTTP export, and receipt correlation. |
| P/D routing | The RPC backend distributes compute; the pinned release does not document a stable prefill/decode KV-state handoff. | Role-specific process pools, honest combined-phase receipts, and fail-closed native handoff requirements. |

Relevant upstream contracts:

- [server LoRA options and endpoints](https://github.com/ggml-org/llama.cpp/blob/571d0d540df04f25298d0e159e520d9fc62ed121/tools/server/README.md#L520-L536)
- [server prompt-cache options](https://github.com/ggml-org/llama.cpp/blob/571d0d540df04f25298d0e159e520d9fc62ed121/tools/server/README.md#L163-L169)
- [JSON Schema to grammar and limitations](https://github.com/ggml-org/llama.cpp/blob/571d0d540df04f25298d0e159e520d9fc62ed121/grammars/README.md#L137-L155)
- [function-calling boundary](https://github.com/ggml-org/llama.cpp/blob/571d0d540df04f25298d0e159e520d9fc62ed121/docs/function-calling.md#L1-L24)
- [RPC backend scope](https://github.com/ggml-org/llama.cpp/blob/571d0d540df04f25298d0e159e520d9fc62ed121/tools/rpc/README.md#L1-L9)

## Source and verification map

| Concern | Source |
| --- | --- |
| Public request/receipt types | `packages/api-contract/src/inference.ts` |
| Middleware and receipt | `apps/workspace/lib/adapters/inference/gateway.js` |
| Cache | `apps/workspace/lib/adapters/inference/cache.js` |
| Schema and tools | `apps/workspace/lib/adapters/inference/contracts.js` |
| Persisted tool-continuation trust | `apps/workspace/lib/adapters/inference/continuation.js` |
| Trace context and OTLP | `apps/workspace/lib/adapters/inference/otel.js` |
| llama.cpp supervisor | `apps/workspace/lib/adapters/inference/llama-cpp.js` |
| Gateway-to-pool transport | `apps/workspace/lib/adapters/inference/llama-transport.js` |
| Existing custom-model integration | `apps/workspace/lib/custom-model-inference.js` |
| Existing persistence boundary | `apps/workspace/app/api/workspace/sandbox-run/route.js` |

Run focused proof from the repository root:

```bash
node --test \
  scripts/unit-inference-control-plane.test.mjs \
  scripts/unit-llama-cpp-adapter.test.mjs \
  scripts/unit-custom-model-inference.test.mjs

node scripts/export-seed-workspace.mjs --no-dev --keep
```

For a hardware-backed operator proof, configure real hashed artifacts on the
exported API Registry row, boot `apps/workspace`, and execute the existing
custom-model sandbox/workflow. Do not call a spawned llama-server as a
substitute. The proof is complete only when the sandbox response and persisted
invocation agree on base/adapter SHA, schema hash and validation, cache status,
OTel correlation, tool audit state, and both routing phases.
