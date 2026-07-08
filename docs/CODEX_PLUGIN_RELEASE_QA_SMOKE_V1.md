# Codex Plugin Release QA Smoke V1

Credential-safe proof for the Codex-native Growthub Governed Console plugin.
This document records outcomes only: no tokens, cookies, bearer values,
provider payload credentials, or `.env` values were printed or copied.

## Branch Composition

- Base: `origin/main` at `7793b6a0`.
- New repo marketplace: `.agents/plugins/marketplace.json`.
- New Codex plugin package: `plugins/growthub-governed-console/`.
- New CI gate: `scripts/check-codex-plugin.mjs`.

## Local Codex Smoke

Environment:

- Codex CLI: `codex-cli 0.142.5`.
- Governed workspace fixture:
  `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace`.

Proofs:

- `node scripts/check-codex-plugin.mjs` passed:
  `1 plugin(s) [growthub-governed-console], 4 skill(s), 2 hook file(s),
  lockstep @ 0.14.15`.
- Codex plugin-creator validator passed against
  `plugins/growthub-governed-console` in a temporary venv with `PyYAML`
  installed for the validator process only.
- `codex plugin marketplace add ./ --json` added marketplace `growthub` from
  `/Users/antonio/growthub-local`.
- `codex plugin add growthub-governed-console@growthub --json` installed
  `growthub-governed-console@growthub`, version `0.14.15`, into the Codex
  plugin cache.
- `codex plugin list --marketplace growthub --available --json` reported the
  plugin as installed and enabled.
- `codex mcp get governed-universe` from the starter workspace reported
  `command: npx`, args
  `-y @growthub/cli@0.14.15 serve --mcp --fork .`, and `cwd: -`. The missing
  explicit cwd is intentional: Codex runs the server from the session project
  directory instead of the plugin cache.
- SessionStart hook script emits governed-workspace orientation inside the
  starter workspace and stays silent outside one.
- Pinned MCP server JSON-RPC smoke passed against
  `npx -y @growthub/cli@0.14.15 serve --mcp --fork <workspace>`.

## MCP Server Smoke

Command under test:

```bash
npx -y @growthub/cli@0.14.15 serve --mcp --fork cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace
```

JSON-RPC proof:

- `initialize` returned protocol `2024-11-05`.
- `tools/list` returned 14 tools, including `preflight_patch` and
  `next_actions`.
- `describe_workspace` returned workspace `Growthub Workspace`, source
  `offline-config`, and graph counts from the starter workspace.
- `preflight_patch` with disallowed `workspaceSourceRecords` returned
  `mode: offline-approximation`, `allowlist.ok: false`, and the allowed keys
  `dashboards`, `widgetTypes`, `canvas`, `dataModel`.

## Repo Gates

- `git diff --check origin/main...HEAD`
- `node scripts/check-version-sync.mjs`
- `node scripts/check-cli-package.mjs`
- `node scripts/check-claude-plugin.mjs`
- `node scripts/check-codex-plugin.mjs`
- `bash scripts/pr-ready.sh`
