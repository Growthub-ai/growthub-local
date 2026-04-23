# Claude Code Handoff

**Project:** [PROJECT NAME]
**Date:** YYYY-MM-DD
**Proxy URL:** `http://127.0.0.1:<port>`
**Auth token:** `freecc` (or the value set in `$FREE_CLAUDE_CODE_HOME/.env` → `ANTHROPIC_AUTH_TOKEN`)

---

## Summary

You are about to run **unmodified Claude Code** against a local FastAPI proxy that routes requests to free or local backends. Claude Code will act as if it is talking to `api.anthropic.com`; in reality every request terminates at the proxy.

**Two env vars are all Claude Code needs:**

- `ANTHROPIC_BASE_URL` — the proxy URL
- `ANTHROPIC_AUTH_TOKEN` — the shared secret the proxy enforces

No Anthropic API key. No patch to Claude Code. No config file.

---

## Shell exports

### bash / zsh

```bash
export ANTHROPIC_BASE_URL="http://127.0.0.1:<port>"
export ANTHROPIC_AUTH_TOKEN="freecc"
claude
```

### PowerShell

```powershell
$env:ANTHROPIC_BASE_URL="http://127.0.0.1:<port>"
$env:ANTHROPIC_AUTH_TOKEN="freecc"
claude
```

### fish

```fish
set -x ANTHROPIC_BASE_URL "http://127.0.0.1:<port>"
set -x ANTHROPIC_AUTH_TOKEN "freecc"
claude
```

### VS Code (Claude Code extension)

Add to your `.vscode/settings.json` or your shell profile — the extension inherits the shell env:

```json
{
  "terminal.integrated.env.osx": {
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:<port>",
    "ANTHROPIC_AUTH_TOKEN": "freecc"
  }
}
```

(Use `terminal.integrated.env.linux` or `.windows` as appropriate.)

---

## Verification

```bash
claude --print "say hello in one word"
```

Expected: a short non-empty response with no `401` or `ECONNREFUSED`.

If the response is empty or errors, go back to the runbook:

1. `/fcc-diag` — is the routed model still green?
2. `curl http://127.0.0.1:<port>/health` — is the proxy alive?
3. `env | grep ANTHROPIC_` — are both exports present in **this** shell?

---

## Stop / restart

See `proxy-runbook.md`. Short version:

```
/fcc-down      # stop
/fcc-up        # restart
```

---

## Security notes

- The proxy binds to `127.0.0.1` by default — only this machine can reach it.
- The `freecc` token is a **local shared secret**, not an Anthropic key. Do not paste it into cloud dotfiles or CI secrets; keep it in the local shell only.
- Free-tier providers may log prompts. Do not send PII through them — route PII through LM Studio or llama.cpp.
- The proxy does not upgrade to HTTPS; this is acceptable for `127.0.0.1` but **not** for any other bind.

---

## Known deviations for this handoff

(Filled in by the operator from `proxy-runbook.md` → Deviations table.)

| Provider | Model | Reason | Workaround |
|---|---|---|---|
| [provider] | [model] | [reason] | [workaround] |
