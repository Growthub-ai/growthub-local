# Project Management Workspace Template

The Project Management Workspace Template is the second official Growthub
workspace template. It builds on the blank custom workspace starter and adds an
opinionated fast path for API-backed project task operations.

It is designed for Asana today and future Nango-supported providers later. The
template does not ship provider secrets, OAuth connection ids, live project ids,
or task data.

## Create The Workspace

Use the official custom workspace picker:

```bash
growthub discover
```

Choose:

```text
Browse Custom Workspaces
Project Management Workspace Template
```

Or create it directly:

```bash
growthub kit download project-management --out ./project-management-workspace --yes
```

Equivalent starter command:

```bash
growthub starter init \
  --name "Project Management Workspace" \
  --out ./project-management-workspace \
  --seed-config project-management
```

## Run Locally

```bash
cd ./project-management-workspace/apps/workspace
npm install
npm run dev
```

Open the local URL printed by Next.js.

## What The Template Seeds

The template uses the same governed workspace app as the blank starter and adds
sanitized project-management objects:

- **API Registry** — one Nango proxy-style registry row for project task deltas.
- **Project Task Source** — provider/project metadata fields for the task source
  without real provider secrets or task rows.
- **Sandbox Environments** — one sandbox environment row whose
  `orchestrationConfig` field is the bridge between the Data Model and the real
  workflow canvas.
- **Workflow** — draftable/publishable no-code workflow shape that pulls task
  deltas through the API registry pattern.
- **Dashboard** — project-task dashboard scaffolding for returned deltas and
  workflow run status.

## Connect A Provider

The default fast path is Nango-backed provider access. Keep secrets outside the
workspace template and bind them through your local environment or hosted
authority.

Typical local setup:

```bash
export NANGO_SECRET_KEY="..."
```

Then configure the seeded API Registry row in the workspace UI with your
provider config key, connection id, workspace/project identifiers, and endpoint
shape. The template expects those values to be user-owned runtime configuration,
not committed template data.

For Asana, the workflow should pull active project tasks through the Nango proxy
endpoint, write normalized deltas to source records, and surface those deltas in
the dashboard.

## Governance Model

The template keeps the user and super-admin mental model clean:

- Users see one project-management workflow surfaced through the Workflows view.
- Agents can resolve the same workflow through the Sandbox Environments row and
  its `orchestrationConfig` field.
- The Data Model remains config-backed and validator-governed through
  `PATCH /api/workspace`.
- Secrets stay as environment references or hosted authority bindings.

## Validation

After creating the workspace, run:

```bash
node ../../../../cli/dist/index.js kit inspect project-management --json
```

For the local exported app, verify:

```bash
cd ./project-management-workspace/apps/workspace
npm run dev
```

Then confirm in the UI:

- Data Model contains the seeded API Registry, Project Task Source, and Sandbox
  Environments objects.
- The sandbox environment row opens the real workflow view from
  `orchestrationConfig`.
- The dashboard loads without seeded provider secrets or provider task data.
