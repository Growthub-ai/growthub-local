# Custom Model Training Pipeline — Super-Admin Proof Pack

The proof narrative for the one-click, no-code local custom-model pipeline
(distilled corpus → QLoRA fine-tune → GGUF convert → quantize → Ollama serve →
tuned-tag verify → workflow smoke), governed end-to-end through the existing
`PATCH /api/workspace` + `sandbox-run` lanes. Companion to
[`CUSTOM_LOCAL_MODEL_GOLDEN_PATH_V1`](../../CUSTOM_LOCAL_MODEL_GOLDEN_PATH_V1.md)
(the canonical 0-7 stage vocabulary, failure catalog, and 9-milestone contract).

**Read this pack in three clearly-separated classes so nothing is over-claimed:**

- **Section A — real booted in-container journey.** A real browser (`playwright-core`
  Chromium) driving a real `next dev` boot of the exported kit. Everything the
  runtime *governs* is proven here.
- **Section B — seeded terminal-state UI/deriver proof.** A complete governed
  receipt injected through the sanctioned PATCH so the terminal states (9/9
  proof checklist, completion reward) render + derive from real rows — the UI/
  deriver truth, with the weights themselves stubbed.
- **Section C — real-machine weights proof (deferred, required before merge).**
  The live GPU/Ollama/Unsloth run. Physically impossible in CI; the operator's
  hardware step. **This is why the PR stays draft.**

Environment: `playwright-core` on `/opt/pw-browsers/chromium` (1440×950); local
`next dev --webpack` boot of `growthub-custom-workspace-starter-v1` on
`http://127.0.0.1:3777`, seeded model-QA (12 governed `training-traces`, a
`model-training` row on base `gemma3`).

---

## Section A — real booted in-container journey

Driver `scripts/e2e-custom-model-shell-playwright.mjs` (3/3 governed checks) +
`scripts/e2e-custom-model-states-playwright.mjs` (4/4 state checks).

1. **Real workspace shell** (`00-real-data-model-shell.png`) — the actual
   `/data-model` shell (rail: Builder / Workspace Lens / Management / Settings)
   with the **API Registry** showing the governed `workspace-local-model` row →
   `http://127.0.0.1:11434/v1/chat/completions`. `shell-objects.json` is the
   governed-object readback. **This is the real no-code experience, not a bare route.**
2. **Readiness / why the button is allowed** (`states/01-gate-checklist.png`) —
   the training ledger over the governed corpus; the fine-tune step is READY at
   12 qualified traces (≥ 10 floor).
3. **Composed argv pipeline** (`states/02-profile-argv-commands.png`,
   `03-composed-pipeline-commands.png`) — the `unsloth-qlora-quantize-pipeline`
   profile: `python train.py … → merge_and_export → convert_hf_to_gguf →
   llama-imatrix → llama-quantize {quant} → ollama create`, shown as the exact
   argv the runner executes (no shell string).
4. **Unsafe config is impossible to start** (`states/03-unsafe-config-blocked.png`)
   — injecting `evil; curl x | sh` as the tuned tag → **Prepare disabled
   (`prepDisabled=true`)** and `commandSafety.reasons` rendered.
5. **One click → governed receipt + atomic runner** (`04-one-click-governed-receipt.png`,
   `05-runner-sandbox-thin-delta.png`) — one `model-training-run` receipt +
   one `model-training-runner` sandbox row; no parallel runtime.
6. **Waiting UX with no fabricated progress** (`states/04-running-wait-state.png`)
   — a `running` receipt with no progress yet → bar width **0** and
   "Waiting for runner stamp…"; the bar only moves from real `progress.pct`,
   `aria-valuenow` set only when determinate, elapsed shown separately.

---

## Section B — seeded terminal-state UI/deriver proof

Driver `scripts/e2e-custom-model-states-playwright.mjs` injects a **complete
governed `model-training-run` receipt + `api-registry` lastResponse** through
the sanctioned PATCH, then derives against the live row.
`states/readbacks.json` records:

