# Proxy Runbook

**Project:** [PROJECT NAME]
**Date:** YYYY-MM-DD
**Fork location:** `$FREE_CLAUDE_CODE_HOME`
**Proxy URL:** `http://127.0.0.1:<port>`

---

## Start

### Via operator skill
```
/fcc-up
```

### Fallback (direct uvicorn)
```bash
cd "$FREE_CLAUDE_CODE_HOME"
uv run uvicorn server:app --host 127.0.0.1 --port "${FREE_CLAUDE_CODE_PROXY_PORT:-8082}"
```

Health check:
```bash
curl -s "http://127.0.0.1:${FREE_CLAUDE_CODE_PROXY_PORT:-8082}/health"
```

Expected: HTTP 200 and a small JSON body.

---

## Stop

### Via operator skill
```
/fcc-down
```

### Fallback
```bash
pkill -f "uvicorn server:app" || true
```

Confirm no listener:
```bash
lsof -i :"${FREE_CLAUDE_CODE_PROXY_PORT:-8082}" || echo "port free"
```

---

## Restart

```
/fcc-down && /fcc-up
```

---

## Diagnose

### Full sweep
```
/fcc-diag
```

### Single provider
```
/fcc-diag --provider nvidia_nim
/fcc-diag --provider open_router
/fcc-diag --provider deepseek
/fcc-diag --provider lmstudio
/fcc-diag --provider llamacpp
```

---

## Reconfigure routing

```
/fcc-route --opus <provider/model> --sonnet <provider/model> --haiku <provider/model>
```

Routing writes land in `$FREE_CLAUDE_CODE_HOME/.env`. The operator auto-restarts the proxy.

---

## Logs

- **uvicorn stdout** — the terminal that ran `/fcc-up` or `uvicorn server:app`
- **Fork-local log dir** — `$FREE_CLAUDE_CODE_HOME/.logs/` (if present)
- **Claude Code client-side** — `~/.claude/logs/` (Anthropic client-side, unrelated to this proxy)

Grep proxy traffic:
```bash
grep -E "POST /v1/messages|ERROR|WARN" "$FREE_CLAUDE_CODE_HOME/.logs/"*.log
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Claude Code prints `invalid api key` | `ANTHROPIC_AUTH_TOKEN` not set in shell | `export ANTHROPIC_AUTH_TOKEN=freecc` |
| Claude Code prints `ECONNREFUSED` | Proxy not running | `/fcc-up` |
| Proxy prints `429 rate_limit` | Free-tier quota exceeded | Switch to fallback or wait for reset |
| Proxy prints `401 unauthorized` (to upstream) | Provider key invalid | Rotate key in `$FREE_CLAUDE_CODE_HOME/.env` |
| Port already in use | Another uvicorn / service running | `pkill -f uvicorn` or pick a new port |
| Local backend times out | LM Studio / llama.cpp not warm | Start the local server first |
| Slow responses (> 30s) | Wrong role mapping | Re-run `/fcc-route` with a smaller model for `haiku` |

---

## Deviations (known issues for this project)

| Provider | Model | Reason | Resolution |
|---|---|---|---|
| [provider] | [model] | [reason] | [resolution] |

---

## Stop + tear down completely

```bash
/fcc-down
unset ANTHROPIC_BASE_URL
unset ANTHROPIC_AUTH_TOKEN
```
