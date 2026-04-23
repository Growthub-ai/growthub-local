# Output Directory

This directory holds all work products from the Free Claude Code Proxy operator.

## Structure

```
output/
  <client-slug>/
    <project-slug>/
      provider-selection.md    # Which backends are live; recommended primary + fallback
      model-matrix.md          # Probed provider × model × rtt(ms) × pass/fail grid
      routing-config.md        # Exact .env values for MODEL / MODEL_OPUS / MODEL_SONNET / MODEL_HAIKU
      proxy-runbook.md         # Start / stop / restart / diagnose / reconfigure commands
      claude-code-handoff.md   # Copy-pasteable ANTHROPIC_* exports for bash / PowerShell / fish
```

## Notes

- Never commit real provider API keys to this repository.
- All files in `output/` are generated work products, not source-controlled code.
- Add `output/<client-slug>/` to `.gitignore` for client-confidential projects.
- Proxy logs (uvicorn stdout) stay inside the upstream fork, not here.
