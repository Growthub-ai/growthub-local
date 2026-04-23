# Provider Selection Brief

**Project:** [PROJECT NAME]
**Client:** [CLIENT NAME]
**Date:** YYYY-MM-DD
**Operator:** `free-claude-code-operator`

---

## Objective

Pick a primary and a fallback backend for the free-claude-code proxy that balances cost, quality, rate limits, and privacy for the target workload.

---

## Live backends (from `.env` probe)

| Provider | Prefix | Key / URL set? | `/fcc-diag` result |
|---|---|---|---|
| NVIDIA NIM | `nvidia_nim/` | [yes/no] | [pass/fail/skipped] |
| OpenRouter | `open_router/` | [yes/no] | [pass/fail/skipped] |
| DeepSeek | `deepseek/` | [yes/no] | [pass/fail/skipped] |
| LM Studio | `lmstudio/` | [yes/no] | [pass/fail/skipped] |
| llama.cpp | `llamacpp/` | [yes/no] | [pass/fail/skipped] |

---

## Workload profile

- **Expected prompts / day:** [e.g. 100 — 1000 — 10000]
- **Peak concurrency:** [e.g. 1 — 4 — 10]
- **Largest prompt (tokens):** [e.g. 8k — 32k — 128k]
- **PII / sensitive input?** [yes / no / unknown]
- **Acceptable latency (p95):** [e.g. 2s — 10s]
- **Budget ceiling / month:** [e.g. $0 — $50]

---

## Recommended primary

- **Provider:** [provider prefix]
- **Default model:** [prefix/model-id]
- **Why:** [cost / rate limit / quality / local-only]
- **Expected cost:** [free | $X per 1M tokens]
- **Expected rate limit:** [40 req/min | unlimited | varies]

## Recommended fallback

- **Provider:** [provider prefix]
- **Default model:** [prefix/model-id]
- **Why:** [cost / quality / availability]

---

## Rejected alternatives

| Provider | Reason |
|---|---|
| [provider] | [too slow / rate-limited / no usable model] |

---

## Risks

- [Rate-limit risk if daily volume exceeds X]
- [Free-tier prompt logging risk if PII is routed]
- [Local backend GPU warm-up time]

---

## Deliverables from this brief

- `model-matrix.md` will carry the full probed grid.
- `routing-config.md` will carry the final `.env` values.
