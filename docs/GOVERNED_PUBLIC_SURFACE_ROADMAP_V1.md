# Governed Public Surface Roadmap V1 — compounding on the inbound + deployment release

The strategic item list that compounds directly on the PR #263 release surface
(`GOVERNED_INBOUND_AND_DEPLOYMENT_RELEASE_FREEZE_V1.md`): native Webhook /
API Request inbound invocation plus governed Vercel/GitHub deployment. No
timelines. Sequenced only by leverage and dependency, highest-impact /
lowest-risk first.

> **Verification basis.** Every gap below was confirmed against source on
> `@growthub/cli` `0.14.13` (read from `cli/package.json` per
> `ARTIFACT_VERSIONS.md`), and the operating loop was exercised live: temp
> workspace export (`node scripts/export-seed-workspace.mjs`) → booted runtime →
> `growthub serve --mcp --live` → all three layers driven per call
> (`describe_workspace`, `list_workflows`, `list_integrations`,
> `outcome_ledger`, `simulate_causal_impact`, `app_readiness`,
> `preflight_patch` in `live-authoritative` mode with removal impact,
> `next_actions` governed hand-off). Gap classifications were verified by
> reading the derivation code (node/row promotion in the metadata store, the
> command registry, the deploy lens body), not by string search alone. Path
> anchors below use `apps/workspace/` for
> `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/`.

> **The law this obeys** (unchanged, inherited from
> `GROWTHUB_OPPORTUNITIES_ROADMAP_V1.md` and the mutation boundary in
> `AGENTS.md`): *mirror, don't rebuild* · *read-only projections ship first* ·
> *one optional field beats one new type* · **never widen the
> `PATCH /api/workspace` allowlist** · **never bump a contract version
> literal** · **never invent a third mutation path** · **no new inbound API
> route** (the door exists and is dynamic) · **Phase-A source-only** (never
> edit `cli/dist/**`).

---

## 0. What the release actually created (the compounding premise)

PR #263 composes into something none of its features is individually: **every
deployed workspace is a tenant-owned, signed, serverless automation API** —
build (canvas) → prove (test event, real downstream execution) → map
({{input.<path>}} chips over observed payloads,
`apps/workspace/app/workflows/InboundResponseInspector.jsx`) → expose (HMAC
webhook / bearer API Request on `POST /api/workspace/workflows/growthub`) →
run (serverless, request/response) → observe (durable `lastResponse` + receipt
stream) → deploy (private repo + Vercel project + deploy proof as governed
rows).

The roadmap question is therefore not "what feature next" but **which shipped
invariants have not yet been projected onto the new substrate**. The
Intelligence, readiness, cockpit, and fleet layers each see the new rows only
generically (or not at all) — none can reason about public exposure or deploy
proof semantically — and one latent primitive (composition) is unactivated.
Every item below is a projection or an additive value over shipped rows —
none requires a new schema, route, or mutation path.

---

## 1. Gap analysis (verified against source, four categories, no blending)

