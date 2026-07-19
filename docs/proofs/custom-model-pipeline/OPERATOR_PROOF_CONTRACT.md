# Operator Proof Contract — the ONE deferred step, made machine-checkable

## Core rule

"No GPU in CI" defers **exactly one thing**: the real full-duration weight
training on the operator's machine — producing a real adapter/merged/GGUF/quant
artifact, serving it through Ollama/llama.cpp/vLLM, and proving the tuned tag
through a real chat-completions response.

It does **not** defer, and this repo proves in-sandbox: UI state coverage across
all 16 states, seeded-boot browser↔API↔deriver parity, progress-bar truth,
monotonic-progress rejection of stale writes, idempotent run identity, command
safety (argv + allowlist + safe tag), negative/demotion states, endpoint
registration, the Custom Models cockpit, the first-invocation proof contract,
and the proof index. See `PROOF-INDEX.md` (16-state provenance) and the pure
suites (`unit-training-runtime` **74/74**, `unit-custom-models-ledger` 14/14,
`unit-training-ledger` 24/24, `e2e-custom-model-deployment-loop` 17/17).

## Crash-safety model (explicit)

Training/quantization crash-safety comes from **checkpoints, hashes, temp
artifacts, atomic renames, and resumable runner state** — never from continuous
batching. Continuous batching is a **serving throughput** technique that only
applies to inference **after** the artifact exists; it is validated as a
*serving capability* (state 14 / `deriveServingProfile`), not as proof that
training or quantization is crash-safe. The runner streams `GH_PROGRESS
{step,total,loss,checkpoint}` and the monotonic merge keeps the last checkpoint
on crash, so a failed fine-tune stays resumable (`deriveTrainingResumeState`)
with `blockedReason` carrying the cause.

## The contract (validated by `scripts/verify-operator-proof-contract.mjs`)

The operator submits `docs/proofs/custom-model-pipeline/operator-proof.json`.
CI runs the validator; until the file lands it is a no-op skip, and once it
lands every field below is required and cross-checked (`httpStatus===200`,
`servedModel===expectedTag`, `servedModel!==baseModel`, `quantOutputBytes <
quantSourceBytes`). "GPU needed" can never hide a missing field.

| Group | Required fields |
| --- | --- |
| `hardwareInventory` | cpu · ramGB · gpu · diskFreeGB · os |
| `toolVersions` | python · torch · cuda · ollama · llamaCpp |
| `determinism` | seed · device · backend · deterministicAlgorithms · note |
| `dataset` | datasetSha · acceptedCount · rejectedCount · holdoutSplit · tokenEstimate |
| `fineTune` | step · totalSteps · loss · checkpointPath · resumeFromCheckpoint · rngStatePreserved |
| `artifact` | path · sha256 · quantization · quantSourceBytes · quantOutputBytes |
| `serving` | adapter · servedModelTag · endpoint · continuousBatching · speculative |
| `firstInvocation` | httpStatus · servedModel · expectedTag · baseModel · notBaseModel · done · latencyMs · responseBody |
| `proof` | outputHash · screenshot · readback |

Run `node scripts/verify-operator-proof-contract.mjs --self-test` to see the
gate accept the template and reject a missing field + a base-model demotion.

## Web-grounded standard (external anchors)

- **PyTorch reproducibility** — full reproducibility is *not* guaranteed across
  releases/platforms/devices; the proof stamps OS, device, seed, package
  versions, backend, and deterministic settings (`determinism.*`) rather than
  pretending one seed proves universal determinism.
- **Hugging Face Trainer `resume_from_checkpoint`** — restores model, optimizer,
  scheduler, and RNG state when checkpoint files exist; `fineTune.checkpointPath`
  + `resumeFromCheckpoint` + `rngStatePreserved` mirror that standard.
- **PyTorch checkpointing RNG tradeoff** — `fineTune.rngStatePreserved` states
  whether RNG state is preserved and the reproducibility tradeoff chosen.
- **vLLM / Ollama OpenAI-compatible serving** — `firstInvocation` proves the same
  `/v1/chat/completions` request/response shape through the registry lane and
  captures the actual served `model`, `done`, `latencyMs`, and `httpStatus`
  (not just "responded").
- **MLflow Model Registry** — the Custom Models cockpit mirrors lineage,
  versions, metadata, rollback/aliases, and artifact links (state 16).
- **NIST AI RMF** — proof is valid/reliable/safe/secure/accountable/transparent
  across design→deployment→use→evaluation, not "green CI".
- **OpenTelemetry semantic conventions** — readbacks use consistent field naming
  so proof rows and UI states are machine-queryable.

## What stays deferred (and only this)

The real full-duration fine-tune completing on hardware with an actual GPU/CPU
toolchain, producing the final artifact, serving it, and proving the tuned tag
through a real chat-completions response — captured as `operator-proof.json`
(+ screenshot/readback) against the contract above. Everything else is proven
in-sandbox and is not permitted to hide behind "needs GPU".
