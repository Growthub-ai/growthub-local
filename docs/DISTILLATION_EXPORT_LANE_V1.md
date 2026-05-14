# Distillation and export lane (V1)

This document describes an **additive export story** for advanced buyers: improve local models **outside** Growthub Local’s core runtime, then point the workspace back at the new weights through existing fields.

It is not a new `objectType` and not embedded training inside orchestration.

## Flow (end to end)

1. **Runtime inference** — Operators use normal sandbox rows (including `local-intelligence`) and CLI Local Intelligence flows. Models emit JSON envelopes; sandboxes record stdout/stderr and metadata.
2. **Trace and source-record capture** — Successful and failed runs append to `growthub.source-records.json` and stamp compact fields on the row (`lastRunId`, `lastSourceId`, `lastResponse`, `status`).
3. **JSONL export** — Serialize selected records (for example `growthub-local-intelligence-trace-v1` or sandbox envelopes) into newline-delimited JSON for offline tooling. This can be a small script or external ETL; the contract is “auditable rows,” not a training runtime inside Next or the CLI.
4. **External fine-tuning** — QLoRA, LoRA, or vendor fine-tune pipelines consume the JSONL on separate machines or services.
5. **Reload local model** — Load resulting weights into **Ollama**, **LM Studio**, **vLLM**, or another OpenAI-compatible host.
6. **Select in workspace or CLI** — Set the concrete `localModel` (and endpoint if needed) on the sandbox row or in Local Intelligence config. No enum churn: concrete model ids stay open-ended.

## What this avoids

- Coupling the core repo to ML training infrastructure.
- Adding a “Distillation” row type for every experiment when **fields + exports + source records** already carry lineage.
- Blurring **advisory** model output with **deterministic** execution authority.

## Related reading

- [NATIVE_INTELLIGENCE_LOCAL_ADAPTER_ARCHITECTURE.md](./NATIVE_INTELLIGENCE_LOCAL_ADAPTER_ARCHITECTURE.md) — non-goals, sandbox adapter, trace export notes.
- [BASELINE_FOUNDATION_V1.md](./BASELINE_FOUNDATION_V1.md) — what stays frozen vs refined.
