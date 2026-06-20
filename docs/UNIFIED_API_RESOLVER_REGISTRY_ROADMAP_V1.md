# Unified API Resolver Registry Roadmap V1

A three-phase, compounding roadmap to make API setup seamless for non-technical
users and legible for agents — by turning the workspace's already-shipped
resolver abstraction into a **single, dynamic, governed resolver registry synced
to the API Registry object records**.

No arbitrary timelines. Phases are sequenced only by leverage and dependency:
each phase is the substrate the next one plugs into. Scope is **entirely** the
monorepo's `apps/workspace` no-code Next.js interface and the resolver layer it
already ships — nothing here invents a new architecture, it unifies what exists.

> Grounded in shipped code (read before editing):
> - `apps/workspace/lib/api-registry-creation-flow.js` — `deriveApiRegistryCreationState` (the per-API journey, 0.14.0 cockpit)
> - `apps/workspace/lib/api-response-profile.js` — `profileApiResponse` / `recommendResolver` (shape → resolver mode)
> - `apps/workspace/lib/workspace-resolver-proposal.js` — `buildResolverProposal` / `generateResolverCode` (server-file generator)
> - `apps/workspace/lib/server-resolver-write.js` — the single confined, gated fs write
> - `apps/workspace/lib/adapters/integrations/source-resolver-registry.js` — `registerSourceResolver` / `describeRegisteredResolvers`
> - `apps/workspace/lib/adapters/integrations/resolver-loader.js` — `loadAllResolvers` (static + config-driven cadences)
> - `apps/workspace/lib/adapters/integrations/nango/nango-config-loader.js` — `registerNangoResolversFromConfig` (the config-driven precedent)
> - `apps/workspace/app/api/workspace/resolvers/route.js` — `GET /api/workspace/resolvers`
> - `docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md` — authority boundary + the two canonical mutation calls
> - Substrate releases: `0.14.0` governed API creation cockpit · `0.14.2` Governed Application Control Plane V1 (app-scope + outcome loop + Fleet) · `0.14.4` CEO Cockpit.

---

## Implementation status — all three phases shipped

The roadmap is implemented in-repo against the bundled
`growthub-custom-workspace-starter-v1` app, codified as **API contract v1.5.1**
([`docs/UNIFIED_API_RESOLVER_REGISTRY_CONTRACT_V1_5_1.md`](./UNIFIED_API_RESOLVER_REGISTRY_CONTRACT_V1_5_1.md)),
additive and non-destabilizing to the existing API Registry contract:

- **Phase 1 (keystone) — unify + trace.** `lib/unified-resolver-registry.js`
  (`deriveResolverRegistry`) + additive `registry` on `GET /api/workspace/resolvers`
  + externalized `_registry.generated.json` / `_endpoints.generated.json`
  artifacts + provenance banner on generated files. ✅ shipped
- **Phase 2 — construct, don't fill.** `lib/resolver-constructor.js`
  (`constructResolverProposal` / `getResolverBuilder`) + cockpit wiring
  (`construct-resolver` step → thin in-drawer review → governed `helper/apply`
  → auto re-test). ✅ shipped
- **Phase 3 — governed endpoints across the monorepo.**
  `app/api/resolvers/[integrationId]/route.js` (one dynamic, runtime-agnostic
  handler; `x-growthub-app-scope` enforced + outcome receipts) + drift guard
  `scripts/check-resolver-registry.mjs` wired into the CI `verify` gate. ✅ shipped
- **Contract.** `@growthub/api-contract@1.5.1` → `@growthub/api-contract/resolver-registry`
  (type-only). ✅ shipped
- **Tests.** `scripts/unit-resolver-registry.test.mjs` (14) + a full exported-workspace
  E2E probe (positive/negative + the end-to-end customer journey). ✅ shipped

Every deriver stays pure; the only governed writes flow through `PATCH /api/workspace`
and the server-file resolver write lane; generated code is a projection of the
governed record, never hand-edited.

---

## The one idea this roadmap is built on

