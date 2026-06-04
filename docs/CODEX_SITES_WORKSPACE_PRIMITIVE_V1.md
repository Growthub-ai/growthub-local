# Codex Sites Workspace Primitive V1

## S02 Frozen Snapshot

Codex Sites are now represented as a first-class governed workspace primitive in the custom workspace starter. The primitive is intentionally small: it lets a workspace select a real Codex-hosted site, persist that selection as a governed Data Model row, render the row as a Builder Site item, and open the hosted URL from the no-code UI.

This document records the production contract for that V1 behavior. It is not a speculative plan and it does not add a parallel persistence path.

## Scope

The V1 primitive covers:

- a custom Data Model object for Codex Sites;
- a sidecar section for binding a real available Codex Site into that object;
- Builder table rendering for Site items;
- Workspace Settings visibility for configured apps and Codex Sites;
- localhost smoke-test rules that keep test data out of the open source starter template.

The V1 primitive does not cover:

- storing Codex auth tokens in workspace config;
- storing private account metadata in the source starter template;
- mutating dashboard canvas as a side effect of creating the Codex Sites object;
- inventing a second Data Model persistence system;
- treating a source checkout as the durable smoke workspace.

## Source Of Truth

The governed workspace source of truth remains the existing topology:

1. `growthub.config.json`
2. `apps/workspace/lib/workspace-schema.js`
3. `apps/workspace/lib/workspace-data-model.js`
4. `apps/workspace/lib/workspace-config.js`
5. `apps/workspace/app/api/workspace/route.js`
6. `apps/workspace/app/data-model/page.jsx`

Codex Sites V1 sits inside that topology. It does not bypass `PATCH /api/workspace`, does not write arbitrary files, and does not ask the browser to own authority.

## Data Model Object

The object id is:

```text
workspace-codex-sites
```

The object is a governed custom object. It exists only in `dataModel.objects[]` and is created or opened from the Builder `New Codex Site` action.

Required columns:

- `Name`
- `app`
- `client`
- `url`
- `status`
- `accessMode`
- `dashboardId`
- `lastRecordedAt`
- `notes`

Required behavior:

- If the object already exists, the Builder action opens the existing table.
- If the object does not exist, the Builder action creates the table through `PATCH /api/workspace` and then opens it.
- Creating the object must not create duplicate objects.
- Creating the object must not create widgets.
- Creating the object must not mutate dashboard canvas placement.

## Sidecar Binding

The Data Model record sidecar recognizes the Codex Sites object by its object id. When the selected object is `workspace-codex-sites`, the sidecar renders the Codex Site binding section instead of a generic field-only editing experience.

The sidecar must show:

- an `Available site` dropdown;
- the user's available Codex Sites from the workspace adapter;
- an `Open selected site` action when a URL is bound;
- a read-only bound row section showing the normalized row values.

The sidecar must not:

- hardcode a private site into source control;
- parse HTML login pages as site data;
- fabricate rows when the adapter has no available site;
- write secrets into `growthub.config.json`;
- leak account-specific data into the starter template.

## Adapter Contract

The adapter returns normalized Codex Site records. The normalized record shape is:

```ts
{
  id: string;
  Name: string;
  app: string;
  client: string;
  url: string;
  status: string;
  accessMode: string;
  dashboardId: string;
  lastRecordedAt: string;
  notes: string;
}
```

Only valid `http://` or `https://` URLs are selectable. The dropdown should display a clear label while preserving the URL as the bound value.

The row persisted into `workspace-codex-sites` is a normalized projection of the selected site. The row is workspace state. The adapter discovery source is not workspace state.

## Builder Contract

The Builder table includes Codex Sites as Site items. A bound Codex Site row renders as:

- title: the row `Name`;
- type: `Site`;
- last update: normalized `lastRecordedAt`;
- status: normalized status, with `active` displayed as `live`;
- action menu: `Open URL`, `Manage`, and `Apps`.

The title and `Open URL` action must use a real anchor with:

```text
target="_blank"
rel="noreferrer"
```

This is required so the dashboard item redirects in a new tab and browser smoke tests can prove the URL is real.

## Workspace Settings Contract

Workspace Settings > Apps presents governed app-related sections as an accordion group.

Required order:

1. Workspace Apps
2. Workspace Linkage
3. Codex Sites

Only one accordion section is open at a time. The default open section is Workspace Apps. This keeps the settings page usable as the number of apps, workspaces, and sites grows.

The Codex Sites settings section is inspect/manage UI. It does not create a second persistence path and does not store private adapter state in source control.

## Persistence Boundary

The correct persistence boundary is the governed workspace app cwd.

When `apps/workspace` is run from an exported or temporary workspace, `PATCH /api/workspace` writes that workspace's `growthub.config.json`. That is the correct no-code behavior.

When `apps/workspace` is run directly from the open source starter source tree, `PATCH /api/workspace` writes the starter template's `growthub.config.json`. That is not a valid smoke-test boundary for private or account-specific site data.

Smoke tests for Codex Sites must therefore run from one of these locations:

- an exported workspace artifact;
- a copied temp workspace app;
- a governed fork workspace that is intended to own the smoke data.

Smoke tests must not run private Codex Site row creation against the source starter template unless the operator explicitly wants to change the template fixture.

## Localhost Smoke Rule

A valid localhost smoke test proves the full UI path on a temp workspace runtime:

1. Start the workspace app from the temp/exported workspace directory.
2. Open the app in the browser.
3. Use Builder `New Codex Site` to create or open `workspace-codex-sites`.
4. Open the record sidecar.
5. Select a real available Codex Site from the dropdown.
6. Confirm the row persists in that temp workspace only.
7. Return to Builder.
8. Confirm the Site item renders.
9. Click the title or `Open URL`.
10. Confirm the hosted URL opens in a new tab or auth-gated browser target.

For the June 4, 2026 smoke run, the local UI smoke passed on:

```text
http://localhost:3015
```

The hosted URL was verified through the real dropdown and Builder new-tab action during the smoke run. The exact account-specific URL is test evidence, not starter default data, and must not be embedded in source fixtures.

## Source Control Hygiene

The following are commit-safe:

- adapter normalization code;
- UI rendering logic;
- docs describing the contract;
- tests that use fixtures or temp workspace copies;
- version bumps required for shipped starter behavior.

The following are not commit-safe unless deliberately added as public fixtures:

- account-specific Codex Site rows in `growthub.config.json`;
- local session readers;
- local machine paths;
- generated smoke workspace state;
- private hosted URLs as default template rows.

## Acceptance Criteria

The primitive is production-ready when:

- `workspace-codex-sites` can be created from Builder or opened if it already exists;
- the Data Model sidecar renders the Codex Site binding section for that object only;
- the dropdown lists real available Codex Sites through the adapter;
- selecting a site writes the normalized row through the existing Data Model save path;
- Builder renders the row as a Site item;
- the Site item opens the hosted URL in a new tab;
- Workspace Settings uses the ordered single-open accordion;
- local smoke runs against a temp/exported workspace, not the source starter template;
- source control contains no private smoke row data.

## Release Notes

This change ships as part of `@growthub/cli@0.13.9` and `@growthub/create-growthub-local@0.13.9`, with the installer pin aligned to the CLI version.
