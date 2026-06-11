# GTM Engine Roadmap V1 — Targeted Outreach From the Twenty CRM Relationship Graph

Scope (final): how to **safely leverage a large, enriched Twenty CRM database of high-quality
1st-degree connections** for targeted outreach and follow-ups, deploying agents in a way that
**never puts the main LinkedIn profile at risk** — grounded exclusively in this repo's shipped
capabilities (`0.14.0` / `0.14.1` + `growthub-twenty-crm-v1`).

**Explicitly out of scope:** lead finding, enrichment, verification, and the email
infrastructure pipeline — all already running in their own advanced workspaces outside this
repo. This document assumes the asset already exists and addresses only the question of how
agents extract conversations from it without endangering it.

Anchored releases: `0.14.0` governed API creation cockpit, `0.14.1` governed swarm cockpit
([`GOVERNED_CREATION_RELEASE_SNAPSHOT_V1.md`](./GOVERNED_CREATION_RELEASE_SNAPSHOT_V1.md),
[`GOVERNED_SWARM_RELEASE_SNAPSHOT_V1.md`](./GOVERNED_SWARM_RELEASE_SNAPSHOT_V1.md),
[`SWARM_RUN_CONTRACT_V1.md`](./SWARM_RUN_CONTRACT_V1.md)). `0.14.2` is not yet published.

---

## First principles

Two facts about the asset dictate the entire architecture:

1. **The 1st-degree graph is irreplaceable.** Years of relationship-building cannot be rebuilt
   if the main profile is restricted. No throughput gain is worth any probability of losing it.
   LinkedIn restricts accounts for automated session activity (headless browsers, injected
   clients, inhuman send patterns) — and it does **not** restrict a human sending a normal
   day's worth of messages to people already in their network. 1st-degree messaging needs no
   InMail credits and no connection requests: the highest-conversion channel that exists is
   also free and unrestricted, *provided a human sends*.
2. **Sending was never the bottleneck.** Against a large enriched 1st-degree graph, the real
   constraints are **selection** (who, this week, and why), **personalization** (the actual
   relationship and signal, not a template), and **follow-up memory** (nothing slips). All
   three are CRM-side problems — which means all three are safely automatable, because the CRM
   has an official API and the workspace has a governed way to operate it.

Therefore the one architectural law of this engine:

```text
AGENTS OPERATE THE CRM.            HUMANS OPERATE LINKEDIN.

Twenty GraphQL/REST API            main-profile DMs, by hand
(read → rank → draft →             (20–30 min/day from a
 queue → write back)                ranked, pre-drafted queue)
```

Agents never hold the LinkedIn session, never automate a browser against the main profile,
never auto-send a DM. The interface between the two sides is a **governed touch queue**:
agent-ranked, agent-drafted, human-transmitted, agent-logged. This is not a compromise — it is
the propose→apply pattern the platform already enforces everywhere, applied to the one surface
where the blast radius is a relationship graph instead of a config file.

---

## What the repo already ships for exactly this

| Capability | Where | Role here |
|---|---|---|
| Twenty CRM operator kit | `cli/assets/worker-kits/growthub-twenty-crm-v1` | The methodology layer: `templates/api-query-plan.md` (named GraphQL/REST queries over Person/Company/Opportunity), `templates/webhook-integration-spec.md` (Twenty workflow-engine outbound webhooks), `templates/custom-object-design.md`, `templates/pipeline-automation-brief.md`, `docs/api-and-webhooks.md`, `docs/data-model-layer.md` |
| Kit operating modes | `kit.json` / `skills.md` — `cloud / self-hosted / local-fork / agent-only` | The safety ladder: agents can plan in `agent-only` mode before ever holding a key |
| Governed API creation cockpit | `0.14.0` — registry row → server-side test → response profile → Data Source → scheduled source-record refresh | Twenty's API enters as evidence-backed, governed workspace state; a broken or over-scoped key is visible before any swarm uses it |
| Governed swarm cockpit | `0.14.1` — `swarm.run.propose` → reviewed apply → `swarm-workflows` row → `sandbox-run` → run history, truthful per-agent telemetry, budgets, Stop, thread-bounded Background Tasks | Every ranking/drafting/write-back loop is a governed row with receipts |
| Helper proposal types | `packages/api-contract/src/helper.ts` — `dataModel.object.create/row.add`, `dashboard.create`, `swarm.*` | The touch-queue object, the operator dashboard, and the swarms themselves are reviewed applies |
| Aggregate-first lenses | `0.13.8` Workspace Lens; rollup design proven on 18k+ row workspaces | The giant DB renders as rollups + a daily queue, never as a 20k-row scroll |

---

## Tier 0 — Wire the CRM in, read-only first

### 1. Register the Twenty API as a governed, read-scoped Data Source

- **Atomic action.** One `0.14.0` cockpit pass: API Registry row for the Twenty GraphQL
  endpoint using a **read-scoped API key**, server-side test, response profile, Data Source,
  scheduled refresh. Named queries come straight from the kit's `api-query-plan.md` pattern
  (e.g. *people by last-activity*, *open opportunities by stage with point-of-contact*,
  *companies by recent change*).
- **Safety property.** A read-only key makes the worst possible agent mistake a wasted query.
  Agents learn the data model with physically zero write risk to the irreplaceable DB.

### 2. Mirror the working set, not the database

- **Atomic action.** Refresh only decision-relevant slices into source records: ICP-matching
  1st-degrees, opportunities in motion, rows with fresh activity signals. The giant DB stays
  authoritative in Twenty; the workspace holds a current working set, surfaced aggregate-first.
