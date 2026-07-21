# Governed Compute Realization V1 — Proof Index

Release: compute becomes a replaceable governed realization of the existing
custom-model lifecycle. One universe: API Registry rows for provider
identity, `model-training-run` receipts for evidence, `POST
/api/workspace/sandbox-run` for execution authority, the existing evaluation
harness as the only route to promotion.

Classification is strict:

- **Passed** — executed in this repository during this release, output banked.
- **Inherited** — proven by an existing shipped suite this release did not weaken (re-run green).
- **Unexecuted** — real external evidence requiring credentials/paid capacity/enterprise infrastructure that genuinely does not exist in the execution environment. All source implementation, conformance tests, negative cases, and recovery states for these cells ARE complete; only the live external observation is missing.

Reproduce everything locally:

```bash
npm run test:compute-certification
```

This is the canonical unconditional command used by CI on pull requests to
`main` and pushes to `main`. It fails if any required suite, dependency, or
either composed proof is missing.

## The proof set

| Proof | What it proves | Status | Where |
| --- | --- | --- | --- |
| A. Local-fit path | real preflight → sized plan → honest CPU-local profile → deterministic resolver selects LOCAL → owned-hardware evidence | **Passed** (real certification machine: 8 GB RAM / no GPU → `gemma3:1b`) | `e2e-compute-realization-loop.mjs` §A |
| B. Local-insufficient path | 70 B ask (80 GB VRAM/GPU) → exact machine-readable reasons → remote profile derived | **Passed** | `evidence/proof-b-local-insufficient.json`, e2e §B |
| C. Deterministic placement | shuffled candidates → identical decision; ranking; every skipped candidate explained | **Passed** | `evidence/proof-c-deterministic-placement.json`, `unit-compute-resolver` |
| D. Budget | unknown cost + excess cost under a hard cap → fail closed, reasons named | **Passed** | `evidence/proof-d-budget.json`, `unit-compute-resolver` |
| E. Allocation lifecycle | real `POST /api/workspace/sandbox-run` → durable decision/quote → allocation persisted before polling → queued/running/checkpoint/terminal evidence persisted progressively | **Passed** (booted temp workspace; fake provider HTTP boundary only) | `e2e-compute-route-realization-loop.mjs` |
| F. Crash-safe idempotency | injected failure after allocation → reload durable Workspace state → same request adopts the known resource; provider create count remains exactly one | **Passed** | `e2e-compute-route-realization-loop.mjs` |
| G. Artifact honesty | provider SHA claim alone remains non-promotable; route materializes bytes, verifies SHA-256, and binds the artifact to the existing training receipt | **Passed** | `e2e-compute-route-realization-loop.mjs`, `unit-compute-adversarial` |
| H. Evaluation boundary | verified remote artifact traverses the real route/receipt import and existing evaluation lineage; loss retains and a proven win promotes through Mothership authority | **Passed** | `e2e-compute-route-realization-loop.mjs` |
| I. Recovery | governed resume uses a proven same-run/work-spec checkpoint and writes `compute-resuming`; foreign/wrong-work-spec checkpoints fail closed | **Passed** | `e2e-compute-route-realization-loop.mjs`, `unit-compute-adversarial` |
| J. Lifecycle controls | governed cancel → provider cancel → release → durable reload truth; failed release retains capacity/cost risk | **Passed** | `e2e-compute-route-realization-loop.mjs`, `unit-compute-adversarial` |
| K. Server-owned authority | the browser persists only a customer request snapshot; the booted route compiles + HMAC-seals its own intent/work-spec authority from EXACTLY-ONE bound training-version lineage; a self-consistent caller-planted spec is ignored; post-seal drift fails closed BEFORE provider submission; key rotation with identical content reseals explicitly while an ephemeral key never authorizes remote spend; direct PATCH forgery INCLUDING omission/deletion/rename (journal, allocation, evaluation/promotion, artifact identity, status demotion, frozen request, row/object deletion) is rejected 422 `training_evidence_field` while byte-identical echo stays writable; local-only asks make zero remote adapter calls; idempotency identity is bound to the sealed workload | **Passed** | `unit-compute-authority`, `unit-compute-adversarial`, `unit-compute-execution`, `unit-workspace-patch-policy`, `unit-compute-contract`, `e2e-compute-route-realization-loop.mjs` |

## End-to-end causation proof

The booted temporary-workspace harness proves the shipped route rather than
independent library calls:

`durable customer policy + request snapshot → exact adaptive plan →
SERVER-compiled, HMAC-sealed intent/work spec (compute authority) →
deterministic resolver → durable decision/quote → durable allocation → adapter
execute → progressive events/checkpoint → crash/reload adoption → resume/cancel/
release → byte/SHA verification → existing training receipt import → existing
evaluation → retain/promote → Mothership → reload truth`.

Its large-model fixture requires multi-GPU/high-VRAM capacity and asserts one
unchanged requirements/profile lineage across the sealed authority, receipt,
resolver decision, provider submission, artifact, and evaluation evidence —
a lineage the caller cannot author: the seeded rows carry only
`growthub-compute-request-v1` snapshots and the booted server compiles the
authority itself. The canonical packet also covers the portable
cloud/local/reserved policy, hard-budget/locality gates, profile floors, UI
route wiring, PATCH evidence protection, and remote-aware customer progress
semantics across 13 focused suites.

## Production hardening proofs (post-K consolidation)

The hardening workstream that followed proof K closed every remaining
implementation gap named in the PR review. Each row below is **Passed** at
this head via `npm run test:compute-certification` (29 suites, 217 tests,
plus both composed proofs).

