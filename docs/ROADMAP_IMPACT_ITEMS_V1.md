# Roadmap Impact Items V1 — Generalizing the Activation Primitive

Grounded in the **literally shipped** activation layer:
`cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-activation.js`
(`deriveWorkspaceActivationState`) and its renderer
`app/components/WorkspaceActivationPanel.jsx`, plus the shipped Quickstart loop
(`docs/QUICKSTART_WORKSPACE.md`): `source → governed Workspace → Builder → Save / Export / Deploy`.

No arbitrary timelines. Impact-ranked, compounding, sequenced only by leverage and dependency.

---

## The one idea this whole roadmap is built on

0.13.7 shipped a **pure derivation function**: it reads governed artifacts and emits a typed, self-describing
state where **every step's status is a named delta in the workspace configuration**, and the *next action is
computed, never authored*:

```
objectCreated        = userObjects.length > 0
connectionConfigured = hasConnectionId(registryRow)            // booleans only, never secrets
workflowRun.ok       = parseSafe(lastResponse).exitCode === 0
sourceHasRecords     = sidecar.recordCount > 0
→ status ∈ {complete | pending | blocked | optional}, nextStepId, hint, href, cta
```

That is the AWaC primitive made real: **configuration is causal**. A delta in the artifact (`connectionIds: ""`
→ `connectionIds: "conn_x"`) re-derives the whole state machine and changes the next action — for the human in
the panel *and* for an agent reading the same shape.

Today that primitive is hardcoded to **two adapters** (`blank`, `project-management`) and bounded to a
**single workspace's first-value loop**, ending at "run your workflow."

**The roadmap is to generalize this exact primitive — same pure-derivation contract, same typed output, same
renderer — to every higher loop, all the way up to the super-admin level, so the system explains itself at
every state, and every derived nudge points at the two destinations that create real-world value:**

1. **High-impact agent-swarm orchestration** — every derived state is also a machine-readable swarm
   assignment.
2. **Building and shipping full custom applications** — the loop doesn't stop at a dashboard; it nudges all
   the way to a deployed, swarm-operable application.

### Implementation status

The roadmap's **derivation layer** has shipped in-repo as a backward-compatible extension of the frozen
activation module (`apps/workspace/lib/workspace-activation.js`), fully unit-tested
(`scripts/unit-workspace-lenses.test.mjs`, 30 tests), surfaced in the existing panel, exposed over a read-only
route, and verified through the exported-workspace `next build` + live HTTP probes:

- **Item 1 (keystone)** — `WORKSPACE_LENS_REGISTRY` + `deriveWorkspaceState()` (composed state + one global next
  action). ✅ shipped
- **Item 2 (persistence lens)** — `derivePersistenceLensState()` (durability nudge over the existing persistence
  adapters). ✅ shipped
- **Item 3 (observability lens)** — `deriveObservabilityLensState()` (run-state rollup: healthy/failing/never).
  ✅ shipped
- **Item 5 (deploy lens)** — `deriveDeployLensState()` (pure derivation over deploy-check-shaped runtime signals
  + persistence durability; blocks on read-only). ✅ shipped
- **Item 6 (task lens)** — `deriveTaskLensState()` (pure derivation over governed Data Model rows; detects
  governed and source-backed tasks; never creates rows or invents schema). ✅ shipped
- **Item 7 (app-build lens)** — `deriveAppBuildLensState()` (readiness lens from object → dashboard → workflow →
  run → durable persistence → deploy readiness → package; scaffolds nothing). ✅ shipped
- **Item 8 (swarm packet)** — `deriveSwarmConditionPacket()` + read-only `GET /api/workspace/swarm-condition`
  (assignable `{goal, currentState, nextAction, blockedStep, prerequisite, availableTools, expectedEvidence}`).
  ✅ shipped
- **Secondary-lens panel surfacing** — `WorkspaceActivationPanel` renders the registered secondary lenses
  (opt-in via `showLenses`, never in the compact rail; the builder feeds a safe runtime descriptor). ✅ shipped

