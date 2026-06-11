# Roadmap Sprint Items V1 — OSS Repo + Growthub Pro

Sprint-grade expansion of [`ROADMAP_IMPACT_ITEMS_V1.md`](./ROADMAP_IMPACT_ITEMS_V1.md). Every item names the shipped extension point it builds on — no item invents architecture, no item carries a date. Ordered by leverage and dependency.

**The split rule (the authority boundary):** the OSS repo owns the local-first governed loop end to end. Growthub Pro never adds a new local runtime authority — it attaches at exactly three seams that already exist: **API Registry rows** (as scheduler/gateway targets), the **auth bridge** bearer connection (`docs/GROWTHUB_AUTH_BRIDGE.md`, `mcp_connections`), and **signed authority attestations** (the `growthub kit fork authority` ed25519 envelope pattern). If a Pro feature can't attach at one of those three seams, it's an OSS feature or it's wrong.

All workspace-kit paths relative to `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/`.

---

## Track A — growthub-local (open-source repo)

### A1. Database persistence adapter — fill the reserved V2 slot

- **Source of truth today:** the Quickstart persistence table ships `database — Reserved (V2), not implemented`; `lib/workspace-config.js` holds the adapter slot; `read-only` mode (the Vercel default) returns `409` on `PATCH /api/workspace`, so deployed workspaces silently cannot persist run evidence.
- **Sprint shape:** implement the `database` adapter behind the existing `readWorkspaceConfig` / `writeWorkspaceConfig` / `read/writeWorkspaceSourceRecords` seam (one chokepoint, already abstracted). The persistence lens (`derivePersistenceLensState`, shipped) already knows how to nudge toward it.
- **Why first:** every other item below assumes durable evidence. Swarm runs, receipts, reward series, and metering are all source records — on ephemeral deploys they vanish on restart. This is the single biggest invisible failure mode and the explicit Tier-1 roadmap item.
- **Acceptance:** a swarm run executed on a deployed instance survives restart/redeploy; persistence lens flips to durable; `409` path becomes a derived, fixable step.

### A2. Durable run-control: cancel + partial resume (Swarm Run Contract V2, additive)

- **Source of truth today:** `SWARM_RUN_CONTRACT_V1.md` §9 ("Stop aborts the active client request only… Introducing a durable cancel requires its own governed proposal") and §10 ("a future durable resume (re-running only failed subagents) must land as a new additive contract version"). `sandbox-run` is synchronous; the runtime checks nothing between phases.
- **Sprint shape:** cancellation as a governed intent — a run-control source record keyed to `lastRunId`; the executor checks it at phase boundaries and between worker-pool slots (`runSubagentsWithConcurrency`, `orchestration-agent-swarm.js:602`); additive events (`swarm_run_cancelled`); `swarm.run.resume` payload gains an additive `failedSubagentsOnly` flag that re-dispatches only `required && !ok` subagents, reusing persisted task results for the rest.
- **Why now:** the contract itself names this as the next version. Long swarms without durable cancel are the first thing real operation hits.
- **Acceptance:** cancel during Dispatch persists a truthful partial record (completed tasks keep telemetry, cancelled tasks marked, never fabricated); resume of a 1-failed-of-4 run executes exactly one subagent; both pinned in `unit-orchestration-agent-swarm*.test.mjs` and the e2e probe.

### A3. Orchestration health deriver (roadmap Item 3, made concrete)

- **Source of truth today:** every sandbox row already carries `status`, `lastRunId`, `lastSourceId`, `lastResponse`; `deriveLatestRunStatus()` parses `exitCode`; reward telemetry persists per run; the lens registry + panel render any deriver for free.
- **Sprint shape:** a pure `deriveOrchestrationHealthLensState()` rolling up all sandbox-environment rows: healthy / failing-at-node / never-run counts, reward-score trend per workflow, cost burn (token totals from receipted runs vs. the agent budget fields), blocked orchestrations (eligibility-gated rows). Every unhealthy state composes into `deriveSwarmConditionPacket()` — a failing workflow is itself a dispatchable repair job.
- **Acceptance:** lens card reads "N workflows · H healthy · F failing at node · U never run · next action"; the same state is served by `GET /api/workspace/swarm-condition`; zero fetches, zero writes, never throws on partial rows.

### A4. Surface manifest → App Registry + fleet deriver (unblock staged Item 4)