- **Why.** Selection quality degrades when the whole graph is in view. The engine's job is to
  produce a *short* queue from a *large* graph.

---

## Tier 1 — The targeting brain (where agent leverage actually lives)

### 3. Signal-ranking swarm → the governed touch queue

- **Atomic action.** One helper prompt → `swarm.run.propose` → a `swarm-workflows` row whose
  agents read the mirrored working set and emit a **ranked daily queue of 10–25 people**, each
  with the reason attached: role or company change, opportunity stage, recency of last real
  interaction, engagement signal carried on the enriched row. Output is rows in a `touch-queue`
  object (`dataModel.object.create` + `row.add` through the apply gate) — never a sent message.
- **First-principles rationale.** Against a high-quality 1st-degree graph, *who and why* is
  90% of conversion. A correct queue of 15 beats a mediocre queue of 100, and 15/day is
  squarely human-normal sending behavior — the rank step is what keeps the human lane safe
  *and* effective at once.

### 4. Draft swarm — personalized 1st-degree messages + planned follow-up

- **Atomic action.** Same pattern: for each queued row, a drafted message that references the
  actual relationship and the actual signal (never a template blast — these people already
  know you), reply-seeking, no pitch on first touch, plus a planned follow-up cadence stamped
  on the row. Drafts render in the thread-bounded Background Tasks cockpit for review.
- **Control.** Truthful telemetry prices every draft batch; `budgetMonthlyCents` caps the
  spend; run history keeps every draft auditable.

---

## Tier 2 — The human transmission lane (the only step that touches LinkedIn)

### 5. The 20–30 minute operator loop

- **The loop.** Open the queue → read rank + reason + draft → send by hand from the main
  profile → mark sent. That's the entire LinkedIn surface area of this engine.
- **Hard rules (the profile-safety contract).**
  - Agents never hold LinkedIn credentials, cookies, or sessions.
  - No browser automation against linkedin.com with the main profile — not headless, not
    "assisted", not once.
  - Volume stays human-normal (the queue is capped by design at 10–25/day).
  - 1st-degree messaging only; no automated connection requests, no scraping with the main
    session.
- **Why this wins anyway.** The human spends minutes on transmission because agents already
  did the hours of selection, context recall, and drafting. Sending was never the bottleneck.

### 6. Write-back, graduated

- **Atomic action.** Sent/replied/booked outcomes flow back as governed writes, in trust
  stages: **(a)** workspace-side `touch-queue` row updates only (zero CRM write risk);
  **(b)** once stable, scoped Twenty mutations through the same propose→apply gate — activity
  logs, notes, follow-up dates, per the kit's `pipeline-automation-brief.md` — never
  destructive fields, never deletes, with the write-scoped key limited to those objects.
- **Why graduated.** The DB is the asset. Write authority is earned with receipts, mirroring
  the kit's own mode ladder (`agent-only → read → scoped write`).

---

## Tier 3 — Follow-up memory (where most of the yield is)

### 7. Follow-up swarm on row deltas

- **Atomic action.** A swarm row that reads `touch-queue` / CRM deltas — follow-up date due,
  reply received, opportunity stage moved — and surfaces each due item with a drafted next
  touch in the same cockpit. Post-call follow-ups require call notes and ask when missing
  (the kit formats forbid fabricated context). Most replies in any outreach motion come from
  disciplined touches 2–4; in a warm graph the discipline *is* the engine. The CRM is the
  memory; the agent is the discipline.

### 8. Event-driven triggers via Twenty webhooks

- **Atomic action.** Per the kit's `webhook-integration-spec.md`, Twenty's workflow engine
  emits outbound webhooks on the events that matter (stage change, new activity on a tracked
  person/company) → registered through the 0.14.0 cockpit → wakes the ranking/follow-up swarms.
  The engine becomes reactive to real relationship events instead of polling the whole graph.

---

## Tier 4 — Let the agents learn, without ever risking the asset

### 9. The evidence loop

- Reply rate **by signal type** (role change vs. opportunity stage vs. engagement), measured
  from write-back rows, feeds the next ranking run: the targeting brain improves on receipts,
  not vibes. Run history, per-task telemetry, and the observability rollup
  (healthy / failing / never-run) keep every iteration inspectable; a failing swarm reads as a
  blocked state, not a silent gap in follow-ups.
- One operator dashboard (`dashboard.create` + `widgetType.bind`): queue depth, sent vs.
  queued, reply rate by signal, follow-ups due vs. completed, conversations started/week,
  opportunity progression.

### 10. Identity expansion stays off the main profile — permanently

- If automated social *sending* is ever added, it runs only through official APIs on owned
  surfaces (e.g. the Zernio kit's platform APIs for pages/accounts built for automation) or
  separate non-critical identities. The main profile's role in this architecture is fixed and
  final: a human, a queue, and 20 minutes a day.

---

## Sequencing

1. **Items 1–2** — read-only wire-in; agents learn the graph with zero write risk.
2. **Items 3–5, same week** — ranked queue + drafts + the human loop: conversations start
   within days of wiring, with the profile untouched by automation.
3. **Item 7** — follow-up memory; the largest yield multiplier on a warm graph.
4. **Items 6, 8** — graduated write-back, then event-driven triggers.
5. **Items 9–10** — the evidence loop compounds targeting quality run over run.

The through-line: **the asset is the relationship graph, and the architecture exists to make
it more productive while making it impossible for an agent to endanger it** — agents do
selection, context, drafting, and memory through governed CRM-side primitives that already
shipped; the only thing that ever touches LinkedIn is the human it belongs to.
