# API Registry Fast-Path Setup Roadmap V1

A three-phase, compounding roadmap for a **front-facing, UI/UX-driven fast lane** that lets an
operator create an API Registry record inside the Data Model shell without guessing a single
configuration field — from blank row to **tested and working** — by surfacing the connector lanes and
structured row defaults that **already ship** in the workspace starter.

No timelines. Each phase is purely additive, backwards-compatible, and builds on the one before it.
Nothing here changes an existing type, adds a mutation path, or widens the topology boundary.

---

## What already exists (the substrate this builds on — do not rebuild)

Grounded in the shipped `growthub-custom-workspace-starter-v1` kit:

- **Connector taxonomy is real and structured.** The resolver template registry
  (`apps/workspace/lib/adapters/integrations/templates/template-registry.js`) declares every template
  with a typed `connectorKind: "http" | "mcp" | "chrome" | "tool" | "custom" | "nango"`, plus
  `templateId`, `capabilities` (`listEntities | fetchRecords | runAction`), `apiRegistryDefaults`,
  `dataSourceDefaults`, `configSchema`, and `supportedLanes`
  (`data-source | sandbox-local | sandbox-serverless`). It is exposed read-only at
  **`GET /api/workspace/resolver-templates`**.
  - Seeded today: `custom-http`, `webhook`, `generic-crm`, `generic-spreadsheet`,
    `generic-project-management`, `generic-commerce` (all `http`); `mcp-tool` (`mcp`);
    `chrome-bridge` (`chrome`); `nango` (`nango`).
  - The `tool` and `custom` connectorKinds are valid in the type union but have **no seed template** —
    the picker treats them as **blank-start lanes** (Phase 1), so the full taxonomy is covered without
    inventing templates.
- **The api-registry object already carries the structured columns.** `OBJECT_TYPE_PRESETS["api-registry"]`
  (`apps/workspace/lib/workspace-data-model.js`) includes `connectorKind`, `resolverTemplateId`,
  `schemaVersion`, `capabilities`, and `executionLane` alongside the HTTP fields. The field contracts
  (`apps/workspace/lib/data-model/field-contracts.js`, `API_REGISTRY_FIELDS`) already render them.
  **No schema change is required.**
- **The "side checklist pit-style" cockpit already exists and is powerful.** `deriveApiRegistryCreationState`
  (`apps/workspace/lib/api-registry-creation-flow.js`) is a pure, secret-safe, evidence-driven derivation
  of the journey `register → auth → test → resolver → data-source → refresh → sandbox`, rendered by
  `ApiRegistryCreationCockpit.jsx` inside the record drawer (`DataModelShell.jsx`). Every step's status is
  derived from real workspace state, never from click. This roadmap **extends** it; it does not replace it.
- **The mutation boundary is fixed.** All writes go through the single `PATCH /api/workspace` lane
  (`dashboards | widgetTypes | canvas | dataModel`). Server-side test is `POST /api/workspace/test-api-record`.
  Secrets stay server-side and are referenced only by `authRef`.

**The one gap.** When an operator opens a *fresh, unregistered* api-registry row, the cockpit correctly
shows "register" as the active step — but the operator must still hand-type `integrationId`, `baseUrl`,
`connectorKind`, `resolverTemplateId`, etc. from memory. The connector lanes and their structured
defaults exist in the registry but are **never surfaced at the moment of creation.** This roadmap closes
exactly that gap.

---

## Design invariants (every phase obeys these)

1. **Additive only.** New files and new optional outputs. No existing type, column, route, return-shape
   key, or status transition is changed or removed.
2. **Backwards compatible.** The lane front-door renders only while a row is *unregistered* (the cockpit's
   `register` step is `active`). Existing/registered rows render exactly as today. The manual blank-row
   path is untouched.
3. **One mutation boundary.** Seeding writes through the existing draft-save → `PATCH /api/workspace`
   (`dataModel`) lane. No new endpoint, no widget/canvas side-effect.
4. **Secret-safe.** `configSchema` fields of type `secretRef` store only the env-ref slug; no secret value
   ever enters the browser or a row.
5. **Reuse the rendered interface.** Use the workspace's own primitives (`dm-type-card`, `dm-cockpit`,
   `dm-btn-*`, `dm-db-status`). No new colors, no new primitive.
