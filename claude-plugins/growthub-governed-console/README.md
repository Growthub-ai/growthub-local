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

## Contract references (repo)

- `docs/GOVERNED_MCP_CONSOLE_V1.md` — the console pattern (canonical)
- `docs/CLAUDE_CODE_PLUGIN_MARKETPLACE_V1.md` — this plugin's as-built contract
- `cli/src/commands/workspace-derivation-commands.ts` — the server + tools
- `AGENTS.md` §"Canonical workspace mutation boundary" — the boundary this
  plugin exists to protect
