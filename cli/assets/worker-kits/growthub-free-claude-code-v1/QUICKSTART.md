# Free Claude Code Proxy — Quickstart

**Kit:** `growthub-free-claude-code-v1`
**Fork:** [Alishahryar1/free-claude-code](https://github.com/Alishahryar1/free-claude-code)
**License:** MIT
**What it does:** Drop-in Anthropic API replacement. Claude Code (CLI or VS Code) still thinks it is talking to `api.anthropic.com`; you point it at `http://localhost:8082` and the FastAPI proxy routes requests to free or local backends (NVIDIA NIM, OpenRouter, DeepSeek, LM Studio, llama.cpp). No Anthropic key needed. No patch to Claude Code itself.

---

## Prerequisites

- Python 3.14 — [python.org](https://www.python.org/downloads/)
- `uv` package manager — `pip install uv`
- Git
- At least one upstream backend reachable:
  - A free NVIDIA NIM / OpenRouter key, **or**
  - A local LM Studio / llama.cpp server running

---

## Step 1 — Clone and install the fork

```bash
bash setup/clone-fork.sh
```

This clones the upstream fork to `$FREE_CLAUDE_CODE_HOME` (default `$HOME/free-claude-code`), copies `.env.example` to `.env`, and runs `uv sync`.

---

## Step 2 — Configure at least one provider

Edit `$FREE_CLAUDE_CODE_HOME/.env` and fill in **one** of the following (you can mix and match later):

```bash
# NVIDIA NIM (free tier, 40 req/min)
NVIDIA_NIM_API_KEY=nvapi-...

# OpenRouter (free and paid models)
OPENROUTER_API_KEY=sk-or-...

# DeepSeek (usage-based)
DEEPSEEK_API_KEY=sk-...

# LM Studio (local, unlimited)
LM_STUDIO_BASE_URL=http://localhost:1234/v1

# llama.cpp (local, unlimited)
LLAMACPP_BASE_URL=http://localhost:8080/v1
```

Pick model identifiers with the provider prefix: `nvidia_nim/...`, `open_router/...`, `deepseek/...`, `lmstudio/...`, `llamacpp/...`.

See `docs/provider-routing.md` for the full matrix.

---

## Step 3 — Verify the environment

```bash
node setup/verify-env.mjs
```

Passes when: fork checked out, `uv.lock` installed, `server.py` present, Python 3.14 available, port `$FREE_CLAUDE_CODE_PROXY_PORT` free.

---

## Step 4 — Start the proxy

```bash
cd "$FREE_CLAUDE_CODE_HOME"
uv run uvicorn server:app --host 0.0.0.0 --port "${FREE_CLAUDE_CODE_PROXY_PORT:-8082}"
```

The operator's `/fcc-up` skill wraps this with log tailing and health-check polling.

---

## Step 5 — Point Claude Code at the proxy

In the shell that will run `claude`:

```bash
export ANTHROPIC_BASE_URL="http://localhost:${FREE_CLAUDE_CODE_PROXY_PORT:-8082}"
export ANTHROPIC_AUTH_TOKEN="freecc"
claude
```

PowerShell:

```powershell
$env:ANTHROPIC_BASE_URL="http://localhost:8082"
$env:ANTHROPIC_AUTH_TOKEN="freecc"
claude
```

Claude Code now sends every request through the local proxy.

---

## Step 6 — Run the operator

In an AI agent pointed at this kit:

```
/fcc-up                  # start the proxy + print the env exports
/fcc-model-matrix        # print provider + model support grid
/fcc-diag                # probe every configured backend
/fcc-down                # stop the proxy
```

---

## What happens next

The operator will:

1. Gate the environment (fork present, `uv.lock`, Python 3.14)
2. Read your `.env` and decide which providers are live
3. Produce a provider-selection brief (`templates/provider-selection.md`)
4. Produce a model routing matrix (`templates/model-matrix.md`)
5. Produce a proxy runbook with exact start/stop/diagnose commands
6. Produce a Claude Code handoff with the correct `ANTHROPIC_*` exports
7. Log the deliverable in the active brand kit

---

## Output location

All artifacts land in:

```
output/<client-slug>/<project-slug>/
  provider-selection.md
  model-matrix.md
  routing-config.md
  proxy-runbook.md
  claude-code-handoff.md
```

---

## Stopping and restarting

```bash
# Stop
pkill -f "uvicorn server:app" || true

# Restart
cd "$FREE_CLAUDE_CODE_HOME" && uv run uvicorn server:app --host 0.0.0.0 --port 8082
```

The operator's `/fcc-up` / `/fcc-down` skills automate this.

---

## Docs

- `skills.md` — Full operator skill reference
- `docs/free-claude-code-fork-integration.md` — Upstream fork layout + proxy entrypoint contract
- `docs/proxy-architecture.md` — FastAPI translation layer, message shape, streaming
- `docs/provider-routing.md` — Provider prefix matrix, rate limits, model IDs
- `docs/security-and-isolation.md` — Local-only defaults, auth-token usage, network posture
- `validation-checklist.md` — Pre-handoff validation checklist
