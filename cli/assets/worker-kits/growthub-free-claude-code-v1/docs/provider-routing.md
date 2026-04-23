# Provider Routing — Full Matrix

**Kit:** `growthub-free-claude-code-v1`

---

## Supported provider prefixes

| Provider | Prefix | Cost | Rate limit | Local? | Required env |
|---|---|---|---|---|---|
| NVIDIA NIM | `nvidia_nim/` | Free tier | 40 req/min | No | `NVIDIA_NIM_API_KEY` |
| OpenRouter | `open_router/` | Free + paid | Varies per model | No | `OPENROUTER_API_KEY` |
| DeepSeek | `deepseek/` | Usage-based | Varies | No | `DEEPSEEK_API_KEY` |
| LM Studio | `lmstudio/` | Free | Unlimited (GPU-bound) | Yes | `LM_STUDIO_BASE_URL` (default `http://localhost:1234/v1`) |
| llama.cpp | `llamacpp/` | Free | Unlimited (GPU-bound) | Yes | `LLAMACPP_BASE_URL` (default `http://localhost:8080/v1`) |

---

## Model id shape

Every value you write into `MODEL`, `MODEL_OPUS`, `MODEL_SONNET`, `MODEL_HAIKU` is a string of the shape:

```
<prefix>/<provider-specific-id>
```

The proxy takes **everything after the first `/`** and sends it to the provider verbatim.

Examples:

| Role-var value | Split as | Meaning |
|---|---|---|
| `nvidia_nim/meta/llama3-70b-instruct` | prefix=`nvidia_nim`, id=`meta/llama3-70b-instruct` | NVIDIA NIM — Meta Llama-3 70B Instruct |
| `open_router/qwen/qwen2.5-72b-instruct` | prefix=`open_router`, id=`qwen/qwen2.5-72b-instruct` | OpenRouter — Qwen 2.5 72B Instruct |
| `deepseek/deepseek-chat` | prefix=`deepseek`, id=`deepseek-chat` | DeepSeek — DeepSeek Chat |
| `lmstudio/qwen2.5-coder-32b-instruct` | prefix=`lmstudio`, id=`qwen2.5-coder-32b-instruct` | LM Studio — whatever is loaded under this id |
| `llamacpp/llama-3.2-8b-q4_k_m` | prefix=`llamacpp`, id=`llama-3.2-8b-q4_k_m` | llama.cpp — quantized 8B |

**Always copy the id from the provider's own UI / API**, not from memory. The proxy does not normalize.

---

## Role → provider mapping strategies

### Strategy A — All-local, zero-cost, offline-capable

```
MODEL_OPUS=lmstudio/qwen2.5-coder-32b-instruct
MODEL_SONNET=lmstudio/qwen2.5-coder-32b-instruct
MODEL_HAIKU=lmstudio/qwen2.5-14b-instruct
MODEL=lmstudio/qwen2.5-14b-instruct
```

Best for: privacy, PII, offline work. Bottleneck: GPU warmup.

### Strategy B — Free cloud, zero-budget, online-only

```
MODEL_OPUS=nvidia_nim/meta/llama3-70b-instruct
MODEL_SONNET=nvidia_nim/meta/llama3-70b-instruct
MODEL_HAIKU=nvidia_nim/meta/llama3-8b-instruct
MODEL=open_router/meta-llama/llama-3.3-70b-instruct:free
```

Best for: no local GPU, no budget, tolerant of 40 req/min cap.

### Strategy C — Paid consistent low-cost

```
MODEL_OPUS=deepseek/deepseek-chat
MODEL_SONNET=deepseek/deepseek-chat
MODEL_HAIKU=deepseek/deepseek-chat
MODEL=deepseek/deepseek-chat
```

Best for: predictable usage-based cost, no rate-limit drama.

### Strategy D — Local primary + cloud fallback

```
MODEL_OPUS=lmstudio/qwen2.5-coder-32b-instruct
MODEL_SONNET=lmstudio/qwen2.5-coder-32b-instruct
MODEL_HAIKU=lmstudio/qwen2.5-14b-instruct
MODEL=nvidia_nim/meta/llama3-70b-instruct
```

Best for: mostly-local privacy with cloud fallback when LM Studio is offline.

---

## Diagnostics

Always probe before routing:

```
/fcc-diag                         # probe every configured provider
/fcc-diag --provider nvidia_nim   # probe just NVIDIA NIM
```

Expected output: pass/fail and round-trip ms per model. Red rows must be excluded from `routing-config.md`.

---

## When to reconfigure

- Rate limits are being hit → add a fallback model from a different provider.
- Latency exceeds p95 target → switch `haiku` to a smaller model.
- A provider key rotates → update `.env` and re-probe.
- A local model is unloaded → fall back to cloud until reloaded.
- Claude Code upgrades to a new model family (e.g. `claude-5-opus-*`) → no change needed as long as the role slice (`opus|sonnet|haiku`) matches.

---

## Ethical / policy guardrails

- Do not route paid-customer data through free tiers that log prompts.
- Respect each provider's ToS (especially rate limits on free tiers).
- Keep `ANTHROPIC_AUTH_TOKEN` local — it is not a password to anything real, but it is the gate between a casual port scan and your provider credentials.