- **Source of truth today:** Item 4 is explicitly staged for one stated reason: surface detection lives in the CLI (`growthub workspace surface list` already detects `apps/workspace`, `apps/agency-portal`, `studio`) but the artifact has no in-config surface registry — and inventing one ad hoc would violate the pure-derivation guardrail.
- **Sprint shape:** two halves. (1) The CLI export/surface path writes a **surface manifest** into the artifact as a governed `app-registry` Data Model object (additive object type, existing `dataModel` PATCH lane — the same well-known-object pattern as `swarm-workflows` and `helper-threads`). (2) A fleet deriver then becomes legal pure derivation: per-app activation state, persistence mode, deploy readiness (`workspace deploy check --json` already returns `missingSteps`/`envVarsNeeded`), and exportable per-app dashboards.
- **Why this is the super-admin keystone:** metering, confinement, and per-app customization all need an addressable registry of what apps exist. This is the prerequisite the roadmap already identified — the sprint just supplies the missing data source the right way.
- **Acceptance:** fleet lens renders one card per detected surface with a derived next action; Item 4's "staged" status flips to shipped without breaking the pure-derivation invariant.

### A5. Apply-policy object: autonomy gradients at the single gate

- **Source of truth today:** `helper/apply` is the **only** mutation chokepoint (`workspace-helper-apply.js`, contract §11); receipts already carry `reviewedBy` and `sessionId`; proposal types and object classes are already enumerable (`WORKSPACE_HELPER_PROPOSAL_TYPES`).
- **Sprint shape:** a governed `apply-policy` object whose rows map `{ actor (role | agent id), proposalType, objectClass }` → `{ require-review | auto-apply | deny }`. Enforced inside `helper/apply` before `applyProposalToConfig`; default row set reproduces today's behavior exactly (everything requires review), so the change is purely additive. Auto-applied proposals still produce receipts, stamped with the policy row that authorized them — policy lineage in the same ledger.
- **Why it's small:** because there is exactly one gate, an autonomy gradient is a lookup table, not a permission system. This is the "policy point" the architecture has been holding open.
- **Acceptance:** an agent granted `auto-apply` on `swarm.workflow.save` can iterate its own graph unattended with full receipts; the same agent's `dataModel` proposals on other objects still queue for review; a `deny` row blocks with a derived reason. Adversarial tests mirror the six-rejection smoke in the release snapshot.

### A6. Evidence-cited proposals: hardening the Gödel loop

- **Source of truth today:** the loop already closes (run → synthesis → reward → persisted source records → editable graph → new proposal), and the canonical demonstration exists (the 0.25 → diagnose → re-propose → 1.0 smoke). What's missing is the **citation**: a proposal carries `rationale` prose but no machine link to the evidence that motivated it.
- **Sprint shape:** additive `evidenceRefs: [sourceId, …]` on the proposal envelope (`packages/api-contract/src/helper.ts`); a reward-series deriver per workflow row (score over run history — the data already persists); the sidecar review card renders "motivated by run `sandbox:…` (reward 0.25, blocked at node X)". Optionally: a lint in apply that warns when a `swarm.workflow.save` against a previously-run row cites no evidence.
- **Why it matters:** this is the difference between *permitted* self-improvement and *accountable* self-improvement. When an agent proposes modifying its own graph, the reviewer (human or policy row from A5) sees exactly which receipts justify it. Self-modification becomes a cited claim, auditable end to end — the operationalized Gödel-agent property, completed.
- **Acceptance:** re-running the canonical smoke produces a second-iteration proposal that cites the failing run's `sourceId`; the receipt chain reconstructs the full improvement narrative (failed run → cited proposal → applied delta → passing run) from source records alone.

### A7. Canvas graph edits as receipted proposals

- **Source of truth today:** swarm creation is proposal/receipt-governed, but subsequent canvas edits write through `PATCH dataModel` directly — valid (inside the allowlist) but invisible to the receipt ledger. Nodes already carry `sandboxRecordRef` identity.
- **Sprint shape:** the canvas save path for `agent-swarm-v1` graphs emits a `swarm.workflow.save` proposal (auto-applied or queued per A5 policy) instead of a raw patch, so every graph mutation lands in the same ledger as creation. `sandboxRecordRef` plus per-node deltas make the receipt summary precise ("changed taskPrompt on subagent-researcher").
- **Acceptance:** the full edit history of a workflow row is reconstructible from receipts; no raw-patch path remains for swarm graphs that bypasses the ledger.

### A8. Adapter telemetry conformance kit

- **Source of truth today:** the truthful-telemetry invariant is contract law, but coverage is adapter-bound: `local-intelligence` reports completion `usage`; `local-agent-host` depends on parsable CLI footers ("supported patterns only"); everything else renders `—`. The e2e probe already demonstrates the stub-adapter pattern (`probe-swarm-stub.js`).
- **Sprint shape:** generalize the probe stub into a published adapter-conformance harness: a documented footer/metadata contract (extend the export-shipped `docs/adapter-contracts.md`), a test kit any adapter author runs (`tokens/tools/timing reported truthfully or null`), and broadened footer parsers for the agent hosts the kit already catalogs (`KNOWN_SANDBOX_AGENT_HOSTS`).
- **Why:** swarm attribution quality is the product. Every host that reports truthfully makes the cockpit, metering (B2), and reward series (A6) more complete — with zero changes to the invariant.

