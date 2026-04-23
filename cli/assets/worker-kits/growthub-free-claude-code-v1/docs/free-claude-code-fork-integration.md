# Upstream Fork Integration — free-claude-code

**Kit:** `growthub-free-claude-code-v1`
**Upstream:** [Alishahryar1/free-claude-code](https://github.com/Alishahryar1/free-claude-code)
**License:** MIT

---

## Upstream layout (pinned at kit v1.0.0)

```
free-claude-code/
├── api/                     # request translation helpers
├── cli/                     # standalone CLI entry for the proxy
├── config/                  # configuration loading + validation
├── messaging/               # optional Discord/Slack relay (off by default)
├── providers/               # per-provider adapters (nvidia_nim, open_router, deepseek, lmstudio, llamacpp)
├── tests/
├── .env.example
├── .python-version          # 3.14
├── CLAUDE.md                # upstream agent guide
├── claude-pick              # model picker helper
├── nvidia_nim_models.json   # NVIDIA NIM model catalog
├── pyproject.toml
├── server.py                # FastAPI `app` — entrypoint for uvicorn
└── uv.lock
```

---

## What this kit owns vs. upstream

This kit **does not** modify upstream source. It only:

- Clones the fork to `$FREE_CLAUDE_CODE_HOME`.
- Copies `.env.example` to `.env` when missing.
- Runs `uv sync`.
- Writes into `$FREE_CLAUDE_CODE_HOME/.env` (routing variables only).
- Starts / stops `uvicorn server:app`.
- Probes providers via the upstream adapter layer.

If upstream changes (new providers, new request shape), the kit version bumps and the frozen contract updates. Never hot-patch `server.py` from inside this kit.

---

## Entrypoint contract

`uvicorn server:app --host <host> --port <port>`

Where `server.py` exposes:

- `app` — FastAPI instance
- `app.state.config` — loaded at startup from `.env`
- Exposed routes (subset observable from upstream):
  - `GET /` — identity ping
  - `GET /health` — readiness probe
  - `POST /v1/messages` — Anthropic Messages API shape (translated to provider format internally)

The kit's `/fcc-up` skill does not assume any additional routes. If the proxy adds an endpoint, the runbook notes it; we never hardcode it into kit logic.

---

## Environment contract

Upstream variables the kit reads / writes in `$FREE_CLAUDE_CODE_HOME/.env`:

**Routing (kit writes):**

- `MODEL` — default when a role-specific var is unset
- `MODEL_OPUS` — used for `claude-3-opus-*` / `claude-4-opus-*`
- `MODEL_SONNET` — used for `claude-3-sonnet-*` / `claude-4-sonnet-*`
- `MODEL_HAIKU` — used for `claude-3-haiku-*` / `claude-4-haiku-*`

**Providers (kit reads only):**

- `NVIDIA_NIM_API_KEY`
- `OPENROUTER_API_KEY`
- `DEEPSEEK_API_KEY`
- `LM_STUDIO_BASE_URL` (default `http://localhost:1234/v1`)
- `LLAMACPP_BASE_URL` (default `http://localhost:8080/v1`)

**Proxy-facing auth (kit reads only):**

- `ANTHROPIC_AUTH_TOKEN` — shared secret the proxy enforces (default `freecc`)

**Optional behavior (kit documents but does not change):**

- `ENABLE_THINKING` — toggle thinking blocks globally (default `true`)

---

## Supported surfaces

- `@anthropic-ai/claude-code` CLI — primary target
- Claude Code VS Code extension
- Any client that reads `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN` from env

The kit never patches the clients; it only redirects them.

---

## Upgrading the fork

1. `cd "$FREE_CLAUDE_CODE_HOME" && git fetch origin && git log HEAD..origin/main`
2. Read upstream changelog entries.
3. `git merge origin/main` (or `git rebase`).
4. `uv sync`.
5. `/fcc-diag` against every previously routed model.
6. If any diag now fails, go back to `/fcc-model-matrix` and re-route.

Upstream breaking changes (new route shape, dropped provider, renamed env var) are a **kit version bump**, not a silent upgrade.
