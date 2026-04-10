# SAMPLE: Campaign Brief — Growthub Nurture Sequence — Automation & AI Pillar

> This is a reference output. Shows a fully completed campaign brief for a 5-email nurture sequence.
> Use as a quality benchmark when producing campaign briefs.

---

## CAMPAIGN OVERVIEW

| Field | Value |
|---|---|
| **Campaign name** | Growthub — Creative Velocity Nurture — Q2 2026 |
| **Client** | growthub |
| **Campaign type** | Nurture sequence — 5 emails |
| **Content pillar (anchor)** | Pillar 2 — Automation & AI |
| **Content pillar (secondary)** | Pillar 4 — Education & Strategy |
| **Date** | 2026-04-10 |
| **Owner** | Antonio |

---

## AUDIENCE

| Field | Value |
|---|---|
| **Segment name** | new-lead |
| **Persona** | Performance director or CGO at a DTC brand or agency spending $50K–$300K/month on Meta/TikTok. Problem-aware: knows creative throughput is the bottleneck but hasn't found a reliable system. |
| **Entry trigger** | Opted in via lead magnet ("Creative Testing Playbook") or ad landing page |
| **Segment tag (platform)** | `new-lead` — GHL sequence trigger: tag applied |
| **What they want** | More winning ad concepts, faster, without proportionally more cost or headcount |
| **What they're afraid of** | Investing in a production system that delivers volume but not wins. Looking dumb internally for recommending something that doesn't work. |
| **What they've tried** | In-house creative team, UGC platforms, traditional ad agencies — all have been too slow, too expensive, or disconnected from performance data |

---

## CAMPAIGN ANGLE

| Field | Value |
|---|---|
| **Campaign angle** | The bottleneck isn't your team or your budget — it's the gap between insight and execution, and Growthub closes it. |
| **Emotional arc** | Frustrated (creative is still the constraint) → Informed (the real bottleneck identified) → Empowered (they see a path) → Activated (they book the call) |
| **Primary message** | Speed from insight to winning ad — without increasing production cost or headcount |
| **What the campaign is NOT** | Not a pitch for AI technology. Not a volume promise. Not a comparison to other production tools. The story is about the system, not the features. |

---

## SEQUENCE MAP

| # | Send Day | Theme | Subject (primary) | Body Arc | CTA | Platform Tag |
|---|---|---|---|---|---|---|
| 1 | Day 0 | The real bottleneck | "The thing most performance teams miss about scaling creative" | Problem/agitate → partial value reveal | Soft CTA (read framework) | `new-lead` |
| 2 | Day +3 | The insight | "Why your creative cycle is slower than it looks" | Value/reveal — insight on production cycle gap | Reply CTA | `nurture-active` |
| 3 | Day +6 | The framework | "The 3-step creative intelligence framework" | Education block — 3-part framework | Soft CTA (download) | `nurture-active` |
| 4 | Day +10 | The proof | "How one team went from 2-week cycles to weekly wins" | Story/bridge → primary CTA | Primary CTA (book call) | `nurture-engaged` |
| 5 | Day +14 | The activation | "Still hitting the creative ceiling? Here's the thing." | Value summary → urgency → primary CTA | Primary CTA (book call) | `nurture-activation` |

---

## CTA SPEC

| Field | Value |
|---|---|
| **Primary CTA** | Book your growth call |
| **Primary CTA URL** | [URL — fill in per deployment] |
| **Secondary CTA** | Download the creative intelligence framework |
| **Reply CTA** | "Reply and tell me — is creative throughput the actual bottleneck, or is it something else?" |

---

## VOICE & TONE NOTES

| Field | Value |
|---|---|
| **Tone** | Direct, operator-level, no-fluff, practical, growth-literate |
| **Voice notes** | Speak like a knowledgeable peer, not a vendor. The reader is smart and has been burned before. Specificity earns credibility. Short sentences. |
| **Phrases to use** | "creative velocity", "speed to winning ads", "creative bottleneck", "lower your cost per learning", "test faster than competitors can react" |
| **Phrases to avoid** | "revolutionary", "game-changing", "best-in-class", "guaranteed results", "scale to the moon" — all messaging_guardrails from brand kit apply |

---

## COMPLIANCE

| Field | Value |
|---|---|
| **Required disclaimers** | Results vary. Proof points attributed where used. |
| **CAN-SPAM footer** | Yes — required on Emails 1 and 5 (broadcasts); unsubscribe and physical address |
| **Hard restrictions** | No guaranteed revenue claims. No fabricated case studies. No "AI UGC" as the lead — system framing only. |

---

## PLATFORM NOTES

| Field | Value |
|---|---|
| **Platform** | GHL |
| **Handoff mode** | API — sequence created via GHL REST API, segment tag triggers entry |
| **Template name (platform)** | Growthub_NurtureBase_v1 (existing template) |
| **Test send recipient** | [internal email for review] |

---

## SIGN-OFF

- [x] Campaign angle confirmed: "The bottleneck isn't your team or your budget — it's the gap between insight and execution"
- [x] Sequence map confirmed: 5 emails, 14 days, pillar 2 anchor
- [x] Compliance notes reviewed
- [x] Platform handoff mode confirmed: API via GHL

**Confirmed by:** Antonio  
**Date confirmed:** 2026-04-10
