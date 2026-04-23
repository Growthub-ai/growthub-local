# Model Matrix

**Project:** [PROJECT NAME]
**Date:** YYYY-MM-DD
**Proxy:** `http://127.0.0.1:<port>`

---

## Summary

Every row is a concrete model id that was probed live with `/fcc-diag`. Only rows marked `pass` may be used in `routing-config.md`.

| Provider | Prefix | Model id | Context | Tier | RTT (ms) | Result | Notes |
|---|---|---|---|---|---|---|---|
| NVIDIA NIM | `nvidia_nim/` | `nvidia_nim/meta/llama3-70b-instruct` | 8k | Free | [n] | [pass/fail] | [comment] |
| NVIDIA NIM | `nvidia_nim/` | `nvidia_nim/meta/llama3-8b-instruct`  | 8k | Free | [n] | [pass/fail] | [comment] |
| OpenRouter | `open_router/` | `open_router/qwen/qwen2.5-72b-instruct` | 32k | Free | [n] | [pass/fail] | [comment] |
| OpenRouter | `open_router/` | `open_router/meta-llama/llama-3.3-70b` | 32k | Free | [n] | [pass/fail] | [comment] |
| DeepSeek | `deepseek/` | `deepseek/deepseek-chat` | 64k | Paid | [n] | [pass/fail] | [comment] |
| LM Studio | `lmstudio/` | `lmstudio/<local-model-id>` | [n] | Local | [n] | [pass/fail] | [comment] |
| llama.cpp | `llamacpp/` | `llamacpp/<local-model-id>` | [n] | Local | [n] | [pass/fail] | [comment] |

---

## Role mapping candidates

| Claude Code role | Best pass result | Chosen model | Fallback |
|---|---|---|---|
| `opus` (hardest reasoning) | [model] | [model] | [model] |
| `sonnet` (balanced) | [model] | [model] | [model] |
| `haiku` (fastest) | [model] | [model] | [model] |
| `fallback` | [model] | [model] | [model] |

---

## Exclusions

| Model | Reason excluded |
|---|---|
| [model id] | [context too small / rate-limited / failed diag / hallucinates tool use] |

---

## Re-probe cadence

A matrix is valid for the session in which it was probed. Re-run `/fcc-diag` whenever:

- Routing is changed
- A provider key is rotated
- The local inference server restarts
- More than 24 hours have passed since the last probe
