# Codex Plugin Marketplace V1 — the governed console as a Codex-native plugin

> **Canonical contract for the Codex plugin/marketplace surface**
> (`.agents/plugins/marketplace.json` + `plugins/**`). The console pattern is
> owned by [`docs/GOVERNED_MCP_CONSOLE_V1.md`](./GOVERNED_MCP_CONSOLE_V1.md);
> this doc owns how that pattern ships as an installable Codex plugin. Runtime
> truth (`cli/src/commands/workspace-derivation-commands.ts`) wins on exact MCP
> tool shapes.

## What shipped

One repo marketplace makes the existing Growthub governed console available as
a Codex plugin:

```text
.agents/plugins/marketplace.json                  # marketplace "growthub"
plugins/
  growthub-governed-console/                      # plugin (version lockstep with @growthub/cli)
    .codex-plugin/plugin.json                     # Codex manifest + interface metadata
    .mcp.json                                     # governed-universe MCP server (npx, exact pin)
    assets/ghlogo.jpg                             # plugin logo/composer icon
    skills/
      governed-console/SKILL.md
      governed-workspace-mutation/SKILL.md
      workspace-causal-cli/SKILL.md
      workspace-helper/SKILL.md
    hooks.json + hooks/hooks.json                 # SessionStart orientation config
    scripts/session-context.sh                    # read-only workspace detector
    README.md
scripts/check-codex-plugin.mjs                    # structural + lockstep CI gate
```

The package mirrors the Claude Code plugin surface without creating a new
runtime or mutation lane. Codex gets portable skills, presentation metadata,
the Growthub logo, a SessionStart orientation hook, and the same MCP command:

```bash
npx -y @growthub/cli@0.14.15 serve --mcp --fork .
```

## Operating boundary

The plugin is **read + dry-run + governed hand-off — never a mutation tool**.
The MCP server exposes the existing 14-tool governed console:

- read-only Intelligence tools over the metadata graph
- `preflight_patch` as Law dry-run
- `next_actions` as governed hand-off

Actual writes remain owned by the workspace runtime:

- `PATCH /api/workspace`
- `POST /api/workspace/sandbox-run`

## Install and local rehearsal

From the repo root:

```bash
codex plugin marketplace add ./
codex plugin add growthub-governed-console@growthub
codex plugin list --marketplace growthub --available --json
```

Start a new Codex thread in an exported/forked governed workspace root or its
`apps/workspace` directory. The plugin MCP server uses the Codex session cwd as
the workspace root, so the workspace should contain `growthub.config.json` or
`apps/workspace/growthub.config.json`.

## Versioning

`scripts/check-codex-plugin.mjs` enforces:

- marketplace entry resolves to `plugins/growthub-governed-console`
- plugin version equals `cli/package.json`
- `.mcp.json` pins the same exact `@growthub/cli` version
- skill frontmatter names match directory slugs
- logo/composer icon assets exist
- no symlinks are present inside the plugin

Because this surface packages the already-published CLI without changing
`cli/src/**`, `cli/dist/**`, or npm package source, it does not require a
version bump by itself. See [`docs/ARTIFACT_VERSIONS.md`](./ARTIFACT_VERSIONS.md)
and [`docs/AGENT_DIST_REBUILD_GUIDE.md`](./AGENT_DIST_REBUILD_GUIDE.md).

## Relationship to the Claude plugin

The Claude plugin (`.claude-plugin/` + `claude-plugins/`) and the Codex plugin
(`.agents/plugins/` + `plugins/`) package the same governed-console concept for
different hosts. Keep them behaviorally aligned:

- same Growthub CLI MCP server version pin
- same four operator skills unless a host-specific instruction is required
- same read/dry-run/hand-off boundary
- same no-secrets posture

Host-specific differences are allowed only where schemas require them. For
example, Codex presentation metadata lives in `plugin.json.interface`, while
Claude marketplace metadata lives under `.claude-plugin/marketplace.json`.