- **Item 4 (multi-app / fleet lens)** — ⏸ **staged, intentionally not implemented.** The exported workspace
  runtime exposes no in-artifact multi-app surface registry to derive from (surface detection lives in the CLI's
  `workspace surface list`, not in `growthub.config.json`). A Fleet lens requires a runtime surface-metadata
  source first; inventing one would violate the pure-derivation guardrail. See Item 4 below.

All shipped lenses keep the activation invariants: pure derivation, no fetch, no mutation, no secrets, never
throws on partial input, hrefs route into existing surfaces only. The only mutation path remains
`PATCH /api/workspace` (`dashboards | widgetTypes | canvas | dataModel`).

### The framing every item below obeys

Each item is expressed as **the actual config deltas it reads/writes in the information space**, plus the
**self-describing nudge** it produces and **which of the two value destinations it drives**. Nothing here is a
cosmetic UI feature — each is a new *deriver* over a real delta, inheriting the shipped panel and the shipped
"Ask helper" CTA for free.

> Out of scope / explicitly dropped: **bridge-backed widget bindings**. With **Nango as a first-class citizen
> (800+ integrations)** already seeded into the workspace (`api-registry` rows, `connectorKind: "nango"`,
> `/api/workspace/integrations/nango/proxy`), the integration surface is solved at scale. The previous
> "universal source binding / bridge-backed widget" plan is stale reality and is not a priority.

---

## Tier 0 — The keystone (everything else plugs into this)

### 1. Generalize the activation deriver into a Workspace State Lens registry

- **Where it is today.** `workspace-activation.js` hardcodes a template router (`if template ===
  "project-management" … else blank`). Two adapters, one loop, one panel mount.
- **The move.** Refactor the single router into a **registry of pure derivers**, each keyed to a domain and
  each reading a *named slice of config deltas*, all emitting the identical typed shape the panel already
  renders (`{steps[], status, nextStepId, hint, href, cta}`). Compose them into a single
  `deriveWorkspaceState()` that can answer "what is the highest-value next action across the *entire*
  workspace," not just onboarding.
- **Config deltas.** Reads any slice of `growthub.config.json` + `source-records` + metadata graph. Writes
  nothing — invariant preserved (pure, no secrets, recomputable every load).
- **Self-describing nudge.** Every domain below becomes a lens that the existing `WorkspaceActivationPanel`
  (and rail-compact variant) renders with zero new UI work, including the "Ask helper to finish X" button that
  already exists.
- **Drives.** Both destinations — it's the substrate. Each lens is independently swarm-assignable (Item 8) and
  each can nudge toward app-building (Item 7).
- **Why keystone / why now.** It is a refactor of shipped code into an extension point, not new architecture.
  Every other item ships as "register a deriver," which is why they compound instead of accreting surfaces.

---

## Tier 1 — Make runtime real (persistence + observability that swarms depend on)

### 2. Persistence & runtime-durability activation lane (the database pathway)

- **Where it is today.** The Quickstart persistence table literally ships three modes:
  `filesystem` / `read-only` / **`database — Reserved (V2), not implemented`**. The Workspace Settings overlay
  *shows* the active mode but does **not** nudge, and in `read-only` (the Vercel/Netlify default) `PATCH
  /api/workspace` returns `409`. So a deployed app silently can't persist, and workflow run state is ephemeral.
- **The move.** Add a **persistence deriver** + implement the reserved `database` adapter slot in
  `apps/workspace/lib/workspace-config.js`. The deriver reads the persistence mode and whether runtime state
  (run records, `lastResponse`, source records, swarm evidence) is *durable*, and emits self-describing steps:
  *"Runs are ephemeral in read-only mode → connect a database so workflow runs, source records, and swarm
  evidence survive restart and redeploy."*
- **Config deltas.** Reads `persistenceMode`, `WORKSPACE_CONFIG_ALLOW_FS_WRITE`, durability of run fields.
  Writes (on user action) the governed persistence/adapter config and activates the database adapter.
- **Self-describing nudge.** The single biggest invisible failure mode ("I deployed and nothing saves")
  becomes a derived, fixable step instead of a 409.
