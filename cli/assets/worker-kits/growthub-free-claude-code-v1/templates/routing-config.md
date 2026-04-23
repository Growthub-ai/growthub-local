# Routing Config

**Project:** [PROJECT NAME]
**Date:** YYYY-MM-DD
**Applied to:** `$FREE_CLAUDE_CODE_HOME/.env`

---

## Applied values

```
MODEL=<provider/model>
MODEL_OPUS=<provider/model>
MODEL_SONNET=<provider/model>
MODEL_HAIKU=<provider/model>
ENABLE_THINKING=true
```

Each value above was verified with `/fcc-diag --provider <prefix>` before the proxy was restarted.

---

## Provider-specific notes

| Role | Provider | Model | Why this choice |
|---|---|---|---|
| `opus` | [provider] | [model] | [rationale — quality / context window] |
| `sonnet` | [provider] | [model] | [rationale — balance / rate limit] |
| `haiku` | [provider] | [model] | [rationale — latency] |
| `fallback` | [provider] | [model] | [rationale — availability] |

---

## Reconfigure command

```
/fcc-route --opus <provider/model> --sonnet <provider/model> --haiku <provider/model>
```

The operator will:

1. Validate every provider prefix against the matrix.
2. Probe every model via `/fcc-diag`.
3. Write the new values to `$FREE_CLAUDE_CODE_HOME/.env`.
4. Restart the proxy via `/fcc-down` then `/fcc-up`.
5. Regenerate this file and `model-matrix.md`.

---

## Safety invariants

- Keys are **never** written into this document. Keys live only in `$FREE_CLAUDE_CODE_HOME/.env`.
- Every model id used above must appear in `model-matrix.md` with a `pass` result.
- If any routed model's last probe is older than 24h, re-run `/fcc-diag` before handing off.
