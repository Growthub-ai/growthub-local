# Workspace Builder Runtime V1

## Product Role

The Workspace Builder Runtime is the **front-end customization plane for the governed workspace starter kit** — the official 1.0 product object of Growthub Local. A governed workspace is the top-level unit; kits, templates, workflows, agents, and source imports are inputs to a workspace, not parallel concepts.

A user installs Growthub Local, picks a source (GitHub repo, skills.sh skill, worker kit, starter), exports a governed workspace, and lands inside this builder. The builder edits validated config, the config is exportable/importable/deployable, and `.growthub-fork/` keeps the lifecycle governable.

Companion contracts:

- [`docs/WORKSPACE_CONFIG_CONTRACT_V1.md`](./WORKSPACE_CONFIG_CONTRACT_V1.md) — the canonical `growthub.config.json` shape
- [`docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md`](./GOVERNED_WORKSPACE_TOPOLOGY_V1.md) — the workspace topology + authority boundary
- [`docs/WORKSPACE_DEPLOY_FLOW.md`](./WORKSPACE_DEPLOY_FLOW.md) — how a workspace ships to production
- [`docs/WORKSPACE_BUILDER_RUNTIME_V1_1.md`](./WORKSPACE_BUILDER_RUNTIME_V1_1.md) — V1.1 Twenty-style data-view editor extensions (Source picker, Fields manager, Sort/Filter builders, Chart config, command palette, template filters). Additive editor vocabulary only — V1 envelope, allowlist, and runtime authority boundary unchanged.

---

## Behavioural baseline

The Workspace Builder Runtime turns the official `growthub-custom-workspace-starter-v1` shell from a static dashboard preview into a config-backed no-code surface. The exported screenshot of `apps/workspace` is the canonical baseline. All wiring lives behind the buttons that are already visible there:

- **Save** → `PATCH /api/workspace`
- **New Dashboard** → appends a row to `dashboards`
- **Add widget** placeholder / drag-selected cells → opens the existing widget picker for the selected grid rectangle
- **Widget type** buttons (Chart / View / iFrame / Rich Text) → add the chosen widget into the selected cells
- **Selected widget corners** → resize the placed widget across the same fixed cell lattice while rejecting overlap
- **Templates** → apply a validated dashboard layout without leaving the builder
- **Import / Export** → move dashboard configs as JSON assets
- **Widget settings** → edit the per-kind config fields that are serialized into `growthub.config.json`
- **Workspace Settings** → inspect-only admin panel: workspace name, branding, persistence mode, integration adapter, dashboard/tab/widget counts (sourced from existing `GET /api/workspace`)
- **Management** → inspect-only management panel: Workspace / API / Workflows / Integrations / Persistence state (sourced from existing `GET /api/workspace`)

V1 does **not** introduce deploy panels, onboarding wizards, AI-native widget kinds, bridge data routes, browser workflow execution, save pills, or deploy status banners. The Workspace Settings and Management panels are inspect-only — they read state that already exists in the GET payload, never call hosted endpoints, and never expose tokens.

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

`describePersistenceMode` returns the V1 persistence-adapter shape:

```ts
{
  mode: "filesystem" | "read-only" | "database",   // "database" reserved
  adapter: "filesystem" | "read-only" | "database",
  canSave: boolean,
  saveLabel: string,                               // copy for the no-code Save UI
  reason: string,
  nextAction: string | null,
  guidance: string | null                          // mirrors the 409 body
}
```

Adapter modes:

- `filesystem` — local Next.js dev or any runtime that opts in with `WORKSPACE_CONFIG_ALLOW_FS_WRITE=true`. `canSave: true`. Save writes `growthub.config.json`.
- `read-only` — Vercel / Netlify-style runtimes. `canSave: false`. `PATCH /api/workspace` returns `409` with `guidance` matching `describePersistenceMode().guidance` verbatim, so the API and the no-code UI speak the same words.
- `database` — reserved adapter slot for a future hosted persistence adapter. Not implemented in V1; the return shape is stable so adding the adapter does not change UI or API contracts.