6. **Pure derivation.** New deriver/merge helpers are pure, deterministic, never throw on partial input,
   and are unit-tested in the existing `scripts/unit-*.test.mjs` style.
7. **One config surface, two mount points (the mental-model mandate).** The fast path must not invent a
   new configuration UI. It **reuses the API config surface that already exists in the workflow canvas**
   (see the addendum below) so an operator configures an API the *same way* whether they are in the canvas
   node config or in the Data Model shell creating the record.

---

## Addendum V1.1 — Surface-reuse mandate (the critical piece, governs Phases 1–3)

> The first draft of this roadmap proposed a *new* `ConnectorLanePicker` styled with the cockpit's
> `dm-cockpit` classes. That is the wrong instinct: it forks the operator's mental model and a future
> agent would build it generically anyway. The real, durable solution is to **reuse the API configuration
> surface the workflow canvas already ships** — same component, same elements, same CSS — so the Data
> Model shell record-creation experience and the canvas node-config experience are visibly *the same UI*.

### The surface that already exists (verified in source)

In the workflow canvas, configuring an API is already a polished, tabbed surface:

- `app/data-model/components/OrchestrationNodeConfigPanel.jsx`, the `type === "api-registry-call"` branch,
  renders **Configuration / Test / Advanced** tabs with the exact fields an API Registry record needs:
  `Method` (select), `Endpoint`, `Body template`, `Auth reference`, `Auth header name`, `Auth prefix`
  (Configuration); `Success condition`, `Sample response`, `Block Publish` (Test); `Timeout (ms)`,
  `Query params (JSON)` (Advanced). It shows a **`Connected` badge** driven by
  `isApiRegistryTestSuccessful(registryRow)`.
- It is mounted beside the graph by `SandboxOrchestrationEditorPanel.jsx` in the two-column
  `dm-orchestration-sidecar__canvas-col` / `dm-orchestration-sidecar__config-col` layout.
- It is **already bound to these same api-registry Data Model objects**: `resolveRegistryRowForSandbox`
  resolves the node's `registryId` to an `objectType: "api-registry"` row. The *data* path is already
  unified — only the *presentation* in the Data Model shell diverges (it currently uses generic
  field-contract cell editors, not this tabbed surface).
- The whole surface is built on one CSS namespace that we reuse verbatim — **no new CSS, no new
  primitive**: `dm-orchestration-config`, `dm-orchestration-config__tabs` (+ `button.is-active`),
  `__pane`, `__field` (+ `__field span`), `__field-label`, `__section`, `__badge.is-connected` /
  `.is-failed`, `__hint`, `__advanced-json`, `dm-orchestration-preview`, `__error`
  (globals.css ~5188–5220, with `.dm-workflow-orchestration`-scoped variants ~5660+).

### The move: lift it into one shared, row-bound pane

Extract the `api-registry-call` Configuration/Test/Advanced panes into a single presentational component —
`app/data-model/components/ApiRegistryConfigPane.jsx` — parameterized by
`{ value, onChange, registryRow, disabled, activeTab, onTabChange, mode: "node" | "record" }`:

- **Canvas** renders `<ApiRegistryConfigPane mode="node" value={node.config} onChange={patchConfig} … />`
  — a pure refactor of what `OrchestrationNodeConfigPanel` already does; **byte-identical UI/CSS**, canvas
  tests stay green.
- **Data Model shell** renders `<ApiRegistryConfigPane mode="record" value={draft} onChange={patchDraft}
  registryRow={draft} … />` inside the api-registry record drawer — the operator now sets up the record
  through the *exact* tabbed canvas surface, with the Test tab wired to the existing
  `POST /api/workspace/test-api-record` and the same `is-connected` badge.

The evidence-driven `ApiRegistryCreationCockpit` (the "side checklist pit-style") stays exactly as-is —
it remains the journey checklist *above* the config pane. This addendum changes **how the fields are
entered**, unifying it with the canvas; it does not touch the cockpit's derivation.

This is what makes Phases 1–3 below concrete and non-generic: the "lane picker" is not a new widget, it is
a **`dm-orchestration-config__section` inside the shared pane**, so the connector lane selector appears
identically in the canvas node config and in the Data Model shell — one surface, two mount points.

---