- **9-milestone proof checklist = 9/9, complete=true** — preflight, distilling
  counter, fine-tune, convert GGUF, quant size proof, ollama create, chat-verify
  tuned tag, registry live, workflow outputHash — each proven from the governed
  row (see `deriveTrainingProofChecklist`).
- **Completion reward = live** — "**Your custom model is live locally.**", tag
  `workspace-local-tuned-v1`, base `gemma3`, quant `16.0 GB → 4.4 GB (q4_k_m)`,
  endpoint `:11434/v1`, verified response model == tuned tag, outputHash.
- **Failure + resume** (unit-proven, `unit-training-runtime`): `fine_tune_oom →
  "Resume from checkpoint with a smaller batch"`; quant contradiction →
  re-quantize; base-model response → never verifies.

The weights are stubbed; the UI, derivers, receipts, and proof gates are real.

---

## Section C — real-machine weights proof (deferred, required before merge)

Physically impossible in CI (no GPU / python ML / `ollama` / `llama.cpp`). The
operator captures, on real hardware, one small-model path — each a screenshot +
JSON readback:

`01 preflight pass` · `02 distilling counter (distilled sha + accepted/rejected)`
· `03 fine-tune step/loss/checkpoint` · `04 GGUF convert` · `05 quant byte delta
+ sha` · `06 ollama create stream + served tag` · `07 chat verify (served ==
tuned tag)` · `08 API Registry connected` · `09 workflow smoke outputHash`.

Same class of deferral as PR #270's live-vendor smoke.

---

## Section D — screenshot / readback → governed-row index

Every claim traces to a governed row or source record.

| Artifact | Proves | Governed source |
| --- | --- | --- |
| `00-real-data-model-shell.png` + `shell-objects.json` | real workspace shell + custom-model endpoint | `api-registry` (`workspace-local-model`), `model-training`, `training-traces` |
| `states/01-gate-checklist.png` | invocation gate READY at 12 traces | `training-traces` rows, `deriveDistillationPipelineState` |
| `states/02-profile-argv-commands.png`, `03-composed-pipeline-commands.png` | composed argv pipeline | `training-runtime-profiles.js` (`unsloth-qlora-quantize-pipeline`) |
| `states/03-unsafe-config-blocked.png` | unsafe config disables Prepare | `runConfig.commandSafety` (`buildTrainingRunConfig`) |
| `04-one-click-governed-receipt.png` | one governed run receipt written | `model-training-run` row (PATCH `/api/workspace`) |
| `05-runner-sandbox-thin-delta.png` | atomic runner, no parallel runtime | `sandbox-environment` (`model-training-runner`) |
| `states/04-running-wait-state.png` | bar 0 until real stamp | `model-training-run.progress` (`deriveTrainingWaitState`) |
| `states/readbacks.json` (checklist 9/9) | terminal proof from governed rows | `model-training-run` (artifact* + progress + preflight + outputHash) + `api-registry.lastResponse` |
| `states/readbacks.json` (reward live) | completion reward truth-bound | `deriveTrainingCompletionReward` over the same rows |
| `readbacks.json` (root) | honest in-container path (no live `complete`) | narrates the deferred boundary |

Pure-suite backing: `unit-training-runtime` **72/72** · `unit-custom-models-ledger`
**14/14** · `e2e-custom-model-training-loop` **29/29** ·
`e2e-custom-model-deployment-loop` **17/17**.

---

## Section E — gaps deferred by physical environment

- **Live weights fine-tune to `complete`** — needs a GPU + python ML +
  `ollama`/`llama.cpp`. Not present in CI. → Section C, operator hardware.
- **The runner's on-machine callback under a real GPU run** — proven governed
  at the receipt level (Section B); the live end-to-end callback rides Section C.
- **Real-browser screenshots of the newly-wired cockpit** (Details open,
  Suggested Actions accordion, serving profile) — derivers are unit-proven
  (14/14 + 72/72); the browser capture is the next in-container follow-up.
- **Helper-setup verified-model selection** + **truthful open-artifact contract**
  — explicitly deferred (tracked on the PR).

Proof quality is product quality: this pack lets a super admin trace every
state to a governed row, and is explicit about the one thing a cloud CI cannot
physically do — run the weights.
