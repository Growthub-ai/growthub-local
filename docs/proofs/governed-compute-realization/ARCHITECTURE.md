# Governed Compute Realization V1 — Architecture

> The customer owns one evolving Custom Model identity. The training plan
> decides what should be learned. The Compute Resolver decides where it may
> execute. Providers supply replaceable hardware. Receipts prove every
> consequential transition. Evaluation remains the only route to promotion.

## One universe

No new stores, no new authorities. Every compute concern is a realization of
an existing governed primitive:

```
CUSTOM MODEL IDENTITY (model-training row — unchanged)
        │
        ├── Model realization      → Mothership policy row (unchanged; deriveActiveRoute)
        ├── Compute realization    → Compute Resolver (NEW, pure) over
        │                            API Registry provider rows (growthub-compute-provider-v1)
        │                            ├── local machine   (builtin, preflight evidence)
        │                            ├── serverless/burst (runpod-pods, modal-functions)
        │                            ├── warm capacity    (same adapters, attested)
        │                            └── distributed      (ray-cluster → aws-hyperpod-ray / coreweave-ray)
        ├── Data realization       → governed corpus (unchanged)
        └── Evidence realization   → model-training-run receipts + source records
                                     (additive `compute` block, distillation precedent)
```

The end-to-end loop:

```
governed traces → corpus → adaptive student plan (WHAT)
  → compute requirements (deriveComputeRequirements — the ONE sizing ladder)
  → Capacity Profile (7 governed shapes, vendor-free)
  → Compute Resolver (hard fail-closed gates → deterministic ranking)
  → quote (quoteObservedAt/quoteExpiresAt — an expired quote is not evidence)
  → allocation (deterministic idempotency key; replay fails closed)
  → governed execution (the EXISTING sandbox-run seam — no /api/compute/run)
  → normalized events (12 types; forged/stale/duplicate events refused)
  → checkpoint (locator+sha256 or it is not a checkpoint; run-scoped)
  → artifact (locator+sha256 or non-promotable; hash mismatch non-promotable)
  → SHA/lineage verification (existing deriveArtifactState floors — unchanged)
  → evaluation (existing deriveBenchmarkWins — promoted is DERIVED, never input)
  → promote only on win (existing boundary; router prefers the verified student)
  → Mothership route update (existing deriveActiveRoute — unchanged)
  → release capacity (releaseConfirmed or capacityMayStillExist/costMayAccrue stay true)
```

## Module map

| Layer | File | Nature |
| --- | --- | --- |
| Shared contract | `packages/api-contract/src/compute.ts` (`@growthub/api-contract/compute`, 1.8.0) | additive types + vocabularies + guards |
| Capacity Profiles + requirements | `apps/workspace/lib/compute-capacity-profiles.js` | pure |
| Provider registry derivation | `apps/workspace/lib/compute-provider-registry.js` | pure (credential firewall) |
| Deterministic resolver | `apps/workspace/lib/compute-resolver.js` | pure |
| Evidence + lifecycle fold | `apps/workspace/lib/compute-evidence.js` | pure |
| Execution orchestrator | `apps/workspace/lib/compute-execution.js` | IO-injected, called from sandbox-run |
| Customer state | `apps/workspace/lib/compute-customer-state.js` | pure (both UI surfaces) |
| Adapter registry | `apps/workspace/lib/adapters/compute/compute-adapter-registry.js` | global-Map (sandbox precedent) |
| Local provider | `apps/workspace/lib/adapters/compute/default-local-machine.js` | wraps preflight evidence |
| Runpod | `apps/workspace/lib/adapters/compute/runpod-compute.js` | REST v1 + GraphQL + serverless v2 |
| Modal | `apps/workspace/lib/adapters/compute/modal-compute.js` | pre-deployed proxy-authed function |
| Ray + clusters | `apps/workspace/lib/adapters/compute/ray-cluster-compute.js` | factory: ray-cluster / aws-hyperpod-ray / coreweave-ray |
| Read surface | `apps/workspace/app/api/workspace/compute/route.js` | GET only, derives, never mutates |
| Execution seam | `apps/workspace/app/api/workspace/sandbox-run/route.js` | additive provider-compute branch |
| UI | `TrainingHandoffModal.jsx` + `CustomModelsLedger.jsx` + `ComputeRealizationPanel.jsx` | render the one deriver |

(`apps/workspace` = `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace`.)

## Architectural invariants (verified by tests)

1. **No second source of truth.** Provider identity = ordinary API Registry
   rows; decisions/allocations/events/checkpoints/artifacts live INSIDE the
   `model-training-run` receipt (`compute` block, JSON column). No compute
   database, no job store, no second run system.
2. **No provider authority.** A provider event advances state only with
   evidence (allocation id before allocated; applied allocation before
   running; proven run-scoped checkpoint before resuming; running before
   completed). Duplicate provider event ids are replay-refused. A provider
   HTTP 200 never becomes workspace truth by itself.
3. **No promotion bypass.** `promoted` is derived by the existing eval
   harness from measured wins; compute completion keeps the flywheel's
   promotion step open and the customer state reads "Evaluating".
4. **No credential in governed state.** Rows carry env-var NAMES only; the
   registry's credential firewall invalidates credential-shaped values (fail
   closed); adapters resolve values per call via `ctx.resolveEnv`; evidence
   trails are test-asserted secret-free.
5. **No duplicate spend.** Deterministic idempotency identity
   (trainingRunId + attempt + profile + provider → fnv1a64). Replay of an
   unreleased allocation fails closed; provider-native idempotency is used
   where it exists (Ray submission_id; Runpod name-reconcile).
6. **Unknown is never zero.** Unknown price fails a hard budget unless
   policy explicitly allows it; unknown VRAM/region under a floor/pin fails
   closed; unknown duration → null total.
7. **Local unchanged.** No compute ask → the local pipeline byte-for-byte;
   a resolver decision of "local" falls through to it; harvest-only remains
   a first-class non-execution journey.
8. **Portability.** The same distributed plan submits the identical Ray job
   body on ray-cluster, aws-hyperpod-ray, and coreweave-ray; a workload
   moves providers without changing the model identity.
9. **Release honesty.** Every terminal state answers "may capacity still
   exist / may cost still accrue" explicitly; release failure is durable,
   visible evidence, in receipts and in the customer UI.
10. **No fabricated UX.** Both surfaces render one pure deriver over
    receipts; there is no compute progress percentage anywhere.