## Phase 1 — Lift the API config surface into one shared, row-bound pane (refactor, zero behavior change)

**Goal.** Make the canvas's API config surface the single source of truth, mountable in the Data Model
shell. Pure refactor first so nothing regresses.

### Tasks

- [ ] **Extract `ApiRegistryConfigPane.jsx`** from the `api-registry-call` Configuration/Test/Advanced
      branches of `OrchestrationNodeConfigPanel.jsx`. Presentational only; reuses the
      `dm-orchestration-config__*` classes verbatim; takes `{ value, onChange, registryRow, disabled,
      activeTab, onTabChange, mode }`.
- [ ] **Re-mount it inside `OrchestrationNodeConfigPanel`** for `type === "api-registry-call"` so the
      canvas renders the extracted pane (`mode="node"`). No visual or behavioral change.
- [ ] **Regression guard.** Run the orchestration canvas tests + exported-workspace `next build`; confirm
      the canvas node config is byte-identical (tabs, fields, Connected badge, Advanced JSON).

### Done when

The canvas API node config is rendered by the shared pane with zero observable change, and the pane is
importable by the Data Model shell.

---

## Phase 2 — Render the shared pane in the Data Model shell record drawer (additive)

**Goal.** When an operator creates/opens an api-registry record in the Data Model shell, they configure it
through the *same* tabbed surface as the canvas — closing the mental-model gap. The connector-lane front
door (formerly "Phase 1") is delivered as a section of this shared pane, not a separate picker.

### Tasks

- [ ] **Mount `<ApiRegistryConfigPane mode="record" />`** in `DataModelShell.jsx` for `isApiRegistry`
      rows, bound to the drawer `draft` (value + onChange), directly under the existing
      `ApiRegistryCreationCockpit`. The cockpit stays the checklist; the pane is the field surface.
- [ ] **Wire the Test tab** to the existing `POST /api/workspace/test-api-record` and surface the
      `is-connected` badge from `isApiRegistryTestSuccessful(draft)` — identical to the canvas.
- [ ] **Persist through the existing lane** — draft-save → `PATCH /api/workspace` (`dataModel`). No schema
      change (the api-registry preset already carries every column), no new route, no widget/canvas
      side-effect.
- [ ] **Backwards compatible** — the generic field grid remains; the shared pane is the guided surface on
      top of it, rendered only for api-registry rows.

### Done when

Creating an api-registry record in the Data Model shell looks and behaves like configuring an
`api-registry-call` node in the canvas, and a tested record shows the same Connected badge.

---

## Phase 3 — Fold the connector lane + taxonomy into the shared pane (no separate picker)

**Goal.** Surface the connector taxonomy and structured defaults *inside* the shared pane, so the lane
selector renders identically in both mount points and pre-fills the row without guesswork.

### Tasks

- [ ] **Add a "Connector" `dm-orchestration-config__section`** to `ApiRegistryConfigPane`: a
      `connectorKind` select (`http | mcp | chrome | tool | custom | nango`), a `resolverTemplateId`
      select populated from `GET /api/workspace/resolver-templates`, and read-only chips for
      `capabilities` / `executionLane` / `schemaVersion` — all using `dm-orchestration-config__field`
      controls (no new elements).
- [ ] **Add the pure deriver + merge** (`apps/workspace/lib/api-registry-connector-lanes.js`):
      `deriveConnectorLaneOptions({ templates })` groups templates by `connectorKind` (marking `tool` /
      `custom` as blank-start, since they have no seed template), and
      `applyConnectorTemplateToDraft(draft, template)` additively seeds `connectorKind`,
      `resolverTemplateId`, `schemaVersion`, `capabilities`, `executionLane` (default = first
      `supportedLanes`) + `apiRegistryDefaults`, never overwriting operator input. Unit-test in
      `scripts/unit-api-registry-connector-lanes.test.mjs`.
- [ ] **Render `configSchema` inline** as `dm-orchestration-config__field` inputs (secretRef stores only
      the env-ref slug — never a secret) so only the few required fields remain for the operator.
- [ ] **Parity is automatic** — because the canvas node config mounts the same pane, the
      `api-registry-call` node gains the connector/lane selector for free. One surface, two mount points.
