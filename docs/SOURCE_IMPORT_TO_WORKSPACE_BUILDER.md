# Source Import → Workspace Builder

The single product motion behind Growthub Local is:

```
Pick a source  →  Create a governed Workspace  →  Open the Workspace Builder  →  Customize  →  Save / Export / Deploy
```

Every supported source type lands in the same place: a governed Workspace exported from `growthub-custom-workspace-starter-v1`, with `.growthub-fork/` inside, an editable `growthub.config.json`, and the no-code Workspace Builder at `apps/workspace`.

This doc names the path. It does not introduce new commands.

---

## Source-type matrix

| Source | CLI verb | Output | Best for |
| --- | --- | --- | --- |
| GitHub repo | `growthub starter import-repo <owner/repo> --out <path>` | Governed Workspace wrapped around the imported tree | Teams with existing code |
| skills.sh skill | `growthub starter import-skill <owner/repo/skill> --out <path>` | Governed Workspace seeded by the skill | Automation builders |
| Workspace starter | `growthub starter init --kit growthub-custom-workspace-starter-v1 --out <path>` | Empty governed Workspace, ready for the builder | New projects |
| Workspace template | `growthub kit download growthub-custom-workspace-starter-v1 --out <path>` | Official governed Workspace starter | New governed workspaces |
| Hosted template (post-Bridge) | `growthub bridge agents bind <slug> --workspace-path <path>` | Governed Workspace with a hosted agent bound | Hosted activation |

All five paths land at the same artifact shape (`docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md`):

```
<workspace>/
├── growthub.config.json
├── apps/workspace/                  # the no-code Workspace Builder
├── .growthub-fork/                  # identity / policy / trace / optional authority
├── SKILL.md / AGENTS.md / helpers / skills / templates
└── docs/
```

---

## The path, end to end

```
1. Install
     npm create @growthub/growthub-local@latest

2. Choose source
     • GitHub repo        → growthub starter import-repo
     • skills.sh skill    → growthub starter import-skill
     • workspace starter → growthub starter init
     • workspace template → growthub kit download
     • hosted template    → growthub bridge agents bind

3. Open the Workspace Builder
     cd <workspace>/apps/workspace
     npm install
     npm run dev

4. Customize
     • Pick a template (Templates button)
     • Add / resize / configure widgets on the 12×16 grid
     • Edit dashboard rows, tabs, status, branding (in growthub.config.json)
     • Workspace Settings overlay — inspect-only branding / persistence / adapters
     • Management overlay — inspect-only API / Workflows / Integrations / Persistence

5. Save / Export
     • Save → PATCH /api/workspace (filesystem mode) → growthub.config.json
     • Export → growthub-workspace-template envelope (v1)

6. Deploy
     • docs/WORKSPACE_DEPLOY_FLOW.md

7. Optional: connect Bridge
     growthub auth login
     growthub bridge agents bind <slug>
```

---

## Why this matters

- **Source heterogeneity is normalized.** A GitHub repo, a skill, a kit, and a starter-created workspace all collapse into the same governed object. Agents and humans operate against the same `growthub.config.json` + `.growthub-fork/` shape regardless of origin.
- **The Workspace Builder is reachable from every entry point.** Once a Workspace exists, `apps/workspace` is the no-code admin surface. There is no separate UI per source type.
- **The hosted authority layer is additive.** Local Workspaces work without Bridge. Bridge attaches identity, hosted agents, integrations, and CMS pipeline execution when needed.
- **Validation is uniform.** Every Workspace passes through `validateWorkspaceConfig` (schema), `kit health` (kit shape), `skills validate` (SKILL.md), and the existing CI smoke / verify / validate gates.

---

## Cross-links

- [`docs/FIRST_RUN_PATHS.md`](./FIRST_RUN_PATHS.md) — fast paths for each source type
- [`docs/WORKSPACE_STARTER_ACTIVATION_PATH.md`](./WORKSPACE_STARTER_ACTIVATION_PATH.md) — full activation walkthrough
- [`docs/WORKSPACE_BUILDER_RUNTIME_V1.md`](./WORKSPACE_BUILDER_RUNTIME_V1.md) — what the builder runtime is
- [`docs/WORKSPACE_CONFIG_CONTRACT_V1.md`](./WORKSPACE_CONFIG_CONTRACT_V1.md) — the canonical config shape
- [`docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md`](./GOVERNED_WORKSPACE_TOPOLOGY_V1.md) — what's inside a Workspace
- [`docs/WORKSPACE_DEPLOY_FLOW.md`](./WORKSPACE_DEPLOY_FLOW.md) — how to ship a Workspace
