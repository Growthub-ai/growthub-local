# Swarm Society Simulation V1

Empirically-grounded agent-based modeling over the **already-shipped** Agent
Outcome Receipt stream. It predicts which resource conflicts, policy
violations, and workflow bottlenecks a swarm will produce — *before* a
workspace is cloned to a new tenant — using the workspace's own receipts as the
behavior corpus.

As with `docs/WORKSPACE_CAUSAL_SIMULATION_V1.md`, the academic grounding (§1)
is kept strictly separate from the mechanism (§2). The mechanism contains no
ants and no metaphors.

---

## §1 — Academic grounding (intuition ONLY; not code)

- **Epstein & Axtell, Sugarscape (1996)** — simple agents under local rules
  produce emergent macro behavior. Our agents run under scoped assignment
  packets and the mutation boundary; that *is* the Sugarscape-style rule set.
- **Bonabeau, Swarm Intelligence (1999)** — decentralized agents leave traces
  in the environment (stigmergy). Our outcome receipts are those traces.
- **Orcutt microsimulation (1957)** — behavioral parameters estimated from data
  rather than assumed. Our parameters are estimated from the receipt stream.

The transferable idea, and only this: **with a fixed agent rule set, a defined
environment, and a record of past behavior, you can run a discrete-event
simulation that predicts emergent macro outcomes.** Everything below is the
concrete Growthub realization — no ants are simulated.

---

## §2 — Mechanism (the implementation)

`apps/workspace/lib/swarm-society-simulation.js` — pure, deterministic (seeded
RNG), no I/O, no mutation, never throws.

### B2 — Behavior profiling from the receipt stream (`deriveSwarmBehaviorProfiles`)

Reads the shipped `workspace:agent-outcomes` stream (Agent Outcome Loop V1).
Groups receipts by `actor` (or `lane`/`kind`) and estimates per-agent
parameters from the **real** receipt fields (`outcomeStatus`, `lane`,
`nextActions`):

- `blockedRate`, `failureRate`, `repairTriggerRate` (receipts carrying repair
  guidance / `nextActions`).
- **`routeShoppingRate`** — `P(route-shop | blocked PATCH)`: a `blocked`
  `untrusted-direct` (PATCH) receipt followed, in that actor's own chronology,
  by an `execution-proof` (sandbox-run) attempt. This is detected as a
  *sequence*, not a naive count — it is the empirical "tried to get around the
  policy" signal.
- `global.fidelity` — confidence in the corpus, saturating with receipt volume
  (`n/(n+20)`); a thin stream yields a low-fidelity, clearly-flagged report.

### B1 — Workspace simulator (`simulateSwarmSociety`)

A discrete-event ABM. Virtual agents (each bound to a profile) run a workload
of tasks over the governed object environment (`dataModel.objects[]`). Each tick
schedules up to `concurrency` agents round-robin; each performs a governed-lane
attempt drawn from its profile:

- blocked → a `untrusted-direct` "blocked" simulation receipt; may **route-shop**
  to an `execution-proof` attempt (per `routeShoppingRate`); resolves via repair
  (per `repairTriggerRate`) after `repairTicks`, else fails.
- two agents targeting the same object in one tick → a **contention** event.

Every virtual action emits a simulation receipt in the **identical receipt
schema**, flagged `isSimulation: true` — in-memory return data only, never
persisted. Metrics:

- **violation density** — violations per 1000 actions.
- **contention hotspots** — objects most contested, ranked.
- **swarm stability** — coefficient of variation of per-tick violations split
  front/back half ⇒ `stable | oscillating | diverging`.
- **mean time to resolve** — mean ticks a repaired block costs.

### B3 — Multi-tenant Swarm Predictability Report (`deriveSwarmPredictabilityReport`)

The enterprise deliverable. Profiles (B2) + simulation (B1) + a concurrency
sweep (`findSafeConcurrency`) → a report for a proposed config + workload:

