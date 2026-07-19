# Inference Evidentiary Backbone V1

The evidentiary backbone extends the
[Governed Inference Control Plane V1](./INFERENCE_CONTROL_PLANE_V1.md) with
five connected deltas. The model runs; the receipt is the asset: the receipt
graph becomes a Merkle DAG, the cache becomes revocable, the route becomes
economic, the stream becomes safe, and the manifest becomes binding.

Nothing here adds a mutation route. Every delta rides the existing governed
lanes: `POST /api/workspace/sandbox-run` for execution and continuation,
`POST /api/workspace/workflow/publish` for the draft → live transition, and
source-record persistence for evidence.

## 1. Receipt DAG — agent-to-agent trace handoff

A parent workflow's receipt no longer ends at "HTTP 200 from the child".

- `InferenceRequest` accepts `parent_receipt_id` and `span_kind`
  (`ROOT` | `CHILD_TOOL` | `CHILD_WORKFLOW`). A `CHILD_*` span requires a
  parent id; `ROOT` with a parent is rejected before transport.
- An OpenAPI operation marked `x-growthub-workflow: true` (or targeting the
  canonical `/api/workspace/sandbox-run` path) is a **child workflow call**.
  The awaiting-tool-result envelope hands the executor the binding headers
  `X-Growthub-Child-Receipt-Required: true`, `X-Growthub-Parent-Span-ID`,
  and `X-Growthub-Parent-Receipt-ID`.
- The continuation must supply the child's full verification receipt on the
  matching `tool_results[]` entry (`child_receipt`). The parent gateway hashes
  it (`sha256(stableStringify(receipt))`) into
  `tool_audit.calls[].child_receipt_hash` and the receipt's `lineage.children[]`.
  Because the parent's own receipt hash covers those child hashes, the DAG
  chains `parent_hash -> child_hash -> grandchild_hash` without copying child
  evidence bodies.
- **Fail closed:** a declared child workflow call whose receipt was never
  ingested rejects the parent continuation with `child_receipt_missing` and
  `lineage.status: "incomplete"`; no transport call is made. A failed child is
  ingested as `child_status: "FAILED"` with its exact first error — recorded,
  never orphaned. A child receipt that closes a cycle onto the request's own
  receipt ancestry (directly or through its recorded children) is rejected
  with `child_receipt_cycle` instead of minting a self-referential edge.
- Multi-step custom-model workflow variants (`recursive-learning`, `agentic`,
  `eval-vs-base`) chain each step as a `CHILD_WORKFLOW` span of the previous
  step's receipt and return a workflow-level `receiptDag`
  (`growthub-receipt-dag-v1`) whose edges hash the exact persisted receipts.

Mapping note: the original design sketch called for a child-gateway HTTP
callback to `/internal/ingest-child-receipt`. In this single-workspace
runtime, child-receipt ingestion rides the existing continuation lane instead,
authenticated by the server-owned `prior_receipt_id` trust anchor — a stronger
binding than a bearer callback, and no third mutation path is invented.

## 2. Signed cache envelopes and semantic eviction

Every completion-cache entry now carries a signed envelope
(`lib/adapters/inference/cache.js`):

- The envelope binds `receipt_id`, `request_sha256`, model/adapter SHA-256,
  schema hash, workflow version, redaction state, TTL, and a
  **credential-derived `cache_version`**. The entry (key, bucket, response,
  envelope, expiry) is HMAC-SHA256-signed with a key resolved in order:
  operator `GROWTHUB_INFERENCE_CACHE_HMAC_KEY`, a key derived from the
  governed Redis token + URL + namespace, or a per-process ephemeral key for
  the bounded local cache. Rotating the Upstash credentials or namespace
  changes both key and version, so old signatures fail closed and the cache
  rebuilds safely. QStash credentials remain scheduler-only and are never
  used here.
- On lookup the gateway verifies signature, `cache_version`, and invalidation
  epochs. Any failure deletes the entry and reports a MISS with the integrity
  state (`envelope_signature_state`) — tampered evidence is never served.
