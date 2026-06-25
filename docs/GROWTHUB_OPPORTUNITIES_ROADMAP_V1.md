# Growthub Opportunities Roadmap V1 — Compounding On The Shipped System

The source-grounded map of what the latest releases (`@growthub/cli` **0.14.8**) actually
ship as a working, deployed system — and the highest-leverage roadmap that **compounds on
that substrate**. No timelines. Sequenced only by leverage and dependency, in the house
discipline already proven by [`CEO_PRIMITIVE_COCKPIT_ROADMAP_V1.md`](./CEO_PRIMITIVE_COCKPIT_ROADMAP_V1.md)
and [`NO_CODE_WORKFLOW_PERSISTENCE_ROADMAP_V1.md`](./NO_CODE_WORKFLOW_PERSISTENCE_ROADMAP_V1.md).

> **The law this roadmap obeys** (from the CEO roadmap §3, the system's own architecture):
> *mirror, don't rebuild* · *read-only projections ship first* · *one optional field beats
> one new type, one new type beats widening anything* · *eligibility functions, not flags* ·
> **never widen the `PATCH /api/workspace` allowlist**, **never bump the contract version
> literal**, **never invent a third mutation path**. Every claim of "already ships" below
> cites a real `file`. Source-of-truth order is `AGENTS.md` §"Source Of Truth Order":
> runtime route files win over this doc.

---

## 0. The two boundaries everything respects

Nothing in this roadmap touches either of these — they are runtime-enforced, not advisory
(`AGENTS.md` §"Canonical workspace mutation boundary"):

1. **`PATCH /api/workspace`** — config mutation, permanently allowlisted to
   `dashboards | widgetTypes | canvas | dataModel`.
2. **`POST /api/workspace/sandbox-run`** — all sandbox / agent-team execution.

Live workflow state is publish-owned (`POST /api/workspace/workflow/publish`). App scope is
enforced on every governed route (`x-growthub-app-scope` → `AppScopeViolation` +
`repairPlan[]`). Every lane emits an `AgentOutcomeReceipt`. **A roadmap item that needs a
third write path is wrong by construction** — it is a projection, an optional field, or it
does not ship.

---

## 1. Current State — what the releases actually ship (cited)

These are deployed surfaces, not concepts. The deploy path itself ships:
`growthub workspace deploy check --json` → Bridge-authority credential resolution →
Vercel, with agent execution staying hosted ([`WORKSPACE_DEPLOY_FLOW.md`](./WORKSPACE_DEPLOY_FLOW.md)).

| Strategic space | What ships today | Where it lives | Release |
| --- | --- | --- | --- |
| **Agent Teams** (configuration spine) | Reusable team blueprints — orchestrator role, sub-agent roles, skills, processes, workflow responsibilities, outcome criteria — as governed rows in the `agent-swarm-teams` object (existing `custom` objectType). **Never execute**; they inform a `/swarm` proposal. | `lib/ceo-agent-teams.js` | CEO primitive `0.14.4` |
| **CEO Cockpit** (orchestration apex) | `/ceo` view: rolls every `swarm-workflows` row + its receipts into per-report health, readiness, and one "needs your attention" pick. Operational + first-use bootstrap modes. | `lib/ceo-cockpit-console.js`, `lib/ceo-bootstrap-console.js`, `app/data-model/components/CeoCockpit.jsx` | `0.14.4` |
| **Swarm runtime** (execution) | Real three-phase orchestrator → workers → synthesizer pipeline, executed **only** through `sandbox-run`, with truthful per-task telemetry (`tokens`/`tools`/`startedAt`/`endedAt`, `null` when unreported). Eligibility gate blocks unrunnable Play before a failed run. | `lib/orchestration-agent-swarm.js`, `lib/workspace-swarm-proposal.js` | swarm cockpit `0.14.1` |
| **Agent Outcome Loop** (governance record) | Every lane (PATCH, preflight reject, sandbox-run, publish, helper apply) emits one canonical secret-redacted receipt; `GET /api/workspace/agent-outcomes` returns the stream + a recomputed governance summary (blocked attempts, publishes, drafts awaiting test/publish, live rows without proof). Rejections carry `repairPlan[]`. | `app/api/workspace/agent-outcomes/route.js`, `lib/workspace-outcome-receipts.js` | Control Plane `0.14.2` |
| **Governed Application Control Plane** | Apps are first-class governed rows (`app-surface`); `GET /api/workspace/apps` derives per-app health, blockers, single next action (with href into the real surface), agent assignment packet, and filesystem-detected surfaces. App scope enforced on every mutation/execution route. | `app/api/workspace/apps/route.js`, `lib/workspace-app-registry.js` | `0.14.2` |
| **Workspace Map** (dependency truth) | `/workspace-map` renders a read-only node canvas **derived** from `buildWorkspaceMetadataStore → buildWorkspaceMetadataGraph` — full edge taxonomy already encodes *widget→object*, *node reads/writes object*, *run produced artifact*, etc. Click-through into the real surface. | `lib/workspace-metadata-graph.js`, `app/data-model/components/WorkspaceDataModelCanvas.jsx` | facelift `0.14.8` |
| **Live run deltas** | Per-node orchestration status (Completed/Running/Failed/Skipped) streamed as NDJSON from `sandbox-run`, derived by a pure never-throws function, docked on the Workflow Canvas. | `lib/orchestration-node-status.js`, `lib/orchestration-graph-runner.js` | `0.14.8` |
| **Unified API Resolver Registry** | Every governed `api-registry` record correlates to its resolver; the no-code cockpit *constructs* the resolver from the tested response shape; each is an addressable app-scoped endpoint at `/api/resolvers/<id>`. Generated artifacts are projections of the record (CI drift guard). | `lib/unified-resolver-registry.js`, `lib/resolver-constructor.js` | resolver registry `1.5.1` |

**The one-sentence truth (CEO roadmap §1.3):** *the helper already is a CEO at workspace
altitude — it proposes intent, a human approves, the server builds and dispatches, and every
outcome is a receipt.* The substrate records the facts. The frontier is **composition and
reach**, not new runtime.

---

## 2. Missing Extension — the frontier, in four honest categories

Per `AGENTS.md` skill discipline, every item is classified and never blurred. **Nothing here
is a backend that needs building** — the verbs are *project*, *compose*, *aggregate*.

| Frontier | Classification | Evidence (where the substrate already is / where the reach ends) |
| --- | --- | --- |
| **Agent Team hierarchy + review→improve** | **Partially Exists** | `lib/ceo-cockpit-console.js` rolls up the fleet, but swarm agents are flat `role + taskPrompt` (`workspace-swarm-proposal.js`) — no `reportsTo`, no `deriveSwarmRunReview` that files governed follow-up work. The CEO roadmap §4 H1/capstone already specify this as an *optional* `reportsTo` field + a proposal-lane review packet. |
| **App ship-readiness rollup** | **Partially Exists** | The signals all ship — `apps/route.js` health/blockers, `lib/env-status.js`, `deriveSwarmWorkflowExecutionEligibility`, `workspace deploy check --json` — but no single deriver composes them into one app-scoped "ready to ship" score with each item linking to its real surface. |
| **Blast-radius (reverse dependency) query** | **Partially Exists** | `workspace-metadata-graph.js` already encodes every dependency edge and the Map renders them; there is no reverse-traversal deriver answering *"if I change this object/field, which widgets/dashboards/workflows go stale?"* surfaced on selection or fed into helper `explain` / preflight. |
| **Cross-workspace Agent Team operation** | **Missing** (genuinely new substrate) | Agent Teams, `/apps`, `/agent-outcomes`, and the metadata graph are all **single-workspace**. No aggregator lets one CEO operate teams across multiple governed workspaces. This is the only item needing a new substrate — and it must be a **read-only aggregator of the per-workspace projections above**, never a new write path. |

---

## 3. Strategic Direction — why these compound (and in this order)

The product's stated north star (CEO roadmap §3): *orchestrate agent teams, and build and
ship full custom applications.* The four spaces are not a feature list — they are one
compounding stack, each layer made possible by the one beneath it:

```
SPACE 4  Cross-workspace CEO  ── aggregates the per-workspace projections of 1–3
           (north star)            (read-only; requires 1–3 to exist cleanly per workspace — they do)
              ▲
SPACE 2  App ship-readiness  ── composes health + env + eligibility + deploy-check
           (productization)       into one app-scoped score (read-only deriver)
              ▲
SPACE 3  Blast-radius truth  ── reverse-traverses the metadata graph that the Map already renders
           (dependency)           (pure graph deriver; feeds preflight + receipts)
              ▲
SPACE 1  Agent Teams spine   ── hierarchy + review→improve over the shipped CEO loop
           (foundation)          (one optional field + one review projection)
```

Each layer ships **value standalone**, ships **read-only first**, and leaves the runtime
untouched. SPACE 4 is deliberately last: it is worthless until 1–3 expose clean per-workspace
projections — which they now do.

---

## 4. Phased Implementation — compounding sprint items (no timelines)

Ordering rule, inherited verbatim from the CEO roadmap: **read-only projections first
(highest value, lowest risk), then the smallest backwards-compatible mutation, then the
loop-closing / reach-extending capstone.** Each item is a full instance of the Governed
Cockpit Entry-Point spine ([`GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1.md`](./GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1.md)).

### Sprint S1 — Agent Teams spine (foundation; mostly specified, partly shipped)

- **S1.a — Team hierarchy (optional field).** Add an **optional** `reportsTo`/`manager` to
  the swarm agent *intent* in the `swarm.run.propose` payload; the server's
  `normalizeSwarmAgent` + `buildDefaultAgentSwarmGraph` build a named reporting tree onto the
  existing orchestrator→workers→synthesizer runtime. Absent ⇒ today's flat behavior. *No new
  proposal type, no new PATCH field, no schema change* — the graph already serializes in
  `orchestrationConfig`. (This is CEO roadmap H1.)
- **S1.b — Review→improve projection.** `deriveSwarmRunReview` over the per-agent transcripts
  already on the run record → a review packet whose follow-up work is filed **through the
  existing helper proposal lane** (`create_object` / `swarm`), never a new task object.

*Substrate:* `lib/workspace-swarm-proposal.js`, `lib/orchestration-run-console.js`,
`lib/ceo-cockpit-console.js`. *Compounds:* every later space reads Team identity + review
state.

### Sprint S2 — Blast-radius truth (read-only graph deriver)

- **S2.a — Reverse-traversal deriver.** A pure function over the existing metadata graph:
  given a node id (object / field / widget / workflow node), return the downstream set that
  becomes stale, using the edge taxonomy already defined in `workspace-metadata-graph.js`
  (reverse of `bindsToObject`, `usesField`, `readsObject`/`writesObject`, `containsWidget`).
  Deterministic edge ids already exist, so results diff cleanly between calls.
- **S2.b — Surface on the Map + into the gates.** Render the stale set as a read-only panel
  on Workspace Map node selection (the canvas already renders these nodes), and feed the same
  deriver into helper `explain` and the **existing** `patch/preflight` so an edit's blast
  radius is reported *before* the write — and recorded as an `AgentOutcomeReceipt`.

*Substrate:* `lib/workspace-metadata-graph.js`, `lib/workspace-metadata-selectors.js`,
`app/data-model/components/WorkspaceDataModelCanvas.jsx`, `app/api/workspace/patch/preflight/route.js`.
*Compounds:* S4's cross-workspace impact is this deriver run per workspace and unioned.

### Sprint S3 — App ship-readiness rollup (productization, read-only)

- **S3.a — Composite readiness deriver.** One pure function rolls the signals that already
  ship — `apps/route.js` health + blockers, `env-status.js` env keys, swarm eligibility,
  draft/publish proof state, and the `workspace deploy check` shape — into a single
  app-scoped readiness score with an **eligibility-style** `{ ready, blocking[], nextAction }`
  per check. No flags; every item links to its real surface via the hrefs `apps/route.js`
  already emits.
- **S3.b — Surface in the apps lens.** Render the score in the existing Fleet/apps lens
  (`WorkspaceLensPanel.jsx`) and expose it on `GET /api/workspace/apps` as an **optional**
  `readiness?` field (additive; contract version stays `1`).

*Substrate:* `app/api/workspace/apps/route.js`, `lib/workspace-app-registry.js`,
`lib/env-status.js`, `app/components/WorkspaceLensPanel.jsx`. *Compounds:* S4 aggregates each
workspace's readiness into a portfolio view.

### Sprint S4 — Cross-workspace Agent Team operation (north star; read-only aggregator)

The only item with genuinely new substrate — and it is an **aggregator of the projections
S1–S3 produce**, never a new mutation path.

- **S4.a — Workspace index (read-only).** A registry of governed workspaces an operator owns,
  each addressed by the read-only projections it already exposes: `/api/workspace/apps`,
  `/api/workspace/agent-outcomes`, and the metadata graph. The index stores **references and
  derived rollups only** — no config, no secrets, no execution authority. Mutation of any
  workspace still happens *inside that workspace* through its own two canonical calls.
- **S4.b — Portfolio CEO cockpit.** The `/ceo` projection generalized one level up: Agent
  Team readiness, blocked attempts, and cross-workspace blast radius (S2 deriver unioned
  across workspaces) rolled into one "where do I act next" pick — the same Causation-ITT
  shape (`state → eligibility → guidance → action`) the single-workspace cockpit already uses.

*Compounds:* this is only coherent because S1–S3 made each workspace expose clean, secret-free,
read-only truth. *Hard constraint:* the aggregator **reads**; it never becomes a write plane.

---

## 5. Exact File Edits (per sprint, additive only)

> **Two-lane release reality** ([`MONOREPO_PROVENANCE_MAP_V1.md`](./MONOREPO_PROVENANCE_MAP_V1.md)):
> every edit below is **Phase A source-only** under
> `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/**` (+ tests +
> lockstep version bump). **Never edit `cli/dist/**`**; flag *"dist rebuild required in Phase B"*
> for the super-admin. `growthub kit download …` must keep producing the byte-identical frozen
> artifact (`GOVERNED_WORKSPACE_TOPOLOGY_V1.md`).

| Sprint | Modify | Add | Test |
| --- | --- | --- | --- |
| **S1** | `lib/workspace-swarm-proposal.js` (optional `reportsTo` in `normalizeSwarmAgent` + graph builder), `packages/api-contract/src/helper.ts` (optional field on swarm intent) | `lib/ceo-run-review.js` (`deriveSwarmRunReview`) | `scripts/unit-ceo-run-review.test.mjs`, extend swarm-proposal unit tests |
| **S2** | `app/data-model/components/WorkspaceDataModelCanvas.jsx` (selection panel), `app/api/workspace/patch/preflight/route.js` (attach blast-radius warning) | `lib/workspace-metadata-impact.js` (reverse-traversal deriver) | `scripts/unit-workspace-metadata-impact.test.mjs` |
| **S3** | `app/api/workspace/apps/route.js` (optional `readiness?`), `app/components/WorkspaceLensPanel.jsx` (render score), `packages/api-contract/src/workspace-apps.ts` (optional field, version stays `1`) | `lib/workspace-app-readiness.js` (composite deriver) | `scripts/unit-workspace-app-readiness.test.mjs` |
| **S4** | CLI: `cli/src/**` workspace-index command surface (read-only aggregation, `--json`) | `lib/portfolio-ceo-console.js` (aggregator deriver), `docs/CROSS_WORKSPACE_CEO_V1.md` | `scripts/unit-portfolio-ceo-console.test.mjs` |

Per-file purpose follows the spine: every new `lib/*.js` is a **pure deriver** (no React, no
fetch, no fs, no writes) mirroring `ceo-cockpit-console.js`; every route edit is **additive
optional output**; every component edit is a **read-only render** with an "Open in …" CTA into
the surface that already owns the mutation.

---

## 6. Runtime Implications

- **Authority unchanged.** No item adds an executor or a write path. Agent Teams still never
  execute; execution stays in `sandbox-run`; live state stays publish-owned; app scope still
  gates every governed route.
- **Local models stay propose-only.** Any reasoning added (review packets, readiness guidance,
  blast-radius explanations) follows propose → validate → dispatch — it shapes JSON for a human
  to approve, it never dispatches.
- **Deploy untouched.** S3's readiness *reads* the `workspace deploy check` shape; it does not
  change the Bridge→Vercel wire (`WORKSPACE_DEPLOY_FLOW.md`).
- **Secret-free by construction.** Every projection inherits the receipt-stream redaction rule;
  S4's index stores references and rollups, never config or credentials.

## 7. Validation Requirements

- Per-deriver unit tests (pure, deterministic) as tabled in §5; mirror
  `scripts/unit-ceo-cockpit-console.test.mjs` and `scripts/unit-orchestration-node-status.test.mjs`.
- `node scripts/check-resolver-registry.mjs` and the patch-policy probes
  (`scripts/e2e-workspace-patch-policy-probe.mjs`) must stay green — S2's preflight edit is
  adversarially exercised there.
- `bash scripts/agent-dist-verify.sh pre-push` (six gates) + `pnpm freeze:check` around every
  change; CI `smoke`/`validate`/`verify` + `node scripts/release-check.mjs` before merge.
- Contract version literal stays `1`; `pnpm check:monorepo-boundary` stays clean.

## 8. Anti-Patterns (what makes an item wrong by construction)

- Widening the `PATCH /api/workspace` allowlist, bumping the contract version, or inventing a
  third mutation/execution path.
- Making Agent Team records executable, or letting a deriver mutate config.
- Building a second data model beside the metadata graph (S2 reverse-traverses the existing one).
- Turning the S4 cross-workspace index into a write plane — it aggregates read-only projections;
  every workspace's mutations stay inside that workspace's two canonical calls.
- Editing or committing `cli/dist/**`, or breaking the frozen exported-artifact byte-identity.
- Calling any of this "fleet observability." The user-facing primitive is **Agent Teams**, with
  the CEO Cockpit as the operating surface; runtime rollup is how a team's work is *shown*, not a
  separate console.
</content>
</invoke>
