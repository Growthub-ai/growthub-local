# Creative OS Starter Seed V1

This document freezes the default first-run experience for `growthub-custom-workspace-starter-v1`. The seed is **config-only**: it uses existing `dataModel.objects[]`, saved views, `nav-folders`, and dashboard widgets. No new schema, route, top-level key, or source taxonomy is introduced.

## Authority model

| Layer | Role |
| --- | --- |
| `dataModel.objects[]` | Source authority for business rows |
| `fieldSettings.views[]` | Saved table views per object |
| `nav-folders` (hidden object) | Sidebar folder navigation |
| `dashboards[]` + `canvas` | Presentation and layout |
| View/chart widgets | Bind to Data Model via `binding.sourceType: "workspace-data-model"` |

Demo and static starter values live **only** inside Data Model object `rows[]`. Widgets must not own primary starter row data.

## Seeded business objects (visible)

| Object id | Label | `objectType` | Purpose |
| --- | --- | --- | --- |
| `clients` | Clients | `custom` | Accounts and retainers |
| `campaigns` | Campaigns | `custom` | Campaign pipeline |
| `production-tasks` | Production Tasks | `tasks` | Creative production work items |
| `creative-assets` | Creative Assets | `custom` | Approved and in-flight assets |
| `performance-metrics` | Performance Metrics | `custom` | Channel/campaign metrics |
| `reports-decisions` | Reports & Decisions | `custom` | Client reports, decisions, follow-ups |

## Hidden navigation object

| Object id | Label | Visibility |
| --- | --- | --- |
| `nav-folders` | Custom Folders | Hidden from Data Model picker (`HIDDEN_HELPER_OBJECT_IDS`) |

Folder rows power the workspace rail. Customer-facing folders do not link to API Registry, Sandbox Environments, or other system objects by default.

## Default folders

| Folder | Items |
| --- | --- |
| Overview | Dashboard `creative-os-command-center`, view `clients` |
| Creative Production | View `production-tasks` |
| Campaigns | View `campaigns` |
| Assets | View `creative-assets` |
| Performance | View `performance-metrics` |
| Reports & Decisions | View `reports-decisions` |

Folder item shapes follow `docs/WORKSPACE_FOLDERS_NAVIGATION_V1.md`: dashboard items use `type: "dashboard"` + `refId`; view items use `type: "view"` + `objectId`.

## Saved views (per object)

Each visible object ships at least one default view and one practical alternate:

- **Clients:** All Clients, Active Retainers, Enterprise / High Priority
- **Campaigns:** Active Campaigns, Launch Queue, Recently Updated
- **Production Tasks:** Active Tasks, Blocked, Due This Week
- **Creative Assets:** Asset Library, Needs Review, Approved
- **Performance Metrics:** Latest Metrics, By Channel, Needs Analysis
- **Reports & Decisions:** Client Reports, Decisions Log, Open Follow-ups

Views are stored under `fieldSettings.views` with `activeViewId` pointing at the default.

## Starter dashboard

| Field | Value |
| --- | --- |
| id | `creative-os-command-center` |
| name | Creative OS Command Center |
| status | `active` |

Widgets (Data Model–bound where applicable):

1. Rich text welcome block
2. View widget → `campaigns`
3. View widget → `production-tasks`

Chart widgets are intentionally omitted until Data Model chart binding is a proven default path.

## Source file

Canonical seed lives in:

`cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/growthub.config.json`

Regenerate from the kit builder (optional):

```bash
node cli/assets/worker-kits/growthub-custom-workspace-starter-v1/scripts/build-creative-os-seed.mjs
```

## Anti-patterns

Do not:

- Add widget-owned demo rows as the primary starter source
- Expose `nav-folders` in the Data Model object list
- Add a parallel folders API or navigation schema
- Add top-level keys such as `folders`, `views`, or `objects`
- Seed secrets, tokens, or real credentials
- Overload the starter with extra system objects in customer-facing folders

## Validation commands

Static JSON parse:

```bash
node -e "const fs=require('fs'); JSON.parse(fs.readFileSync('cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/growthub.config.json','utf8')); console.log('json ok')"
```

PATCH allowlist schema (from kit directory):

```bash
node cli/assets/worker-kits/growthub-custom-workspace-starter-v1/scripts/build-creative-os-seed.mjs
```

Export path:

```bash
node cli/dist/index.js starter init --name test-creative-os-seed --out /tmp/test-creative-os-seed
cd /tmp/test-creative-os-seed/apps/workspace
npm install
npm run build
```

Manual checks after `npm run dev`:

- Folders render on the Home rail
- Dashboard folder item opens `/?dashboard=creative-os-command-center`
- View folder items open `/data-model?object=<objectId>`
- Data Model picker lists six business objects (not `nav-folders`)
- `GET /api/workspace` returns `dataModel` with seeded objects
- `PATCH /api/workspace` still rejects unknown top-level keys

## Export expectations

`growthub starter init` copies the kit `apps/workspace/growthub.config.json` into the exported workspace. The exported artifact must include the full Creative OS seed without a separate merge step unless `--seed-config <slug>` is used for additive templates under `templates/seeded-configs/`.