The starter ships in `read-only` mode by default. Local `next dev` runs in `filesystem` mode. The full contract reference is `docs/WORKSPACE_CONFIG_CONTRACT_V1.md`.

## API surface

| Route | Purpose |
| --- | --- |
| `GET /api/workspace` | Returns `config`, `adapters`, `capabilities`, `settings`, `workspace`, plus the resolved `workspaceConfig` and `workspaceConfigPersistence`. Pre-existing fields are preserved. |
| `PATCH /api/workspace` | Validates and writes only `dashboards`, `widgetTypes`, `canvas`, and `dataModel`. Unknown fields → 400. Invalid shape → 400. Read-only runtime → 409. |

No new API routes are added. No bridge data widgets, no chat route, no workflow runner, no artifact viewer, no deploy status route — those would all introduce UI surfaces that are not in the baseline.

## Templates

### Template Gallery

The toolbar `Templates` button opens a modal gallery of business-ready starting layouts. The gallery renders cards for every template in `DASHBOARD_TEMPLATES`. ESC or the close button dismisses the gallery; clicking the backdrop also closes it.

Templates are local config assets shipped with the starter. There is no remote registry, no hosted fetch, and no auth requirement for browsing or applying them.

### Template Metadata

Every template entry in `lib/workspace-schema.js` carries:

| Field | Meaning |
| --- | --- |
| `id` | Stable identifier for the template. |
| `name` | Display title in the gallery and applied dashboard. |
| `description` | One-line summary. |
| `category` | Coarse grouping (`agency`, `content`, `reporting`, `creative`, `blank`, ...). |
| `bestFor` | Audience hints (e.g. `["Agencies", "Consultants"]`). |
| `tags` | Free-form tags for filter/search. |
| `preview` | `{ layout, summary }` short preview hint. |
| `dashboard` | Default dashboard row metadata when cloning (`name`, `status`). |
| `widgets` | Validated fixed-grid widget blueprints. **Template widgets intentionally omit `id`** — IDs are minted at clone time. |

`normalizeWorkspaceTemplate` returns a template with a derived `widgetCount` and safe defaults for missing optional fields.

### Apply to Current Tab

The `Apply to Current Tab` action calls `cloneTemplateToTab(template, { idFactory })`, regenerates fresh `tab` and `widget` IDs, then replaces the active tab's widgets and renames the active tab to the template name. The first dashboard row is renamed to the template name. The change marks the config dirty; **Save is not triggered automatically**.

### Clone as New Dashboard

The `Clone as New Dashboard` action calls `cloneTemplateToDashboard(template, { idFactory })` and:

1. Appends a new dashboard row with regenerated dashboard `id`, the template's default name, `status: "draft"`, and `updatedAt: "new"`.
2. Applies the cloned template tab/widgets to the active canvas/tab. **V1 limitation:** the builder does not yet maintain an independent canvas per dashboard row, so the appended row reuses the active canvas. A true per-dashboard canvas model is future work.

The change marks the config dirty; Save is not triggered automatically.

### Template Validation Rules

`validateWorkspaceTemplate(template)` enforces:

- `id` and `name` are non-empty strings
- `description`, `category`, `bestFor`, `tags`, `preview`, `dashboard` shape matches the metadata contract
- `widgets` are validated through `validateTemplateWidgetArray`, which checks `kind`, `title`, `position`, per-kind `config`, grid bounds, and overlap
- `validateTemplateWidgetArray` does **not** require `widget.id` because raw template widgets are blueprints; IDs are minted only when cloning

`cloneTemplateToTab` and `cloneTemplateToDashboard` require an `idFactory` function (the builder passes its `generateId`). The schema module never reads `globalThis.crypto` directly.

### Template Import / Export Format

Export wraps the current `{ dashboards, widgetTypes, canvas }` payload in the canonical envelope:

