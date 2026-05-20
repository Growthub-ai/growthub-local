# Creative OS Starter Seed V1

Creative OS Starter Seed V1 is the default first-run business ontology shipped inside `growthub-custom-workspace-starter-v1`. It productizes the existing AWaC workspace primitives without adding schema, routes, or top-level config keys.

## What ships

The starter artifact at `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/growthub.config.json` includes:

### Six visible business objects (`dataModel.objects[]`)

| Object id | Label | `objectType` | Purpose |
|-----------|-------|--------------|---------|
| `clients` | Clients | `custom` | Accounts, retainers, contacts |
| `campaigns` | Campaigns | `custom` | Campaign pipeline and launch queue |
| `production-tasks` | Production Tasks | `tasks` | Creative production work items |
| `creative-assets` | Creative Assets | `custom` | Asset library and review states |
| `performance-metrics` | Performance Metrics | `custom` | Channel and campaign metrics |
| `reports-decisions` | Reports & Decisions | `custom` | Client reports, decisions, follow-ups |

Each object includes:

- `columns`, `rows` (demo/static seed content only inside Data Model rows)
- `binding: { "mode": "manual", "source": "Data Model" }`
- `fieldSettings` with `order`, `types`, `views[]`, `activeViewId`, and optional `favorite`

### Saved views (per object)

Each business object ships at least one default view and two practical alternates under `fieldSettings.views[]`. View-local `hidden`, `order`, `sort`, and `filter` are normalized by `apps/workspace/lib/workspace-data-model.js`.

Example view names:

- **Clients:** All Clients, Active Retainers, Enterprise / High Priority
- **Campaigns:** Active Campaigns, Launch Queue, Recently Updated
- **Production Tasks:** Active Tasks, Blocked, Due This Week
- **Creative Assets:** Asset Library, Needs Review, Approved
- **Performance Metrics:** Latest Metrics, By Channel, Needs Analysis
- **Reports & Decisions:** Client Reports, Decisions Log, Open Follow-ups

### Hidden navigation object

| Object id | Visibility | Role |
|-----------|------------|------|
| `nav-folders` | Hidden from Data Model picker (`HIDDEN_HELPER_OBJECT_IDS`) | Sidebar folder tree |

### Default folders (`nav-folders.rows[]`)

1. **Overview** — Command Center dashboard + Clients view
2. **Creative Production** — Production Tasks view
3. **Campaigns** — Campaigns view
4. **Assets** — Creative Assets view
5. **Performance** — Performance Metrics view
6. **Reports & Decisions** — Reports & Decisions view

Folder items use the rail contract:

- `type: "dashboard"` + `refId` → `/?dashboard=<dashboardId>`
- `type: "view"` + `objectId` → `/data-model?object=<objectId>`

### Starter dashboard

| Dashboard id | Name | Status |
|--------------|------|--------|
| `creative-os-command-center` | Creative OS Command Center | `active` |

Canvas widgets (presentation only):

1. Rich Text — welcome copy
2. View — bound to `campaigns` via `workspace-data-model`
3. View — bound to `production-tasks` via `workspace-data-model`

No chart widget is seeded; chart binding to Data Model fields is deferred until the binding path is uniformly proven in the starter export.

## Source ownership rules

1. **Data Model is source authority** — all demo rows live in `dataModel.objects[].rows[]`.
2. **Widgets are presentation** — View widgets reference objects with `binding.sourceType = "workspace-data-model"` and `objectId`; they do not own starter rows.
3. **Folders are navigation** — `nav-folders` groups dashboards and object views; it does not duplicate tables or bypass PATCH.
4. **PATCH allowlist unchanged** — only `dashboards`, `widgetTypes`, `canvas`, and `dataModel` are mutable through `PATCH /api/workspace`.

## Anti-patterns (do not reintroduce)

- Widget-owned static rows as the primary starter data path
- Exposing `nav-folders` in the customer-facing Data Model object list
- A parallel `folders` top-level key or folders API route
- Customer-facing folder items for API Registry, Sandbox Environments, or Helper Threads by default
- Secrets, tokens, or real credentials in seed rows
- A bloated enterprise template (keep the six-object baseline)

## Validation commands

Static JSON parse:

```bash
node -e "const fs=require('fs'); JSON.parse(fs.readFileSync('cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/growthub.config.json','utf8')); console.log('json ok')"
```

Schema validation (PATCH allowlist subset — same surface `/api/workspace` mutates):

```bash
node -e "
const fs=require('fs');
const c=JSON.parse(fs.readFileSync('cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/growthub.config.json','utf8'));
import('file://' + process.cwd() + '/cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-schema.js').then(({validateWorkspaceConfig})=>{
  validateWorkspaceConfig({dashboards:c.dashboards,widgetTypes:c.widgetTypes,canvas:c.canvas,dataModel:c.dataModel});
  console.log('validate ok');
});
"
```

CLI tests:

```bash
pnpm --filter @growthub/cli exec vitest run cli/src/__tests__/kit-custom-workspace-starter.test.ts
```

## Starter export expectations

After `growthub starter init` (or kit export), the workspace at `<out>/apps/workspace/growthub.config.json` must include:

- `dataModel.objects[]` with six visible business objects plus `nav-folders`
- `dashboards[]` with `creative-os-command-center` active
- `canvas.widgets[]` with Data Model–bound View widgets (no widget-owned demo rows)
- No new top-level keys beyond the existing workspace config contract

Export smoke path:

```bash
node cli/dist/index.js starter init --name test-creative-os-seed --out /tmp/test-creative-os-seed
cd /tmp/test-creative-os-seed/apps/workspace
npm install
npm run build
```

Runtime checks (with dev server):

```bash
curl -I http://localhost:<port>/api/workspace
```

Confirm folders render on Home, dashboard items open the live canvas, view items open `/data-model?object=<id>`, and `nav-folders` does not appear in the Data Model object picker.

## Authority references

1. `apps/workspace/growthub.config.json` — seeded artifact
2. `apps/workspace/lib/workspace-schema.js` — validator
3. `apps/workspace/lib/workspace-data-model.js` — manual objects, saved views, hidden helper ids
4. `apps/workspace/app/workspace-rail.jsx` — folder rendering and routing
5. `docs/WORKSPACE_FOLDERS_NAVIGATION_V1.md` — folder navigation contract