A **resolver** is already the workspace's provider-agnostic abstraction for "how
do I turn an API into governed rows" (`source-resolver-registry.js`). And the
Nango lane already proves the keystone move: **`registerNangoResolversFromConfig`
reads `dataModel.objects[].api-registry` rows and constructs resolvers in memory
from the governed record — no file authoring, idempotent, picked up on the next
request.** That is a dynamic resolver registry *synced to governed records* — but
it only works for one `connectorKind` (`nango`).

Everything else is fragmented:

- Static resolvers are **one-shot files** with no link back to the row that
  governs them (`loadStaticResolversOnce` just imports every `.js`).
- The helper can **generate** a resolver file (`buildResolverProposal`) but it is
  a single emission, not a tracked, re-derivable projection of the record.
- `GET /api/workspace/resolvers` lists files and registered ids but **cannot tell
  you which `api-registry` record each resolver serves**, whether it is tested,
  or what its next action is.
- The cockpit makes the human fill `rootPath` / `idField` / `headerName` /
  `prefix` even though `profileApiResponse` already computed every one of them
  from the tested response. **This is the "too many open fields" gap.**

**The roadmap is to generalize the Nango config-driven precedent into ONE
unified, agnostic resolver registry that is the single source of truth tying
every resolver to the API Registry record it serves — so (1) the no-code cockpit
constructs the governed resolver under the hood from the user's intent and the
API's profiled shape, and (2) agents read one externalized index file instead of
re-deriving the workspace.**

### The non-negotiable invariant (carried through all three phases)

Generated resolver code is a **projection of the governed record, never a hand-
edited source of truth.** It is written and re-derived **only** through:

1. the **approval / patch API workspace lane** — helper `resolver.create`
   proposal → apply → `writeResolverProposalFile` (server-file, gated, confined),
   with the `api-registry` row link landing through `PATCH /api/workspace`
   (`dataModel`), and
2. the **no-code browser interface** (the creation cockpit drawer).

Direct hand-edits to a generated resolver file are out of contract — every
generated file carries a `// generated — do not edit; edit the governed record`
banner, and Phase 3 adds a CI drift guard that fails when a file diverges from
what the registry would re-derive (the same model as `check-version-sync.mjs`).

### What stays invariant from the topology

Every deriver below is **pure** (no fetch, no secrets, never throws on partial
input). Resolver files remain **server-files** (`affectedField: "server-file"`),
written only in filesystem mode (read-only runtimes return the 409 + guidance
contract). The only `dataModel` deltas are the row's `integrationId` /
`connectorKind` / `resolverTemplateId` links — routed through the two canonical
mutation calls (`PATCH /api/workspace`, `POST /api/workspace/sandbox-run`) and
nothing else. Secrets stay server-side via `authRef` env candidates; the browser
stores references, never values.

---

## Phase 1 — Unify and trace: the Resolver Registry Index synced to records

**Goal:** one read/trace layer that, for every API Registry record across the
workspace, knows its resolver — provenance, file, registered status, test
evidence, and next action — and externalizes it as a single agent-readable index.
This is the keystone; Phases 2 and 3 are writes *into* this registry.

### Where it is today
`loadAllResolvers()` runs two independent cadences (static files +
`registerNangoResolversFromConfig`) and `GET /api/workspace/resolvers` returns
`{ files, registeredIds, resolvers[] }` — but **no entry is correlated to the
`api-registry` row it serves.** An agent dropped into the workspace must cross-
reference `dataModel.objects[]`, the resolvers directory, and the registry by
hand to answer "which APIs have working resolvers."

### The move
Build a single pure deriver, `lib/unified-resolver-registry.js`:
`deriveResolverRegistry(workspaceConfig, { files, registeredIds, runtime, sourceRecords })`
→ one entry **per `api-registry` row**:

```
{
  recordRef:      { objectId, rowId },          // the governed object it belongs to
  integrationId:  string,
  connectorKind:  "custom-http" | "nango" | "mcp" | "webhook" | "chrome" | "none",
  provenance:     "config-driven" | "static-file" | "helper-generated" | "passthrough" | "missing",
  filePath:       string | null,                // resolvers/<id>.js when materialized
  registered:     boolean,                       // present in the in-memory registry
  tested:         boolean,                        // from isTested(row)
  shape:          { arrayPath, idField, entityType, hasPagination } | null,  // last profile
  creationState:  { score, nextStepId, nextAction },  // reuse deriveApiRegistryCreationState
}
```

