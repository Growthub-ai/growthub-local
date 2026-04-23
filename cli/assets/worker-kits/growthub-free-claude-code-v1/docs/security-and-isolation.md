# Security and Isolation

**Kit:** `growthub-free-claude-code-v1`

---

## Threat model

The free-claude-code proxy is a **local-trust** component. Everything about its default posture assumes the attacker is **not** on the local machine:

- `127.0.0.1` bind by default.
- No HTTPS.
- Shared-secret auth (`ANTHROPIC_AUTH_TOKEN`) is adequate for loopback; it is **not** a password.
- Provider keys are loaded from `$FREE_CLAUDE_CODE_HOME/.env`, which stays on the operator's disk.

If you move the proxy off `127.0.0.1`, you must also add TLS and a real auth mechanism. This kit does not ship those.

---

## Data paths

| Hop | What flows | Sensitivity |
|---|---|---|
| Claude Code → Proxy | Prompt, conversation history, tool-use payloads | As sensitive as the operator's work |
| Proxy → Cloud provider | Same payload, shape-translated | May be **logged** by free tiers |
| Proxy → Local backend | Same payload, shape-translated | Never leaves the machine |

**Rule:** any prompt that contains PII, customer data, or secrets must route to a **local** backend (`lmstudio/` or `llamacpp/`). If no local backend is live, the operator must stop and escalate.

---

## Key hygiene

1. Keys live only in `$FREE_CLAUDE_CODE_HOME/.env`.
2. The kit's `.env.example` carries **no** keys.
3. Operator outputs (`output/<client>/<project>/*.md`) carry **no** keys.
4. The runbook's copy-paste blocks reference env vars (`$NVIDIA_NIM_API_KEY`), never literals.
5. Rotate a compromised key:
   ```bash
   # Revoke upstream in the provider console first.
   # Then:
   sed -i.bak 's/^NVIDIA_NIM_API_KEY=.*$/NVIDIA_NIM_API_KEY=NEW_VALUE/' "$FREE_CLAUDE_CODE_HOME/.env"
   /fcc-down && /fcc-up
   /fcc-diag --provider nvidia_nim
   ```

---

## Auth token (`ANTHROPIC_AUTH_TOKEN`)

- Default: `freecc`. Treat this like `localhost:postgres/postgres` — fine for local dev, not a real secret.
- If you bind beyond loopback: **change it immediately** and add TLS (reverse proxy via Caddy or nginx).
- The proxy does not rate-limit brute-force attempts on this token; loopback + firewall is the control.

---

## Network posture

- **Default:** `127.0.0.1:8082`. Only this machine can reach the proxy.
- **Do not** `--host 0.0.0.0` unless: (a) you are on a trusted network, (b) you have set a strong `ANTHROPIC_AUTH_TOKEN`, (c) you have a reverse proxy with TLS in front, (d) the user has explicitly approved.
- If the operator sees `--host 0.0.0.0` without all four, it must warn and refuse.

---

## Container isolation

You can run the proxy in a container to reduce blast radius:

```bash
cd "$FREE_CLAUDE_CODE_HOME"
docker run --rm -it \
  -v "$PWD:/app" -w /app \
  -p 127.0.0.1:8082:8082 \
  python:3.14 \
  bash -lc "pip install uv && uv sync && uv run uvicorn server:app --host 0.0.0.0 --port 8082"
```

Note the **publish rule** `127.0.0.1:8082:8082` — this keeps the container's port exposed only to loopback.

---

## Log hygiene

- Uvicorn logs request URLs but **not** request bodies by default.
- Do **not** enable `--log-level debug` in a session with PII; debug logs include payloads.
- Provider-side logging is outside this kit's control — read the provider ToS.

---

## What the kit never does

- Never writes a key to `output/`.
- Never commits `.env` to git.
- Never pushes provider responses back upstream to Anthropic.
- Never cross-sends between providers.
- Never modifies Claude Code client code.
