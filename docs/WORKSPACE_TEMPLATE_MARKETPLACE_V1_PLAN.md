# Workspace Template Marketplace V1 — Plan

Companion plan to the 0.13.6 sprint reframing. Productizes the **workspace-template primitive** that already shipped as a one-off with the Project Management template, generalizes its registry, and exposes it through the surfaces that already exist (builder gallery, CLI, discover hub, publish contract, fork trace).

This plan does **not** invent a new contract layer. It collapses the hardcoded `PROJECT_MANAGEMENT_TEMPLATE_ID` special case in `cli/src/commands/kit.ts` into a generic loop, lifts `templates/seeded-configs/` into a first-class catalog, and derives a Production Readiness Score from primitives already on disk.

## Architectural anchor (do not violate)

A **workspace template** is a sanitized **full Data Model seed**, not a dashboard layout. Layout presets are a sub-primitive (`DASHBOARD_TEMPLATES` in `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-schema.js:289`) that the builder already surfaces through `TemplateGallery` (`workspace-builder.jsx:1343`).

### Legal vocabulary — every template MUST use these existing object types

Authoritative source: `OBJECT_TYPE_PRESETS` at `apps/workspace/lib/workspace-data-model.js:791`. Templates may not invent new object types — every row a template seeds resolves to one of these six presets.

| `objectType` | Role in a template | Widget-bindable? | Relations |
|---|---|---|---|
| `api-registry` | The wire — endpoint, method, `authRef`, `connectorKind`, `capabilities`, `executionLane`, stored `lastResponse` | No (sources bind, not registries) | — |
| `data-source` | Governed entity the widgets actually read | **Yes** | `belongs-to api-registry` via `registryId` |
| `sandbox-environment` | Execution locality — `runLocality: local` (process or local agent host) or `serverless` (delegates to a scheduler API Registry record). Carries `orchestrationConfig` JSON = the workflow graph. Persists runs to `lastSourceId` in source-records | **No** — sandbox rows are not widget sources; outputs surface via the `data-source` row whose `sourceId` matches the sandbox's `lastSourceId` | `belongs-to api-registry` via `schedulerRegistryId` (when serverless) |
| `tasks` | Action items / numbered gap tracking | Yes | — |
| `people` | Contacts, owners, assignees | Yes | — |
| `custom` | Domain-specific table | Yes | — |

### The productized chain (the PM template proved it)

```
api-registry row  ──►  data-source row  ──►  dashboard widget
   (the wire)         (the entity bound)        (binds to source name)
                              ▲
                              │ writes lastSourceId
                              │
                      sandbox-environment row
                      (orchestrationConfig JSON
                       = the workflow graph)
                              │
                              │ when runLocality=serverless
                              ▼
                       api-registry row
                       (the scheduler target)
```

Widgets bind to `data-source` rows. `sandbox-environment` rows execute the workflow and persist into source-records; the matching `data-source` row exposes that persisted data to widgets. This separation is enforced by the PATCH allowlist (`dashboards`, `widgetTypes`, `canvas`, `dataModel`) at `apps/workspace/app/api/workspace/route.js`. Templates ride that allowlist — they do not bypass it.

Secrets stay as `authRef` references (`NANGO_SECRET_KEY` etc.); no provider keys, OAuth connection ids, or task rows enter the seed.

Reference seed: `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/templates/seeded-configs/project-management.config.json` — registry row + source row + sandbox row (with `orchestrationConfig`) + dashboard, sanitized, with `provenance.templateKind: "workspace-template"`.

---

## Phase 0 — Generalize the registry (collapse the special case)

The PM template proves the shape. The marketplace move is removing the one-off plumbing so the second, third, and Nth template each cost one config file plus one manifest row, not a code edit.

### Edits

- **New file** `cli/assets/workspace-templates/manifest.json` — top-level catalog index.
  - Schema: `{ schemaVersion: 1, templates: [{ id, slug, name, description, category, family, version, bundleId, bundleVersion, seedPath, provenance, badges[], surfaces[], readinessCriteria[] }] }`.
  - First two rows mirror what already ships:
    - `project-management-workspace-template-v1` — seed `worker-kits/growthub-custom-workspace-starter-v1/templates/seeded-configs/project-management.config.json`
    - `alignment-loop-workspace-template-v1` — seed `…/seeded-configs/alignment-loop.config.json` (already on disk, not yet registered).

