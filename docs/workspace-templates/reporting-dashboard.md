# Reporting Dashboard

## What this template is for

KPIs, table, and executive readout. A KPI-grid layout pairing two trend charts with a performance table and a wide executive summary panel, so an analytics owner can publish a weekly readout without redesigning the canvas.

## Best for

- Executives
- Analytics teams
- Operations

## Tags

`kpi`, `reporting`, `analytics`

## Included widgets

| Widget title | Kind | Position `{x,y,w,h}` | Notes |
| --- | --- | --- | --- |
| Pipeline Trend | `chart` | `{0,0,4,5}` | Bar chart of pipeline values `[42, 58, 63, 71, 86]`. |
| Conversion | `chart` | `{4,0,4,5}` | Bar chart of conversion values `[28, 36, 44, 39, 52]`. |
| Performance Table | `view` | `{8,0,4,5}` | Default `Companies` table view with columns `Name`, `Domain Name` from the shared sample view rows. |
| Executive Summary | `rich-text` | `{0,5,6,3}` | Static text: "Weekly readout, risks, and decisions." |

All four widgets fit inside the 12×16 grid without overlap.

## Suggested data bindings

V1 ships static bindings only. The defaults you get on apply:

- **Pipeline Trend** — `binding.mode = "json"`, `source = "Sample JSON"`. Reporting fixture (`Leads / Qualified / Booked`); the chart itself draws from `config.values`.
- **Conversion** — `binding.mode = "json"`, `source = "Sample JSON"`. Same reporting fixture; chart draws from `config.values`.
- **Performance Table** — `binding.mode = "manual"`, `source = "Manual rows"`. Rows come from `SAMPLE_VIEW_ROWS` (companies fixture).
- **Executive Summary** — `binding.mode = "manual"`, `source = "Manual text"`. Edit the prose inline; no rows.

## Future bridge-backed upgrade path

V1 ships static bindings only. Bridge-backed bindings (live data sources, governed adapters) are tracked in [`docs/BRIDGE_BACKED_WIDGETS_V1_PLAN.md`](../BRIDGE_BACKED_WIDGETS_V1_PLAN.md). The two JSON-bound charts on this template are the cleanest migration candidates — the binding mode swaps from `json` to bridge-backed, the canvas does not move.

## Suggested deployment use case

Stand this template up for an executive readout deck or an analytics team's Monday review. The two charts cover the standard "trend + conversion" pair, the table holds the active accounts being measured, and the summary panel becomes the narrative ribbon under the KPIs. Useful day one with the static fixtures; the moment real data lands, the layout doesn't change.

---

- [Workspace Builder Runtime V1](../WORKSPACE_BUILDER_RUNTIME_V1.md)
- [Workspace Config Contract V1](../WORKSPACE_CONFIG_CONTRACT_V1.md)
- [Workspace Starter Activation Path](../WORKSPACE_STARTER_ACTIVATION_PATH.md)
- [Source Import → Workspace Builder](../SOURCE_IMPORT_TO_WORKSPACE_BUILDER.md)