| # | Finding | Category | Evidence |
| --- | --- | --- | --- |
| P1 | Metadata graph covers `workspace-app-registry` and `vercel-projects` **only as generic `dataModelObject` nodes + fields** (all objects enter via `workspace-metadata-graph.js:102`). Row-level typed derivation exists for exactly one row family — `sandbox-environment` rows become sandboxes/workflows/workflowNodes/pipelineHealth (`workspace-metadata-store.js:534–988`). No `appSurface`/`vercelProject`/`inboundBinding` typed nodes, no exposure edges, and `inputMode` never enters the store — so blast radius, stale surfaces, patch impact, and the MCP tools can see the *objects* but cannot reason about *which workflow is publicly exposed, by which binding, served by which deployment* | **Partially Exists** | `apps/workspace/lib/workspace-metadata-graph.js:102`; `apps/workspace/lib/workspace-metadata-store.js:534,644,848,988` (sandbox-only row typing); no `inputMode` reference in any `workspace-metadata-*.js` |
| P2 | `/triggers` fleet cockpit — the one Phase-4 deliverable of `GOVERNED_CAPABILITY_BINDING_LOOP_V1.md` §4 not shipped: no pure deriver unifies scheduler + webhook + api-request bindings | **Missing** | command registry is exactly `/goal /loop /workflows /swarm /ceo /schedule /register-api /create-object` (`helper-commands.js:20–77`); `schedule-cockpit-console.js` contains no `inputMode`/method handling (its chips are readiness delta tags, `:80,191`); the only cockpit derivers in `apps/workspace/lib/` are `schedule-cockpit-console.js` and `ceo-cockpit-console.js` |
| P3 | App readiness folds an activation-level deploy lens but **not the release's governed proof rows or public-door exposure**. `deriveDeployLensState` (`workspace-activation.js:878`) already feeds `deployReady` into `GET /api/workspace/apps` blockers (`workspace-app-registry.js:158`) from runtime signals (target, env vars, check-passed, deployed flag) — but neither it, `workspace-app-readiness.js`, nor the apps route reads `vercel-projects.latestDeploymentState`/`lastDeployProof` or inbound-binding exposure; live MCP `app_readiness` returned `signals: { integrations, sandboxes, pipelines, workflows }` only | **Partially Exists** | zero `latestDeploymentState`/`lastDeployProof` references in `workspace-app-readiness.js`, `apps/route.js`, `workspace-app-registry.js`; `vercel-projects` rows carry the proof fields already (release freeze §governed rows) |
| P4 | Workflow → workflow composition — named "the compounding move… comes for free" in `GOVERNED_CAPABILITY_BINDING_LOOP_V1.md` §3 — has **no governed constructor**: nothing mints an `api-registry` row from a sibling workflow's published inbound binding | **Missing** | grep of `apps/workspace/lib/resolver-constructor.js` + `workspace-add-ons.js` for sibling-binding construction: no hits |
| P5 | Door guards (duplicate-delivery + rate) are deliberately per-instance (`deliveryCache` `apps/workspace/lib/workspace-inbound-invocation.js:212`, `rateCache` `:253`, "best-effort WITHIN one runtime instance" comment) — correct posture, but **invisible**: no readiness delta, cockpit chip, or receipt-derived traffic view surfaces it on serverless multi-instance deployments | **Partially Exists** | source comments at `:203–210`, `:240–247`; blocked receipts already emitted (429 + retry-after) but no deriver folds them |
| P6 | Production proof loop — the QA bar verifies signed/bearer 200 against localhost; nothing replays the verified test event against the **deployed domain** and writes proof back to the `vercel-projects` / binding rows | **Partially Exists** | `scripts/smoke-vercel-marketplace-localhost.mjs`, `scripts/e2e-inbound-journey-playwright.mjs` exist; no production-domain sibling |
| P7 | The public API surface is not legible as an artifact — no OpenAPI (or equivalent) projection of published bindings, despite the run-input schema (`discoverRunInputSchema`) and observed response shapes (`lastResponse`) both existing as governed state | **Missing** | grep of `apps/workspace/lib` + `app` for `openapi`: no hits |
| P8 | `growthub fleet` has **no awareness** of deployments or public bindings — the portfolio view of "which forks are deployed where, exposing which endpoints" does not exist | **Missing** | grep of `cli/src/fleet/` + `cli/src/commands/fleet.ts` for `vercel-projects` / `inbound` / `deploymentUrl`: no hits |
| P9 | Inbound secret lifecycle — `GROWTHUB_WEBHOOK_SIGNING_SECRET` / `GROWTHUB_API_INVOKE_TOKEN` are env-gated at bind (V1.1 delta #1) but have no age/rotation guidance once the door is public | **Partially Exists** | `apps/workspace/lib/env-status.js` reports presence; no readiness delta or cockpit nextAction covers rotation |

---

## 2. Strategic direction — project the invariants onto the new substrate

The three-layer control plane (Mutation → Law → Intelligence,
`OPERATING_THE_GOVERNED_UNIVERSE_V1.md`) is complete but its Intelligence
layer predates PR #263. The highest-leverage move is the same one that built
the plane: **extend the graph spine once (P1), then let every existing
consumer inherit it for free** — Workspace Map, blast radius, stale surfaces,
patch preflight, `growthub plan`, and all MCP tools gain deployment/binding
awareness from a single deriver-level change. Cockpits (P2), readiness (P3),
and fleet (P8) are then pure projections over rows + receipts that already
persist. Composition (P4) is the one new *capability*, and it is values-only:
an `api-registry` row whose endpoint is a sibling binding URL, executed by the
unchanged `api-registry-call` runner path.

```
                     ┌───────────────────────────────────────────────┐
 governed rows   ───►│  Item 1: graph nodes/edges for app-registry,  │───► inherited by:
 (already durable)   │  vercel-projects, inbound bindings (pure)     │     • Workspace Map
                     └───────────────────────────────────────────────┘     • deriveBlastRadius / patch preflight
                                                                            • all 14 MCP tools
                                                                            • growthub plan / fleet
   Item 2  /triggers cockpit (projection over bindings + door receipts)
   Item 3  deployment + binding proof folded into app_readiness (additive optional)
   Item 4  sibling-binding constructor → workflow→workflow composition (values only)
   Item 5  production proof loop against the deployed domain (proof, not runtime)
   Item 6  door-guard observability (readiness delta + receipt-derived traffic view)
   Item 7  OpenAPI projection of the public surface (CLI/MCP --json first)
   Item 8  fleet rollup of deployed apps + public endpoints
   Item 9  inbound secret lifecycle as readiness guidance
```

---

## 3. The items (dependency order; no timelines)

### Item 1 — Row-level typed graph derivation for the release substrate (the spine move; do first)

The store already has the exact pattern: `sandbox-environment` is the one row
family promoted from generic rows to typed graph citizens
(`workspace-metadata-store.js:534–988` derives sandboxes → workflows →
workflowNodes → pipelineHealth). Extend that same promotion to the three row
families the release created: `appSurface` (from `workspace-app-registry`
rows), `vercelProject` (from `vercel-projects` rows), and `inboundBinding`
(from workflow rows whose trigger node carries
`inputMode: "webhook" | "api-request"` — the store already walks these rows'
graphs today; it just discards the trigger metadata). Edge taxonomy,
additive: *workflow —exposedBy→ inboundBinding*, *inboundBinding —servedBy→
vercelProject*, *appSurface —deployedTo→ vercelProject*, *appSurface
—referencesRegistry→ api-registry row*. Deterministic edge ids, same as every
existing edge. The generic `dataModelObject` nodes stay untouched — this adds
semantics on top, exactly as pipelineHealth did.

*Why highest impact / lowest risk:* pure deriver extension, zero writes, and
every downstream consumer inherits it in the same change — blast radius can
finally answer *"changing this workflow breaks this public endpoint on this
deployed app"*, `preflight_patch` reports it before the write, the Workspace
Map renders it, and `simulate_causal_impact` stops returning "no
outcome-level impact" for publicly exposed workflows (observed live in the
probe).

