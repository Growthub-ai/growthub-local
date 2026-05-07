# Workspace Builder Runtime V1.1 — Twenty-style Data View Extensions

## What V1.1 is — and what it explicitly is not

V1.1 is **editor/widget-config vocabulary expansion** on top of the shipped V1 governed workspace builder. It adds Twenty-style data-view affordances (Source picker, Fields manager, Sort/Filter builders, Chart-type tabs + axis configuration, command palette, template filtering) without touching the workspace envelope, the PATCH allowlist, the runtime authority boundary, or the canvas overlap/identity invariants from V1.

V1.1 is **not**:

- a workspace schema rewrite or version bump
- a `growthub.config.json` envelope migration
- a `/api/workspace` PATCH allowlist change
- an execution model change (browser still does not execute integrations)
- a token-storage change (provider tokens stay outside the workspace app)
- a top-level navigation change (Builder/Widgets remain inside Dashboards)
- a tab/template/dashboard naming change (V1's identity invariants still hold)
- a chart-library dependency

Companion contracts (unchanged):

- [`docs/WORKSPACE_BUILDER_RUNTIME_V1.md`](./WORKSPACE_BUILDER_RUNTIME_V1.md) — V1 baseline (still authoritative)
- [`docs/WORKSPACE_CONFIG_CONTRACT_V1.md`](./WORKSPACE_CONFIG_CONTRACT_V1.md) — canonical envelope (unchanged)
- [`docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md`](./GOVERNED_WORKSPACE_TOPOLOGY_V1.md) — topology + authority boundary (unchanged)

---

## Compatibility rules

Legacy widget configs **must keep loading**. The V1.1 validator additions are opt-in:

| V1 shape (must still load) | V1.1 additive vocabulary (optional, all under `widget.config`) |
| --- | --- |
| `view.config.source: string` | unchanged (no rewrite to object) |
| `view.config.columns: string[]` | unchanged (no rewrite to object[]) |
| `view.config.rows: record[]` | unchanged |
| `chart.config.values: number[]` | unchanged (still rendered as legacy bar) |
| `binding.mode: "manual" \| "json" \| "csv"` | adds `"integration"` mode |
| — | `view.config.fieldSettings: { hidden: string[], order: string[] }` |
| — | `view.config.sort: Array<{ fieldId, direction: "asc" \| "desc" }>` |
| — | `view.config.filter: { op: "and" \| "or", clauses: Array<{ fieldId, operator, value }> }` |
| — | `chart.config.chartType: "bar-vertical" \| "bar-horizontal" \| "line" \| "pie" \| "sum" \| "gauge"` (default `bar-vertical` when missing) |
| — | `chart.config.xAxis: { field?, sort?, omitZero? }` |
| — | `chart.config.yAxis: { aggregation?, field?, groupBy?, min?, max? }` |
| — | `chart.config.style: { colors?, axisName?, dataLabels? }` |
| — | `chart.config.filter: FilterConfig` |
| — | `binding.integrationId: string` (when `mode === "integration"`) |
| — | `binding.lane: "data-source" \| "workspace-integration"` |
| — | `binding.entityId: string` — stable provider entity ID (never a token) |
| — | `binding.entityType: string` — canonical type (`account`, `property`, `store`, etc.) |
| — | `binding.entityLabel: string` — display-only resolved label, refreshable |

**Filter operators** (`KNOWN_FILTER_OPERATORS`): `eq`, `ne`, `contains`, `gt`, `lt`, `isEmpty`, `isNotEmpty`.
**Aggregations** (`KNOWN_AGGREGATIONS`): `sum`, `avg`, `count`, `min`, `max`.
**Filter conjunctions** (`KNOWN_FILTER_CONJUNCTIONS`): `and`, `or`.
**Sort directions** (`KNOWN_SORT_DIRECTIONS`): `asc`, `desc`.
**Chart kinds** (`KNOWN_CHART_TYPES`): listed above.

The validator (`lib/workspace-schema.js`) accepts each new field only when it conforms to the shape, but never *requires* it. Existing dashboards continue to validate without any migration.

---

## Inspector sub-page model

The right widget panel keeps a single root view per widget kind plus four navigable sub-pages:

```
inspectorPath ∈ { "root", "source", "fields", "sort", "filter" }
```

`SUB_PANEL_ROOT === "root"`. The path resets to `root` whenever a different widget is selected. Navigation is:

- Root inspector renders a `workspace-settings-list` of clickable rows (`Source`, `Fields`, `Filter`, `Sort`) for `view` widgets, and a `ChartConfigPanel` for `chart` widgets.
- Each sub-page is a full-panel replacement with `<SubPanelHeader title breadcrumb onBack />` at the top.
- The bindings footer (`canvas.bindings`) is hidden while a sub-page is active.
- Command palette can navigate directly to any sub-page (`Open widget source`, `Open widget fields`, etc.).

**Source picker** (`SourceSubPanel`) reads `governedWorkspaceIntegrationCatalog` from `lib/domain/integrations`. Selecting an integration writes a binding **reference only**:

```js
binding: { mode: "integration", source: "Google Sheets", integrationId: "google-sheets-blended-data", lane: "data-source" }
```

The browser never queries the integration. Static rows remain available; selecting them resets the binding to the static catalog defaults.

**Entity selector** (`EntitySelector`) appears below the selected integration in `SourceSubPanel`. It fetches `NormalizedIntegrationEntity[]` from the server via `GET /api/workspace/integration-entities?integrationId=<id>` — never directly from the provider. Selecting an entity atomically writes two things to `widget.config`:

1. Entity reference into `binding`:
```js
binding: { mode: "integration", source: "Meta Facebook and Instagram", integrationId: "meta-ads",
           lane: "data-source", entityId: "57497690", entityType: "account", entityLabel: "Dr. Robert Whitfield" }
```
2. Canonical filter clause into `filter`:
```js
filter: { op: "and", clauses: [{ fieldId: "accountId", operator: "eq", value: "57497690" }] }
```

Only `entityId` is authoritative. `entityLabel` is display-only and refreshable. The filter clause stores the stable ID so execution engines can use it without the browser. Full contract: [`docs/BRIDGE_BACKED_WIDGETS_V1_PLAN.md`](./BRIDGE_BACKED_WIDGETS_V1_PLAN.md).

**Fields manager** (`FieldsSubPanel`) renders `view.config.columns` as drag-orderable rows with up/down + hide + remove + add. Hidden state lives in `fieldSettings.hidden`; reorder lives in `fieldSettings.order`. The visible-column list returned by `getVisibleColumns(widget)` drives `WidgetPreview`.

**Sort builder** (`SortSubPanel`) edits `view.config.sort` as `[{ fieldId, direction }]`. Field choices come from `view.config.columns`.

**Filter builder** (`FilterSubPanel`) edits `view.config.filter` as `{ op, clauses: [{ fieldId, operator, value }] }`. The `isEmpty` / `isNotEmpty` operators omit the value input.

Sort + filter metadata persist with the widget. They do **not** trigger live integration queries.

---

## Chart configuration

`ChartConfigPanel` renders inline at the chart inspector root:

- **Chart type tabs** (`workspace-chart-type-tabs`) — six kinds, defaulting to `bar-vertical` when `chartType` is missing.
- **Source / Filter** rows that navigate into the same `source` / `filter` sub-pages used by view widgets.
- **X axis** — `field`, `sort` (asc / desc / position), `omitZero` toggle.
- **Y axis** — `aggregation` (sum/avg/count/min/max), `field`, `groupBy`, `min`, `max`.
- **Style** — `colors` (auto/accent/manual), `axisName`, `dataLabels` toggle.

`WidgetPreview` switches on `chartType`:

| `chartType` | Preview rendering |
| --- | --- |
| `bar-vertical` (default + legacy) | existing CSS-rendered vertical bars |
| `bar-horizontal` | new CSS rows |
| `line` | CSS placeholder (single sweep + gradient) |
| `pie` | CSS conic-gradient placeholder |
| `sum` | `Σ values` rendered as a single number |
| `gauge` | half-circle CSS gauge driven by the last value |

No chart library is added. Pie/line are intentional CSS approximations until a renderer is selected; they degrade gracefully.

---

## Command palette

`CommandPalette` is mounted at the builder root, opened by `⌘K` / `Ctrl+K` or `/` (when no input/textarea is focused), closed by `Esc` or backdrop. Catalog covers existing handlers only:

- **Dashboard** — Create / Duplicate / Delete / Export / Import / Open template gallery
- **Tab** — New / Duplicate
- **Widget** — Duplicate / Remove / Open Source / Open Fields / Open Sorts / Open Filter (last four navigate `inspectorPath`)
- **Workspace** — Save, Go to Workspace Settings, Go to Management
- **Navigation** — Go to Dashboards, Go to Integrations

Commands marked `disabled: true` render greyed-out and refuse to fire. There is no "Ask AI" or "Compose Email" command in this slice — those imply hosted execution surfaces explicitly excluded from V1.1.

---

## Template gallery filtering

`TemplateGallery` accepts an optional `filter = { category, tag, query }` plus `onFilterChange` callback. Categories and tags are derived from each template's existing `category` / `tags` metadata (`DASHBOARD_TEMPLATES` already carries these). Filtering is purely client-side. Old templates without explicit `category` or `tags` still render — they just don't match those filters.

Applying a template still preserves identity invariants from V1: dashboard names are not renamed by templates, tab names are not synced upward, and `cloneTemplateAsDashboard` mints fresh ids via `generateId`.

---

## Persistence

`/api/workspace` PATCH allowlist remains **`["dashboards", "widgetTypes", "canvas"]`** — unchanged from V1. All new V1.1 state nests under `widget.config`, so it persists through the existing route without any contract change. Dashboards exported with V1.1 metadata still import into V1 builds: V1 simply ignores the unknown fields (the V1 validator accepts unknown keys *inside* `widget.config` and rejects only unknown *top-level* fields).

---

## Files touched in V1.1

| File | Role |
| --- | --- |
| `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-schema.js` | Adds `KNOWN_CHART_TYPES`, `KNOWN_FILTER_OPERATORS`, `KNOWN_FILTER_CONJUNCTIONS`, `KNOWN_SORT_DIRECTIONS`, `KNOWN_AGGREGATIONS`; extends `KNOWN_DATA_BINDING_MODES` with `"integration"`; adds `validateFieldSettings`, `validateSortClauses`, `validateFilterClauses`, `validateChartAxis`, `validateChartStyle`. Also adds `KNOWN_ENTITY_TYPES`, `ENTITY_TYPE_FIELD_MAP`, `buildEntityFilterClause`, entity field validation in `validateStaticDataBinding`, and `NormalizedIntegrationEntity` shape in `WIDGET_SCHEMA_CONTRACTS`. All additions optional. |
| `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/domain/integrations.js` | Adds `SAMPLE_ENTITIES_BY_PROVIDER` (demo entity catalog keyed by provider) and `getEntityMetadataForIntegration(integrationId)` helper. |
| `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/integrations/index.js` | Adds `listEntityMetadataForIntegration(integrationId)` — server-side entity resolution with bridge fallback to sample data. |
| `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/api/workspace/integration-entities/route.js` | New route: `GET /api/workspace/integration-entities?integrationId=<id>` returns `NormalizedIntegrationEntity[]`. Server-side only — no tokens reach the browser. |
| `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/workspace-builder.jsx` | Adds `EntityBadge` and `EntitySelector` components; updates `SourceSubPanel` with entity fetch + `selectEntity` callback that atomically writes `binding.entityId` + filter clause; updates `summarizeSource` to show entity label. |
| `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/globals.css` | Adds the V1.1 class families listed below, plus entity binding classes: `.workspace-entity-selector`, `.workspace-entity-list`, `.workspace-entity-row*`, `.workspace-entity-badge*`, `.workspace-entity-empty`, `.workspace-entity-sample-hint`. |

V1.1 base class families: `.workspace-widget-subpanel*`, `.workspace-source-*`, `.workspace-field-row*`, `.workspace-hidden-fields*`, `.workspace-sort-row`, `.workspace-filter-clause`, `.workspace-filter-op-toggle`, `.workspace-add-clause`, `.workspace-chart-config`, `.workspace-chart-type-tabs`, `.workspace-axis-range`, `.workspace-toggle-row`, `.workspace-chart-preview.kind-*`, `.workspace-command-palette*`, `.template-gallery-filters`.

No new npm dependencies added. One new API route added under `apps/workspace/app/api/workspace/integration-entities/`.

---

## Validation checklist

Before promoting V1.1 work:

- [ ] V1 dashboards with `columns: string[]`, `values: number[]`, `binding: { mode: "manual" \| "json" \| "csv" }` round-trip without modification.
- [ ] Applying a template does not rewrite the dashboard name or tab name.
- [ ] Template gallery filters return the expected subset (category + tag + query AND).
- [ ] Source sub-page can select Static, then any integration, then back to Static — `binding.mode` flips between `"manual"`/`"json"` and `"integration"`.
- [ ] Selecting an integration shows the EntitySelector below the integration list.
- [ ] Selecting an entity writes `binding.entityId`, `binding.entityType`, `binding.entityLabel` and inserts an entity filter clause into `widget.config.filter.clauses`.
- [ ] Clearing an entity (× on EntityBadge) removes entity fields from `binding` and removes the entity clause from `filter.clauses`.
- [ ] `summarizeSource` shows `"Integration · Entity Label"` when entity is selected.
- [ ] `GET /api/workspace/integration-entities?integrationId=meta-ads` returns sample entities in static adapter mode.
- [ ] Widget binding with `entityId` round-trips through PATCH → GET without modification.
- [ ] EntitySelector shows sample hint when integration is not connected.
- [ ] Fields sub-page reorders + hides + adds + removes columns. Hidden columns are absent from the `WidgetPreview` table. Refresh restores the same state.
- [ ] Sort sub-page persists multiple clauses; root inspector summary matches.
- [ ] Filter sub-page persists clauses with each operator. `isEmpty` / `isNotEmpty` hide the value input.
- [ ] Chart inspector tab strip switches `chartType`; preview renders the new kind. `bar-vertical` matches V1 visuals.
- [ ] Cmd+K opens the palette; `/` opens the palette only when no input is focused; `Esc` closes; arrow keys navigate; Enter runs.
- [ ] PATCH `/api/workspace` payloads still validate. No new top-level fields appear.
- [ ] No `console.error` from React keys or unknown props.

---

## Explicit non-goals reasserted

- Browser-hosted workflow execution — out of scope.
- Provider token storage — out of scope.
- Live metric querying from the browser — out of scope (entity binding configures WHERE, not WHAT).
- Chart library dependency — out of scope.
- Replacing `view.config.columns` with object[] — out of scope (string[] preserved).
- Replacing `chart.config.values` — out of scope (still rendered when present).
- Top-level Builder / Widgets navigation — remains forbidden per V1.
- Provider-specific widget types (Meta widget, GA4 widget, Shopify widget) — out of scope; the governed reference binding is provider-agnostic.

V1.1 is the safe middle: rich Twenty-style data-view editor on top of the V1 envelope, with strict compatibility preservation.
