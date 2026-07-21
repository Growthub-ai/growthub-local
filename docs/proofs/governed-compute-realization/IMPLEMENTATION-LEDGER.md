# Governed Compute Realization V1 — Implementation Ledger (Sprint 0)

Base SHA at freeze: `7520b8c72462797dcaf4ce6c64ccd1a9ede14eb8` (branch tip == `origin/main` tip).
Package versions read from disk at freeze: `@growthub/cli` 0.14.28 · `@growthub/create-growthub-local` 0.14.28 · `@growthub/api-contract` 1.7.0.

Baseline test evidence (run at the base SHA, this container):

| Suite | Result |
| --- | --- |
| `unit-training-runtime` | pass (fail 0) |
| `unit-training-ledger` | pass 32 / fail 0 |
| `unit-training-local-readiness` | pass 18 / fail 0 |
| `unit-distillation-flywheel` | pass (fail 0) |
| `e2e-distillation-flywheel-loop` | 17/17 checks pass |
| `unit-resolver-registry` | pass (fail 0) |
| `unit-custom-models-ledger` | pass 21 / fail 0 |
| `unit-workspace-metadata-impact` | pass 8 / fail 0 |
| `npm run test:inference-certification` | all suites pass (pinned AJV deps provisioned) |
| `unit-sandbox-serverless-flow` | pass 6 / fail 0 |
| `unit-operator-proof-contract` | pass 8 / fail 0 |
| `unit-custom-model-inference` | pass 11 / **fail 1 — PRE-EXISTING at base SHA** (test 9 "awaiting tool result…", expects `exitCode null`, gets `1`; not in any CI gate; depends on certification-deps module resolution outside the harness) |

## Existing primitive → authoritative file → how compute extends it → what must not be duplicated

All workspace paths below are rooted at
`cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/`.

