# Workspace Health & Agent Context V1

Official feature note for the `0.14.7` Workspace Health & Agent Context release.

This release exposes two read-only rollups that the workspace already had the
intelligence to compute, in a single agent- and operator-friendly shape:

- `GET /api/workspace/health` — one actionable health summary.
- `GET /api/workspace/agent-context` — one compact packet an agent reads to
  "understand" the workspace in a single request.

## Release Thesis

These are **not new capabilities and not a new authority lane**. They are
derived read models built on the existing Workspace Metadata Graph V1 layer
(`workspace-metadata-store.js` + `workspace-metadata-graph.js`). Writes still
flow exclusively through the governed mutation boundary
(`PATCH /api/workspace`, `POST /api/workspace/sandbox-run`,
`POST /api/workspace/workflow/publish`).

They mirror the shipped `GET /api/workspace/metadata-graph` route exactly:
GET-only, secret-free, never-throws, and falling back to an empty-baseline
envelope on any read or derivation failure.

## What 0.14.7 Adds

### Health summary — `GET /api/workspace/health`

```json
{
  "kind": "growthub-workspace-health-v1",
  "version": 1,
  "status": "healthy | degraded | unhealthy",
  "issues": [
    { "type": "stale_widget",   "severity": "warning", "widgetId": "…", "reason": "bound but no axis fields are configured" },
    { "type": "missing_source", "severity": "error",   "objectId": "…", "reason": "sidecar empty" },
    { "type": "dangling_edge",  "severity": "error",   "widgetId": "…", "reason": "binds to unknown object" }
  ],
  "metrics": { "totalWidgets": 42, "staleWidgets": 3, "danglingEdges": 0, "missingSources": 1, "… ": 0 }
}
```

Status rolls up from issue severity: any `error` → `unhealthy`; any
`warning` → `degraded`; otherwise `healthy`. Errors are always ordered before
warnings so the most actionable issue is first.

Issue classes, each derived from intelligence the metadata layer already
proves:

- `stale_widget` — a widget the metadata store flagged with a warning (bound
  but no axis fields configured). The unknown-object case is excluded here
  because it is already counted as a `dangling_edge` (never double-counted).
- `missing_source` — a live-backed object whose configured source has no
  sidecar record set (absent → error) or an empty one (`recordCount: 0` →
  warning, "refresh the source").
- `dangling_edge` — a reference that failed to resolve to a graph node: a
  widget bound to a non-existent object, backed by an absent source-record
  key, or scoped to an unregistered integration. The graph builder never
  emits orphan edges, so the dangling signal lives on the source side.
- `unhealthy_pipeline` / `untested_pipeline` — rolled up from
  `pipelineHealth` (last run failed → error; live-but-never-run → warning).

### Agent context packet — `GET /api/workspace/agent-context`

```json
{
  "kind": "growthub-workspace-agent-context-v1",
  "version": 1,
  "summary": { "name": "…", "objects": 5, "widgets": 12, "workflows": 3, "dashboards": 2, "sandboxes": 1, "sourceRecords": 4 },
  "capabilities": ["dashboards", "widgets", "data-model", "live-sources", "workflows", "integrations"],
  "health": { "status": "degraded", "issueCount": 4, "metrics": { "…": 0 } },
  "criticalState": { "staleWidgets": [], "missingSources": [], "danglingEdges": [], "unhealthyPipelines": [] },
  "entrypoints": { "dashboards": [], "workflows": [], "dataModel": "/data-model", "api": "/api/workspace", "health": "/api/workspace/health" }
}
```

The packet is the "semantic compression" that lets an agent avoid inferring
workspace state from raw files: counters, derived capability tags, the health
critical-state slice, and entrypoints into the real surfaces.

### Read surface — `WorkspaceHealthPanel.jsx`

A read-only panel ships with the kit (`app/data-model/components/WorkspaceHealthPanel.jsx`),
mirroring `WorkspaceGraphInspectorPanel` exactly: it fetches
`GET /api/workspace/health`, covers every state (loading, error, healthy
empty, degraded, unhealthy), and renders the status rollup, the issue list
(errors before warnings), and the metrics readout. Each issue carries a deep
link into the **existing** surface where it is fixed (Data Model, Builder,
Workflows), and a `Re-check` button re-fetches — so the panel is a
self-contained closed loop: check → see issues → open the fix surface →
re-check → confirm resolved. It introduces no new colors, icons, or
`globals.css` grammar and changes no shared navigation pattern. Like the graph
inspector it ships **unmounted** in V1 and is importable directly.

## Source Of Truth

| Concern | Source |
| --- | --- |
| Health derivation | `deriveWorkspaceHealth(store, graph)` in `lib/workspace-health.js` |
| Agent packet derivation | `deriveAgentContextPacket(store, graph, health, config)` in `lib/workspace-health.js` |
| Metadata store | `buildWorkspaceMetadataStore()` (`lib/workspace-metadata-store.js`) |
| Metadata graph | `buildWorkspaceMetadataGraph()` (`lib/workspace-metadata-graph.js`) |
| Authoritative artifacts | `growthub.config.json` + `growthub.source-records.json` |
| Health route | `GET /api/workspace/health` |
| Agent context route | `GET /api/workspace/agent-context` |
| Read panel | `app/data-model/components/WorkspaceHealthPanel.jsx` (read-only, ships unmounted) |

## Required Product Invariants

- GET only. No `POST` / `PATCH` / `PUT` / `DELETE` on either route.
- No new mutation lane, no new persistence layer, no new PATCH allowlist field.
- No secrets ever returned — the rollups read only already-redacted metadata
  items; no source rows, tokens, or auth material.
- Pure, deterministic derivation: inputs are never mutated and never throw on
  partial/absent/garbage input — an empty-baseline envelope is returned with
  `warnings[]` instead.
- `growthub.config.json` remains the authoritative artifact; these are derived
  read models.

## Validation Map

The feature is complete when these pass together:

- `node --test scripts/unit-workspace-health.test.mjs` (pure derivation,
  deep-frozen inputs, status rollup, stale/dangling/missing detection, secret
  safety).
- `kit-custom-workspace-starter.test.ts` →
  `workspace-health-agent-context-v1` blocks (file presence, frozen asset
  paths, GET-only route surfaces, derivation smoke).
- `node scripts/check-worker-kits.mjs` (frozen asset paths resolve).
- `node scripts/check-version-sync.mjs` and `node scripts/check-cli-package.mjs`.
- Package versions aligned at `@growthub/cli@0.14.7` and
  `@growthub/create-growthub-local@0.14.7`.
