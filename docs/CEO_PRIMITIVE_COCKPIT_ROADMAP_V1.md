# CEO-Primitive Cockpit Roadmap V1 — a true CEO agent for the assistant widget helper

**What this is.** A source-grounded correlation between the **Paperclip CEO agent**
(the orchestration apex of the upstream `@paperclipai` harness this repo is built
on) and the **assistant widget helper** (the governed workspace helper inside the
starter workspace), plus a highest-value-first, fully backwards-compatible roadmap
that brings the CEO's *orchestrate → create → test → launch → review → govern →
observe* loop into the helper **strictly through the
[Governed Cockpit Entry-Point Pattern V1](./GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1.md)**.

**What this is not.** It is not a proposal to build a second agent runtime, a second
sidecar, a new API, a new PATCH field, a new schema, or a new persistence backend.
Every item below is a *projection of state that already exists in the contract* —
a pure deriver plus a cockpit view, and at most one additive optional field on an
existing proposal payload. Nothing here changes or compromises current behavior.

> Source-of-truth order (per `AGENTS.md`): runtime route files win over this doc.
> Every "already exists" claim cites a real `file:line`. The upstream harness lives
> vendored at `cli/dist/runtime/server/node_modules/@paperclipai/*`; helper paths
> below are under `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/`
> unless otherwise noted.

---

## 1. Current State

### 1.1 The Paperclip CEO — the orchestration apex (upstream harness)

The CEO is not a feature; it is the top **agent role** in a C-suite + IC hierarchy,
and the only role granted creation/assignment authority. Its loop is deterministic
and human-gated.

| CEO primitive | What it does | Source (`@paperclipai` + server) |
| --- | --- | --- |
| **Role / authority** | `AGENT_ROLES = ["ceo","cto","cmo","cfo","engineer","designer","pm","qa","devops","researcher","general"]`; CEO is the apex | `shared/dist/constants.d.ts:15` |
| **CREATE** | `canCreateAgents` is CEO-exclusive; hiring creates an `Agent` with `reportsTo`, `adapterType`, `budgetMonthlyCents` | `server/src/services/agent-permissions.ts:7`; `server/src/services/approvals.ts:100-162` |
| **HIERARCHY** | `Agent.reportsTo` + `AgentChainOfCommandEntry[]`; `orgForCompany` builds the tree from the CEO (`reportsTo = null`) | `shared/dist/types/agent.d.ts:14-44`; `server/src/services/agents.ts:692-730` |
| **ORCHESTRATE** | CEO auto-gets `canAssignTasks: true` (`taskAssignSource: "ceo_role"`); assigns issues → wakeup → run | `server/src/routes/agents.ts:85-91`; `server/src/services/heartbeat.ts:3083+` |
| **TEST (pre-launch)** | `adapter.testEnvironment → AdapterEnvironmentTestResult { status: pass\|warn\|fail, checks[] }` before deploy | `shared/dist/types/agent.d.ts` (`AdapterEnvironmentTestResult`); `server/src/routes/agents.ts:512-546` |
| **LAUNCH** | `executeRun` dispatches through the adapter; `compute-scheduler` gates capacity; heartbeat queue | `server/src/services/heartbeat.ts:3758+`; `server/src/services/compute-scheduler.ts:88-174` |
| **REVIEW** | `enforcePerformanceReview` rolls up each agent's completed/blocked work and assigns an improvement issue back to the CEO | `server/src/services/gtm-campaign-policy.ts:139-272` |
| **GOVERN** | `APPROVAL_TYPES = ["hire_agent","approve_ceo_strategy","budget_override_required"]`; per-agent budget caps | `shared/dist/constants.d.ts:37`; `approvals.ts:100-162` |
| **OBSERVE** | `LIVE_EVENT_TYPES = ["heartbeat.run.queued",…,"agent.status"]`; NDJSON run logs; activity log | `shared/dist/constants.d.ts:73`; `server/src/services/run-log-store.ts:98-143`; `activity-log.ts:36-88` |
| **REVISION/ROLLBACK** | `AgentConfigRevision { changedKeys, beforeConfig, afterConfig, rolledBackFromRevisionId }` | `shared/dist/types/agent.d.ts` (`AgentConfigRevision`) |

