# Email Marketing Strategist — Master Skill Doc

**Source of truth for methodology. Read this file completely before beginning any task.**

---

## QUICK REFERENCE TABLE

| Resource | Path |
|---|---|
| Agent operating law | `workers/email-marketing-strategist/CLAUDE.md` |
| Brand kit template | `brands/_template/brand-kit.md` |
| Growthub brand kit | `brands/growthub/brand-kit.md` |
| Email format library | `templates/email-formats/INDEX.md` |
| Broadcast format library | `templates/broadcast-formats/INDEX.md` |
| Broadcast vault template | `broadcasts/_template/broadcast-vault.md` |
| Growthub broadcast vault | `broadcasts/growthub/broadcast-vault.md` |
| Email module library | `templates/email-modules/INDEX.md` |
| Subject line patterns | `templates/hooks-library/subject-line-patterns.csv` |
| Campaign brief template | `templates/campaign-brief-template.md` |
| Sequence planner | `templates/sequence-planner.md` |
| Email draft template | `templates/email-draft.md` |
| Subject line matrix template | `templates/subject-line-matrix.md` |
| CTA matrix template | `templates/cta-matrix.md` |
| QA checklist | `templates/qa-checklist.md` |
| Output standards | `output-standards.md` |
| Platform integration | `runtime-assumptions.md` |
| Example: campaign brief | `examples/campaign-brief-sample.md` |
| Example: nurture sequence | `examples/nurture-sequence-sample.md` |
| Example: subject line matrix | `examples/subject-line-matrix-sample.md` |
| Output folder | `output/<client-slug>/<campaign-slug>/` |

---

## STEP 0 — BEFORE ANY TASK, ANSWER THESE QUESTIONS

Before writing a single word of copy, answer:

1. **Who is the client?** (slug, brand kit location)
2. **What campaign type?** (nurture / cold outbound / follow-up / re-engagement / promotional)
3. **Which content pillar?** (Growth System / Automation & AI / Client Results / Education & Strategy / Pipeline & Revenue)
4. **Who is the audience segment?** (new lead / warm prospect / past client / stalled pipeline / re-engage)
5. **What is the primary CTA?** (book call / start trial / claim offer / reply / read resource)
6. **Is platform handoff in scope?** (API / browser / export only)

If any of these are unknown after Step 3 of CLAUDE.md, ask before proceeding.

---

## STEP 1 — LOAD THE BRAND KIT

### 1a — If brand kit exists

```
Read: brands/<client-slug>/brand-kit.md
```

Extract into working context:
- `voice_and_tone` — exact adjectives, not summaries
- `approved_phrases` — verbatim, use these in copy
- `messaging_guardrails` — absolute no-go items
- `content_pillars` — definitions and angle mappings
- `cta_language` — exact CTA text from brand kit
- `compliance_notes` — required disclaimers and restrictions

### 1b — If brand kit does not exist

Copy `brands/_template/brand-kit.md` to `brands/<client-slug>/brand-kit.md`.
Ask the user to fill in the required fields before any copy is written.
Minimum required fields: `client_name`, `slug`, `voice_and_tone`, `content_pillars`, `approved_phrases`, `messaging_guardrails`, `primary_cta`.

---

## STEP 2 — CHECK THE FORMAT LIBRARY

```
Read: templates/email-formats/INDEX.md
```

Match the requested campaign type to a frozen format:

| Campaign type | Frozen format file |
|---|---|
| Lead nurture (5 emails) | `templates/email-formats/nurture-sequence.md` |
| Cold outbound (4 emails) | `templates/email-formats/outbound-cold-sequence.md` |
| Promotional broadcast (1 email) | `templates/email-formats/promotional-broadcast.md` |
| Re-engagement / win-back (3 emails) | `templates/email-formats/re-engagement.md` |
| Post-demo follow-up (3 emails) | `templates/email-formats/follow-up-sequence.md` |

**If a frozen format matches → use it exactly. Do not reinvent the arc structure.**
**If no format matches → build from `templates/sequence-planner.md` and freeze the new format after delivery.**

---

## STEP 2B — BROADCAST VAULT (for broadcast campaigns only)

> Skip this step for multi-email sequences. This step applies ONLY when the campaign type is a single-send broadcast.

### What is a broadcast?

A broadcast is a single-send email to a list segment — not a sequence. It is planned from the vault, not from a sequence brief. Use this step instead of the multi-email format workflow.

### Broadcast workflow

