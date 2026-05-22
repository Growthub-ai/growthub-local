# Workspace Config Contract V1

The official local contract for `growthub.config.json` shipped by every governed workspace exported from `growthub-custom-workspace-starter-v1`. This is the source of truth for the no-code workspace builder, the `/api/workspace` route, and any agent that reads or generates workspace configuration.

This contract is local to the starter kit. It is **not** promoted to `@growthub/api-contract`. Promotion happens later, and only after the local contract is validated end-to-end.

---

## Files that own this contract

| File | Role |
| --- | --- |
| `apps/workspace/lib/workspace-schema.js` | Validator + template envelope + grid invariants. Source of truth. |
| `apps/workspace/lib/workspace-config.js` | Filesystem read/write, persistence-mode adapter, write guard. |
| `apps/workspace/app/api/workspace/route.js` | `GET` + `PATCH` boundary; PATCH allowlist enforcement. |
| `apps/workspace/growthub.config.json` | Persisted workspace config (the V1 reference instance). |

---

## Top-level structure

```jsonc
{
  "id": "workspace-builder-default",
  "name": "Workspace Builder",
  "description": "...",
  "branding": { "logoUrl": "", "name": "Growthub Workspace", "accent": "#3f68ff" },
  "capabilities": ["dashboards", "canvas", "widgets", "bindings", "integrations", "settings"],
  "pipelines": [],
  "integrations": [],
  "dashboards": [ /* DashboardConfig[] */ ],
  "widgetTypes":  [ /* { kind, label, icon } */ ],
  "dataModel": { "objects": [ /* DataModelObject[] */ ] },
  "canvas": { /* CanvasConfig */ },
  "provenance": { /* free-form metadata */ }
}
```

`dashboards`, `widgetTypes`, `canvas`, and `dataModel` are **the only fields the validator inspects** and the only fields the API can mutate. Everything else is preserved through the round-trip but never validated and never accepted on `PATCH`.

---

## PATCH allowlist (immutable)

`PATCH /api/workspace` accepts **only** these top-level keys:

```
dashboards
widgetTypes
canvas
dataModel
```

Any other key returns:

```http
HTTP/1.1 400 Bad Request
{ "error": "patch contains unknown fields", "details": ["..."], "allowed": ["dashboards","widgetTypes","canvas","dataModel"] }
```

This rule is enforced in `apps/workspace/app/api/workspace/route.js` and is part of the V1 contract. `dataModel` is included because it is a governed local object surface; new presentation or identity concepts (e.g. `branding`) are **not** added to PATCH and are persisted by editing `growthub.config.json` directly inside the governed fork.

## DataModelObject

`dataModel.objects[]` stores manual business objects that can later be selected by a View widget. Creating or editing one does not create a dashboard widget and does not mutate `canvas`.

```ts
{
  id: string,
  label: string,
  source?: string,
  columns: string[],
  rows: Record<string, unknown>[],
  binding?: { mode: "manual", source?: string },
  fieldSettings?: { hidden?: string[], order?: string[] }
}
```

A View widget may reference one at user discretion:

```ts
widget.config.binding = {
  mode: "manual",
  sourceType: "workspace-data-model",
  sourceAuthority: "workspace-config",
  objectId: string,
  source: string
}
```

The reference is widget-local. Object rows and fields remain owned by `dataModel.objects[]`.

---

## DashboardConfig

```ts
{
  id: string,                                  // non-empty, unique within dashboards[]
  name: string,                                // non-empty
  createdBy?: string,
  updatedAt?: string,                          // ISO date or "new"
  status?: "draft" | "active" | "archived",
  tabs?: TabConfig[],                          // optional per-dashboard tab list
  activeTabId?: string                         // must match a tabs[].id when present
}
```

Dashboard `id` duplicates are rejected. `activeTabId`, when present, must resolve.

---

## CanvasConfig

`canvas` carries the active editing surface. **Single-tab and multi-tab are mutually exclusive — never both at once.**

```ts
{
  layout: { columns: 12, rowHeight: number, gap: number, responsive: boolean },
  // single-tab:
  widgets?: WidgetBase[],
  // multi-tab:
  tabs?: TabConfig[],
  activeTabId?: string,
  bindings?: { [key: string]: boolean | string }
}
```

`canvas.layout.columns` is locked at `12`. The validator rejects any other value.

`apps/workspace/lib/workspace-config.js#applyPatch` strips the dormant shape during PATCH to guarantee mutual exclusion: a multi-tab patch removes `canvas.widgets`; a single-tab patch removes `canvas.tabs` + `canvas.activeTabId`.

---

## TabConfig

```ts
{
  id: string,                                  // non-empty, unique within tabs[]
  name: string,                                // non-empty
  widgets: WidgetBase[]
}
```

---

## WidgetBase

```ts
{
  id: string,                                  // non-empty, unique across the entire canvas
  kind: "chart" | "view" | "iframe" | "rich-text",
  title: string,                               // non-empty
  position: WidgetPosition,
  config: ChartWidgetConfig | ViewWidgetConfig | IframeWidgetConfig | RichTextWidgetConfig
}
```

Widget `id` uniqueness is checked across single-tab `canvas.widgets[]` AND every `canvas.tabs[*].widgets[]` together — the same id cannot exist twice in the same canvas.

---

## WidgetPosition

```ts
{ x: integer >= 0, y: integer >= 0, w: integer >= 1, h: integer >= 1 }
```

Invariants enforced by `validateWidgetArray`:

- `x + w <= 12`
- `y + h <= 16`
- No two widgets may occupy the same grid cell within the same canvas/tab

