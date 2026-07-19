# 16-State Live Proof Index — Custom Local Model Journey

Fresh-seeded, same-head recapture of the no-code custom-model journey, from
first eligibility through first proven invocation and reusable cockpit
management. Every row below maps a **screenshot** to its **machine readback**
and the **governed row / deriver** the visible claim is derived from.

## Capture provenance

- **Branch head:** `claude/growthub-marketplace-2026-items-wygn34` (same-head recapture).
- **Boot:** `GROWTHUB_KIT_EXPORTS_HOME=/tmp/ws2 node scripts/export-seed-workspace-model-qa.mjs`
  → fresh `next dev` on `http://127.0.0.1:3777`, seeded model-QA workspace (12
  `training-traces` rows, `model-training` row on base `gemma3`).
- **Ledger-hydration parity (review blocker #2):** the boot now asserts, from the
  live API readback, that the SAME deriver the browser modal uses agrees on
  eligibility: `deriveDistillationPipelineState` → **graded=11, ready=true,
  floor=10**. A false "0 eligible" after restart can no longer pass QA silently.
- **Capture:** `BASE_URL=http://127.0.0.1:3777 PLAYWRIGHT_DIR=$PWD node
  scripts/e2e-custom-model-16-states-playwright.mjs` → **16/16 live checks
  passed**. Every PNG is the real UI; every readback is derived from the live
  governed row at capture time.
- **Provenance legend:** `derived` = read live from the governed workspace at
  capture; `seeded` = labeled seed evidence (fixture); `simulated` = a stamped
  receipt state injected through the sanctioned PATCH to render a terminal UI.

## State map

Provenance values are one of `derived` · `seeded` · `simulated` · `operator-real`
(the last is only stamped once `operator-proof.json` validates — see
[`../OPERATOR_PROOF_CONTRACT.md`](../OPERATOR_PROOF_CONTRACT.md)). No state is
marketed as a completed live tuned-model run until that operator proof passes.

| # | State | Screenshot | Readback | Visible heading / status / CTA | Governed row / deriver | Provenance |
| --- | --- | --- | --- | --- | --- | --- |
| 00 | Eligibility agreement (gate #3) | `state-00-eligibility-agreement.png` | `state-00-eligibility-agreement-readback.json` | browser-openable ⟺ deriver.ready ⟺ API traces (agree) | `/training` opener vs `/api/workspace` vs `deriveDistillationPipelineState` — asserts browser==api==deriver, fails the run on disagreement | derived |
| 01 | Eligible | `state-01-eligible.png` | `state-01-eligible-readback.json` | Custom Model Training · Ready to train · Configure traces | `training-traces` → `deriveDistillationPipelineState` (ready:true, graded 11/floor 10) | derived |
| 02 | Configure traces | `state-02-configure-traces.png` | `state-02-configure-traces-readback.json` | Configure Traces · 11 of 11 selected · floor 10 met · Choose training profile | `training-traces` rows + `eligibleTraceRows`/`MIN_FINETUNE_TRACES` | derived |
| 03 | Dataset readiness | `state-03-dataset-readiness.png` | `state-03-dataset-readiness-readback.json` | Dataset Readiness · prepared · Continue | prepare progress over real selected records (`deriveProgressStages`) | derived |
| 04 | One-click train (adaptive runtime) | `state-04-one-click-train.png` | `state-04-one-click-train-readback.json` | Train custom model · Ready · Start training | `model-training` (base gemma3) → `deriveLocalModelChoices`; renders **No local runtime configured** (setup-needed, blocker #6) | derived |
| 05 | Invocation body / safety | `state-05-invocation-body-unsafe.png` | `state-05-invocation-body-readback.json` | Training request body / safety · Blocked (unsafe input) · Fix highlighted field | `runConfig.commandSafety` → field-level block; `cleanBlockedState`, `rawCommandInAdvancedOnly` | derived |
| 06 | Training started | `state-06-training-started.png` | `state-06-training-started-readback.json` | Running · View logs (bar from real 8% receipt · distilling · step 0/12) | `model-training-run.progress` → `deriveTrainingWaitState.barPct` | simulated (stamped receipt) |
| 07 | Trace ingestion | `state-07-trace-ingestion.png` | `state-07-trace-ingestion-readback.json` | Running · View logs (22% · distilling · step 2184/3248) | `model-training-run.progress` (counter) → `deriveTrainingWaitState` | simulated (stamped receipt) |
| 08 | Fine-tuning | `state-08-fine-tuning.png` | `state-08-fine-tuning-readback.json` | Running · View artifacts (48% · fine-tuning · step/loss/checkpoint) | `model-training-run.progress` (GH_PROGRESS step/loss/checkpoint) | simulated (stamped receipt) |
| 09 | Evaluation | `state-09-evaluation.png` | `state-09-evaluation-readback.json` | Evaluation Results · Complete · Approve & continue | `model-training-run` holdout eval readback (metric deltas labeled seed) | seeded |
| 10 | Troubleshoot | `state-10-troubleshoot.png` | `state-10-troubleshoot-readback.json` | fine-tuning · fine_tune_oom · Needs attention · Re-run | `deriveTrainingStageIssue` (classified, not generic) | simulated (stamped receipt) |
| 11 | Fix applied | `state-11-fix-applied.png` | `state-11-fix-applied-readback.json` | Training workspace-local-tuned-v1 · Resumed · Resume training | `deriveTrainingResumeState` — same run resumes from checkpoint | simulated (stamped receipt) |
| 12 | First invocation | `state-12-first-invocation.png` | `state-12-first-invocation-readback.json` | First invocation test · Success · Continue to deploy (served == tuned tag, not base) | `verifyTunedResponse` over `api-registry.lastResponse`; Response/Trace/Details/Proof inspector | simulated (stamped receipt) |
| 13 | Deploy | `state-13-deploy.png` | `state-13-deploy-readback.json` | Deploy custom model · connected · Deploy (registry row, no inline secret) | `api-registry` row (`workspace-local-model`) | simulated (stamped receipt) |
| 14 | Live deployment | `state-14-live-deployment.png` | `state-14-live-deployment-readback.json` | workspace-local-tuned-v1 · Deployed · Healthy · Copy request (serves tuned tag via ollama) | connected `api-registry` row → `deriveServingProfile` | simulated (stamped receipt) |
| 15 | Customer proof loop | `state-15-customer-proof-loop.png` | `state-15-customer-proof-loop-readback.json` | Proof loop complete · Verified · View proof details (9/9 + reward live) | `deriveTrainingProofChecklist` (9/9) + `deriveTrainingCompletionReward` over governed rows | simulated (stamped receipt) |
| 16 | Model cockpit | `state-16-model-cockpit.png` | `state-16-model-cockpit-readback.json` | Custom Models · 1 verified · Use model / Suggested actions — the REAL `/custom-models` cockpit reached via the canonical helper entry (`?helper=open` → `/custom-models` slash → `setActiveView('custom-models')`), not a backing table | `deriveCustomModelsState` over the governed model/registry/sandbox rows | simulated (stamped receipt; cockpit rendered live in-browser) |

## Negative / demotion evidence (review blocker #4)

- **No run receipts yet → no green claim:** states 01–04 show readiness without a
  "verified/complete" claim (`deriveTrainingRuntimeState` gates the terminal state).
- **Runtime detected but not binding-verified → honest wording:** state 04 renders
  "No local runtime configured" rather than a fabricated connected state.
- **Unsafe tuned tag → field-level block, no raw command as primary UX:** state 05
  (`cleanBlockedState: true`, `rawCommandInAdvancedOnly: true`).
- **Served base model when tuned tag expected → demoted, not verified:** proven in
  `unit-training-runtime` (base-model response never verifies) and rendered at
  state 12 (served == tuned tag is the only success path).
- **Stage failure → single classified next action, not generic:** state 10
  (`fine_tune_oom` → one "Re-run"/resume action).

## What is still deferred (physical)

The live-weights fine-tune to `complete` on real hardware (GPU + python ML +
`ollama`/`llama.cpp`) is physically impossible in CI. States 06–16 render from
sanctioned stamped receipts (marked `simulated` above), which prove the UI +
derivers + governed rows; the real-machine weights pass is the operator step and
is why the PR stays draft. See the parent `PROOF.md` Section C.
