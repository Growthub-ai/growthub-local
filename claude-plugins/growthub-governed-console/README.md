# Growthub Governed Console — Claude Code plugin

The agent-facing operating console for governed Growthub workspaces
([Agent Workspace as Code](https://github.com/Growthub-ai/growthub-local)),
packaged as a first-party Claude Code plugin.

**Read + dry-run + governed hand-off — never a mutation tool.** The plugin
exposes the `growthub serve --mcp` console (14 MCP tools over the workspace
metadata graph), the operator skills for the canonical mutation boundary, a
read-only `workspace-operator` agent, and a SessionStart hook that orients
Claude the moment it opens a governed workspace.

## Install

```
/plugin marketplace add Growthub-ai/growthub-local
/plugin install growthub-governed-console@growthub
```

Requires Node.js ≥ 20 (the MCP server runs `npx -y @growthub/cli`). The
console activates inside any project containing `growthub.config.json` at the
root or under `apps/workspace/` — i.e. any exported/forked governed
workspace. Outside one, the hook stays silent and the tools report the
missing config.

## Components

| Component | What it does |
| --- | --- |
| MCP server `governed-universe` | `growthub serve --mcp` over `${CLAUDE_PROJECT_DIR}` — 12 read-only Intelligence tools, `preflight_patch` (Law dry-run), `next_actions` (governed hand-off). |
| Skill `governed-console` | How to drive the 14 tools through the read → reason → dry-run → hand-off → re-read loop, incl. live mode. |
| Skill `governed-workspace-mutation` | The two canonical mutation calls, the PATCH allowlist, the 400/422 envelopes, and the read → preflight → prove → publish → confirm protocol. |
| Skill `workspace-causal-cli` | The console's scriptable twin: `growthub plan / patch / capture / readiness --json`. |
| Skill `workspace-helper` | The propose → review → apply drafting lane for dashboards, widgets, APIs, objects, swarms. |
| Agent `workspace-operator` | Read-only investigator: answers "what exists / what breaks / is it ready" and returns exact governed next calls. |
| Hook `SessionStart` | Detects a governed workspace and injects the mutation boundary + console pointer as context. Silent elsewhere. |

## How it's used (persona → lane → components)

| Who | Scenario | What they use |
| --- | --- | --- |
| **Workspace operator** (a user driving Claude Code inside an exported/forked workspace) | "Add a field / rename an object / why is this dashboard broken?" | SessionStart hook orients the session → `governed-console` skill drives the loop → `preflight_patch` dry-runs → the agent executes the governed `PATCH` per `governed-workspace-mutation` |
| **Builder** | "Build me a dashboard / register this API / create a custom object" | `workspace-helper` skill: `query` → review proposals (cross-checked with `find_downstream_dependencies`) → explicit `apply` |
| **Shipper / reviewer** | "Is this workspace ready to deploy? What does this PR change break?" | `workspace-operator` agent for the readiness verdict; `workspace-causal-cli` (`plan` / `readiness --json`) as a scripted CI gate |
| **Support / debugging** | "What backs this chart? What produced this artifact? What's stale?" | Read-only Intelligence tools: `describe_node`, `trace_lineage`, `outcome_ledger`, `simulate_causal_impact` |
| **Autonomous agents** (headless / swarm sessions) | Safe operation without direct power | The whole console: context + simulation + `next_actions` hand-off; mutations remain observable, receipted API calls the platform validates |

## Security posture

- The MCP server is read-only by construction: Intelligence tools have no
  side effects, `preflight_patch` never writes, and there is **no** mutation
  tool — `next_actions` emits the sanctioned route for the agent to call
  through the workspace's own governed API.
- Sandboxes/integrations surface `authStatus`, never secrets or tokens.
- The SessionStart hook runs no network calls and reads no file contents —
  it only tests for `growthub.config.json` existence.

## Live mode

The shipped config is offline-first (reads the repo artifact). To bind the
console to a running workspace (authoritative preflight + per-call live
rehydration), override the server in your project `.mcp.json` — see the
`governed-console` skill for the exact block.

## Versioning

The plugin version is lockstep with the `@growthub/cli` version pinned in
[`.mcp.json`](./.mcp.json) (same discipline as `@growthub/create-growthub-local`).
`scripts/check-claude-plugin.mjs` in the repo enforces plugin version ==
pinned CLI version == `cli/package.json` version, so a CLI release cannot
ship without the console following it.

## Develop → test → deploy → validate (quickstart)

**Stage 0 — inner dev loop (no install, instant):** load the plugin in-place
and iterate; edits apply on the next session start. First launch cold-starts
`npx @growthub/cli`, so give the MCP server a few seconds to connect.

```bash
cd <any exported workspace>   # anything with growthub.config.json
claude --plugin-dir <repo>/claude-plugins/growthub-governed-console
```

**Stage 1 — validate (before every push):**

```bash
node scripts/check-claude-plugin.mjs     # structure + version lockstep (CI gate)
claude plugin validate .                 # official manifest validation
```

**Stage 2 — local marketplace rehearsal (same mechanics as production):**

```bash
claude plugin marketplace add ./
claude plugin install growthub-governed-console@growthub
claude plugin details growthub-governed-console   # inventory + token cost
# after edits: claude plugin marketplace update growthub
```

Watch `claude plugin list` for **√ enabled** — a "failed to load" here is
exactly what users would hit (this rehearsal caught both P0 defects).

**Stage 3 — deploy = merge.** The marketplace is hosted by this repo itself;
merging to `main` publishes it. No extra infrastructure.

**Stage 4 — real marketplace compatibility (post-merge, clean machine):**

```bash
claude plugin marketplace remove growthub          # drop any local rehearsal
claude plugin marketplace add Growthub-ai/growthub-local
claude plugin install growthub-governed-console@growthub
cd <exported workspace> && claude                  # hook fires, tools connect
```

For containers/CI images, pre-seed with `CLAUDE_CODE_PLUGIN_SEED_DIR`
(structure mirrors `~/.claude/plugins/`). Debug any load issue with
`claude --debug`.

## Contract references (repo)

- `docs/GOVERNED_MCP_CONSOLE_V1.md` — the console pattern (canonical)
- `docs/CLAUDE_CODE_PLUGIN_MARKETPLACE_V1.md` — this plugin's as-built contract
- `cli/src/commands/workspace-derivation-commands.ts` — the server + tools
- `AGENTS.md` §"Canonical workspace mutation boundary" — the boundary this
  plugin exists to protect
