# Governed Capability Binding Loop V1

**Status:** investigative proof + phased extension plan, now **shipped through
Phase 5 with the V1.1 deltas below**. Originally verified against `origin/main`
tip `f1e6a8c` ("feat(workspace-kit): governed serverless scheduler") — the release
whose live smoke is frozen in
[`SERVERLESS_SCHEDULER_COMMAND_GUIDE_V1.md`](./SERVERLESS_SCHEDULER_COMMAND_GUIDE_V1.md).
Every "already exists" claim below cites a real path in the starter workspace
(`cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/`,
abbreviated `apps/workspace/` throughout, matching the anchor convention in
[`GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1.md`](./GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1.md)).

## V1.1 — shipped deltas (supersede the plan text where they conflict)

The webhook / API-request input methods shipped with these architecture
decisions that refine Phases 3–4 as written:

1. **Native workspace capabilities, not marketplace installs.** There is no
   external account behind the inbound methods, so nothing is "installed from
   Workspace Add-ons". The resolvable signing/invoke env ref
   (`GROWTHUB_WEBHOOK_SIGNING_SECRET` / `GROWTHUB_API_INVOKE_TOKEN`) **is** the
   capability: the bind's env gate enforces it first and names the missing ref;
   the API Registry row is provisioned automatically inside the same governed
   bind write as verification **lineage** (proof = the env probe). The canvas
   offers both methods unconditionally; `env-status` always includes the
   native refs (like persistence-adapter readiness). Any marketplace plugin
   declaring the same lane grammar still joins via
   `resolveInboundMethodProducts` — lane-derived, provider-scoped.
2. **Binds never mutate drafts; freshness is content equality.** The proof
   gate (`rowHasSuccessfulServerlessBindingProof`) compares graph CONTENT via
   `orchestrationGraphContentEquals` — writer formatting, canvas
   `sandboxRecordRef` metadata, and the bind-owned trigger keys
   (`trigger`/`triggerKind`/`schedule`/`enabled`, tool-result
   `writeLastResponse`) are excluded; every user-authored change still breaks
   freshness. Publish promotion re-syncs the trigger node from the ROW's
   binding fields so promoting a draft cannot sever a live binding.
3. **Door guards.** After auth + binding validation: duplicate deliveries are
   ACKed without re-execution (signed-bytes / `x-growthub-idempotency-key`
   identity), and genuinely new invocations are rate-limited per binding
   (sliding window, default 60/min, `GROWTHUB_INBOUND_RATE_LIMIT_PER_MINUTE`),
   returning 429 + `retry-after` with a blocked receipt. The scheduler
   callback lane is not rated — the provider owns its pacing.
4. **Proof of the loop:** `scripts/e2e-inbound-journey-playwright.mjs` +
   `scripts/e2e-inbound-journey-seed.mjs` drive the full no-code journey in a
   real browser against a temp workspace export (readiness deltas → bind →
   seeded test values → verified 200 without refresh → proof-gated publish →
   real signed/bearer domain hit → tamper 401), and
   `scripts/unit-workspace-inbound-invocation.test.mjs` locks the contracts.

## The claim being proven

An API Registry row is capability truth, not a product. A product/plugin is
**done** only when it closes the same loop `/schedule` closes:

```
one read-only command → pure cockpit deriver → canvas-node binding owned by the
workflow row → existing governed routes → workspace:agent-outcomes receipt →
re-derive
```

The human path (see state → click nextAction → receipt → state advances) and the
agent path (read condition packet → select nextAction → governed dispatch →
outcomeStatus reward → re-derive) are the **same engine** — the cockpit
view-model is the agent condition packet, and `outcomeStatus` (`published` vs
`blocked`) is the reward signal. This document proves the loop is fully shipped
for the scheduler, classifies exactly what is and is not general yet, and lays
the additive path that extends the identical mirrored pattern to
**API-request-invoked** and **webhook-invoked** governed workflows plus **one
non-scheduler product binding** — with zero new schema, zero new PATCH field,
and zero parallel runtime.