### Item 2 — `/triggers` fleet cockpit (the un-shipped Phase 4 lens)

The one outstanding deliverable of the capability-binding loop: one pure
deriver `deriveTriggersCockpit({ workspaceConfig, configuredEnvRefs,
receipts })` in the exact `deriveScheduleCockpit` shape
(`apps/workspace/lib/schedule-cockpit-console.js:140`) over **all**
input-method bindings — QStash, webhook, api-request. Cards = bound
workflows; states `bound | ready | blocked | drifted`; folds the door
receipts that already persist (verified 200s, `duplicate: true` ACKs, 429
blocked receipts, tamper 401s) into per-binding traffic/health chips; one
`attention`; per-card `nextAction` → existing governed routes. Four surfaces
only (one `mutates:false` `/triggers` command row, one sidecar `activeView`,
one rail pill, one cockpit component mirroring `ScheduleCockpit.jsx`).

*Why:* this is simultaneously the human ops surface for "my public API" and
the richest agent condition packet in the workspace — the generalized fleet
lens the binding-loop doc named as the terminal state of Phase 4.

### Item 3 — Governed deploy-proof rows + public-door truth folded into readiness (additive optional)

An activation-level deploy lens already exists and is already folded:
`deriveDeployLensState` (`workspace-activation.js:878`) reads runtime signals
(deploy target, env readiness, check-passed, deployed flag) and its
`deployReady` verdict reaches `GET /api/workspace/apps` blockers
(`workspace-app-registry.js:158`). What no readiness layer reads yet are the
release's **governed proof rows**: `vercel-projects.latestDeploymentState` /
`lastDeployProof` / `latestDeploymentUrl`, `workspace-app-registry.deploymentUrl`,
and live inbound bindings on workflow rows. Fold those into
`deriveAppReadiness` (and thereby MCP `app_readiness`) as additive signals.
New warning classes: *"binding live but no deployment — signed endpoint
exists only on localhost"* (the exact activation gap the release closed) and
*"deployed but deploy proof stale."* Optional field on `GET
/api/workspace/apps`; version stays `1`.

*Why:* the release made "where does my platform run" a governed row with
proof fields; the readiness layer predates those rows and still reasons only
from runtime flags — row truth and readiness truth should be the same truth.

### Item 4 — Sibling-binding constructor: workflow → workflow composition made first-class