- `InferenceSemanticCache.invalidate({ reason, scope, correctionReceiptId })`
  accepts `MODEL_UPDATE` / `SCHEMA_CHANGE` / `FEEDBACK_CORRECTION` /
  `SECURITY` and scopes: `exact_key` (POISONED tombstone with provenance),
  `model_sha256` / `schema_hash` / `workflow_id` (epoch bump — every older
  envelope in scope fails closed), and a semantic bucket for corrections.
  Invalidation is rate-limited (bounded per-minute window, default 60); a
  flooded call mutates nothing and reports `rateLimited: true`, so a hostile
  or runaway loop cannot stampede the cache.
- Key management: set `GROWTHUB_INFERENCE_CACHE_HMAC_KEY` (operator-owned) in
  production. The credential-derived fallback binds signatures to the Redis
  token — anyone holding that token can already write cache entries, so the
  derived key adds tamper evidence but not a second trust domain; the
  operator key does.
- **Feedback-driven poisoning** (`poisonCacheFromFeedback`): a thumbs-down
  with corrected ground truth resolves the original receipt's exact cache key
  and identity-scoped `semantic_bucket`, tombstones the key
  (`poisoned_by: <correction_receipt_id>`), and embeds the corrected truth as
  a poison marker. Subsequent semantically similar queries bypass the cache
  with `bypass_reason: CACHE_BYPASS_POISONED` (and the correction receipt id
  in `poisoned_by`), re-executing the model instead of replaying the
  hallucination. A poisoned bypass also does not re-store over the tombstone.

## 3. Multi-tier economic routing

`InferenceRequest` accepts `max_cost_cents` and `min_quality_score` (0.0–1.0).
The mothership router (`lib/custom-model-inference.js`) applies them across
its governed route tiers:

1. Cache first, as before — a replay spends nothing.
2. A local route may run only when its token-count estimate fits within a
   governed budget buffer (`economics.localBudgetBufferRatio`, 0.1–1.0,
   default 0.5), reserving headroom for a quality fallback. Cost estimates
   come from each route's declared `costModel`
   (`inputCentsPerMTokens`/`outputCentsPerMTokens`); a route without a cost
   model estimates zero and cannot be budget-gated, which stays visible in
   the receipt rather than guessed at.
3. After a local completion the gateway computes `actual_confidence` as the
   geometric-mean token probability from returned log-probabilities
   (`logprobs` is requested automatically when `min_quality_score` is set).
   Confidence below the floor triggers failover to the next governed route —
   capped by the remaining budget.
4. If no affordable fallback improves on it, the local result is returned
   **flagged** `QUALITY_UNMET`, never silently discarded or silently trusted.

The receipt's `routing_decision` block records reason
(`cost_capability` | `quality_fallback` | `default`), the local/cloud/actual
cost estimates, the confidence and its basis, and the quality verdict.
Honest boundary: a runtime that returns no log-probs yields
`confidence_basis: "unavailable"` and quality `UNVERIFIED` — a confidence
score is never fabricated.

## 4. Deterministic streaming redaction

`lib/adapters/inference/redaction.js` sits between the adapter response
stream and the client stream:

- Precompiled patterns (SSN, email, phone-with-separators, Luhn-validated
  13–19-digit cards) run incrementally over token chunks. A carry buffer with
  token-boundary-aware cuts guarantees a match can never leak by splitting
  across chunks, and streaming output is byte-identical to one-shot redaction
  of the full text.
- Matches are replaced with `[REDACTED]`. Each redaction appends a receipt
  event `{ type, start_char_offset, length, redacted_preview_hash }`. The
  preview hash is **always keyed** (HMAC-SHA256 under the workspace signing
  key, else the operator cache HMAC key, else a per-process ephemeral key) —
  an unkeyed hash of low-entropy PII such as a 9-digit SSN would be trivially
  reversible by enumeration once a receipt is shared.
- When any redaction fires, the gateway caches **only the redacted
  response**; the envelope records `redacted: true` plus the event count, and
  cache replays report the same redaction evidence.
