# Workspace Builder Runtime V1

The Workspace Builder Runtime turns the official `growthub-custom-workspace-starter-v1` shell from a static dashboard preview into a config-backed no-code surface — **without changing any of the existing UI/UX**.

The exported screenshot of `apps/workspace` is the canonical baseline. All wiring added by V1 lives behind the buttons that are already visible there:

- **Save** → `PATCH /api/workspace`
- **New Dashboard** → appends a row to `dashboards`
- **Add widget** placeholder / drag-selected cells → opens the existing widget picker for the selected grid rectangle
- **Widget type** buttons (Chart / View / iFrame / Rich Text) → add the chosen widget into the selected cells
- **Selected widget corners** → resize the placed widget across the same fixed cell lattice while rejecting overlap
- **Templates** → apply a validated dashboard layout without leaving the builder
- **Import / Export** → move dashboard configs as JSON assets
- **Widget settings** → edit the per-kind config fields that are serialized into `growthub.config.json`

No deploy panels, onboarding wizards, AI-native widget kinds, bridge data routes, save pills, or status banners are introduced.

## Source of truth

- `apps/workspace/growthub.config.json` is the local source of truth for layout and binding metadata.
- `lib/workspace-schema.js` declares the widget contracts, fixed-grid invariants, templates, static binding examples, and shared validator.
- `lib/workspace-config.js` reads and writes the config file through that shared validator.

## Schema contracts

The builder exposes these local contracts so people and agents can generate valid dashboard assets without guessing:

| Contract | Purpose |
| --- | --- |
| `WidgetBase` | Common widget envelope: `id`, `kind`, `title`, `position`, `config`. |
| `WidgetPosition` | Fixed-grid rectangle: integer `x/y/w/h`, bounded by 12 columns x 16 rows, no overlaps. |
| `ChartWidgetConfig` | Chart sample values plus optional static binding. |
| `ViewWidgetConfig` | Table source, columns, rows, layout, and static binding. |
| `IframeWidgetConfig` | URL string for a local embed placeholder. |
| `RichTextWidgetConfig` | Body text plus optional static binding metadata. |
| `DashboardConfig` | Dashboard row metadata. |
| `CanvasConfig` | Layout, tabs/widgets, active tab, and bindings. |
| `StaticDataBinding` | `manual`, `json`, or `csv` local binding metadata. |

These are code-level contracts in `lib/workspace-schema.js`, not speculative hosted API types.

Persistence uses one canonical canvas shape at a time: single-tab saves use `canvas.widgets`, while multi-tab saves use `canvas.tabs` plus `canvas.activeTabId`. A multi-tab save replaces the top-level `canvas.widgets` array so the same widget IDs cannot be serialized in both places.

## Persisted shape

```json
{
  "dashboards": [
    {
      "id": "untitled-dashboard",
      "name": "Untitled",
      "createdBy": "Workspace owner",
      "updatedAt": "new",
      "status": "draft"
    }
  ],
  "widgetTypes": [
    { "kind": "chart", "label": "Chart", "icon": "C" },
    { "kind": "view", "label": "View", "icon": "V" },
    { "kind": "iframe", "label": "iFrame", "icon": "I" },
    { "kind": "rich-text", "label": "Rich Text", "icon": "T" }
  ],
  "canvas": {
    "layout": { "columns": 12, "rowHeight": 64, "gap": 16, "responsive": true },
    "widgets": [
      {
        "id": "widget_xxx",
        "kind": "chart",
        "title": "Untitled chart",
        "position": { "x": 0, "y": 0, "w": 4, "h": 3 },
        "config": {}
      }
    ],
    "bindings": {
      "chatToCanvas": true,
      "workflowOutputsToArtifacts": true,
      "sessionContext": true,
      "configDrivenCanvas": true
    }
  }
}
```

`validateWorkspaceConfig` rejects unknown top-level fields, any widget kind outside `chart | view | iframe | rich-text`, invalid per-kind config, duplicate IDs, and overlapping positions. Widget positions must fit a 12-column × 16-row grid with non-negative integer `x/y` and `w/h ≥ 1`.

## Persistence modes

`describePersistenceMode` returns `{ mode, reason }`:

- `filesystem` — local development (or any runtime that opts in with `WORKSPACE_CONFIG_ALLOW_FS_WRITE=true`).
- `read-only` — Vercel/Netlify-style runtimes where the bundle is immutable. `PATCH /api/workspace` returns 409 with adapter guidance.

The starter ships in `read-only` mode by default. Local `next dev` runs in `filesystem` mode. A future hosted persistence adapter can replace the filesystem write without touching the UI.

## API surface

