# AWaC Direction And Evolution V1 — the trajectory through 0.14.14

This document synthesizes the release arc that culminates in `0.14.14` (the
marketplace-provider release) and articulates the explicit direction the
platform is on. It is a direction map, not a contract: the authoritative
contracts remain [`AGENTS.md`](../AGENTS.md),
[`docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md`](./GOVERNED_WORKSPACE_TOPOLOGY_V1.md),
and the per-release freeze/topology docs linked below.

Everything described here was agentically coded, and every surface is built
agent-human native: the same governed rows, receipts, and derivations power
both the no-code browser experience and the agent operating loop. That is not
a delivery anecdote — it is the design constraint that explains the shape of
every release in the arc.

---

## The one-sentence direction

Growthub Local is evolving from a workflow builder into a **governed
operating control plane for a business stack** — a workspace-as-code system
where external SaaS capabilities, executions, deployments, and data all
become inspectable, forkable, proof-backed workspace artifacts that humans
operate through the browser and agents operate through the same governed
doors.

The compounding rule behind every release is the AWaC product rule:

```text
state -> eligibility -> guidance -> action -> evidence -> next state
```

Each release widens what "state" can be (sites, swarms, browsers, schedules,
inbound events, deployments, databases, buckets, API integrations) without
ever weakening the rule that state must be **derived from persisted
evidence**, never asserted by optimistic UI or agent claims.

---

## The release arc, read as one trajectory

The shipped ladder (see `README.md` "Current shipped reality" for the frozen
per-release wording):

| Release | What it added | What it really was |
| --- | --- | --- |
| 0.13.9 | Codex Sites primitive | External surfaces become governed Data Model rows |
| 0.14.0 | Governed creation cockpit | Tested API rows → resolvers → data sources → lens evidence: the **creation loop** |
| 0.14.1 | Governed agent swarm cockpit | Multi-agent execution becomes truthful, thread-bounded, receipt-backed |
| 0.14.2 | Governed sandbox browser access | Browser capability flows through the graph as a governed grant |
| 0.14.4 | Workspace CEO Primitive | Oversight becomes a cockpit: history, teams, proven loops |
| ~0.14.5–7 | Unified Resolver Registry (contract 1.5.x) | Every API Registry record gets an addressable, generated, drift-guarded endpoint |
| ~0.14.8–9 | UI/UX facelift, Workspace Map, live run deltas | The no-code surface catches up to the governed substrate |
| 0.14.10 | Causal derivation intelligence + governed MCP console | Agents get **read + dry-run + governed hand-off** over the whole graph; MCP never mutates |
| 0.14.12 | Governed serverless scheduler | Time becomes a governed trigger lane |
| 0.14.13 | Governed inbound + Vercel/GitHub deployment | External events and production deployment close the **invocation/deployment loop** |
| 0.14.14 | Supabase + Nango marketplace providers | External databases, storage, and API integrations close the **capability/persistence loop** |

Read top to bottom, the arc is not a feature list. It is the same loop being
closed at successively larger radii:

1. **Creation loop** (0.14.0) — a tested API response becomes a governed data
   source with evidence.
2. **Execution loop** (0.14.1–0.14.4) — agents and swarms run inside the
   workspace with truthful telemetry and oversight.
3. **Intelligence loop** (0.14.10) — the workspace can explain itself:
   staleness, impact, lineage, readiness, blast radius — and agents consume
   that explanation before acting.
4. **Invocation/deployment loop** (0.14.12–0.14.13) — real-world triggers
   (schedules, webhooks, API requests) enter through verified doors, and the
   workspace app itself deploys to production with proof written back.
5. **Capability/persistence loop** (0.14.14) — external systems (Postgres,
   object storage, any Nango-connected API) install as governed capabilities
   with durable rows and receipts.

Composed, they form the loop the platform is explicitly building toward:

```text
real-world event
  -> governed workflow execution
  -> provider-backed capability call
  -> durable state/file persistence
  -> receipt/proof
  -> UI + agent readback
  -> next governed action
```

A workflow builder runs tasks. An operating control plane **accumulates
verified operational reality**. The arc is the transition from the former to
the latter.

---

## What 0.14.14 makes explicit

### The marketplace is a capability installer, not a plugin shelf

A provider connect + product install now means: *"this workspace has this
capability, verified at this time, with these env refs, this execution lane,
and this proof."* The durable artifact is the governed API Registry row —
infrastructure metadata other surfaces derive behavior from:

- `/settings/apps` derives external links/icons from governed rows
- Workflow Canvas offers provider-backed actions
- Data Model binds external records
- Resolver Registry exposes callable endpoints per record
- Lens/cockpit surfaces explain readiness and blockers
- Agents read the rows and know what is real

### The provider/product split is the scaling grammar

- **Provider account** = "the workspace can authenticate against this
  platform" (`supabase-provider`, `nango-marketplace-provider`).
