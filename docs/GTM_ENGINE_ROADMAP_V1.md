# GTM Engine Roadmap V1 — Qualified Conversations From Shipped Primitives

Impact-ranked, atomic actions for running a sales/outreach GTM engine **on capabilities that
literally exist in this repo today**, anchored to the latest shipped releases:

- **`0.14.0`** — governed API creation cockpit
  (`API Registry row → server-side test → response profile → resolver → governed Data Source →
  source-record refresh → workflow persistence → Workspace Lens readback`).
  See [`docs/GOVERNED_CREATION_RELEASE_SNAPSHOT_V1.md`](./GOVERNED_CREATION_RELEASE_SNAPSHOT_V1.md),
  [`docs/WORKSPACE_NEW_REALITY_VALUE_MAP_V1.md`](./WORKSPACE_NEW_REALITY_VALUE_MAP_V1.md).
- **`0.14.1`** — governed agent swarm cockpit
  (`helper prompt → swarm.run.propose → reviewed apply → sandbox-environment row in
  swarm-workflows → POST /api/workspace/sandbox-run → run history + truthful telemetry`).
  See [`docs/GOVERNED_SWARM_RELEASE_SNAPSHOT_V1.md`](./GOVERNED_SWARM_RELEASE_SNAPSHOT_V1.md),
  [`docs/SWARM_RUN_CONTRACT_V1.md`](./SWARM_RUN_CONTRACT_V1.md).
- **`0.14.2`** — **does not exist yet** at time of writing (latest published release is `0.14.1`).
  Tier 4 below proposes what the GTM-relevant `0.14.2` payload should be.

No arbitrary timelines. Sequenced only by leverage and dependency, in the style of
[`docs/ROADMAP_IMPACT_ITEMS_V1.md`](./ROADMAP_IMPACT_ITEMS_V1.md).

---

## First principles

The atomic unit of GTM value is a **qualified conversation started**. Everything upstream
(lead finding, enrichment, verification) only exists to make the first touch land; everything
downstream (follow-ups, meetings, revenue) only exists because it did. So the engine is one
causal chain, and every link already has a shipped primitive:

```text
audience signal            → governed Data Source        (0.14.0 cockpit / Nango connectorKind)
qualified lead             → governed dataModel object   (helper: dataModel.object.create / row.add)
enrichment + verification  → swarm workflow row          (helper: swarm.run.propose → sandbox-run)
first touch + follow-up    → kit-templated sequences     (email-marketing / zernio / twenty-crm kits)
evidence + steering        → run history, dashboards,    (source records, dashboard.create,
                             lenses, swarm packets        Workspace Lens, /api/workspace/swarm-condition)
```

Two org-specific facts change the priority order versus a generic playbook:

1. **The warmest lead source is already owned.** A 50k+ follower social presence with hundreds
   of thousands of weekly impressions means engagement signals (comments, replies, DMs,
   profile-level intent) are the cheapest qualified-lead source available — cheaper and warmer
   than any cold list. The engine should *start* from captured engagement, not from cold scraping.
2. **Dashboards and infrastructure already exist.** Nothing here proposes new runtime or new
   surfaces. Every item below is a config delta inside the shipped PATCH boundary
   (`dashboards | widgetTypes | canvas | dataModel`) or a kit invocation.

---

## The shipped inventory this roadmap is allowed to use

| Capability | Where it lives | GTM role |
|---|---|---|
| Governed API creation cockpit | `0.14.0`; API Registry → test → profile → Data Source → refresh | Bring Apollo/Clay/Hunter/social APIs in as governed, refreshing data |
| Nango connector kind (800+ integrations) | `0.13.6`; `api-registry` rows, `connectorKind: "nango"`, `/api/workspace/integrations/nango/proxy` | LinkedIn, CRMs, email providers without bespoke adapters |
| Governed swarm cockpit | `0.14.1`; `swarm.run.propose` → `swarm-workflows` rows → `sandbox-run` → Background Tasks cockpit | SDR/enrichment/reply swarms as governed workflow rows |
| Workspace helper proposal types | `packages/api-contract/src/helper.ts` — `dataModel.object.create`, `dataModel.row.add`, `dashboard.create`, `widgetType.bind`, `canvas.*`, `swarm.*` | Create lead objects, pipeline dashboards, swarms — all human-reviewed |
| Workspace Lens + swarm condition packet | `0.13.8`; `/workspace-lens`, `GET /api/workspace/swarm-condition` | Self-describing next actions; machine-assignable swarm conditions |
| Twenty CRM kit | `cli/assets/worker-kits/growthub-twenty-crm-v1` — `templates/lead-enrichment-pipeline.md`, `enrichment-field-map.md`, `import-mapping.md`, `api-query-plan.md`, `webhook-integration-spec.md` | CRM data model, enrichment waterfall (Apollo/Clearbit/Clay/Hunter), dedup keys |
| Email Marketing kit | `cli/assets/worker-kits/growthub-email-marketing-v1` — `templates/email-formats/outbound-cold-sequence.md`, `follow-up-sequence.md`, `re-engagement.md`, subject-line/body modules | First-touch and follow-up sequences ("the goal of Email 1 is a reply, not a call") |
| Zernio Social kit | `cli/assets/worker-kits/growthub-zernio-social-v1` — inbox reply plans, recurring queues, scheduling manifests, 14 platforms | Comment replies, DM-adjacent conversation starts, posting cadence |
| Postiz Social kit | `cli/assets/worker-kits/growthub-postiz-social-v1` — 28+ platform scheduler | Scheduling/publishing redundancy and reach |
| Marketing Operator kit | `cli/assets/worker-kits/growthub-marketing-skills-v1` — CRO audit, email sequence plans, competitor analysis | Conversion side of the funnel (landing page the replies hit) |
| Agency Portal starter | `cli/assets/worker-kits/growthub-agency-portal-starter-v1` | Client-facing proof surface for the service business |

