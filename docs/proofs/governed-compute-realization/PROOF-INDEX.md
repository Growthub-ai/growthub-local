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
node --test scripts/unit-compute-contract.test.mjs \
  scripts/unit-compute-capacity-profiles.test.mjs \
  scripts/unit-compute-provider-registry.test.mjs \
  scripts/unit-compute-resolver.test.mjs \
  scripts/unit-compute-execution.test.mjs \
  scripts/unit-compute-runpod.test.mjs \
  scripts/unit-compute-modal.test.mjs \
  scripts/unit-compute-ray.test.mjs \
  scripts/unit-compute-customer-state.test.mjs \
  scripts/unit-compute-adversarial.test.mjs
node scripts/e2e-compute-realization-loop.mjs --write-evidence
```

## The proof set

| Proof | What it proves | Status | Where |
| --- | --- | --- | --- |
| A. Local-fit path | real preflight → sized plan → profile → the deterministic resolver selects LOCAL → owned-hardware allocation evidence | **Passed** (real machine evidence: this container, 16 GB RAM / no GPU → `gemma3` cpu-standard plan) | `evidence/proof-a-local-fit.json`, `evidence/machine-evidence.json`, e2e §A |
| B. Local-insufficient path | 70 B ask (80 GB VRAM/GPU) → exact machine-readable reasons → remote profile derived | **Passed** | `evidence/proof-b-local-insufficient.json`, e2e §B |
| C. Deterministic placement | shuffled candidates → identical decision; ranking; every skipped candidate explained | **Passed** | `evidence/proof-c-deterministic-placement.json`, `unit-compute-resolver` |
| D. Budget | unknown cost + excess cost under a hard cap → fail closed, reasons named | **Passed** | `evidence/proof-d-budget.json`, `unit-compute-resolver` |
| E. Allocation lifecycle | quote → allocate → running → checkpoint → complete → release, all normalized evidence | **Passed** (faked transport; see live cells below) | `evidence/proof-e-lifecycle.json`, `unit-compute-execution` |
| F. Idempotency | same governed request replayed → duplicate expensive allocation refused, fail closed; explicit new attempt allowed | **Passed** | `evidence/proof-f-idempotency.json`, `unit-compute-execution` |
| G. Artifact honesty | provider complete + artifact absent → non-promotable; wrong sha256 → non-promotable | **Passed** | `evidence/proof-g-artifact-honesty.json`, `unit-compute-adversarial` |
| H. Evaluation boundary | losing candidate → `promoted:false`, Mothership route unchanged; winning candidate → existing promotion boundary → router prefers the verified student | **Passed** (over the SAME `deriveBenchmarkWins`/`deriveActiveRoute` the flywheel ships) | `evidence/proof-h-evaluation-boundary.json` |
| I. Recovery | proven checkpoint → interruption → new governed attempt resumes → completion; foreign-run checkpoints never satisfy resume | **Passed** | `evidence/proof-i-recovery.json`, `unit-compute-adversarial` |
| J. Release failure | cancel → provider release failure → `capacityMayStillExist` / `costMayAccrue` durable and visible | **Passed** | `evidence/proof-j-release-failure.json`, `unit-compute-adversarial` |

## Live external evidence cells

| Cell | Status | Exact boundary |
| --- | --- | --- |
| Live Runpod pod/serverless allocation | **Unexecuted** | `RUNPOD_API_KEY` is not present in this execution environment and paid GPU capacity is required. The adapter, conformance suite (11 tests incl. e2e over faked transport), failure/recovery behavior, and idempotent reconcile-by-name are complete. |
| Live Modal function proof | **Unexecuted** | `MODAL_KEY`/`MODAL_SECRET` proxy tokens and a pre-deployed execution function do not exist here. Adapter + 9-test conformance suite complete; the deployed-function contract is documented in the adapter header. |
| Live Ray Jobs endpoint proof | **Unexecuted** | No reachable Ray cluster head (port 8265) exists in this environment. The Jobs API contract (trailing slash, at-most-once submission_id, 5-state map) is pinned by 11 conformance tests. |
| Live HyperPod / CoreWeave cluster proof | **Unexecuted** | Enterprise AWS/CoreWeave clusters genuinely unavailable. Both realizations are physical bindings of the SAME tested Ray seam; portability is proven by the identical-submission test. |
| Live local training execution (QLoRA pipeline) | **Inherited** | The local runner execution path is unchanged (byte-for-byte fallthrough proven); its live proof remains `docs/proofs/distillation-flywheel/` + `e2e-distillation-flywheel-loop.mjs` (re-run green at this SHA: 17/17). |
| Regression: training/distillation/inference/resolver/sandbox suites | **Inherited** | Re-run green at the release SHA — see EVIDENCE.md. |

A unit test is not a live-provider proof. A fixture is not a real GPU
allocation. A provider HTTP 200 is not a verified model artifact. A completed
training run is not a promotion. This index never claims otherwise.
