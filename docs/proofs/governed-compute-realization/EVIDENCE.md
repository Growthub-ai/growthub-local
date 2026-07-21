# Governed Compute Realization V1 — Evidence

All runs executed in this repository at the release head (container:
Linux, Node 22.22.2, 16 GB RAM, 31 GB free disk, no GPU — the REAL machine
evidence behind the local-path proofs). Classification: **Passed** =
executed here; **Inherited** = existing shipped proof re-run green;
**Unexecuted** = live external observation genuinely unavailable (see
PROOF-INDEX.md for exact boundaries).

## New compute suites — Passed

| Suite | Result |
| --- | --- |
| `unit-compute-contract` (shared contract, dist, request/authority parity) | 15 pass / 0 fail |
| `unit-compute-capacity-profiles` (Sprint 2 exit proofs) | 15 pass / 0 fail |
| `unit-compute-provider-registry` (Sprint 3 exit proofs + credential firewall) | 14 pass / 0 fail |
| `unit-compute-resolver` (Sprint 4 determinism + gates) | 14 pass / 0 fail |
| `unit-compute-work-spec` (request/authority split, SHA-256 identities, tamper fail-closed) | 5 pass / 0 fail |
| `unit-compute-authority` (server compile/seal/verify; bindings, forgery, drift, key handling fail closed) | 6 pass / 0 fail |
| `unit-compute-execution` (Sprint 5 lifecycle + replay + forged events + server-authority route hook + ephemeral-key/local-zero-remote/concurrency/foreign-workload guards) | 18 pass / 0 fail |
| `unit-compute-runpod` (Sprint 6 conformance) | 11 pass / 0 fail |
| `unit-compute-modal` (Sprint 7 conformance) | 9 pass / 0 fail |
| `unit-compute-ray` (Sprints 8–9 conformance + portability) | 11 pass / 0 fail |
| `unit-compute-customer-state` (Sprint 10 — all 19 required states) | 7 pass / 0 fail |
| `unit-compute-adversarial` (mismatch/timeout/wrong-checkpoint/hash/cancel/promotion boundary + planted-spec/drift/compile-refusal/key-rotation/manifest-laundering authority cases) | 11 pass / 0 fail |
| `unit-compute-route-wiring` (route + modal + patch-policy source-truth wiring) | 3 pass / 0 fail |
| **Total focused compute tests** | **139 pass / 0 fail** |
| `e2e-compute-realization-loop.mjs --write-evidence` (proofs A–J, real machine evidence) | **20 checks pass**; artifacts in `evidence/` |

## Adversarial case coverage map

unknown provider → `unit-compute-provider-registry` (adapter-missing) + resolver `profile-unsupported` · missing credential → registry `credential-missing` (names only) · insufficient VRAM → capacity-profiles + resolver (`insufficient-vram`, both numbers named) · unknown cost under hard budget → resolver + e2e §D · quote expiry → resolver (`quote-expired`) · duplicate allocation → execution replay guard + Runpod name-reconcile + Ray submission_id adoption + duplicate-event-id refusal · provider timeout → adversarial suite (status unobservable → named failure + release attempt) · allocation evidence mismatch → adversarial (8-GPU ask answered with 4 → fail closed + release) · reported GPU mismatch → same · forged running event → execution suite (refused, state unmoved) · forged completion → execution suite · checkpoint missing → execution (resume refused) · wrong-checkpoint resume → adversarial (foreign-run checkpoint never resumable) · artifact missing → execution + e2e §G · artifact hash mismatch → adversarial + e2e §G · base-model mismatch → **Inherited** (`training-verification` demotion semantics, `unit-training-runtime` re-run green) · cancel failure → adversarial (risk stays visible) · release failure → execution + e2e §J · provider complete with no artifact → execution + e2e §G · promotion without evaluation win → adversarial (derived `promoted` only; flywheel step stays open; UI says Evaluating) · caller-planted self-consistent intent/work spec → adversarial (ignored; every provider boundary receives the server-compiled spec) · post-seal drift of policy/dataset/steps/output → authority + adversarial (refused before provider submission) · authority forgery/seal tampering/foreign key → authority suite (seal fails; recompilation governs) · direct PATCH forgery of compute evidence, allocation, evaluation/promotion, artifact identity, or evidence erasure — INCLUDING erasure by omission, row/object deletion, trainingRunId rename, status demotion, and post-journal request changes → patch-policy suite + booted route proof (11 live HTTP probes, all 422 `training_evidence_field`; byte-identical echo stays writable; local-runner lane preserved) · key rotation authority reset → adversarial + authority suites (identical content reseals explicitly, changed content refuses with zero provider calls; ephemeral key refuses remote outright) · forged persisted dataset manifest laundering through verification → adversarial suite (recompilation reads trusted server inputs only) · local-only ask probing remote adapters → execution suite (zero adapter contact) · changed workload adopting an unreleased resource → execution suite (workload-bound idempotency identity refuses).