---

## 1. Current State — the closed loop, layer by layer (all shipped)

### 1.1 Command layer (read-only door)

- `HELPER_COMMANDS` registry: `apps/workspace/app/data-model/components/helper-commands.js`
  (anchored at `GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1.md` §2.2). `/schedule` is
  `mutates: false`, `view: "schedule"`. Registry governance is enforced in the
  same file (~lines 106–127): mutating commands must declare `intent` or
  `promptTemplate` (seed a governed proposal); read-only commands may declare
  `view`; **no command PATCHes config or calls `sandbox-run` directly**.

### 1.2 Cockpit lens (pure deriver = agent condition packet)

- `deriveScheduleCockpit({ workspaceConfig, configuredEnvRefs, receipts })` —
  `apps/workspace/lib/schedule-cockpit-console.js:140`. Pure: no React, no
  fetch, no writes. Emits counts (`total/scheduled/paused/ready/blocked/drifted`),
  filters, a single `attention` (drifted → blocked → ready priority, lines
  261–266), per-card `nextAction` (lines 113–129), and
  `governance.blockedAttempts` folded back from receipts (line 269).
- Capability detection is **already provider-agnostic**: any `api-registry` row
  with `executionLane === "serverless-scheduler"` + `syncStatus === "verified"`
  is a scheduler product (`detectSchedulerProducts`, lines 47–71); the Upstash
  slug is kept only to label the setup shortcut (comment at lines 41–44).
- Readiness reuses the existing causation driver — `scanServerlessReadiness`
  (`apps/workspace/lib/serverless-readiness.js:222`), phase `pre-bind|bound`,
  nine canonical delta tags (lines 38–48), `blockingNodes[]` with per-node
  `helperAction` field hints (lines 532–542). **No second compatibility check.**
- The dependency correlation the canvas needs: `resolveDependencyRegistryId`
  (`schedule-cockpit-console.js:74`) reads the graph's `api-registry-call`
  node's `registryId`; the runner resolves the same id at execution time
  (`findRegistryRecord`, `apps/workspace/lib/orchestration-graph-runner.js:69–84`).

### 1.3 Capability layer (API Registry data object, governed)

- Row shape: `api-registry` preset columns
  (`apps/workspace/lib/workspace-data-model.js:828–850`) + marketplace columns
  appended by `apiRegistryColumns` (`apps/workspace/lib/workspace-add-ons.js:224–262`):
  `integrationId, authRef, executionLane, capabilities, requiredEnv, syncStatus,
  syncProof, syncCheckedAt, productId, providerId, region, plan, …`. Env-ref
  slugs only, never secret values (`env-status.js:32–63`;
  `docs/sandbox-environment-primitive.md` credential surface).
- Catalog: `MARKETPLACE_PROVIDERS` / `UPSTASH_PRODUCTS`
  (`workspace-add-ons.js:169–222` / `12–167`). A product entry already declares
  `productId, integrationId, authRef, requiredEnv, capabilities, executionLane,
  probe, resourceDiscovery, regionOptions`.
- **Installed vs cataloged** is proof-based: installed = registry row with
  matching `integrationId`, `syncStatus === "verified"`, `syncProof` +
  `syncCheckedAt` present (`findInstalledWorkspaceAddOns`,
  `workspace-add-ons.js:862–878`). Doctrine:
  [`OFFICIAL_MARKETPLACE_PLUGINS_V1.md`](./OFFICIAL_MARKETPLACE_PLUGINS_V1.md)
  — a plugin is workspace-native capability, never a second runtime.

### 1.4 Node surface (the binding lives in the graph, on the row)

- Node vocabulary: `KNOWN_NODE_TYPES`
  (`apps/workspace/lib/orchestration-graph.js:12–27`) — `input`,
  `api-registry-call`, `data-trigger`, `tool-result`, `custom-webhook`,
  `ai-agent`/`thinAdapter` (swarm), etc.