| Existing primitive | Current authoritative file | How compute extends it | Must NOT be duplicated |
| --- | --- | --- | --- |
| Training plan (what to train) | `lib/distillation-student-plan.js` (`resolveMachineTier`, `buildAdaptiveStudentPlan`, `MACHINE_TIERS`, `STUDENT_BASE_CANDIDATES`) | `lib/compute-capacity-profiles.js` derives provider-neutral `ComputeRequirements` FROM the adaptive plan + preflight; the plan keeps deciding what, compute only decides where | No second hardware detector, no second sizing ladder |
| Machine preflight | `lib/training-local-readiness-probe.js` (`collectTrainingLocalReadiness`, `preflight { ramGB, diskFreeGB, gpu }`) + runner stage-0 preflight stamped into receipts | Local provider capacity derives from this same evidence; requirements checks read the same `{ ramGB, diskFreeGB, gpu }` shape | No new probe route, no second readiness IO surface |
| Training run receipt | `lib/training-run-receipts.js` (`growthub-local-model-training-run-v1`, `buildTrainingRunReceipt`, `deriveTrainingRunState`, dual write lanes: `training-run:*` sidecar + `model-training-run` Data Model rows) | Additive optional `receipt.compute` block (`ComputeEvidence`: decision, allocation, normalized events, checkpoints, artifact ref) mirroring the `distillation` block precedent | No separate decision/receipt store, no second run lifecycle |
| Artifact verification | `lib/training-artifacts.js` (`deriveArtifactState` — path+sha256 floors, quant proof) | Provider "completed" maps to artifact evidence that still must clear the SAME floors; artifact absent/hash mismatch ⇒ non-promotable | No compute-side artifact trust; provider HTTP 200 is not an artifact |
| Evaluation (only route to promotion) | `lib/distillation-eval-harness.js` (`deriveBenchmarkWins`, `promoted` derived, never input) | Untouched. Compute completion feeds candidates INTO it; nothing in compute may set `promoted` | No compute promotion path |
| Mothership routing (active realization) | `lib/distillation-fleet.js` (`deriveActiveRoute`, `deriveProxyServingState`, `metadata.mothershipProxy` policy row) | Untouched. A winning candidate flows through the existing verification/promotion boundary; compute never edits the policy row | No provider-driven route update |
| Sandbox execution authority | `app/api/workspace/sandbox-run/route.js` + `lib/adapters/sandboxes/sandbox-adapter-registry.js` (`registerSandboxAdapter` global-Map pattern, `readServerSecret` env resolution, `sandbox:*` receipts, outcome receipts) | Training execution stays on this seam: the `model-training-runner` sandbox row is the launch point for ALL runner modes; provider-compute is a new orchestration inside the same seam, adapters registered in a parallel `lib/adapters/compute/` registry following the exact sandbox-registry philosophy | No `/api/compute/run`, no second executor, no provider-specific mutation route |
| Training execution seam (UI → run) | `app/data-model/components/TrainingHandoffModal.jsx` (`TRAINING_RUNNER_SANDBOX_ID = "model-training-runner"`, `buildRunnerScript`, `startTraining` → `POST /api/workspace/sandbox-run`) + `lib/training-runtime-profiles.js` (`runnerMode: local-command / compatible-runtime / manual-attested`, argv-only safety) | Adds the `provider-compute` runner mode alongside the existing three; existing profiles keep their behavior byte-for-byte | No second modal, no new training route, no shell-string execution |
| Provider identity + secrets | API Registry rows (`dataModel.objects[]` `objectType: "api-registry"`) + `lib/server-secrets.js` (`readServerSecret`, `readEnvVar` — key NAMES surface, values stay server-side) | An ordinary row carrying `metadata.computeProvider` (schema `growthub-compute-provider-v1`) becomes a compute provider; `requiredEnv` is env NAMES only | No second provider store, no credential values in rows/receipts |
| Governed mutation boundary | `PATCH /api/workspace` (allowlist) + `POST /api/workspace/sandbox-run` + `lib/workspace-patch-policy.js` | Unchanged. `GET /api/workspace/compute` is READ-ONLY derived state (patterned on `app/api/workspace/apps/route.js` / `resolvers/route.js`) | No third mutation lane |
| Evidence/source records | `lib/workspace-config.js` (`appendWorkspaceSourceRecords`, `readWorkspaceSourceRecords`) with `training:*`, `training-run:*`, `sandbox:*`, `distillation-traces:*`, `workspace:agent-outcomes` namespaces | Compute events persist inside the existing `model-training-run` receipt evidence (progress + `compute` block); no new namespace store is REQUIRED for lifecycle truth | No parallel event database |
| Contract package | `packages/api-contract` (committed dist, additive subpath exports, version-sync enforced pins) | New additive `@growthub/api-contract/compute` subpath (1.8.0) | No breaking export changes |
| UI states | `TrainingHandoffModal.jsx` panels + `lib/training-runtime.js` `RUNTIME_STATES` + `TRAINING_PROGRESS_STAGES` (0–7, monotonic `nextProgress`) + `/custom-models` cockpit (`CustomModelsLedger.jsx`, `dm-*` grammar, `<details class="training-advanced">` disclosure) | Progressive-disclosure compute panel content derived from the SAME receipts/derivers; no client-only state, no fabricated progress | No new page, no invented progress percentage, no new stage enum |

## Exact current training execution seam (frozen)

1. `TrainingHandoffModal.startTraining()` → readiness gate (`deriveStartTrainingReadiness`) → stamps `running` receipt via governed PATCH → `upsertRunnerSandbox()` writes the `model-training-runner` `sandbox-environment` row (runtime `node`, `runLocality: "local"`, command = `buildRunnerScript(...)`).
2. `POST /api/workspace/sandbox-run { objectId: "model-training-runner", name: <trainingRunId>, intent: "model-training-run" }` executes the runner through the `local-process` adapter.
3. The runner stamps monotonic progress (`nextProgress`) + preflight + artifact + quant proof back through governed PATCHes; the modal polls `GET /api/workspace`.
4. Receipt lifecycle: `prepared → running → trained → imported` guarded by `classifyRunStatus` + `deriveArtifactState`; `deployed → verified → sandbox-ready → complete` guarded by API Registry test + `verifyTunedResponse` + sandbox `outputHash`.

Compute extends step 1–3 with a `provider-compute` path resolved BEFORE execution; steps 4+ (artifact floors, verification, evaluation, promotion) are untouched authority.

## Addendum — server-owned authority corrective pass (post-review)

The review of head `34f2590a` established that browser-authored, self-hashed
intent/work specs written through ordinary PATCH were being accepted as
execution authority. Corrected in this pass:

