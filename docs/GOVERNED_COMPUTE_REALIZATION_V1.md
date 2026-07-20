# Governed Compute Realization V1

Compute is a replaceable governed REALIZATION of the existing custom-model
lifecycle — never a second universe. The training plan decides WHAT to
train; the deterministic Compute Resolver decides WHERE it may execute;
providers supply replaceable hardware; receipts prove every consequential
transition; evaluation remains the only route to promotion.

Contract: `@growthub/api-contract/compute` (1.8.0). Full architecture,
invariants, and the banked proof set:
[`docs/proofs/governed-compute-realization/`](./proofs/governed-compute-realization/PROOF-INDEX.md)
(PROOF-INDEX / ARCHITECTURE / EVIDENCE / IMPLEMENTATION-LEDGER + `evidence/`).

## Canonical sources (unchanged)

| Concern | Source |
| --- | --- |
| Provider identity + secret references | ordinary `api-registry` rows carrying `metadata.computeProvider` (schema `growthub-compute-provider-v1`; env-var NAMES only — credential-shaped values invalidate the row, fail closed) |
| Custom-model / training identity | `model-training` rows (untouched) |
| Compute execution evidence | `model-training-run` receipts — additive `compute` block (`growthub-compute-evidence-v1`): decision, allocation, the 12 normalized events, checkpoints, artifact ref |
| Execution authority | `POST /api/workspace/sandbox-run` (additive provider-compute branch; there is NO `/api/compute/run`) |
| Read surface | `GET /api/workspace/compute` — derives adapters/providers/capacity, read-only by construction |
| Artifact trust | existing `deriveArtifactState` floors; provider "completed" with no artifact / wrong sha256 is non-promotable |
| Promotion | existing eval harness only (`promoted` is derived, never writable); Mothership routing unchanged |

## The chain

adaptive student plan → `deriveComputeRequirements` (one sizing ladder) →
Capacity Profile (7 vendor-free shapes: harvest-only, serve-local,
burst-gpu, warm-inference, single-gpu-finetune, multi-gpu-finetune,
distributed-training) → `resolveCompute` (fail-closed gates: provider state,
profile, GPU class/count/VRAM, memory, storage, checkpointing, distributed +
gang, region, residency, duration, quote freshness, budget — unknown cost is
NEVER zero; then deterministic ranking ending in a stable provider-id
tiebreak, every skipped candidate machine-explained) → deterministic
idempotent allocation (replay of an unreleased allocation fails closed) →
evidence-gated lifecycle (forged running/completion refused, duplicate
provider event ids refused, resume needs a proven run-scoped checkpoint) →
artifact honesty → existing verification/evaluation/promotion → release
(failure stays durably visible: `capacityMayStillExist` / `costMayAccrue`).

## Adapters (the only provider-specific layer)

Registry: `lib/adapters/compute/` (`registerComputeProviderAdapter`, global
Map, sandbox-adapter philosophy). Shipped: `local-machine` (preflight
evidence, owned hardware), `runpod-pods` (REST v1 + GraphQL pricing +
serverless v2; no multi-node claim; checkpoints need a network volume),
`modal-functions` (pre-deployed proxy-authed execution function;
attestation-gated clustered/warm/volume claims), and the Ray family
(`ray-cluster` factory → `aws-hyperpod-ray`, `coreweave-ray`) binding the
portable plan to already-authorized cluster endpoints — Growthub Local never
procures, bills, or fleet-manages clusters (GH App authority). The same
distributed plan submits the identical Ray job body on all three
(test-proven portability).

## Customer surface

One pure deriver (`lib/compute-customer-state.js`) feeds the
TrainingHandoffModal disclosure and the /custom-models cockpit line. Policy
vocabulary: Automatic / Local / Cloud compute / Reserved cluster ("Local" =
the existing pipeline byte-for-byte). 19 evidence-derived states from
"checking machine" to "promoted"; provider internals never enter customer
text; there is no compute progress percentage anywhere.