- **Drives.** **Swarm orchestration** (swarms can't accumulate cross-run evidence without durable state) and
  **full custom apps** (a real app needs real persistence). This is the prerequisite that unblocks both.

### 3. Workflow + agent observability derived from run-state deltas

- **Where it is today.** Sandbox-environment rows already carry `status`, `lastRunId`, `lastResponse`,
  `lastSourceId`; `deriveLatestRunStatus()` already parses `exitCode`; `lib/orchestration-run-console.js`
  exists; agents carry `budgetMonthlyCents` and runtime state. But there is **no rolled-up, self-describing
  health surface** across all runs/agents.
- **The move.** A **monitoring deriver** that rolls up run-state deltas across every sandbox-environment row
  and bound agent → success / fail / never-run counts, last-run health, cost burn vs budget, and *blocked
  orchestrations*. Renders as an "Orchestration Health" lens plus a live run console fed by the existing
  `ExecutionEvent` NDJSON stream.
- **Config deltas.** Reads sandbox rows' run fields, agent budget/runtime state, source-record counts. Writes
  nothing.
- **Self-describing nudge.** *"3 workflows healthy, 1 failing at node N, 2 never run → launch this swarm / fix
  this node."* The monitoring surface is itself the next-action engine.
- **Drives.** **Swarm orchestration** — makes a swarm's work legible, costed, and steerable, which is the
  difference between "agents ran something" and "I am operating a fleet of agents."

---

## Tier 2 — Manage many apps in one runtime (the super-admin asks)

### 4. Multi-app / sub-dashboard management beyond the super-admin builder

- **Where it is today.** `growthub workspace surface list` **already detects** `apps/workspace`,
  `apps/agency-portal`, and `studio` — the runtime *already* hosts multiple app surfaces; the server is already
  multi-tenant (companies / projects / executionWorkspaces). What's missing is a **governed, self-describing
  surface** that treats each deployed app as a first-class managed entity. Dashboards are also trapped inside
  the single super-admin builder.
- **The move.** Add an **App Registry** governed object + a **fleet deriver** that treats each app/surface as a
  managed entity with *its own* derived activation state, persistence mode, deploy status, and **exportable,
  portable dashboards**. Each app owns its dashboards (exportable/importable as artifacts, outside the
  super-admin builder); the super-admin sees the roll-up of all apps.
- **Config deltas.** Reads detected surfaces, per-app provenance/config, deploy + persistence state. Writes app
  registry rows + per-app dashboard export artifacts.
- **Self-describing nudge.** Super-admin "explains itself at every state": *N apps, each with a derived
  next-action, each with exportable dashboards, plus a path to spin up a new one.*
- **Drives.** Directly answers "manage multiple deployed applications within the same runtime" and "export and
  manage dashboards outside the main super-admin builder." Foundation for **full custom apps** as managed units.

### 5. Self-describing deploy lane (make Quickstart's weakest verb causal)

- **Where it is today.** Quickstart's loop ends in `Save / Export / **Deploy**`, but Deploy is the *least*
  self-describing verb: `WORKSPACE_DEPLOY_FLOW.md` is a CLI/JSON runbook, and `read-only` deploys fail PATCH
  silently. `growthub workspace deploy check --json` already returns `missingSteps`, `appRoot`,
  `envVarsNeeded`.
- **The move.** Wrap that **already-existing deploy-check JSON** in a **deploy deriver** rendered in the same
  panel: *"This app is deploy-blocked: env var Y missing, persistence is read-only → fix Z, then deploy."*
- **Config deltas.** Reads deploy-check output, env var presence, persistence mode (ties to Item 2). Writes
  nothing until the user acts.
- **Self-describing nudge.** Closes the loop from "built in the builder" to "live deployed app" — the literal
  last verb of the shipped Quickstart, made causal.
- **Drives.** **Full custom apps** — shipping is the payoff; this removes the cliff between build and live.

---

## Tier 3 — Push the loop past "run a workflow" to its real destinations

### 6. Task management as a governed object + derived task lens

- **Where it is today.** The project-management template literally pulls "active tasks" into
  `project-task-source` via Nango, but tasks are read-only source-record rows — there is **no managed task
  object** a human or a swarm can create, assign, and close.
- **The move.** A governed `task` object pattern + a **task deriver** that surfaces tasks created by humans
  *and proposed by agent swarms*, with status deltas, on the same surface. Reuses the existing
  `dataModel.objects[].rows` + `fieldSettings` contract (and the saved-views shape already specced in
  `docs/DATA_MODEL_SAVED_VIEWS_SELECTION_UX.md`).
- **Config deltas.** Reads/writes `dataModel.objects[task].rows` status fields through the existing `dataModel`
  PATCH key.
- **Self-describing nudge.** *"The orchestration swarm proposed 6 tasks → approve / assign / close."* Human and
  swarm operate the identical task surface — the AWaC two-sided invariant.
- **Drives.** **Swarm orchestration** (swarms emit tasks; humans govern them) and **full custom apps** (tasks
  are the unit of work a real application coordinates).

### 7. "Build a full application" activation lane

- **Where it is today.** Activation tops out at step 5, "run your workflow." There is no nudge from "I have
  objects + a dashboard + a workflow" toward "I have a deployable application."
- **The move.** An **app-building deriver** that activates *after* the base 5-step loop completes and derives
  the next tier: *"You have objects, dashboards, and a working workflow → assemble them into a deployable
  application surface (a new app in `apps/`, its own dashboards, its own activation adapter, swarm-operable from
  birth)."* Scaffolds via the existing **workspace helper apply** path so the new app ships its own activation
  adapter — meaning a swarm can be handed its condition immediately.
- **Config deltas.** Reads completion of the base lens; writes a new app surface + its seeded config + its own
  activation adapter (the self-activating-template pattern the `project-management` template already proves).
- **Self-describing nudge.** The loop never dead-ends at a dashboard — it keeps pointing at the next, higher
  unit of value.
- **Drives.** The explicit ask: **building out customized full applications**, each born swarm-operable.

---

## Tier 4 — The bridge between humans and swarms

### 8. Swarm-assignable condition packet (compose every lens into an agent job)

- **Where it is today.** The metadata-graph route (`GET /api/workspace/metadata-graph`) is live and activation
  state is derivable, but they are **not composed** into the assignment shape the AWaC white paper §6 describes.
- **The move.** Expose one read-only endpoint that composes *any* lens from Item 1 into the swarm assignment
  packet: `{ goal, currentState (n/m), blockedStep, prerequisite, availableTools, expectedEvidence }`.
- **Config deltas.** Reads the composed derived state + metadata graph. Writes nothing.
- **Self-describing nudge.** The human's panel and the agent's task packet become the **same** low-entropy
  state machine — exactly the 0.13.7 thesis, now machine-addressable.
- **Drives.** **Swarm orchestration** as the headline outcome: point any swarm at any app/workspace/lens and it
  knows the goal, the blocker, the tools, and the evidence it must produce. This is what turns "self-describing
  UI" into "high-impact agent-swarm orchestration."

---

## Sequencing (by leverage and dependency, not dates)

1. **Item 1** first — the keystone refactor turns every later item into "register a deriver."
2. **Items 2 & 3** — make the runtime real and observable; swarms and deployed apps both depend on durable,
   monitorable state.
3. **Items 4 & 5** — manage many apps in one runtime and make deploy self-describing (the super-admin asks).
4. **Items 6 & 7** — push the loop past "run a workflow" to managed tasks and full deployable apps.
5. **Item 8** — compose all of it into the swarm assignment packet; highest-order payoff, lowest marginal cost
   once Item 1 exists.

The through-line: **we are not adding features — we are generalizing the one causal primitive 0.13.7 shipped so
the workspace explains itself at every state up to super-admin, and every delta in the configuration nudges the
user (or the swarm) toward the two things that create real-world value: orchestrating agent swarms and building
and shipping full custom applications.** Every mutation stays inside the
`dashboards / widgetTypes / canvas / dataModel` PATCH boundary; every lens stays a pure derivation; humans and
agents stay on the identical state.
