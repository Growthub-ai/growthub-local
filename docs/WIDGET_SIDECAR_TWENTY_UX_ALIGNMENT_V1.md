# Widget Sidecar Twenty UX Alignment V1

This doc captures the Twenty-CRM-inspired interaction model the Growthub workspace builder targets for chart widget configuration, and the rules that keep the Twenty influence skin-deep — Growthub's contracts, persistence boundary, and authority model are unchanged.

Companion docs:

- [`WORKSPACE_CONFIG_CONTRACT_V1.md`](./WORKSPACE_CONFIG_CONTRACT_V1.md) — the persistence contract `growthub.config.json` honours.
- [`WORKSPACE_BUILDER_RUNTIME_V1.md`](./WORKSPACE_BUILDER_RUNTIME_V1.md) — how the builder hydrates Data Model objects and computes chart values at runtime.

---

## What we borrow from Twenty

Twenty's dashboard side panel uses a small, consistent set of primitives:

- **Grouped settings** — Data, X axis, Y axis, Style, Inspect. Each section is a band of row-based controls.
- **Row pattern** — left icon, label, right-side current value or toggle or inline input, optional chevron into a focused sub-panel.
- **Progressive disclosure** — settings appear when they're meaningful. Date granularity only appears for date fields. Legend / Stacked only appears when `groupBy` is set.
- **Searchable source picker** — object list with icons, source-type badge, selected checkmark, and search box.
- **Filter builder** — searchable field selector with type-aware operators, value input, add-condition button, and visible row-impact count.

This is the UX vocabulary we mirror. We do **not** copy Twenty's code or pull in Twenty dependencies (no Jotai, no Apollo, no Linaria, no Twenty UI). The existing Growthub Tailwind-style CSS and sub-panel pattern are extended in place.

---

## End-state structure of `ChartConfigPanel`

```
Chart type        ┌── icon tabs (vertical bar | horizontal bar | line | pie | sum | gauge)
Data              ├── Source                Opportunities >
                  ├── Filter                2 clauses >
                  ├── Rows                  248 available · 240 after filter
                  ├── Values                6 computed · unsaved?
                  ├── Inspect computation   Open >
                  └── Recompute values      Sync
X axis            ├── Data on display       Stage >
                  ├── Sort by               Position asc
                  └── Omit zero values      toggle
Y axis            ├── Data on display       arr >
                  ├── Group by              None >
                  ├── Operation             Sum
                  ├── Cumulative            toggle
                  ├── Min range             [Min]
                  └── Max range             [Max]
Style             ├── Colors                Auto
                  ├── Axis name             None
                  ├── Data labels           toggle
                  ├── Legend (if groupBy)   toggle
                  ├── Stacked (if groupBy)  toggle
                  ├── Prefix                [$]
                  └── Suffix                [%]
```

The renderer continues to read **only** from `widget.config.values`. Every section above is metadata that the computation pipeline reads to produce `values`.

---

## Operation vocabulary

`yAxis.operation` (preferred) and `yAxis.aggregation` (legacy alias, still accepted) accept the same Twenty-style set:

| Operation | Y field required? | Numeric Y required? | Notes |
| --- | --- | --- | --- |
| `sum` | yes | yes | Default |
| `avg` | yes | yes | |
| `min` / `max` | yes | yes | |
| `count` / `countAll` | no | no | Row-presence; ignores Y field entirely |
| `countEmpty` | yes | no | Counts rows where Y is null/empty |
| `countNotEmpty` | yes | no | Inverse of countEmpty |
| `countUnique` | yes | no | Distinct non-empty Y values |
| `percentEmpty` | yes | no | `countEmpty / countAll × 100` |
| `percentNotEmpty` | yes | no | `countNotEmpty / countAll × 100` |

Computation lives in `apps/workspace/lib/workspace-chart-values.js`. Schema validation in `lib/workspace-schema.js` accepts the full vocabulary as both `yAxis.aggregation` and `yAxis.operation`.

---

## Source-type badges

`listWorkspaceDataModelTables` attaches `sourceBadge` to every table:

