# Agency Delivery

## What this template is for

Agency workstream, KPI, and delivery notes. A delivery-grid layout combining a workstream board, a utilization chart, a client-commitments panel, and a delivery portal embed so an agency producer can run a weekly delivery review on one canvas.

## Best for

- Agencies
- Delivery leads
- Producers

## Tags

`agency`, `delivery`, `ops`

## Included widgets

| Widget title | Kind | Position `{x,y,w,h}` | Notes |
| --- | --- | --- | --- |
| Delivery Board | `view` | `{0,0,5,5}` | Table view of `Tasks` with columns `Workstream`, `Owner`. Ships with three rows: Strategy/Agency, Creative/Design, Launch/Ops. |
| Utilization | `chart` | `{5,0,3,4}` | Bar chart of utilization values `[62, 74, 69, 82, 77]`. |
| Client Commitments | `rich-text` | `{8,0,4,4}` | Static text: "Committed scope, launch date, and open risks." |
| Delivery Portal | `iframe` | `{0,5,6,4}` | Embed slot for an external delivery portal URL. Ships with an empty `url`. |

All four widgets fit inside the 12×16 grid without overlap.

## Suggested data bindings

V1 ships static bindings only. The defaults you get on apply:

- **Delivery Board** — `binding.mode = "manual"`, `source = "Manual rows"`. The visible rows are inline in `config.rows` (Strategy, Creative, Launch).
- **Utilization** — `binding.mode = "json"`, `source = "Sample JSON"`. Reporting fixture (`Leads / Qualified / Booked`); the chart itself draws from `config.values`.
- **Client Commitments** — `binding.mode = "manual"`, `source = "Manual text"`. Edit the prose inline; no rows.
- **Delivery Portal** — iframe `config.url` is empty by default. Paste the agency's delivery / project portal URL.

## Future bridge-backed upgrade path

V1 ships static bindings only. Bridge-backed bindings (live data sources, governed adapters) are tracked in [`docs/BRIDGE_BACKED_WIDGETS_V1_PLAN.md`](../BRIDGE_BACKED_WIDGETS_V1_PLAN.md). The JSON-bound utilization chart and the manual delivery board are the natural first migration candidates — the binding modes swap, the layout stays.

## Suggested deployment use case

Stand this template up for an agency delivery lead or producer running a weekly delivery review across multiple clients. The board tracks workstreams and owners, the chart fronts utilization across the team, the commitments panel keeps the active scope visible, and the iframe slot embeds whatever delivery portal the agency already runs (Notion, ClickUp, a custom client portal, etc.).

---

- [Workspace Builder Runtime V1](../WORKSPACE_BUILDER_RUNTIME_V1.md)
- [Workspace Config Contract V1](../WORKSPACE_CONFIG_CONTRACT_V1.md)
- [Workspace Starter Activation Path](../WORKSPACE_STARTER_ACTIVATION_PATH.md)
- [Source Import → Workspace Builder](../SOURCE_IMPORT_TO_WORKSPACE_BUILDER.md)
