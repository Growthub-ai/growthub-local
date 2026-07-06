# Custom Model Training Pipeline — Production Proof Pack

Real-user browser journey on a real boot of the exported
`growthub-custom-workspace-starter-v1` kit, mirroring the marketplace
providers' golden-path closed-loop standard (`docs/proofs/pr270/PROOF.md`).
The pipeline under proof: the one-click distillation → QLoRA fine-tune →
GGUF quantize → serve loop inside the Training Handoff modal, governed
end-to-end through the existing `PATCH /api/workspace` + `sandbox-run` lanes.

## Proof environment (honest adaptation, same as the pr270 pack)

- **Driver**: `playwright-core` on the pre-installed Chromium
  (`/opt/pw-browsers/chromium`), viewport 1440×950 — `scripts/e2e-custom-model-journey-playwright.mjs`.
- **Backend**: local boot of the exported worker kit via the documented
  `scripts/export-seed-workspace-model-qa.mjs` harness — `next dev --webpack`
  on `http://127.0.0.1:3777`, seeded to a super-admin model-QA state
  (12 governed `training-traces`, a `model-training` row on base `gemma3`).
- **Live action layer**: Playwright `click` / real navigation of the governed
  wizard (checklist → curate → profile → prepare → train) — no API shortcuts
  for user steps.
- **Readback layer**: `page.request` + `curl` JSON readbacks against
  `/api/workspace`; captured in `readbacks.json` and the receipt readouts below.
- **Screenshots**: numbered PNGs in this directory, in journey order.

Live GPU/Ollama/Unsloth fine-tune cannot execute in this environment (no GPU,
no toolchain), exactly as pr270 defers live-vendor egress. Everything the
runtime *governs* — the gate, the composed pipeline, the governed receipts,
the quant proof, the thin-delta progress, and the derived remediation — is
proven here against real server-side code paths.

---

## Journey — one continuous browser run

```text
Using playwright-core Chromium against the local export boot at 127.0.0.1:3777.
Backend: model-QA seed (12 traces, model-training row on gemma3).
```

**1 — `/training` renders; fine-tune gate is GREEN** (`01-training-ledger-gate.png`)
The Training ledger loads (the earlier CSS merge defect that 500'd every page
is fixed), and the bootstrap step **"Train & import a real custom model"**
reports **ready** — 12 qualified reasoning traces clear the 10-trace floor.

**2 — the handoff modal opens** (`02-handoff-modal-open.png`)
"Start model training": **11 qualified traces / 10 minimum / Ollama (local)
target**, with the governed 4-step flow (Review → Train → Attach → Test & run).

**3 — the ONE-CLICK pipeline is the composed chain** (`03-composed-pipeline-commands.png`)
The Train panel shows the real "Exact command this runs on your machine":
`python train.py … → merge_and_export.py → convert_hf_to_gguf.py →
llama-imatrix → llama-quantize … {quant} → ollama create` — the composed
`unsloth-distill-quantize-pipeline` profile, base `gemma3`, endpoint
`http://127.0.0.1:11434/v1/chat/completions`. Journey check: **quantize=true,
serve=true** in the command chain (PASS).

**4 — one click records a GOVERNED receipt** (`04-one-click-governed-receipt.png`)
"Start fine-tuning" writes, in one governed `PATCH /api/workspace`, a
`model-training-run` receipt (`status: running`) plus the runner sandbox row.
Readback: run row present, `trainingProfile: unsloth-distill-quantize-pipeline`.

**5 — the runner sandbox stands up (atomic, no parallel runtime)** (`05-runner-sandbox-thin-delta.png`)
The `model-training-runner` `sandbox-environment` object appears with **1 row**
carrying the runner program; the loop rides the existing `sandbox-run` lane —
nothing else spins up.

**6 — governance boundary + governed failed receipt → derived remediation**
The governed write initially returned **HTTP 400** — the Law layer rejected the
runner because its multi-hour `timeoutMs` exceeded the sandbox 10-minute cap.
Fixed: local-machine runs (`runLocality:"local"`) now allow up to 6h; the
runner PATCH then returns **HTTP 200** (verified live). On a stage failure the
runner stamps a governed `failed` receipt naming the stage; re-reading that live
governed state, `deriveTrainingRemediation` returns the one-click remedy:

```json
{ "failurePoint": "fine-tune", "action": "retry_finetune",
  "cta": "Adjust & re-run the fine-tune", "destination": "/training",
  "oneClick": true }
```

---

## Real workspace shell (not the bare route)

`00-real-data-model-shell.png` — the actual `/data-model` workspace shell on the
booted seeded export: rail (Builder / Workspace Lens / Management / Settings) and
the **API Registry showing the governed `workspace-local-model` row →
`http://127.0.0.1:11434/v1/chat/completions`** alongside the seeded
`model-training` (base `gemma3`) + 12 `training-traces`. `shell-objects.json` is
the governed-object readback. This is the real no-code experience, driven by
`scripts/e2e-custom-model-shell-playwright.mjs` (3/3 governed checks).

`readbacks.json` is consistent with the screenshots: it records the real
`/data-model` shell, the one-click governed `model-training-run` receipt
(`status: running`) + atomic runner sandbox, and the governed `failed` receipt →
`deriveTrainingStageIssue`/remediation derivation. It does **not** claim a
terminal `complete` readback that this environment cannot produce.

See [`CUSTOM_LOCAL_MODEL_GOLDEN_PATH_V1`](../../CUSTOM_LOCAL_MODEL_GOLDEN_PATH_V1.md)
for the canonical stage vocabulary, the stage-event failure catalog, the
waiting-UX rules, and the 9-milestone proof contract.

## What is proven vs deferred

| Stage | Proof |
| --- | --- |
| Invocation gate (≥10 JSONL reasoning traces) | Real browser: gate READY at 12 traces |
| Composed QLoRA→quantize→serve pipeline | Real browser: command chain shown (quantize + ollama create) |
| One-click governed receipt | Real browser: `model-training-run` row written via governed PATCH |
| Atomic runner sandbox (no parallel runtime) | Real browser: `model-training-runner` row = 1 |
| Governance boundary (timeout cap) | Live: PATCH 400 → 200 after the local-cap fix |
| Governed `failed` receipt → one-click remediation | Live governed state → `deriveTrainingRemediation` → `retry_finetune` |
| Quant proof gate, remediation sub-registry, shard planner | `unit-training-runtime` 56/56 |
| Full ladder + demotions | `e2e-custom-model-training-loop` 29/29, `deployment-loop` 17/17 |
| **Deferred** (env-bound): live GPU/Ollama/Unsloth fine-tune; the runner's callback stamp under the local sandbox adapter | No GPU/toolchain in this environment (same class of deferral as pr270's live-vendor smoke) |

Pure-suite totals on this branch: **unit-training-runtime 56/56 ·
training-loop 29/29 · deployment-loop 17/17 · sandbox-browser-access 11 ·
supabase-hardening 12** — all green.
