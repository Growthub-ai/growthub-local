# Workspace Folders Navigation V1

Workspace Folders Navigation is the CRM-style organization layer inside the exported `growthub-custom-workspace-starter-v1` app. It lets a user group dashboards and governed Data Model object views into persistent sidebar folders without changing the underlying `growthub.config.json` contract or bypassing the `/api/workspace` validation boundary.

## Customer Journey

A user starts from the governed workspace starter, imports or creates business objects, and then organizes the workspace around the way the team actually works. Dashboards stay available as full dashboard canvases with tabs and widget state. Data Model views open the real object table surface. Folder items become shortcuts into those live surfaces rather than duplicate pages or static snapshots.

This matters for product-led adoption because the workspace becomes useful before hosted activation. A free local user can create a folder such as "Sales Ops", add a dashboard, add the relevant object view, customize the icons/colors, and keep that organization in the exported workspace. When the same workspace later connects to hosted authority, the local artifact already contains real structure, traces, and config-backed state instead of an empty demo shell.

## Behavior

- Folder state persists through the governed workspace Data Model object that represents navigation folders.
- Dashboard folder items route to `/?dashboard=<dashboardId>` and render the live dashboard builder canvas with tabs and widget state.
- Object view folder items route to `/data-model?object=<objectId>` and render the governed Data Model object table.
- Folder and item customization supports display name, icon, and color.
- Add dashboard, add view, and customize controls render as top-layer overlays so dashboard widgets and table surfaces cannot visually cover the modal.
- The folder tree uses a continuous parent branch rail with curved child connectors for readable nested navigation.
- The collapsed rail keeps workspace utility icons stacked and responsive.

## Implementation Boundary

The feature lives in the exported starter app:

- `app/workspace-rail.jsx`
- `app/globals.css`
- `app/workspace-builder.jsx`
- `app/data-model/components/DataModelShell.jsx`
- `app/views/[viewId]/page.jsx`

The implementation does not create a parallel navigation service. It reuses existing workspace config, route, and Data Model surfaces so exports remain portable and compatible with the same starter lifecycle.

## Validation

Validated behavior for the shipped starter export:

- folder dashboard item opens the real dashboard canvas, not the dashboard management table
- folder object view item opens the real Data Model object table
- add dashboard/add view picker is a top-layer modal over dashboard state
- customize modal is a top-layer modal over dashboard state
- hover state is isolated to the active folder row or child item
- folder branch lines and curved child connectors render cleanly
- live `agent-service` workspace files were copied back byte-for-byte into the starter source before release prep

## Release Note

This feature is part of the `@growthub/cli@0.13.1` / `@growthub/create-growthub-local@0.13.1` workspace starter export. Per the dist rebuild protocol, source and asset changes land first; the committed CLI dist is rebuilt from the full workspace in the super-admin release lane before npm publication.