The CEO never executes directly from reasoning: it **proposes intent → a human/board
gate approves → a deterministic executor dispatches**, and every step is observed
through the live-event/run-log/activity-log substrate.

### 1.2 The assistant widget helper — a governed propose→apply engine

The helper is a **propose-only** planning engine for the workspace. It drafts
config and agent-swarm intent, returns structured proposals, and writes nothing
until a human applies them.

- **Intents (8):** `build_dashboard | create_widget | register_api | create_object | edit_view | repair | explain | swarm` (`packages/api-contract/src/helper.ts:33-41`).
- **Propose → apply → receipt:** `POST helper/query` proposes (no writes); `POST helper/apply` validates against `validateWorkspaceConfig` and writes; `GET helper/receipts` is the audit trail. The PATCH allowlist `dashboards|widgetTypes|canvas|dataModel` is the hard ceiling (`helper.ts:105-119`; `lib/workspace-helper-apply.js`).
- **Swarm lane (already a CEO-shaped move):** the helper proposes *intent* (objective, agent roles, task prompts, concurrency, outcome criteria); the **server** reduces it via `buildDefaultAgentSwarmGraph` inside `buildSandboxRowFromSwarmProposal` and upserts a `sandbox-environment` row carrying an `agent-swarm-v1` graph — the model never hand-authors the graph (`lib/workspace-swarm-proposal.js:1-22, 306+`; `app/api/workspace/helper/apply/route.js:150-311`).
- **Swarm runtime = orchestrator → workers → synthesizer:** a real three-phase pipeline already exists (`lib/orchestration-agent-swarm.js:2-25`), executed only through `POST sandbox-run`, with **truthful** per-task telemetry (`tokens`, `tools`, `startedAt`, `endedAt`, `phaseId` — `null` when the adapter reports nothing) (`orchestration-agent-swarm.js:160-166`; `SWARM_RUN_CONTRACT_V1.md:169-172`).
- **Eligibility gate:** `deriveSwarmWorkflowExecutionEligibility` returns `{ ready, status, missing, guidance }` and blocks unrunnable Play *before* a failed run (`lib/workspace-swarm-proposal.js:194-228`).
- **Receipts + cockpit:** every lane emits the canonical `AgentOutcomeReceipt` into `workspace:agent-outcomes`; `GET agent-outcomes` returns the stream + a recomputable `WorkspaceGovernanceSummary` (`packages/api-contract/src/workspace-outcome.ts:56-136`; `lib/workspace-outcome-receipts.js`; `app/api/workspace/agent-outcomes/route.js`).
- **The four cockpit surfaces already exist:** the "Ask helper" pill (`app/workspace-rail.jsx:1813`), the `HELPER_COMMANDS` slash registry (`app/data-model/components/helper-commands.js:18`), the `activeView` switch (`HelperSidecar.jsx:379,1072-1087`), and the mirror-target cockpit `SwarmRunCockpit.jsx`.

### 1.3 The correlation, in one sentence

**The helper already *is* a CEO at the workspace altitude — it proposes intent,
a human approves, the server builds and dispatches, and every outcome is a receipt.**
The swarm lane proves the loop end-to-end. What is missing is not a runtime; it is
a set of **projections** that make the CEO's *hierarchy, pre-launch test, budget,
review, and supervision* visible and operable over the receipt stream that already
captures them.

---

## 2. Missing Extension (gap analysis — four honest categories)

