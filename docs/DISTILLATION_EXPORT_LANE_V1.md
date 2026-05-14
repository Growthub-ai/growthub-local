# Distillation and export lane (V1)

This document names the **additive export path** for model improvement narratives **without** adding a new Data Model object or training inside Growthub Local’s core runtime.

## What this is not

- **Not** a new governed `objectType` for “distillation jobs.”
- **Not** a training loop inside the CLI or Next.js workspace orchestration.
- **Not** execution authority delegated to a local model—sandboxes **run** through deterministic routes; local models **propose** structured output only where the adapter contract allows.

## What the lane is

1. **Runtime inference** — Local Intelligence (CLI) and/or the workspace **`local-intelligence`** sandbox adapter call an OpenAI-compatible endpoint; completions are normalized to a JSON envelope.
2. **Trace and source-record capture** — Sandbox runs persist history under the workspace **source-records** sidecar and stamp `lastResponse`, `lastRunId`, and `lastSourceId` on rows (see `POST /api/workspace/sandbox-run` in the starter kit).
3. **JSONL export** — Existing export tooling (for example source-record export paths described in [NATIVE_INTELLIGENCE_LOCAL_ADAPTER_ARCHITECTURE.md](./NATIVE_INTELLIGENCE_LOCAL_ADAPTER_ARCHITECTURE.md)) can serialize envelopes into JSONL-friendly records for **external** QLoRA / fine-tuning pipelines.
4. **External fine-tuning** — Training happens in your ML environment (Ollama modfile flows, Axolotl, Unsloth, etc.): outside this repo’s runtime.
5. **Reload local model** — Load resulting weights or merged adapters into **Ollama**, **LM Studio**, or **vLLM**.
6. **Select in sandbox / CLI** — Point **localModel** (and endpoint env vars) at the new tag so the next run uses the improved weights—no enum churn in core contracts beyond your own model id string.

## Why keep it an export lane

- Preserves **execution authority** and **auditability** (receipts stay in source records, not in opaque trainer state).
- Avoids coupling the workspace builder to ML infrastructure versions.
- Lets advanced buyers adopt distillation **only** when their security model allows export from the artifact.

## Cross-references

- Native intelligence architecture: [NATIVE_INTELLIGENCE_LOCAL_ADAPTER_ARCHITECTURE.md](./NATIVE_INTELLIGENCE_LOCAL_ADAPTER_ARCHITECTURE.md) (sections on training non-goals and distillation-ready trace export).
- Baseline compass: [BASELINE_FOUNDATION_V1.md](./BASELINE_FOUNDATION_V1.md).
