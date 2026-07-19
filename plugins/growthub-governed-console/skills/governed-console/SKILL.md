---
name: governed-console
description: Operate the governed-universe MCP tools over a Growthub workspace — describe the workspace, traverse the metadata graph, simulate causal impact and blast radius, check ship-readiness, dry-run a PATCH with preflight_patch, and convert findings into governed next actions. Use whenever you need to answer "what exists, what depends on what, what would break, is it ready, and what governed call should happen next" in a workspace that contains growthub.config.json.
---

# Governed Console — read, reason, dry-run, hand off

This plugin's `governed-universe` MCP server is the agent-facing operating
console over a governed Growthub workspace. It exposes **read + dry-run +
governed hand-off, never a mutation tool**. The workspace (its API routes)
owns reality; the console exposes understanding of it.

The server runs `growthub serve --mcp` against the current project
(`${CLAUDE_PROJECT_DIR}`), which must contain a `growthub.config.json` at the
root or under `apps/workspace/`. If neither exists, the tools will report the
missing config — this plugin is for operating exported/forked governed
workspaces, not arbitrary repos.

## The operating loop

Every workspace task follows the same explicit loop:

```
read → reason → dry-run → governed hand-off → re-read → continue
```

1. **Read** — `describe_workspace` to orient, then the `list_*` tools for the
   area you are touching.
2. **Reason** — `describe_node`, `find_downstream_dependencies`,
   `simulate_causal_impact`, `trace_lineage` before changing anything.
3. **Dry-run** — `preflight_patch` with the exact PATCH body you intend to
   send. Never skip this.
4. **Governed hand-off** — `next_actions` emits the exact sanctioned route
   (`PATCH /api/workspace`, `sandbox-run`, `workflow/publish`,
   `helper/apply`). Execute that route yourself through the workspace API —
   the MCP server never mutates.
5. **Re-read** — after the governed change lands, read again. In `--live`
   mode the server rehydrates per call, so reads are never stale.

## Tool inventory (14 tools, by control-plane layer)

**Layer 3 — Intelligence (read-only, no side effects):**

| Tool | Answers |
| --- | --- |
| `describe_workspace` | identity, capabilities, object/edge counts, provenance |
| `list_data_model` | objects + fields, types, `isLiveBacked`, row counts, views |
| `list_dashboards` | dashboards + widgets, bindings, required fields, warnings |
| `list_workflows` | workflows + nodes, lifecycle, required inputs |
| `list_integrations` | integrations, sandboxes (`authStatus` — never secrets), source records |
| `outcome_ledger` | runs, pipeline health, artifacts, provenance (session continuity) |
| `describe_node` | one node: summary + direct dependents/dependencies + enrichment |
| `get_workspace_topology` | the full metadata graph (nodes + edges) |
| `find_downstream_dependencies` | blast radius — the transitive dependent set |
| `simulate_causal_impact` | stale surfaces + workflow impact of changing a node |
| `trace_lineage` | provenance closure — prefer `dependents` / `dependencies` directions |
| `app_readiness` | ship-readiness verdict `{ ready, blocking[], nextAction }` |

**Layer 2 — Law (dry-run only):** `preflight_patch` — tests the exact PATCH
body against the allowlist, blast radius, and contract compliance. With a
live runtime it proxies the authoritative `POST /api/workspace/patch/preflight`
route (forwarding `appScope` as `x-growthub-app-scope`); offline it is a
clearly-labelled approximation (`mode` field tells you which you got).

**Layer 1 — Mutation:** none. `next_actions` emits the exact governed call to
run; there is no third mutation path.

## Correct usage patterns

- **Before deleting or editing a business object** — `describe_node` +
  `find_downstream_dependencies` on it, then `preflight_patch` the removal.
  Removal warnings and stale surfaces come back before anything breaks.
- **Before shipping** — `app_readiness`, then work the `blocking[]` list via
  `next_actions`.
- **Debugging a broken dashboard** — `list_dashboards` (widget warnings) →
  `describe_node` on the widget → `trace_lineage` to what backs it.
- **Session continuity** — start with `outcome_ledger` to read what previous
  sessions did (runs, receipts, artifacts) before acting.

## Live mode

The shipped server config is offline-first: it reads the repo artifact
(`growthub.config.json` + `growthub.source-records.json` sidecar). When the
workspace dev server is running (typically `http://127.0.0.1:3777`), point
the console at it so Intelligence reads reflect live state and
`preflight_patch` proxies the authoritative Law route — override the server
in your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "governed-universe": {
      "command": "npx",
      "args": ["-y", "@growthub/cli@0.14.28", "serve", "--mcp",
               "--fork", ".", "--live", "http://127.0.0.1:3777"]
    }
  }
}
```

Every tool result carries `source` (`offline-config`, `live:<url>`, or
`offline-fallback (...)`) and `snapshotAt` — trust what the tool says it read,
and say so in your own reporting.

## Boundaries (must hold)

- Never treat the console as a write API — mutations go through the governed
  workspace routes only (see the `governed-workspace-mutation` skill in this
  plugin).
- Never skip `preflight_patch` before a PATCH.
- Never print secrets; the console exposes `authStatus`, not tokens.
- If a tool reports `offline-approximation`, do not present its verdict as
  the authoritative Law result — boot the workspace and use `--live` for
  authority.
