# Client Portal

## What this template is for

Client status, documents, and embedded portal area. Multi-panel layout combining a client summary, a companies table, an embedded portal frame, and a delivery health chart so an account team can run a single client view without leaving the Workspace Builder.

## Best for

- Agencies
- Consultants
- Client delivery

## Tags

`client`, `portal`, `delivery`

## Included widgets

| Widget title | Kind | Position `{x,y,w,h}` | Notes |
| --- | --- | --- | --- |
| Client Summary | `rich-text` | `{0,0,4,4}` | Static summary text: "Current client priorities, owner notes, and next milestone." |
| Companies | `view` | `{4,0,5,5}` | Table view of `Companies` with columns `Name`, `Domain Name`, populated from the shared sample view rows. |
| Client Portal Embed | `iframe` | `{9,0,3,5}` | Embed slot for an external client portal URL. Ships with an empty `url`. |
| Delivery Health | `chart` | `{0,4,4,4}` | Bar chart of delivery health values `[72, 64, 81, 58, 76]`. |

All four widgets fit inside the 12×16 grid without overlap.

## Suggested data bindings

V1 ships static bindings only. The defaults you get on apply:

- **Client Summary** — `binding.mode = "manual"`, `source = "Manual text"`. Edit the text inline; no rows.
- **Companies** — `binding.mode = "manual"`, `source = "Manual rows"`. Rows come from `SAMPLE_VIEW_ROWS` (companies fixture).
- **Client Portal Embed** — iframe `config.url` is empty by default. Paste any portal URL the team uses.
- **Delivery Health** — `binding.mode = "json"`, `source = "Sample JSON"`. Sample JSON is the reporting fixture (`Leads / Qualified / Booked`); the chart itself draws from `config.values`.

## Future bridge-backed upgrade path

V1 ships static bindings only. Bridge-backed bindings (live data sources, governed adapters) are tracked in [`docs/BRIDGE_BACKED_WIDGETS_V1_PLAN.md`](../BRIDGE_BACKED_WIDGETS_V1_PLAN.md). When that lands, the static `manual` / `json` defaults on this template will be the migration starting point — you will swap a binding mode without re-laying out the canvas.

## Suggested deployment use case

Drop this template onto a hosted Workspace deploy for an agency or consulting team that already has a client portal URL. The summary panel becomes the running notes, the companies table is the active book, the iframe slot embeds whatever client-facing portal already exists, and the delivery health chart gives leads a one-glance status. Stays useful with manual edits while the team waits on bridge-backed bindings.

---

- [Workspace Builder Runtime V1](../WORKSPACE_BUILDER_RUNTIME_V1.md)
- [Workspace Config Contract V1](../WORKSPACE_CONFIG_CONTRACT_V1.md)
- [Workspace Starter Activation Path](../WORKSPACE_STARTER_ACTIVATION_PATH.md)
- [Source Import → Workspace Builder](../SOURCE_IMPORT_TO_WORKSPACE_BUILDER.md)
