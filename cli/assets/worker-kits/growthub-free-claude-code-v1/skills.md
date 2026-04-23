# Free Claude Code Operator — Skills

**Kit:** `growthub-free-claude-code-v1`
**Worker ID:** `free-claude-code-operator`

---

## SKILL: `/fcc-up`

Start the free-claude-code FastAPI proxy and print the Claude Code env exports.

### Invocation

```
/fcc-up [--port <port>] [--host <host>]
```

### Behavior

1. Resolve `WORKSPACE=$FREE_CLAUDE_CODE_HOME` with fallback `$HOME/free-claude-code`.
2. Run Phase 0 environment gate (see below).
3. Start `uv run uvicorn server:app --host "$HOST" --port "$PORT"` as a background process.
4. Poll `GET http://$HOST:$PORT/` until it responds (max 30s).
5. Print the Claude Code exports:

```
export ANTHROPIC_BASE_URL="http://<host>:<port>"
export ANTHROPIC_AUTH_TOKEN="freecc"
```

6. Write `output/<client>/<project>/proxy-runbook.md` from `templates/proxy-runbook.md`.

### Defaults

| Flag | Default |
|---|---|
| `--host` | `127.0.0.1` |
| `--port` | `$FREE_CLAUDE_CODE_PROXY_PORT` or `8082` |

---

## SKILL: `/fcc-down`

Stop the running proxy.

### Invocation

```
/fcc-down
```

### Behavior

1. `pkill -f "uvicorn server:app"` — graceful SIGTERM.
2. Confirm no listener remains on the configured port.
3. Append the stop event to the active `proxy-runbook.md`.

---

## SKILL: `/fcc-diag`

Diagnose every configured backend. Produces a readable pass/fail table.

### Invocation

```
/fcc-diag [--provider <prefix>]
```

### Behavior

1. Read `$FREE_CLAUDE_CODE_HOME/.env`.
2. For each backend with a key or base URL set:
   - NVIDIA NIM: `POST /v1/chat/completions` with a 4-token `hello` to the selected model.
   - OpenRouter: `GET /api/v1/models` with the key.
   - DeepSeek: `POST /chat/completions` with a minimal ping.
   - LM Studio: `GET /v1/models` on `LM_STUDIO_BASE_URL`.
   - llama.cpp: `GET /v1/models` on `LLAMACPP_BASE_URL`.
3. Report pass/fail + round-trip ms per provider.
4. Write the summary into `templates/model-matrix.md` (as `model-matrix.md` in the output folder).

---

## SKILL: `/fcc-model-matrix`

Print the full supported provider + model grid.

### Invocation

```
/fcc-model-matrix [--json]
```

### Output shape

```
| Provider      | Prefix         | Cost          | Rate limit     | Example model                       |
|---------------|----------------|---------------|----------------|-------------------------------------|
| NVIDIA NIM    | nvidia_nim/    | Free          | 40 req/min     | nvidia_nim/meta/llama3-70b-instruct |
| OpenRouter    | open_router/   | Free / Paid   | Varies         | open_router/qwen/qwen2.5-72b        |
| DeepSeek      | deepseek/      | Usage-based   | Varies         | deepseek/deepseek-chat              |
| LM Studio     | lmstudio/      | Free (local)  | Unlimited      | lmstudio/<local-model-id>           |
| llama.cpp     | llamacpp/      | Free (local)  | Unlimited      | llamacpp/<local-model-id>           |
```

The `--json` form writes a machine-readable matrix for programmatic routing.

---

## SKILL: `/fcc-route`

Configure Claude Code model routing. Sets `MODEL`, `MODEL_OPUS`, `MODEL_SONNET`, `MODEL_HAIKU` in `$FREE_CLAUDE_CODE_HOME/.env`.

### Invocation

```
/fcc-route --opus <provider/model> --sonnet <provider/model> --haiku <provider/model> [--fallback <provider/model>]
```

### Behavior

1. Validate every provider prefix against the matrix.
2. Validate every model id by calling `/fcc-diag --provider <prefix>` first.
3. Update the fork's `.env` with the new values.
4. Restart the proxy via `/fcc-down` then `/fcc-up`.
5. Write `templates/routing-config.md` into the output folder.

---

## SKILL: `/fcc-claude-handoff`

Produce the handoff document that the user runs in their Claude Code shell.

