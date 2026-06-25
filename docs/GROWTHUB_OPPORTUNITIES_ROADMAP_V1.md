# Growthub Opportunities Roadmap V1 — The Recursive Mirror, Grounded

The source-of-truth map of what `@growthub/cli` **0.14.8** actually ships, and the
highest-leverage roadmap that **compounds on it** — including the *Recursive Mirror* thesis
(CLI-as-compiler, monorepo-as-DNA, UI-as-transient-lens) verified line-by-line against
`cli/src/**`. No timelines. Sequenced only by leverage and dependency.

> **The law this obeys** (the system's own architecture — CEO roadmap §3): *mirror, don't
> rebuild* · *read-only projections ship first* · *one optional field beats one new type* ·
> *eligibility functions, not flags* · **never widen the `PATCH /api/workspace` allowlist** ·
> **never bump the contract version literal** · **never invent a third mutation path** ·
> **Phase-A source-only** (never edit `cli/dist/**`). Every "already ships" claim cites a real
> `file`. Source-of-truth order (`AGENTS.md`): runtime route/command files win over this doc.

---

## 0. The thesis, and the one place it is wrong (so we build on truth)

**The thesis is right.** Backstage/Humanitec/Datadog treat the UI as truth and the repo as a
dump. Growthub inverts it: the **governed config + `.growthub-fork/` lifecycle state is the
owned artifact**, the live workspace is a projection, and the CLI is the reconciler
(`AGENTS.md` §"Canonical Product Reality"). That inversion is the moat.

**Where the thesis must be corrected to stay real** (this is the difference between a roadmap
and a hallucination): there is **no monorepo of many workspaces**. `MONOREPO_PROVENANCE_MAP_V1.md`
§4 is explicit — *"There is no top-level `apps/` in this repository. `apps/` is a property of an
exported workspace."* Each `growthub starter init` produces **one** governed workspace artifact.
So "changing one workspace affects other workspaces in the same monorepo" does not map to the
artifact shape. The **two real multi-asset axes that exist today** are:

1. **Apps within one workspace** — the Governed Application Control Plane: many `app-surface`
   rows, `GET /api/workspace/apps`, app-scope enforced on every route (`lib/workspace-app-registry.js`).
2. **A fleet of forks an operator owns** — already a first-class CLI surface: `growthub fleet`
   (`view | drift | drift-summary | policy | approvals | agent-plan`), built over durable
   in-fork state (`cli/src/commands/fleet.ts`, `cli/src/fleet/`).

The Recursive Mirror is therefore built across **app-scope (intra-workspace)** and
**fleet-scope (inter-fork)** — not an imaginary workspace-monorepo. Everything below targets
those two real axes.

---

## 1. The two enforced boundaries (nothing here touches them)

Runtime-enforced, not advisory (`AGENTS.md` §"Canonical workspace mutation boundary"):

1. **`PATCH /api/workspace`** — config mutation, permanently allowlisted to
   `dashboards | widgetTypes | canvas | dataModel`.
2. **`POST /api/workspace/sandbox-run`** — all sandbox / agent-team execution.

Live workflow state is publish-owned (`workflow/publish`). Every lane emits an
`AgentOutcomeReceipt`. **An item that needs a third write path is wrong by construction** — it
is a projection, an optional field, or it does not ship. A CLI weapon that *mutates* does so by
**opening a PR against the repo artifact** or by routing through these two calls — never by a
private side channel.

---

## 2. Current State — what the releases actually ship (cited, two surfaces)

### 2.1 Workspace-app surface (the exported artifact's runtime)

| Capability | Where it lives | Release |
| --- | --- | --- |
| **Agent Teams** — reusable config blueprints (orchestrator, sub-agent roles, skills, processes, outcome criteria); **never execute**, they inform a `/swarm` proposal | `lib/ceo-agent-teams.js` | CEO `0.14.4` |
| **CEO Cockpit** — `/ceo` rolls every `swarm-workflows` row + receipts into health/readiness/"needs attention" | `lib/ceo-cockpit-console.js`, `lib/ceo-bootstrap-console.js` | `0.14.4` |
| **Swarm runtime** — orchestrator→workers→synthesizer, executed only via `sandbox-run`, truthful per-task telemetry; eligibility gate blocks unrunnable Play | `lib/orchestration-agent-swarm.js`, `lib/workspace-swarm-proposal.js` | swarm `0.14.1` |
| **Agent Outcome Loop** — every lane emits one secret-redacted receipt; `GET /agent-outcomes` returns stream + governance summary; rejections carry `repairPlan[]` | `app/api/workspace/agent-outcomes/route.js`, `lib/workspace-outcome-receipts.js` | Control Plane `0.14.2` |
| **Governed Application Control Plane** — `app-surface` rows; `GET /apps` derives per-app health/blockers/next-action/assignment packet + filesystem-detected surfaces; app-scope enforced | `app/api/workspace/apps/route.js`, `lib/workspace-app-registry.js` | `0.14.2` |
| **Workspace Map** — read-only canvas derived from `buildWorkspaceMetadataStore → buildWorkspaceMetadataGraph`; full edge taxonomy (*widget→object*, *node reads/writes object*, *run produced artifact*); deterministic edge ids | `lib/workspace-metadata-graph.js`, `app/data-model/components/WorkspaceDataModelCanvas.jsx` | facelift `0.14.8` |
| **Live run deltas** — per-node status streamed as NDJSON from `sandbox-run`, pure never-throws deriver | `lib/orchestration-node-status.js`, `lib/orchestration-graph-runner.js` | `0.14.8` |
| **Unified API Resolver Registry** — each `api-registry` record correlates to its resolver; cockpit *constructs* the resolver from the tested response shape; addressable `/api/resolvers/<id>`; artifacts are projections (CI drift guard) | `lib/unified-resolver-registry.js`, `lib/resolver-constructor.js` | `1.5.1` |

### 2.2 CLI surface (the reconciler — the Recursive Mirror's actual engine)

| Capability | Where it lives | Maps to thesis phase |
| --- | --- | --- |
| **Fleet drift + heal-plan engine** — `fleet view/drift/drift-summary/policy/approvals/agent-plan`; per-fork artifact/path-level drift; agent-led heal plan document | `cli/src/commands/fleet.ts`, `cli/src/fleet/{summary,drift-summary,approvals,agent-plan}.ts` | **Phase 1** (`plan`) foundation |
| **Fork↔upstream drift + PR** — `workspace upstream check/heal/pr` → drift state, `healCommand`, `prCommand`, `blockingIssues`, `safeNextActions`; `kit fork heal` syncs + pushes branch/PR; `kit fork status` returns `fileDrifts[]` | `cli/src/commands/workspace-upstream.ts`, `cli/src/commands/kit-fork.ts`, `cli/src/kits/fork-sync.ts` | **Phase 3** (`capture`) machinery |
| **Intent→graph planner (propose-only)** — *"generates/refines workflow graphs from intent + contract truth… Planner does NOT execute, outputs graph suggestions only"*; deterministic single-node fallback | `cli/src/runtime/native-intelligence/planner.ts` | **Phase 2** (`patch`) core |
| **Workspace helper (8 intents)** — online `helper/query → apply → receipts` over a running workspace; intents incl. `repair`, `edit_view`, `register_api`, `swarm` | `cli/src/commands/workspace-helper.ts`, `app/api/workspace/helper/*` | **Phase 2** (`patch`) apply lane |
| **Self-improving proposals + health** — capability proposals from runs; kit health report | `cli/src/runtime/self-improving/{proposals,health}.ts`, `cli/src/commands/workspace-improve.ts` | **Phase 2/3** loop |
| **Offline config read** — CLI reads exported `growthub.config.json` directly (status/qa/surface/portal/resolvers) | `cli/src/commands/workspace-{status,qa,surface,portal,resolvers}.ts` | **Phase 1/2** (static analysis) |
| **Live control-plane boot** — `growthub run` starts `@paperclipai/server` (the live runtime exposing `GET /api/workspace`) | `cli/src/commands/run.ts` | **Phase 3** (`capture` live read) |
| **Deploy wire** — `workspace deploy check/vercel/status`; Bridge-authority credential resolution → Vercel; agent execution stays hosted | `cli/src/commands/workspace-deploy.ts`, `WORKSPACE_DEPLOY_FLOW.md` | all phases (ship step) |

**The one honest gap in the whole thesis:** there is **no MCP server** anywhere in
`cli/src`, `server/src`, or `packages` (verified absent). Phase 4 (`serve --mcp`) is genuinely
net-new — but it queries substrate that already exists (metadata graph, contract SDK, skills
catalog), so it is additive, not a parallel runtime.

---

## 3. Missing Extension — four honest categories (no blurring)

| Frontier | Classification | Evidence (substrate present / reach ends) |
| --- | --- | --- |
| Per-app **ship-readiness** rollup | **Partially Exists** | signals ship (`apps/route.js` health, `env-status.js`, swarm eligibility, `deploy check`), no deriver composes them into one app-scoped score |
| **Blast-radius** (reverse dependency) query | **Partially Exists** | `workspace-metadata-graph.js` encodes every edge + the Map renders them; no reverse-traversal "if I change X, what goes stale" surfaced or fed into preflight |
| **Causal `plan`** across apps/fleet (pre-merge) | **Partially Exists** | `growthub fleet drift` rolls up path-level drift across forks; it computes drift, **not downstream causal impact** of a proposed change |
| Offline file-based **`patch`** (intent→JSON pointer→PR) | **Partially Exists** | the planner does intent→graph propose-only, the helper does intent→apply **online**; neither edits the **exported file offline** and opens a PR |
| **Live↔repo reconciliation** (`capture --drift`) | **Partially Exists** | fork↔upstream drift→PR machinery is complete; the **live-control-plane↔repo** axis (3-way merge of `GET /api/workspace` ↔ repo `growthub.config.json` ↔ git history) is not wired |
| **MCP context server** (`serve --mcp`) | **Missing** | no MCP server exists; metadata graph + contracts + skills catalog are the real queryable substrate it would expose |
| **Cross-fleet causal topology** | **Missing** | `growthub fleet` is per-fork health/drift; no graph unions the per-fork metadata graphs into one causal map |

Everything except the last two is recoverable as a **projection or an offline composition of
existing primitives** — no new runtime, no new mutation path.

---

## 4. Strategic Direction — two coordinated surfaces, one compounding stack

The Recursive Mirror is realized by advancing **two surfaces in lockstep**: the **workspace-app
projections** (what the running organism shows) and the **CLI compiler weapons** (what edits and
reconciles the DNA). They share one spine — the **metadata graph** — so a deriver built once is
reused by both the Map (UI) and `plan`/`serve` (CLI).

```
                       ┌──────────────────────────────────────────────┐
   metadata graph  ───►│  S2 blast-radius deriver (pure, build once)   │───► reused by:
 (already shipped)     └──────────────────────────────────────────────┘     • Workspace Map panel (UI)
                                                                              • patch/preflight warning (route)
                                                                              • growthub plan (CLI)
                                                                              • serve --mcp tool (CLI)

 SURFACE A — workspace-app projections          SURFACE B — CLI compiler weapons (the Mirror)
   A1 Agent Team hierarchy + review               B1 growthub plan   (causal pre-merge impact)
   A2 blast-radius on Map + preflight   ◄── share ──►  B2 growthub patch  (offline intent→JSON→PR)
   A3 app ship-readiness score                     B3 growthub capture (live↔repo 3-way reconcile)
   A4 portfolio CEO (fleet rollup)                 B4 growthub serve --mcp (query the DNA)
```

**Ordering principle (inherited verbatim):** read-only projections first (zero-risk, data
already exists) → smallest backwards-compatible mutation → reconciling/reach-extending capstone.
Read before write. Eligibility, not flags. **The terminal/PR is the power center; the UI is the
eyes** — so the CLI weapons that prove the thesis (B1–B4) ship `--json` first, no UI required.

---

## 5. Phased Implementation — compounding sprints (no timelines)

### Sprint S1 — The shared spine: blast-radius deriver (do this first; everything reuses it)

A single **pure** function over the existing metadata graph: given a node id (object / field /
widget / workflow node), return the downstream set that goes stale, by reverse-walking the edge
taxonomy already defined in `workspace-metadata-graph.js` (reverse of `bindsToObject`,
`usesField`, `readsObject`/`writesObject`, `containsWidget`). Deterministic edge ids ⇒ results
diff cleanly. **This is the atom B1, B4, A2 all consume** — build it once, in a place both the
app and the CLI can import.

- *App side (A2):* render the stale set on Workspace Map node selection; feed the same deriver
  into helper `explain` and the **existing** `patch/preflight` so an edit's blast radius is
  reported *before* the write, recorded as an `AgentOutcomeReceipt`.
- *Substrate:* `lib/workspace-metadata-graph.js`, `lib/workspace-metadata-selectors.js`,
  `app/data-model/components/WorkspaceDataModelCanvas.jsx`, `app/api/workspace/patch/preflight/route.js`.

### Sprint S2 — `growthub plan` (the thesis-proving weapon; ship `--json` + PR check only)

Extend the **existing** `growthub fleet`/`workspace-surface` engine with a causal layer:
`growthub plan --app <id>` (intra-workspace) loads the offline `growthub.config.json`, builds
the metadata graph (S1), and for a proposed change reports the downstream stale set
(*"changing baseUrl of API Registry X → 3 widgets + 1 dashboard go stale"*). `growthub plan
--fleet` unions per-fork graphs for the inter-fork view. **No UI** — `--json` + a GitHub Action
that comments the causal chain on the PR. This is the "make the terminal the power center" move,
grounded in the fleet engine that already rolls up drift.

- *Substrate:* `cli/src/commands/fleet.ts`, `cli/src/fleet/*`, `cli/src/commands/workspace-surface.ts`,
  the S1 deriver lifted to a CLI-importable module. *Reality note:* `--fleet` causal union is the
  one genuinely new graph (the "Missing" cross-fleet topology) — gate it behind `--fleet` so the
  zero-risk intra-app `plan` ships first.

### Sprint S3 — `growthub patch` (offline intent→JSON-pointer→PR)

The planner already does intent→graph propose-only (`native-intelligence/planner.ts`); the
helper already does intent→apply online. `patch` is the **offline** composition: load the
exported `growthub.config.json`, map natural language to exact JSON pointers, validate against
the workspace schema (`validateWorkspaceConfig`), run `plan` (S2) to attach the blast radius,
and **open a PR** — never a private write. Online apply still flows through `helper/apply`; the
new capability is editing the **repo artifact** deterministically and reviewably.

- *Substrate:* `cli/src/runtime/native-intelligence/planner.ts`,
  `cli/src/commands/workspace-helper.ts`, `cli/src/commands/workspace-upstream.ts` (reuse its
  PR-open path), `validateWorkspaceConfig`.

### Sprint S4 — `growthub capture --drift` (live↔repo 3-way reconcile)

The fork↔upstream drift→PR machinery is complete; `capture` adds the **live↔repo** axis. With
`growthub run` up (the live control plane, `run.ts` → `@paperclipai/server`), read `GET
/api/workspace` (live), diff against repo `growthub.config.json` and git history, 3-way merge,
and open a *"reconcile live drift"* PR with the full audit trail — reusing `kit fork heal`'s
PR-open + trace path. Kills config drift without ever making the CLI a write authority over live
state (it captures *into* the repo; promotion back to live stays on the governed PATCH/publish
lanes).

- *Substrate:* `cli/src/commands/kit-fork.ts`, `cli/src/kits/fork-sync.ts`,
  `cli/src/commands/run.ts`, `GET /api/workspace`.

### Sprint S5 — App ship-readiness score (A3) + portfolio rollup (A4)

`deriveAppReadiness` composes existing signals (`apps/route.js` health, `env-status.js`,
swarm eligibility, draft/publish proof, `deploy check` shape) into one app-scoped
`{ ready, blocking[], nextAction }` (eligibility-style, no flags), surfaced in the apps lens and
as an **optional** `readiness?` field on `GET /api/workspace/apps` (additive, version stays `1`).
`growthub fleet` then rolls readiness across forks — the portfolio CEO view, the same
Causation-ITT shape (`state → eligibility → guidance → action`) the single-workspace cockpit
already uses.

### Sprint S6 — `growthub serve --mcp` (capstone; the DNA as a queryable context engine)

Net-new but additive: a local MCP server that exposes the **already-derived** truth as tools —
`get_workspace_topology` (the metadata graph), `find_downstream_dependencies` (S1 deriver),
`simulate_causal_impact` (S2 `plan`), `list_contracts` (the `@growthub/api-contract` SDK +
skills catalog). Read-only; it answers *"if I remove this endpoint, what breaks?"* from static
JSON without touching the network. This is last because it is only valuable once S1–S2 expose
clean, importable derivers — which they now would.

- *Substrate:* the S1/S2 derivers, `packages/api-contract`, `cli/src/skills/catalog.ts`.
  *Honesty:* this introduces an MCP dependency that does not exist today — flag it explicitly as
  net-new in the PR, keep it an opt-in subcommand, no change to any existing command.

---

## 6. Exact File Edits (additive only; Phase-A source)

> Every edit is **Phase-A source-only** (`MONOREPO_PROVENANCE_MAP_V1.md`): `cli/src/**` and/or
> `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/**` (+ tests +
> lockstep version bump). **Never edit `cli/dist/**`** — flag *"dist rebuild required in Phase B."*
> `growthub kit download …` must keep producing the byte-identical frozen artifact.

| Sprint | Modify | Add | Test |
| --- | --- | --- | --- |
| **S1** | `WorkspaceDataModelCanvas.jsx`, `app/api/workspace/patch/preflight/route.js` | `lib/workspace-metadata-impact.js` (deriver, importable by app + CLI) | `scripts/unit-workspace-metadata-impact.test.mjs` |
| **S2** | `cli/src/commands/fleet.ts`, `cli/src/index.ts` (register `plan`) | `cli/src/commands/workspace-plan.ts`, `.github/workflows/plan-impact.yml` | `cli/src/__tests__/workspace-plan.test.ts` |
| **S3** | `cli/src/index.ts` (register `patch`) | `cli/src/commands/workspace-patch.ts` (planner + pointer-map + PR open) | `cli/src/__tests__/workspace-patch.test.ts` |
| **S4** | `cli/src/index.ts` (register `capture`) | `cli/src/commands/workspace-capture.ts` (3-way merge + PR) | `cli/src/__tests__/workspace-capture.test.ts` |
| **S5** | `app/api/workspace/apps/route.js` (optional `readiness?`), `WorkspaceLensPanel.jsx`, `packages/api-contract/src/workspace-apps.ts`, `cli/src/fleet/summary.ts` | `lib/workspace-app-readiness.js` | `scripts/unit-workspace-app-readiness.test.mjs` |
| **S6** | `cli/src/index.ts` (register `serve`) | `cli/src/commands/serve-mcp.ts`, `docs/MCP_CONTEXT_SERVER_V1.md` | `cli/src/__tests__/serve-mcp.test.ts` |

Per-file law: each new `lib/*.js` is a **pure deriver** (no React/fetch/fs/writes) mirroring
`ceo-cockpit-console.js`; each route edit is **additive optional output**; each new CLI command
ships **`--json` first**; every mutation is **a PR or a governed call**, never a side channel.

---

## 7. Runtime Implications

- **Authority unchanged.** No weapon adds an executor or a live write path. `patch`/`capture`
  mutate the **repo** (PR); promotion to live stays on PATCH/`workflow/publish`. Agent Teams
  still never execute; execution stays in `sandbox-run`; app-scope still gates every route.
- **Offline-first.** `plan`/`patch` operate on the exported `growthub.config.json` the CLI
  already reads — no container, no live network. `capture`/`serve` read live/contract truth but
  never mutate it.
- **Deploy untouched.** S5 *reads* the `deploy check` shape; the Bridge→Vercel wire is unchanged.
- **MCP is opt-in.** S6's server is a new subcommand; absence ⇒ today's behavior exactly.

## 8. Validation Requirements

- Per-deriver/per-command unit tests as tabled; mirror `scripts/unit-ceo-cockpit-console.test.mjs`
  and `scripts/unit-orchestration-node-status.test.mjs`.
- Patch-policy probes (`scripts/e2e-workspace-patch-policy-probe.mjs`) and
  `scripts/check-resolver-registry.mjs` stay green — S1's preflight edit is exercised there.
- `bash scripts/agent-dist-verify.sh pre-push` (six gates) + `pnpm freeze:check` around every
  change; CI `smoke`/`validate`/`verify` + `node scripts/release-check.mjs` before merge.
- Contract version literal stays `1`; `pnpm check:monorepo-boundary` stays clean.
- S2's GitHub Action runs `growthub plan --json` against the PR head only — no write scope.

## 9. Anti-Patterns (what makes an item wrong by construction)

- Widening the `PATCH /api/workspace` allowlist, bumping the contract version, or inventing a
  third mutation/execution path.
- Making `patch`/`capture` write to live state directly — they open PRs; live promotion stays governed.
- Building a second dependency model beside the metadata graph (S1 reverse-traverses the existing one).
- Pretending a monorepo-of-workspaces exists — the real axes are app-scope (intra-workspace) and
  fleet-scope (inter-fork); build there.
- Shipping `serve --mcp` as a parallel runtime — it is a read-only projection of derivers that
  already exist; it owns no state and no execution.
- Editing/committing `cli/dist/**`, or breaking the frozen exported-artifact byte-identity.
- Calling any of this "fleet observability." The user-facing primitive is **Agent Teams** with
  the CEO Cockpit as the operating surface; rollups are how a team's work is *shown*.
</content>
