---
name: workspace-helper
description: Draft dashboards, widgets, API registry rows, custom business objects, and swarm graphs for a governed Growthub workspace via the workspace helper — a propose-only planning engine whose output is applied through an explicit governed apply step. Use when asked to build a dashboard, create a custom object, register an API, scaffold a widget, repair broken references, or explain a workspace object.
---

# Workspace Helper — propose, review, apply

The workspace helper is a governed, workspace-grammar-aware planning engine.
It **never mutates on query**: `query` returns proposals; a separate `apply`
step validates and writes them through the same policy gate as every other
mutation, and every apply appends a receipt to source-records.

## CLI surface

```bash
# Query — no writes, returns proposals[]
growthub workspace helper query --intent <intent> --prompt "<brief>" --json > proposals.json

# Apply — validates + writes accepted proposals (explicit human/agent review between)
growthub workspace helper apply --proposal-file proposals.json [--yes]

# Receipt history
growthub workspace helper receipts [--limit 25]
```

Intents: `build_dashboard` | `create_widget` | `register_api` |
`create_object` | `edit_view` | `repair` | `explain` | `swarm`

## API surface (requires the running workspace dev server)

- `POST /api/workspace/helper/query` → `{ summary, proposals[], warnings[], receipts }` (no writes)
- `POST /api/workspace/helper/apply` → `{ applied[], skipped[], workspaceConfig }`
- `GET /api/workspace/helper/receipts` → apply receipt history

## The correct flow

1. `query` with the narrowest intent that matches the ask.
2. **Review the proposals** — show them to the user or check them against
   `preflight_patch` / `find_downstream_dependencies` (this plugin's
   `governed-console` skill) before applying.
3. `apply` only accepted proposals. Never edit the proposal file to smuggle
   in changes the helper did not draft — hand-built mutations go through the
   normal PATCH lane instead.
4. Confirm via the returned `applied[]` and the receipts stream.

## Boundaries

- The PATCH allowlist (`dashboards`, `widgetTypes`, `canvas`, `dataModel`)
  is the hard ceiling — helper applies cannot exceed it.
- Credentials never enter the prompt; env-ref names only.
- `helper/apply` is operator-privileged under app scope — expect a structured
  scope violation (with `repairPlan[]`) if scoped incorrectly, and follow it.
- If the dev server is not running, only the CLI `query` lane is meaningful;
  do not fabricate an apply result.
