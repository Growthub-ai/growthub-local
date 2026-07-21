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

## Live external evidence cells

| Cell | Status | Exact boundary |
| --- | --- | --- |
| Live Runpod pod/serverless allocation | **Unexecuted** | `RUNPOD_API_KEY` is not present in this execution environment and paid GPU capacity is required. The adapter, conformance suite (11 tests incl. e2e over faked transport), failure/recovery behavior, and idempotent reconcile-by-name are complete. |
| Live Modal function proof | **Unexecuted** | `MODAL_KEY`/`MODAL_SECRET` proxy tokens and a pre-deployed execution function do not exist here. Adapter + 9-test conformance suite complete; the deployed-function contract is documented in the adapter header. |
| Live Ray Jobs endpoint proof | **Unexecuted** | No reachable Ray cluster head (port 8265) exists in this environment. The Jobs API contract (trailing slash, at-most-once submission_id, 5-state map) is pinned by 11 conformance tests. |
| Live HyperPod / CoreWeave cluster proof | **Unexecuted** | Enterprise AWS/CoreWeave clusters genuinely unavailable. Both realizations are physical bindings of the SAME tested Ray seam; portability is proven by the identical-submission test. |
| Live local training execution (QLoRA pipeline) | **Inherited** | The local runner remains the existing authority; its live proof remains `docs/proofs/distillation-flywheel/` + `e2e-distillation-flywheel-loop.mjs`. |
| Regression: training/distillation/inference/resolver/sandbox suites | **Inherited** | Re-run green at the release SHA — see EVIDENCE.md. |

A unit test is not a live-provider proof. A fixture is not a real GPU
allocation. A provider HTTP 200 is not a verified model artifact. A completed
training run is not a promotion. This index never claims otherwise.