The latent fan-out primitive, activated as values only. A governed
constructor in the `resolver-constructor.js` pattern that mints an
`api-registry` row **from a sibling workflow's published inbound binding**:
endpoint = the binding's destination URL, scheme = the binding's env ref
(`GROWTHUB_API_INVOKE_TOKEN` bearer, or webhook HMAC), capabilities derived
from the sibling's run-input schema (`discoverRunInputSchema`) and observed
`lastResponse` shape. An `api-registry-call` node targeting that row gives
workflow→workflow and (with existing intra-graph fan-out) parallel workflow
dispatch — **zero executor changes**, exactly as
`GOVERNED_CAPABILITY_BINDING_LOOP_V1.md` §3 predicted. Two supporting
projections: a *workflow —invokes→ workflow* edge in the Item-1 graph (so
composition enters blast radius), and cross-run lineage in receipts (caller
runId carried in the invoked run's receipt — additive field on an existing
receipt kind, no new stream).

*Why:* this converts the release from "N public endpoints" into "a composable
automation fabric" — output leaves of one workflow become `{{input.*}}`
bindings of the next, across deployments, with a receipt chain per hop. It is
the single highest-value new capability available without touching the
runtime.

### Item 5 — Production proof loop (Verified 200 extends to the deployed domain)

A production sibling of `scripts/smoke-vercel-marketplace-localhost.mjs` +
the e2e inbound journey: replay the workflow's verified test event against
the **deployed domain** (signed webhook + bearer, tamper-401 negative case),
then write proof onto the governed rows that already have fields for it
(`vercel-projects.lastDeployProof` family; binding proof columns) plus one
receipt. Exposed as a `nextAction` from `/settings/apps` and the Item-2/3
lenses ("prove production door"), executed through the existing lanes — the
smoke is a prover, not a runtime.

*Why:* the release's generative rule — *proof before publish* — currently
stops at localhost. This extends the same rule to the layer users actually
hand to external systems, closing build → prove → expose → run on
user-owned infra.

### Item 6 — Door-guard observability (surface the honest boundary)

The per-instance posture of the duplicate-delivery and rate guards is
deliberate and documented in source
(`workspace-inbound-invocation.js:203–210`, `:240–247`) — but invisible to
every operating surface. Two projections, no guard-behavior change: (a) a
readiness/cockpit delta on serverless-deployed bindings stating the
boundary — *"rate limit and replay dedup are per-instance on this runtime;
cross-instance callers should send `x-growthub-idempotency-key`"* — so the
contract users already have is discoverable where they operate; (b) the
Item-2 receipt-derived traffic view makes 429s/duplicates measurable per
binding. Only if measurement later proves a real need: a durable dedup lane
via the existing source-record persistence (never a new backend), decided on
evidence, not speculation.

*Why:* highest-trust move per repo doctrine — no fabricated guarantees; the
platform states exactly what its door promises on the exact infrastructure
the deploy feature ships users onto.

### Item 7 — OpenAPI projection of the public surface (`--json` first)

A pure projection that derives an OpenAPI 3.1 document from published
inbound bindings: paths = binding destination URLs on the deployed domain,
request schemas = `discoverRunInputSchema` (the contract the door already
validates), response schemas = observed `lastResponse` shapes, auth schemes =
the binding's method (bearer / HMAC headers as documented in the freeze
contract). Ship as a `growthub` CLI command and/or MCP tool first (the
terminal is the power center; the artifact is the deliverable) — a read-only
route later only if a UI consumer needs it.

*Why:* the release built a personal REST API; this makes it **legible and
consumable** — importable into any client, agent toolchain, or partner
integration — from governed state alone, at zero runtime risk.

### Item 8 — Fleet rollup of deployed apps + public endpoints

Extend `growthub fleet` (`cli/src/commands/fleet.ts`, `cli/src/fleet/*`) to
read the Item-1/3 truth per fork: which forks are deployed (repo URL,
deployment URL, deploy-proof freshness), which public bindings each exposes,
and their readiness verdicts. `--json` first. This is the portfolio view of
the release's product thesis — a fleet of tenant-owned automation backends —
built on the fleet engine that already rolls up drift.

### Item 9 — Inbound secret lifecycle as readiness guidance (never automation)

Age/rotation guidance for `GROWTHUB_WEBHOOK_SIGNING_SECRET` /
`GROWTHUB_API_INVOKE_TOKEN` as readiness deltas + cockpit `nextAction`
("rotate signing secret; re-prove bindings") — presence and freshness only,
via the env-status pattern (`apps/workspace/lib/env-status.js`); the
platform never reads, stores, or rotates secret values. Pairs with Item 5:
rotation's completion proof is a fresh production 200.

---

## 4. Exact file edits (additive only; Phase-A source)