- The bind is **one atomic write** owned by the workflow row:
  `withWorkflowServerlessBind` (`workspace-add-ons.js:428–492`) sets
  `runLocality="serverless"` + the scheduler proof columns
  (`scheduleId, schedulerRegistryId, schedulerProviderId, schedulerProductId,
  schedulerCron, schedulerRegion, schedulerDestination, schedulerCallbackUrl,
  schedulerInstalledAt`) and calls `syncTriggerNodeForSchedule`
  (`workspace-add-ons.js:314–375`), which writes the trigger node:
  `inputMode: "serverless-schedule"`, `triggerKind: "serverless-scheduler"`,
  `schedule: { schedulerRegistryId, scheduleId, cron, providerId, productId,
  destinationUrl, callbackUrl, triggerInput }`, `enabled: true` — and flips
  `tool-result.writeLastResponse` on. Every touched key is inside `dataModel`.
  Provider row is capability; **workflow row is ownership**
  (`SERVERLESS_SCHEDULER_COMMAND_GUIDE_V1.md` §2).
- Deterministic identity: `deriveScheduleId({ providerId, workspaceId,
  objectId, rowId, version })` (used by `runScheduleInstall`,
  `apps/workspace/lib/scheduler-orchestration.js:149`).
- Canvas mirror: `WorkflowSurface.jsx` derives `inputServerlessSelected` from
  the input node's `inputMode` (~line 1200), lists scheduler products via
  `resolveSchedulerRegistryRows` (registry rows with
  `executionLane === "serverless-scheduler"`, lines 140–152), and paints node
  readiness from `scanServerlessReadiness` flags (line ~1650).

### 1.5 Action + governance (existing routes only)

- Install/pause/resume/readiness/uninstall:
  `POST|GET|DELETE /api/workspace/add-ons/[providerId]/schedule`
  (`app/api/workspace/add-ons/[providerId]/schedule/route.js`), orchestrated by
  `runScheduleInstall` (`scheduler-orchestration.js:72–219`): verify product →
  validate env refs → readiness gate → deterministic id → remote schedule →
  **one** `withWorkflowServerlessBind` write → rollback on failure → receipt.
- The frozen mutation boundary holds everywhere: PATCH allowlist
  `dashboards|widgetTypes|canvas|dataModel`
  (`apps/workspace/lib/workspace-patch-policy.js:35–40`), live workflow fields
  publish-owned (`:43–48`), `POST /api/workspace/workflow/publish` the only
  draft → live transition (`AGENTS.md` §canonical mutation boundary), four
  named lanes + one hash-chained receipt stream
  (`GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1.md` §0).

### 1.6 External invocation (the part everyone assumes is missing — it is not)

The workspace **already executes governed workflows from external, signed HTTP**:

- Destination: `POST /api/workspace/workflows/[providerId]`
  (`app/api/workspace/workflows/[providerId]/route.js`) — **already
  provider-parameterized**. It (1) verifies the QStash JWT (HS256 only,
  `iss="Upstash"`, `sub === this destination URL` anti-replay, `body` claim =
  SHA-256 of the raw body, `exp/nbf` ±10s; `verifyQstashSignature`,
  `apps/workspace/lib/workspace-add-on-scheduler.js:174–234`); (2) resolves the
  sandbox row and runs **triple binding validation** — payload `scheduleId` ==
  row `scheduleId`, `runLocality === "serverless"`, and the **live graph's
  trigger node agrees** (`triggerKind`, `schedule.scheduleId`,
  `schedulerRegistryId`); (3) executes the published graph via the existing
  runner with a 60s budget; (4) appends receipt `kind="workspace-scheduled-run"`,
  `lane="server-authoritative"`.
