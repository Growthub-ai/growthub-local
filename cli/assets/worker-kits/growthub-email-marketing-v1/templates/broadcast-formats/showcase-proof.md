# Broadcast Format: Showcase Proof

> **Format ID:** `showcase-proof`
> **Purpose:** Share a case study, results gallery, or testimonial to build credibility and authority.
> **Vault asset types:** Case studies (`cs-*`), showcases (`sh-*`), testimonials (`t-*`)
> **Recommended segment:** Warm leads, mid-funnel contacts, re-engagement list
> **Email count:** 1 (single broadcast)
> **Tone:** Confident, grounded, specific — never boastful or salesy

---

## FORMAT RULES

- **Lead with the result, not the client.** "3x ROAS in 6 weeks" beats "Check out our new case study".
- **Be specific.** Vague proof doesn't move people. Numbers, industries, timeframes — make it real.
- **One proof asset per broadcast.** Don't stack 3 case studies in one email. Pick the one most relevant to the segment.
- **Soft CTA.** Showcase-proof emails build credibility — they don't hard-sell. The CTA is "see the full story", not "buy now".
- **Industry match matters.** When possible, pick a proof asset that matches the segment's industry or persona.
- **Only use approved proof.** Never fabricate results. Only assets in the vault with `status: active` are approved for use.

---

## PLACEHOLDERS

| Placeholder | Source | Notes |
|---|---|---|
| `[BRAND_NAME]` | `brand_kit.brand_name` | Sender identity |
| `[FROM_NAME]` | `brand_kit.email_from_name` | e.g. "Antonio from Growthub" |
| `[PROOF_TITLE]` | vault `case_studies[].title` or `showcases[].title` | What this proof shows |
| `[PROOF_TYPE]` | vault asset `type` | "case study", "results gallery", "testimonial" |
| `[PROOF_URL]` | vault asset `url` | Link to the full proof asset |
| `[HEADLINE_RESULT]` | `case_studies[].key_result` or inferred | The single most compelling result |
| `[INDUSTRY]` | vault `case_studies[].industry` (if present) | Industry context |
| `[PRIMARY_CTA_TEXT]` | vault asset `cta_text` | CTA copy from vault |
| `[PERSONA_DESCRIPTION]` | vault asset `persona_match` or campaign brief | Who this proof resonates with |
| `[SEGMENT_TAG]` | campaign brief | Target segment |
| `[PROOF_CONTEXT]` | campaign brief | 1–2 sentences of context about the client/situation |

---

## SUBJECT LINE SLOT

```
subject_line: [SUBJECT_LINE — see matrix below]
preview_text: [PREVIEW_TEXT — adds specificity or curiosity to subject]
```

### Subject line matrix — generate 3–5 options

| Type | Structure | Example |
|---|---|---|
| Lead with result | "[RESULT] — here's how" | "3x ROAS in 6 weeks — here's how" |
| Social proof | "What happened when [persona] [did thing]" | "What happened when this DTC brand rebuilt their creative" |
| Before/after | "From [before] to [after] — case study" | "From $8 CPA to $3.20 — full breakdown" |
| Specificity hook | "Real numbers from a real [INDUSTRY] campaign" | "Real numbers from a real supplement campaign" |
| Credibility signal | "We don't post case studies often. This one earned it." | unchanged |

---

## EMAIL BODY TEMPLATE

```
---
FROM:    [FROM_NAME]
TO:      [SEGMENT_TAG]
SUBJECT: [SUBJECT_LINE]
PREVIEW: [PREVIEW_TEXT]
---

[HEADLINE RESULT — 1 sentence. Open with the most compelling outcome from this proof.
Make it specific. Numbers where available.]

[CONTEXT — 1–2 sentences. Who this was for, what they were dealing with, what the
situation looked like before Growthub's involvement. Don't over-explain — just enough
for the reader to see themselves in it.]

[WHAT CHANGED — 1–2 sentences. What the work actually was. Creative? Strategy?
Volume? Speed? Name the mechanism without turning it into a feature list.]

[RESULT REINFORCEMENT — 1 sentence. Restate the outcome with one more data point
or qualitative signal that makes it concrete.]

→ [PRIMARY_CTA_TEXT]
   [PROOF_URL]

[OPTIONAL PS — soft segue toward next step. "If this sounds like your situation..." or
"If you're running [similar problem], we should talk." Keep it non-pushy.]

—
[FROM_NAME]
[BRAND_NAME]

---
[Footer: unsubscribe | physical address]
```

---

## FILLED EXAMPLE — Growthub

**Asset used:** `cs-05` — Vitamin Brand Performance Scaling Overview
**Segment:** warm-leads-supplements

```
---
FROM:    Antonio from Growthub
TO:      warm-leads-supplements
SUBJECT: How a vitamin brand scaled spend without killing CPA
PREVIEW: The creative system that made it possible — full breakdown inside.
---

They were scaling fast but CPA was climbing. Every time they pushed spend,
efficiency dropped. Classic creative fatigue — not enough winning ads coming out
fast enough to support the media budget.

The fix wasn't more spend. It was a creative velocity system — structured testing,
faster production, and a rotation framework that kept winners running without
burning them out.

CPA held. Spend scaled. The brand now runs a sustainable ad creative machine
instead of chasing last week's winners.

→ See the full performance overview →
   https://gamma.app/docs/Vitamin-Brand-Performance-Scaling-Overview-y9rqrgqp032mefx

PS — If your CPA climbs every time you scale spend, the lever is usually creative —
not budget. Worth a conversation if you want to dig into it.

—
Antonio
Growthub

---
[unsubscribe] · Growthub · [physical address]
```

---

## QA CHECKLIST

Before approving this broadcast:

- [ ] Proof asset is in vault with `status: active` — never use unapproved or fabricated results
- [ ] Headline result is specific (numbers, timeframe, or named outcome)
- [ ] Body is under 200 words
- [ ] One proof asset featured, one CTA
- [ ] URL is correct and asset is accessible
- [ ] Industry/persona match confirmed for target segment
- [ ] Tone is confident and grounded — not boastful or hype-driven
- [ ] PS is soft — does not hard-sell or push an offer
- [ ] FROM name matches `brand_kit.email_from_name`
- [ ] Footer present (unsubscribe + physical address)
- [ ] No fabricated data points — all results from approved vault asset
