# Validation Checklist — Free Claude Code Proxy

**Kit:** `growthub-free-claude-code-v1`

Run through this checklist before producing the Claude Code handoff.

---

## Environment validation

- [ ] Fork exists at `$HOME/free-claude-code` (or `FREE_CLAUDE_CODE_HOME`)
- [ ] `server.py` present in fork root
- [ ] `uv.lock` present and `uv sync` has been run
- [ ] Python 3.14+ available (`python3 --version`)
- [ ] `uv --version` succeeds
- [ ] `$FREE_CLAUDE_CODE_HOME/.env` exists (copied from `.env.example`)
- [ ] Port `$FREE_CLAUDE_CODE_PROXY_PORT` (or 8082) is free

---

## Provider validation

- [ ] At least one provider key or local base URL is set in `.env`
- [ ] For each set provider, `/fcc-diag` returns green
- [ ] Rate-limit expectations recorded in `model-matrix.md`
- [ ] Cost expectations recorded in `provider-selection.md`
- [ ] No key or token is copied into kit files, templates, or outputs

---

## Routing validation

- [ ] `MODEL_OPUS` set and probed live
- [ ] `MODEL_SONNET` set and probed live
- [ ] `MODEL_HAIKU` set and probed live
- [ ] `MODEL` fallback set
- [ ] Every routed model has a valid provider prefix
- [ ] Every routed model id was verified by `/fcc-diag`

---

## Proxy validation

- [ ] `uvicorn server:app` starts without traceback
- [ ] `GET http://127.0.0.1:$PORT/` returns 200
- [ ] `GET http://127.0.0.1:$PORT/health` returns 200
- [ ] `POST /v1/messages` with a trivial payload returns a non-error response
- [ ] `lsof -i :$PORT` shows exactly one listener
- [ ] Logs reach `.logs/` or stdout (not the terminal that runs `claude`)

---

## Claude Code handoff validation

- [ ] `ANTHROPIC_BASE_URL` matches the live proxy URL
- [ ] `ANTHROPIC_AUTH_TOKEN` matches the token the proxy enforces (or `freecc` default)
- [ ] Exports are provided for bash, PowerShell, and fish
- [ ] A test `claude --print "hello"` returns a non-empty response
- [ ] No Anthropic API key is present in the shell (`env | grep ANTHROPIC_API_KEY` is empty)

---

## Security validation

- [ ] Proxy binds to `127.0.0.1` (or the user explicitly approved a public bind)
- [ ] No provider key is logged to stdout, log file, or runbook
- [ ] No customer PII is routed through a provider that logs prompts (free tiers included)
- [ ] Handoff document warns against sharing the `freecc` token outside the local machine

---

## Deviations documented

- [ ] All known provider failures listed in `proxy-runbook.md`
- [ ] Each deviation has a provider, model, reason, and resolution

---

## Handoff validation

- [ ] `claude-code-handoff.md` complete
- [ ] Copy-paste exports tested on the user's shell
- [ ] Stop / restart / reconfigure commands tested from the runbook
- [ ] Brand kit updated with deliverable line