- Signed callbacks write last-run proof onto the owning row:
  `add-ons/[providerId]/callback` + `/failure`
  (`apps/workspace/lib/workspace-add-on-callback.js:43–61` →
  `runSchedulerCallback`).
- Payload contract: `kind: "growthub-scheduled-run-v1"` carrying
  `{ scheduleId, workspaceId, objectId, rowId, version, triggerInput }`
  (`SERVERLESS_SCHEDULER_COMMAND_GUIDE_V1.md`, validated live payload).
- Run-input contract already exists per workflow:
  `growthub-workflow-run-inputs-v1` envelope with `source:
  "manual" | "serverless-scheduler"`, schema discovered from the graph
  (`discoverRunInputSchema`), hard limits (64 fields / 8 KB field / 64 KB
  total), and secret fields accepted **only** as `secretRef`
  (`apps/workspace/lib/orchestration-run-inputs.js`).

### 1.7 Receipt → re-derive (the reward edge)

Every lifecycle step writes the same canonical receipt into
`workspace:agent-outcomes` (`apps/workspace/lib/workspace-outcome-receipts.js:58–139`;
kinds observed live: `workspace-add-on-sync`, `workspace-add-on-schedule`,
`workspace-add-on-schedule-run`, `workspace-scheduled-run`,
`workspace-scheduled-run-callback`). The next `/schedule` recomputes the
cockpit from config + receipts (`generatedFromReceipts`,
`governance.blockedAttempts`). Loop closed; proven end-to-end in the PR #258
live smoke (external QStash message id, `lastScheduledRunStatus=200`, six
receipts).

---

## 2. Gap analysis (four categories, no blending)

| # | Finding | Category | Evidence |
| --- | --- | --- | --- |
| G1 | Closed loop for scheduler products (command → deriver → bind → routes → receipts → re-derive) | **Already Exists** | §1 anchors; live smoke in `SERVERLESS_SCHEDULER_COMMAND_GUIDE_V1.md` |
| G2 | Provider-agnostic capability detection (`executionLane` + `verified`) | **Already Exists** | `schedule-cockpit-console.js:47–71` |
| G3 | Signed external HTTP → published-graph execution, provider-parameterized route | **Already Exists** | `workflows/[providerId]/route.js`; §1.6 |
| G4 | Input-method vocabulary on the trigger node (`inputMode`, `triggerKind`) | **Partially Exists** | only `"manual"` and `"serverless-schedule"` values shipped (`orchestration-graph.js:176–187`, `workspace-add-ons.js:354–360`) |
| G5 | `custom-webhook` node type | **Partially Exists** | declared in `KNOWN_NODE_TYPES` + `SUPPORTED_PROVIDERS_V1` (`orchestration-graph.js:7,19`); **no executor branch** in `orchestration-graph-runner.js` (verified by dispatch scan) |
| G6 | Inbound signature verification as a pluggable seam | **Partially Exists** | route is `[providerId]`-dynamic but verification is hardwired to `verifyQstashSignature` |
| G7 | Product binding-surface declaration (which node kind a product binds to; which cockpit fronts it) | **Missing** | `UPSTASH_PRODUCTS` entries carry no `nodeSurface`/`inputMethods`/cockpit correlation (`workspace-add-ons.js:12–167`) |
| G8 | Non-scheduler product closing the loop (cockpit + binding + receipts) | **Missing** | only `/schedule` cockpit exists; Upstash Redis/Search/Vector rows are cataloged capability without a lens or bound node surface |
| G9 | Webhook input method (generic signer, non-QStash) invoking a governed workflow | **Missing** | no adapter, no `inputMode` value; searched routes + `workspace-add-on-scheduler.js` |
| G10 | Authenticated API-request input method (scheme + input values on the request → run-inputs envelope) | **Missing** | no bearer/HMAC inbound scheme; `sandbox-run` is operator-gated internal (`workspace-operator-auth.js:17–30`); no generic invoke surface |
| G11 | Workflow → workflow / parallel-workflow dispatch from a trigger | **Missing** | swarm parallelism is intra-graph only (`orchestration-agent-swarm.js`); no inter-workflow invocation in the runner |
| G12 | "Primary input method" as an explicit saved-and-published declaration | **Partially Exists** | it is implicit and already publish-owned: the live graph's trigger node **is** the declaration (publish gates at `workflow/publish/route.js:79–88,326–378`); nothing names it or validates per-method |