```
1. Load the vault
   Read: broadcasts/<client-slug>/broadcast-vault.md
   → Load the full vault into working context

2. Identify the campaign goal
   → Deliver free value       → format: value-delivery
   → Drive traffic to LM page → format: lead-magnet-traffic
   → Share proof / credibility → format: showcase-proof
   → Warm up / re-engage      → format: engagement-nudge
   → Move warm leads to book  → format: activation-booking

3. Check the broadcast format index
   Read: templates/broadcast-formats/INDEX.md
   → Confirm format selection against the campaign goal

4. Select the vault asset
   → Match the campaign goal to the best asset from the vault
   → Check: asset status = active
   → Check cadence: same asset not sent to this segment in last 60 days

5. Load the format template
   Read: templates/broadcast-formats/<format-id>.md
   → Fill all [PLACEHOLDER] slots from vault + brand kit

6. Generate subject line matrix
   → 3–5 options using subject line structures in the format file
   → Preview text paired with each subject line option

7. Platform handoff
   → Per runtime-assumptions.md
```

### Broadcast asset selection guide

| Campaign goal | Best vault asset types | Broadcast format |
|---|---|---|
| Deliver free value, build goodwill | Lead magnets (lm-*) | `value-delivery` |
| Drive traffic to a specific resource | Lead magnets with landing pages | `lead-magnet-traffic` |
| Build credibility, show results | Case studies (cs-*), showcases (sh-*) | `showcase-proof` |
| Warm up cold/cool leads | YouTube (yt-*), community (lm-04), educational LMs | `engagement-nudge` |
| Nudge warm leads toward booking | Testimonial (t-*), case studies, showcases | `activation-booking` |

### Broadcast cadence rules

Always check these before scheduling any broadcast send:

- Max 2 broadcasts per week
- Min 3 days between sends
- Preferred send days: Tuesday, Thursday
- Preferred send time: 9–11am recipient local time
- Do not re-send same vault asset to same segment within 60 days
- Never send the same lead magnet twice in one month to the same segment

---

## STEP 3 — CONFIRM BRIEF INPUTS

Before writing, collect all required fields:

**Campaign identity:**
- Campaign name
- Campaign type (from format library)
- Content pillar (anchor pillar)
- Secondary pillar (if blending)
- Audience segment + stage
- Entry trigger (what event starts this sequence)
- Goal (what the campaign is trying to get the reader to do)

**Copy direction:**
- Campaign angle (confirmed with user in CLAUDE.md Step 4)
- Emotional arc (Frustrated → Informed → Activated, or custom)
- Voice/tone notes (from brand kit, any campaign-specific additions)
- Compliance constraints (from brand kit + any campaign-specific)

**CTA spec:**
- Primary CTA (exact text + URL or action)
- Secondary CTA (optional — reply, resource, softer ask)
- Platform segment tag or trigger condition (if platform handoff in scope)

---

## STEP 4 — CONTENT PILLAR → CAMPAIGN ANGLE MAPPING

This is the core strategic layer. Every campaign is anchored to a pillar. The pillar determines the angle, the emotional arc, and the language patterns.

### Pillar 1 — Growth System
**Core idea:** Growthub is not a tool. It is the operating system for growth — infrastructure that makes scaling systematic, not chaotic.

**Campaign angles:**
- "Your growth is leaking — here's where"
- "Most businesses don't have a growth problem. They have a systems problem."
- "The difference between businesses that scale and those that stall isn't budget — it's infrastructure."
- "What happens when you remove the chaos from growth?"

**Emotional arc:** Chaotic → Systematic → In Control
**Voice:** Confident, diagnostic, operator-to-operator
**Language patterns:**
- "growth infrastructure", "systematic scaling", "without the chaos"
- "built-in accountability", "growth that compounds"
- "most agencies run on duct tape — this is the alternative"

---

### Pillar 2 — Automation & AI
**Core idea:** Speed from insight to action. The businesses winning right now are moving faster — not working harder. Automation removes the bottleneck between thinking and doing.

**Campaign angles:**
- "The bottleneck isn't your team. It's the time between ideas and execution."
- "What if your follow-up never dropped the ball again?"
- "Speed is the new competitive advantage in [niche]. Here's how to get it."
- "Most of your pipeline dies in the gap between 'not ready yet' and 'ready to buy.' Automation closes that gap."

**Emotional arc:** Overwhelmed → Informed → Empowered
**Voice:** Practical, specific, outcome-forward — not hype-driven
**Language patterns:**
- "speed to winning results", "automated follow-up that works while you sleep"
- "ideas → execution → learning", "test faster than competitors can react"
- "remove the bottleneck", "without adding headcount"

---

### Pillar 3 — Client Results
**Core idea:** Proof over promises. The most compelling thing we can show is what happened for someone like you. Results, specifics, stories — not features.

**Campaign angles:**
- "What [Name/Business type] did in [timeframe] with Growthub"
- "The agency that went from [X problem] to [Y outcome]"
- "Here's what scaling without chaos actually looks like"
- "Before Growthub: [pain]. After: [outcome]."

