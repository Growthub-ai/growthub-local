# Broadcast Format: Activation / Booking

> **Format ID:** `activation-booking`
> **Purpose:** Move warm, nurtured leads toward booking a call, applying, or taking the next concrete step.
> This is the conversion-intent broadcast. It follows proof and engagement sends — never use it cold.
> **Vault asset types:** Testimonials (`t-*`), case studies (`cs-*`), showcases (`sh-*`) + booking CTA
> **Recommended segment:** Warm leads, nurtured contacts (opened 2+ emails, clicked a resource), booked-not-closed
> **Email count:** 1 (single broadcast)
> **Tone:** Direct, confident, peer-to-peer — not salesy or desperate

---

## FORMAT RULES

- **Only send to warm segments.** This format assumes the reader has already received value and has some familiarity with the brand. Never blast cold lists with an activation email.
- **Lead with a proof point, not a pitch.** Start with a result or a client outcome — proof earns the right to make the ask.
- **The ask should be specific and low-friction.** "Book a 20-minute call" beats "Let's connect sometime". Name the action and the time investment.
- **One proof asset, one CTA.** Don't stack multiple case studies. One credible result, then the ask.
- **Acknowledge where they are.** A warm lead who's seen resources but hasn't booked isn't cold — they're thinking. Don't treat them like a stranger.
- **Give them a reason why now matters.** Not fake urgency — a real reason. Seasonal demand, capacity, a relevant insight, a recent result. Something true.

---

## PLACEHOLDERS

| Placeholder | Source | Notes |
|---|---|---|
| `[BRAND_NAME]` | `brand_kit.brand_name` | Sender identity |
| `[FROM_NAME]` | `brand_kit.email_from_name` | e.g. "Antonio from Growthub" |
| `[PROOF_TITLE]` | vault proof asset `title` | Case study or testimonial name |
| `[PROOF_URL]` | vault proof asset `url` | Link to proof asset |
| `[HEADLINE_RESULT]` | vault `case_studies[].key_result` | The most compelling single result |
| `[BOOKING_CTA_TEXT]` | `brand_kit.cta_hierarchy` | e.g. "Book a free strategy call →" |
| `[BOOKING_URL]` | `brand_kit.cta_hierarchy` booking link | Direct calendar/booking page link |
| `[PERSONA_DESCRIPTION]` | campaign brief | Who this segment is |
| `[RELEVANCE_BRIDGE]` | campaign brief | Why this result is relevant to this segment |
| `[REASON_WHY_NOW]` | campaign brief | True, non-manufactured reason to act now |
| `[SEGMENT_TAG]` | campaign brief | Target segment |

---

## SUBJECT LINE SLOT

```
subject_line: [SUBJECT_LINE — see matrix below]
preview_text: [PREVIEW_TEXT — adds specificity, increases open rate]
```

### Subject line matrix — generate 3–5 options

| Type | Structure | Example |
|---|---|---|
| Proof-led | "[RESULT] — could be you next" | "3x ROAS in 60 days — could be you next" |
| Direct ask | "Are you open to a call?" | unchanged |
| Situation match | "If you're dealing with [pain], this is worth 20 minutes" | "If your CPA keeps climbing, this is worth 20 minutes" |
| Scarcity signal (real) | "Taking [N] new clients this [month/quarter]" | "Taking 3 new clients this month" |
| Warm re-engage | "You've been thinking about this. Let's talk." | unchanged |

---

## EMAIL BODY TEMPLATE

```
---
FROM:    [FROM_NAME]
TO:      [SEGMENT_TAG]
SUBJECT: [SUBJECT_LINE]
PREVIEW: [PREVIEW_TEXT]
---

[PROOF OPENER — 1–2 sentences. Open with a specific result. Name the outcome.
Give enough context that the reader can picture the situation. This earns the ask.]

[RELEVANCE BRIDGE — 1–2 sentences. Connect this result to the reader's situation.
"If you're dealing with [similar problem]..." or "This is the same framework we use
for [persona] who [situation]." Make it feel relevant, not generic.]

[REASON WHY NOW — 1–2 sentences. Give a real reason to act this month vs. next.
Capacity, seasonal timing, a new approach, a recent win in their industry.
Never fake urgency — only use if there's a genuine reason.]

[THE ASK — 1–2 sentences. Be direct about what you're offering and what it costs them.
"20-minute call", "free strategy session", "no-pitch conversation". Name the action.]

→ [BOOKING_CTA_TEXT]
   [BOOKING_URL]

[OPTIONAL PS — add a soft version of the ask or a final proof signal.
"If now isn't the right time, reply and tell me when is." or
"Here's the full case study if you want to see the numbers first: [PROOF_URL]"]

—
[FROM_NAME]
[BRAND_NAME]

---
[Footer: unsubscribe | physical address]
```

---

## FILLED EXAMPLE — Growthub

**Assets used:** `cs-07` — Meta Ads Success Story (proof), booking CTA from brand kit
**Segment:** warm-leads-nurtured-no-call

```
---
FROM:    Antonio from Growthub
TO:      warm-leads-nurtured-no-call
SUBJECT: If your Meta CPA keeps climbing, this is worth 20 minutes
PREVIEW: Just helped another brand fix exactly this — here's what changed.
---

Just wrapped a campaign for a brand that was in the same spot most performance teams
find themselves in: spend climbing, CPA following it up, creative rotation running dry.

We rebuilt their creative system — new hooks, new formats, new testing cadence. CPA
came back down. Spend went back up. The full story is in the case study if you
want to see the numbers.

We're taking a few new clients this month. If this sounds like where you are,
it's worth a 20-minute conversation to see if there's a fit.

→ Book a free strategy call →
   [BOOKING_URL]

PS — If you want to see the full campaign breakdown first, it's here:
https://gamma.app/docs/GH-Case-Study-Meta-Ads-Success-Story-i0vpnkpwlppew4p

—
Antonio
Growthub

---
[unsubscribe] · Growthub · [physical address]
```

---

## QA CHECKLIST

Before approving this broadcast:

- [ ] Segment confirmed as warm — this format is NOT for cold lists
- [ ] Email opens with proof, not a pitch or a direct ask
- [ ] Proof asset is from vault with `status: active` — no fabricated results
- [ ] Reason why now is real and specific — not manufactured urgency
- [ ] The ask is clearly stated with time investment named ("20-minute call")
- [ ] Booking URL is correct and functional
- [ ] Body is under 200 words
- [ ] One CTA — the booking link
- [ ] PS (if used) is a soft alternative or additional proof, not a second hard ask
- [ ] FROM name matches `brand_kit.email_from_name`
- [ ] Footer present (unsubscribe + physical address)
- [ ] Tone is direct and peer-level — not desperate, not high-pressure