| Badge | Meaning |
| --- | --- |
| `manual` | Rows live in `dataModel.objects[*].rows` (config-owned) |
| `live` | Object's `binding.sourceStorage === "workspace-source-records"` — rows hydrate from sidecar |
| `api` | Object type is `data-source` or `api-registry` |
| `webhook` | Reserved for future webhook-feed objects |

The source picker renders the badge next to the object label. The selected source still goes through the same `binding.sourceType === "workspace-data-model"` reference — the badge is presentation only and not persisted.

---

## Field metadata

`listWorkspaceDataModelTables` attaches `fieldMetadata[]` per table:

```ts
{
  id: string,              // column name
  label: string,
  type: "text" | "number" | "boolean" | "date" | "select"
      | "multi-value" | "relation-like" | "json",
  isNumeric: boolean,
  isDate: boolean,
  isBoolean: boolean,
  isSelectLike: boolean,
  isMultiValue: boolean,
  isRelationLike: boolean,
  isJson: boolean
}
```

This is **runtime-derived only** — it does not persist anywhere and does not require a schema migration. Explicit type hints on the object (`fieldSettings.types[column]`) win over inference. The UI uses field metadata to:

- Show date-granularity controls only for date fields
- Show ratio mode only for select / multi-value / boolean fields
- Adapt filter operators (numeric vs text vs date vs select)
- Pick the right operator default for each field type

---

## Chart Hydration Inspector

A dedicated sub-panel reachable from the Chart panel:

```
Source         Object · Storage · Rows available · Last fetched
Source preview First 5 source rows
Filter         Before · After · Dropped by filter
Buckets        Per-group breakdown (key · rowCount · numericCount · value)
Dropped rows   Reason counts (non-numeric-y · missing-y · zero-omitted · filter-removed)
Final values   number[] preview
Actions        Recompute values · Save computed values
```

The inspector is a **diagnostic overlay** over `computeChartProjectionDebug` — it never runs a parallel data pipeline and never queries provider data. Save routes through the existing `persistWorkspaceConfig` / `PATCH /api/workspace` path; on read-only runtimes the Save button is disabled with the existing 409 guidance.

---

## Refresh + save semantics

`POST /api/workspace/refresh-sources` writes sidecar rows server-side; the builder then re-reads `GET /api/workspace`, recomputes affected chart widgets, and marks them **Unsaved**. Persistence still requires Save. The contract never claims persistence when only React state changed.

`liveSourceIds` discovery considers **both**:

- Widgets with a direct `binding.sourceStorage === "workspace-source-records"` (legacy)
- Widgets bound to Data Model objects whose resolved table is itself live-backed (the new product model)

Refreshable keys are taken from `table.liveSource.sourceRecordKey`, `table.objectId`, or `table.binding.sourceId`.

---

## Helper-instruction surface

The workspace helper's stable system prompt (`lib/workspace-helper.js#buildStableSystemPrompt`) now teaches every helper-driven agent the chart hydration contract:

- Bind widgets via `binding.sourceType === "workspace-data-model"` + `objectId`.
- Compute `values` from rows; never copy rows into widget config.
- `workspaceSourceRecords` is GET-only — never PATCH it.
- Reset incompatible axis/filter/group selections when source changes.
- Refresh ≠ save; mark unsaved until PATCH succeeds.
- No secrets in widget config, rows, sidecar, browser state, localStorage, or exports.

---

## Hard rules (anti-patterns)

- Do not add a second sidecar framework, a second source picker, or a second data runtime.
- Do not make chart rendering query rows. The renderer reads `widget.config.values`. Full stop.
- Do not copy full source rows into widget config under any circumstance.
- Do not expand `ALLOWED_PATCH_FIELDS`. `workspaceSourceRecords` is GET-only.
- Do not store secrets in widget config, Data Model rows, sidecar records, browser state, localStorage, or exported templates.
- Do not pull Twenty's code, runtime, or dependencies. Mirror the interaction model only.
- Do not silently auto-save after refresh. Mark unsaved or require an explicit refresh-and-save action.
- Do not break existing static-value charts (`config.values: number[]` with no binding).