- **`cli/src/commands/kit.ts:38-50`** — delete the hardcoded `PROJECT_MANAGEMENT_TEMPLATE` literal. Replace with a `loadWorkspaceTemplateRegistry()` helper that reads the manifest above.
- **`cli/src/commands/kit.ts:94-97`** — replace `isWorkspaceTemplateId()` body with a manifest lookup; keep the legacy aliases (`project-management`, `project-management-workspace`) as alias entries in the manifest, not as string literals in code.
- **`cli/src/commands/kit.ts:103-110`** — `listKitAndWorkspaceTemplates()` becomes `[...starter, ...registry.templates.map(toKitListItem)]`.
- **`cli/src/commands/kit.ts:112-124`** — `createProjectManagementWorkspace()` collapses into a generic `createFromWorkspaceTemplate(slug, opts)` that resolves `seedPath` from the manifest and calls `runStarterInit({ seedConfig: slug })`.
- **`cli/src/starter/init.ts:86-114`** — `applySeededConfig` already resolves seeds from inside the kit. Add a fallback that resolves from the top-level `cli/assets/workspace-templates/` registry when the slug is not found in `templates/seeded-configs/`. Keep the in-kit lookup first to preserve `frozenAssetPaths` invariants.

### What this unlocks

After Phase 0, adding a new workspace template = drop a `*.config.json` + one manifest row. Zero TypeScript edits. Every downstream surface (`growthub kit list`, `growthub kit inspect`, `growthub kit download <slug>`, `growthub discover` → "Browse Custom Workspaces") picks it up by enumeration.

### Risks to surface in PR

- `frozenAssetPaths` in `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/kit.json:48-50` lists the two seed files. Decide explicitly: leave them frozen-in-kit (templates are *mirrors* of starter seeds), or migrate the canonical copy to the top-level registry and update `frozenAssetPaths`. The plan recommends **leave frozen, alias from registry** — the kit stays self-contained for fork sync.

---

## Phase 1 — CLI surface (no noun collision)

`growthub template` is already taken by the creative-artifact library (ad-formats, scene-modules, marketing-frameworks). See `cli/src/commands/template.ts`. Do **not** overload it.

### Edits

- **New file** `cli/src/commands/workspace-template.ts` — mirrors the shape of `cli/src/commands/workspace-helper.ts` and `cli/src/commands/workspace-improve.ts`.
- Subcommands:
  - `growthub workspace template list [--json] [--category <c>]` — enumerates the registry from Phase 0.
  - `growthub workspace template inspect <slug> [--json]` — prints seed summary (objects[], dashboards[], canvas, provenance, readiness criteria) without copying.
  - `growthub workspace template create <slug> [--out <dir>] [--name <n>] [--yes]` — thin wrapper over `runStarterInit({ seedConfig: slug })`. This is the surgical replacement for the hardcoded `createProjectManagementWorkspace`.
  - `growthub workspace template publish <dir> [--draft] [--curated]` — re-uses `cli/src/commands/kit-publish.ts` under the hood; only difference is the manifest `templateKind: "workspace-template"` and stricter sanitization checks (see Phase 3).
- **`cli/src/index.ts`** — register the new command tree next to the existing `workspace` group.
- **`cli/src/index.ts:2496-2500`** — update the `growthub kit download project-management` example to point at the new `growthub workspace template create project-management` path; keep the old form working via the alias entry.

### Discover-hub wiring

- **`cli/src/index.ts` → `runDiscoveryHub`** — under "Browse Custom Workspaces", the current screen lists `growthub-custom-workspace-starter-v1` + PM template. After Phase 0 it auto-grows. Add a one-line filter: **"Templates (full Data Model seeds)"** vs **"Starter (blank canvas)"** so the user sees the productized layer without losing the blank path.

---

## Phase 2 — In-app surface (extend, don't fork)

`TemplateGallery` in `workspace-builder.jsx:1343` already filters by category, tag, and free-text query. It only knows about `DASHBOARD_TEMPLATES` (layout presets — a sub-primitive). Do not duplicate it. Extend.

### Edits

