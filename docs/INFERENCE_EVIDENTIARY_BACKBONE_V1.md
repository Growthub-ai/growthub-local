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
  never orphaned. Cycles are refused at three depths: ingestion rejects a
  child receipt that closes onto the request's known ancestry
  (`child_receipt_cycle`) — and multi-step workflows thread their FULL
  accumulated receipt chain into that check, not just the immediate parent;
  DAG assembly runs a transitive DFS (`detectLineageCycle`) over the whole
  recorded edge set and stamps `acyclic` (with the offending `cycle_path`
  when violated) onto the `receiptDag`, which also catches loops recorded by
  concurrent continuations that no single ingestion check could see.
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
  Invalidation is rate-limited with one bounded per-minute window **per
  reason** (default 60 each); a flooded call mutates nothing and reports
  `rateLimited: true`. Because reasons never share a budget, a runaway
  `FEEDBACK_CORRECTION` loop can exhaust its own lane while `SECURITY`
  invalidations keep landing. The window is per process; shared-Redis
  deployments rate-limit each process independently.
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
  **Trust boundary:** the receipt MUST be resolved server-side — any
  HTTP-facing caller supplies a `receiptResolver` and the caller-shaped
  receipt object is discarded; a non-receipt object is rejected outright, and
  a bucket that is not the canonical scope-hash pair is dropped rather than
  poisoned, so a forged receipt cannot target another scope's neighborhood.
  Bucket derivation itself hashes tenant, app, and integration identity, so
  markers are structurally scope-isolated (mechanical property test tracked
  in the follow-up e2e issue).

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
  reversible by enumeration once a receipt is shared. The receipt records
  which tier hashed the previews (`preview_key_source` plus the non-secret
  `preview_key_id` fingerprint), so an operator can see when hashes are
  workspace-stable versus process-ephemeral (uncorrelatable across
  restarts), and key rotation is visible as a fingerprint change.
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

## Live-execution enforcement (production trust boundaries)

The deltas above describe the mechanism; this section states exactly what is
enforced, fail-closed, at a **live** (published, non-draft) execution. These
guarantees are exercised by `scripts/unit-inference-evidentiary-backbone.test.mjs`
and `scripts/unit-inference-route-wiring.test.mjs`, both run in CI (below).

- **Live mode is server-owned.** A run is live when the persisted row's
  `lifecycleStatus` is `live` (case-normalized) and the caller did not request
  `useDraft`. `lib/sandbox-execution-context.js::buildInferenceTrustContext` is
  the single seam that derives this from row state; request metadata and
  workflow payloads cannot enable or disable it. A draft run of a live row is
  the only caller-selectable downgrade, and draft evidence can neither publish
  nor replay live state.
- **Child receipts require canonical server-side resolution in live mode.** A
  governed child-workflow continuation on a live run MUST carry a server-owned
  `childReceiptResolver`; the caller supplies only an opaque `child_receipt_id`.
  A bare hash is rejected (`child_receipt_hash_only`); a caller-supplied
  receipt body is discarded and the canonical receipt is loaded from persisted
  records and re-hashed server-side. Missing resolver →
  `child_receipt_resolver_required`; unresolvable/expired/deleted receipt →
  `child_receipt_missing`; wrong parent → `child_receipt_parent_mismatch`;
  cross-tenant → `child_receipt_scope_mismatch`; replay across tool calls →
  `child_receipt_replayed`. Every failure blocks before transport and before
  cache replay. The resolved link records `evidence_basis: "server-resolved"`;
  a development/draft lane that ingests a caller body records
  `evidence_basis: "caller-draft"` and cannot publish or run live.
- **Live scope cannot fall back to a default.** Live execution requires a
  concrete server-owned tenant scope; the `workspace-local` placeholder and
  caller-supplied `metadata.workspace_id` do not count as isolation
  (`child_receipt_scope_unbound`), and a child receipt with no
  `cache_scope_sha256` cannot bind.
