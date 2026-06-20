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

---

## Phase 1 — Connector Lane Front Door (read-only, zero mutation)

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

## Phase 2 — One-Click Structured Seed (the fast-path write, governed)

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

## Phase 3 — Fast-Path Completion & Verification Loop (to "tested & working")

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

1. **Phase 1** ships the read-only lane front door + pure deriver — the entry point everything plugs into,
   safe to merge alone.
2. **Phase 2** adds the one-click structured seed over the existing PATCH lane — turns selection into a
   pre-filled, governed row.
3. **Phase 3** wires the lane into the existing cockpit derivation and verification loop — closes the path
   to tested-and-working with full parity for agents.

The through-line: **we surface what already ships.** The connector taxonomy, the structured columns, the
resolver templates, the evidence-driven cockpit, and the single PATCH boundary all exist today. This
roadmap only renders them as a clean, minimalist fast lane at the moment of creation — purely additive,
backwards-compatible, and ready to drop into a future release without touching its boundaries or focus.