**Emotional arc:** Skeptical → Curious → Convinced
**Voice:** Story-forward, specific, peer-to-peer (not testimonial-polished)
**Language patterns:**
- exact metrics and outcomes (approved in brand kit only)
- "here's what actually happened", "not theory — this is a real result"
- "the same system is available to you"

---

### Pillar 4 — Education & Strategy
**Core idea:** We earn attention by making people smarter. Teach first. Position second. The most trusted brands give value before they ask for anything.

**Campaign angles:**
- "The [N]-step framework for [desired outcome]"
- "Why [common belief] is costing you [cost]"
- "The thing nobody tells you about [topic relevant to ICP]"
- "Here is exactly how we [do the thing your audience wants to do]"

**Emotional arc:** Curious → Informed → Action-ready
**Voice:** Generous, credible, direct — no condescension
**Language patterns:**
- "here's what we've found", "this is the framework we use"
- "most people miss this step", "the unlock is simpler than you think"
- "you can steal this", "take this and run with it"

---

### Pillar 5 — Pipeline & Revenue
**Core idea:** Email is a pipeline tool, not a broadcast tool. Every sequence should move someone from one stage to the next. The metric is pipeline movement, not open rates.

**Campaign angles:**
- "Your pipeline isn't dead. It's just quiet. Here's how to wake it up."
- "The follow-up sequence that converts stalled prospects without being pushy"
- "What to say when a prospect goes silent (and why most people say the wrong thing)"
- "There is more revenue in your existing list than in any new lead you'll generate this month."

**Emotional arc:** Stalled → Re-engaged → Moving
**Voice:** Direct, urgent-but-not-pushy, revenue-literate
**Language patterns:**
- "stalled pipeline", "move deals forward", "already in your list"
- "the money is in the follow-up", "pipeline health", "re-engage without burning bridges"
- "one email away from a yes", "revenue attribution"

---

## STEP 5 — COPYWRITING SYSTEM

### The 4-block email body framework

Every email body is built from these modular blocks. Select 2–4 per email. Mix and match — but follow the arc.

**Block 1 — PROBLEM/AGITATE**
Open with the tension. Name the pain or problem specifically. Make the reader feel it without dwelling too long.
- Module: `templates/email-modules/body/problem-agitate.md`
- Length: 2–4 sentences
- Rule: Specific always beats generic. "You're losing $3K/month in follow-up drop-off" beats "follow-up is hard."

**Block 2 — VALUE/REVEAL**
Introduce the idea, insight, or mechanism that resolves the tension. This is the "so here's the thing" moment.
- Module: `templates/email-modules/body/value-reveal.md`
- Length: 3–5 sentences
- Rule: One idea per block. Don't stack reveals.

**Block 3 — STORY/BRIDGE**
Bridge between the idea and the reader's reality. Use a client story, a scenario, or a "here's what this looks like in practice" example.
- Module: `templates/email-modules/body/story-bridge.md`
- Length: 3–6 sentences
- Rule: Approved proof points only. Never fabricate.

**Block 4 — EDUCATION**
Add depth, a framework, or a "here's how this works" explanation. Used in Education & Strategy pillar campaigns and longer nurture sequences.
- Module: `templates/email-modules/body/education-block.md`
- Length: 4–8 sentences or a short numbered list
- Rule: Teach one thing completely. Don't overview multiple topics.

---

### Subject line system

Subject lines are not decoration — they are the entire open rate. Every email gets a matrix of 5+ variants.

**The 4 subject line types:**

| Type | What it does | Use when |
|---|---|---|
| Curiosity | Opens a loop the reader must close | Education, nurture, pillar 4 |
| Social proof | Anchors credibility with a result | Client results, promo |
| Urgency | Creates a reason to act now | Promotional, pipeline-moving |
| Personal | Speaks directly to the individual | Cold outbound, re-engagement |

Load patterns from `templates/hooks-library/subject-line-patterns.csv`.

**3-pass subject line selection:**
1. Pass 1: Filter by campaign type (nurture / cold / promo / re-engage / follow-up)
2. Pass 2: Filter by pillar tone (diagnostic / proof-forward / education / urgency)
3. Pass 3: Select 5+ candidates, write variants using the Structure column as the frame

**Preview text rule:** Preview text is always written alongside the subject line. They are a pair, not an afterthought. Preview text should extend or complement the subject line — never repeat it.

---

### CTA system

Every email has one primary CTA. Secondary CTAs (reply, read, soft ask) are optional.

**CTA hierarchy:**
1. Primary CTA — one action, specific, above the fold if possible, and repeated in the PS
2. Soft CTA — a lower-commitment ask (reply to this, read this, watch this) for cold/nurture emails
3. Reply CTA — conversational ask ("reply with [X]") for sequences that want engagement signals

Load CTA patterns from `templates/email-modules/cta/`.

