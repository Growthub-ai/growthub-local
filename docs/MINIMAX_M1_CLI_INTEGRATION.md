# MiniMax-M1 CLI Integration

Architecture and integration guide for the MiniMax-M1 local intelligence primitive in Growthub Local.

## What is MiniMax-M1

[MiniMax-M1](https://huggingface.co/MiniMaxAI) is a 456B-total / 45.9B-active MoE reasoning model published by MiniMax. It ships in two thinking-budget variants (`40k`, `80k`), supports a native 1M-token context, and delivers strong agentic tool-use and SWE performance.

Unlike Qwen Code, T3 Code, or Open Agents, MiniMax-M1 is **not** distributed as a coding CLI — it is a model. The Growthub integration therefore treats it as a first-class *local intelligence primitive* rather than an agent harness binary.

Key capabilities:

- 1M-token context window
- MoE architecture (456B total, 45.9B active) with hybrid lightning attention
- Native function-calling / tool-use
- Reference serving stack: vLLM (OpenAI-compatible `/v1`)
- Thinking-budget gating via `40k` vs `80k` variants

## Integration strategy

The Growthub integration is **fully self-contained** with zero npm dependency on MiniMax SDKs. Communication is through HTTP fetch against an OpenAI-compatible server (vLLM recommended) that the user controls.

```
Growthub CLI
  ├── Discovery Hub → "MiniMax-M1" menu option (Agent Harness sub-menu)
  │     ├── Setup & Health    (endpoint probe, vLLM binary check, setup guidance)
  │     ├── Serve Command     (copy-pasteable `vllm serve` invocation)
  │     ├── Prompt            (headless POST /v1/chat/completions)
  │     ├── Chat              (governed chat loop in-process)
  │     └── Configure         (base URL, model id, variant, API key)
  │
  ├── CLI Commands
  │     ├── growthub minimax-m1 health
  │     ├── growthub minimax-m1 serve [--variant 40k|80k] [--tensor-parallel N] [--port N]
  │     ├── growthub minimax-m1 prompt "..." [--model ...] [--base-url ...] [--timeout-ms N] [--max-tokens N]
  │     └── growthub minimax-m1 chat [--model ...] [--base-url ...]
  │
  └── CLI Adapter (heartbeat stream formatting)
        └── cli/src/adapters/minimax-m1 — type: minimax_m1_local
```

### Why not auto-spawn vLLM?

Multi-GPU model serving is a high-blast-radius operation that belongs on a dedicated serving host — not inside a contributor-machine hub loop. The adapter deliberately emits a copy-pasteable `vllm serve` command (`growthub minimax-m1 serve`) instead of spawning the process. Once the user brings up a server anywhere reachable, `growthub minimax-m1 health` confirms the contract.

## File layout

### CLI runtime module

```
cli/src/runtime/minimax-m1/
  ├── contract.ts    — MiniMaxM1Config, environment status, execution result types
  ├── provider.ts    — fetch-based /v1/chat/completions + /v1/models probe, serve-command builder
  ├── health.ts      — Environment detection, health assessment, setup guidance
  └── index.ts       — Barrel exports, config persistence (read/write)
```

### CLI command surface

```
cli/src/commands/minimax-m1.ts
  ├── runMiniMaxM1Hub()            — Interactive sub-hub (discovery menu)
  ├── runConfigureFlow()           — Base URL / variant / model / API key configuration
  ├── runChatLoop()                — In-process governed chat loop
  └── registerMiniMaxM1Commands()  — Commander registration
```

### CLI adapter (heartbeat stream formatting)

```
cli/src/adapters/minimax-m1/
  ├── format-event.ts   — stdout line formatter (supports OpenAI-style choices + plain text)
  └── index.ts          — CLIAdapterModule registration (type: minimax_m1_local)
```

### Shared type registration

```
packages/shared/src/constants.ts
  └── AGENT_ADAPTER_TYPES — includes "minimax_m1_local"
```

## Configuration

Config is persisted at `$PAPERCLIP_HOME/minimax-m1/config.json`:

```json
{
  "baseUrl": "http://127.0.0.1:8000",
  "model": "MiniMaxAI/MiniMax-M1-80k",
  "variant": "80k",
  "cwd": "/path/to/project",
  "maxOutputTokens": 0,
  "temperature": 1.0,
  "topP": 0.95,
  "timeoutMs": 180000,
  "tensorParallel": 8,
  "maxModelLen": 1048576,
  "env": {}
}
```

### Variants

| Variant | Default model id              | Notes                                   |
|---------|-------------------------------|-----------------------------------------|
| `40k`   | `MiniMaxAI/MiniMax-M1-40k`    | Smaller thinking budget, faster         |
| `80k`   | `MiniMaxAI/MiniMax-M1-80k`    | Larger thinking budget, deeper reasoning |

### Environment variables

MiniMax-M1 is typically served locally without auth. For hosted endpoints, set one of:

- `MINIMAX_API_KEY` — MiniMax hosted endpoints
- `OPENAI_API_KEY` — generic OpenAI-compatible gateways

Both are stored via the shared harness auth store (same primitive used by `qwen-code`) and masked on display.

## Reference serving command

`growthub minimax-m1 serve` emits a copy-pasteable vLLM invocation. Example output for the 80k variant:

```bash
vllm serve MiniMaxAI/MiniMax-M1-80k \
  --tensor-parallel-size 8 \
  --port 8000 \
  --max-model-len 1048576 \
  --enable-auto-tool-choice \
  --tool-call-parser hermes
```

Hardware notes:

- Unquantised MiniMax-M1-80k: 8x H800 / H20-class GPUs recommended.
- Quantised variants (AWQ / GPTQ / FP8) fit on smaller clusters — pass the appropriate `--quantization` flag to `vllm serve` and update the `model` field in config to point at the quantised repo.
- Reduce `--max-model-len` if you can't afford the full 1M KV cache.

## Prerequisites

- An OpenAI-compatible server (vLLM reference) serving a MiniMax-M1 variant
- Node.js >= 20.0.0 (same as other Growthub harnesses)
- `MINIMAX_API_KEY` or `OPENAI_API_KEY` only if the endpoint requires auth

## Validation

```bash
# Health check (probes /v1/models)
growthub minimax-m1 health

# Print serve command to stand up a local endpoint
growthub minimax-m1 serve

# Direct headless test
growthub minimax-m1 prompt "Summarise the key risks in this repo's architecture."

# Chat loop
growthub minimax-m1 chat
```

## Guardrails

- The adapter never spawns multi-GPU serving processes — operators opt in to serving explicitly.
- API keys are stored via the harness auth store (not plain-text in `config.json`) and masked in the configure UI.
- Endpoint probes time out after 4s; generation calls honour `timeoutMs` (default 180s) with `AbortController`.
- The shared adapter type `minimax_m1_local` is wired through the CLI adapter registry so heartbeat streams format MiniMax-M1 output consistently with other local primitives.
