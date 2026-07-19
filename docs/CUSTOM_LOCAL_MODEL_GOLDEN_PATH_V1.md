# Custom Local Model Training — Golden Path V1
Release proof is complete for the V1 customer journey: the real UI invokes the
governed runner and records its machine result; an existing installed custom
model then proves exact-tag invocation, governed workflow creation/test/publish,
persisted output hash, invocation receipts, and trace harvest. The authoritative
16-state browser pack is
[`docs/proofs/custom-model-pipeline/states-16-real-v1/PROOF-INDEX.md`](./proofs/custom-model-pipeline/states-16-real-v1/PROOF-INDEX.md).
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

## Configure → Finalize → Start Training (pre-init contract V2)

The configuration step is discovery-driven and the gate between it and the
live invocation is a REAL sandbox run, not UI validation:

1. **Configure** — dropdowns offer only what
   `GET /api/workspace/training-readiness` (`lib/training-local-readiness-probe.js`)
   actually discovered on the machine: base models from the live Ollama server
   **and** the on-disk model store (`OLLAMA_MODELS` / `~/.ollama/models` /
   `<volume>/ollama[/models]` manifests — installed models are never hidden
   behind a stopped server), writable artifact folders (external `/Volumes/*`
   drives + candidate subfolders when they exist, workspace `./artifacts`
   fallback; nothing hardcoded), tooling, RAM/disk/GPU. The endpoint also
   auto-starts an installed-but-stopped server. Readiness rows
   (`deriveConfigureReadiness`, `lib/training-local-readiness.js`) block only
   on what an invocation genuinely needs (traces ≥ 10 · base model · writable
   folder); system-furnished tooling renders GREEN — a user is never shown a
   warning for work that is not theirs to do.
2. **Finalize** — `POST /api/workspace/sandbox-run` with intent
   `custom-model-preinit-probe` (`lib/training-preinit-probe.js`). The probe
   receipt is a `model-training-run` row with `runKind: "preinit-probe"`
   (excluded from the run lifecycle — a blocked probe never reads as a failed
   training run). The probe ENSURES the full downstream blast radius, never
   just checks it: provisions the workspace's own pipeline scripts
   (`lib/training-pipeline-scripts.js` — `train.py`, `merge_and_export.py`,
   converter shim), installs/starts the model server (Homebrew when truly
   absent, `OLLAMA_MODELS` pointed at the discovered store), installs the
   python training packages (`torch transformers datasets peft trl`) into the
   WORKSPACE-OWNED venv at `~/.growthub/training-venv` — system pythons are
   PEP 668 externally managed and refuse installs, so the workspace owns its
   environment (verified by real import through the venv interpreter) —
   installs the quantize tools (`brew install llama.cpp`
   when none discovered), write-probes the artifact folder, measures the
   machine (disk-at-folder blocks; RAM/VRAM warn), and requires a REAL
   chat-completions HTTP 200. Phase markers are stamped before every long
   operation so an interrupted probe reports exactly where it stopped and
   Retry finalize resumes. Base-weight reachability (HF license gating) is
   the one warn-only check — a token cannot be furnished for the user.
3. **Start Training** — impossible until `deriveStartTrainingReadiness`'s
   blocking `preinit-probe-passed` check reads a passed probe receipt for the
   approved draft (`result.preInitRunId`). The training runner then
   self-provisions its fresh sandbox workdir (scripts + linked llama.cpp
   binaries; the fine-tune/merge steps run on the workspace training venv,
   falling back to `python3`), performs **distillation as a
   real stage** (exports the curated governed traces to the JSONL the
   fine-tune consumes, stamped `distilling`), and runs the full argv pipeline.
   The modal starts its receipt poll BEFORE firing the synchronous
   `sandbox-run` POST, and every governed write is read-latest-then-patch —
   the two 0%-freeze bugs this contract fixed.

Timeout truth: the sandbox route applies the locality-aware ceiling
(`SANDBOX_MAX_TIMEOUT_MS_LOCAL`, 6 h) to local runs — the serverless 10-minute
cap SIGKILLed real dependency-ensure/fine-tune work mid-flight before this fix.

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
node --test scripts/unit-training-runtime.test.mjs  # 87/87 — stages, monotonic
                                                    #   progress, command-safety,
                                                    #   stage-issue catalog, proof
                                                    #   checklist, completion reward,
                                                    #   pre-init gate (Finalize receipt
                                                    #   required before Start Training)
node --test scripts/unit-training-local-readiness.test.mjs  # 17/17 — discovery
                                                    #   (disk models, external folders,
                                                    #   folder containment), configure
                                                    #   readiness rows, honesty floor
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

**Proven here** (no GPU): the governed brain (all derivers, 87/87 runtime +
17/17 local-readiness), the ladder
+ demotions (29/29), the chat-completion proof against a real local HTTP server
(17/17), the real `/data-model` workspace shell + governed rows, the composed
argv pipeline shown in the real modal, the one-click governed receipt write, and
the failure→one-click-remediation derivation from a real governed receipt.

**Proven on the operator's machine (2026-07-07)**: real-interface Finalize
runs the pre-init sandbox probe (installed Ollama via Homebrew from the click,
started the server against the external-drive model store, discovered
`gemma:2b / gemma3:4b / workspace-local-tuned-v1` from disk manifests), and a
live invocation liveness proof through the exact Start-Training lane showed
the governed receipt leave 0% within 1.5 s (preflight → real 12-trace
distillation → fine-tune GH_PROGRESS stamp at 27%) before stopping honestly at
the missing python stack — which the pre-init probe now auto-installs.

**Deferred to the operator's long-run session** (hours of wall-clock, not
capability): the full weights fine-tune through the 9-milestone proof pack.
Dependency furnishing is no longer deferred — Finalize's probe ensures the
python ML stack, `ollama`, and `llama.cpp` itself.
