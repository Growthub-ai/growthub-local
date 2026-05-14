# Data Model Saved Views and Selection UX

## S01 Frozen Snapshot

This proposal records the public worker-kit primitives needed for Data Model saved views and table selection UX. It is intentionally scoped to governed workspace behavior that already fits the existing `dataModel` and `fieldSettings` contracts.

## L1 Summary

The Data Model surface should treat saved views as object-scoped table view state, not executable objects and not global workspace objects. Operators need a safe way to save filtered table views for records such as local intelligence run responses while keeping sandbox environments, source records, and custom response tables distinct.

## L2 Product Primitives

- Object-scoped saved views live under the owning table/object `fieldSettings.views[]`.
- `fieldSettings.activeViewId` selects the active saved view for that object only.
- A saved view captures `hidden`, `order`, `sort`, and `filter` state for the table.
- Saved views are not sandbox environments, are not executable, and are not widget sources by themselves.
- Response history should be represented as normal governed records in a custom table, with reference fields back to the source sandbox environment when needed.

## L3 Patch API Invariants

The existing workspace PATCH boundary remains unchanged. Agents and operators must only write through the accepted top-level workspace keys:

- `dashboards`
- `widgetTypes`
- `canvas`
- `dataModel`

When creating or updating saved views through `PATCH /api/workspace`, mutate the relevant object inside `dataModel.objects[]` and update that object`s `fieldSettings`. Do not create a global `dataModel.views` collection unless a future schema explicitly introduces and validates that contract.

Safe saved-view shape:

```json
{
  "fieldSettings": {
    "hidden": ["internalField"],
    "order": ["lastResponse", "ranAt", "runId"],
    "sort": [{ "fieldId": "ranAt", "direction": "desc" }],
    "filter": {
      "op": "and",
      "clauses": [
        { "fieldId": "sourceSandbox", "operator": "eq", "value": "antonio-local-gemma-agent-1" }
      ]
    },
    "views": [
      {
        "id": "view_local_gemma_responses",
        "name": "Local Gemma Responses",
        "favorite": false,
        "locked": false,
        "hidden": ["sourceSandbox", "runId"],
        "order": ["lastResponse", "ranAt", "status"],
        "sort": [{ "fieldId": "ranAt", "direction": "desc" }],
        "filter": {
          "op": "and",
          "clauses": [
            { "fieldId": "sourceSandbox", "operator": "eq", "value": "antonio-local-gemma-agent-1" }
          ]
        }
      }
    ],
    "activeViewId": "view_local_gemma_responses"
  }
}
```

## L4 Data Model UI Enhancements

The table UI should support multi-record work without changing persistence semantics:

- Row hover reveals a square selector in the row-number column.
- The selector uses a white fill, light gray border, 5px radius, and minimal hover shadow.
- Shift-select extends selection from the last selected visible row to the current visible row.
- The header `#` cell reveals a selection control on hover.
- Header selection offers a compact menu for select page, select all filtered, and clear selection.
- Active selection count appears in the same toolbar row as filter pills and table actions.
- Delete controls appear only while rows are selected and require a second confirm action.
- Pagination appears at the bottom of the grid with 25 rows by default and 50/100 row options.

## L5 Implementation Boundaries

This work should stay inside the worker-kit Data Model surface:

- `apps/workspace/app/data-model/components/DataModelShell.jsx`
- `apps/workspace/app/globals.css`
- Data Model documentation under `apps/workspace/docs/` or top-level `docs/`

Do not change sandbox execution semantics, bridge credential handling, or the PATCH allowlist. Do not add workspace secrets, generated source records, or local runtime sidecars to the contribution.
