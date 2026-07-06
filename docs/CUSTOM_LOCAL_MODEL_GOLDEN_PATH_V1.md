# Custom Local Model Training — Golden Path V1

The end-to-end, governed, no-code path that takes real workspace reasoning
traces to a **real local custom model** (distilled corpus → QLoRA fine-tune →
GGUF convert → quantize → Ollama serve → tuned-tag verify → workflow smoke),
and the QA contract every future agent session must satisfy before calling it
done. Companion to
[`MARKETPLACE_PROVIDER_PLAYBOOK_V1`](./MARKETPLACE_PROVIDER_PLAYBOOK_V1.md) and
[`CUSTOM_MODEL_TRAINING_RUNTIME_V1`](./CUSTOM_MODEL_TRAINING_RUNTIME_V1.md).

Invariant (unchanged): **no new runtime, no new mutation lane, no parallel
store.** Source of truth stays the governed Data Model, API Registry rows,
`model-training-run` receipts, the `sandbox-run` lane, and `PATCH /api/workspace`.
One click starts/resumes one `trainingRunId`; one `model-training-runner`
sandbox object runs the ordered pipeline; one receipt row carries the monotonic
progress; the UI polls that row and renders **only real receipt state**.

## Canonical progress vocabulary (0–7)

`TRAINING_PROGRESS_STAGES` in `lib/training-run-receipts.js` — every surface
reasons about these ids, not free-form text:

| rank | stageId | proofKind |
| --- | --- | --- |
| 0 | `preflight` | system (RAM/disk/GPU/tool versions) |
| 1 | `distilling` | records (accepted/rejected counters, distilled.jsonl sha) |
| 2 | `fine-tuning` | adapter (step/loss/checkpoint, HF Trainer callback) |
| 3 | `converting` | gguf (source model path, converter version) |
| 4 | `quantizing` | quant-bytes (fp16→quant byte delta, GGUF sha) |
| 5 | `serving` | served-tag (ollama create stream) |
| 6 | `verifying` | chat-completion (served model == expected tuned tag) |
| 7 | `complete` | output-hash (workflow smoke) |

Progress is **monotonic by construction** (`nextProgress`): a later write may
only advance `stageRank`, then `counter`, then `pct`; stale/out-of-order/
duplicate-runner writes are refused. The deriver surfaces the monotonic max.

## Stage-event failure catalog (causation drivers)

`TRAINING_STAGE_ISSUES` + `deriveTrainingStageIssue(runRow, systemProbe, logs)`
in `lib/training-runtime-drivers.js`. The driver never returns a generic
"failed" — it returns `{ stageId, issue, severity, userMessage, evidence,
nextAction }`. Issue codes by stage:

- **preflight** → `preflight_blocked` (no GPU / low VRAM/RAM/disk / missing
  python·cuda·nvidia-smi·ollama·llama.cpp / port 11434 blocked)
- **distilling** → `distill_format_failed`, `distill_teacher_failed`, `distill_floor_unmet`
- **fine-tuning** → `fine_tune_oom` (→ resume smaller batch), `fine_tune_dependency_failed`, `fine_tune_unstable_loss`, `fine_tune_interrupted`
- **converting** → `convert_failed`
- **quantizing** → `quant_failed`, `quant_unproven`, `quant_size_contradiction`
- **serving** → `serve_registration_failed`
- **verifying** → `verify_base_model`, `verify_mismatch`, `verify_no_output_hash`
- **complete** → `completion_unproven`, `registry_unbound`, `duplicate_run`

Each maps to a **one-click** `nextAction` (`deriveTrainingNextAction`) that
routes through the same modal — e.g. `fine_tune_oom → "Resume with a smaller
batch"`, `quant_size_contradiction → "Re-quantize & re-run"`.

## Waiting-UX rules (no fabricated progress)

`deriveTrainingWaitState(runRow, nowMs)`:
1. Bar width = `model-training-run.progress.pct` **only**.
2. No receipt progress → text only: **"Waiting for runner stamp…"** (bar 0).
3. One thin status line: `fine-tuning · step 220/500 · loss 1.82`.
4. Elapsed shown **separately**, never as progress: `Running for 18m · last proof 37s ago`.
5. On failure the modal stays put and shows the one derived next action.

