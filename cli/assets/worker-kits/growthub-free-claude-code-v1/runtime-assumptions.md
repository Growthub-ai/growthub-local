# Runtime Assumptions — Free Claude Code Proxy

**Kit:** `growthub-free-claude-code-v1`

---

## Fork assumptions

This kit assumes the `free-claude-code` fork is checked out and installed:

| Assumption | Default | Override |
|---|---|---|
| Fork directory | `$HOME/free-claude-code` | `FREE_CLAUDE_CODE_HOME` env var |
| Fork repo URL | `https://github.com/Alishahryar1/free-claude-code.git` | n/a |
| Python version | 3.14 (strict) | n/a — minimum requirement |
| Package manager | `uv` | n/a — upstream uses `uv.lock` |
| Proxy entrypoint | `server.py` (FastAPI `app`) | n/a |
| Proxy host | `127.0.0.1` | `--host` flag |
| Proxy port | `8082` | `FREE_CLAUDE_CODE_PROXY_PORT` env var / `--port` flag |

---

## Tech stack (locked by fork)

| Layer | Version / Detail |
|---|---|
| Python | 3.14 |
| Server | FastAPI + Uvicorn |
| Package manager | `uv` (required; `uv.lock` is source of truth) |
| Transport | HTTP/1.1 + chunked streaming (SSE) |
| API shape | Anthropic Messages API v1 (Anthropic-compatible surface) |

---

## Agent assumptions

- The operator runs Claude Code (or any Anthropic-SDK client) in a shell where `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` are set.
- Claude Code itself is unmodified — this kit never patches `@anthropic-ai/claude-code`.
- The proxy is trusted within the local machine boundary; key material is the user's responsibility.
- The agent operating this kit does not call external providers directly — only the proxy does.

---

## Supported backend providers

Every backend is addressed via a **prefix** in the model id:

| Provider | Prefix | Cost model | Rate limit | Local? | Required env |
|---|---|---|---|---|---|
| NVIDIA NIM | `nvidia_nim/` | Free tier | 40 req/min | No | `NVIDIA_NIM_API_KEY` |
| OpenRouter | `open_router/` | Free + paid | Varies by model | No | `OPENROUTER_API_KEY` |
| DeepSeek | `deepseek/` | Usage-based | Varies | No | `DEEPSEEK_API_KEY` |
| LM Studio | `lmstudio/` | Free | Unlimited | Yes | `LM_STUDIO_BASE_URL` (default `http://localhost:1234/v1`) |
| llama.cpp | `llamacpp/` | Free | Unlimited | Yes | `LLAMACPP_BASE_URL` (default `http://localhost:8080/v1`) |

At least one provider must be configured before the proxy will serve requests.

---

## Claude Code integration contract

The proxy is a drop-in Anthropic endpoint. Claude Code sees:

```
ANTHROPIC_BASE_URL=http://127.0.0.1:8082
ANTHROPIC_AUTH_TOKEN=freecc
```

Claude Code continues to think it is talking to `api.anthropic.com`. Anthropic's own CLI / VS Code extension is never patched.

Model routing inside the proxy:

- `MODEL_OPUS` — chosen when Claude Code asks for `claude-3-opus-*` / `claude-4-opus-*`
- `MODEL_SONNET` — chosen for `claude-3-sonnet-*` / `claude-4-sonnet-*`
- `MODEL_HAIKU` — chosen for `claude-3-haiku-*` / `claude-4-haiku-*`
- `MODEL` — generic fallback

All four variables take a single prefixed id, e.g. `nvidia_nim/meta/llama3-70b-instruct`.

---

## Network posture

- Default bind: `127.0.0.1:8082` — **local loopback only**.
- The proxy may reach out to any configured provider. Local-only backends (LM Studio, llama.cpp) never leave the machine.
- Egress is observable via the proxy's own logs; there is no internal telemetry.
- `ANTHROPIC_AUTH_TOKEN` is a shared secret between Claude Code and the proxy. It is not validated against Anthropic.

---

## Concurrency

- The proxy is single-process Uvicorn by default; Claude Code's typical concurrency (≤ 4 in-flight) is well within limits.
- Heavier throughput (scripted agents, batch runs) warrants `--workers 4` — document this as a deviation in the runbook.

---

## Ethical and licensing constraints

- Upstream fork is **MIT** licensed.
- Free tier usage (NVIDIA NIM, OpenRouter free models) is subject to upstream provider ToS — respect rate limits.
- Local backends (LM Studio, llama.cpp) are unmetered but bound by the model weights' own license.
- This kit is intended for **personal use and experimentation**. Production Claude Code usage should use Anthropic's paid API.
- Never pass customer PII through a free tier that logs requests. When in doubt, route to a local backend.

These constraints are enforced by operator instruction, not technical controls. The operator must confirm provider choice with the user before writing routing config.