- **Product install** = "this specific capability is now available"
  (`supabase-postgrest`, `supabase-storage`, `nango-<providerConfigKey>`).
- **Live discovery** = the product list can come from the provider account
  itself. Nango's GitHub integration is not a hardcoded fake product — it is
  discovered from the connected account, then promoted into a governed row.

### Lane dispatch is how capability diversity stays governable

Products declare an execution lane instead of forking the marketplace:
`workspace-data` (Supabase Postgres), `workspace-storage` (Supabase
Storage), `workspace-integrations` (Nango), alongside the existing
deployment, scheduler, and inbound lanes. New capability *kinds* land as new
lanes on the same grammar — not as parallel subsystems.

### Honesty is a load-bearing feature

Missing credentials produce `setup-needed` / blocked outcomes with receipts —
they never delete rows or fake success. Publish gates stay locked until fresh
proof matches the active draft (the workflow sidecar's Connect → Bind → Test
→ Go live path with its `Verified 200` badge is the visible form of this).
Storage proof is recorded without exposing secrets; rows and payloads carry
env-ref **names**, never values. This is what makes the substrate safe for
agents: an agent cannot honestly claim a capability that has no verified row.

---

## Agent-human native: one substrate, two operators

Every release in the arc ships both halves of the same surface:

| The human gets | The agent gets | Shared substrate |
| --- | --- | --- |
| No-code marketplace install path (Install → Setup → Login/Auth → Sync) | Provider/product readiness derivation and governed sync doors | API Registry rows + receipts |
| Workflow sidecar with Test/Go-live gates | Publish gate that rejects stale proof | Workflow rows + proof stamps |
| Apps page external links and icons | Row-derived app-surface truth | Governed app/vercel-project rows |
| Lens/cockpit readiness explanations | MCP console: read, dry-run, governed hand-off | Causal derivation graph |
| Trust that UI state is real | No fake-success loops | Evidence-derived state, everywhere |

The operating philosophy is frozen in
[`docs/OPERATING_THE_GOVERNED_UNIVERSE_V1.md`](./OPERATING_THE_GOVERNED_UNIVERSE_V1.md):
**agents propose, the platform governs, the graph understands.** The
marketplace release extends that to external SaaS: agents no longer ask users
to paste routes, keys, or table names into open fields — they read governed
rows and know which providers are connected, which products are installed,
which lanes they support, what is blocked, and which next action is allowed.

---

## The evolution mechanics (why the arc compounds)

The trajectory is not just *what* ships but *how* it keeps shipping:

1. **A playbook, not a codebase memory.**
   [`docs/MARKETPLACE_PROVIDER_PLAYBOOK_V1.md`](./MARKETPLACE_PROVIDER_PLAYBOOK_V1.md)
   makes the next provider (Neon, PlanetScale, Stripe, any SaaS) a
   grammar-following exercise at Supabase/Vercel parity: source-truth recon
   first, one-place provider definition, governed rows, receipts, tests, and
   mandatory real-browser closed-loop QA. The integration surface scales by
   repetition of a proven shape, never by invention of side paths.
2. **Additive contracts.** New capability arrives as new lanes, new row
   kinds, new receipt kinds, and additive SDK exports
   (`@growthub/api-contract`) — existing behavior is never repointed.
3. **CI as the release conscience.** Focused gates per provider (Nango,
   Supabase, Vercel, storage, hardening) plus source-truth tests that read
   route/page files and assert the contract survives refactors.
4. **Docs as frozen truth.** Each release lands a freeze/topology doc so the
   next agent extends from recorded reality instead of memory — this
   document included.
5. **The workspace artifact stays the product.** Every new capability lands
   as rows, receipts, config, and files inside the exportable workspace, so
   the whole accumulated reality remains forkable and inspectable.

---

## Where the trajectory points

Directional reading of the arc (not commitments; contracts win over this
list):

- **More official providers through the playbook** — the provider grammar +
  live discovery + lane dispatch make each new SaaS integration cheaper than
  the last; Nango's live-discovered products turn one provider connect into
  a whole catalog of governed API capabilities.
- **Capability-consuming surfaces deepen** — installed rows increasingly
  drive Workflow Canvas actions, Data Model bindings, resolver endpoints,
  and cockpit/lens readiness, so an install immediately becomes usable
  everywhere the workspace reasons.
- **Agents as capability operators** — with the MCP console for
  understanding and governed doors for mutation, agents move from "help me
  configure" toward "inspect the rows, propose the install, prove the
  outcome" — always through Law, never around it.
- **The compound loop as the product** — external event → serverless action
  → external system/data/storage → governed memory → agent-readable truth →
  repeat. Each future release should be legible as tightening or widening
  this loop.

The destination the arc keeps pointing at: the workspace as the **operating
system for a business stack** — where connecting a database, a bucket, a
deployment target, or an integration hub yields governed records, durable
receipts, and proof-derived UI that both a human and an agent can trust and
act on next.
