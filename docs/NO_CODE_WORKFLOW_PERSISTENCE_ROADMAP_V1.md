# No-Code Workflow Persistence & Scheduling Roadmap V1

A three-phase, compounding roadmap to give **non-technical users a seamless no-code
interface** for upgrading an existing workflow into a **persistent, scheduled, serverless
runtime** — without leaving the surfaces they already use.

No arbitrary timelines. Sequenced only by **leverage and dependency**: each phase produces a
substrate the next phase builds on, and the whole feature ships in a single, governed
implementation lane.

This roadmap does **not** invent a new architecture. It extends the **resolver registry +
API Registry record primitive** that already ships in
`growthub-custom-workspace-starter-v1`, and it lands additively on top of the serverless
delegation that is **already wired today**.

---

## What already exists (the lane this work lives in)

Grounded in the shipped starter kit at
`cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/`:

| Capability | Where it lives today | State |
| --- | --- | --- |
| Serverless run **delegation** | `app/api/workspace/sandbox-run/route.js` → `runServerlessScheduler()` posts the `growthub-sandbox-run-v1` envelope to an **API Registry row** referenced by `schedulerRegistryId`, resolves auth server-side, interprets a **200 / JSON / text** response into `stdout`/`exitCode`. | ✅ shipped (fire-on-invocation) |
| Serverless **cockpit journey** | `lib/sandbox-serverless-flow.js` → `deriveSandboxServerlessState()` renders `locality → adapter → scheduler → scheduler-auth → persistence → run`, mirroring the API Registry creation cockpit step shape. | ✅ shipped |
| Governed **server-file generator** (the resolver studio) | `lib/workspace-resolver-proposal.js` (build/validate/generate, `type: "resolver.create"`, `affectedField: "server-file"`) + `lib/server-resolver-write.js` (single confined, persistence-gated fs write) + `lib/adapters/integrations/resolver-loader.js` (dynamic loader). Secret-safe, path-confined, emits a receipt. | ✅ shipped |
| **API Registry** record primitive | `objectType: "api-registry"` rows with `connectorKind` (`http` \| `nango` \| `mcp` \| `chrome` \| `tool`), `authRef` (env-ref name only — secret never persisted), `baseUrl`/`endpoint`/`method`. | ✅ shipped |
| Durable **persistence adapters** | `lib/adapters/persistence/{postgres,qstash-kv,provider-managed}.js`, surfaced honestly with required env keys by `lib/env-status.js`. | ✅ shipped |
| Schema enforcement | `lib/workspace-schema.js`: `KNOWN_SANDBOX_RUN_LOCALITY = ["local","serverless"]`; serverless **requires** `schedulerRegistryId`. Comment already names the targets: *"a scheduler webhook (Supabase Edge, QStash, Vercel cron hitting your URL, etc.)."* | ✅ shipped |
| Governance boundary | `PATCH /api/workspace` allowlist = `dashboards`\|`widgetTypes`\|`canvas`\|`dataModel`; server files travel their **own** proposal/apply lane (never PATCH); live workflow state is **publish-owned**; every lane emits an **Agent Outcome receipt**. | ✅ shipped |

**The gap.** A serverless run today only fires **when something invokes it**. There is:

- no **cadence** (daily / weekly / monthly / recurring) on the row and no no-code picker for it;
- no **first-party provisioning** — the user must hand-author the scheduler endpoint and the
  API Registry row that points at it;
- no **schedule lifecycle** (create → confirm → track next-run → pause / cancel);
- no **drift reconciliation** — if the workspace is redeployed to a new Next.js app, flips to
  read-only, or the local runtime disconnects, nothing forces the schedule to be re-confirmed
  and re-authenticated before it is trusted live.

This roadmap closes exactly those four gaps, in three compounding phases, using the resolver
registry as the scaffolding method the user asked for.

---

## Design invariants (hold across all three phases)

1. **No third mutation path.** Cadence and schedule-binding fields are `dataModel` row fields
   → they travel `PATCH /api/workspace`. Generated provider endpoints are **server files** →
   they travel the resolver-style proposal/apply lane (`affectedField: "server-file"`), never
   PATCH. Going-live stays **publish-owned**.
2. **Secrets never enter the browser or config.** Providers authenticate through an `authRef`
   env-ref name only (the existing `envCandidates()` expansion: `TOKEN` / `TOKEN_API_KEY` /
   `TOKEN_TOKEN`). The generated endpoint reads its secret from server env at run time.
3. **Pure, deterministic derivation.** All new state (`deriveSchedulerProvisioningState`, drift
   state) is a pure function over governed artifacts — same contract as
   `deriveApiRegistryCreationState` / `deriveSandboxServerlessState`. The next action is
   *computed, never authored*.
