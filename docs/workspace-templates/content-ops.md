# Content Ops

## What this template is for

Editorial pipeline and review snapshot. A queue-and-mix layout that pairs a content table with a publishing-mix chart and a side panel for review notes, so an editorial owner can see what is in flight, the channel mix, and the open blockers in one canvas.

## Best for

- Editorial teams
- Content marketers
- Content reviewers

## Tags

`content`, `editorial`, `review`

## Included widgets

| Widget title | Kind | Position `{x,y,w,h}` | Notes |
| --- | --- | --- | --- |
| Content Queue | `view` | `{0,0,5,5}` | Table view of `Content` with columns `Channel`, `Status`. Ships with three rows: Blog/Draft, Email/Review, Social/Scheduled. |
| Publishing Mix | `chart` | `{5,0,4,4}` | Bar chart of mix values `[34, 52, 45, 61, 38]`. |
| Review Notes | `rich-text` | `{9,0,3,4}` | Static text: "Open creative review notes and approval blockers." |

All three widgets fit inside the 12×16 grid without overlap.

## Suggested data bindings

V1 ships static bindings only. The defaults you get on apply:

- **Content Queue** — `binding.mode = "csv"`, `source = "Sample CSV"`. CSV fixture: `channel,status,count` with three rows (Blog/Draft/4, Email/Review/3, Social/Scheduled/9). The visible table rows are inline in `config.rows`.
- **Publishing Mix** — `binding.mode = "csv"`, `source = "Sample CSV"`. Same CSV fixture; the chart itself draws from `config.values`.
- **Review Notes** — `binding.mode = "manual"`, `source = "Manual text"`. Edit the prose inline; no rows.

## Future bridge-backed upgrade path

V1 ships static bindings only. Bridge-backed bindings (live data sources, governed adapters) are tracked in [`docs/BRIDGE_BACKED_WIDGETS_V1_PLAN.md`](../BRIDGE_BACKED_WIDGETS_V1_PLAN.md). The CSV-backed widgets here are the natural first candidates to migrate — the binding mode flips, the layout stays.

## Suggested deployment use case

Stand this template up for an editorial team running multi-channel content (blog, email, social) where the editor needs a quick "what is in flight, what is blocking" view. The CSV defaults make it useful day one without any wiring; once a real CSV export from the team's CMS is dropped in, the same layout becomes a daily editorial standup board.

---

- [Workspace Builder Runtime V1](../WORKSPACE_BUILDER_RUNTIME_V1.md)
- [Workspace Config Contract V1](../WORKSPACE_CONFIG_CONTRACT_V1.md)
- [Workspace Starter Activation Path](../WORKSPACE_STARTER_ACTIVATION_PATH.md)
- [Source Import → Workspace Builder](../SOURCE_IMPORT_TO_WORKSPACE_BUILDER.md)