- **`apps/workspace/lib/workspace-schema.js:289`** — `DASHBOARD_TEMPLATES` stays as-is (layout presets). It is intentionally not the marketplace surface.
- **New file** `apps/workspace/lib/workspace-template-catalog.js` — exports `WORKSPACE_TEMPLATES` derived from the registry manifest. The starter app reads them at build time from a generated JSON sibling (`workspace-templates.generated.json`) written by the CLI's existing copy step.
- **`apps/workspace/app/workspace-builder.jsx:1306`** — `NORMALIZED_TEMPLATES` becomes a tagged union: `{ kind: "layout", … }` for `DASHBOARD_TEMPLATES`, `{ kind: "workspace-seed", …, readinessBadges, provenance }` for catalog entries.
- **`apps/workspace/app/workspace-builder.jsx:1343-1448` (`TemplateGallery`)** — add a single segmented control at the top: **Layout** | **Full Workspace**. The grid, filters, preview, and footer code below stays. Each surface re-uses the same card shape; the action buttons differ:
  - Layout cards keep `Use Here` / `New Dashboard` (unchanged).
  - Workspace-seed cards show `Open in CLI` (copies the `growthub workspace template create <slug>` command), since applying a full Data Model spine to an already-running workspace is **out of scope for V1** — the import lifecycle goes through the starter-init path so fork registration, policy, and trace seeding all fire correctly.
- **`apps/workspace/app/workspace-builder.jsx:3834` (`templateGalleryOpen` state)** — first-run UX: if `growthub.config.json` has no user-edited dashboards or canvas widgets, the gallery opens **automatically** on first dev-server boot, defaulted to the **Full Workspace** segment. Closing it sets a `.growthub-fork/first-run.json` flag so it stays closed afterward. (No new persistence layer — reuse the existing `.growthub-fork/` lifecycle directory.)

### What this is **not**

This is not "in-app workspace cloning." Full-workspace templates land via the starter-init path so every governed-workspace primitive (fork registration, `growthub.config.json` schema validation, `templates/project.md` session memory, `selfEval` criteria, `trace.jsonl` seeding, `frozenAssetPaths` integrity) fires. Bypassing that to "apply a workspace template inside the running app" would break the AWaC contract.

---

## Phase 3 — Production Readiness Score (derivation, no new contract)

This is a pure reducer over data already on disk. No new storage, no new contract, no scoring engine. One resolver in the CLI + one badge in the gallery.

### Inputs (all already exist)

| Signal | Source |
|---|---|
| selfEval pass/fail per criterion | `.growthub-fork/trace.jsonl` (`cli/src/skills/self-eval.ts:57`) |
| selfEval retry budget consumed | `selfEval.maxRetries` vs attempt count in trace |
| API Registry row health | `dataModel.objects[id=api-registry].records[].lastTested` + `lastResponse` shape |
| Data Source health | `dataModel.objects[objectType=data-source].records[].status` + `lastTested` |
| Sandbox Environment last-run | `dataModel.objects[objectType=sandbox-environment].records[].lastRunId` + `status` |
| Kit contract health | `cli/src/commands/kit-contract.ts → runKitHealth` |
| CI gates | `smoke`, `validate`, `verify` exit codes (already in `scripts/pr-ready.sh`) |
| Workflow node validation | `cli/src/runtime/cms-workflow-context/compose.ts` packet checks |

### Edits

- **New file** `cli/src/runtime/readiness/score.ts` — pure function `computeReadiness({ forkPath, configPath, traceTail }): { score: 0..100, tier: "draft"|"reviewable"|"production", findings: Finding[] }`.
- **New file** `cli/src/commands/workspace-readiness.ts` — exposes `growthub workspace readiness [--json]` (mirrors `growthub workspace status --json` ergonomics).
- **`apps/workspace/app/api/workspace/route.js`** — extend the GET handler to include a `readiness` block derived server-side (same resolver, imported from the CLI package). No new endpoint; no schema change to PATCH.
- **`apps/workspace/app/workspace-builder.jsx`** — render a small tier badge (`draft` / `reviewable` / `production`) in the workspace header. Click → opens a side panel listing `findings[]` with deep links to the row that needs `lastTested` filled in, the criterion that failed, etc.

### What the score is not

Not a vanity number. The score is **the count of green primitives**: did the API Registry row actually return 2xx in the last run, did the workflow validate, did the selfEval criteria pass within `maxRetries`. If any input is missing, the corresponding finding lists *exactly which row, which field, which command to run*. The score is a navigation aid, not a marketing badge.

---

## Phase 4 — Publish / Submit-for-Curation (ride existing contract)