---

## Tier 0 — The substrate (two atomic actions; everything else compounds on them)

### 1. Create the governed GTM objects: `lead`, `account`, `conversation`

- **Atomic action.** One workspace-helper session: three `dataModel.object.create` proposals,
  reviewed and applied. Field schema and dedup keys come straight from the Twenty CRM kit's
  frozen assets: person dedup on `emails.primaryEmail`, company dedup on `domain`, secondary
  person key `linkedInLink.url` (`growthub-twenty-crm-v1/templates/lead-enrichment-pipeline.md`),
  field mapping from `templates/enrichment-field-map.md`.
- **Why first.** Every swarm, dashboard, and lens downstream reads/writes these rows through the
  existing `dataModel` PATCH lane. The `conversation` object is the engine's true north: one row
  per started conversation, with `source` (comment / DM / cold email / warm intro), `lead`,
  `firstTouchAt`, `repliedAt`, `meetingAt`.
- **Drives.** The metric that matters — conversations started per week — becomes a governed,
  countable row, not a feeling.

### 2. Register enrichment + verification providers through the 0.14.0 cockpit

- **Atomic action.** One API Registry row per provider (Apollo or Clay for person/company,
  Hunter for email verification — exactly the waterfall the Twenty CRM kit templates name),
  each walked through the shipped path: server-side test → response profile → resolver →
  governed Data Source → scheduled source-record refresh. Use `connectorKind: "nango"` where a
  Nango integration exists (800+, including LinkedIn-adjacent and CRM providers).
- **Why this shape.** This is precisely what `0.14.0` shipped for: external capability enters as
  governed workspace state with evidence at every step, secrets stay out of config, and
  "qualified leads" becomes a *refreshing dataset* instead of a stale CSV.
- **Drives.** Enrichment and verification stop being manual VA work; they become source records
  any swarm can read.

---

## Tier 1 — Capture the owned audience (highest-order leverage: warm beats cold)

### 3. Engagement-signal Data Source over the existing social presence

- **Atomic action.** Register the social engagement surface (Zernio analytics/inbox endpoints
  from `growthub-zernio-social-v1/docs/zernio-api-integration.md`, or platform APIs via Nango)
  as an API Registry row → Data Source. Refresh pulls commenters, repliers, and high-engagement
  followers into source records.
- **First-principles rationale.** 50k followers × hundreds of thousands of weekly impressions is
  a continuously self-refreshing intent pool. A person who commented on a post about AI-native
  service delivery *this week* is a better first-touch target than any scraped title match. The
  engine's lead-finding step should rank `engaged-and-ICP-matching` above `cold-and-ICP-matching`
  — this single ordering decision is the cheapest CAC reduction available.
- **Drives.** A standing **"engaged, not yet contacted"** view over the `lead` object — the daily
  work queue for conversation starts.

### 4. Comment-reply / inbox swarm (the conversation-starting front door)

- **Atomic action.** One helper prompt → `swarm.run.propose` → reviewed apply → a
  `swarm-workflows` row whose agents draft replies using the Zernio kit's **inbox reply plans**
  and brand kit (`brands/growthub/brand-kit.md`). Output is a reply plan per engagement, applied
  via the existing review gate — drafts are governed proposals, not auto-fired posts.
- **Why a swarm, not a cron.** `0.14.1` makes this a first-class governed workflow row with run
  history, truthful token/tool telemetry, and a thread-bounded Background Tasks cockpit. The
  human reviews drafts in the same surface they review everything else.
- **Drives.** Public replies that convert engagement into 1:1 conversations — the warm-first
  funnel entry, on infrastructure that already ships in the repo.

---

## Tier 2 — The outreach swarms (one helper prompt each, post-Tier-0)

### 5. SDR enrichment swarm (waterfall + verify + write back)