4. **Confirm 200, then persist.** Provisioning is only "done" when the provider returns a
   verified success envelope (the same `exitCode === 0 && !error` rule the run route already
   uses). Status is stamped from evidence, not optimism.
5. **One implementation, two providers.** Supabase Edge Function and QStash Workflows Schedule
   are two **provider templates** behind one agnostic generator + one cockpit — adding a third
   provider later is a template drop-in, not a new surface.
6. **No-code first.** Every step the user sees is a status chip, a dropdown, or a single
   button. The complexity (endpoint scaffold, schedule registration, auth wiring) is handled
   **under the hood** by the generator and the provision route.

---

## Phase 1 — Foundation: the Scheduler Registry primitive + cadence schema

**Goal.** Make "on a schedule" a first-class, no-code property of an existing workflow row, and
extend the resolver-registry generator so it can scaffold a **scheduler provider** the same way
it scaffolds a source resolver. Nothing provisions yet — this phase produces the **substrate**.

**Why first.** Phases 2 and 3 are impossible without (a) a place to store the cadence and the
schedule binding, and (b) a generator that can emit a provider endpoint. This phase adds both,
additively, behind validation.

### Task items

1. **Cadence as a governed row field.** Extend the `sandbox-environment` row schema in
   `lib/workspace-schema.js` with an **additive, optional** `schedule` block:
   `{ cadence: "manual" | "daily" | "weekly" | "monthly" | "recurring", cron?: string, timezone?: string }`.
   Validate `cron` only when `cadence === "recurring"`; map the named cadences to canonical cron
   server-side so non-technical users never type cron.
2. **Scheduler connectorKind on the API Registry record.** Add `"scheduler"` to the API Registry
   `connectorKind` set (alongside `http`/`nango`/`mcp`/`chrome`/`tool`) plus an optional
   `schedulerProvider: "supabase-edge" | "qstash-schedule"` field, validated in
   `validateApiRegistryRow()`. The `schedulerRegistryId` FK already targets these rows — this
   just types them.
3. **The scheduler generator (resolver-registry pattern).** Add
   `lib/workspace-scheduler-proposal.js` mirroring `lib/workspace-resolver-proposal.js`:
   `type: "scheduler.create"`, `affectedField: "server-file"`, path-confined to a new
   `lib/adapters/integrations/schedulers/` directory, secret read from env via `envCandidates()`,
   `build` / `validate` / `generate` are **pure**. Reuse `lib/server-resolver-write.js`'s gating
   contract (or generalize it to `writeServerProposalFile`) so read-only runtimes get the same
   `WORKSPACE_PERSISTENCE_READ_ONLY` 409 + guidance.
4. **Cadence step in the existing cockpit.** Extend `deriveSandboxServerlessState()` with a
   `cadence` step between `scheduler-auth` and `persistence`, so the same drawer cockpit the user
   already sees now surfaces "Choose how often this runs."

### To-dos

- [ ] Add the `schedule` block + validation to `validateSandboxEnvironmentRow()` in
      `lib/workspace-schema.js`; default `cadence: "manual"` so existing rows stay valid.
- [ ] Add a pure `cadenceToCron(cadence, opts)` helper (server-side) + unit coverage in
      `scripts/unit-*.test.mjs`.
- [ ] Add `"scheduler"` to the connectorKind union and `schedulerProvider` to
      `validateApiRegistryRow()`; keep all existing connectorKinds passing unchanged.
- [ ] Create `lib/workspace-scheduler-proposal.js` (`buildSchedulerProposal`,
      `validateSchedulerProposal`, `generateSchedulerEndpointCode`, `SCHEDULER_DIR`).
- [ ] Generalize the confined write in `lib/server-resolver-write.js` (or add a sibling) to
      accept the `schedulers/` dir; keep the path-traversal + size + persistence-mode guards.
- [ ] Add a `cadence` step to `deriveSandboxServerlessState()`; render a no-code cadence dropdown
      in the sandbox drawer (`app/data-model/components/SandboxOrchestrationEditorPanel.jsx`).
- [ ] Unit-test the new derivation step and the proposal builder/validator (pure, no I/O).

**Phase 1 exit criteria:** a row can carry a cadence; the cockpit shows it; the generator can
produce a (still un-applied) scheduler endpoint proposal; everything validates and every existing
fixture still passes.

---

## Phase 2 — Provisioning + Confirm 200: first-party Supabase Edge & QStash schedules

**Goal.** Do the setup **for** the user. With one button, scaffold the externalized provider
endpoint, register the API Registry scheduler row, create the real schedule with the provider,
**confirm a 200 success**, and stamp the row from evidence. Two first-party providers; one
agnostic flow.

**Why second.** It consumes Phase 1's cadence schema, scheduler connectorKind, and generator. It
reuses Phase 1's confined write for the endpoint file and the **already-shipped** serverless
delegation for the actual run.

