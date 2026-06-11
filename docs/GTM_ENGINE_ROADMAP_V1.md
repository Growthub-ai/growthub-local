# GTM Engine Roadmap V1 — The Conversation Layer, Swarm-Controlled

Scope-corrected roadmap for the GTM engine's **conversation layer only**: first touch,
follow-up, nurture, re-engagement, and reply handling — run as governed swarm rows on the
shipped `0.14.0` / `0.14.1` primitives.

**Explicitly out of scope:** lead finding, scraping, contact enrichment, and email
verification. That pipeline is already built and operates in its own custom workspace. This
engine **consumes** its output — qualified, enriched, verified lead rows with their intent
signals — as an input contract, and never rebuilds any of it.

Anchored releases:

- **`0.14.0`** — governed API creation cockpit (external sending/social surfaces enter as
  evidence-backed API Registry rows and Data Sources).
  [`docs/GOVERNED_CREATION_RELEASE_SNAPSHOT_V1.md`](./GOVERNED_CREATION_RELEASE_SNAPSHOT_V1.md)
- **`0.14.1`** — governed agent swarm cockpit (`swarm.run.propose` → reviewed apply →
  `swarm-workflows` row → `POST /api/workspace/sandbox-run` → run history + truthful telemetry).
  [`docs/GOVERNED_SWARM_RELEASE_SNAPSHOT_V1.md`](./GOVERNED_SWARM_RELEASE_SNAPSHOT_V1.md),
  [`docs/SWARM_RUN_CONTRACT_V1.md`](./SWARM_RUN_CONTRACT_V1.md)
- **`0.14.2`** — not yet published; latest release is `0.14.1`.

Nothing in this document proposes a new runtime, new object model, or new mechanism. Every
item is a **proven real-world outbound mechanic** mapped onto a **shipped workspace control**.

---

## First principles

The engine's atomic unit is a **qualified conversation started**. With lead supply solved
upstream, the entire remaining problem is conversation operations, and conversation operations
decompose into exactly five loops — each one a stage of the same lifecycle, each one already
templated as a frozen kit asset, each one runnable as one governed swarm row:

```text
qualified lead row (input, upstream workspace)
  → FIRST TOUCH      cold-outbound-4-email          (reply-seeking opener)
  → FOLLOW-UP        follow-up-post-demo-3-email    (post-call decision driver)
  → NURTURE          nurture-5-email                (not-yet-ready → booking-ready)
  → RE-ENGAGEMENT    re-engagement-3-email          (60+ days silent → recovered)
  → REPLY HANDLING   zernio inbox reply plans       (speed-to-reply, social + email)
```

All five formats are frozen assets in
`cli/assets/worker-kits/growthub-email-marketing-v1/templates/email-formats/` and
`growthub-zernio-social-v1` (inbox reply plans, recurring queues), with a shared modular
library: subject-line modules (curiosity / personal / social-proof / urgency), body blocks
(problem-agitate / value-reveal / story-bridge / education-block), CTA modules
(reply-cta / soft-cta / primary-cta), `sequence-planner.md`, and `qa-checklist.md`.

---

## The proven mechanics, mapped to shipped controls

Each row below is an operating fact of 2026 outbound — not an invention — and the workspace
control that enforces it at the swarm level.

| # | Proven mechanic | Shipped workspace control |
|---|---|---|
| 1 | **Deliverability is the rate limiter.** Bulk-sender enforcement (Google/Yahoo): authenticated sending (SPF/DKIM/DMARC), one-click unsubscribe, spam-complaint rate held **under 0.3%**. Throughput comes from many warmed mailboxes at low per-mailbox daily caps — never from raising one mailbox's volume. | Volume caps and sending identity live as **row config on the swarm row**; changing a cap is a reviewed `dataModel` apply, not a hidden setting. Sending surfaces enter via 0.14.0 registry rows with server-side tests, so a broken/unauthenticated sender is visible before a swarm ever uses it. |
| 2 | **Most positive replies arrive on touches 2–4, not touch 1.** A sequence without disciplined follow-up forfeits the majority of its yield. | The follow-up swarm is a **pure read of reply-state deltas** on `conversation` rows (`repliedAt` null past interval → draft next touch). Configuration-is-causal: the row delta *is* the trigger. |
| 3 | **Reply-first CTAs beat meeting asks on first touch.** Interest-based micro-asks out-convert calendar links cold. | Already encoded in the frozen format: `outbound-cold-sequence.md` — *"The goal of Email 1 is a reply, not a call."* The swarm composes from `reply-cta.md` / `soft-cta.md` modules; `primary-cta.md` is reserved for touch 4 and post-call stages. |
| 4 | **Signal-grounded personalization beats volume personalization.** A first line referencing a real trigger (their engagement, launch, hire) is the difference between a reply and a spam vote. | The input contract: lead rows arrive from the upstream enrichment workspace **already carrying signals**. Swarm prompts consume signal fields; they never fabricate them. Rows without a usable signal route to nurture, not first touch. |
| 5 | **Speed-to-reply compounds.** Responding to a reply or inbound engagement within minutes, not hours, multiplies conversion to a booked conversation. | The reply swarm runs as a **recurring queue** (Zernio posts-and-queues layer) over inbox state; drafts surface in the thread-bounded Background Tasks cockpit for one-keystroke review. |
| 6 | **Multichannel sequences out-reply single-channel.** An email thread plus a warm social touch (1st-tier connection, comment reply) in the same window lifts response materially. | One sequence = one swarm row with both email steps and Zernio social steps (14 platforms) in its orchestration graph; canvas `sandboxRecordRef` keeps every node traceable to the owning row. |
| 7 | **Silent pipeline is recoverable inventory.** Stalled deals and 60+ day no-open contacts respond to direct acknowledgment, not pretend-continuity. | Frozen format `re-engagement-3-email` (entry trigger literally: *"no opens in 60+ days, stalled pipeline, demo no-show"*). A quarterly sweep is one swarm run over the silent-row filter. |
| 8 | **The human QA gate is the 2026 differentiator.** AI-drafted volume spam has cratered baseline reply rates; reviewed, signal-grounded drafts are what still land. | This is the native shape of the platform: **propose-only helper → reviewed apply → execution**. No draft auto-sends from chat; receipts persist; `qa-checklist.md` is the review rubric. The compliance gate isn't bolted on — it's the only path that exists. |

