# AWaC Mental Models Bridge V1

Companion to [`docs/GTM_AGENT_LEVERAGE_FRAMEWORK_V1.md`](./GTM_AGENT_LEVERAGE_FRAMEWORK_V1.md) and [`docs/AGENTIC_WORKSPACE_AS_CODE_OPERATING_FRAMEWORK.md`](./AGENTIC_WORKSPACE_AS_CODE_OPERATING_FRAMEWORK.md).

This document draws the mental model behind Agent Workspace as Code by bridging it to the trust technologies civilization already invented. Each bridge is structurally accurate to the v0.14.0 architecture — not decoration — and each yields a concrete design, agent, or GTM implication.

## The One Picture

```text
            OUTSIDE WORLD (APIs, providers, schedulers, hosts)
  ════════════════════ the membrane / customs boundary ════════════════════
                 secrets stay outside rows; slugs cross, keys do not

  ARTIFACT — the owned world-state (the save file)
  ┌────────────────────────────────────────────────────────────────────┐
  │ SENSE    API Registry -> server-side test          (the receptor)  │
  │ DIGEST   resolver shapes the raw envelope          (the enzyme)    │
  │ STORE    Data Source -> source records             (stored energy) │
  │ PROPOSE  helper drafts a reviewed change           (the PR)        │
  │ DECIDE   human apply / publish                     (merge right)   │
  │ ACT      workflow draft -> test -> publish -> run  (legal moves)   │
  │ RECORD   receipts, run evidence, trace.jsonl       (the ledger)    │
  │ KNOW     Workspace Lens derives readiness          (the instrument │
  │                                                     panel)         │
  └────────────────────────────────────────────────────────────────────┘
            every loop pass: evidence in -> eligibility out
```

One sentence: the workspace is a governed organism whose body is a ledger, whose senses are instruments, and whose actions are legal moves — and the whole thing fits in a folder you own.

## The Seven Bridges

### 1. Double-Entry Bookkeeping for Agency

In 1494 Pacioli codified double-entry bookkeeping, and it changed the world for one reason: it let strangers trust each other's operations at a distance. A merchant could hand a ship to a captain because the books that came back were auditable — every transaction posted twice, and the books either balanced or they did not. Memory and assurances stopped being the trust mechanism; the ledger was.

Evidence-driven completion is the same invention applied to agent work. Every action in the workspace posts twice: once as the act (a Data Source created, a workflow run, a proposal applied) and once as the evidence (the linked row, the persisted source records, the receipt). Workspace Lens is the trial balance — if something claims done without evidence, the books do not balance and the cockpit keeps the step open.

**What it unlocks:** delegation at a distance. You can hand a workspace to an agent overnight the way the merchant handed over the ship — because what comes back is auditable without trusting the agent's narration. The GTM sentence: *we did not make agents smarter; we gave them books that balance.*

### 2. Version Control for Operations

Developers already carry the AWaC mental model — it is git. Local-first clone. Propose on a branch. Review the diff. Merge with authority. History is immutable and the artifact is portable.

The mapping is exact: helper propose/apply is a pull request against runtime state instead of source code. A receipt is a commit with proof attached. `.growthub-fork/` is the fork record. Export is push. The workspace extends version control from "what the software is" to "what the business state is and what has been done to it."

**What it unlocks:** every git instinct predicts a future workspace feature. Workspace `diff` between two artifact states. `revert` driven by receipts. `bisect` over `trace.jsonl` to find when readiness regressed. `blame` showing which receipt produced a row. The roadmap is already written in the muscle memory of every developer who will evaluate the product.

### 3. Stigmergy: Coordination Through the World, Not Through Chat

Termites build cathedral mounds with no meetings, no messages, and no orchestrator. Each termite reads the mound and acts on local evidence; the mound itself is the communication medium. Computer science productionized this in the 1970s as the blackboard architecture (Hearsay-II): specialists coordinate by reading and writing one shared, structured state.

Most multi-agent frameworks coordinate by passing transcripts agent-to-agent — token cost grows roughly with the square of the conversation. AWaC agents coordinate the termite way: write evidence into the artifact, and the next agent reads Lens, not the previous agent's chat history. The workspace is a governed blackboard.

**What it unlocks:** fleets that scale without inter-agent messaging. Token cost grows with state, not with agent count. There is no orchestrator agent to build, prompt, or pay for — the artifact orchestrates. A nightly "metabolism" of refresh, triage, and repair agents can run against one workspace with zero shared context windows.

### 4. Instrument Flight and Graduated Authority

Aviation discovered "no evidence, no completion" the hard way: a pilot inside a cloud must trust the instruments over the inner ear, because the inner ear lies confidently. A language model's inner ear is plausibility — it produces the same confident lie. The cockpit pattern is instrument flight for agents: act on derived state, never on what feels true.

