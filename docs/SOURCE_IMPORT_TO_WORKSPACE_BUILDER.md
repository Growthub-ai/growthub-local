# Source Import to Workspace Builder

This document explains how every source type flows into a governed workspace and into the no-code Workspace Builder.

The user journey is:

```
Source (GitHub repo / skill / starter / worker kit / greenfield)
  → CLI import or init
  → Governed workspace (with .growthub-fork/ + growthub.config.json)
  → Workspace Builder opens (apps/workspace/)
  → Dashboard surface, templates, config
  → Export / deploy
```

---

## Source type matrix

| Source type | CLI command | What is created |
|-------------|-------------|-----------------|
| GitHub repo | `growthub starter import-repo <owner/repo> --out <path>` | Governed workspace seeded from the repo, with `.growthub-fork/` identity |
| skills.sh skill | `growthub starter import-skill <owner/repo/skill> --out <path>` | Governed workspace seeded from the skill definition |
| Starter kit (greenfield) | `growthub starter init --out <path>` | Fresh governed workspace from `growthub-custom-workspace-starter-v1` |
| Worker kit | `growthub kit download <kit-id> --out <path>` | Worker kit materialised locally; fork registration available |
| Guided installer | `npm create @growthub/growthub-local@latest` | Profile-first installer that routes to any of the above |

All paths produce (or can attach to) a governed workspace with the same six architectural primitives.

---

## What the Workspace Builder does after import

Once a source has been materialised into a governed workspace:

1. **Dashboard surface** — the builder renders dashboards from `growthub.config.json#dashboards`.
2. **Templates** — the built-in template gallery (client-portal, content-ops, reporting-dashboard, creative-review, agency-delivery, blank) can be applied without leaving the builder.
3. **Config** — all layout and widget state is serialized into `growthub.config.json` through `PATCH /api/workspace`.
4. **Future bindings** — the `canvas.bindings` section reserves slots for bridge data, workflow outputs, and session context when the operator connects Growthub Bridge.

The builder is config-backed: every change the operator makes through the UI writes to `growthub.config.json`. No hosted execution is triggered from the browser.

---

## Import source CTA in the builder

The builder shows an **Import Source** hint in the Management panel when no active bridge is connected. This is an inspect-only hint, not a live import flow:

- It points to `growthub starter import-repo` and `growthub starter import-skill` in the CLI.
- It reminds the operator that all sources flow into the same governed workspace model.
- It does not open a modal or trigger any import logic from the browser.

To run an actual import, use the CLI from the workspace root:

```bash
growthub starter import-repo <owner/repo> --out ./my-workspace
# or
growthub starter import-skill <owner/repo/skill> --out ./my-workspace
```

---

## Activation path

See [`docs/WORKSPACE_STARTER_ACTIVATION_PATH.md`](./WORKSPACE_STARTER_ACTIVATION_PATH.md) for the full activation sequence from install to running builder.

See [`docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md`](./GOVERNED_WORKSPACE_TOPOLOGY_V1.md) for the complete file topology of a governed workspace.

---

## What is NOT invented here

- No new import engine is added in this sprint.
- No new CLI commands are added in this sprint.
- No fake UI import flow that does not work.
- The builder only shows the Management panel hint — it does not execute imports.