**Proposed** (not yet existing, defined by this document): the Governed
Capability Binding contract of §3 and the phases of §4.

---

## 3. Strategic Direction — the binding contract is a projection, not a new object

The pattern law (`GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1.md` §"product-taste
claim") is that a capability may exist **only as a projection of state already
in the contract**. Everything the generalization needs is already a shipped
primitive; the extension is correlation, not construction:

**A Governed Capability Binding is complete when four already-existing
declarations correlate:**

1. **Capability** — a verified API Registry row (`integrationId`,
   `executionLane`, `capabilities`, `syncStatus="verified"`, env-refs only).
2. **Node surface** — the product's catalog entry names which canvas node kind
   carries the binding: `trigger` (schedulers, webhooks, api-request — mirrors
   `syncTriggerNodeForSchedule` exactly) or `api-registry-call` (send / query /
   index / inference products — mirrors `resolveDependencyRegistryId` +
   `findRegistryRecord` exactly). No new node runtime.
3. **Cockpit lens** — one pure deriver in the `deriveScheduleCockpit` shape
   (counts + attention + per-card `nextAction`), fronted by one
   `mutates:false` command, entering through the four frozen surfaces
   (pill, command, sidecar `activeView`, cockpit component).
4. **Action + reward** — every `nextAction` hands off to an existing governed
   route; every outcome is a `workspace:agent-outcomes` receipt; the next
   derivation folds receipts back. Same engine for the human habit loop and the
   agent RL loop.

**The input-method generalization rides the same spine.** The serverless
upgrade path validated the whole chain — signed external delivery, triple
binding validation, published-graph execution, receipt, callback proof. The
QStash cron is merely the **first verifier** on an already-generic door:

- `inputMode` is an open string on the input node; `"serverless-schedule"` is
  its first non-manual value. `"webhook"` and `"api-request"` are additive
  values written by the **same bind writer**, owned by the **same row columns
  pattern**, validated by the **same readiness scan phases**, published by the
  **same publish gate**. The published trigger node **is** the "primary input
  method saved and published" (G12) — no new field needed, only per-method
  validation.
- The destination route is already `[providerId]`-parameterized. Generalizing
  means extracting verification behind a per-provider adapter (the
  `resolver.create` precedent applied to inbound trust): QStash JWT is adapter
  one; a generic HMAC shared-secret signer (env-ref via the registry row's
  `authRef`) is adapter two; an authenticated API-request scheme is adapter
  three. **No new route.** The invariant "no new API route" survives because
  the door already exists and is already dynamic.
- Request inputs map onto the existing `growthub-workflow-run-inputs-v1`
  envelope (additive `source` values), inheriting its limits and its
  secretRef-only rule — the "appropriate scheme and input values as part of
  the authenticated API request" is exactly this envelope arriving through the
  verified door.

**The compounding move (highest-order synthesis, zero new runtime):** once the
`api-request` input method exists, **workflow → workflow and parallel workflow
dispatch come for free** — a workflow's existing `api-registry-call` node
points at an API Registry row representing a *sibling workflow's inbound
binding* (its destination URL + scheme), and the shipped graph runner already
executes that node. Downstream and parallel invocation become graph edges over
governed rows, not a new orchestrator. Swarm fan-out inside one graph
(`agent-swarm-v1`) and binding fan-out across graphs compose without touching
the executor.

Why this aligns with the runtime: it preserves the two-call mutation boundary,
the four lanes, the one receipt stream, publish ownership of live graphs, the
secretRef-only credential surface, and the cockpit pattern's four surfaces. It
widens **values**, never **schemas**.

---

## 4. Phased Implementation (architectural dependency order — no timelines)

### Phase 0 — Binding contract formalization (pure metadata + tests; no runtime change)

Declare the correlation that already implicitly exists. Additive catalog fields
on product entries in `workspace-add-ons.js`: `nodeSurface`
(`"trigger" | "api-registry-call"`), `inputMethods`
(e.g. `["serverless-schedule"]`), `cockpitCommand` (e.g. `"/schedule"`). Stamp
the QStash product with its now-explicit declaration. A tiny pure helper
`describeCapabilityBinding(productEntry)` centralizes the read. Unit tests
mirror `scripts/unit-workspace-add-ons-scheduler.test.mjs`.

*Value shipped:* the catalog states, machine-readably, what "done" means per
product; cockpits and readiness gain one shared truth to correlate against.

### Phase 1 — Non-scheduler product proof (the loop closes for something other than QStash)

Pick the already-cataloged **Upstash Vector** (or Redis) product —
`nodeSurface: "api-registry-call"`. Ship its lens by cloning the cockpit shape,
not the scheduler's semantics:

- pure deriver `apps/workspace/lib/index-cockpit-console.js` →
  `deriveIndexCockpit({ workspaceConfig, configuredEnvRefs, receipts })`: cards
  = workflows whose live graph's `api-registry-call` resolves to the product row
  (`resolveDependencyRegistryId` reuse); readiness = the **existing**
  `scanServerlessReadiness` downstream-node checks (registry env, authRef,
  secret resolution — delta tags `API_REGISTRY_ENV`, `MISSING_SERVER_SECRET`);
  states `bound | ready | blocked`; `nextAction` → existing add-on
  sync/product routes and the canvas.
- four surfaces only: one `HELPER_COMMANDS` row (`/index`, `mutates:false`,
  `view:"index"`), one sidecar `activeView`, one rail pill, one cockpit
  component mirroring `ScheduleCockpit.jsx`.
- receipts: existing kinds (`workspace-add-on-sync`, run receipts) — the
  deriver folds them exactly as `/schedule` does.

*Value shipped:* the binding contract is proven product-agnostic across a
different node surface — layer-2 of the generalization is empirical, not
asserted.

### Phase 2 — Inbound verification adapter seam (runtime extension, no new route)

Extract the QStash-specific verification in
`workflows/[providerId]/route.js` behind a per-provider verifier lookup living
in `workspace-add-on-scheduler.js` (its current home), keyed by the provider
row resolved from `[providerId]` + the row's `authRef`/scheme. QStash becomes
verifier #1 with byte-identical behavior (regression-locked by existing tests).
Add the additive payload sibling `growthub-invoked-run-v1` and additive
`source` values on the run-inputs envelope. Triple binding validation and the
receipt write stay shared and untouched.

*Value shipped:* the door is formally generic; every later input method is an
adapter registration, not a route.

### Phase 3 — Webhook input method (first non-cron trigger)

- Catalog: a provider/product entry with `executionLane: "inbound-webhook"`,
  `authRef` → HMAC shared-secret env-ref, `nodeSurface: "trigger"`,
  `inputMethods: ["webhook"]`.
- Bind: parameterize the existing writers (`withWorkflowServerlessBind` /
  `syncTriggerNodeForSchedule` gain a method argument or a thin sibling in the
  same file) to write `inputMode: "webhook"`, `triggerKind: "inbound-webhook"`,
  deterministic binding id via the `deriveScheduleId` derivation, and the same
  proof columns family on the owning row. Lifecycle through the existing
  `add-ons/[providerId]/schedule` route (it already is the per-provider
  binding-lifecycle surface: install/pause/resume/readiness/uninstall).
- Verify: HMAC verifier adapter (Phase 2 seam) — signature over raw body,
  timestamp tolerance, destination binding — the QStash checklist minus the
  JWT envelope.
- Readiness/publish: `scanServerlessReadiness` phase `bound` validates
  row/node/method agreement; the publish gate already re-verifies the trigger
  node — the published graph **is** the primary-method declaration (closes G12).
- The dormant `custom-webhook` node type stays reserved for *outbound* webhook
  calls; inbound binding lives on the trigger node exactly like the scheduler
  (one input boundary, one grammar).

*Value shipped:* any external system with a shared secret can invoke a
published governed workflow, with the same proof trail as QStash.

### Phase 4 — Authenticated API-request input method + compounding dispatch

- `inputMode: "api-request"`: verifier adapter for a workspace-issued scheme
  (env-ref-backed token/HMAC on the registry row), request body = the
  `growthub-workflow-run-inputs-v1` values (validated against the workflow's
  discovered schema, existing limits, secretRef-only).
- Compounding: an `api-registry-call` node targeting a sibling binding's
  registry row gives **workflow → workflow** and, with existing multi-node
  fan-out inside a graph, **parallel workflow dispatch** — zero executor
  changes; receipts chain per run.
- Cockpit: `/triggers` (`mutates:false`) — a pure deriver over **all**
  input-method bindings across workflows (scheduler, webhook, api-request),
  counts + attention + per-card `nextAction`; the generalized fleet lens and
  the richest agent condition packet in the workspace.

*Value shipped:* the full ask — API-request-triggered, webhook-triggered,
downstream and parallel governed workflows — all as values over shipped
primitives.

### Phase 5 — Validation integration (locks the standard)

Unit tests per phase mirroring the shipped suites
(`scripts/unit-workspace-add-ons-scheduler.test.mjs`,
`unit-schedule-cockpit.test.mjs`, `unit-serverless-readiness.test.mjs`):
catalog binding declarations, each cockpit deriver (pure, deterministic),
verifier adapters (negative cases: bad signature, stale timestamp, wrong
destination, rebound scheduleId), publish-gate per-method checks, receipt
assertions per lifecycle step. A live smoke per input method in the
`SERVERLESS_SCHEDULER_COMMAND_GUIDE_V1.md` format is the release gate.

---

## 5. Exact File Edits

| File (under `apps/workspace/` unless noted) | Phase | Change | Layer / invariant preserved |
| --- | --- | --- | --- |
| `lib/workspace-add-ons.js` | 0,3 | additive catalog fields (`nodeSurface`, `inputMethods`, `cockpitCommand`); `describeCapabilityBinding`; method-parameterized bind writers | catalog + bind layer; only `dataModel` keys touched |
| `scripts/unit-workspace-add-ons-scheduler.test.mjs` (repo root) | 0,3 | binding-declaration + method-bind cases | test layer |
| `lib/index-cockpit-console.js` **(new)** | 1 | pure deriver, `deriveScheduleCockpit` shape | projection layer; no fetch/writes |
| `app/data-model/components/helper-commands.js` | 1,4 | `/index`, `/triggers` rows (`mutates:false`, `view`) | command governance lines unchanged |
| `app/data-model/components/HelperSidecar.jsx` | 1,4 | one `activeView` each, same body switch | no second sidecar framework |
| `app/data-model/components/IndexCockpit.jsx`, `TriggersCockpit.jsx` **(new)** | 1,4 | mirror `ScheduleCockpit.jsx`, `dm-*` primitives only | no new visual grammar |
| `app/workspace-rail.jsx` | 1,4 | one sibling pill each below Ask-helper | §2.1 surface rule |
| `lib/workspace-add-on-scheduler.js` | 2,3,4 | verifier adapter table (QStash #1, HMAC #2, api-request #3) | inbound trust seam; HS256 lockdown pattern reused |
| `app/api/workspace/workflows/[providerId]/route.js` | 2 | verification via adapter lookup; additive `growthub-invoked-run-v1` | **no new route**; triple binding validation unchanged |
| `lib/orchestration-run-inputs.js` | 2,4 | additive `source` values (`"webhook"`, `"api-request"`) | envelope limits + secretRef rule unchanged |
| `lib/serverless-readiness.js` | 3,4 | per-method `bound` checks; at most one additive delta tag per method | single readiness driver; no second scan |
| `app/api/workspace/workflow/publish/route.js` | 3 | per-method trigger re-verification in the existing gate | publish stays the only draft→live door |
| `lib/scheduler-orchestration.js` | 3,4 | method-aware install/uninstall orchestration (same shape: verify → readiness → deterministic id → remote/local setup → one bind write → rollback → receipt) | one-atomic-write + rollback + receipt pattern |
| `lib/schedule-cockpit-console.js`, `lib/orchestration-graph.js`, `lib/workspace-patch-policy.js`, `packages/api-contract/src/workspace-outcome.ts` | — | **not modified** (patch policy and receipt contract untouched; graph vocabulary already sufficient) | frozen boundaries |
| `scripts/unit-*.test.mjs` (new siblings) | 1–5 | per-deriver, per-verifier, per-gate tests | validation layer |

## 6. Runtime Implications

- **Execution authority is unchanged.** All execution remains
  `sandbox-run` + the existing destination route's published-graph path; all
  mutation remains the two canonical calls + governed lanes. Verifier adapters
  are deterministic gatekeepers, not executors.
- **Inbound trust widens by adapter, not by route.** Each input method's trust
  is anchored to a verified registry row's env-ref scheme; the triple binding
  validation (payload ↔ row ↔ published trigger node) applies to every method,
  so a stale or rebound binding can never execute.
- **The receipt stream stays the only persistence** — new lifecycle steps emit
  existing-shape receipts; the 200-cap window and hash chain are untouched.
- **Agent loop unchanged in kind, wider in surface:** cockpit view-models
  remain the condition packet; `outcomeStatus` remains the reward; `/triggers`
  gives agents one packet covering every input method.

## 7. Validation Requirements

- Deriver purity + determinism tests (no I/O, stable output for fixed input).
- Verifier negative-path tests per adapter (bad sig, replay, wrong destination,
  clock skew, rebound id) — mirroring the QStash HS256 lockdown checks.
- Publish-gate tests: per-method trigger agreement; draft/tested-config
  byte-identity unchanged.
- Policy regression: PATCH allowlist, live-field protection, credential-field
  rejection all still reject (no widening).
- Receipt assertions per lifecycle step; `generatedFromReceipts` folds.
- One live smoke per input method, documented in the command-guide format,
  before any method is declared validated.

## 8. Anti-Patterns (must not happen)

- No new API route; no new top-level PATCH field; no new object type, schema,
  or persistence backend. Contract version literals stay `1`.
- No second executor, scheduler runtime, webhook framework, or workflow queue —
  the destination route + graph runner are the only inbound execution path.
- No secrets or raw tokens anywhere but env; registry rows carry env-ref slugs
  only; run inputs accept secretRef only.
- No cockpit that mutates: every deriver stays pure; every action is a hand-off
  to an existing governed route.
- No trigger-node writes outside the governed bind writers inside governed
  routes (never via direct PATCH — `live_workflow_field` policy enforces this).
- No wiring `custom-webhook` as a second *inbound* surface — inbound binding
  lives on the trigger node, one grammar.
- No generalized "binding framework" abstraction layered beside the catalog —
  the catalog declaration + per-capability deriver is the pattern; a parallel
  registry would be the exact redundancy this repo's contracts forbid.
- No fabricated telemetry; no completion claims without a persisted receipt;
  no phase declared done without its live smoke.

## Release Rule

This document adds no runtime layer, no API, and no schema. Any feature
claiming the Governed Capability Binding Loop must correlate the four
declarations of §3, preserve every invariant of
`GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1.md` §6, and cite a real source anchor
for every "already exists" claim.
