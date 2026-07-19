# Inference Control Plane — exported workspace setup

This is the operator companion for the inference control plane shipped in
`apps/workspace`. Source contributors should use the repository contract
`docs/INFERENCE_CONTROL_PLANE_V1.md` as the architectural authority.

The control plane is part of the existing custom-model execution path:

```text
API Registry row -> custom-model workflow -> POST /api/workspace/sandbox-run
                 -> inference gateway -> llama.cpp / OpenAI-compatible target
                 -> existing source-record receipt
```

It does not add an inference route or mutation lane. Read the workspace,
preflight the updated `dataModel`, PATCH the API Registry row through
`PATCH /api/workspace`, prove execution through the existing sandbox/workflow,
and confirm the persisted receipt.

Newly generated custom-model workflows use a bounded 120-second timeout on
both the sandbox row and each model-call node so cold GGUF or adapter loads
from external storage can complete. Imported workflows keep their governed
timeout until repaired through preflight plus `PATCH /api/workspace` or
deliberately re-applied.

## Local llama.cpp configuration

Add `metadata.inferenceControlPlane` to the target custom-model API Registry
row. The following is a row fragment, not a PATCH body:

```json
{
  "integrationId": "workspace-local-model",
  "connectorKind": "llama-cpp-server",
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
        "semantic": false,
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
      }
    }
  }
}
```

Requests select an allowlisted adapter by id:

```json
{
  "prompt": "Return one JSON object.",
  "inference": {
    "lora_ref": { "lora_id": "support-v3", "scale": 1 },
    "cache_ttl": 900,
    "response_schema": {
      "name": "answer",
      "version": "1",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": { "answer": { "type": "string" } },
        "required": ["answer"],
        "additionalProperties": false
      }
    }
  }
}
```

`runtime.servedAlias` must exactly equal the activated row's
`expectedModelTag`. Never accept a model or adapter path from an inference
request. The gateway uses the id to resolve `runtime.allowedAdapters`, and the
process supervisor resolves each file inside an operator-approved artifact
root and hashes it before spawn. Request cache controls may only narrow the
governed TTL and enabled modes; they cannot enable semantic/native-prefix reuse
that the row disabled or raise its TTL.

The governed row cannot select `llama-server`, pool capacity, artifact roots,
or role/hardware tuning. Those are operator controls in `.env.local`; keeping
them outside workspace data prevents a patched row from choosing an executable
or widening filesystem access.

## Operator environment

Copy `apps/workspace/.env.example` to `.env.local`. A local llama.cpp target
requires at least one operator-approved artifact root:

```bash
LLAMA_SERVER_BIN=llama-server
GROWTHUB_LLAMA_ARTIFACT_ROOTS=/srv/growthub/models:/srv/growthub/adapters
GROWTHUB_LLAMA_MAX_INSTANCES=4
GROWTHUB_LLAMA_SERVER_CONFIG_JSON='{"prefill_pool":{"ctxSize":32768,"batchSize":2048,"ubatchSize":512},"decode_pool":{"ctxSize":8192,"batchSize":512,"ubatchSize":128},"unified_pool":{"ctxSize":16384,"batchSize":1024,"ubatchSize":256}}'

# Optional shared cache; otherwise the bounded cache is process-local.
GROWTHUB_INFERENCE_CACHE_NAMESPACE=production-workspace-a

# Explicit Growthub cache credentials take precedence when set.
GROWTHUB_INFERENCE_CACHE_REDIS_URL=
GROWTHUB_INFERENCE_CACHE_REDIS_TOKEN=

# Governed Upstash Redis add-on credentials.
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Vercel Marketplace Redis aliases.
KV_REST_API_URL=
KV_REST_API_TOKEN=

# Optional real-vector semantic cache matching.
GROWTHUB_INFERENCE_EMBEDDINGS_URL=
GROWTHUB_INFERENCE_EMBEDDINGS_MODEL=
GROWTHUB_INFERENCE_EMBEDDINGS_API_KEY=

# Remote-host/ref approvals; values are comma-separated.
GROWTHUB_INFERENCE_PRIVATE_NETWORK_ALLOWLIST=
GROWTHUB_INFERENCE_TEST_ALLOWLIST=
GROWTHUB_INFERENCE_TEST_AUTH_REFS=

# Optional OTLP/HTTP JSON collector.
OTEL_EXPORTER_OTLP_ENDPOINT=
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=
OTEL_EXPORTER_OTLP_HEADERS=
```

`GROWTHUB_LLAMA_ARTIFACT_ROOTS` uses the platform path delimiter (`:` on POSIX,
`;` on Windows). Roots and artifacts are `realpath`-resolved, so symlink escapes
are rejected. `GROWTHUB_LLAMA_MAX_INSTANCES` is bounded from 1 to 32. Role JSON
accepts only the three pool roles and the allowlisted integer settings
`threads`, `ctxSize`, `batchSize`, `ubatchSize`, and `gpuLayers`.

### Redis credential fusion

