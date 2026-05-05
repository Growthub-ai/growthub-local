# Quickstart — Governed Workspace

The 30-second mental model.

```
Pick a source  →  Create a governed Workspace  →  Open the Workspace Builder  →  Save / Export / Deploy
```

The **Workspace** is the product object. Kits, templates, workflows, agents, and source imports are inputs to a Workspace.

---

## 30 seconds

```bash
# 1. Install
npm create @growthub/growthub-local@latest

# 2. Pick "Create Governed Workspace" → "Workspace Starter"

# 3. Open the no-code builder
cd <workspace>/apps/workspace && npm install && npm run dev
```

You land at `http://localhost:3000` — the Workspace Builder. Click `Templates`, pick `Reporting Dashboard`, click `Apply to Current Tab`, click `Save`. You just edited validated config persisted to `growthub.config.json`.

Per-template docs (widgets, positions, bindings) live under [`docs/workspace-templates/`](./workspace-templates/README.md).

---

## What you actually have on disk

```
my-workspace/
├── growthub.config.json           ← the workspace config (V1 contract)
├── apps/workspace/                ← the no-code builder Next.js app
├── .growthub-fork/                ← identity, policy, trace, optional authority
├── SKILL.md / AGENTS.md           ← agent contract
└── docs/                          ← starter docs
```

Edit the config visually in the builder. Edit branding / capabilities / pipelines / integrations directly in `growthub.config.json` (not in the PATCH allowlist). The validator enforces grid invariants, no overlaps, and the canonical canvas shape.

---

## The four no-code lanes

- **Dashboards** — rows in the table; each has a name, status, tabs, widgets
- **Canvas** — the active editing surface; 12 columns × 16 rows
- **Widgets** — Chart / View / iFrame / Rich Text on a fixed grid
- **Workspace Settings + Management** — inspect-only overlays for branding, persistence, adapters, API surface, capabilities

---

## Persistence

| Mode | When | Save behavior |
| --- | --- | --- |
| `filesystem` | Local Next.js dev or `WORKSPACE_CONFIG_ALLOW_FS_WRITE=true` | Writes `growthub.config.json` |
| `read-only` | Vercel / Netlify default | `PATCH /api/workspace` returns `409 + guidance` |
| `database` | Reserved (V2) | Not implemented in V1 |

The Workspace Settings overlay shows you exactly which mode is active and what Save will do.

---

## Reference contracts

- [`docs/WORKSPACE_CONFIG_CONTRACT_V1.md`](./WORKSPACE_CONFIG_CONTRACT_V1.md)
- [`docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md`](./GOVERNED_WORKSPACE_TOPOLOGY_V1.md)
- [`docs/WORKSPACE_BUILDER_RUNTIME_V1.md`](./WORKSPACE_BUILDER_RUNTIME_V1.md)
- [`docs/SOURCE_IMPORT_TO_WORKSPACE_BUILDER.md`](./SOURCE_IMPORT_TO_WORKSPACE_BUILDER.md)
- [`docs/WORKSPACE_DEPLOY_FLOW.md`](./WORKSPACE_DEPLOY_FLOW.md)
- [`docs/workspace-templates/`](./workspace-templates/README.md) — per-template widgets, positions, bindings

---

[← Back to README](../README.md)
