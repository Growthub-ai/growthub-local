# Workspace Templates

The Workspace Builder ships with six dashboard templates. Five of them are documented here; the sixth (`Blank`) is an empty governed canvas.

Every position, widget kind, and binding mode in these docs traces directly to the source-of-truth array:

- [`apps/workspace/lib/workspace-schema.js#DASHBOARD_TEMPLATES`](../../cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-schema.js)

## Templates

| Template | One-line summary |
| --- | --- |
| [Client Portal](./client-portal.md) | Client status, documents, and embedded portal area — agency / consultant client view. |
| [Content Ops](./content-ops.md) | Editorial pipeline and review snapshot — content queue, publishing mix, review notes. |
| [Reporting Dashboard](./reporting-dashboard.md) | KPIs, table, and executive readout — pipeline + conversion + summary. |
| [Creative Review](./creative-review.md) | Creative artifact embed and approval notes — preview, notes, review queue. |
| [Agency Delivery](./agency-delivery.md) | Agency workstream, KPI, and delivery notes — delivery board, utilization, portal. |

## Notes

- All widget positions live on the Workspace Builder's 12×16 grid (12 columns × 16 rows).
- V1 ships static bindings only (`manual` / `json` / `csv`). Bridge-backed bindings are tracked in [`docs/BRIDGE_BACKED_WIDGETS_V1_PLAN.md`](../BRIDGE_BACKED_WIDGETS_V1_PLAN.md).
- Applying a template clones widget IDs fresh and writes to the active config — see [Workspace Builder Runtime V1](../WORKSPACE_BUILDER_RUNTIME_V1.md).

## Cross-links

- [Workspace Config Contract V1](../WORKSPACE_CONFIG_CONTRACT_V1.md)
- [Workspace Starter Activation Path](../WORKSPACE_STARTER_ACTIVATION_PATH.md)
- [Source Import → Workspace Builder](../SOURCE_IMPORT_TO_WORKSPACE_BUILDER.md)