| Concern | Before | Now |
| --- | --- | --- |
| Who authors the intent/work spec | `TrainingHandoffModal.jsx` (browser), persisted via PATCH, self-hashed with FNV-1a | `lib/compute-authority.js` compiles it SERVER-SIDE from the governed rows + the customer request; SHA-256 lineage; HMAC-SHA256 seal (`GROWTHUB_COMPUTE_AUTHORITY_KEY` → `GROWTHUB_WORKSPACE_SIGNING_KEY` (the inference-manifest signing key, domain-separated keyId) → ephemeral per-boot fallback) |
| What the browser persists | full compute ask incl. intent/workSpec/hashes | `computeRequest` (`growthub-compute-request-v1`) only — policy, budget, locality, preemptible, provider preference, profile, export identity, output tag, duration estimate |
| What verification proves | internal self-hash equality of a caller-supplied object | seal verification AND recompilation from current authoritative inputs (`verifyComputeAuthorityAgainstWorkspace`); drift of policy/dataset/steps/output fails closed before provider submission |
| PATCH exposure of evidence | `model-training-run` evidence fields freely PATCHable | `compute` journal echo-only (`training_evidence_field`); success statuses + artifact identity echo-only on provider-compute rows; `distillation.benchmarkWins` echo-only everywhere; the local runner's receipt lane (no compute evidence) unchanged |

## Addendum 2 — review of head `428e980` closed

| Finding | Correction |
| --- | --- |
| PATCH protection bypassable by omission / row deletion / object deletion / identity rename | Omission of a populated protected value IS erasure (two-way echo-only for `compute`, `benchmarkWins`, and on remote-locked rows: status/artifact/preflight); evidence-bearing rows and their object cannot be deleted or renamed; a remote-capable request cannot mint success claims before a server-journaled `local-machine` decision; the local lane keys to that journaled decision |
| Authority reset via key rotation / ephemeral restart | Continuity decided by CONTENT identity regardless of seal state (identical content under a new key → explicit reseal, visible via keyId; drift → fail closed before any provider action); remote execution refuses the ephemeral key outright; `computeRequest` + identity fields frozen after the first journal write |
| Compiler succeeded without authoritative training binding | Exactly one run row + exactly one bound `model-training` version row required; binding checks for `modelTrainingRowId` prefix, reserved `localModel` tag, API Registry `expectedModelTag`, and `lastExportSummary.path`; requested profile must be equal-or-stricter than the derived plan (intrinsic-floor comparison); dataset binding honestly classified `manifest` vs `metadata-only` |
| Verification reused untrusted persisted dataset fields | `verifyComputeAuthorityAgainstWorkspace` takes an explicit trusted `datasetManifest` and never reads fields of the authority under verification |
| Stale request-start snapshot | `compileAuthority` / `verifyAuthority` re-read CURRENT config; the journal write compares the live request hash against the compiled authority and throws on mismatch (before allocation, which follows the first journal write) |
| Local-only asks touched remote adapters | Policy pre-filter before ANY adapter contact: `localOnly` inspects only the local provider; explicit pins inspect only the pinned provider |
| Idempotency unbound from the workload | Identity = run + attempt + profile + provider + sealed `workSpecHash`; an unreleased allocation from a DIFFERENT sealed workload refuses a new run (same-workload explicit retry stays sanctioned) |
| Public contract stale | `@growthub/api-contract/compute` 1.8.0 (unreleased) gains `ComputeRequest`/`ComputeAuthority` + schemas + guards; `ComputeEvidence` carries the authority fields; dist rebuilt with pinned tsc |
| keyId-only domain separation | The HMAC message itself is domain-prefixed (`growthub-compute-authority-seal-v1`); keyId remains observability evidence |

Still open from the original PR #296 review (tracked, honestly NOT claimed
here): outbound provider/artifact network policy (SSRF boundary), canonical
workspace-owned evaluation replacing provider-returned score rows, the
remote corpus/artifact byte data plane (authority binding is
`metadata-only` until then), the provider-accepted-before-persist crash
window + monotonic journal merge, asynchronous long-run observation,
active-attempt resume/release safety, and strict hard-budget normalization.