---

## What "controllable at the swarm level" means (all shipped in 0.14.1)

The scale-up claim rests on controls that already exist on every `swarm-workflows` row:

- **Review gate** — every mutation flows `swarm.run.propose` → human apply; adversarial and
  credential-shaped payloads are rejected at the apply lane.
- **Execution-target inheritance + first-run eligibility** — rows inherit the active helper
  execution target and **Play is blocked** when a row's target isn't runnable: no silent
  half-configured sends.
- **Budget** — `budgetMonthlyCents` per agent; spend is a governed parameter.
- **Truthful telemetry** — per-task tokens / tools / time from adapter-reported metadata only,
  never estimated; unreported renders `—`. Cost-per-conversation is derivable, honestly.
- **Run history as evidence** — every run persists to source records
  (`sandbox:swarm-workflows:<row>`); the cockpit replays phases and per-agent transcripts
  (secret-redacted).
- **One executor route** — `POST /api/workspace/sandbox-run` is the only way anything runs;
  there is no side door to audit.
- **Stop + thread-bounded cockpit** — abort the active run; Background Tasks opens scoped to
  the exact row, so operating one sequence never means scrolling a fleet.
- **Live hydration** — NDJSON deltas stream into the cockpit during runs.

---

## The five swarm rows (the entire engine)

Each is one helper prompt → reviewed apply → one governed row. Input for all: qualified lead
rows + signals from the upstream enrichment workspace; a `conversation` row is written per
thread started (the engine's one metric: **conversations started per week**).

### 1. First-Touch Swarm
Consumes signal-bearing qualified rows; drafts `cold-outbound-4-email` (4 emails / 9 days,
intrigue → insight → proof → ask) personalized from the row's signal fields; respects
per-mailbox volume caps from row config. Reply-CTA only on touches 1–3.

### 2. Follow-Up Swarm
Reads `conversation` reply-state deltas. Post-call rows get `follow-up-post-demo-3-email`
(Day 0 recap → Day +1 objection → Day +3 decision prompt; requires call notes — asks rather
than fabricating). In-sequence no-replies get value-add bumps from the body-block modules,
never bare "bumping this".

### 3. Nurture Swarm
Rows not yet sales-ready (no usable signal, or explicit not-now) enter `nurture-5-email`
(14 days, empathy → insight → education → proof → activation; no booking CTA before Email 4).
The 50k-follower content engine feeds this loop's education/proof assets.

### 4. Re-Engagement Swarm
Quarterly (or standing) sweep over 60+ day silent rows with `re-engagement-3-email`
(acknowledge silence → proof of what's changed → easy step or graceful exit). Stalled pipeline
becomes scheduled, governed inventory recovery.

### 5. Reply Swarm (speed-to-reply)
Recurring-queue row over email replies and social engagement (Zernio inbox reply plans).
Every inbound gets a drafted, brand-kit-grounded response in the cockpit within the queue
interval; human approves; `conversation` row updates. This is the loop where minutes matter
most, so it runs most frequently.

---

## The scale-up ladder (how volume grows without losing control)

Scaling is a **guardrail-gated progression of the same five rows** — never new mechanisms:

- **Stage A — review every batch.** Default posture. Every draft passes the apply gate against
  `qa-checklist.md`. Establishes baseline reply rate and complaint rate per sequence per segment.
- **Stage B — review by exception.** When a sequence holds its guardrails across consecutive
  runs (complaint rate < 0.3%, reply rate at/above its baseline), batch review narrows to
  exceptions: new segments, new sequence variants, and any draft the swarm flags low-confidence.
  Every send still leaves run-history receipts; nothing becomes unauditable.
- **Stage C — throughput.** Raise volume only along the deliverability evidence: more sending
  identities at the same low per-identity caps, budgets raised via reviewed config deltas.
  A guardrail breach (complaint spike, reply-rate collapse, failing runs in the observability
  rollup) reads as a **blocked** state — the row pauses for human review before another batch.

Steering surface: one dashboard (`dashboard.create` + `widgetType.bind` over `conversation`
rows and run history) — conversations started/week by stage, reply rate by sequence and
segment, complaint rate vs the 0.3% ceiling, speed-to-reply, cost per conversation from
telemetry + budgets.

---

## Sequencing

1. **Reply Swarm (row 5)** first — it monetizes engagement that already exists today
   (50k+ followers, hundreds of thousands of weekly impressions) and carries zero
   deliverability risk while sending identities warm.
2. **First-Touch + Follow-Up (rows 1–2)** at Stage A volumes — the core motion, guardrails
   baselining from run one.
3. **Nurture + Re-Engagement (rows 3–4)** — yield recovery on everything rows 1–2 don't
   convert immediately.
4. **Climb the ladder** Stage A → B → C per sequence, on evidence only.

The through-line: lead supply is solved elsewhere; this engine is five governed swarm rows
running proven conversation mechanics, where every control that makes scaling safe — review
gates, eligibility blocks, budgets, truthful telemetry, single executor, run receipts —
**already shipped in 0.14.1**.
