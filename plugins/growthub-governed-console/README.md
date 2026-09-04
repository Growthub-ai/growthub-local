# Growthub Governed Console — Codex Plugin

![Growthub logo](./assets/ghlogo.jpg)

The Codex-native operating console for governed Growthub workspaces
([Agent Workspace as Code](https://github.com/Growthub-ai/growthub-local)).

**Read + dry-run + governed hand-off — never a mutation tool.** This plugin
mirrors the Claude `growthub-governed-console` package for Codex: it bundles the
same portable operator skills, the same Growthub logo, the same governed MCP
server command, and a SessionStart orientation hook.

## Install From This Repo

```bash
codex plugin marketplace add ./
codex plugin add growthub-governed-console@growthub
```

Then start a new Codex thread in a governed workspace, usually an exported
workspace root or `apps/workspace` folder containing `growthub.config.json`.

## Components

| Component | What it does |
| --- | --- |
| MCP server `governed-universe` | Runs `npx -y @growthub/cli@0.14.32 serve --mcp --fork .` from the Codex session cwd. |
| Skill `governed-console` | Drives the read → reason → dry-run → governed hand-off → re-read loop. |
| Skill `governed-workspace-mutation` | Restates the canonical mutation boundary and PATCH allowlist. |
| Skill `workspace-causal-cli` | Documents the scriptable CLI twin: `growthub plan / patch / capture / readiness --json`. |
| Skill `workspace-helper` | Documents the proposal → review → apply drafting lane. |
| Hook `SessionStart` | Emits orientation inside a governed workspace and stays silent elsewhere; shipped at both `hooks.json` and `hooks/hooks.json` for Codex loader compatibility. |

## Boundary

The plugin does not add a direct mutation tool. MCP tools inspect the workspace,
simulate impact, and dry-run patch bodies. Real writes still go through the
workspace runtime's governed calls:

- `PATCH /api/workspace`
- `POST /api/workspace/sandbox-run`

## Versioning

The plugin version is lockstep with `@growthub/cli`. The bundled MCP server
pins `@growthub/cli@0.14.32`; `scripts/check-codex-plugin.mjs` enforces that
the plugin version and MCP pin match `cli/package.json`.
