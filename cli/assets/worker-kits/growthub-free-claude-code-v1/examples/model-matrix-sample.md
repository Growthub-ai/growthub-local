# Model Matrix — SAMPLE (Growthub Dev Laptop)

**Project:** Growthub operator laptop — free local Claude Code
**Date:** 2026-04-23
**Proxy:** `http://127.0.0.1:8082`

---

## Summary

| Provider | Prefix | Model id | Context | Tier | RTT (ms) | Result | Notes |
|---|---|---|---|---|---|---|---|
| LM Studio | `lmstudio/` | `lmstudio/qwen2.5-coder-32b-instruct` | 32k | Local | 820 | pass | 4-bit quant on RTX 4090 |
| LM Studio | `lmstudio/` | `lmstudio/qwen2.5-14b-instruct` | 32k | Local | 380 | pass | faster for `haiku` role |
| NVIDIA NIM | `nvidia_nim/` | `nvidia_nim/meta/llama3-70b-instruct` | 8k | Free | 1650 | pass | rate-limited 40/min |
| NVIDIA NIM | `nvidia_nim/` | `nvidia_nim/meta/llama3-8b-instruct`  | 8k | Free | 710 | pass | fast fallback |
| OpenRouter | `open_router/` | `open_router/qwen/qwen2.5-72b-instruct` | 32k | Free | n/a | skipped | no key on this laptop |

---

## Role mapping candidates

| Claude Code role | Best pass result | Chosen model | Fallback |
|---|---|---|---|
| `opus` (hardest reasoning) | `lmstudio/qwen2.5-coder-32b-instruct` | `lmstudio/qwen2.5-coder-32b-instruct` | `nvidia_nim/meta/llama3-70b-instruct` |
| `sonnet` (balanced) | `lmstudio/qwen2.5-coder-32b-instruct` | `lmstudio/qwen2.5-coder-32b-instruct` | `nvidia_nim/meta/llama3-70b-instruct` |
| `haiku` (fastest) | `lmstudio/qwen2.5-14b-instruct` | `lmstudio/qwen2.5-14b-instruct` | `nvidia_nim/meta/llama3-8b-instruct` |
| `fallback` | `nvidia_nim/meta/llama3-70b-instruct` | `nvidia_nim/meta/llama3-70b-instruct` | — |

---

## Exclusions

| Model | Reason excluded |
|---|---|
| `nvidia_nim/meta/llama3.1-405b-instruct` | Not available on free tier for this account |

---

## Re-probe cadence

Re-run `/fcc-diag` when LM Studio is restarted or a model is unloaded.
