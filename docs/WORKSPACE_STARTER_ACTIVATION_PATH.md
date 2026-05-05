# Workspace Starter Activation Path

This document describes the canonical activation sequence from install to a running governed workspace with the no-code builder.

---

## Step 1: Install

```bash
npm create @growthub/growthub-local@latest
```

The guided installer opens **Create Governed Workspace** first. Choose your source:

| Choice | What happens |
|--------|-------------|
| Greenfield | `growthub starter init` scaffolds from the workspace starter |
| Import GitHub repo | `growthub starter import-repo <owner/repo>` |
| Import skills.sh skill | `growthub starter import-skill <owner/repo/skill>` |
| Worker kit | `growthub kit download <kit-id>` |

For a direct workspace install (skip the menu):

```bash
npm create @growthub/growthub-local@latest -- --profile workspace --out ./my-workspace
```

---

## Step 2: Navigate to the workspace

```bash
cd my-workspace/apps/workspace
```

The `apps/workspace/` directory is the Next.js Workspace Builder app.

---

## Step 3: Install dependencies

```bash
npm install
```

---

## Step 4: Start the builder

```bash
npm run dev
```

This starts the builder in `filesystem` mode. `PATCH /api/workspace` writes changes directly to `growthub.config.json`.

Open `http://localhost:3000` in your browser.

---

## Step 5: Explore the builder

The builder opens with:

- **Dashboards** table — create, rename, clone, delete dashboard rows
- **Canvas** grid — fixed 12-column × 16-row layout; drag to select cells; click a widget type to place
- **Widget panel** — configure chart values, view source/columns/rows, iframe URL, rich text content
- **Settings panel** — workspace name, logo, persistence mode, integration adapter state
- **Management panel** — inspect API, workflow state, integration, and persistence details
- **Templates** — apply a built-in layout (Client Portal, Content Ops, Reporting Dashboard, Creative Review, Agency Delivery, Blank)
- **Import / Export** — move configs as JSON assets

---

## Step 6: Save

Click **Save** → `PATCH /api/workspace` writes `growthub.config.json`. Refresh to confirm persistence.

---

## Step 7: Deploy (optional)

```bash
npm run build
```

Deploy the `apps/workspace/.next` output to Vercel, Netlify, or any Node.js host.

On Vercel/Netlify (read-only runtime), the builder loads correctly but **Save** returns 409. This is by design — the bundle is immutable. To enable saving on a hosted runtime, set `WORKSPACE_CONFIG_ALLOW_FS_WRITE=true` and point the app at a writable volume or database adapter.

---

## Step 8: Connect hosted authority (optional)

```bash
growthub auth login
```

After login, you can:

- Connect Growthub Bridge for live integration data
- Bind hosted Growthub Agents to the workspace fork
- Execute CMS pipelines and capture structured outputs

These are all opt-in. The builder works without a Growthub account.

---

## Related docs

- [`docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md`](./GOVERNED_WORKSPACE_TOPOLOGY_V1.md) — file topology
- [`docs/WORKSPACE_CONFIG_CONTRACT_V1.md`](./WORKSPACE_CONFIG_CONTRACT_V1.md) — config schema
- [`docs/SOURCE_IMPORT_TO_WORKSPACE_BUILDER.md`](./SOURCE_IMPORT_TO_WORKSPACE_BUILDER.md) — source import → workspace
- [`docs/WORKSPACE_BUILDER_RUNTIME_V1.md`](./WORKSPACE_BUILDER_RUNTIME_V1.md) — builder runtime reference