### Task items

1. **Two first-party provider templates** emitted by the Phase-1 generator:
   - **`supabase-edge`** — generate a Supabase Edge Function handler that accepts the
     `growthub-sandbox-run-v1` envelope and returns `{ ok, exitCode, stdout }`; the externalized
     file lands under `schedulers/` and the deploy/CLI hint travels with the proposal.
   - **`qstash-schedule`** — generate the QStash *schedule registration* call (cron from the
     cadence) plus the destination handler, reading `QSTASH_TOKEN` via `envCandidates()`. This is
     the workflow-schedule provider, distinct from the existing `qstash-kv` **persistence**
     adapter (they can share env but are different concerns).
2. **The provision + confirm route.** Add `POST /api/workspace/scheduler/provision`: given a
   sandbox row + chosen provider, it (a) writes the endpoint proposal through the gated lane,
   (b) registers/updates the `connectorKind: "scheduler"` API Registry row, (c) calls the
   provider's schedule-create API, (d) **verifies 200**, (e) stamps `status: "connected"` +
   `lastResponse` on the registry row — exactly the evidence rule in `sandbox-run/route.js`.
3. **A provisioning cockpit derivation** — `deriveSchedulerProvisioningState()`, a pure function
   mirroring `deriveApiRegistryCreationState()`: `pick provider → scaffold endpoint →
   register scheduler row → configure auth (authRef) → create schedule → confirm 200 → bind to
   workflow`. The sandbox drawer renders it verbatim, so it's the same mental model and the same
   renderer — no new UI framework.
4. **Bind once, run on cadence.** On confirm, set the row's `schedulerRegistryId` to the new
   scheduler row and `runLocality: "serverless"` — the existing `runServerlessScheduler()` now
   carries the cadence in the envelope and the provider fires it on schedule.

### To-dos

- [ ] Implement `generateSchedulerEndpointCode()` provider branches for `supabase-edge` and
      `qstash-schedule` in `lib/workspace-scheduler-proposal.js`.
- [ ] Replace/retire the generic `templates/supabase-setup-plan.md` Postgres-only note with a
      provider-accurate Edge Function setup note **only inside the user's fork** (keep the open
      starter provider-agnostic per AGENTS.md — no Supabase SDK in the base kit).
- [ ] Build `POST /api/workspace/scheduler/provision` (gated by persistence mode; app-scope
      enforced like `sandbox-run`; emits an Agent Outcome receipt on every outcome).
- [ ] Add `deriveSchedulerProvisioningState()` + unit tests; wire it into the sandbox drawer
      cockpit next to `deriveSandboxServerlessState()`.
- [ ] Confirm-200 gate: provisioning is only `complete` when the provider response satisfies
      `exitCode === 0 && !error`; otherwise the step stays `pending` with a concrete hint.
- [ ] Round-trip test from an **exported** workspace (`next build` + live HTTP probe), never
      against the open-source starter template fixtures.

**Phase 2 exit criteria:** a non-technical user picks a provider, clicks once, and the workflow
is scaffolded, scheduled, authenticated, and confirmed `connected` with a 200 — with zero
hand-authored code and zero secrets in config or browser.

---

## Phase 3 — Lifecycle, tracking & drift reconciliation (governance + security closure)

**Goal.** Make the schedule **trackable, pausable, and self-defending**: surface next-run /
last-run, allow pause/cancel/resume, and — critically — force a **re-confirm + re-authenticate**
whenever the runtime the user deployed into disconnects or deviates from the governed config.

**Why third.** It depends on a schedule actually existing (Phases 1–2). It is also where the
user's security requirement lands: a schedule that the workspace can no longer prove is
correctly wired must not be trusted as live.

### Task items

1. **Schedule tracking surface.** Surface `nextRunAt` / `lastRunAt` / `lastStatus` / `paused` in
   the workflow canvas node trace and the sandbox drawer, derived from the source-record run
   history that `sandbox-run` already persists (`sandbox:<objectId>:<slug(name)>`). No new store.
2. **Pause / cancel / resume.** Add lifecycle actions to the provision route family
   (`POST /api/workspace/scheduler/{pause,resume,cancel}`) that call the provider's schedule API
   and re-stamp status from the response — same confirm-from-evidence rule.
