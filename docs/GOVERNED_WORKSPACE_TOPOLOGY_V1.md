# Governed Workspace Topology V1

This document defines the official topology of a governed workspace produced by `growthub-custom-workspace-starter-v1`. It answers:

- What files define the workspace?
- Which are local? Which are hosted?
- What is config vs. policy vs. trace?
- What is deployable?

---

## Directory topology

```
Governed Workspace (root)
├── growthub.config.json          ← local workspace config (V1 contract)
├── apps/
│   └── workspace/                ← Next.js builder app (deployable)
│       ├── app/
│       │   ├── workspace-builder.jsx   ← no-code builder client component
│       │   ├── page.jsx                ← server entry + adapter env read
│       │   └── api/workspace/route.js  ← GET + PATCH API boundary
│       ├── lib/
│       │   ├── workspace-schema.js     ← V1 config contract + validator
│       │   ├── workspace-config.js     ← read/write + persistence mode
│       │   └── adapters/               ← thin adapter layer
│       │       ├── env.js              ← reads all adapter env vars
│       │       ├── auth/               ← auth adapter descriptor
│       │       ├── integrations/       ← integration adapter + normalizer
│       │       ├── payments/           ← payments adapter descriptor
│       │       └── persistence/        ← persistence adapter descriptors
│       └── growthub.config.json  ← active workspace config (runtime read/write)
├── .growthub-fork/               ← fork identity + governance
│   ├── fork.json                 ← fork identity (id, source, kit version)
│   ├── policy.json               ← operator policy (protected paths, allowed ops)
│   ├── trace.jsonl               ← append-only lifecycle event log
│   ├── project.md                ← human-readable session memory
│   ├── agents/                   ← optional per-agent state (future)
│   └── capabilities/             ← optional self-improving capability proposals
├── SKILL.md                      ← discovery entry + routing menu (primitive #1)
├── AGENTS.md                     ← agent contract pointer (primitive #2)
├── helpers/                      ← safe shell tool layer (primitive #6)
│   ├── propose-capability.mjs
│   ├── promote-capability.mjs
│   └── check-self-improving-health.sh
├── skills/                       ← sub-skill convention (primitive #5)
│   └── README.md
├── templates/                    ← session memory seeds
│   ├── project.md
│   └── self-eval.md
└── docs/                         ← kit-level documentation
    ├── adapter-contracts.md
    ├── governed-workspace-primitives.md
    └── ...
```

---

## Authority boundaries

| Layer | What it owns | Who controls it |
|-------|-------------|-----------------|
| **Local config** | `growthub.config.json` — dashboard layout, widget placements, canvas state | Operator (you) |
| **Local fork policy** | `.growthub-fork/policy.json` — protected paths, allowed operations | Operator, optionally with Growthub Bridge attestation |
| **CLI export** | `growthub kit download` / `growthub starter init` — materialises the kit tree | CLI (`@growthub/cli`) |
| **Serverless runtime** | The deployed Next.js app at Vercel/Netlify — reads config, serves builder | Hosting provider |
| **Growthub Bridge** | Hosted auth, integration adapters, workflow execution | Growthub (hosted, optional) |
| **Hosted execution** | CMS pipelines, dynamic pipelines, saved workflows | Growthub (hosted, opt-in) |

---

## Ref contract

Every governed workspace is identified by this set of references. Agents and operators can reconstruct the full workspace state from these fields.

| Field | Source | Notes |
|-------|--------|-------|
| `workspace.id` | `growthub.config.json#id` | Stable workspace identifier |
| `source.type` | `kit \| starter \| repo \| skill \| greenfield` | How the workspace was created |
| `starter.kitId` | `growthub-custom-workspace-starter-v1` | Fixed for this kit |
| `fork.id` | `.growthub-fork/fork.json#id` | Unique fork identifier |
| `config.path` | `growthub.config.json` (relative to workspace root) | Config source of truth |
| `apps.path` | `apps/workspace/` | Builder app root |
| `persistence.mode` | `filesystem \| read-only` | From `describePersistenceMode()` |
| `integration.adapter` | `static \| growthub-bridge \| byo-api-key` | From `AGENCY_PORTAL_INTEGRATION_ADAPTER` env |
| `authority.present` | boolean | Whether `.growthub-fork/authority.json` exists |

---

## Local vs. hosted boundary

```
LOCAL (this repo / this machine)
  growthub.config.json              ← config state
  apps/workspace/lib/workspace-*    ← validator + persistence
  apps/workspace/app/api/workspace  ← REST boundary
  .growthub-fork/                   ← identity + governance

  ─────────────────────────────────
  The PATCH /api/workspace boundary

HOSTED (Growthub, optional)
  Growthub Bridge                   ← integration adapter for live data
  Growthub CMS pipelines            ← workflow execution
  Growthub auth                     ← identity + authority
  Governed Workspace Agents         ← hosted agents bound to fork-sync workspaces
```

Nothing in the workspace app makes outbound requests to hosted services by default. The integration adapter is `static` unless `AGENCY_PORTAL_INTEGRATION_ADAPTER=growthub-bridge` and a valid `GROWTHUB_BRIDGE_*` env set is configured.

---

## What agents should inspect first

When an agent is dropped into a governed workspace, read in this order:

1. `.growthub-fork/project.md` — session memory (prior agent state + decisions)
2. `SKILL.md` — routing menu and decision tree
3. `AGENTS.md` — agent contract pointer (leads to authoritative rules)
4. `workers/custom-workspace-operator/CLAUDE.md` — execution verbs
5. `.growthub-fork/policy.json` — protected paths + allowed ops
6. `.growthub-fork/trace.jsonl` (tail 20) — machine history
7. `growthub.config.json` — current workspace config
8. `docs/WORKSPACE_CONFIG_CONTRACT_V1.md` — config schema reference

---

## What is deployable

The `apps/workspace/` subtree is a standard Next.js app. It can be deployed to:

- Vercel (read-only config, `AGENCY_PORTAL_DEPLOY_TARGET=vercel`)
- Any Node.js-capable host with filesystem write access (`WORKSPACE_CONFIG_ALLOW_FS_WRITE=true`)

The workspace builder runs entirely in the browser from the built Next.js app. No bridge connection is required for the UI to function.

---

## V1 limitations

- No per-dashboard independent canvas state in the builder UI (all dashboards share the active canvas on switch; per-dashboard tabs are persisted in `dashboard.tabs`).
- No remote data fetching from widget configs.
- No bridge-backed widget execution from the browser.
- No database persistence (adapter seam exists; no UI yet).
