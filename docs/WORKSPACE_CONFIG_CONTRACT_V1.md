# Workspace Config Contract V1

`growthub.config.json` is the canonical local state file for the `growthub-custom-workspace-starter-v1`. This document is the official V1 spec for every field it accepts.

The validator `validateWorkspaceConfig` in `lib/workspace-schema.js` is the executable form of this contract. Any config that passes the validator is accepted by `PATCH /api/workspace`. Any config that fails is rejected with HTTP 400 + `details[]`.

---

## Top-level shape

```json
{
  "dashboards":  [ /* DashboardConfig[] */ ],
  "widgetTypes": [ /* WidgetTypeDescriptor[] */ ],
  "canvas":      { /* CanvasConfig */ }
}
```

**PATCH allowlist:** only `dashboards`, `widgetTypes`, and `canvas` are accepted. Unknown top-level fields are rejected with 400.

Non-PATCH fields (`id`, `name`, `description`, `capabilities`, `pipelines`, `integrations`, `provenance`) are config metadata preserved across reads but not accepted in PATCH payloads.

---

## DashboardConfig

```json
{
  "id":          "non-empty string — stable identifier",
  "name":        "non-empty string — display title",
  "createdBy":   "string — owner label",
  "updatedAt":   "string — ISO date (YYYY-MM-DD) or 'new'",
  "status":      "draft | active | archived",
  "tabs":        [ /* Tab[] — optional, per-dashboard tab array */ ],
  "activeTabId": "string — optional, must match a tab id in this dashboard's tabs"
}
```

- `tabs` and `activeTabId` on a dashboard row are per-dashboard overrides. When present they define the dashboard's own canvas layout independent of the top-level `canvas` object.
- Duplicate dashboard `id` values within the `dashboards` array are rejected.

---

## WidgetTypeDescriptor

```json
{
  "kind":  "chart | view | iframe | rich-text",
  "label": "string — display label",
  "icon":  "string — single character or short code"
}
```

This array controls what appears in the widget picker. The default set ships four kinds. Additional kinds are not supported in V1.

---

## CanvasConfig

```json
{
  "layout": {
    "columns":   12,
    "rowHeight":  64,
    "gap":        16,
    "responsive": true
  },
  "widgets":     [ /* WidgetBase[] — single-tab mode */ ],
  "tabs":        [ /* Tab[] — multi-tab mode */ ],
  "activeTabId": "string — optional, must match a tab id in canvas.tabs",
  "bindings":    { /* feature-flag map */ },
  "branding":    { /* BrandingConfig — optional */ }
}
```

### Canvas shape rule

**Single-tab:** `canvas.widgets` holds the widget array. `canvas.tabs` is absent.

**Multi-tab:** `canvas.tabs` holds `Tab[]`. `canvas.widgets` is absent.

A PATCH that includes `canvas.tabs` will remove `canvas.widgets` from the persisted output, and vice versa. The same widget IDs cannot exist in both shapes simultaneously.

### BrandingConfig (optional)

```json
{
  "name":    "string — workspace display name override",
  "logoUrl": "string — URL or relative path to logo image",
  "accent":  "string — CSS colour token (e.g. '#38bdf8')"
}
```

All subfields are optional. `branding` itself is optional. When present it is validated and merged with the existing branding object on PATCH.

---

## Tab

```json
{
  "id":      "non-empty string — stable identifier (unique within canvas or dashboard)",
  "name":    "non-empty string — display label",
  "widgets": [ /* WidgetBase[] */ ]
}
```

- Duplicate tab `id` values within the same tab array are rejected.
- An empty `widgets` array is valid.

---

## WidgetBase

```json
{
  "id":       "non-empty string — stable identifier",
  "kind":     "chart | view | iframe | rich-text",
  "title":    "non-empty string",
  "position": { /* WidgetPosition */ },
  "config":   { /* kind-specific config — see below */ }
}
```

- Duplicate widget `id` values within the same tab are rejected.
- Widget IDs across different tabs of the same canvas are also required to be unique.

---

## WidgetPosition

