# GTM and Agent Leverage Framework V1

Synthesized operating framework for converting the governed creation release (v0.14.0) into go-to-market motion, agent fleets, and token-efficient production operation.

This document is the leverage layer on top of:

- [`docs/AGENTIC_WORKSPACE_AS_CODE_OPERATING_FRAMEWORK.md`](./AGENTIC_WORKSPACE_AS_CODE_OPERATING_FRAMEWORK.md) — how to operate the workspace
- [`docs/GOVERNED_CREATION_RELEASE_SNAPSHOT_V1.md`](./GOVERNED_CREATION_RELEASE_SNAPSHOT_V1.md) — what shipped
- [`docs/GOVERNED_CREATION_SPRINT_RETROSPECTIVE_V1.md`](./GOVERNED_CREATION_SPRINT_RETROSPECTIVE_V1.md) — why it shipped this way
- [`docs/CAUSATION_ITT_ELIGIBILITY_DRIVERS.md`](./CAUSATION_ITT_ELIGIBILITY_DRIVERS.md) — the derivation model
- [`docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md`](./GOVERNED_WORKSPACE_TOPOLOGY_V1.md) — the authority boundary

Those documents explain the system. This document explains how to spend the system: where the leverage is, which motions to run first, and how to operate agents against the artifact at the lowest token cost.

## 1. The Compressed Mental Model

Everything in the product reduces to one loop:

```text
artifact -> evidence -> eligibility -> action -> receipt -> next state
```

And one ownership table:

| Layer | Owns | Never owns |
|---|---|---|
| AWaC artifact | the workspace as a whole | nothing outside its folder |
| Data Model | business objects, registry rows, sandbox rows | presentation |
| API Registry | connection and setup | reusable data access |
| Data Source | reusable external data paths | refresh proof |
| Source records | refresh evidence | business state |
| Helper | reviewed proposals and receipts | silent mutation |
| Resolver | response shaping | secrets, authority widening |
| Workflow | execution, draft/test/publish | readiness judgment |
| Workspace Lens | derived readiness and handoff | a second source of truth |

Every GTM story, every agent design, and every internal automation below is just this loop pointed at a different domain. If a proposed feature, demo, or agent does not map onto the loop and the ownership table, it is either noise or a topology violation.

## 2. The Token-Efficiency Doctrine

The release's deepest economic property: it moves intelligence out of inference-time tokens and into artifact-time structure. You pay tokens once to create governed structure; every future run, agent, and human amortizes that cost.

The doctrine, in priority order:

1. **Lens-first reads.** An agent's first action is reading derived readiness, not scanning files. One Lens read replaces an exploration phase. Never let an agent re-derive what the workspace already derives.
2. **Evidence replaces re-verification.** Source records, receipts, test results, and run evidence mean an agent never spends tokens confirming whether something happened. It reads the proof.
3. **Eligibility replaces planning.** The cockpit already computes the next eligible action. Agents should consume eligibility, not generate plans. A plan is a token expenditure; an eligibility read is nearly free.
4. **Receipts replace narration.** Agent output should be the receipt and the changed state, not a transcript explaining the work. The artifact is the report.
5. **Fork replaces generation.** Kits and templates are pre-paid token capital. An agent that forks a kit and patches three fields spends two orders of magnitude fewer tokens than one that generates a workspace from scratch — and the result is governed.
6. **Resolvers shape once.** Response shaping happens at ingestion, in a resolver file. Every downstream agent call then receives normalized records instead of burning context window on raw API envelopes.
7. **Validation replaces model size.** Because propose-then-apply runs everything through the config validator and PATCH boundary, a small cheap model can safely propose. The validator is the safety layer, not the model. Route proposal generation to the cheapest model that passes apply; reserve frontier models for ambiguity resolution.

The compounding rule:

```text
tokens spent creating structure are capital
tokens spent narrating, re-verifying, or re-planning are burn
```

A correctly operated workspace converts almost all agent spend into the first category.

## 3. The GTM Leverage Map

Ranked by leverage divided by effort, given what v0.14.0 actually ships.

### 3.1 The API Wedge (highest leverage, run first)

The single best activation story is now: **"Bring an API. Leave with a governed, refreshing, agent-readable data system — locally, in ten minutes."**

The on-camera demo arc is the cockpit lane itself, and it is already footage-ready because every step produces visible evidence:

1. Create workspace locally (owned artifact, no signup wall).
2. Register an API in the cockpit.
3. Test it server-side; show the response profile.
4. Ask the helper for a resolver; review and apply the proposal.
5. Create the Data Source; show the linkage to the registry row.
6. Refresh; show real records landing in the sidecar (the v0.14.0 smoke proof: 11 records, zero skips, cockpit hides itself).
7. Open Workspace Lens; show readiness derived, not asserted.
8. Export or commit the workspace; show the artifact is portable.

Every competitive alternative either requires hosted signup before value, hides state from inspection, or completes from clicks instead of evidence. The demo should explicitly contrast those three failure modes.

### 3.2 Vertical Kits as Products

Consultants, agencies, and internal platform teams do not buy "a workspace builder." They buy **a packaged, repeatable client deliverable they own**. The kit system makes the artifact itself the SKU:

