# Workspace Template Marketplace V1 — Plan

Companion plan to the 0.13.6 sprint reframing. Productizes the **workspace-template primitive** that already shipped as a one-off with the Project Management template, generalizes its registry, and exposes it through the surfaces that already exist (builder gallery, CLI, discover hub, publish contract, fork trace).

This plan does **not** invent a new contract layer. It collapses the hardcoded `PROJECT_MANAGEMENT_TEMPLATE_ID` special case in `cli/src/commands/kit.ts` into a generic loop, lifts `templates/seeded-configs/` into a first-class catalog, and derives a Production Readiness Score from primitives already on disk.

## Architectural anchor (do not violate)

A **workspace template** is a sanitized **full Data Model seed**, not a dashboard layout. Layout presets are a sub-primitive (`DASHBOARD_TEMPLATES` in `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-schema.js:289`) that the builder already surfaces through `TemplateGallery` (`workspace-builder.jsx:1343`).

The productized unit is the chain the PM template already proved:

```
api-registry row  ──►  data-source row  ──►  sandbox-environment row
   (the wire)         (the entity bound)      (orchestrationConfig JSON
                                                = the workflow graph)
                              │
                              ▼
                       dashboard widget
                       (bound by source name,
                        not by registry id)
```

Separation of concerns is enforced by the PATCH allowlist (`dashboards`, `widgetTypes`, `canvas`, `dataModel`) at `apps/workspace/app/api/workspace/route.js`. Templates ride that allowlist — they do not bypass it. Secrets stay as `authRef` references (`NANGO_SECRET_KEY` etc.); no provider keys, OAuth connection ids, or task rows enter the seed.

Reference seed: `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/templates/seeded-configs/project-management.config.json` — full registry + source + sandbox + workflow + dashboard, sanitized, with `provenance.templateKind: "workspace-template"`.

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

The methodology you formalized maps cleanly onto primitives that already ship — no new runtime. The deliverable is a single `agentic-qa-swarm.config.json` seed in the registry.

### Phase → primitive mapping

| Methodology phase | Existing primitive |
|---|---|
| Investigative Architect | `sandbox-environment` row, `runLocality: local`, prompt seeded from `templates/project.md` |
| Parallel Implementation Swarm | N `sandbox-environment` rows fanned out; `orchestrationConfig` has an `api-registry-call` per worker |
| Adversarial QA Gate | One `sandbox-environment` row whose `instructions` field is the gate prompt; verdict written to `lastResponse` |
| Merge Synthesis | `transform-filter` + `tool-result` nodes inside the orchestration JSON |
| Iterative Contraction Loop | `selfEval.maxRetries` bounded loop in `cli/src/skills/self-eval.ts` |
| Strategic Reframer | Final `sandbox-environment` row, run after the gate verdict |
| Retrospective | The append-only `.growthub-fork/trace.jsonl` history itself |

### Edits

- **New file** `cli/assets/workspace-templates/agentic-qa-swarm.config.json` — full Data Model seed wiring the six phases above as governed rows, with `orchestrationConfig` JSON shaped like the PM template's workflow graph (input → api-registry-call → transform-filter → tool-result).
- **Manifest entry** with `readinessCriteria[]` listing exactly the selfEval criteria that constitute "production gate passed."
- **Dashboard** in the seed: one tab per phase (Investigation, Workers, Gate, Merge, Contraction, Reframer), each bound to its phase's `data-source` row so the user watches the swarm run row-by-row.
- **No new CLI surface required** — the seed lands through `growthub workspace template create agentic-qa-swarm`, same path as PM.

This template is the proof that AWaC is the production-readiness platform, not a creative tool. It runs on disk, leaves a trace, scores on the same readiness badge, and can itself be forked and customized.

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
