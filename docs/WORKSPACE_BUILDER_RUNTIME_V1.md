# Workspace Builder Runtime V1

The Workspace Builder Runtime turns the official `growthub-custom-workspace-starter-v1` shell from a static dashboard preview into a config-backed no-code surface — **without changing any of the existing UI/UX**.

The exported screenshot of `apps/workspace` is the canonical baseline. All wiring added by V1 lives behind the buttons that are already visible there:

- **Save** → `PATCH /api/workspace`
- **New Dashboard** → appends a row to `dashboards`
- **Add widget** placeholder → adds a `chart` widget at the next free slot
- **Widget type** buttons (Chart / View / iFrame / Rich Text) → add the chosen widget at the next free slot

No new tabs, panels, overlays, drag handles, remove buttons, save pills, deploy panels, onboarding wizards, AI-native widget kinds, or status banners are introduced. The DOM produced for the empty state is byte-identical to the pre-V1 starter.

## Source of truth

- `apps/workspace/growthub.config.json` is the local source of truth for layout and binding metadata. Same shape as before V1 — four widget kinds, no onboarding key.
- `lib/workspace-config.js` reads, validates, and writes that file.

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

`validateWorkspaceConfig` rejects unknown top-level fields and any widget kind outside `chart | view | iframe | rich-text`. Widget positions must fit a 12-column × 16-row grid with non-negative integer `x/y` and `w/h ≥ 1`.

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

## UI composition

| File | Responsibility |
| --- | --- |
| `app/page.jsx` | Server entry. Reads adapter env, integration adapter, persistence mode. Delegates to the client builder. |
| `app/workspace-builder.jsx` | Client component. Renders the **identical** original DOM as a controlled `useState`. Wires `onClick` for Save, New Dashboard, Add widget placeholder, and widget-type palette buttons. |

That is the entire UI delta vs. the pre-V1 starter — a `"use client"` boundary and event handlers. The CSS file (`app/globals.css`) is byte-identical to the baseline.

## Save semantics

Click `Save` → `fetch("/api/workspace", { method: "PATCH", body: JSON.stringify({ dashboards, widgetTypes, canvas }) })`. While the request is in flight the button is disabled and reads `Saving...`; it returns to `Save` once the response settles. On success the response payload is hydrated back into local state so subsequent reads come from the validated server output.

The button label remains `Save` in the idle state shown in the screenshot.

## V1 limitations

- No drag/resize. Widget positions persist whatever `findFreePosition` chose at insert time. To move a widget, edit `growthub.config.json` and refresh.
- No remove control. To remove a widget, edit `growthub.config.json`.
- No bridge / agents / workflows / artifacts UI. Those remain in the existing `growthub bridge ...` CLI commands; introducing them here would require new UI surfaces and is out of scope for V1.
- No onboarding overlay. The starter exports unchanged from the original screenshot.

## Local E2E smoke

```bash
cd cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace
npm install
npm run dev    # filesystem mode, local persistence enabled
```

1. Confirm the rendered page matches the baseline screenshot exactly (rail, dashboards table, canvas grid with the `Add widget` placeholder, widget panel with Chart/View/iFrame/Rich Text, bindings panel showing `integrationAdapter: static`).
2. Click **Chart** in the right palette → a `<article class="workspace-widget-preview">` appears in the grid showing `chart` and `Untitled chart`.
3. Click **Save** → `growthub.config.json` is rewritten on disk; `canvas.widgets` now contains the new entry.
4. Refresh → the widget reappears, proving persistence.
5. Run `node ./scripts/check-worker-kits.mjs` from the repo root → kit validation passes.

## Read-only runtime smoke

```bash
AGENCY_PORTAL_DEPLOY_TARGET=vercel npm run start
```

Click **Save** → response is HTTP 409 with `error: "workspace config is read-only in this runtime"` and guidance to set `WORKSPACE_CONFIG_ALLOW_FS_WRITE=true` or wire a hosted persistence adapter. No file is written.

## S143 boundary

V1 does not move execution into the UI. There is no chat widget, no workflow runner, no artifact viewer, no deploy panel, and no hosted-agent invocation in the workspace app. Anything beyond layout persistence stays in `gh-app` / the Growthub Bridge / the existing CLI surface.