**CTA copy rules:**
- Verb-first: "Book your call", "Start your trial", "See how it works" — not "Click here" or "Learn more"
- Specific outcome: "Get your custom growth plan" beats "Book a call"
- One CTA per email (primary). Do not stack multiple CTAs.
- PS line always reinforces the primary CTA or adds a secondary angle.

---

### Voice and tone guardrails

These apply across all Growthub campaigns:

**Always:**
- Speak like a knowledgeable operator, not a marketer
- Use specific outcomes and concrete language
- Write in second person ("you", "your") not third
- Keep sentences short and scannable — max 2 lines before a break
- Use one idea per paragraph
- Lead with value, not features

**Never:**
- Hype ("revolutionary", "game-changing", "best-in-class")
- Vague promises ("grow your business", "scale to the moon")
- Passive voice in CTAs
- Stacked questions in the opening hook
- Jargon the ICP doesn't use
- Any phrase listed in `messaging_guardrails` in the brand kit

---

## STEP 6 — EMAIL PLATFORM INTEGRATION

Email platform handoff uses the adapter pattern defined in `runtime-assumptions.md`.

**Two integration modes:**

**Mode A — API (preferred for speed)**
- Platform API key from environment variable
- Operations: list templates, map copy to template slots, create/update campaign, trigger test send
- GHL is the reference adapter (see `runtime-assumptions.md → GHL Adapter`)
- New platforms: add a new adapter section in `runtime-assumptions.md`, no existing files change

**Mode B — Browser-assisted**
- Use Chrome browser tools to navigate platform UI
- Transfer copy manually into template slots
- Take screenshot of final email for review log
- Document workflow in `runtime-assumptions.md → Browser-Assisted Workflows`

**Mode C — Export only**
- Produce `<ClientSlug>_PlatformReady_v1_<YYYYMMDD>.md`
- Copy organized by template slot: subject, preview, body block 1-N, CTA, PS, footer
- Human or operator handles the upload

---

## DESIGN SYSTEM — email copy formatting conventions

### Structure inside a draft

```markdown
---
EMAIL: [N of N]
THEME: [theme name]
SEND DAY: [Day X of sequence]
PILLAR: [pillar name]
SEGMENT: [segment name]
---

**SUBJECT (primary):** [subject line]
**PREVIEW:** [preview text]

---

[Opening hook — 1–2 sentences]

[Body block 1]

[Body block 2]

[Body block 3 — optional]

[CTA]

---

**PS:** [PS line]

---

**PLAIN-TEXT FALLBACK:**
Subject: [subject line]
Preview: [preview text]

[full email in plain text, no formatting]

CTA: [URL or action, unformatted]

---

**PLATFORM SLOT MAP** (if platform handoff in scope):
- subject_line: [value]
- preview_text: [value]
- body_html: [block references]
- cta_text: [value]
- cta_url: [value]
- from_name: [value]
- from_email: [value]
```

---

## GUARDRAILS — apply to all campaigns

1. **Pillar first.** No campaign is written without a confirmed pillar. Pillar determines angle, tone, language patterns.
2. **Brand kit is the source of truth.** Voice, phrases, guardrails, CTA language — all from brand kit.
3. **One campaign type per sequence.** Never mix nurture and promotional logic in the same sequence.
4. **5+ subject line variants per email.** One subject line is not a matrix.
5. **Preview text is always paired.** Never deliver a subject line alone.
6. **Plain-text fallback is required.** Every email draft includes it.
7. **No fabricated proof.** Only use results and numbers approved in the brand kit.
8. **No hardcoded credentials.** Platform keys always from env vars.
9. **Sequence plan before drafts.** The arc must exist before individual emails are written.
10. **Platform push requires confirmation.** Never create or update a platform campaign without user approval.

---

## COMMON MISTAKES TABLE

| Mistake | Correct approach |
|---|---|
| Generic opening hook | Name the specific pain or problem from the pillar — not "Are you struggling with growth?" |
| Long paragraphs | Max 3 sentences per paragraph, white space is intentional |
| Feature-first body copy | Lead with what the reader gets/feels, not what the product does |
| Stacked CTAs | One primary CTA per email — period |
| "Learn more" as CTA text | Verb-first, outcome-specific: "See how [Brand] does it" |
| Subject line without preview text | Always write both together |
| Missing PS line | PS lines get high readership — always include one, reinforce the CTA or add a secondary angle |
| Not checking the subject line pattern library | Always run the 3-pass selection before writing new subject lines |
| Skipping the sequence plan | Even for a single email, build the context map first |
| Overwriting versioned files | Always `v2`, never overwrite |
| Not logging the deliverable | Append to brand kit after every completed output |
| "Guaranteed" without qualifier | Check compliance_notes first |
| Writing for opens, not pipeline movement | Every CTA should move the reader one stage closer to the goal |