`KIT_PUBLISH_CONTRACT_V1` and `growthub kit publish` already implement signed, sanitized publishing. A workspace template is a sanitized seed plus a manifest entry. Do not write a parallel pipeline.

### Edits

- **`cli/src/commands/kit-publish.ts`** — add a `--kind workspace-template` branch. Same flow (validate → sign → bundle → upload) with stricter pre-flight sanitization:
  - Reject if any record contains a value matching `process.env`-style secret patterns or known provider id shapes (Asana gid, OAuth connection id, Nango secret).
  - Reject if `dashboards[].tabs[].widgets[].config.rows[]` is non-empty (templates ship empty rows; real data must hydrate from a workflow run).
  - Require `provenance.templateKind === "workspace-template"` and `provenance.privacy === "sanitized-no-secrets-no-provider-data"` (the convention the PM template already uses — make it a contract, not a comment).
- **`docs/KIT_PUBLISH_CONTRACT_V1.md`** — add a "Workspace Template profile" section listing the above sanitization rules.
- **No new "Publish to My Library" UI in V1.** The CLI publish flow is the curation gate. An in-app `Publish` button is a Phase-5 follow-up once the curation queue exists.

---

## Phase 5 — QA Swarm methodology as a flagship template

The methodology you formalized maps cleanly onto the six existing `OBJECT_TYPE_PRESETS` — no new object types, no new runtime, no new persistence. The deliverable is a single `agentic-qa-swarm.config.json` seed in the registry whose `dataModel.objects[]` contains only rows of the legal vocabulary defined above.

### Phase → existing object-type mapping

| Methodology phase | Rows seeded (existing types only) | Notes |
|---|---|---|
| Investigative Architect | 1 × `sandbox-environment` (`runLocality: local`, `adapter: local-process`, `instructions` = architect prompt) + 1 × `data-source` whose `sourceId` matches the sandbox's eventual `lastSourceId` | Architect's findings flow `sandbox-environment → source-records → data-source → widget` exactly like the PM template |
| Parallel Implementation Swarm | N × `sandbox-environment` rows (one per worker), each with its own `orchestrationConfig` graph + N matching `data-source` rows | Fan-out is N independent rows, not a new "swarm" object. Each worker's `executionLane` field tags it for filtering |
| Adversarial QA Gate | 1 × `sandbox-environment` row (`instructions` = gate prompt) whose `orchestrationConfig` graph contains `api-registry-call` nodes that read each worker's `data-source` output; verdict written into `lastResponse` and an output `data-source` row | Gate row reads worker outputs via the `data-source` layer — never directly from sandbox rows (which are not bindable) |
| Numbered gap tracking | 1 × `tasks` object whose rows are gap items (`Name` = gap title, `Status` = open/closed, `Priority` = severity, `Assignee` = which worker raised it, `DueDate` optional). Gate row's transform step writes new rows into this object's source-records | This is the user's "numbered gap tracking" requirement — solved by the existing `tasks` preset, no new type |
| Merge Synthesis | The gate row's `orchestrationConfig` uses existing node kinds — `api-registry-call` (read worker outputs), `transform-filter` (merge + dedupe), `tool-result` (write merged source-records) | Same node vocabulary as the PM template's workflow JSON |
| Iterative Contraction Loop | `selfEval.criteria[]` + `selfEval.maxRetries` on the swarm skill (`cli/src/skills/self-eval.ts:57`). Each retry writes to `.growthub-fork/project.md` and `trace.jsonl` | The "Production Gate" pass = all selfEval criteria green within `maxRetries`. No new loop construct |
| Strategic Reframer | 1 × `sandbox-environment` (`instructions` = reframer prompt) run after the gate verdict, reading the gate's output `data-source` | Same shape as the architect row at the top of the chain — symmetry by design |
| Retrospective | `.growthub-fork/trace.jsonl` history (append-only, already on disk) | No new row. Surfaced via the existing trace viewer / readiness panel from Phase 3 |
| Cross-phase scheduling (optional) | When a phase needs `runLocality: serverless`, its sandbox row's `schedulerRegistryId` points at an `api-registry` row whose `executionLane: "qa-swarm-scheduler"` carries the QStash/Edge/cron endpoint | Reuses the existing `belongs-to api-registry` relation on `sandbox-environment`; no new scheduler primitive |