- **A lineage cycle is terminal.** `combineExecutions` returns `ok: false`
  with `errorCode: "receipt_lineage_cycle"` (bounded `cycle_path`) — a cyclic
  receipt graph is refused as evidence even when every step succeeded, never
  a flagged success. Cycle detection is an iterative, bounded O(V+E) walk;
  a graph beyond the node/edge/id bounds is refused as
  `receipt_graph_unverifiable` rather than partially verified.
- **Unknown route pricing cannot bypass a hard budget.** Under
  `max_cost_cents`, a metered (cloud) route whose pricing is absent, malformed,
  negative, or non-finite is ineligible (`cost_unknown`) — pricing is never
  coerced to zero. A governed operator ceiling
  (`economics.assumedRouteCostCents`, config-only, never request input) may
  stand in as a conservative estimate, and the receipt's
  `routing_decision.reason_detail` says so; an assumed price is never
  presented as a computed one.
- **Distributed cache uncertainty fails safe.** When shared invalidation
  state (epoch, poison tombstone, or semantic poison marker) is unreachable,
  the entry is withheld as a `remote_unverified` miss/bypass rather than
  served from local state — an incident degrades cache efficiency (extra model
  work), never integrity. The refused verdict and a bounded, secret-free
  reason surface in `cache.integrity_state` / `cache.integrity_reason`. A
  local-only cache (no Redis) remains usable but claims no shared guarantee.
- **CI enforces the feature.** `npm run test:inference-certification`
  (`scripts/run-inference-certification.mjs`) provisions the exact pinned AJV
  validator from `scripts/certification-deps` (committed manifest + lockfile,
  `npm ci`, lifecycle scripts disabled) and runs the control-plane,
  evidentiary-backbone, and route-wiring suites. The CI `verify` job runs this
  command on every pull request to `main` and every push to `main`; there is
  no skip lane.

Operator-facing codes are enumerated as `InferenceGovernanceCode` in
`packages/api-contract/src/inference.ts`.

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
| Publish gate (pure seam) | `apps/workspace/lib/workflow-publish-promotion.js`, `apps/workspace/app/api/workspace/workflow/publish/route.js` |
| Live-mode trust context (pure seam) | `apps/workspace/lib/sandbox-execution-context.js` |
| Runtime manifest + resolver pass-through | `apps/workspace/app/api/workspace/sandbox-run/route.js`, `apps/workspace/lib/orchestration-graph-runner.js` |
| Publish-owned manifest field | `apps/workspace/lib/workspace-patch-policy.js` |
| Certification deps + runner | `scripts/certification-deps/`, `scripts/run-inference-certification.mjs` |
| Route-wiring integration proof | `scripts/unit-inference-route-wiring.test.mjs` |

Certification proof from the repository root (the same command CI runs — it
provisions the pinned validator, no pre-existing `node_modules` required):

```bash
npm run test:inference-certification
```

The backbone suite captures the end-to-end success flow: a parent call
awaiting a child workflow → child receipt ingestion into a complete Merkle
DAG → streaming redaction with redacted-only caching → feedback correction
poisoning the exact key and semantic neighborhood → a semantically similar
query bypassing with `CACHE_BYPASS_POISONED` and routing economically under
budget → manifest drift blocking publish and runtime alike. It also carries
the adversarial matrices for the live-execution boundaries above (forged and
replayed child receipts, unbound tenant scope, absent resolver, terminal
lineage cycles, `cost_unknown` budget enforcement, and `remote_unverified`
distributed-cache fail-safe), each asserting the forbidden side effects
(`transportCalls === 0`, no cache write) did not occur. `unit-inference-route-wiring.test.mjs`
proves the same enforcement is wired through the pure publish and sandbox
seams the routes call.

Scope boundary: a full booted-workspace HTTP/browser E2E (publish route,
sandbox-run/continuation route, and runtime gateway exercised over real HTTP
against a booted export) remains tracked in **#295** per the repository's
unit-vs-boot convention. The route-wiring integration suite closes the
code-level wiring gap in the unit lane so #295 covers genuine
booted-environment behavior, not missing production enforcement.
