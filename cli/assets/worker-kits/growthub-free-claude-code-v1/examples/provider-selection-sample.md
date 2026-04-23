# Provider Selection Brief — SAMPLE (Growthub Dev Laptop)

**Project:** Growthub operator laptop — free local Claude Code
**Client:** Growthub
**Date:** 2026-04-23
**Operator:** `free-claude-code-operator`

---

## Objective

Give the Growthub operator laptop a zero-cost Claude Code that works offline for non-sensitive tasks and falls back to NVIDIA NIM free tier when the local model is not loaded.

---

## Live backends (from `.env` probe)

| Provider | Prefix | Key / URL set? | `/fcc-diag` result |
|---|---|---|---|
| NVIDIA NIM | `nvidia_nim/` | yes | pass |
| OpenRouter | `open_router/` | no | skipped |
| DeepSeek | `deepseek/` | no | skipped |
| LM Studio | `lmstudio/` | yes (http://localhost:1234/v1) | pass |
| llama.cpp | `llamacpp/` | no | skipped |

---

## Workload profile

- **Expected prompts / day:** ~400 (active development)
- **Peak concurrency:** 2 (one CLI, one VS Code)
- **Largest prompt (tokens):** ~16k
- **PII / sensitive input?** no
- **Acceptable latency (p95):** 10s
- **Budget ceiling / month:** $0

---

## Recommended primary

- **Provider:** `lmstudio/`
- **Default model:** `lmstudio/qwen2.5-coder-32b-instruct`
- **Why:** fully local; unmetered; no prompt logging; 32B coder tuned for tool use works well with Claude Code's function-call style.
- **Expected cost:** free
- **Expected rate limit:** unlimited (GPU-bound)

## Recommended fallback

- **Provider:** `nvidia_nim/`
- **Default model:** `nvidia_nim/meta/llama3-70b-instruct`
- **Why:** NVIDIA NIM free tier handles cold-start gracefully; 70B gives headroom when the local model is offline.

---

## Rejected alternatives

| Provider | Reason |
|---|---|
| `open_router/` | No key on this laptop; skipping to keep the setup simple. |
| `deepseek/` | Paid-only; violates $0 budget. |
| `llamacpp/` | Not installed on this laptop; LM Studio chosen instead. |

---

## Risks

- If the LM Studio server is not running, every request fails over to NVIDIA NIM — which is rate-limited to 40 req/min. A burst of edits can trip the limit.
- Local 32B model loading time is ~45s on cold start; first prompt will be slow.

---

## Deliverables from this brief

- `model-matrix.md` — carries the probed grid.
- `routing-config.md` — carries the final `.env` values.