Then externalize it: a write-through, gated artifact agents read in one pass
(e.g. `apps/workspace/lib/adapters/integrations/resolvers/_registry.generated.json`
plus a sibling `.md` summary), regenerated on every resolver mutation and on
demand. This is "the file representative of what's inside the workspace config,
correlated" the brief asks for — it makes the seemingly-complex resolver layer a
single lookup for agents.

### Config deltas
Reads `dataModel.objects[].api-registry` rows + the resolver directory listing +
in-memory registry + source-records sidecar. Writes **only** the generated index
artifact (gated by persistence mode), never a governed record.

### Task items / to-dos
- [ ] `lib/unified-resolver-registry.js` — `deriveResolverRegistry(...)` pure deriver emitting the entry shape above; composes `deriveApiRegistryCreationState` and `profileApiResponse` rather than re-implementing them.
- [ ] Provenance tagging: stamp a machine-readable header on every generated resolver file (`// @growthub-resolver integrationId=<id> record=<objectId>:<rowId>`) so `listResolverFiles()` → file can be correlated back to a row. `generateResolverCode` and `buildNangoResolver` both emit it.
- [ ] Extend `GET /api/workspace/resolvers` **additively** with `registry: deriveResolverRegistry(...)` (keep `files` / `registeredIds` / `resolvers` for back-compat).
- [ ] Externalized index writer: gated, write-through `_registry.generated.json` + `_registry.generated.md` with the do-not-edit banner; regenerate hook on apply.
- [ ] Unit tests in the `scripts/unit-workspace-*.test.mjs` style (partial input, missing files, mixed connector kinds, passthrough rows).
- [ ] Doc: add the registry shape to `apps/workspace/docs/resolver-template-library.md` and link it from the topology doc's resolver section.

### Self-describing nudge
`GET /api/workspace/resolvers` answers, in one shape, "every API record, its
resolver, and the single next action to make it live" — for the human cockpit and
for an agent reading the externalized index identically.

### Drives
The substrate for both downstream phases: Phase 2 writes constructed resolvers
*into* this registry; Phase 3 generates endpoints *from* it.

---

## Phase 2 — Construct, don't fill: dynamic governed resolvers from intent + shape

**Goal:** close the "too many open fields" gap. The user states intent (or just
tests the API); the workspace **constructs** the governed resolver under the
hood, pre-filled from the profiled response, and asks for a one-screen
confirmation — never a blank form. Agnostic across connector kinds.

### Where it is today
The cockpit already profiles the tested response (`profileApiResponse` returns
`arrayPath`, `candidates.id`, `suggestedEntityType`, `hasPagination`) and
recommends a mode (`recommendResolver`). But the `resolver` step in
`deriveApiRegistryCreationState` is `optional` and its action just links to
`/api/workspace/resolver-templates` — the human re-enters `rootPath` / `idField` /
`headerName` / `prefix` that the profiler **already computed.** Meanwhile
`buildResolverProposal` accepts exactly those fields. The two are simply not wired
together.