Shared Redis accepts one complete credential pair from three sources, in this
order: explicit `GROWTHUB_INFERENCE_CACHE_REDIS_URL` /
`GROWTHUB_INFERENCE_CACHE_REDIS_TOKEN`, direct
`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`, or Vercel Marketplace
`KV_REST_API_URL` / `KV_REST_API_TOKEN`. The governed Upstash Redis add-on
discovers the selected database, writes the direct pair server-side, and marks
the product installed only after its live `/ping` probe succeeds. A Vercel
Marketplace Redis resource supplies the `KV_REST_API_*` aliases. Either source
can back the inference cache without copying its values into Growthub-prefixed
variables.

`GROWTHUB_INFERENCE_CACHE_NAMESPACE` is mandatory for all three sources and
must name the deployment/tenant isolation boundary. Credentials without that
namespace do not enable shared Redis; the gateway stays on its bounded
process-local cache.

QStash is a separate scheduler/queue delivery product. `QSTASH_TOKEN`,
`QSTASH_URL`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, and the
legacy `QSTASH_KV_REST_*` persistence-adapter variables are not inference
Redis credentials. Semantic reuse is opt-in and requires a real
OpenAI-compatible embedding endpoint; without it, exact cache reuse continues
and semantic matching reports unavailable rather than falling back to lexical
similarity. Redis, embedding, and OTLP credentials remain environment-only.

The private-network allowlist supplements the sandbox's own `networkAllow` and
hostname `allowList`; it never grants network access by itself. The read-only
custom-model `/test-source` probe may contact only external hosts in
`GROWTHUB_INFERENCE_TEST_ALLOWLIST` and may resolve only secret refs in
`GROWTHUB_INFERENCE_TEST_AUTH_REFS`. An authenticated remote probe requires
both approvals.

`GROWTHUB_LLAMA_ALLOW_UNCONFINED_ARTIFACTS=true` exists only as an unsafe local
diagnostic break-glass. It is not a production or release-ready setting.

## Artifact handoff

A model tag is not an artifact identity. A merged/quantized GGUF can run as a
standalone model when that exact path and SHA are recorded. Dynamic LoRA
serving additionally requires a separately provable compatible base GGUF and
LoRA GGUF, each with its own path and SHA. If the training receipt does not
identify both, keep the standalone GGUF or existing Ollama/OpenAI-compatible
route. Do not invent the missing values.

## Schema and tool contracts

A `response_schema` wrapper may include `name`, `version`, `strict`, `schema`,
and `schema_ref`. The gateway separately hashes the canonical schema body and
the complete versioned generation contract. For llama.cpp it rejects features
outside the pinned converter's safe subset, constrains generation with
`response_format.type: "json_schema"`, buffers structured streaming, and then
requires strict-schema AJV 2020 validation before releasing success. A generic
OpenAI-compatible target must prove generation-time enforcement; post-hoc JSON
validation alone is not sufficient.

The gateway validates generated tool calls against both their declared
function schemas and the governed OpenAPI operations, then persists the first
turn as awaiting a result. It does not execute external HTTP. A continuation
supplies only the persisted trust anchor and one result per validated call:

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

The server resolves the prior receipt in the same model-policy stream and
requires the same integration, app scope, model tag, base/adapter identity,
tool-contract hash, and pre-tool conversation hash. It reconstructs the
assistant tool calls from that persisted receipt rather than trusting
caller-authored messages. The pending run returns the receipt id and validated
calls needed for this body. Once a later invocation consumes a persisted
receipt, replay is rejected. Wire results
remain `source: "caller-returned"` and `authority: "caller-asserted"`; a
caller-supplied `executor_receipt_ref` cannot promote them to governed
execution evidence. Results are bounded, redacted, hash-correlated, and
captured in the continuation receipt and child spans.

## Expected proof

Every custom-model sandbox attempt, including a first turn awaiting tool
results, persists
`growthub-inference-verification-receipt-v1` inside the custom-model invocation.
Inspect all six evidence blocks:

- `identity`: resolved base and adapter SHA, adapter id/scale, exact served alias;
- `cache`: hit/miss/cold-start/bypass, key, prefix and native cache evidence;
- `schema`: schema-body and generation-contract hashes, generation-time claim,
  schema version/ref, and final AJV validation;
- `tool_audit`: validated calls and redacted/hash-bound caller-returned results;
- `otel`: propagated traceparent, trace/span ids and OTLP export state; and
- `routing`: both phases, actual pool/instance and honest unified/split state.

The llama.cpp integration preloads LoRAs and switches them by request id. Its
`cache_prompt` support is prefix reuse; `cacheTypeK` controls KV precision. The
server does not execute tools or export Growthub OTLP spans. The verified
upstream baseline also has no stable native prefill/decode state handoff;
proposed native P/D work outside the pinned release is not a shipped contract.
The workspace therefore uses role-specific pools for one combined request and
rejects `nativeDisaggregationRequired: true` rather than fabricating a split.

The API Registry test is a live, cache-bypassed, student-only invocation. It
marks the target verified only when the tuned tag, gateway receipt, and (for
llama.cpp) artifact-backed identity all agree. A successful health check or a
training artifact by itself is not serving proof.