### Invocation

```
/fcc-claude-handoff [--target cli|vscode]
```

### Behavior

1. Read the active proxy config (host, port, auth-token).
2. Render `templates/claude-code-handoff.md` with the correct `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` for the target surface.
3. Include a copy-paste block for bash + PowerShell + fish.
4. Include verification steps (`claude --version`, a single `hello` prompt).

---

## WORKFLOW — Strict order, no skipping

| Phase | Name | Key output |
|---|---|---|
| 0 | Environment gate | Fork checked out, `uv.lock` installed, Python 3.14, port free |
| 1 | Provider discovery | Which keys / local backends the user actually has |
| 2 | Provider selection brief | Which provider(s) to prefer and why (cost, quality, rate limit) |
| 3 | Model routing matrix | `opus`, `sonnet`, `haiku` → concrete provider/model ids |
| 4 | Routing config write | `.env` updated, proxy restarted |
| 5 | Proxy up + diagnostics | `/fcc-up` + `/fcc-diag` — every backend green |
| 6 | Claude Code handoff | User gets bash/PowerShell exports and verification steps |
| 7 | Runbook | Canonical start / stop / diagnose / reconfigure sequence |
| 8 | Deliverable log | Brand kit updated with handoff line |

---

## PROVIDER-SELECTION DECISION TREE

Use this to produce the provider-selection brief (`templates/provider-selection.md`):

```
Does the user have a usable Anthropic key?
├── Yes → recommend using Anthropic directly; this kit is overkill.
└── No →
    Is budget zero?
    ├── Yes →
    │   Is local GPU available (>=16 GB VRAM)?
    │   ├── Yes → LM Studio or llama.cpp. Maps opus=70b, sonnet=34b, haiku=13b.
    │   └── No  → NVIDIA NIM (free, 40/min) + OpenRouter free tier as fallback.
    └── No →
        Any rate-limit sensitivity?
        ├── Yes → DeepSeek (usage-based, consistent) + OpenRouter paid fallback.
        └── No  → NVIDIA NIM primary + DeepSeek fallback.
```

---

## ENVIRONMENT GATE (PHASE 0)

Before any proxy skill runs, verify:

1. `WORKSPACE="${FREE_CLAUDE_CODE_HOME:-$HOME/free-claude-code}"` exists.
   - If missing → tell the user to run `bash setup/clone-fork.sh`.
2. `$WORKSPACE/server.py` exists.
   - If missing → fork is incomplete; re-clone.
3. `$WORKSPACE/.env` exists.
   - If missing → copy `.env.example` then stop and ask the user for provider keys.
4. At least one provider key or local base URL is set.
   - If all empty → stop and ask.
5. Python 3.14 available: `python3 --version` ≥ 3.14.
6. `uv --version` succeeds.
7. Port `$FREE_CLAUDE_CODE_PROXY_PORT` (or 8082) is free: `lsof -i :$PORT` empty.

Never call out to the internet without the user confirming which provider keys may be used. Never log keys.

---

## CLAUDE CODE ROUTING CONTRACT

The proxy exposes only:

- `POST /v1/messages` — Anthropic-compatible shape
- `POST /v1/messages?beta=...` — forwards beta headers
- `GET /health` — readiness probe
- `GET /` — identity ping

All other Anthropic endpoints are either translated or rejected with `400 unsupported`. If Claude Code emits a future endpoint this kit does not cover, the operator must log the deviation in `claude-code-handoff.md`.

---

## OUTPUT NAMING

```
output/<client-slug>/<project-slug>/provider-selection.md
output/<client-slug>/<project-slug>/model-matrix.md
output/<client-slug>/<project-slug>/routing-config.md
output/<client-slug>/<project-slug>/proxy-runbook.md
output/<client-slug>/<project-slug>/claude-code-handoff.md
```

---

## DO NOT

- Do not write any provider API key into a kit file, a template, or an example. Keys live only in `$FREE_CLAUDE_CODE_HOME/.env`.
- Do not bind the proxy to `0.0.0.0` without explicit user confirmation — default is `127.0.0.1`.
- Do not produce Claude Code exports that point at a host the user has not confirmed.
- Do not spec a routing config whose models have not been probed live via `/fcc-diag`.
- Do not edit the fork's `server.py` from inside this kit — upstream changes go through the fork.