Off-grid placements and overlaps return `400` with `details[]` naming the offending widget.

---

## Widget config shapes

```ts
ChartWidgetConfig = {
  values?: number[],                           // finite numbers only — precomputed projection
  chartType?: "bar-vertical" | "bar-horizontal" | "line" | "pie" | "sum" | "gauge",
  xAxis?: ChartAxisConfig,
  yAxis?: ChartAxisConfig,
  style?: ChartStyleConfig,
  filter?: FilterConfig,
  binding?: StaticDataBinding
}

ViewWidgetConfig = {
  source?: string,
  layout?: "Table",                            // "Table" only at V1
  columns?: string[],
  rows?: Record<string, unknown>[],
  binding?: StaticDataBinding
}

IframeWidgetConfig = {
  url?: string
}

RichTextWidgetConfig = {
  text?: string,
  binding?: StaticDataBinding
}
```

---

## StaticDataBinding

```ts
{
  mode: "manual" | "json" | "csv",
  source?: string,
  rows?: Record<string, unknown>[],
  json?: string,
  csv?: string
}
```

V1 ships `static` bindings only. Bridge-backed bindings are documented in `docs/BRIDGE_BACKED_WIDGETS_V1_PLAN.md` and are explicitly out of scope for V1.

---

## Chart value projection rule

`ChartWidgetConfig.values` is the **persisted computed projection** the chart renderer reads. It is never the raw row set.

- **Rows** live in Data Model objects (`dataModel.objects[*].rows`), in widget bindings (`StaticDataBinding.rows` / `json` / `csv`), or in the `growthub.source-records.json` sidecar (live-backed objects).
- **Values** are computed from those rows by `apps/workspace/lib/workspace-chart-values.js#computeChartValuesFromRows` and written back into `widget.config.values` as a finite `number[]`.
- Widgets **must not** mirror full source rows into chart config. The renderer queries no rows at render time — it reads `config.values` directly.
- Bindings tie a chart to its source. The `binding.sourceType === "workspace-data-model"` shape (with `objectId`) is the reference; the computation is a one-way row → values projection persisted on Save.
- Chart computation is **inspectable** — the Chart Hydration Inspector surfaces source preview, filter survival, per-bucket aggregation, dropped-row reasons, final values, and warnings. The inspector is a diagnostic overlay over the same pure computation the renderer reads from; it is not a parallel runtime.
- Refresh **recomputes** values but **persistence requires Save**. After a sidecar refresh, recomputed values live in local builder state only; the Chart panel marks the widget `Unsaved` until the user saves through `PATCH /api/workspace`. The contract never claims persistence when only local React state changed.

`workspaceSourceRecords` is exposed on `GET /api/workspace` for runtime hydration only. It is **not** in the PATCH allowlist and is **not** persisted into `growthub.config.json`.

---

## Import/export envelope

Export format produced by the no-code builder and accepted by the import path:

```jsonc
{
  "version": 1,
  "kind": "growthub-workspace-template",
  "exportedAt": "2026-05-05T00:00:00.000Z",
  "source": "growthub-custom-workspace-starter-v1",
  "name": "Client Portal",
  "description": "",
  "payload": {
    "dashboards": [],
    "widgetTypes": [],
    "canvas": {}
  }
}
```

Both shapes are accepted on import:

- Wrapped envelope where `kind === "growthub-workspace-template"` — `unwrapWorkspaceTemplateImport` returns `payload`.
- Raw `{ dashboards, widgetTypes, canvas }` — passed through unchanged for back-compat.

The unwrapped payload is validated through `validateWorkspaceConfig` before entering client state, then validated again on the server during Save.

> **Branding is fork-local, not template-portable.** Templates carry layout — dashboards, widgetTypes, canvas — and nothing else. The optional `branding` block (`name`, `logoUrl`, `accent`) is intentionally **not** included in the export envelope and is **not** restored by import. Branding lives in the destination Workspace's own `growthub.config.json`; if you import a template into a branded Workspace, the branding stays untouched.

---

## Persistence adapter modes

`describePersistenceMode()` (in `apps/workspace/lib/workspace-config.js`) returns:

```ts
{
  mode: "filesystem" | "read-only" | "database",  // "database" reserved
  adapter: "filesystem" | "read-only" | "database",
  canSave: boolean,
  saveLabel: string,
  reason: string,
  nextAction: string | null,
  guidance: string | null
}
```

Read-only runtime returns the guidance verbatim on the `409` body, so the UI and the API surface speak the same words. Filesystem runtime returns `nextAction = null` and `guidance = null`.

V1 ships `filesystem` and `read-only`. The `database` slot is reserved for a future hosted persistence adapter; the return shape is stable so adding the adapter does not change UI or API contracts.

---

## Validation contract

`validateWorkspaceConfig(payload)` throws:

```ts
Error & { code: "INVALID_WORKSPACE_CONFIG", details: string[] }
```

The thrown details array is human-readable enough for the no-code Save UI to render them and for an agent to round-trip them as a structured error.

`validateWorkspaceTemplate(template)` throws the analogous `INVALID_WORKSPACE_TEMPLATE`.

---

## Out of scope for V1

- Hosted persistence (database adapter)
- Bridge-backed widget bindings
- Workflow execution from the browser
- Agent chat in the workspace
- Artifact viewers
- New widget kinds beyond `chart | view | iframe | rich-text`
- Free-form pixel layout (V1 is fixed-grid only)

These are intentionally deferred. The V1 contract is the substrate they will additively extend.