Aviation also solved authority: nobody grants a student pilot night-IFR clearance by configuration. Ratings are earned through logged hours. The workspace can grade agents the same way: propose-only (student) → apply-with-review (visual flight) → scheduled autonomous runs (instrument-rated) — where each rating is computed from the agent's receipt history in the artifact.

**What it unlocks:** agent reputation as derivation, not configuration. An agent's permission level becomes a pure function over its logged evidence, exactly like flight hours. `trace.jsonl` is the flight recorder; incident review is replay, not archaeology. No agent platform currently offers earned, evidence-derived authority — the primitives for it already exist in the artifact.

### 5. Metabolism: The Membrane and Digestion

A cell does not "integrate with" glucose. It admits matter through specific receptors, digests it with enzymes into usable form, stores the energy, and never lets raw outside chemistry touch the nucleus.

The ingestion path maps one-to-one: the API Registry row is the receptor; the server-side test is taste; the resolver is the enzyme that digests provider envelopes — nested payloads, wrappers, pagination — into normalized records; source records are stored energy the rest of the organism runs on; and secrets never cross the membrane into rows, browser state, or exported templates.

**What it unlocks:** a hard design law — nothing is metabolized undigested. Agents are never fed raw API envelopes (token bloat is indigestion; the resolver paid that cost once at the membrane). And a product line: resolver libraries as enzyme packs per provider, so a workspace can digest a new API the moment it is tasted.

### 6. Legal Moves: The Game Engine

A chess interface does not let you make an illegal move. That single property is why a beginner can play immediately and why engines can search efficiently: the rules collapse an infinite action space into a small set of legal moves.

Eligibility derivation is the workspace's legal-move generator. For humans, it is onboarding — you learn the system by only being able to do valid things. For agents, it is the largest token-economics lever in the product: a small model choosing among three derived-eligible actions is safer and cheaper than a frontier model planning over an unbounded action space — by orders of magnitude on both axes.

**What it unlocks:** investment priority. The highest-leverage engineering is the move generator (eligibility derivers and validators), not the player (model size). This is the history of game AI repeating: rules engine first, then search, then learning. It also names the agent SDK's primary endpoint: *give me the legal moves.*

### 7. The Save File: World-State You Can Hand Over

Games solved portable state decades ago. The save file carries the entire world — inventory, progress, history — and any machine resumes it exactly. No session affinity, no memory service, no transcript.

The workspace artifact is the business's save file: config, objects, source records, receipts, workflows, trace, docs, skills. Fork is new-game-plus. Export is bringing your save. Agent handoff is co-op multiplayer joining your world. The handoff packet is the save-file header — the minimal state an agent reads to resume play.

**What it unlocks:** agent continuation stops being a memory problem (vector stores, transcript stitching) and becomes a file problem — which is already solved. And the most cinematic demo available: kill the machine mid-operation, restore the artifact on another machine, and watch the agent resume from evidence.

## The Grand Synthesis

These seven models are not seven metaphors. They are seven centuries answering one question:

```text
How do you let a capable but fallible actor
operate valuable state
without supervising it in real time?
```

Accounting answered it for merchants. Version control answered it for code. Aviation answered it for pilots. Stigmergy answered it for colonies. The membrane answered it for life. The rules engine answered it for players. The save file answered it for worlds.

Every answer has the same shape: **externalize truth into an auditable artifact, derive what is allowed from what is proven, and grant authority in graduated, evidence-earned steps.** That shape is exactly `artifact -> evidence -> eligibility -> action -> receipt -> next state`.

The agent industry is currently rediscovering this shape one outage at a time. Growthub's bet is to install it on day one, locally, in a folder the user owns.

## Derived Moves (One Per Bridge)

| Bridge | Derived feature / GTM move |
|---|---|
| Ledger | Readiness scoring framed as a trial balance; auditable workspace exports; "books balance" as the trust badge |
| Git | Workspace diff/revert/bisect over receipts and trace; receipts rendered as a commit log |
| Stigmergy | Swarm mode: many agents, one artifact, zero inter-agent messages; nightly metabolism runs |
| Instrument flight | Agent ratings derived from receipt history; authority that grows with logged evidence |
| Metabolism | Resolver "enzyme packs" per provider; never feed agents undigested envelopes |
| Legal moves | Eligibility as the agent SDK's primary endpoint; invest in derivers before models |
| Save file | One-file handoff packet; the kill-and-resume demo as flagship footage |

## The Closing Sentence

AWaC is double-entry bookkeeping for agency, version control for operations, instrument flight for autonomy, and stigmergy for coordination — compiled into one local-first artifact that a human can own, an auditor can read, and an agent can resume.
