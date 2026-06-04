# Governed Workspace Topology V1

The official map of what a Growthub governed workspace is, what files own which behavior, and where the local-vs-hosted authority boundary sits. Agents and humans should read this before they edit a workspace.

This document does not introduce new architecture. It names what already exists in the shipped `growthub-custom-workspace-starter-v1` kit so the boundary is explicit.

---

## What a governed workspace is

A governed workspace is the unit of portable agent work that comes out of `growthub-custom-workspace-starter-v1`. It is:

- a directory tree exported by the CLI,
- carrying its own identity / policy / trace inside `.growthub-fork/`,
- shipping a config-backed no-code dashboard builder at `apps/workspace`,
- runnable locally (filesystem mode) or deployable to a serverless target (read-only mode) without rewriting,
- agent-readable end-to-end through `SKILL.md`, `AGENTS.md`, `templates/project.md`, `templates/self-eval.md`, `helpers/`, and `skills/`.

The workspace is the top-level product object. Kits, templates, workflows, agents, and source imports are inputs to a workspace, not parallel concepts.

---

## Topology

```
<workspace>/
├── growthub.config.json                  # workspace config (V1 contract)
├── apps/workspace/                       # no-code dashboard builder + /api/workspace
│   ├── app/                              #   Next.js app router
│   ├── lib/workspace-schema.js           #   validator + grid invariants + templates
│   ├── lib/workspace-config.js           #   read/write + persistence adapter
│   ├── lib/adapters/                     #   env / auth / payments / persistence / integrations
│   └── growthub.config.json              #   active config the builder edits
├── .growthub-fork/                       # governed fork state — canonical
│   ├── fork.json                         #   identity (forkId, kitId, baseVersion)
│   ├── policy.json                       #   operator contract (remoteSyncMode, autoApprove)
│   ├── trace.jsonl                       #   append-only typed event log
│   ├── project.md                        #   session memory (seeded from kit template)
│   ├── authority.json (optional)         #   ed25519-signed attestation when attached
│   ├── agents/<slug>.json (optional)     #   hosted agent bindings (read-only projection)
│   └── capabilities/proposals/ (opt.)    #   self-improving loop proposals
├── SKILL.md                              # discovery entry — primitive #1
├── skills.md                             # operator runbook — deep
├── AGENTS.md                             # agent contract pointer — primitive #2
├── templates/                            # project.md / self-eval.md / brief / agent-contract
├── helpers/                              # safe shell tool layer — primitive #6
├── skills/                               # nested sub-skills — primitive #5
├── workers/<id>/CLAUDE.md                # worker agent contract
├── brands/                               # brand kits + per-client overrides
└── docs/                                 # starter kit docs
```

The canonical state lives in the artifact itself. Discovery indexes and CLI-owned homes are supporting surfaces, not the source of truth.

---

## File-by-file authority

| Path | What it is | Who writes it |
| --- | --- | --- |
| `growthub.config.json` | Workspace config — dashboards, widgetTypes, canvas, governed `dataModel.objects`, branding, capabilities, integrations. | The no-code builder and Data Model page via `PATCH /api/workspace` (filesystem mode). Operator manually inside the fork. |
| `apps/workspace/lib/workspace-schema.js` | Validator, grid invariants, template envelope, default config. | Operator inside a governed fork. Never via API. |
| `apps/workspace/lib/workspace-config.js` | Persistence adapter (filesystem / read-only / future database). | Operator inside a governed fork. |
| `apps/workspace/app/api/workspace/route.js` | `GET` returns config + adapters + persistence; `PATCH` mutates only allowlisted fields. | Operator inside a governed fork. |
| `.growthub-fork/fork.json` | Identity. | The CLI on `kit fork register` / `starter init`. |
| `.growthub-fork/policy.json` | Operator contract (e.g. `remoteSyncMode=pr`, `autoApprove=additive`). | The CLI on `kit fork policy ... --set ...`. |
| `.growthub-fork/trace.jsonl` | Append-only typed event log. | The CLI on every governed lifecycle event. Never bypass. |
| `.growthub-fork/project.md` | Session memory. | Both human and agent — append-only. |
| `.growthub-fork/authority.json` | Hosted attestation envelope. | `growthub kit fork authority ...`. |
| `.growthub-fork/agents/<slug>.json` | Hosted agent binding (read-only projection of a hosted agent). | `growthub bridge agents bind ...`. |
| `.growthub-fork/capabilities/proposals/<slug>.json` | Self-improving capability proposals. | `growthub workspace improve propose|promote|reject`. |

---

## Authority boundary

```
+----------------------------------------+
|              LOCAL                     |
| - growthub.config.json                 |
| - apps/workspace (Next.js app router)  |
| - .growthub-fork/ (artifact-canonical) |
| - filesystem persistence (dev / opt-in) |
| - SKILL.md / AGENTS.md / helpers       |
+----------------------------------------+
                    |
                    | optional, additive
                    v
+----------------------------------------+
|         HOSTED AUTHORITY (Bridge)      |
| - identity: growthub auth login        |
| - integrations: gh-app credentials     |
| - hosted agents: bridge agents bind    |
| - workflow execution: hosted only      |
| - bridge resources: brands, knowledge  |
+----------------------------------------+
```