### What the seed contains (concrete object-by-object)

```
dataModel.objects:
  - id: api-registry           # objectType: "api-registry"
    records:                   # one row per external service the workers/gate call
      - integrationId: "llm-completion"        executionLane: "qa-swarm"
      - integrationId: "test-runner"           executionLane: "qa-swarm"
      - integrationId: "git-trace-export"      executionLane: "qa-swarm"
      # (all status: "template", lastTested: "", authRef references only)

  - id: workers                # objectType: "sandbox-environment"
    records:
      - Name: "investigative-architect"  instructions: "<architect prompt>"  executionLane: "qa-swarm"
      - Name: "worker-1"  ...  executionLane: "qa-swarm"
      - Name: "worker-2"  ...  executionLane: "qa-swarm"
      - Name: "worker-3"  ...  executionLane: "qa-swarm"
      - Name: "adversarial-gate"  instructions: "<gate prompt>"  executionLane: "qa-swarm"
      - Name: "strategic-reframer"  instructions: "<reframer prompt>"  executionLane: "qa-swarm"
      # each row carries its own orchestrationConfig JSON
      # all sandbox rows are NOT widget binding sources (per architectural anchor)

  - id: worker-outputs         # objectType: "data-source"
    records:                   # one per sandbox row above (this is what widgets bind to)
      - Name: "investigative-architect-output"  sourceId: "qa-swarm/architect"   registryId: "llm-completion"
      - Name: "worker-1-output"  sourceId: "qa-swarm/worker-1"   ...
      - ...
      - Name: "adversarial-gate-verdict"  sourceId: "qa-swarm/gate"  ...
      - Name: "strategic-reframer-output"  sourceId: "qa-swarm/reframer"  ...

  - id: gaps                   # objectType: "tasks"  ← numbered gap tracking
    records: []                # populated at runtime by the gate row's transform-filter step

dashboards:
  - Phase 1 (Investigation)  → binds to "investigative-architect-output"
  - Phase 2 (Workers)        → binds to "worker-{1..N}-output"
  - Phase 3 (Gate + Gaps)    → binds to "adversarial-gate-verdict" + "gaps" (tasks view)
  - Phase 4 (Reframer)       → binds to "strategic-reframer-output"
  - Phase 5 (Retrospective)  → trace.jsonl viewer panel (from Phase 3 of this plan)

provenance:
  templateKind: "workspace-template"
  privacy: "sanitized-no-secrets-no-provider-data"
  template: "agentic-qa-swarm"
  mirrors: "growthub-custom-workspace-starter-v1"
```

### Edits

- **New file** `cli/assets/workspace-templates/agentic-qa-swarm.config.json` — Data Model seed exactly as enumerated above. Same JSON shape as `project-management.config.json` so the existing `applySeededConfig` path (`cli/src/starter/init.ts:86-114`) accepts it without changes.
- **Manifest entry** with `readinessCriteria[]` listing the `selfEval` criteria that constitute "production gate passed" (architect completed, all worker outputs persisted, gate verdict written, gaps closed or escalated, reframer run).
- **No new CLI surface required** — the seed lands through `growthub workspace template create agentic-qa-swarm`, same starter-init path as PM.
- **No new object types.** Every row uses one of the six existing `OBJECT_TYPE_PRESETS`. If a row needs a field that doesn't exist on its preset, the row uses the preset's existing columns plus the generic per-row fields the schema already permits (`description`, etc.). Anything else is out of scope for V1.

### Why this is meaningful, not a layout exercise

The swarm template proves AWaC is the production-readiness platform: every methodology phase becomes a governed, inspectable, forkable row in the same Data Model that already backs PM. The same `lastTested` / `lastResponse` / `lastSourceId` fields the PM template uses for Asana task deltas now carry the architect's brief, the workers' implementations, the gate's verdict, and the reframer's strategic synthesis. The readiness score from Phase 3 grades the swarm on the same primitives that grade the PM template. The trace, the publish flow, the fork policy, the PATCH allowlist — everything reuses.

---

## Phase 6 — Strategic Reframing (apply your own methodology)

Lead README/CLI/discover-hub copy with the **full Data Model seed** as the productized unit, not "templates" generically. The noun separation matters:

- `growthub template` → creative library (ad-formats, scene-modules, frameworks).
- `growthub workspace template` → governed Data Model seeds (Registry + Source + Sandbox + Workflow + Dashboard).
- `TemplateGallery` (in-app) → segmented: **Layout** (sub-primitive) | **Full Workspace** (the marketplace).

