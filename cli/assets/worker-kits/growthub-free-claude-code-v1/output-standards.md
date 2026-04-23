# Output Standards — Free Claude Code Proxy

**Kit:** `growthub-free-claude-code-v1`

---

## Output directory structure

All work products are stored inside this kit's export folder (not inside the upstream fork):

```
output/
  <client-slug>/
    <project-slug>/
      provider-selection.md
      model-matrix.md
      routing-config.md
      proxy-runbook.md
      claude-code-handoff.md
```

Runtime artifacts (proxy logs, uvicorn stdout) stay inside the fork at `$FREE_CLAUDE_CODE_HOME/.logs/` — never copy them into kit outputs.

---

## Naming conventions

| Artifact | Naming pattern |
|---|---|
| Client slug | lowercase-kebab-case, e.g. `acme-corp` |
| Project slug | lowercase-kebab-case, e.g. `terminal-freecc` |
| Provider prefix | `nvidia_nim/`, `open_router/`, `deepseek/`, `lmstudio/`, `llamacpp/` |
| Model id | `<prefix><model-slug>`, exactly as the backend accepts it |

---

## Required deliverables per project

Every completed free-claude-code project must have:

1. `provider-selection.md` — which backends are live, which are recommended, and why.
2. `model-matrix.md` — full probed matrix: provider × model × rtt(ms) × pass/fail.
3. `routing-config.md` — exact `.env` values used for `MODEL`, `MODEL_OPUS`, `MODEL_SONNET`, `MODEL_HAIKU`.
4. `proxy-runbook.md` — start, stop, restart, health-check, troubleshoot commands.
5. `claude-code-handoff.md` — copy-pasteable `ANTHROPIC_*` exports for bash, PowerShell, fish.

---

## Quality gates

Before producing the Claude Code handoff, the following must pass:

- `/fcc-diag` — every provider in the routing config returns a green pass.
- `GET http://127.0.0.1:$PORT/health` returns `200`.
- A test `claude "say hello"` round-trip returns a non-empty response with no `401` or `5xx`.
- `lsof -i :$PORT` shows exactly one listener (the uvicorn process).

---

## Deviation logging

If a backend cannot be reached or a model id is rejected, log the deviation in `proxy-runbook.md`:

```markdown
## Deviations

| Provider | Model | Reason | Resolution |
|---|---|---|---|
| nvidia_nim/ | meta/llama3-70b-instruct | 429 rate-limited during diag | Switched MODEL to nvidia_nim/meta/llama3-8b-instruct |
| open_router/ | qwen/qwen2.5-72b | 404 model not available on free tier | Dropped from routing; kept as paid-tier fallback |
```

---

## Handoff line in brand kit

After a completed project, append one line to the active brand kit:

```text
- YYYY-MM-DD | Free Claude Code Proxy v<N> — <Project Name> | output/<client-slug>/<project-slug>/
```