Hard rules:

1. The **browser** never executes a hosted workflow, never holds a Bridge access token, never decides authority. The no-code builder edits config; execution, when it happens, happens on the hosted side or on the local CLI.
2. The **filesystem persistence** adapter is opt-in for non-dev runtimes (`WORKSPACE_CONFIG_ALLOW_FS_WRITE=true`). The default for serverless deploys is `read-only` with a 409 + guidance string.
3. **`PATCH /api/workspace`** is restricted to `dashboards`, `widgetTypes`, `canvas`, and `dataModel`. `dataModel.objects` is a governed manual object surface; creating or editing one must not create a widget or mutate canvas placement. Other fields are preserved through the round-trip but never accepted on PATCH.
4. **Trace and policy** are append-only and write-through-the-CLI. Hand-edits to `trace.jsonl` are not part of the V1 contract.

## Governed data objects

`dataModel.objects[]` is the local, config-backed surface for manual business objects. It exists to let an operator define fields and rows before deciding whether any dashboard should render them.

Rules:

1. Data Model object creation writes only `growthub.config.json#dataModel.objects[]`.
2. Existing dashboard View widgets remain discoverable as data model tables, so dashboards created from templates or by hand still appear on `/data-model`.
3. Binding a Data Model object to a dashboard is a separate user action inside an existing View widget's Source panel.
4. The View widget stores a stable reference (`widget.config.binding.sourceType = "workspace-data-model"` and `objectId`) plus widget-local presentation settings. The object rows and fields remain owned by `dataModel.objects[]`.
5. Integration-backed source objects continue to use the integration resolver path; the browser stores references and normalized metadata, not provider credentials.
6. **Sandbox Environment** (`objectType: "sandbox-environment"`) rows describe where and how workloads run (`runLocality`, adapter, optional `schedulerRegistryId` → API Registry). They persist in the same `dataModel.objects[]` surface as other governed objects. They are **not** bindable as View widget sources; execution is `POST /api/workspace/sandbox-run`. Details and the `growthub-sandbox-run-v1` envelope live in the starter kit at `apps/workspace/docs/sandbox-environment-primitive.md` (materialized path under `growthub-custom-workspace-starter-v1`).
7. **Codex Sites** (`id: "workspace-codex-sites"`) rows bind real Codex-hosted site URLs into the governed custom object surface. Builder creates or opens this object, the record sidecar selects an available site through the workspace adapter, and Builder renders each bound row as a Site item with a new-tab URL action. Local smoke tests for Codex Sites must run from an exported or temporary workspace copy so account-specific rows do not mutate the open source starter template. See [`docs/CODEX_SITES_WORKSPACE_PRIMITIVE_V1.md`](./CODEX_SITES_WORKSPACE_PRIMITIVE_V1.md).

---

## Reference contract

The minimal field set an agent or buyer needs to inspect a governed workspace:

```ts
{
  workspaceId:        string,            // = growthub.config.json#id
  starterKitId:       "growthub-custom-workspace-starter-v1",
  forkId:             string,            // = .growthub-fork/fork.json#forkId
  kitId:              string,            // = .growthub-fork/fork.json#kitId
  configPath:         "growthub.config.json",
  appsPath:           "apps/workspace",
  persistenceMode:    "filesystem" | "read-only" | "database",
  integrationAdapter: "static" | "growthub-bridge" | "byo-api-key",
  authority?: {
    attached:         boolean,           // = exists(.growthub-fork/authority.json)
    issuer?:          string,
    expiresAt?:       string
  },
  agents?:            string[],          // hosted agent slugs bound
  capabilities?: {
    proposals:        number,
    promoted:         number
  }
}
```

This is the shape an agent should be able to derive in a single read pass over the workspace tree.

---

## Inspection order for agents

When dropped into a governed workspace directory:

1. `SKILL.md` — the discovery entry of the kit
2. `.growthub-fork/project.md` — session memory (your prior state)
3. `AGENTS.md` (or pointer file) — agent contract
4. `.growthub-fork/policy.json` — what you may touch
5. `.growthub-fork/trace.jsonl` — the last 20 events, for context
6. `growthub.config.json` — current workspace config (the V1 contract)
7. `apps/workspace/lib/workspace-schema.js` — what valid edits look like

Then, if hosted authority is attached:

8. `.growthub-fork/authority.json` — attestation
9. `.growthub-fork/agents/*.json` — hosted agent bindings

---

## Out of scope for V1

- Hosted persistence (`database` adapter is reserved, not implemented)
- Bridge-backed widget bindings (`docs/BRIDGE_BACKED_WIDGETS_V1_PLAN.md`)
- Browser workflow execution
- Token exposure to the client
- New widget kinds beyond `chart | view | iframe | rich-text`
- Free-form pixel layout (V1 is fixed 12×16 lattice)

The V1 topology is the substrate these additions will land on additively.