| Route | Purpose |
| --- | --- |
| `GET /api/workspace` | Returns `config`, `adapters`, `capabilities`, `settings`, `workspace`, plus the resolved `workspaceConfig` and `workspaceConfigPersistence`. Pre-existing fields are preserved. |
| `PATCH /api/workspace` | Validates and writes only `dashboards`, `widgetTypes`, and `canvas`. Unknown fields → 400. Invalid widget shape → 400. Read-only runtime → 409. |

No new API routes are added. No bridge data widgets, no chat route, no workflow runner, no artifact viewer, no deploy status route — those would all introduce UI surfaces that are not in the baseline.

## Templates

The client builder includes a small local template library:

- Blank
- Client Portal
- Content Ops
- Reporting Dashboard
- Creative Review
- Agency Delivery

Applying a template replaces the active tab widgets with validated fixed-grid widgets. Template widgets are still normal serialized widget configs; there is no hidden runtime state and no hosted dependency.

## Import / export

The builder can export the current `{ dashboards, widgetTypes, canvas }` shape as JSON and import the same shape back into the active workspace. Imports run through `validateWorkspaceConfig` before entering client state, then the normal Save path validates again on the server.

## UI composition

| File | Responsibility |
| --- | --- |
| `app/page.jsx` | Server entry. Reads adapter env, integration adapter, persistence mode. Delegates to the client builder. |
| `app/workspace-builder.jsx` | Client component. Renders the controlled builder, fixed-grid placement, templates, import/export, selected-widget editing, and Save path. |
| `lib/workspace-schema.js` | Shared schema contracts, validator, static bindings, and template definitions. |

That is the entire UI delta vs. the pre-V1 starter — a `"use client"` boundary, event handlers, fixed-cell placement, and selected-widget resize handles.

## Save semantics

Click `Save` → `fetch("/api/workspace", { method: "PATCH", body: JSON.stringify({ dashboards, widgetTypes, canvas }) })`. While the request is in flight the button is disabled and reads `Saving...`; it returns to `Save` once the response settles. On success the response payload is hydrated back into local state so subsequent reads come from the validated server output.

The button label remains `Save` in the idle state shown in the screenshot.

## V1 limitations

- No freeform pixel layout. Placement and resize snap to the 12-column x 16-row cell lattice and reject overlaps.
- No hosted data binding yet. Static JSON, CSV, and manual rows exist only as local config-backed binding examples.
- No bridge / agents / workflows / artifacts UI. Those remain in the existing `growthub bridge ...` CLI commands; introducing them here would require new UI surfaces and is out of scope for V1.
- No onboarding overlay. The starter exports unchanged from the original screenshot.

## Local E2E smoke

```bash
cd cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace
npm install
npm run dev    # filesystem mode, local persistence enabled
```

1. Confirm the rendered page matches the baseline screenshot exactly (rail, dashboards table, canvas grid with the `Add widget` placeholder, widget panel with Chart/View/iFrame/Rich Text, bindings panel showing `integrationAdapter: static`).
2. Drag across empty grid cells → the selected rectangle becomes the `Add widget` target and the right widget picker remains open.
3. Click **Chart** in the right palette → a `<article class="workspace-widget-preview">` appears in the selected rectangle showing `chart` and `Untitled chart`.
4. Drag a selected widget corner → the widget resizes by whole cells and the right panel placement values update.
5. Edit widget settings → chart values, view source/columns/rows, iframe URL, or rich-text body update the preview and serialized config.
6. Apply a template → widgets appear as non-overlapping fixed-grid rectangles.
7. Export config → a JSON dashboard asset downloads.
8. Import the exported JSON → the validator accepts it and rehydrates the builder.
9. Add or duplicate multiple tabs, apply different templates, then click **Save** → `growthub.config.json` is rewritten on disk with `canvas.tabs`.
10. Refresh → the tabs, selected template widgets, and edited widget settings reappear, proving persistence.
11. Run `node ./scripts/check-worker-kits.mjs` from the repo root → kit validation passes.

## Read-only runtime smoke

```bash
AGENCY_PORTAL_DEPLOY_TARGET=vercel npm run start
```

Click **Save** → response is HTTP 409 with `error: "workspace config is read-only in this runtime"` and guidance to set `WORKSPACE_CONFIG_ALLOW_FS_WRITE=true` or wire a hosted persistence adapter. No file is written.

## S143 boundary

V1 does not move execution into the UI. There is no chat widget, no workflow runner, no artifact viewer, no deploy panel, and no hosted-agent invocation in the workspace app. Anything beyond layout persistence stays in `gh-app` / the Growthub Bridge / the existing CLI surface.
