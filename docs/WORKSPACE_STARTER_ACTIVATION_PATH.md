# Workspace Starter Activation Path

The canonical end-to-end journey from install to deployable governed Workspace. Every step uses an already-shipped CLI primitive — this document does not invent commands.

---

## 1. Install

```bash
npm create @growthub/growthub-local@latest
```

Or the curl one-liner:

```bash
curl -fsSL https://raw.githubusercontent.com/Growthub-ai/growthub-local/main/scripts/install.sh | bash
```

CLI-only:

```bash
npm install -g @growthub/cli
```

Versions are read from `cli/package.json` and `packages/create-growthub-local/package.json` per [`docs/ARTIFACT_VERSIONS.md`](./ARTIFACT_VERSIONS.md).

---

## 2. Choose a source

Pick the path that matches where you are.

| Source | Command |
| --- | --- |
| GitHub repo | `growthub starter import-repo <owner/repo> --out ./my-workspace` |
| skills.sh skill | `growthub starter import-skill <owner/repo/skill> --out ./my-workspace` |
| Greenfield starter | `growthub starter init --kit growthub-custom-workspace-starter-v1 --out ./my-workspace` |
| Worker kit | `growthub kit download <kit-id> --out ./my-workspace` |
| Self-improving profile | `npm create @growthub/growthub-local@latest -- --profile self-improving --out ./my-workspace` |

All five land at the same artifact shape — see [`docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md`](./GOVERNED_WORKSPACE_TOPOLOGY_V1.md).

---

## 3. Export governed Workspace

The CLI auto-registers the destination as a fork on `starter init` / `kit download`. Verify:

```bash
cd ./my-workspace
cat .growthub-fork/fork.json
growthub kit fork status <fork-id> --json
```

---

## 4. Open the Workspace Builder

```bash
cd apps/workspace
npm install
npm run dev
```

The builder is config-backed and inspect-friendly. The on-canvas UI mirrors the V1 baseline screenshot (`docs/WORKSPACE_BUILDER_RUNTIME_V1.md`):

- Left rail — Dashboards, Canvas, Widgets, Bindings, Integrations, Workspace Settings, Management
- Toolbar — Templates, New Dashboard, Duplicate, Import, Export, Save
- Canvas — 12-column × 16-row fixed grid
- Right widget panel — Twenty-style settings + Duplicate / Remove actions

---

## 5. Choose a template

Click `Templates` in the toolbar. Pick from the gallery:

- Blank
- Client Portal
- Content Ops
- Reporting Dashboard
- Creative Review
- Agency Delivery

Apply to current tab, or clone as a new dashboard. Templates clone with fresh widget IDs and write to the active config.

Per-template docs live under [`docs/workspace-templates/`](./workspace-templates/README.md) — one page per shipped template, grounded in the actual `DASHBOARD_TEMPLATES` array.

---

## 6. Customize dashboards / tabs / widgets

- New Dashboard — appends a row to `dashboards`
- Duplicate Dashboard — clones the active dashboard with fresh ids
- New Tab / Duplicate Tab — multi-tab canvas
- Drag empty cells — selects placement; click a widget kind in the right palette to add
- Drag widget corners — resize across the fixed cell lattice (overlaps rejected)
- Widget panel — title, kind-specific config, static binding, Duplicate, Remove

---

## 7. Save / Export config

- **Save** → `PATCH /api/workspace` writes `growthub.config.json` (filesystem mode)
- **Export** → downloads a `growthub-workspace-template` envelope (`version: 1`)
- **Import** → accepts wrapped envelope or raw `{dashboards, widgetTypes, canvas}`

`PATCH` allowlist is permanently restricted to `dashboards | widgetTypes | canvas` — see [`docs/WORKSPACE_CONFIG_CONTRACT_V1.md`](./WORKSPACE_CONFIG_CONTRACT_V1.md).

---

## 8. Deploy

Full deploy primitives map: [`docs/WORKSPACE_DEPLOY_FLOW.md`](./WORKSPACE_DEPLOY_FLOW.md).

Visible readiness check from the CLI:

```bash
growthub workspace deploy status --json
growthub workspace deploy checklist
```

---

## 9. Optional: connect Growthub Bridge

```bash
growthub auth login
growthub auth whoami
```

After login: hosted agents (`growthub bridge agents list`), integrations (`growthub integrations status`), CMS workflows (`growthub workflow`).

---

## 10. Optional: bind agents / workflows

```bash
growthub bridge agents list --json
growthub bridge agents bind <slug> --workspace-path .
```

Bindings write to `.growthub-fork/agents/<slug>.json`. Execution stays hosted; the binding is a read-only projection.

---

## What is happening under the hood?

| Concept | Where it lives |
| --- | --- |
| Workspace config | `growthub.config.json` |
| Validator + grid invariants | `apps/workspace/lib/workspace-schema.js` |
| Persistence adapter | `apps/workspace/lib/workspace-config.js` |
| API boundary | `apps/workspace/app/api/workspace/route.js` |
| Identity | `.growthub-fork/fork.json` |
| Operator contract | `.growthub-fork/policy.json` |
| Append-only log | `.growthub-fork/trace.jsonl` |
| Session memory | `.growthub-fork/project.md` |
| Hosted attestation | `.growthub-fork/authority.json` |
| Hosted agent bindings | `.growthub-fork/agents/<slug>.json` |
| Self-improving proposals | `.growthub-fork/capabilities/proposals/` |
| Fork sync | `growthub kit fork heal` |
| Bridge authority | `growthub auth login` |

Local stays useful without Bridge. Bridge attaches when you want hosted authority. There is no path that moves hosted execution into the browser.