| Proof | What it proves | Where |
| --- | --- | --- |
| L. Outbound network policy (SSRF boundary) | DNS-pinned provider networking; metadata-service blocking; mixed public/private DNS-rebinding refusal; credential-bearing URL rejection; redirect refusal; bounded provider JSON responses; ONE policy authority (`compute-network-policy.js`) — registered remote adapters always execute behind the governed transport, and a caller-injected fetch can never bypass it (registry wrap is test-pinned) | `unit-compute-network-policy`, `unit-compute-outbound-policy`, adapter registration tests |
| M. Signed remote corpus data plane | server-materialized export-tagged bytes; signed grants whose bearer URL never enters evidence; delivery receipts bound to run + work-spec + corpus + export identity; idempotent redelivery; tamper/expiry/foreign-work-spec fail closed | `unit-compute-data-plane` |
| N. Durable production data store | compute data plane uses Supabase Storage in configured production deployments and refuses ephemeral production persistence | `unit-compute-data-store` |
| O. Provider work-spec + corpus attestation | a promotable artifact must attest the EXACT sealed work-spec and corpus identities; an unattested artifact is named non-promotable (`artifact-provider-attestation-missing`); provider-authored evaluation scores are stripped at collection and cannot enter artifact evidence | `unit-compute-provider-attestation`, `unit-compute-execution`, e2e §G |
| P. Deterministic paid-allocation reconciliation | an ambiguous provider accept is reconciled-or-pending with exactly one provider create; the adopted allocation keeps `reconciled: true` in normalized evidence; continuation adopts without re-allocating | `unit-compute-allocation-idempotency`, `unit-compute-allocation-reconciliation` |
| Q. Workspace-owned canonical evaluation | only the workspace-canonical evaluator (existing eval-vs-base workflow over governed holdout traces) may mint benchmark verdicts; explicit customer holdouts take precedence; promotion requires live runtime proof of the exact artifact SHA (generic endpoints stay pending) | `unit-compute-canonical-evaluation`, booted route proof |
| R. Release-before-evaluation ordering | paid provider capacity is released (and confirmed) before any workspace benchmark work can begin | `unit-compute-evaluation-order` |
| S. Durable observation continuation | remote observation continues the SAME governed run through sandbox-run (bounded cadence, no overlap, no parallel mutation route); production uses signed, deduplicated QStash continuations; a pending provider run classifies as live (`pending`), never failed | `unit-compute-observation-wiring`, `unit-compute-observation-scheduler`, `unit-compute-durable-observation` |
| T. Strict hard-budget policy | a hard cap requires a positive finite JSON number; zero is NOT an unlimited sentinel; numeric strings, negatives, NaN/Infinity, and `allowUnknownCost` under hard-cap are refused; validation is idempotent over its own normalized output (absent caps stay absent) | `unit-compute-budget-policy`, `unit-compute-resolver`, e2e §D |
| U. Crash-window delivery truth | after a crash between provider accept and completion, restart adopts the SAME allocation and verifies dataset delivery against the journaled grant the provider actually fetched under — a freshly issued grant binds only when the same invocation performs the create | booted route proof (`route-crash`), `unit-compute-execution` |

The temporary CI applicator machinery that staged this work
(`one-shot-compute-network-hardening.yml`, `apply-compute-network-integration.yml`,
`scripts/apply-compute-*` / `repair-compute-*` / `run-compute-*-idempotent`)
has been fully consumed and removed: the hardened implementation is committed
directly in the production files and the six core workflows are the only CI.

## Live external evidence cells

| Cell | Status | Exact boundary |
| --- | --- | --- |
| Live Runpod pod/serverless allocation | **Passed (live)** | The live proof executed the governed DNS-pinned transport + registered adapter against the real Runpod REST and GraphQL control planes on 2026-07-21. Five checks banked secret-free evidence for pod inventory, non-zero pricing, capability honesty, normalized lifecycle observation, and a byte-identical zero-create pod set. The operator pod remained running; no create, stop, or terminate call was made. See [`live-runpod/PROOF.md`](./live-runpod/PROOF.md) and the banked `live-00` through `live-03` JSON artifacts. |
| Live Modal function proof | **Unexecuted** | `MODAL_KEY`/`MODAL_SECRET` proxy tokens and a pre-deployed execution function do not exist here. Adapter + 9-test conformance suite complete; the deployed-function contract is documented in the adapter header. |
| Live Ray Jobs endpoint proof | **Unexecuted** | No reachable Ray cluster head (port 8265) exists in this environment. The Jobs API contract (trailing slash, at-most-once submission_id, 5-state map) is pinned by 11 conformance tests. |
| Live HyperPod / CoreWeave cluster proof | **Unexecuted** | Enterprise AWS/CoreWeave clusters genuinely unavailable. Both realizations are physical bindings of the SAME tested Ray seam; portability is proven by the identical-submission test. |
| Live local training execution (QLoRA pipeline) | **Inherited** | The local runner remains the existing authority; its live proof remains `docs/proofs/distillation-flywheel/` + `e2e-distillation-flywheel-loop.mjs`. |
| Regression: training/distillation/inference/resolver/sandbox suites | **Inherited** | Re-run green at the release SHA — see EVIDENCE.md. |

A unit test is not a live-provider proof. A fixture is not a real GPU
allocation. A provider HTTP 200 is not a verified model artifact. A completed
training run is not a promotion. This index never claims otherwise.