### A9. Governed task object + task lens (roadmap Item 6)

- **Source of truth today:** the project-management template already syncs tasks as read-only source records via Nango; the saved-views shape is specced (`docs/DATA_MODEL_SAVED_VIEWS_SELECTION_UX.md`); swarms have no governed way to *emit* work for humans.
- **Sprint shape:** a `task` object pattern on the existing rows/fieldSettings contract; a `task.propose` proposal type (same `dataModel` lane); the task deriver surfaces human-created and swarm-proposed tasks with status deltas on one surface. Synthesis output gains an optional structured `proposedTasks` block the helper can lift into proposals.
- **Why after A5/A6:** swarm-proposed tasks are exactly the artifact autonomy gradients and evidence citations were built to govern — a swarm proposes 6 tasks, policy auto-files them, evidence links each to the run that produced it, a human approves/assigns/closes.
- **Acceptance:** the roadmap's own line — "the orchestration swarm proposed 6 tasks → approve / assign / close" — works end to end with receipts.

### A10. Defensive fix: builder canvas `position` crash

- **Source of truth today:** flagged verbatim in `ROADMAP_IMPACT_ITEMS_V1.md` — `workspace-builder.jsx`'s `occupied` loop dereferences `widget.position.w` and throws on widgets without `position`, crashing **production** renders of affected configs; reproduced on `origin/main`.
- **Sprint shape:** default-position guard. One sprint-morning item; listed because a known production crash outranks any feature.

---

## Track B — Growthub Pro (hosted-enhanced features)

Each item attaches at one of the three seams. None adds local authority.

### B1. Serverless swarm execution via hosted scheduler (the one-field unlock)

- **Seam:** API Registry row as scheduler target.
- **Source of truth today:** the serverless lane is **fully shipped for sandbox rows**: `runLocality: "serverless"` + `schedulerRegistryId` → an API Registry row, `POST sandbox-run` sends the `growthub-sandbox-run-v1` packet with method/baseUrl/endpoint/`authRef` resolved server-side (`lib/sandbox-serverless-flow.js`, `lib/workspace-schema.js:1003`, `docs/sandbox-environment-primitive.md`). Swarm rows are pinned `local` for exactly one reason, stated in the code: *"serverless locality would also require a schedulerRegistryId the swarm proposal never carries"* (`lib/workspace-swarm-proposal.js:388`).
- **Sprint shape:** OSS half — additive `schedulerRegistryId` on the swarm proposal payload, validated by the existing serverless rules; Pro half — a managed Growthub scheduler endpoint provisioned as an API Registry row through the auth bridge connection, so a governed swarm runs hosted: survives laptop close, runs on schedule, streams NDJSON back to the cockpit, persists evidence to the durable adapter (A1).
- **Why it's the flagship Pro item:** it converts the entire governed swarm surface from "while my machine is open" to "managed agent labor," using a field that is already in the row schema, a packet that is already specified, and an auth seam that is already in production.
- **Acceptance:** a swarm row with a Growthub scheduler `schedulerRegistryId` executes hosted with the identical receipt/record/projection chain; the local cockpit renders it indistinguishably from a local run.

### B2. Metering ledger: usage at swarm/workflow/capability granularity

- **Seam:** auth bridge account connection.
- **Source of truth today:** every run is already receipted and token-attributed at the task level (`sandbox:<objectId>:<slug>` records; per-task `tokens/tools/phaseId`; apply receipts in `helper:apply:receipts`). The attribution work is done — locally.
- **Sprint shape:** Pro aggregates the receipt stream (account-linked via `mcp_connections`) into a usage ledger keyed `{workspace, app (A4 registry), workflow row, swarm run, capability}`. Billing-grade by construction: the ledger is a projection of receipts, not a parallel counter, so the super-admin's invoice and the workspace's source records reconcile by definition. Budget enforcement composes with A5 (a policy row can deny proposals when a metered budget is exhausted — usage-based confinement, not seat-based).
- **Acceptance:** ledger totals equal the sum of persisted run-record telemetry for the period; a budget-exhausted swarm is blocked at the apply/eligibility gate with a derived reason, never mid-run by surprise.

### B3. Signed authority attestations for swarm workflows