- [ ] **QA / regression** — exported-workspace `next build` + live walkthrough: a fresh record goes lane →
      seed → required fields → Test green in one pass; canvas node config and existing rows are unaffected.

### Done when

The connector lane and structured defaults are selectable through the shared pane in both the Data Model
shell and the canvas, and a first-time operator completes a tested, working API Registry record without
intuiting any field — using one consistent surface.

---

## (Superseded) Original Phase framing — kept for diff context

> The sections below were the first-draft phases. They are **superseded by Addendum V1.1 and the revised
> Phases 1–3 above**, which reuse the canvas config surface instead of introducing a standalone picker.
> Retained only so reviewers can see what changed; implementers should follow the revised phases.

### (old) Phase 1 — Connector Lane Front Door (read-only, zero mutation)

**Goal.** Replace blank-field guessing with a clean, minimalist set of **lane buttons** at the top of the
api-registry record drawer, sourced from the real template registry. Selecting a lane reveals its
templates; selecting a template shows a structured preview of what it *will* seed. **Nothing is written
yet** — this phase is pure selection + read-only fetch, so it is risk-free to merge ahead of any future
release.

This is the keystone: every later phase plugs into the lane object this phase derives.

### Tasks

- [ ] **Add a pure lane deriver** — new file `apps/workspace/lib/api-registry-connector-lanes.js`,
      `deriveConnectorLaneOptions({ templates })`:
  - Groups `listResolverTemplates()` output by `connectorKind` into the six canonical lanes
    (`http | mcp | chrome | tool | custom | nango`).
  - For each lane: lane label, the templates in it, and the union of `supportedLanes` → executionLane
    chips.
  - Marks `tool` and `custom` as **blank-start** lanes (no seed template → operator gets the structured
    columns but defines fields manually).
  - Pure, deterministic, no fetch, no `process.env`, no React.
- [ ] **Unit test** — `scripts/unit-api-registry-connector-lanes.test.mjs`, mirroring
      `scripts/unit-api-registry-creation-flow.test.mjs`: every seeded `connectorKind` appears; blank-start
      lanes are flagged; output is secret-free and stable.
- [ ] **Add `ConnectorLanePicker.jsx`** (presentational only) under
      `apps/workspace/app/data-model/components/`:
  - Lane buttons (`dm-type-card`), then template cards, then a structured preview of the defaults
    (`dm-cockpit-fields`): `connectorKind`, `resolverTemplateId`, `executionLane`, `capabilities`, plus
    the `configSchema` field list the operator will fill.
  - No writes; emits an `onSelectTemplate(template)` callback only.
- [ ] **Mount it in `DataModelShell.jsx`** directly above `ApiRegistryCreationCockpit`, gated on the
      cockpit's own `register` step being `active` (unregistered row). Feed it from a read of
      `GET /api/workspace/resolver-templates` (the route already exists). When the row is registered the
      picker does not render — guaranteeing zero change for existing rows.

### Done when

A user opening a new api-registry row sees lane buttons matching the live registry, can drill into any
lane's templates, and sees a clear preview of the fields a template would seed — with no config written.

---

### (old) Phase 2 — One-Click Structured Seed (the fast-path write, governed)

**Goal.** Turn the selection from Phase 1 into a single governed action that **pre-fills the structured
row defaults and renders the template's `configSchema` as the detailed field inputs**, so the operator
fills only the few required fields (with real labels/types/required flags) instead of guessing the whole
row. The seed flows through the existing single PATCH lane; the cockpit immediately re-derives
`register → test` as the next active steps.

### Tasks

- [ ] **Add a pure merge helper** in `api-registry-connector-lanes.js`:
      `applyConnectorTemplateToDraft(draft, template)`:
  - Additive merge that **never overwrites** operator-entered non-empty values.
  - Sets the structured columns from the template: `connectorKind`, `resolverTemplateId` (= `templateId`),
    `schemaVersion`, `capabilities` (joined to the row's string form), and `executionLane` (default =
    first entry of `supportedLanes`).
  - Maps `apiRegistryDefaults` (`integrationId`, `method`, `authRef`, `baseUrl`, `endpoint`, …) onto the
    draft.
  - Returns a **new** draft object; pure, deterministic.
- [ ] **Render `configSchema` as governed inputs** in the picker/drawer, reusing existing field editors
      from `field-contracts.js`. `secretRef` fields use the env-ref input that stores only the reference —
      no secret value. Required fields from `configSchema.required` drive inline validation hints.