3. **Drift detection (the security-critical piece).** A pure `deriveSchedulerDriftState()` flags
   a schedule as `needs-reconfirm` when **any** of:
   - persistence mode is now `read-only` (the workspace can't durably own the schedule);
   - the workspace was redeployed (new app surface / changed base URL vs. the registered
     endpoint — detectable via the App Registry / `x-growthub-app-scope`);
   - the local runtime that registered the schedule is disconnected (`authRef` no longer
     resolves in `env-status`).
4. **Mandatory re-confirm before live.** While `needs-reconfirm`, the workflow is **not** trusted
   live: the cockpit shows a single "Re-confirm schedule" action that re-runs the Phase-2 provision
   + confirm-200 path and re-checks auth. This satisfies the requirement that *any* disconnect or
   deviation in the next Next.js app or local environment forces re-configuration and a fresh 200
   before the scheduled runtime is trusted again.
5. **Receipts close the loop.** Every schedule transition (provisioned, paused, drifted,
   re-confirmed, cancelled) emits the canonical Agent Outcome receipt with `nextActions[]`, so a
   new session or agent reads the schedule's true state before acting — consistent with the
   shipped Agent Outcome Loop.

### To-dos

- [ ] Add `deriveSchedulerDriftState()` (pure) reading `env-status` resolution, persistence mode,
      and App Registry surface metadata; unit-test the read-only / redeploy / disconnected cases.
- [ ] Add a `reconfirm` step to the provisioning cockpit that is `blocked` → `active` purely from
      drift state; render the single "Re-confirm schedule" action.
- [ ] Implement `{pause,resume,cancel}` provision-route siblings with confirm-from-evidence
      stamping and app-scope enforcement.
- [ ] Surface `nextRunAt` / `lastRunAt` / `paused` in the canvas node trace
      (`app/data-model/components/OrchestrationRunTracePanel.jsx`) and the sandbox drawer.
- [ ] Emit Agent Outcome receipts for every schedule lifecycle transition (lane
      `execution-proof` for runs, `governed-proposal` for provision/reconfirm).
- [ ] Drift-to-reconfirm e2e from an exported workspace: deploy → flip read-only / change base URL
      → assert `needs-reconfirm` → re-confirm → assert fresh 200 + `connected`.

**Phase 3 exit criteria:** every scheduled workflow is observable, controllable, and **cannot be
silently trusted after a runtime change** — it must earn `connected` again with a verified 200,
preserving the same governance across local and serverless runtimes.

---

## Why this is one feature, not three

The three phases share **one data model** (the `sandbox-environment` row + its
`schedulerRegistryId` FK to an API Registry record), **one generator** (the resolver-registry
server-file lane, extended to schedulers), **one cockpit derivation contract** (pure
`derive*State()` → typed steps → existing renderer), and **one delegation path** (the shipped
`runServerlessScheduler()`). Each phase is independently shippable and testable, but together they
deliver a single seamless no-code journey: **build a workflow → choose how often it runs → click
once → it's scheduled, durable, and self-defending across runtimes.**

## Mental-model / customer-journey coverage

| User mental-model moment | Surfaced by | Phase |
| --- | --- | --- |
| "I want this to run by itself" | Cadence dropdown in the sandbox drawer cockpit | 1 |
| "How often?" (daily/weekly/monthly/recurring) | `schedule.cadence` → server-side cron mapping | 1 |
| "Set it up for me" | One-click `scheduler/provision` (Supabase Edge or QStash) | 2 |
| "Is it actually working?" | Confirm-200 stamp → `connected` status chip | 2 |
| "When does it run next? when did it last run?" | Tracking surface from run-record history | 3 |
| "Pause / stop it" | `{pause,resume,cancel}` actions | 3 |
| "I moved / redeployed / went offline — is it still safe?" | Drift → `needs-reconfirm` → mandatory re-confirm + fresh 200 | 3 |

Every gated state has a computed next action and a receipt, so both the human and an agent always
know the single next move.

---

## Grounding references

- `apps/workspace/app/api/workspace/sandbox-run/route.js` — serverless delegation + confirm-200 + receipts (extend, don't replace).
- `apps/workspace/lib/sandbox-serverless-flow.js` — cockpit step derivation to extend with cadence.
- `apps/workspace/lib/workspace-resolver-proposal.js` + `lib/server-resolver-write.js` + `lib/adapters/integrations/resolver-loader.js` — the resolver-registry scaffolding pattern to mirror for schedulers.
- `apps/workspace/lib/api-registry-creation-flow.js` — the cockpit derivation contract to mirror for provisioning.
- `apps/workspace/lib/workspace-schema.js` — `KNOWN_SANDBOX_RUN_LOCALITY`, `schedulerRegistryId`, connectorKind / api-registry validation to extend.
- `apps/workspace/lib/adapters/persistence/{qstash-kv,postgres,provider-managed}.js` + `lib/env-status.js` — durable persistence + honest env readiness signal.
- `AGENTS.md` — canonical workspace mutation boundary (PATCH allowlist, publish-owned live state, server-file lane, Agent Outcome Loop) every phase must honor.
- `docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md` — local↔serverless authority boundary and the rule that the browser never holds a token or executes a hosted workflow.