- **Seam:** ed25519 authority envelopes (`growthub kit fork authority` — register, drift, heal, trusted issuers — already shipped for forked kits).
- **Sprint shape:** extend the envelope from kit identity to **workflow identity**: an attestation binds a graph hash (the serialized `agent-swarm-v1` graph) to an issuer. Pro verifies at apply: an `apply-policy` row (A5) can require a trusted-issuer attestation for designated object classes — e.g. production swarms only run reviewed, signed graphs. Drift detection is the fork-authority heal flow pointed at `orchestrationConfig`.
- **Why:** this is the enterprise approval chain expressed in the system's own primitives — the same propose/apply loop, with cryptographic review identity attached. Central teams sign golden workflows; customer repos (the documented three-parallel-repo upgrade pattern) verify before execution.
- **Acceptance:** an unsigned graph edit on an attestation-required row is blocked at apply with a derived reason; re-signing heals; the receipt records issuer identity.

### B4. Confinement profiles: role-scoped projections

- **Seam:** auth bridge identity + existing projection layer.
- **Source of truth today:** the separation already exists structurally — governed record vs. its projections (`fieldSettings.hidden` per object, lens cards, cockpit projection, thread-bounded views). What's missing is binding projections to **who is looking**.
- **Sprint shape:** Pro-managed confinement profiles: per-role (and per-agent) visibility policies over objects, fields, lenses, and cockpit surfaces — the super-admin operates the full record; the end-user or agent sees the scoped projection. Enforced at the projection seams (which are already pure functions taking the record — they gain an actor parameter), never by forking the record.
- **Why this order:** A4 (app registry) + B2 (metering) + B4 (confinement) is the complete super-admin triad the architecture has been converging on: see everything, meter everything, scope what everyone else sees.
- **Acceptance:** the same workspace serves super-admin and end-user views from one config; an agent's swarm-condition packet only ever lists tools/objects its profile permits (`availableTools` becomes confinement-aware).

### B5. Hosted intelligence gateway

- **Seam:** API Registry / `custom-openai-compatible` endpoint slot.
- **Source of truth today:** the `local-intelligence` adapter takes any `custom-openai-compatible` endpoint and reports truthful `usage` telemetry — proven live in this repo's own probes with a mock endpoint slotting in with zero contract change.
- **Sprint shape:** a Growthub-hosted, account-authenticated completion gateway as a drop-in `localEndpoint` target: model routing, rate limiting, and B2 metering server-side. The OSS contract is untouched — Pro is literally just a better endpoint.
- **Acceptance:** pointing `localEndpoint` at the gateway requires no workspace change beyond the existing governed row edit; telemetry flows through the same truthful path into the same cockpit.

### B6. Fleet upgrade packs (parallel customer-repo upgrades, productized)

- **Seam:** fork authority + the governed apply loop.
- **Source of truth today:** the upgrade pattern is proven operationally (the documented parallel upgrade of three distinct private repos preserving 100% of customer-specific layers) but is manual expert work.
- **Sprint shape:** an upgrade pack = a versioned set of proposals + expected config deltas + a conformance probe, signed under B3. Pro orchestrates: fork-authority drift check → governed apply of the pack's proposals per repo → probe verification → receipts roll up to a fleet view (A4). Each customer repo's apply is still its own reviewed (or A5-policied) action — the pack scales the pattern without centralizing authority over customer state.
- **Acceptance:** the 0.14.1-style capability port to N repos is a tracked, receipted, verifiable batch instead of N bespoke sessions.

### B7. Horizon: reward-series export as an optimization signal

- **Seam:** durable source records (A1) + account connection.
- **Source of truth today:** the runtime persists exactly the shaped-reward components a PARL-style optimization loop consumes — per-run `parallel / finish / outcome`, per-task telemetry, phase attribution — as inspectable records rather than gradients.
- **Sprint shape (research-tier, explicitly horizon):** opt-in export of reward series + graph deltas as a structured dataset, enabling offline analysis of which graph mutations improve outcomes — the bridge from "rewards as telemetry" toward orchestrator specialization, kept entirely outside the runtime so the no-training-in-the-loop truth stays true until it's deliberately changed.

---

## Sequencing logic (dependencies, not dates)

```
A10 (crash fix)                          — immediately, independent
A1  persistence  ──┬─► A3 health ──► A4 fleet ──► B2 metering ──► B4 confinement
A2  run-control    │                  ▲
A5  apply-policy ──┼─► A6 evidence ──┼─► A9 tasks
A7  canvas ledger ─┘                  │
A8  adapter kit ──────────────────────┘
B1  serverless swarms  — after A1 (durable evidence) + its OSS payload field
B3  attestations       — after A5 (policy rows are the enforcement point)
B5  gateway            — independent, any time
B6  upgrade packs      — after B3
B7  horizon            — after A1 + sustained run volume
```

The through-line is unchanged from the existing roadmap and worth restating: every item is "register a deriver," "add an additive proposal/payload field," or "attach at an existing seam." The day an item requires a new runtime, a new PATCH field, or a new persistence layer, it is mis-specified — redesign it until it doesn't.