- [ ] **Persist through the existing lane.** Seeding mutates the open draft; the operator saves through the
      drawer's normal save → `PATCH /api/workspace` (`dataModel`). No new route, no schema change (columns
      already exist from the preset).
- [ ] **Unit-test the merge invariants** in `unit-api-registry-connector-lanes.test.mjs`: additive, never
      overwrites operator input, sets the five structured columns correctly, `executionLane` defaults from
      `supportedLanes`, output secret-free.

### Done when

Selecting a lane + template + "Use this lane" produces a draft where `connectorKind`,
`resolverTemplateId`, `capabilities`, `executionLane`, and `schemaVersion` are populated and only the
template's required `configSchema` fields remain for the operator — and saving it lands a valid row the
cockpit reads as `registered`. The blank-row path still works untouched.

---

### (old) Phase 3 — Fast-Path Completion & Verification Loop (to "tested & working")

**Goal.** Carry the seeded lane through the existing evidence-driven cockpit all the way to a
server-verified, working record, and confirm the chosen shape at a glance — with the lane's `capabilities`
and `executionLane` informing which downstream steps matter. This phase is mostly *wiring the lane into
what already runs*, so it stays surgical.

### Tasks

- [ ] **Extend `deriveApiRegistryCreationState` additively only.** Add a new optional output field
      `lane: { connectorKind, executionLane, capabilities }` derived from the row. **Every existing return
      key and status transition is preserved**; when the lane fields are absent the output is identical to
      today (no regression for existing rows).
- [ ] **Render a compact lane summary chip** in `ApiRegistryCreationCockpit.jsx` (reusing `dm-db-status`)
      showing `connectorKind · executionLane` so the operator confirms the configuration shape at a glance.
- [ ] **Lane-aware step relevance (no status regressions).** Use `capabilities`/`executionLane` to keep the
      sandbox-tool and resolver steps `optional` when the lane doesn't support `runAction` /
      data-source-only lanes — defaulting to today's exact behavior when the fields are absent.
- [ ] **Route lane-specific auth/connect to existing surfaces.** `nango` → existing Nango connect-session
      flow; `chrome`/`mcp` → surface the required env refs via the cockpit's existing auth step + Settings
      link. The existing Test action (`POST /api/workspace/test-api-record`) is the green-light proof — no
      new test path.
- [ ] **Agent/human parity (optional, additive).** Feed the lane picker's structured output into the
      helper's existing `register_api` intent so an agent can propose the same seeded row (propose-only,
      through the existing apply lane).
- [ ] **QA / regression proof.** Exported-workspace `next build` + a live drawer walkthrough:
      (a) a fresh row goes lane → seed → fill required fields → Test green with one pass and no guessing;
      (b) existing/registered rows render byte-for-byte as before (regression guard).

### Done when

A first-time operator completes an API Registry record end-to-end — lane → structured seed → required
fields → server-side Test green → ready to wire into a Data Source / sandbox — without intuiting any field,
and existing rows are provably unaffected.

---

## Sequencing (by dependency, not dates)

1. **Phase 1 (revised)** — lift the canvas's `api-registry-call` config surface into one shared
   `ApiRegistryConfigPane`, re-mounted in the canvas with zero behavior change. Pure refactor keystone;
   everything else mounts this pane.
2. **Phase 2 (revised)** — render that same pane in the Data Model shell record drawer, wired to the
   existing `test-api-record` route and PATCH lane. Closes the mental-model gap.
3. **Phase 3 (revised)** — fold the connector lane + taxonomy in as a `dm-orchestration-config__section`
   of the shared pane, so the lane selector + structured seed appear identically in both mount points.

The through-line: **we surface — and reuse — what already ships.** The connector taxonomy, the structured
columns, the resolver templates, the evidence-driven cockpit, the canvas's tabbed API config surface, its
`dm-orchestration-config__*` CSS, and the single PATCH boundary all exist today. This roadmap renders the
*existing canvas configuration surface* as the fast lane at the moment of record creation — one surface,
two mount points — so the operator's mental model stays tight. Purely additive, backwards-compatible, and
ready to drop into a future release without touching its boundaries or focus.