- **Atomic action.** `swarm.run.propose` → agents read un-enriched `lead` rows, call the Tier-0
  Data Sources in the kit-specified waterfall order, verify emails (Hunter step), and propose
  `dataModel.row.add`/`row` updates back through the apply gate. Dedup per the kit keys so the
  same human never gets two threads.
- **Evidence.** Every run persists to source records (`sandbox:swarm-workflows:<name>`); the
  cockpit shows per-agent tokens/tools/time. Enrichment cost per qualified lead becomes a real,
  derivable number.

### 6. First-touch swarm (cold + warm sequences from the email kit)

- **Atomic action.** Swarm row whose agents draft sequences from
  `growthub-email-marketing-v1/templates/email-formats/outbound-cold-sequence.md`
  (4 emails, 9 days, arc: intrigue → insight → proof → ask; **Email 1's goal is a reply, not a
  call**) for cold rows, and a shorter warm variant for Tier-1 engaged rows, personalized from
  enrichment fields + the specific engagement signal ("you commented on…").
- **Governance is the feature.** The propose→apply review gate is what makes agent outreach
  defensible at an AI-native service company: a human approves every batch, receipts persist,
  nothing auto-sends from chat. This is the anti-spam-cannon design, and it's already built.
- **Drives.** The core metric: qualified conversations started per week, per channel, per
  sequence variant.

### 7. Follow-up swarm on reply-state deltas

- **Atomic action.** Swarm row that reads `conversation` rows where `repliedAt` is null past the
  sequence interval and drafts follow-ups from `templates/email-formats/follow-up-sequence.md` /
  `re-engagement.md`; replied rows route to a human with a drafted next step. Warm LinkedIn
  1st-tier touches follow the same pattern with the social surface instead of email.
- **Why atomic.** It is a pure read of row deltas → proposal — the exact configuration-is-causal
  pattern the activation/lens layer already proves.

---

## Tier 3 — Cockpit and measurement (make the engine steerable)

### 8. GTM pipeline dashboard

- **Atomic action.** One helper session: `dashboard.create` + `widgetType.bind` + canvas widgets
  over the Tier-0 objects — engaged-not-contacted count, enriched/verified counts, sequences
  in flight, **conversations started this week**, reply rate by source (comment vs cold vs warm),
  meetings booked. Slots straight into the existing custom-dashboard infrastructure.

### 9. Swarm health + cost rollup

- **Atomic action.** Use the shipped observability lens and run-state rollups (healthy / failing /
  never-run), agent `budgetMonthlyCents`, and per-run telemetry to derive cost-per-conversation.
  A weekly-reporting swarm row summarizes deltas — the "weekly reporting agents" intent from the
  org's agent-roles map, expressed as one more `swarm-workflows` row, not a new system.

---

## Tier 4 — What `0.14.2` should be: the `gtm-engine` activation template

Everything above is operating work inside one workspace. The repo-level move — the proposed
payload for the **not-yet-shipped `0.14.2`** — is to freeze Tiers 0–3 into a first-run template,
exactly the way `project-management` already proves the self-activating-template pattern:

- **Seeded artifacts.** `lead` / `account` / `conversation` objects, enrichment + engagement
  `api-registry` rows (`connectorKind: "nango"`, empty `connectionIds`), the three swarm rows
  (enrichment, first-touch, follow-up, reply), and the pipeline dashboard.
- **A `gtm-engine` activation adapter.** A pure deriver in the shipped
  `workspace-activation.js` registry pattern: *connect enrichment provider → connect engagement
  source → first enrichment run ok → first sequence approved → first conversation row created* —
  each step a named config delta, the next action computed, never authored.
- **Swarm-assignable from birth.** Each activation step doubles as a
  `deriveSwarmConditionPacket()` condition, so "GTM team" agents (the org's intent map) can be
  pointed at the blocked step with goal/tools/expected-evidence attached.
- **Why this is the highest-order item.** It converts the open-source repo itself into the
  demand engine: every operator who activates the GTM template is running the company's own
  motion, and every public artifact (template, receipts, cockpit) is build-in-public content for
  the 50k-follower channel — the flywheel feeding Tier 1.

---

## Sequencing

1. **Items 1–2** (one day of governed applies) — objects + providers; nothing else works without them.
2. **Items 3–4** — the warm front door; highest conversion leverage per unit of effort.
3. **Items 5–7** — the swarm lanes; each is one helper prompt + review once Tier 0 exists.
4. **Items 8–9** — steering; reuses existing dashboard infra.
5. **Item 10** — freeze the proven loop into the `gtm-engine` template as the `0.14.2` payload.

The through-line: **no new runtime, no new persistence, no new PATCH field** — the GTM engine is
a set of governed config deltas and swarm rows over what `0.14.0` and `0.14.1` already shipped,
ordered so the owned audience (the warmest asset) is captured before any cold motion runs.
