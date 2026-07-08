# Claude Connector Release QA Smoke V1

Credential-safe proof for the combined Claude marketplace plugin release branch.
This document records outcomes only: no tokens, cookies, bearer values, provider
payload credentials, or `.env` values were printed or copied.

## Branch Composition

- Base: `origin/main` at `f7587852`.
- Merged feature branch: `origin/claude/code-connector-marketplace-uhi6oc`.
- Merged docs branches: `origin/docs/skill-library-cleanup` and
  `origin/claude/growthub-local-readme-ptpm6l`.
- Follow-up compatibility fix: removed Claude Code 2.1.96-rejected manifest
  fields and moved the marketplace description/logo into `metadata`.

## Local Claude App Smoke

Environment:

- Claude Code CLI: `/Users/antonio/.local/bin/claude`, version `2.1.96`.
- Claude desktop app present at `/Applications/Claude.app`.
- Governed workspace fixture:
  `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace`.

Proofs:

- `claude plugin validate .` passed for the marketplace manifest.
- `claude plugin validate claude-plugins/growthub-governed-console` passed for
  the plugin manifest.
- `claude plugin marketplace add ./` added the local marketplace as `growthub`.
- `claude plugin install growthub-governed-console@growthub` installed the
  plugin at user scope.
- `claude plugin list` reported `growthub-governed-console@growthub`,
  version `0.14.15`, status `enabled`.
- The SessionStart hook emitted governed-workspace orientation when
  `CLAUDE_PROJECT_DIR` pointed at the workspace fixture and exited silently with
  code 0 outside a governed workspace.
- `CLAUDE_PROJECT_DIR=<workspace> claude mcp list` reported the plugin MCP
  server `plugin:growthub-governed-console:governed-universe` connected.
- Without `CLAUDE_PROJECT_DIR`, `claude mcp list` health-checks the plugin
  command with the literal `${CLAUDE_PROJECT_DIR}` on Claude Code 2.1.96 and
  reports failed connection. This is a local health-check environment behavior;
  the same command connects when the project directory variable is present.
- A headless `claude -p` model invocation could not complete because the local
  Claude Code auth returned HTTP 401 invalid credentials. No credentials were
  printed. The MCP server itself was verified independently below.

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
- `/Users/antonio/.local/bin/claude plugin validate .`
- `/Users/antonio/.local/bin/claude plugin validate claude-plugins/growthub-governed-console`
- `bash scripts/pr-ready.sh`

Known local-only note:

- `node scripts/check-monorepo-boundary.mjs --json` reports unclassified local
  top-level entries `ui` and a control-character-named scratch directory. They
  are not tracked by git and were not included in this release branch.
