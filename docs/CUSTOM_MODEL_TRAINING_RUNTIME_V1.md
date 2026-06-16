# Custom Model Training Runtime V1

Official feature note for the `0.14.5` Custom Model Training Runtime release.

The Custom Model Training Runtime turns real governed workspace traces into a callable, verified custom model capability — using the same governed primitives as the Workspace CEO Primitive / Agent Teams, not a new subsystem.

## Release Thesis

Custom Model Training Runtime is **not** a new route, a separate runtime, a training SaaS layer, or a loose export tool. It is the `/training` command surface inside the existing Workspace Helper sidecar, mirroring the CEO pattern exactly:

```text
/training
  -> first-use training readiness checklist
  -> governed distillation trace selection
  -> helper/apply reviewed mutation
  -> model-training custom object row
  -> model-training-run atomic receipt row
  -> API Registry row
  -> OpenAI-compatible localized model response
  -> tuned/local model verification
  -> sandbox/workflow smoke proof
  -> custom model completion marker
  -> operational cockpit
  -> Runtime history + Custom Models / Gaps views
  -> linked API Registry test + workflow canvas
```

Compute may run through a local runner, container, manual attestation, Ollama / Unsloth / llama.cpp / GGUF, or any OpenAI-compatible endpoint — but **Growthub Local owns the lifecycle, the run receipts, the artifact identity, the verification, the invocation proof, and the user-facing processing experience.** The primitive uses existing workspace state only: Data Model objects, API Registry rows, sandbox/workflow rows, `training:*` source records, helper/apply proposals, and pure causation derivers. It adds no third mutation lane and no separate runtime object model.

## What 0.14.5 Adds

- `/training` opens the Training Ledger cockpit; `/custom-models` (evidence-gated) opens the completed-capability cockpit.
- A **Next best action** card derived from `deriveTrainingRuntimeDrivers()` — one evidence-backed action that **links** to the canonical authority (Data Model / API Registry / Workflow Canvas / Custom Models), never executing from the card.
- The **Training Runtime Modal**: `curate → profile → dataset → train → import → verify → bind → done`, with continuous in-modal progress + status text during the real API Registry + Data Model setup. No dark states.
- A governed **`model-training-run`** receipt layer (`growthub-local-model-training-run-v1`), read from both the CLI `training-run:*` sidecar lane and the governed `model-training-run` Data Model object.
- Five **training runtime profiles** (Unsloth QLoRA, llama.cpp GGUF, Ollama Modelfile, OpenAI-compatible endpoint, manual attestation).
- Strict proof gates: `imported` requires a provable artifact (path + sha256 + tag); `verified` requires the endpoint to return the tuned tag (base / malformed / error all demote); `complete` requires sandbox run + outputHash.
- Hardened `growthub intelligence export`: `--incremental` / `--since-last` sourceHash dedupe, `--capability`, `--min-score`, `--gaps-only` (feedback corpus), and per-trace provenance.
- A thin agnostic compression/persistence seam (`training-persistence.js`), off by default, for the deferred V2 module.

## Customer Journey

### First Use

The user starts from `/training`. The ledger derives readiness from live workspace config + receipts and surfaces the single next action:

1. collect governed traces from real workspace activity;
2. curate qualified traces (redaction-blocked traces are excluded and explained);
3. export the governed dataset;
4. choose a training profile and reserve the tuned model tag;
5. prepare a governed `model-training-run` receipt;
6. run the fine-tune on the chosen runner;
7. import the artifact identity (path + sha256 + tag);
8. register the API Registry endpoint;
9. verify the endpoint returns the tuned tag;
10. bind the model into a sandbox/workflow smoke;
11. run the smoke — outputHash completes the capability.

### Daily Use

After completion, `/custom-models` becomes a clean read-first cockpit: each model card shows its evidence state, registry id, last verification, last sandbox run, and output hash, and **links** to the canonical API Registry test or Workflow Canvas. A completed model is never demoted by new failures — instead they surface as the next training cycle's gaps (`--gaps-only` export), exactly as Agent Teams stay reusable while History tracks runtime.

## Source Of Truth

| Concern | Source |
| --- | --- |
| Entry point | Helper command `/training` (and `/custom-models`, evidence-gated) |
| Readiness / next action | `deriveTrainingLedgerState()` + `deriveTrainingRuntimeDrivers()` |
| Distillation traces | `training-traces` custom Data Model object |
| Training target | `model-training` custom Data Model object |
| Training attempt | `model-training-run` Data Model object **and** `training-run:*` sidecar receipt |
| Dataset export proof | `training:*` source record + `lastExportId` |
| Artifact identity | `training-artifacts.js` over path / tag / sha256 / quantization |
| Training profile | `training-runtime-profiles.js` |
| Composed runtime state | `training-runtime.js` |
| Endpoint authority | `api-registry` row |
| Endpoint verification | API Registry test proof + `training-verification.js` |
| Executable smoke graph | `sandbox-environment` / workflow row |
| Smoke execution | existing `POST /api/workspace/sandbox-run` path |
| Smoke receipt | source record / sandbox run proof + `outputHash` |
| Completed capability | `deriveCustomModelsState()` |
| Canonical edit authority | Data Model |
| Canonical graph authority | Workflow Canvas (`/workflows`) |
| Canonical endpoint test authority | API Registry |

## Required Product Invariants

- No `/training` rail button or side route as a separate runtime.
- No third mutation lane — all writes go through the existing governed helper/apply PATCH.
- No duplicate runtime object model; receipts reuse Data Model rows + source records.
- The Custom Models cockpit is read-first — duplicate/delete route to Data Model; test routes to API Registry; workflow routes to Workflow Canvas.
- No fake proof: dataset export ≠ trained, trained ≠ imported, imported ≠ verified, verified ≠ complete.
- A base-model / malformed / error endpoint response never verifies.
- No `complete` state without sandbox run + outputHash proof.
- No inline secrets; redaction-blocked traces never enter the corpus.
- No browser storage as persistence; completion is derived from receipts.

## Validation Map

The runtime is complete when these prove together:

- `/training` page and sidecar derive identical state from one deriver set.
- `/custom-models` stays hidden until real custom-model evidence exists.
- `< 10` qualified traces disables prepare; redaction-blocked traces are excluded and explained.
- `growthub intelligence export` dedupes by sourceHash; a second `--incremental` run emits zero new records; `--gaps-only` keeps only correction/rejection/failure signal.
- A `model-training-run` receipt links `modelTrainingRowId` + `datasetExportId`; an unprovable artifact stays `trained`.
- An API Registry row links `modelTrainingRowId` + `trainingRunId`; the test captures the real response model tag; base-model responses demote.
- A sandbox run writes `outputHash`; only then does `/custom-models` render the completed capability.
- A later failed/corrected run becomes a training gap (`runGap` flagged, never a demotion).
- Proven by `scripts/e2e-custom-model-training-loop.mjs` (real temp workspace, shipped export, full ladder, positive + negative assertions) and the `unit-training-runtime` / `intelligence-export` suites.

## Deferred Future Work

The following belong to a later **Growthub Bridge Training Persistence V2** module and are explicitly **not** in V1:

- GH App persistence mirror, QStash scheduling, daily remote sync.
- Hosted fleet training dashboards, multi-tenant persistence, budget governance.
- Remote trace offload, account-pool teacher systems.
- A separate simulation cockpit / swarm-predictability product.

The compression/persistence seam (`training-persistence.js`) is laid but off by default so V2 can flip the codec without touching V1 derivers, routes, or governance.
