---
name: growthub-auth
description: Sign in, confirm identity, and sign out of hosted Growthub via `growthub auth login` / `whoami` / `logout`. Use when the user needs to authenticate before Workflows / Saved Workflows / Pipeline execution, verify the active session, script auth with a pre-issued token, or opt out of telemetry.
triggers:
  - auth login
  - auth whoami
  - auth logout
  - authenticate
  - connect growthub
progressiveDisclosure: true
sessionMemory:
  path: .growthub-fork/project.md
selfEval:
  criteria:
    - growthub auth whoami --json returns authenticated:true before any auth-gated action.
    - No raw tokens, cookies, or session JSON printed or logged.
    - Base URL + machine/workspace labels match the target environment.
  maxRetries: 3
  traceTo: .growthub-fork/trace.jsonl
helpers: []
subSkills: []
mcpTools:
  - growthub.auth.login
  - growthub.auth.whoami
  - growthub.auth.logout
---

# Growthub Auth — Hosted Session Guard

Source of truth: `cli/src/commands/auth-login.ts` and the auth block registered in `cli/src/index.ts` (`target.command("auth")`).

Workflows, Saved Workflows, Dynamic Pipelines, and hosted `pipeline execute` all require an active session. Every one of the other `growthub-*` skills in this catalog expects auth to be resolved before it runs.

## Environment resolution

Use the first available entrypoint (`REPO` = repo root):

1. `growthub auth …` — installed public CLI
2. `node "$REPO/cli/dist/index.js" auth …` — branch-built dist
3. `bash "$REPO/scripts/demo-cli.sh" cli -- auth …` — tsx loader, no build required

## Command surface

| Command | Purpose |
|---|---|
| `growthub auth login` | Browser-based OAuth flow; saves a CLI session in `$PAPERCLIP_HOME` |
| `growthub auth login --token <token>` | Script/CI path — accept a pre-issued hosted token, skip the browser |
| `growthub auth login --no-browser` | Print the callback URL and wait — for remote shells / SSH / sandboxes |
| `growthub auth whoami` | Print authenticated hosted identity + linked local workspace |
| `growthub auth whoami --json` | Machine-readable identity for scripts |
| `growthub auth logout` | Drop the hosted session (keeps the local workspace profile) |
| `growthub auth logout --keep-overlay` | Drop the session token but keep cached hosted overlay metadata |
| `growthub auth bootstrap-ceo` | One-time first-instance-admin invite URL |

Shared options on `login` / `whoami` / `logout`:

- `-c, --config <path>` — config file
- `-d, --data-dir <path>` — paperclip data dir override
- `--base-url <url>` — hosted base URL (defaults to `auth.growthubBaseUrl` or `GROWTHUB_BASE_URL`)
- `--machine-label <label>` / `--workspace-label <label>` — labels in hosted app
- `--timeout-ms <ms>` — how long `login` waits for the browser callback
- `--json` — raw JSON output

## Pre-flight guard (before any auth-gated skill)

Always confirm session state before entering Workflows / Saved Workflows / Dynamic Pipelines / `pipeline execute`:

```bash
growthub auth whoami --json
```

Expected output shape when authenticated:

```json
{
  "authenticated": true,
  "identity": { "userId": "...", "email": "..." },
  "workspace": { "label": "...", "machineLabel": "..." },
  "baseUrl": "https://..."
}
```

If `authenticated` is `false`, or the command fails:

1. **Interactive session** — run `growthub auth login` (browser flow)
2. **Scripted / CI / sandbox** — run `growthub auth login --token "$GROWTHUB_TOKEN" --no-browser`

Do not fabricate a fake identity or continue against a local-only mock. Stop and ask the user to authenticate.

## Session storage

- Sessions are saved under `$PAPERCLIP_HOME` (default `$HOME/.paperclip`).
- Local workspace profile is separate from the hosted session — `logout` clears the session but keeps the workspace.
- Respect `PAPERCLIP_HOME` overrides in sandbox / worktree contexts; do not write to the system `$HOME` if the env var is set.

## Base URL resolution

The CLI resolves the hosted base URL in this order:

1. `--base-url` flag
2. `GROWTHUB_BASE_URL` env var
3. `auth.growthubBaseUrl` in the active config
4. Built-in default

Use `--base-url https://growthub.internal` (or similar) when pointing at a staging / internal instance.

## Telemetry

PostHog event `growthub_auth_connected` fires on successful login. Properties are safe (no source, secrets, file contents, env vars, private URLs). Opt out with:

```bash
export GROWTHUB_TELEMETRY_DISABLED=true
```

## Scripted-auth example

```bash
export GROWTHUB_TOKEN="$(pass growthub/cli-token)"
growthub auth login --token "$GROWTHUB_TOKEN" --no-browser --json \
  | jq -e '.authenticated == true' >/dev/null

# Now every auth-gated command works
growthub workflow saved --json
```

## Non-negotiable rules

1. Run `auth whoami` before any Workflows / Saved Workflows / Pipeline action. Never skip the pre-flight guard.
2. Never print raw tokens, auth cookies, or the contents of `$PAPERCLIP_HOME/session*`.
3. Never hand-edit the session file to "fix" auth — always run `logout` then `login`.
4. When auth fails, name the exact cause (missing token, expired session, wrong base URL) and the one command that unblocks it.
5. Do not bypass auth by calling hosted routes directly from `curl`/`fetch` — go through the CLI so session rotation and telemetry stay consistent.

## Failure → remediation map

| Symptom | Cause | Remediation |
|---|---|---|
| `auth whoami` prints "not authenticated" | No session on disk | `growthub auth login` |
| `login` hangs waiting for browser callback | Remote shell / sandbox | Re-run with `--no-browser` and open the printed URL manually, or use `--token` |
| 401 / 403 from a hosted route | Expired session | `growthub auth logout` then `growthub auth login` |
| Wrong instance (dev vs prod) | Base URL drift | Pass `--base-url` explicitly, or set `GROWTHUB_BASE_URL` |
| Workspace label looks wrong in hosted app | Machine / workspace labels default | Re-login with `--machine-label` / `--workspace-label` |

## Success criteria

Auth work is complete when:

1. `growthub auth whoami --json` returns `"authenticated": true`.
2. The identity matches the user's intended account.
3. The workspace / machine labels match the environment the user is operating in.
4. No auth artifacts (tokens, cookies, session JSON) were printed or committed.

## What this skill does NOT do

- It does not run workflows — pair it with `growthub-discover` (interactive) or `growthub-pipeline-execute` (headless).
- It does not provision new tenants — that's a hosted-app concern.
- It does not manage fork-authority issuer trust — that's `growthub-kit-fork-authority`.
