---
name: growthub-discover
description: Enter the Growthub Local discovery hub through the real CLI (`growthub discover`) with sandbox-safe fallbacks to the demo script and built dist. Use when the user asks to "open discover", "start discovery", run the discovery menu, or reach any Growthub lane (Worker Kits, Templates, Workflows, Local Intelligence, Agent Harness, Settings, Memory & Knowledge).
---

# Growthub Discover — Primary Entry

Single source of truth for reaching the Growthub discovery hub from any environment (installed CLI, local branch checkout, or sandbox with no published binary).

Canonical mental model (matches `README.md` and `AGENTS.md`):

> repo / skill / starter / kit → governed local workspace → safe customization → safe sync → optional hosted authority

Discovery is the governed entry to every lane in that model.

## Environment resolution — try in this order

Do not hardcode absolute user paths. Resolve the CLI binary by trying each of these, in order, and use the first one that works. `REPO` is the growthub-local repo root (the working directory if this skill is invoked inside the repo).

1. **Installed public CLI** — `growthub discover`
2. **Branch-built dist** — `node "$REPO/cli/dist/index.js" discover`
3. **Demo script (tsx, no build required)** — `bash "$REPO/scripts/demo-cli.sh" cli discover`

The demo script is the only one guaranteed to work with zero build. If `cli/dist/index.js` is missing and no `growthub` binary is on PATH, always use the demo script — it loads `cli/src/index.ts` via tsx.

If you're uncertain which path is available, probe once:

```bash
command -v growthub >/dev/null 2>&1 && echo installed
[ -f "$REPO/cli/dist/index.js" ] && echo dist
[ -x "$REPO/scripts/demo-cli.sh" ] && echo demo
```

## Auth guard — required before Workflows

Workflows, Saved Workflows, and hosted-execution surfaces require an active session. Verify before entering those lanes:

```bash
growthub auth whoami --json
# or, without an installed CLI:
node "$REPO/cli/dist/index.js" auth whoami --json
# or:
bash "$REPO/scripts/demo-cli.sh" cli -- auth whoami --json
```

If auth is missing or expired, stop and run `growthub auth login` (browser flow) or pass a hosted token via `--token <token>` for scripting. Do not fabricate a fallback.

## Top-level discovery menu (matches `cli/src/index.ts` `runDiscoveryHub`)

```
Growthub Local
├── 🧰 Worker Kits
├── 📚 Templates
├── 🔗 Workflows                    (auth-gated)
│   ├── Saved Workflows
│   ├── Templates                   (assemble from a built-in CMS node)
│   └── Dynamic Pipelines
├── 🧠 Local Intelligence
├── 🤖 Agent Harness                (filter: Paperclip, Open Agents, Qwen Code, T3 Code)
├── ⚙️  Settings                    (GitHub, Fork Sync, Integrations, Service Status, Starter, Fleet)
├── 📖 Memory & Knowledge           (persistent memory, search, multi-provider config)
├── 🔐 Connect Growthub Account
└── ❓ Help CLI
```

## Non-negotiable rules

1. Always use the real discovery entry — never improvise a shortcut menu.
2. Use an authenticated hosted session for Workflows. No fake/local-only substitutes.
3. Do not replace the requested flow with alternate command-only shortcuts unless the user approves.
4. Do not silently swap user-provided files, prompts, or bindings.
5. Preview parity: if you demo a menu tree, it must match the shipped CLI (see `cli/src/index.ts`).

## Standard flow order (template → save → execute)

Follow this order unless the user changes it:

1. `discover`
2. Workflows → Templates
3. Pick family (image / video / slides / text / data / ops / research / vision)
4. Pick capability node
5. Assemble a pipeline from the template
6. Fill required bindings
7. Save pipeline (hosted)
8. Workflows → Saved Workflows → Execute (confirm twice — intent + credits)
9. Verify artifact in hosted media library

## Quick non-interactive commands

```bash
# List saved workflows as JSON
growthub workflow saved --json

# List capability templates as JSON, filtered
growthub workflow --json                 # opens browser; use `workflow saved` for JSON listing

# Assemble / validate / execute pipelines
growthub pipeline assemble
growthub pipeline validate '<json>'
growthub pipeline execute  '<json>' --json
```

Substitute `node "$REPO/cli/dist/index.js" …` or `bash "$REPO/scripts/demo-cli.sh" cli -- …` when the installed binary is unavailable.

## Telemetry

PostHog events (`discover_opened`, `cli_first_run`, etc.) are emitted by the CLI. They carry only safe properties — no source code, secrets, file contents, env vars, or private URLs. Opt out with `GROWTHUB_TELEMETRY_DISABLED=true`.

## Success criteria

Discovery is correctly entered when:

1. The menu tree rendered matches the shipped one above.
2. Auth state is known before any Workflows action.
3. Any workflow assembly uses the Templates surface (never hand-built hosted JSON).
4. Execution uses Saved Workflows with two confirmations, or `pipeline execute --json` for scripting.

## Required response format to the user

When you enter discovery on the user's behalf, return:

- which CLI path you used (installed / dist / demo)
- current auth identity from `auth whoami` (or "unauthenticated")
- the lane you ended up in
- next available actions in that lane

If an error surfaces, name the exact guard that blocked it (auth, missing dist, missing env var) and the one command that unblocks it.