| Item | Modify | Add | Test |
| --- | --- | --- | --- |
| **1** | `apps/workspace/lib/workspace-metadata-store.js` (row-typing, mirrors the sandbox-environment derivation at `:534–988`), `workspace-metadata-graph.js` (+ selectors) | — | sibling of `scripts/unit-workspace-metadata-impact.test.mjs` |
| **2** | `helper-commands.js`, `HelperSidecar.jsx`, `workspace-rail.jsx` | `apps/workspace/lib/triggers-cockpit-console.js`, `TriggersCockpit.jsx` | `scripts/unit-triggers-cockpit.test.mjs` |
| **3** | `apps/workspace/lib/workspace-app-readiness.js`, `app/api/workspace/apps/route.js` (optional field), `packages/api-contract/src/workspace-apps.ts` (optional) | — | extend `scripts/unit-workspace-app-readiness.test.mjs` |
| **4** | `apps/workspace/lib/workspace-add-ons.js` (constructor entry), `workspace-outcome-receipts.js` (additive lineage field) | `apps/workspace/lib/sibling-binding-constructor.js` (pure, `resolver-constructor.js` shape) | `scripts/unit-sibling-binding-constructor.test.mjs` |
| **5** | `apps/workspace/lib/workspace-add-on-deployments.js` (proof write helper reuse) | `scripts/smoke-inbound-production-domain.mjs` | the smoke is the test |
| **6** | `apps/workspace/lib/serverless-readiness.js` (one additive delta tag), Item-2 deriver | — | extend readiness + cockpit tests |
| **7** | `cli/src/index.ts` (register command) | `cli/src/commands/workspace-openapi.ts` (pure projection) | `cli/src/__tests__/workspace-openapi.test.ts` |
| **8** | `cli/src/commands/fleet.ts`, `cli/src/fleet/summary.ts` | — | extend fleet tests |
| **9** | `apps/workspace/lib/env-status.js`, readiness deltas | — | extend `scripts/unit-env-status.test.mjs` |

Per-file law unchanged: every new `lib/*.js` is a pure deriver (no
React/fetch/fs/writes); every route edit is additive optional output; every
CLI command ships `--json` first; every mutation is a governed call or a PR.

## 5. Runtime implications

- **Authority unchanged.** No item adds an executor, route, schema, or write
  path. Item 4 executes through the existing `api-registry-call` runner path;
  Item 5 is a prover writing proof through existing helpers; Items 1–3, 6–9
  are projections.
- **The door contract is untouched.** HMAC/bearer verification, triple
  binding validation, idempotency ACK, rate limiting, and the publish proof
  gate are frozen; this roadmap makes them *visible and compounding*, not
  different.
- **Contract literals stay `1`;** the PATCH allowlist stays
  `dashboards | widgetTypes | canvas | dataModel`; receipts stay the only
  lifecycle persistence.

## 6. Validation requirements

- Deriver purity + determinism tests per item (no I/O; stable output for
  fixed input), mirroring `unit-schedule-cockpit.test.mjs`.
- Item 1 proven through the operating loop, not fixtures: export → boot →
  bind → deploy rows seeded → `simulate_causal_impact` on an exposed workflow
  returns the binding/deployment closure (the live probe's current empty
  result is the regression baseline).
- Item 4 negative paths: constructor refuses unpublished siblings, missing
  env refs, non-verified rows; composition run receipts carry lineage.
- Item 5 smoke format follows `SERVERLESS_SCHEDULER_COMMAND_GUIDE_V1.md`;
  tamper-401 required.
- Existing gates stay green: `pnpm test:inbound-invocation`,
  `test:add-ons-vercel`, patch-policy probes, `check:monorepo-boundary`,
  `bash scripts/pr-ready.sh`; CI `smoke`/`validate`/`verify`.

## 7. Anti-patterns (wrong by construction)

- A second dependency model beside the metadata graph (Item 1 extends it).
- A cockpit that mutates, or a fifth entry surface (Item 2 stays four).
- A workflow-composition "orchestrator" — composition is a registry row plus
  the existing runner; a parallel dispatcher is the redundancy the contracts
  forbid.
- Guaranteeing cross-instance rate/idempotency semantics the guards do not
  have, or adding a persistence backend to get them before receipts prove the
  need (Item 6 order: surface → measure → only then durable lane).
- Secrets anywhere but env; the OpenAPI projection and fleet rollup emit env
  ref *names* at most, never values.
- Declaring any item done without its live proof (export → operate → receipt),
  per the release's own QA bar.
