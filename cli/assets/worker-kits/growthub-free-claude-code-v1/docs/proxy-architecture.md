# Proxy Architecture

**Kit:** `growthub-free-claude-code-v1`
**Upstream:** FastAPI + Uvicorn, Python 3.14

---

## Request lifecycle

```
Claude Code
   │  POST /v1/messages          (Anthropic Messages API shape)
   │  Headers: x-api-key=freecc  (or Authorization: Bearer freecc)
   ▼
Uvicorn @ 127.0.0.1:8082
   │  1. Auth gate — compare against ANTHROPIC_AUTH_TOKEN
   │  2. Request parse — Anthropic Messages v1 → internal message set
   │  3. Model resolution — map claude-*-opus|sonnet|haiku → MODEL_{OPUS,SONNET,HAIKU}
   │  4. Prefix dispatch — first segment of MODEL_* picks the provider adapter
   ▼
Provider adapter (providers/nvidia_nim | open_router | deepseek | lmstudio | llamacpp)
   │  5. Shape translation — Anthropic Messages → provider shape (OpenAI chat.completions for most)
   │  6. HTTP call — provider API or local base URL
   │  7. Streaming passthrough or buffered response
   ▼
Response translation
   │  8. Provider response → Anthropic Messages v1 shape
   │  9. `content` block array, `stop_reason`, `usage` tallies synthesized
   ▼
Claude Code receives a response identical in shape to what api.anthropic.com would send
```

---

## Streaming

- Anthropic Messages API uses SSE-style `message_start`, `content_block_delta`, `message_delta`, `message_stop`.
- Most provider backends use OpenAI-style `choices[0].delta`.
- The proxy converts on the fly; Claude Code sees the canonical Anthropic event stream.
- If a provider does not stream, the proxy buffers and emits a single `message_delta` followed by `message_stop`.

---

## Authentication

- The proxy enforces **one** shared token: `ANTHROPIC_AUTH_TOKEN` (default `freecc`).
- This is a **local secret**, not an Anthropic key. The proxy never forwards it upstream.
- The proxy attaches the **provider's** key (from `$FREE_CLAUDE_CODE_HOME/.env`) on the outbound hop.

Mental model: Claude Code authenticates to the proxy. The proxy authenticates to the provider. The two credentials are entirely separate.

---

## Role mapping

Claude Code sends `model="claude-opus-4-7"` / `claude-sonnet-4-6` / `claude-haiku-4-5-*`. The proxy:

1. Extracts the `opus | sonnet | haiku` slice.
2. Looks up `MODEL_OPUS` / `MODEL_SONNET` / `MODEL_HAIKU`.
3. Falls back to `MODEL` if the role-specific var is unset.
4. Splits at the first `/` — left side picks the provider, right side is the concrete model id.

```
MODEL_SONNET=nvidia_nim/meta/llama3-70b-instruct
              ^^^^^^^^^ ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
              provider  concrete provider-model-id
```

---

## Error handling

| Origin | Example | What Claude Code sees |
|---|---|---|
| Missing provider key | `NVIDIA_NIM_API_KEY` unset but `MODEL_SONNET=nvidia_nim/...` | 500 with a readable body — **do not** hand off without fixing |
| Provider 401 | Key rotated upstream | 401 translated; `/fcc-diag` will surface this |
| Provider 429 | Free tier exhausted | 429 translated; operator should add a fallback route |
| Provider 5xx | Outage | 503 with retry hint |
| Local backend not running | LM Studio closed | 502 with a clear hint in the runbook |

The kit's runbook (`templates/proxy-runbook.md`) carries the symptom → fix table the operator must fill in for each project.

---

## Concurrency

- Single-process Uvicorn handles ~4 parallel streams comfortably.
- Larger Claude Code workflows (e.g. Task tool spawns) should set `--workers 4`.
- Local backends are the concurrency bottleneck — one LM Studio server serves one model at a time.

---

## Observability

- Uvicorn stdout shows every request.
- Provider-level latency is surfaced in `/fcc-diag`.
- No analytics, no telemetry leaves the proxy.
- To inspect the wire traffic, set `UVICORN_LOG_LEVEL=debug` before starting the proxy.

---

## Non-goals

- The proxy does **not** attempt to emulate Anthropic's paid features that providers cannot deliver (e.g. Anthropic-specific tool-use shape beyond OpenAI-compatible function calls).
- The proxy does **not** bill, meter, or cache. Each request is passed through.
- The proxy is **not** a production replacement for Anthropic's API. Personal and experimentation use only.