## Regression — Inherited proofs re-run green at the release head

| Suite | Result |
| --- | --- |
| training (`unit-training-runtime` + `unit-training-ledger` + `unit-training-local-readiness`) | 137 pass / 0 fail |
| distillation (`unit-distillation-flywheel`) | 32 pass / 0 fail |
| distillation live loop (`e2e-distillation-flywheel-loop`) | 17/17 checks (real governed workspace) |
| `unit-workspace-metadata-impact` | 8 pass / 0 fail |
| resolver registry (`unit-resolver-registry` + drift guard) | 34 pass / 0 fail · no drift |
| sandbox (`unit-sandbox-serverless-flow` + `unit-sandbox-browser-access`) | 17 pass / 0 fail |
| custom-models (`unit-custom-models-ledger` + workflow-proposal + test-source) | 33 pass / 0 fail |
| workspace policy (`unit-operator-proof-contract` + `unit-workspace-patch-policy`) | 29 pass / 0 fail |
| inference certification (`npm run test:inference-certification`) | all suites pass |
| scheduler suites (4) | 73 pass / 0 fail |
| supabase/external suites (6) | 58 pass / 0 fail |
| marketplace (`capability-nodes` + `capability-surfaces` + 6 add-on suites) | 26 pass + 6×0 fail |

Known pre-existing failure at the BASE SHA (unchanged by this release, not
in any CI gate): `unit-custom-model-inference` test 9 ("awaiting tool
result…") fails identically before and after — recorded in
IMPLEMENTATION-LEDGER.md.

## Repository gates — Passed

`freeze-check` ✓ · `check-version-sync --require-bump-if-source-changed`
✓ (cli 0.14.29 / create 0.14.29 / api-contract 1.8.0, pins lockstep) ·
`check-cli-package` ✓ · `check-worker-kits` ✓ · `check-claude-plugin` ✓ ·
`check-codex-plugin` ✓ (plugin pins bumped in lockstep) ·
`check-resolver-registry` ✓ no drift · `check-fork-sync` 412/412 ·
`release-check` ✓ (tarball + leak guards) · `pr-ready.sh` green except the
branch-name convention line: the session-assigned branch prefix `claude/`
is accepted by CI's `pr-validate.yml` regex, which is the enforcing gate.

## Security / secret scan

- Governed rows: the registry credential firewall rejects credential-shaped
  values (`credential-value-in-row` / `credential-shaped-value`), fail
  closed — test-pinned.
- Evidence trails: Runpod/Modal/Ray conformance suites assert the API key /
  proxy secret / bearer token value never appears in any request body,
  event, decision, or receipt.
- `GET /api/workspace/compute` returns env NAMES and presence only —
  read-only by construction (no mutation exports, no write-path imports —
  test-asserted).
- `git grep` over the diff for key-shaped literals: only test fixtures
  (`wk-testid`, `test-key-value` …) which the suites assert are ABSENT from
  evidence output.

## dist / release handoff

- `packages/api-contract/dist` rebuilt with the pinned tsc 5.7.3 and
  committed (package convention; only `index.*` + new `compute.*` changed).
- `cli/dist/**` untouched (Phase A boundary respected). **Phase B dist
  rebuild required** before npm publish: `cli/src` was not modified, but the
  version bump + worker-kit asset changes follow the repository's release
  workflow (`release.yml`) — flagging per `docs/AGENT_DIST_REBUILD_GUIDE.md`.