```
{ kind: "growthub-swarm-predictability-report-v1", version: 1,
  verdict: "safe-to-clone" | "review-before-clone" | "unsafe-diverging" | "insufficient-evidence",
  fidelity, expectedViolationRatePer1000, meanTimeToResolveTicks, swarmStability,
  safeConcurrency, concurrencyLadder: [ { concurrency, violationDensity, stability, ok } ],
  contentionHotspots, behaviorProfiles, global, simulation, rationale }
```

`safeConcurrency` is the highest concurrency at which simulated violation
density stays within budget and the swarm does not diverge — the **safe
concurrency limit** for the tenant clone.

---

## §3 — Product surface

`GET /api/workspace/swarm-predictability` (read-only; mirrors
`swarm-condition` / `simulation` routes):

```
GET /api/workspace/swarm-predictability?agents=12&tasksPerAgent=50&concurrency=8&seed=7
```

Before cloning a workspace for a new department: run it, read the report, set
the safe concurrency. No other agent framework can do this — none has the
governed receipt trace required to estimate the behavior corpus.

---

## §4 — Boundaries

- **`@growthub/api-contract` untouched** — no SDK contract change.
- **No new schema, no new mutation path.** It READS the receipt stream + config
  and writes nothing. Simulation receipts are in-memory, `isSimulation:true`.
  Real writes still flow only through `PATCH /api/workspace` and
  `POST /api/workspace/sandbox-run`.
- **Deterministic** (seeded). **Never asserts** without evidence — an empty
  corpus returns `insufficient-evidence`.

## §5 — Cockpit surface (shared, identical to the swarm cockpit)

The simulation is operated through the **same sidecar grammar** as the swarm
cockpit — no new navigation, no new visual language, no broken mental model.

- **Shared config** — `lib/simulation-cockpit-config.js` is the single contract
  both entry points use: the read-only endpoint, the clamped parameter fields
  (agents / tasks / concurrency / seed), and the verdict→dot vocabulary
  (`dm-run-console__tree-dot` variants). Pure and tested.
- **Cockpit** — `app/data-model/components/SimulationCockpit.jsx` reuses the
  exact swarm-cockpit CSS (`dm-swarm-cockpit`, `dm-helper-toolcall`,
  `dm-swarm-card`, `dm-run-console__hint`, `dm-helper-setup-input`,
  `dm-btn-primary`). It calls `GET /api/workspace/swarm-predictability` via the
  shared config and renders the Predictability Report. Strictly read-only.
- **Two seamless entry points, one cockpit:**
  - **`/simulate`** helper command (read-only view switch, same pattern as
    `/workflows`) opens the cockpit inside the chat widget composer.
  - A **seamless white "Run simulation" button** in the Workspace Lens helper
    card (inherits the existing `.workspace-lens-helper-card-body button` white
    style) opens the *same* sidecar in the simulation view via a new
    `initialView` prop — gated by the identical helper-setup check.
- **Closed loop** — the report is derived from the agent-outcome receipt stream
  the configured agent emits; running a simulation refreshes the host config so
  the user's Data Model records stay in sync, exactly as swarm runs do.

## §6 — Validation

- `scripts/unit-swarm-society-simulation.test.mjs` — 9 tests: profiling rates,
  sequence-based route-shopping detection, simulation determinism, blocked-rate
  monotonicity, simulation-receipt schema/flag, concurrency↔contention, safe
  concurrency + verdicts, empty-corpus insufficiency, never-throws.
- `scripts/unit-simulation-cockpit-config.test.mjs` — 6 tests: the shared
  cockpit config (clamps, query building, verdict vocabulary, summary).
- `scripts/unit-simulation-cockpit-wiring.test.mjs` — 5 structural tests: the
  cockpit reuses the swarm CSS grammar and is read-only; the sidecar mounts it
  under the `simulation` view + `initialView`; `/simulate` is a governed
  read-only view switch; the Lens exposes the shared white action.
- `scripts/unit-helper-command-registry.test.mjs` — `/simulate` governance.

Run: `node --test scripts/unit-swarm-society-simulation.test.mjs scripts/unit-simulation-cockpit-config.test.mjs scripts/unit-simulation-cockpit-wiring.test.mjs`