- Agency client-reporting kit: client objects + reporting API Data Sources + refresh workflows + a Lens the client can read.
- CRM/sales kit: pipeline objects + enrichment Data Sources + follow-up workflows.
- Support triage kit: ticket import Data Source + triage dashboard + escalation workflow.

The GTM motion: publish two or three kits with **real data paths** (not empty templates), each with its own demo footage following the 3.1 arc. The kit registry and fork-authority machinery already exist; the gap is filled exemplars.

### 3.3 The Agent Handoff Packet

For AI-native teams, the pitch inverts: **"Bring your agent. We give it a governed body."** The workspace is the agent's memory, tool belt, and audit trail:

- memory: `.growthub-fork/`, Data Model rows, source records
- tools: API Registry rows, Data Sources, workflows
- audit: receipts, run evidence, trace
- orientation: Workspace Lens

The deliverable to build: a one-page **handoff packet spec** — the minimal Lens-derived state an external agent reads to begin operating safely. This is cheap to produce (it is mostly derivation that already exists) and it is the artifact that makes "AWaC" legible to the agent-framework audience.

### 3.4 Local-to-Hosted as the Monetization Ramp

Local-first is the acquisition motion; hosted authority is the revenue motion. The persistence cockpit already expresses the ramp in product language:

```text
free: local artifact, local runs, local proof
paid: durable persistence, schedulers, hosted authority, team surfaces
```

Never gate the local loop. The upgrade prompt is the workflow persistence cockpit itself — it shows the user exactly which durability they lack, at the moment they want it.

## 4. Agent Fleet Patterns

Four agent archetypes, all running the same loop against different domains. Token cost stays low because every archetype is Lens-first, evidence-gated, and receipt-terminated.

### 4.1 GTM Extension Agents

Operate a marketing/growth workspace. Objects: campaigns, channels, experiments. Data Sources: analytics and ad APIs. Workflows: report refresh, anomaly summaries, launch checklists. The agent's loop:

```text
read Lens -> refresh stale sources -> derive what changed from records
-> propose next experiment/content via helper -> human applies -> receipt
```

The `growthub-marketing-skills-v1` kit and creative pipeline kits are the pre-paid skill capital here.

### 4.2 Sales Agents

Operate a CRM workspace. Objects: accounts, contacts, deals. Data Sources: enrichment APIs, email/calendar imports. Workflows: follow-up sequences, stage-change automations. The governance story is the sales story: every agent touch on the pipeline has a receipt, so the agent can be trusted with real pipeline data. The demo is the receipt trail, not the chat.

### 4.3 Creative Agents

Operate a content-ops workspace. Objects: briefs, assets, campaigns. Workflows: brief -> generation pipeline -> review -> publish, with the video/creative pipeline kits as execution backends. Source records hold generated-asset metadata so downstream agents reason over normalized records instead of re-reading outputs. Helper proposals are the review gate that keeps generation volume from becoming workspace chaos.

### 4.4 Internal Production Agents

Operate an internal ops cockpit. Internal APIs enter through the registry cockpit exactly like SaaS APIs — this is the enterprise wedge. Workflows handle refresh, triage, repair, and escalation. The agents run on a schedule (the persistence upgrade lane), and Lens is the shared command center humans check instead of asking agents "what did you do?"

### 4.5 The Universal Agent Contract

All four archetypes obey the same contract, which is what keeps a fleet coherent:

```text
read Lens before acting
act only through governed surfaces
never complete without evidence
never narrate what a receipt already proves
escalate ambiguity to a human apply step
```

## 5. Sequencing: The Next 90 Days of Leverage

In order, each step funding the next:

1. **Footage.** Record the 3.1 demo arc against the live v0.14.0 exported workspace. This is the cheapest high-leverage asset available right now; the product does the persuading.
2. **Two vertical kits with real data paths** (agency reporting + CRM/sales), each with its own short demo cut.
3. **Agent handoff packet spec** published as a doc + a reference agent that operates a kit end-to-end via the contract in 4.5.
4. **Readiness scoring in Lens** surfaced as a single number/state — the metric that GTM content, onboarding, and agent eligibility all anchor to.
5. **Hosted upgrade lane** marketed only after 1–4 prove the local loop publicly.

## 6. Anti-Patterns (What Would Burn the Leverage)

- Shipping a "magic agent" surface that bypasses the cockpit lanes. It would be cheaper to demo and would destroy the trust thesis.
- Letting Lens accept asserted state. The moment readiness can be set instead of derived, every receipt loses meaning.
- Empty templates. A kit without a real data path teaches users the artifact is decorative.
- Agent narration. Fleets that explain themselves in prose instead of receipts will look impressive in demos and be unaffordable in production.
- Gating local. Any signup wall before the first refreshed source record forfeits the local-first advantage to the next local-first competitor.

## 7. The One-Sentence Theses

- **Product:** Growthub Local is a local-first governed operating system for agentic workspaces, where completion is evidence and the workspace is the artifact.
- **Economics:** Structure is pre-paid intelligence — every governed object, resolver, kit, and receipt converts future agent token burn into amortized capital.
- **GTM:** Sell the loop by showing it close: API in, evidence out, artifact owned, agent ready.
- **Agents:** A fleet stays cheap and safe when every agent is Lens-first, surface-bound, evidence-gated, and receipt-terminated.
