# 16-State NLU QA Contract — Proof Pack

The custom-model journey (the 4×4 journey image) is a **16-state customer/state
machine**, not a visual mock. This pack proves each state against the contract's
three layers and writes a machine-readable readback per state.

## Global QA rule — every state satisfies three layers

1. **Customer-visible clarity** — the user understands what is happening without
   reading raw commands. Raw command previews live only in `Advanced`
   (`<details data-handoff-runconfig>` / `[data-train-command]`), never the main path.
2. **Governed proof** — every visible claim maps to a governed row:
   `model-training`, `model-training-run`, `api-registry`, `sandbox-environment`,
   `training:*`, or `model-invocation:*`.
3. **NLU usability** — the helper can route phrases ("train my model", "why is it
   blocked", "test if it is really custom", "deploy it") to the right state. Each
   readback carries `nluExamples` + `nextAllowedAction`.

## Proof tiers (repo taxonomy — see ../PROOF.md)

- **Tier B — deriver-backed readbacks (produced here, CI-runnable):**
  `node scripts/e2e-custom-model-16-states-readbacks.mjs` builds the governed rows
  for each state and computes its readback from the **real derivers** the modal and
  cockpit use — never mock text. It asserts each state's governed invariant and
  fails if one does not hold. Output: `state-01..state-16-*-readback.json` in this
  directory. **Result: 16/16 states proven.**
### Fresh-boot recapture (current head) — gate #3 agreement

`../states-16-live/` was recaptured on a **fresh `node scripts/export-seed-workspace-model-qa.mjs` boot** of the current head in real Chromium — **17/17 checks pass, 17/17 screenshots distinct**. `state-00-eligibility-agreement` is a hard **gate #3** assertion: the browser ledger, `/api/workspace` trace rows, and `deriveDistillationPipelineState` must agree on readiness (asserts *browser-openable ⟺ deriver.ready* — a view-independent signal, not a count string — and fails the run on disagreement). Result on the supported seed boot: `deriver ready=true graded=11 · api traces=12 · browser openable=true · agree`.

- **Tier A — live in-browser PNG capture (operator step, booted seeded workspace):**
  `BASE_URL=… PLAYWRIGHT_DIR=… node scripts/e2e-custom-model-states-playwright.mjs`
  drives the real modal on a booted seeded workspace and captures a PNG per state,
  targeting the `data-*` hooks below. Requires the Next runtime (`npm install` in the
  exported app + `growthub` server); it is the operator's capture step, the same
  class as the deferred real-hardware fine-tune.
- **Tier C — deferred real-machine weights proof:** the physical GPU fine-tune
  (real loss curve, real GGUF/quant bytes, real Ollama serve) stays the operator's
  hardware step — no GPU/Ollama/llama.cpp in CI.

## State → surface → deriver → governed row map

| # | State | Visible title · status | Primary CTA | Modal `data-*` hook | Deriver(s) | Governed row(s) |
|---|-------|------------------------|-------------|---------------------|------------|-----------------|
| 1 | Eligible | Custom Model Training · Ready to train | Configure traces | `[data-handoff-journey]` `[data-handoff-curate]` | `deriveTrainingHandoffState`, `deriveLocalModelChoices` | model-training, training-traces |
| 2 | Configure Traces | Configure Traces · Configuration | Save configuration | `[data-handoff-trace-mapping]` | training-traces columns | training-traces |
| 3 | Dataset Readiness | Dataset Readiness · Valid | Continue | `[data-handoff-progress]` | `deriveShardPlan` | training-traces, model-training-run |
| 4 | One-Click Train | Train custom model · Ready | Start training | `[data-handoff-runsummary]` `[data-handoff-confirm]` | `buildTrainingRunConfig`, `deriveLocalModelChoices` | model-training, model-training-run |
| 5 | Invocation Body | Training request body · Editable | Start run | `[data-verify-prompt]` pattern | payload projection | model-training-run |
| 6 | Training Started | Training … · Running (8%) | View logs | `[data-handoff-train=running]` `[data-train-headline]` | `deriveTrainingWaitState` | model-training-run, sandbox-environment |
| 7 | Trace Ingestion | Training … · Running (22%) | View logs | `[data-train-headline=distilling]` | `deriveTrainingWaitState` | model-training-run |
| 8 | Fine-Tuning | Training … · Running (48%) | View artifacts | `[data-train-headline=fine-tuning]` `[data-train-resume]` | `deriveTrainingWaitState`, `deriveTrainingResumeState` | model-training-run |
| 9 | Evaluation | Evaluation Results · Complete | Approve & continue | `[data-eval-results]` | seeded holdout eval (labeled) | model-training-run, training-traces (holdout) |
| 10 | Troubleshoot | Training blocked · Needs attention | Retry check | `[data-train-stage-issue]` | `deriveTrainingStageIssue` | model-training-run |
| 11 | Fix Applied | Training … · Resumed | Resume training | `[data-train-resume]` | `deriveTrainingResumeState` | model-training-run |
| 12 | First Invocation | First invocation test · Success | Continue to deploy | `[data-verify-result=verified]` + inspector tabs | `deriveServingProfile`, `verifyTunedResponse` | model-training, model-training-run, api-registry, sandbox-environment |
| 13 | Deploy | Deploy custom model · Configuring | Deploy custom model | `[data-deploy-fields]` | api-registry (authRef env-ref only) | api-registry |
| 14 | Live Deployment | custom-model-v1 · Deployed | Copy request | `[data-custom-model-endpoint]` | `deriveServingProfile` | api-registry, model-invocation:* |
| 15 | Customer Proof Loop | Proof loop complete · Verified | View proof details | `[data-training-proof-checklist]` `[data-training-reward=live]` | `deriveTrainingProofChecklist`, `deriveTrainingCompletionReward` | model-training, model-training-run, api-registry, sandbox-environment |
| 16 | Model Cockpit | custom-model-v1 · Live | Run again / next action | `/custom-models` Overview/Health/Usage/Versions/Settings | `deriveCustomModelsState` | model-training, api-registry, sandbox-environment |

## Highest-level acceptance

> "I picked real examples from my workspace, started training, watched it
> progress, fixed any issue, proved the model answered as my custom model and
> not the base model, deployed it, and now I can manage it from a cockpit."

State 12 is the dopamine hit and the hardest invariant: the served model **must**
equal the tuned tag, and a **base-model response demotes** (asserted adversarially
in the generator — `baseModelDemotes: true`). No fake pass anywhere in the chain.

## The UI composition that backs these states

The Training Handoff modal was upgraded (no new runtime/schema — pure composition
over existing derivers):

- **Adaptive model/runtime** (`deriveLocalModelChoices`) — base models and serving
  runtimes are derived from the workspace's own rows, with an honest
  `setup-needed` state; no hardcoded Gemma/Ollama-only path.
- **Response inspector** — the verify step mirrors the API/Webhook test-event flow:
  an editable prompt + a `Response / Trace / Details / Proof` tabbed inspector, with
  `Verified tuned tag · Not base model · Response 200` status language.
- **Customer-readable waiting** — per-stage headlines (`STAGE_HEADLINES`) over the
  real receipt status line; the bar still moves only on real `progress.pct`.
- **Resume** (`deriveTrainingResumeState`) — a crash with a checkpoint offers
  one-click resume (smaller batch on OOM); no fake mid-file recovery.
- **Completion dopamine loop** — Use as workflow node · Open Custom Models ·
  Generate more training data · Export model proof.