| CEO primitive | Helper status | Classification | Evidence of the gap |
| --- | --- | --- | --- |
| Orchestrate + observe a *fleet* of agents/workflows | Per-row eligibility + per-run console exist; no rolled-up fleet view | **Partially Exists** | `deriveSwarmRunProjection` is per-record (`orchestration-run-console.js`); no deriver rolls up all `swarm-workflows` rows + their receipts |
| Pre-launch **test** as a first-class gate | Eligibility driver blocks unrunnable Play | **Partially Exists** | `deriveSwarmWorkflowExecutionEligibility` exists (`workspace-swarm-proposal.js:194-228`) but is not surfaced as a fleet-wide readiness cockpit; adapter-readiness checks not projected |
| **Govern** via budget ceiling / cost decomposition | Proposal carries `timeoutMs`/per-task token telemetry; no cost rollup | **Partially Exists** | per-receipt `runId` telemetry exists (`workspace-outcome.ts`); no `deriveSwarmCostSignals` |
| **Supervise** / detect authority bypass | `blockedAttempts` counted; enforcement closes route-shopping | **Missing (detection)** | no correlation of a blocked `untrusted-direct` receipt → later `execution-proof` by same `actor` (the pattern doc's §3 worked example) |
| **Hierarchy** (reportsTo / chain-of-command) among swarm agents | Swarm agents are flat `role + taskPrompt` | **Missing** | `normalizeSwarmAgent` has no `reportsTo`/`manager` (`workspace-swarm-proposal.js:306+`); runtime is orchestrator→workers→synth, no named reporting tree |
| **Review → improve** loop (CEO reviews output, files follow-up work) | run records carry per-agent transcripts; no review packet, no task object | **Missing** | no `deriveSwarmRunReview`; managed follow-up work should stay inside the governed helper proposal lane |

Everything classified **Partially Exists / Missing** is recoverable as a *projection*
— none requires a new runtime or a new mutation path.

---

## 3. Strategic Direction

1. **Mirror, don't rebuild.** The CEO's authority loop and the helper's propose→apply
   loop are the same shape. Bring CEO primitives in as **derivers + cockpit views**
   over `workspace:agent-outcomes` and the config — the substrate already records
   the facts.
2. **Read before write.** Every read-only projection ships first: it is the
   highest-value, lowest-risk leverage because the data already exists and nothing
   can regress. Mutating moves come only after the observation surface that justifies
   them exists.
3. **One additive optional field beats one new type; one new type beats one new field.**
   When a mutation is unavoidable, prefer extending an existing proposal payload
   (e.g. `swarm.run.propose`) with an *optional* field whose absence reproduces
   today's behavior — never widen the PATCH allowlist, never bump a contract version
   literal (it stays `1`, `workspace-outcome.ts:206`).
4. **Eligibility, not flags.** Every gate is a deterministic function over evidence
   that returns the next eligible action — the `deriveSwarmWorkflowExecutionEligibility`
   precedent — never a hidden boolean.

The "best correlation to the future we want": the CEO's value is *orchestrating
swarms* and *shipping outcomes*; the workspace's stated north star is identical —
orchestrating agent swarms and building and shipping full custom applications.

---

## 4. Phased Implementation (value-ordered by leverage + dependency — no timelines)

Ordering rule: **read-only projections first (highest value, lowest risk), then the
smallest backwards-compatible mutation, then the loop-closing capstone.** Each item
is a full instance of the cockpit entry-point spine.

> **Implementation status.** Shipped as the **CEO Cockpit** surface — a single
> `/ceo` view inside the shared `HelperSidecar` (so it appears identically in Data
> Model, Workspace Lens, and the Workflow canvas), reachable via the `/ceo` slash
> command and a **CEO rail pill** (`workspace-rail.jsx`, opening directly to the view
> through an additive `initialView` prop). It has two state-derived modes:
>
> - **Operational (R1+R2)** — `deriveCeoCockpit` (`lib/ceo-cockpit-console.js`)
>   projects the existing `swarm-workflows` fleet into per-workflow reports +
>   readiness + a single "Needs your attention" pick; every "Open" hands off to the
>   existing `swarm-run` surface.
> - **Bootstrap (first-use closed loop)** — `deriveCeoBootstrapState`
>   (`lib/ceo-bootstrap-console.js`) renders a governed first-use checklist that
>   proves the loop end-to-end (create → test → launch → observe → review → govern →
>   complete). Completion is stamped into workspace config (a marker on the
>   well-known `workspace-helper` row) through a new `ceo.bootstrap.complete`
>   proposal routed inside `helper/apply` — gated on config-provable evidence (a
>   ready swarm with a completed run), idempotent, and then the checklist disappears
>   for that workspace (mode flips to operational).
>
> No new API route, PATCH allowlist field, object type, executor, or browser state.
>
> **Fleet vs Agent Teams (two levels, one /ceo surface).** *Fleet* is the
> runtime/oversight level — the existing `swarm-workflows` rows, readiness, run
> state, failures, and receipts (Background Tasks). *Agent Teams* is the atomic
> *configuration* level — reusable blueprints (orchestrator, sub-agent roles,
> skills, processes, workflow responsibilities, outcome criteria) saved as rows in
> a governed `agent-swarm-teams` Data Model object of the existing `custom`
> objectType (`lib/ceo-agent-teams.js`). The CEO cockpit can create that table
> through the existing `dataModel.object.create` helper/apply lane and bridge a
> blueprint into the existing `/swarm` composer — the server still builds the
> `agent-swarm-v1` graph, the run still lands in `swarm-workflows`, and execution
> still happens through `sandbox-run`. **Agent Team records never execute** — they
> are configuration, not runtime. No new objectType, route, PATCH field, or executor.
>
> **Companion surface.** A `CEO Daily Operating Dashboard` template ships in the
> existing `DASHBOARD_TEMPLATES` (`lib/workspace-schema.js`) — an outside-the-assistant
> executive operating surface (today's focus, loop scorecard, direct reports, blocked
> work, governance receipts, ritual notes). It is a **product-taste companion, not a
> runtime authority surface**: every widget is a manual/sample binding (no live-data
> claim, no new object), it clones through the existing template path and passes
> `validateWorkspaceConfig`, and it points the operator back to the CEO Cockpit (`/ceo`)
> for the live computed next move. The live loop authority remains the cockpit + receipts.
> Files: `lib/ceo-cockpit-console.js`, `lib/ceo-bootstrap-console.js`,
> `app/data-model/components/CeoCockpit.jsx`; additive edits to `helper-commands.js`,
> `HelperSidecar.jsx`, `helper/apply/route.js`, `workspace-rail.jsx`,
> `DataModelShell.jsx`, `workspace-builder.jsx`; tests
> `scripts/unit-ceo-cockpit-console.test.mjs`, `scripts/unit-ceo-bootstrap-console.test.mjs`.

### Phase R — Read-only CEO projections (ship in any order; all zero-risk)

**R1 — Swarm Fleet Cockpit** *(CEO: orchestrate + observe; "see every agent at a glance")*
The CEO's `orgForCompany`/run-observation rollup, at workspace altitude. A pure
deriver rolls up every `swarm-workflows` `sandbox-environment` row + its
`execution-proof` receipts into per-workflow health (`ready | blocked | never-run | failing`),
last-run outcome, agent count, and truthful token/tool totals (`null` when unreported).
This realizes observability as a cockpit. *Highest value, lowest effort — all data already exists.*

**R2 — Pre-Launch Readiness Cockpit** *(CEO: `testEnvironment` gate)*
Composes the existing `deriveSwarmWorkflowExecutionEligibility` across the fleet into
a readiness packet ("3 ready · 1 blocked: missing agent host → fix Z"). Mirrors the
CEO rule "never launch an agent whose adapter env did not pass." Read-only; reuses the
eligibility driver verbatim. *This is the explicit "test" verb, made fleet-wide.*

**R3 — Governance Causation Cockpit** *(CEO: supervise / audit authority)* —
**SHIPPED** (snapshot: [`GOVERNANCE_CAUSATION_COCKPIT_RELEASE_SNAPSHOT_V1.md`](./GOVERNANCE_CAUSATION_COCKPIT_RELEASE_SNAPSHOT_V1.md)).
The pattern doc's own §3 worked example: `deriveRouteShoppingSignals(receipts)`
correlates a blocked `untrusted-direct` receipt with a later `execution-proof`
attempt by the same `actor`. Pure, read-only, lowest-risk — it is the canonical
template. Shipped as `lib/governance-causation-console.js` +
`GovernanceCausationCockpit.jsx`, reachable via the `/governance` slash command
on `activeView: "governance"`; UI-only (contract version stays `1`, no
`routeShopSignals?` field added). *Include verbatim from the pattern doc.*

**R4 — Cost / Budget Decomposition Cockpit** *(CEO: `budgetMonthlyCents` ceiling, `budget_override_required`)*
`deriveSwarmCostSignals(receipts)` over per-receipt `runId` token telemetry → cost
burn per workflow/actor against a soft ceiling. May add an *optional* `costSignals?`
on `WorkspaceGovernanceSummary` (additive, version stays `1`) or stay UI-only. The
pattern doc names this as the next feature after R3.

### Phase H — Smallest backwards-compatible mutation

**H1 — Agent Hierarchy in the swarm graph** *(CEO: `reportsTo` + chain-of-command)*
Add an **optional** `reportsTo` / `manager` to the swarm agent *intent* in the
`swarm.run.propose` payload. The server's `normalizeSwarmAgent` + `buildDefaultAgentSwarmGraph`
build a named reporting tree onto the existing orchestrator→workers→synthesizer
runtime. **No new proposal type, no new PATCH field, no new schema** — the graph is
already serialized in `orchestrationConfig`. Absent `reportsTo` ⇒ today's flat
behavior exactly (fully backwards-compatible). R1's Fleet cockpit renders the tree.
*This is the literal "CEO orchestrates a reporting tree of subagents."*

### Phase C — Loop-closing capstone (depends on R1 + H1 + the proposed task object)

**C1 — Outcome-Review → follow-up tasks** *(CEO: `enforcePerformanceReview`)*
`deriveSwarmRunReview(record)` turns a completed run's per-agent transcript/tokens/status
into a review packet, then seeds follow-up **task** proposals through `helper/apply`.
This closes the CEO's review→improve loop: *"the swarm proposed 6 follow-up
tasks → approve / assign / close."* Mutating, but only via the existing propose→apply
lane with human review.

---

## 5. Exact File Edits (per item — additive only)

Convention for every item: **(a)** new pure deriver in `lib/`; **(b)** unit tests;
**(c)** one `HELPER_COMMANDS` row; **(d)** one `activeView` + body-switch mount in
`HelperSidecar.jsx`; **(e)** one sibling pill in `workspace-rail.jsx`; **(f)** one
cockpit component mirroring `SwarmRunCockpit.jsx` composing only `dm-*` primitives.

| Item | New files | Edited files (additive) | Must-not-touch |
| --- | --- | --- | --- |
| **R1 Fleet** | `lib/swarm-fleet-console.js` (`deriveSwarmFleet(config, receipts)`); `SwarmFleetCockpit.jsx`; deriver test | `helper-commands.js` (+`/fleet`, `mutates:false`, `view:"fleet"`); `HelperSidecar.jsx` (+`activeView:"fleet"` + mount); `workspace-rail.jsx` (+Fleet pill) | any route file; PATCH allowlist; `globals.css` colors |
| **R2 Readiness** | `lib/swarm-readiness-console.js` (wraps `deriveSwarmWorkflowExecutionEligibility` fleet-wide); test | render inside R1 cockpit (a readiness card) or `+/readiness` row | the eligibility driver's signature; sandbox-run |
| **R3 Governance** | `lib/governance-causation-console.js` (`deriveRouteShoppingSignals(receipts)`); `GovernanceCausationCockpit.jsx`; test | `helper-commands.js` (+`/governance`); `HelperSidecar.jsx` (+`activeView:"governance"`); `workspace-rail.jsx` (+Governance pill) | `agent-outcomes/route.js` (read unchanged) |
| **R4 Cost** | `lib/swarm-cost-console.js` (`deriveSwarmCostSignals(receipts)`); test | optional additive `costSignals?` on `packages/api-contract/src/workspace-outcome.ts` (version stays `1`); render in cockpit | version literal; any new persistence |
| **H1 Hierarchy** | hierarchy test fixtures | `lib/workspace-swarm-proposal.js` (`normalizeSwarmAgent` reads optional `reportsTo`; builder threads it); `lib/workspace-helper.js` (system prompt documents optional `reportsTo`); `SWARM_RUN_CONTRACT_V1.md` (additive note) | new proposal type; PATCH allowlist; existing flat-graph behavior |
| **C1 Review** | `lib/swarm-run-review-console.js` (`deriveSwarmRunReview(record)`); review cockpit card; test | `helper/apply/route.js` review-seeded task proposals (reuse Item-6 `task` object) | new object type (reuse task object); execution outside sandbox-run |

---

## 6. Runtime Implications

- **Authority unchanged.** Execution stays solely on `POST /api/workspace/sandbox-run`;
  config mutation stays solely on `helper/apply → writeWorkspaceConfig` (gated by
  `validateWorkspaceConfig`). R1–R4 write nothing. H1 changes only the *shape of the
  intent* the server reduces — the server remains the graph builder. C1 mutates only
  through the human-reviewed proposal lane.
- **Determinism preserved.** Local models continue to *propose*; the deterministic
  executor continues to *dispatch*. No deriver performs I/O; cockpit cost is
  `O(window)` over the 200-cap receipt stream.
- **Backwards compatibility.** Every edit is additive: a missing `reportsTo`, a
  missing `costSignals?`, an unread `activeView` all reproduce current behavior
  byte-for-byte. No existing test should need to change.

---

## 7. Validation Requirements

- **Deriver-first unit tests** for each `lib/*-console.js` (pure-function tests over
  fixture config + receipt streams), mirroring the existing swarm/run-console tests.
- **Purity assertions**: no React/fetch/fs/localStorage/CSS in any deriver (the
  swarm CSS lint precedent in `GOVERNED_SWARM_RELEASE_SNAPSHOT_V1.md` applies — no
  new hex colors, no non-inherited lucide icons, no browser storage).
- **Contract guard**: `WORKSPACE_OUTCOME_CONTRACT_VERSION` stays `1`; any added field
  is optional and guarded by `isAgentOutcomeReceipt` (`workspace-outcome.ts:194`).
- **Truthful telemetry test**: unreported tokens/tools render `—`/`null`, never `0`
  or an estimate.
- **H1 compatibility test**: a proposal without `reportsTo` produces the identical
  graph it produces today.
- Green `typecheck` + `lint` + `vitest` before any push.

---

## 8. Anti-Patterns (a violation fails review)

- Adding a new API route, a fifth PATCH allowlist field, a new object type, a new
  persistence backend, or a second sidecar/runtime. (`GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1.md` §6.)
- Letting a local model hand-author the final `agent-swarm-v1` graph — the server
  builds it (`workspace-swarm-proposal.js:1-22`).
- Executing anything from a deriver, slash command, or cockpit UI — execution is
  `sandbox-run` only (`SWARM_RUN_CONTRACT_V1.md:228-230`).
- Bumping a contract version literal for an additive field, or writing a non-optional
  field.
- Fabricating CEO-style metrics (cost, tokens, tools) the adapter did not report.
- Building H1 as a new proposal type or a new agent object instead of an optional
  payload field on the existing `swarm.run.propose`.
- Treating a UI click as completion without a persisted `AgentOutcomeReceipt`.

---

## Appendix — CEO ⇄ Helper primitive map (quick reference)

| Paperclip CEO | Helper today | Roadmap item |
| --- | --- | --- |
| `orgForCompany` / observe runs | per-row eligibility + per-run console | **R1 Fleet** |
| `adapter.testEnvironment` gate | `deriveSwarmWorkflowExecutionEligibility` | **R2 Readiness** |
| activity-log / approval audit | `blockedAttempts` + closed route-shopping | **R3 Governance** |
| `budgetMonthlyCents` / `budget_override` | per-receipt `runId` telemetry | **R4 Cost** |
| `Agent.reportsTo` / chain-of-command | flat `role + taskPrompt` swarm agents | **H1 Hierarchy** |
| `enforcePerformanceReview` | per-agent run transcripts | **C1 Review** |
| `canCreateAgents` + hire approval | `swarm.run.propose` → server builds graph | *already the loop* |
| four `APPROVAL_TYPES` gates | `helper/apply` human-reviewed lane | *already the loop* |
| `LIVE_EVENT_TYPES` heartbeat stream | `workspace:agent-outcomes` receipt stream | *already the loop* |