### Edits

- **`README.md:113`** — currently states "Growthub Local currently ships `@growthub/cli@0.13.3` …". Reality on this branch is **0.13.6** (`cli/package.json:3`, `packages/create-growthub-local/package.json:3`). Per `docs/ARTIFACT_VERSIONS.md`, copy the live values from disk in the same PR; do not state versions from memory.
- **`README.md` Start-here block** — surface `growthub workspace template list` as the first command after the one-liner install, ahead of the six numbered first-run paths. It is the highest-leverage activation path after Phase 0–2 ship.
- **`docs/FIRST_RUN_PATHS.md`** — add **Path 0.5: Start from a workspace template** between "Self-improving workspace" and "Import a repo". One-line: "Pick a governed Data Model seed — Registry + Source + Sandbox + Workflow + Dashboard, ready to bind."

---

## Ordering, surface area, exit gates

| Phase | Net new files | Net edited files | Exit gate |
|---|---|---|---|
| 0. Generalize registry | 1 (`manifest.json`) | 2 (`kit.ts`, `init.ts`) | `growthub kit download alignment-loop` works without code edits |
| 1. CLI surface | 1 (`workspace-template.ts`) | 1 (`index.ts`) | `growthub workspace template create project-management` produces an identical tree to the current path |
| 2. In-app surface | 1 (`workspace-template-catalog.js`) | 1 (`workspace-builder.jsx`) | First-run gallery opens to **Full Workspace** segment when fork has no edits |
| 3. Readiness score | 2 (`score.ts`, `workspace-readiness.ts`) | 2 (`route.js`, `workspace-builder.jsx`) | `growthub workspace readiness --json` returns a score for the PM template post-create |
| 4. Publish profile | 0 | 2 (`kit-publish.ts`, `KIT_PUBLISH_CONTRACT_V1.md`) | Publishing the PM seed with a planted secret is rejected |
| 5. QA Swarm template | 1 (`agentic-qa-swarm.config.json`) + manifest row | 0 | `growthub workspace template create agentic-qa-swarm` boots, all six phase rows visible in the Data Model |
| 6. Reframing | 0 | 2 (`README.md`, `FIRST_RUN_PATHS.md`) | Version line on README matches `cli/package.json` on the branch |

Each phase is independently mergeable. Phases 0–2 are the activation lever; 3 is the trust lever; 4–5 are the flywheel lever; 6 is the framing lever.

## What this plan deliberately does **not** do

- No new persistence layer. `.growthub-fork/`, `growthub.config.json`, `trace.jsonl`, and `source-records` already cover state.
- No new PATCH allowlist entries. Templates ride the existing `dashboards` / `widgetTypes` / `canvas` / `dataModel` ceiling.
- No in-app "apply full workspace seed to running workspace." The starter-init lifecycle is the only legal path so governance primitives fire.
- No "marketplace UI" beyond the segmented gallery in V1. Curation gate is the publish CLI. A web marketplace is a V2 conversation once the publish queue has volume.
- No scoring engine. Readiness is a derivation over existing on-disk signals.

## Cross-links

- [`docs/PROJECT_MANAGEMENT_WORKSPACE_TEMPLATE.md`](./PROJECT_MANAGEMENT_WORKSPACE_TEMPLATE.md) — V1 reference seed (Registry + Source + Sandbox + Workflow + Dashboard).
- [`docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md`](./GOVERNED_WORKSPACE_TOPOLOGY_V1.md) — authority boundary the templates must honour.
- [`docs/KIT_PUBLISH_CONTRACT_V1.md`](./KIT_PUBLISH_CONTRACT_V1.md) — pipeline Phase 4 extends.
- [`docs/SKILLS_MCP_DISCOVERY.md`](./SKILLS_MCP_DISCOVERY.md) — selfEval / trace primitives the readiness score derives from.
- [`docs/SOURCE_IMPORT_TO_WORKSPACE_BUILDER.md`](./SOURCE_IMPORT_TO_WORKSPACE_BUILDER.md) — the lifecycle full-workspace templates ride.
- [`docs/ARTIFACT_VERSIONS.md`](./ARTIFACT_VERSIONS.md) — version-grounding rules for the README edit in Phase 6.