- Governed configuration: `metadata.inferenceControlPlane.redaction =
  { enabled: true, patterns?: ["ssn","email","phone","credit-card"] }` on the
  API Registry row. Off by default; a request cannot enable or disable it.

## 5. Inference manifest — draft → publish → runtime binding

`lib/adapters/inference/manifest.js` compiles an `InferenceManifest`
(composite SHA-256 over base-model SHA + ordered allowed-adapter SHAs +
schema hash, plus tool OpenAPI hash, cache TTL, allowed adapters, max tokens,
cost policy) and signs it with `GROWTHUB_WORKSPACE_SIGNING_KEY` (HMAC;
explicitly `unsigned` when no key is configured — never faked).

- **Draft test:** every custom-model invocation compiles and signs the
  manifest from the governed control config it actually enforced; the
  sandbox-run record persists it.
- **Publish:** `POST /api/workspace/workflow/publish` recompiles each
  referenced live API Registry identity and blocks with
  `inference_manifest_mismatch` + a field-level diff when the live composite
  no longer matches the tested manifest. Verified manifests are stored on the
  published row (`inferenceManifests`) and in the publish delta. The field is
  **publish-owned**: the PATCH policy rejects direct writes, so a manifest
  cannot be forged through the config lane. Old manifests remain in
  `orchestrationDeltas` for rollback lineage.
- **Runtime:** sandbox-run passes the published manifests through the
  orchestration runner; the gateway verifies the resolved identity against
  the manifest and rejects a pool serving different bytes with
  `manifest_composite_mismatch`. The receipt's `manifest` block records
  `verified`/`mismatch`/`unsigned` plus the manifest hash, which is also
  stamped on the root OTel span. Rows without resolvable artifact hashes are
  reported `available: false` with the reason — no composite is synthesized
  from a missing artifact.

## Honest boundaries preserved

- No fabricated P/D handoffs: phase routing evidence is unchanged; unified
  execution stays honestly labeled.
- No fake tool execution: external results remain caller-returned and
  hash-correlated; child receipts add evidence, and an
  `executor_receipt_ref` still cannot upgrade authority.
- No credential confusion: cache signing/versioning uses only the governed
  Redis credential families; QStash values are never accepted.
- Receipts first: all five deltas landed in `@growthub/api-contract@1.7.0`
  and the receipt/persistence layer; no UI surface claims state the receipt
  cannot prove.

## Source and verification map

| Concern | Source |
| --- | --- |
| Public contract | `packages/api-contract/src/inference.ts` (1.7.0) |
| Receipt DAG lineage | `apps/workspace/lib/adapters/inference/lineage.js` |
| Signed envelopes, invalidation, poisoning | `apps/workspace/lib/adapters/inference/cache.js` |
| Economic routing evidence + confidence | `apps/workspace/lib/adapters/inference/gateway.js` |
| Route-tier budget/quality router | `apps/workspace/lib/custom-model-inference.js` |
| Streaming redaction | `apps/workspace/lib/adapters/inference/redaction.js` |
| Manifest compiler/verifier | `apps/workspace/lib/adapters/inference/manifest.js` |
| Publish gate + manifest storage | `apps/workspace/app/api/workspace/workflow/publish/route.js` |
| Runtime manifest pass-through | `apps/workspace/app/api/workspace/sandbox-run/route.js`, `apps/workspace/lib/orchestration-graph-runner.js` |
| Publish-owned manifest field | `apps/workspace/lib/workspace-patch-policy.js` |

Certification proof from the repository root:

```bash
node --test \
  scripts/unit-inference-evidentiary-backbone.test.mjs \
  scripts/unit-inference-control-plane.test.mjs \
  scripts/unit-custom-model-inference.test.mjs \
  scripts/unit-workspace-patch-policy.test.mjs
```

The backbone suite captures the end-to-end success flow: a parent call
awaiting a child workflow → child receipt ingestion into a complete Merkle
DAG → streaming redaction with redacted-only caching → feedback correction
poisoning the exact key and semantic neighborhood → a semantically similar
query bypassing with `CACHE_BYPASS_POISONED` and routing economically under
budget → manifest drift blocking publish and runtime alike.