## Command execution (hardened)

The one-click profile (`unsloth-qlora-quantize-pipeline`) is **argv step specs**
(`{ bin, args[] }`), executed with `execFileSync` — **no shell string**.
Binaries are allowlisted (`ALLOWED_PIPELINE_BINS`); model tags/quant levels are
validated (`isSafeModelTag`); paths must stay workspace-contained
(`isContainedPath`). Unsafe input → run config `ready:false` (never fires).
The runner's callback URL is baked from `window.location.origin` so its
governed stamps reach the launching workspace (the sandbox spawns it with a
restricted env).

## Proof pack — the 9 milestones (`deriveTrainingProofChecklist`)

One screenshot + one JSON readback per milestone, proven **only** by real
evidence on the governed rows:

| # | screenshot | JSON readback |
| --- | --- | --- |
| 01 | preflight pass | receipt `preflight` (RAM/disk/GPU) |
| 02 | distilling counter | distilled sha + accepted/rejected |
| 03 | fine-tune step callback | step / loss / checkpoint |
| 04 | convert GGUF | GGUF path + converter version |
| 05 | quant size proof | `artifactSourceBytes` → `artifactArtifactBytes` |
| 06 | ollama create stream | create status + served tag |
| 07 | chat verify tuned tag | `/api/chat` `model` == expected tag (not base) |
| 08 | registry live | API Registry row `connected` |
| 09 | workflow smoke outputHash | `outputHash` |

Completion reward (`deriveTrainingCompletionReward`) returns `live:true` **only**
when all 9 hold, with `trainedTag · baseModel · artifactSha · quantDelta ·
localEndpoint · verifiedResponseModel · outputHash`. The headline is
"Your custom model is live locally." — not "training completed".

## How to run the QA (future agents)

```bash
# 1. Boot the model-QA seeded temp workspace (12 governed traces + model-training
#    row on base gemma3). Documented harness — do NOT hand-roll `next dev`.
GROWTHUB_KIT_EXPORTS_HOME=/tmp/ws node scripts/export-seed-workspace-model-qa.mjs
#    → App URL http://127.0.0.1:3777 (dev server stays up).

# 2. Pure-deriver QA (no GPU): the whole governed brain.
node scripts/unit-training-runtime.test.mjs        # 72/72 — stages, monotonic
                                                    #   progress, command-safety,
                                                    #   stage-issue catalog, proof
                                                    #   checklist, completion reward
node scripts/e2e-custom-model-training-loop.mjs     # 29/29 ladder + demotions
node scripts/e2e-custom-model-deployment-loop.mjs   # 17/17 chat-completion proof

# 3. Real-browser QA on the booted workspace (playwright-core Chromium):
BASE_URL=http://127.0.0.1:3777 PLAYWRIGHT_DIR=$PWD \
  node scripts/e2e-custom-model-shell-playwright.mjs     # real /data-model shell,
                                                          #   governed model-training +
                                                          #   api-registry rows
BASE_URL=http://127.0.0.1:3777 PLAYWRIGHT_DIR=$PWD \
  node scripts/e2e-custom-model-journey-playwright.mjs    # gate → composed pipeline →
                                                          #   one-click governed receipt
```

## Proven in-container vs deferred to a real machine

**Proven here** (no GPU): the governed brain (all derivers, 72/72), the ladder
+ demotions (29/29), the chat-completion proof against a real local HTTP server
(17/17), the real `/data-model` workspace shell + governed rows, the composed
argv pipeline shown in the real modal, the one-click governed receipt write, and
the failure→one-click-remediation derivation from a real governed receipt.

**Deferred to the operator's machine** (physically impossible in CI — no GPU,
no python ML stack, no `ollama`, no `llama.cpp`): the live weights fine-tune and
the 9-milestone real-machine proof pack. The pipeline is built to produce that
proof on real hardware; capturing it is the operator's step, mirroring PR #270's
deferral of live-vendor smoke. **This is the reason the PR stays a draft.**
