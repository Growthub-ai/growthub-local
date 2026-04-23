# Claude Code Handoff — SAMPLE (Growthub Dev Laptop)

**Project:** Growthub operator laptop — free local Claude Code
**Date:** 2026-04-23
**Proxy URL:** `http://127.0.0.1:8082`
**Auth token:** `freecc`

---

## Summary

Unmodified Claude Code now talks to the local free-claude-code proxy. LM Studio serves `opus`/`sonnet`/`haiku`; NVIDIA NIM is the fallback when LM Studio is offline.

---

## Shell exports

### bash / zsh

```bash
export ANTHROPIC_BASE_URL="http://127.0.0.1:8082"
export ANTHROPIC_AUTH_TOKEN="freecc"
claude
```

### PowerShell

```powershell
$env:ANTHROPIC_BASE_URL="http://127.0.0.1:8082"
$env:ANTHROPIC_AUTH_TOKEN="freecc"
claude
```

### fish

```fish
set -x ANTHROPIC_BASE_URL "http://127.0.0.1:8082"
set -x ANTHROPIC_AUTH_TOKEN "freecc"
claude
```

### VS Code (Claude Code extension)

`.vscode/settings.json`:

```json
{
  "terminal.integrated.env.osx": {
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:8082",
    "ANTHROPIC_AUTH_TOKEN": "freecc"
  }
}
```

---

## Verification

```bash
$ claude --print "say hello in one word"
hello
```

Round-trip: 870ms (LM Studio `qwen2.5-coder-32b-instruct`).

---

## Stop / restart

```
/fcc-down      # stops uvicorn server:app
/fcc-up        # restarts on port 8082
```

---

## Security notes

- Proxy is bound to `127.0.0.1:8082` — local only.
- LM Studio runs at `http://localhost:1234` — local only.
- NVIDIA NIM fallback calls `https://integrate.api.nvidia.com/v1` — egress visible in proxy stdout.
- `freecc` token is a local shared secret; not shipped anywhere.

---

## Known deviations for this handoff

| Provider | Model | Reason | Workaround |
|---|---|---|---|
| `nvidia_nim/` | `meta/llama3.1-405b-instruct` | Not available on free tier | Routed fallback to `llama3-70b-instruct` instead |
| `lmstudio/` | `qwen2.5-coder-32b-instruct` | Cold start ≈45s | First prompt after boot is slow; subsequent are fast |