```json
{
  "version": 1,
  "kind": "growthub-workspace-template",
  "exportedAt": "2026-05-04T00:00:00.000Z",
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

Import accepts both shapes:

- A wrapped envelope where `kind === "growthub-workspace-template"` — `unwrapWorkspaceTemplateImport` returns `payload`.
- A raw `{ dashboards, widgetTypes, canvas }` payload — passed through unchanged for backward compatibility.

Either way, the result is validated through `validateWorkspaceConfig` before entering client state, then validated again on the server during Save. Unknown `kind` values, missing `payload`, or invalid contents are rejected with a status message.

### Non-goals

- Templates do not execute workflows.
- Templates do not bind agents.
- Templates do not fetch hosted data.
- Templates do not require Growthub Bridge auth.
- Templates do not create a remote registry or marketplace.
- Templates are local config assets.

## UI composition

| File | Responsibility |
| --- | --- |
| `app/page.jsx` | Server entry. Reads adapter env, integration adapter, persistence mode. Delegates to the client builder. |
| `app/workspace-builder.jsx` | Client component. Renders the controlled builder, fixed-grid placement, templates, import/export, selected-widget editing, and Save path. |
| `lib/workspace-schema.js` | Shared schema contracts, validator, static bindings, and template definitions. |

That is the entire UI delta vs. the pre-V1 starter — a `"use client"` boundary, event handlers, fixed-cell placement, and selected-widget resize handles.

## Save semantics

Click `Save` → `fetch("/api/workspace", { method: "PATCH", body: JSON.stringify({ dashboards, widgetTypes, canvas }) })`. Data Model edits use the same route with `dataModel` only. While the request is in flight the button is disabled and reads `Saving...`; it returns to `Save` once the response settles. On success the response payload is hydrated back into local state so subsequent reads come from the validated server output.

The button label remains `Save` in the idle state shown in the screenshot.

## Workspace Settings panel (inspect-only admin)

The Workspace Settings panel is the no-code admin surface inside the existing builder shell. It is **inspect-only** — every field is sourced from data already on `GET /api/workspace` and the in-memory client state. There are no new API routes, no hosted calls, no token exposure, no execution.

It surfaces:

- **Identity** — workspace `name`, optional `branding.logoUrl`, `branding.name`, `branding.accent` from `growthub.config.json`.
- **Persistence** — `mode`, `adapter`, `canSave`, `saveLabel`, `reason`, `nextAction`, `guidance` from `describePersistenceMode()`.
- **Integrations** — `integrationAdapter` (`static | growthub-bridge | byo-api-key`), `deployTarget`, and the bridge access token presence boolean from `readAdapterConfig()`.
- **Counts** — dashboards / tabs / widgets in the active config. The Save / Read-only state mirrors the persistence adapter — read-only runtimes show the same `guidance` string the 409 returns.

The optional `branding` object is preserved through the workspace-config round-trip but is **not** in the PATCH allowlist. Operators set branding by editing `growthub.config.json` inside the governed fork.

## Management panel (inspect-only)

The Management panel reads the same `GET /api/workspace` payload and renders five sections:

- **Workspace** — id, name, capabilities.
- **API** — `PATCH /api/workspace` allowlist (`dashboards | widgetTypes | canvas | dataModel`), known error codes, persistence-derived `canSave`.
- **Workflows** — list of workflows declared in `growthub.config.json#pipelines`. V1 ships empty. Hosted execution from the browser is **not** introduced.
- **Integrations** — adapter-derived state: integration adapter, deploy target, bridge presence.
- **Persistence** — mirror of the persistence-adapter shape.

The panel never executes a workflow, never lists hosted agents, never calls Growthub Bridge from the browser. Future-action hints (e.g. "Connect Growthub Bridge", "Configure persistence adapter") are docs-only references to the existing CLI commands.

## V1 limitations

- No freeform pixel layout. Placement and resize snap to the 12-column x 16-row cell lattice and reject overlaps.
- No hosted data binding yet. Static JSON, CSV, and manual rows exist only as local config-backed binding examples.
- No bridge / agents / workflows / artifacts execution UI. Those remain in the existing `growthub bridge ...` and `growthub workflow` CLI commands. The Management panel is inspect-only.
- No onboarding overlay. The starter exports the same baseline screenshot.
- The `branding` object is preserved round-trip but is not editable through PATCH; it is operator-edited inside the governed fork.

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