### The move
1. **Resolver constructor** — `lib/resolver-constructor.js`:
   `constructResolverProposal({ row, profile, recommendation, runtime })` maps the
   profiler output straight into `buildResolverProposal` inputs
   (`rootPath = profile.arrayPath`, `idField = profile.candidates.id`,
   `entityType = profile.suggestedEntityType`, `headerName` / `prefix` inferred
   from the row's auth config). Result: a complete `resolver.create` proposal with
   **zero open fields** for the common case.
2. **Agnostic builder registry** — generalize the Nango precedent: a
   `getResolverBuilder(connectorKind)` dispatch where `custom-http` →
   `generateResolverCode` (materialized file) and `nango` → `buildNangoResolver`
   (config-driven), with `mcp` / `webhook` / `chrome` slots added behind the same
   contract. Any API registry, any connector kind, one constructor surface.
3. **One-screen review** — when `recommendResolver().level !== "optional"`, the
   cockpit's `resolver` step action becomes **"Construct resolver (review)"**,
   opening the existing `ApiRegistryReviewModal` pre-populated with the
   constructed proposal + a diff of the candidate fields. The user confirms; they
   do not author.
4. **Construct → apply → auto-test** — apply flows through the governed lane only
   (helper `resolver.create` apply → `writeResolverProposalFile`; the row's
   `resolverTemplateId` link via `PATCH /api/workspace` `dataModel`), then chains
   `POST /api/workspace/test-source` so the user sees green without leaving the
   drawer.

### Config deltas
Reads the tested row + its profile + runtime env signal. Writes the resolver
**server-file** through the gated write, and the single `dataModel` link delta
through `PATCH /api/workspace`. No new mutation path.

### Task items / to-dos
- [ ] `lib/resolver-constructor.js` — `constructResolverProposal(...)` mapping profiler → `buildResolverProposal`; deterministic, secret-safe, never throws.
- [ ] `getResolverBuilder(connectorKind)` dispatch unifying `generateResolverCode` (custom-http) and `buildNangoResolver` (nango) behind one contract; `mcp` / `webhook` / `chrome` builder stubs returning a typed "not yet supported" rather than a blank.
- [ ] Cockpit wiring: when resolver is recommended/required, the step action constructs + opens the prefilled `ApiRegistryReviewModal` (replace the raw `/resolver-templates` link).
- [ ] Auto-test chain after apply; surface the resulting `lastResponse` evidence and re-derive the journey/score.
- [ ] Pagination path: when `profile.hasPagination`, the constructor emits a paging-aware `fetchRecords` (concatenate pages) — the case `recommendResolver` already flags as `required`.
- [ ] e2e probe (in the `scripts/e2e-workspace-*.mjs` style): register row → test → construct → apply → test-source green, asserting no blank-field prompt for a standard JSON list API.

### Self-describing nudge
The journey collapses from "test, then hand-author a resolver" to "test → confirm
the constructed resolver → live." The single biggest non-technical drop-off
(blank resolver fields) becomes a one-click confirmation derived from real
response evidence.

### Drives
The no-code, fast-setup outcome for non-technical users — and it populates the
Phase 1 registry with correctly-tagged, governed resolvers across connector kinds.

---

## Phase 3 — Resolvers as governed Next.js endpoints across the monorepo

**Goal:** make each governed resolver an addressable Next.js endpoint generated
from the unified registry, so resolvers **are** the API endpoints other apps in
the monorepo (and external callers) hit — carrying the same governance across
every runtime. This is the 2026 best-practice scale-out: one governed record, a
generated endpoint projection, identical enforcement in dev, serverless, and
database runtimes.

### Where it is today
A resolver is an in-process module the `apps/workspace` server imports; it is not
itself an addressable route, and it lives only inside `apps/workspace`. Other apps
in the monorepo (`apps/agency-portal`, `studio`, future apps) cannot consume a
governed resolver as an endpoint, and the Governed Application Control Plane V1
(`0.14.2`: `x-growthub-app-scope`, Agent Outcome receipts, `workspace-app-registry`
app-surface rows, Fleet lens) governs mutations/executions but not resolver
endpoints — because there are none.

### The move
1. **Endpoint codegen from the registry** — generate one route handler per
   registered resolver,
   `apps/workspace/app/api/resolvers/[integrationId]/route.js`, projected from the
   Phase 1 registry (build-time/codegen, gated write-through, do-not-edit banner).
   The endpoint calls `getSourceResolver(integrationId).fetchRecords(...)` — the
   resolver layer that already exists — so the registry record becomes a live,
   hittable Next.js API endpoint inside the monorepo.
2. **Same-level governance on generated endpoints** — stamp
   `x-growthub-app-scope` enforcement + Agent Outcome receipts onto every
   generated route (reuse the `0.14.2` control plane), so a resolver endpoint is
   governed exactly like a mutation route: scoped, traced, and receipted.
3. **Runtime-agnostic projection** — in filesystem (dev) the registry +
   endpoints regenerate on mutation; in read-only/serverless the registry index
   and a route manifest ship as **build artifacts** so deployed runtimes expose
   the same endpoints with no runtime FS write; the reserved `database` adapter
   carries the same registry shape. One governance contract across all three.
4. **Monorepo exposure via the app registry** — `workspace-app-registry`
   (`app-surface`) rows reference their resolver endpoints by `integrationId`, so
   the Fleet lens (`ROADMAP_IMPACT_ITEMS_V1.md` Item 4) shows **per-app resolver
   health** and the super-admin sees every app's resolvers in one rollup.
5. **Drift guard** — a CI check (`scripts/check-resolver-registry.mjs`, modeled
   on `check-version-sync.mjs`) fails when a generated resolver file or endpoint
   diverges from what the registry re-derives — enforcing "generated, never hand-
   edited" mechanically.

### Config deltas
Reads the Phase 1 registry + `workspace-app-registry` rows + runtime/deploy
signals. Writes generated endpoint files + the route manifest (gated /
build-time). Governed-record edits still flow only through the approval/patch lane
and the no-code browser.

### Task items / to-dos
- [ ] Endpoint generator: per-resolver `app/api/resolvers/[integrationId]/route.js` from the registry, with the do-not-edit banner and `record=<objectId>:<rowId>` provenance.
- [ ] Apply `x-growthub-app-scope` + Agent Outcome receipt emission to generated routes (reuse `@growthub/api-contract/workspace-apps` + the outcome stream).
- [ ] Serverless/read-only path: ship registry index + route manifest as build artifacts; verify endpoints resolve under `next build` with no runtime FS write.
- [ ] `workspace-app-registry` linkage: `app-surface` rows reference resolver endpoints by `integrationId`; extend the Fleet lens to roll up per-app resolver health.
- [ ] `scripts/check-resolver-registry.mjs` drift guard wired into the `smoke` / `validate` / `verify` CI gates.
- [ ] 2026 best-practices doc section (below) materialized into the starter kit docs so every exported workspace ships the contract.

### Self-describing nudge
Every governed API record is, end-to-end, a live and governed monorepo endpoint:
the cockpit shows "this API is live at `/api/resolvers/<id>`," the Fleet lens
shows per-app resolver health, and an agent reads one index to find them all.

### Drives
The enterprise scale-out: many apps, one runtime governance model, resolvers as
first-class governed endpoints — the explicit "same level of governance across
runtimes" ask.

---

## 2026 best practices encoded by this roadmap

- **Single source of truth = the governed record.** The `api-registry` row in
  `dataModel.objects[]` governs; resolver files and endpoints are *projections*.
  Code is generated and re-derivable, never the authority.
- **Generated, never hand-edited.** Every generated artifact carries a do-not-edit
  banner and is protected by a CI drift guard. The only edit paths are the
  approval/patch API lane and the no-code browser.
- **Agnostic by connector kind, not by provider.** One constructor + one builder
  registry behind `connectorKind`; adding a provider is adding a row, not a
  bespoke surface (the Nango precedent, generalized).
- **Same governance across runtimes.** App-scope enforcement + outcome receipts +
  the mutation boundary apply identically in filesystem, serverless read-only, and
  database runtimes; the registry ships as a build artifact where FS is read-only.
- **Externalized, low-entropy agent surface.** One generated index correlates
  every resolver to its record, its file, its endpoint, and its next action — so
  agents look up, they do not re-derive.
- **Pure derivation + the two canonical mutation calls.** No deriver writes a
  governed record; all governed writes flow through `PATCH /api/workspace`
  (`dataModel`) and the server-file resolver write lane.

---

## Sequencing (by leverage and dependency, not dates)

1. **Phase 1** first — the unified registry + externalized index is the read/trace
   substrate. Until a resolver can be correlated to its record, neither
   construction nor endpoint generation has a source of truth.
2. **Phase 2** next — construct resolvers from intent + shape and write them into
   the Phase 1 registry. This delivers the headline no-code, fast-setup outcome
   and populates the registry with correctly-tagged resolvers.
3. **Phase 3** last — generate governed endpoints from the now-populated,
   trustworthy registry and scale governance across the monorepo and runtimes.
   Highest-order payoff, lowest marginal cost once Phases 1–2 exist.

The through-line: **we are not adding a resolver feature — we are generalizing the
one config-driven precedent the Nango lane already proves into a single unified,
dynamic, governed resolver registry, so the no-code cockpit constructs resolvers
for the user under the hood, agents read one index instead of re-deriving the
workspace, and every governed API record becomes a live, governed Next.js endpoint
across the monorepo with the same governance on every runtime.**
