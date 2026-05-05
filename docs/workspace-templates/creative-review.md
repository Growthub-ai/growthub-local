# Creative Review

## What this template is for

Creative artifact embed and approval notes. An embed-and-queue layout that pairs a wide creative preview iframe with an approval-notes panel and a review queue table, so creative leads can run an asset review without leaving the Workspace Builder.

## Best for

- Creative leads
- Designers
- Account managers

## Tags

`creative`, `review`, `approvals`

## Included widgets

| Widget title | Kind | Position `{x,y,w,h}` | Notes |
| --- | --- | --- | --- |
| Creative Preview | `iframe` | `{0,0,7,6}` | Wide embed slot for the creative artifact under review. Ships with an empty `url`. |
| Approval Notes | `rich-text` | `{7,0,5,3}` | Static text: "Feedback, approvals, and revision requests." |
| Review Queue | `view` | `{7,3,5,4}` | Table view of `Creative` with columns `Asset`, `Status`. Ships with three rows: Landing Page/Review, Email Hero/Approved, Social Set/Revision. |

All three widgets fit inside the 12×16 grid without overlap.

## Suggested data bindings

V1 ships static bindings only. The defaults you get on apply:

- **Creative Preview** — iframe `config.url` is empty by default. Paste the URL of the asset under review (Figma frame, hosted preview, Loom, etc.).
- **Approval Notes** — `binding.mode = "manual"`, `source = "Manual text"`. Edit the prose inline; no rows.
- **Review Queue** — `binding.mode = "manual"`, `source = "Manual rows"`. The visible rows are inline in `config.rows` (Landing Page, Email Hero, Social Set).

## Future bridge-backed upgrade path

V1 ships static bindings only. Bridge-backed bindings (live data sources, governed adapters) are tracked in [`docs/BRIDGE_BACKED_WIDGETS_V1_PLAN.md`](../BRIDGE_BACKED_WIDGETS_V1_PLAN.md). When that lands, the manual review-queue rows on this template become the natural migration candidate — the binding mode flips, the queue layout stays.

## Suggested deployment use case

Drop this template onto a Workspace deploy for a creative team running asset reviews — agency designers, account managers walking a client through revisions, or in-house design leads triaging weekly drops. Paste the asset URL into the iframe, capture decisions in the notes panel, and keep the queue table as the running log of what's open vs closed.

---

- [Workspace Builder Runtime V1](../WORKSPACE_BUILDER_RUNTIME_V1.md)
- [Workspace Config Contract V1](../WORKSPACE_CONFIG_CONTRACT_V1.md)
- [Workspace Starter Activation Path](../WORKSPACE_STARTER_ACTIVATION_PATH.md)
- [Source Import → Workspace Builder](../SOURCE_IMPORT_TO_WORKSPACE_BUILDER.md)