```json
{
  "x": "integer >= 0",
  "y": "integer >= 0",
  "w": "integer >= 1",
  "h": "integer >= 1"
}
```

**Grid invariants:**

- `x + w <= 12` (12-column grid)
- `y + h <= 16` (16-row grid)
- No two widgets in the same tab may share a grid cell

---

## Widget configs

### ChartWidgetConfig

```json
{
  "values":  [ /* number[] — chart bar/point values */ ],
  "binding": { /* StaticDataBinding — optional */ }
}
```

### ViewWidgetConfig

```json
{
  "source":  "string — data source label",
  "layout":  "Table",
  "columns": [ "string[]" ],
  "rows":    [ /* record[] — array of objects keyed by column names */ ],
  "binding": { /* StaticDataBinding — optional */ }
}
```

`layout` must be `"Table"` in V1.

### IframeWidgetConfig

```json
{
  "url": "string — full URL for embedded content"
}
```

An empty string `""` is valid (used as a placeholder until the user enters a URL).

### RichTextWidgetConfig

```json
{
  "text":    "string — body text content",
  "binding": { /* StaticDataBinding — optional */ }
}
```

---

## StaticDataBinding

```json
{
  "mode":   "manual | json | csv",
  "source": "string — human-readable source label",
  "rows":   [ /* record[] — used when mode is 'manual' */ ],
  "json":   "string — JSON string used when mode is 'json'",
  "csv":    "string — CSV string used when mode is 'csv'"
}
```

Static bindings are local config-backed metadata. They do not fetch from remote sources in V1.

---

## Template envelope (import/export)

Export wraps the current `{ dashboards, widgetTypes, canvas }` payload in this envelope:

```json
{
  "version":    1,
  "kind":       "growthub-workspace-template",
  "exportedAt": "2026-05-05T00:00:00.000Z",
  "source":     "growthub-custom-workspace-starter-v1",
  "name":       "string",
  "description": "string",
  "payload": {
    "dashboards":  [],
    "widgetTypes": [],
    "canvas":      {}
  }
}
```

Import accepts:

1. A wrapped envelope where `kind === "growthub-workspace-template"` — `unwrapWorkspaceTemplateImport` returns `payload`.
2. A raw `{ dashboards, widgetTypes, canvas }` payload — passed through unchanged for backward compat.

Both paths are validated through `validateWorkspaceConfig` before entering client state, and again server-side on Save.

---

## Validation error shape

When `validateWorkspaceConfig` fails, it throws:

```json
{
  "code":    "INVALID_WORKSPACE_CONFIG",
  "message": "invalid workspace config: <errors joined by '; '>",
  "details": [ "human-readable error string", "..." ]
}
```

`PATCH /api/workspace` surfaces this as:

```json
HTTP 400
{
  "error":   "invalid workspace config: ...",
  "details": [ "..." ]
}
```

---

## Persistence modes

`describePersistenceMode()` in `lib/workspace-config.js` returns:

| mode | canSave | when |
|------|---------|------|
| `filesystem` | `true` | local `next dev`, or `WORKSPACE_CONFIG_ALLOW_FS_WRITE=true` |
| `read-only` | `false` | Vercel/Netlify deploy target (default) |

`GET /api/workspace` exposes this as `workspaceConfigPersistence: { mode, reason, canSave }`.

`PATCH /api/workspace` on a `read-only` runtime returns:

```json
HTTP 409
{
  "error":    "workspace config is read-only in this runtime",
  "reason":   "...",
  "adapter":  "static | growthub-bridge | byo-api-key",
  "guidance": "Edit growthub.config.json locally, or set WORKSPACE_CONFIG_ALLOW_FS_WRITE=true on a writable runtime."
}
```

---

## What is NOT in scope for V1

- Remote data fetching from widget configs
- Bridge-backed or workflow-executed widgets
- Database persistence (seam exists via `AGENCY_PORTAL_DATA_ADAPTER`; no UI yet)
- Hosted execution from the browser
- Speculative SDK types from `@growthub/api-contract`

This contract is local-only. The `@growthub/api-contract` package is not required or imported by the workspace app.
