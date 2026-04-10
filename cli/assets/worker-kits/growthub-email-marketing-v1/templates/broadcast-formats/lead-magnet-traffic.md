# Broadcast Format: Lead Magnet Traffic

> **Format ID:** `lead-magnet-traffic`
> **Purpose:** Drive traffic to a lead magnet landing page. Tease the value, create desire, push the click.
> **Vault asset types:** Lead magnets with landing page URLs (`lm-*`)
> **Recommended segment:** Cold/warm subscribers who haven't accessed this resource yet, re-engageable contacts
> **Email count:** 1 (single broadcast)
> **Tone:** Curious, benefit-forward, low pressure

---

## FORMAT RULES

- **Tease, don't deliver.** The resource lives on a landing page — this email creates desire and drives the click. Don't explain everything.
- **Lead with the benefit, not the format.** "Better ad creative" beats "a new playbook". Outcome first, format second.
- **One resource, one landing page.** This format drives to a single destination. No multi-asset roundups.
- **Create a reason to click now.** Not urgency — curiosity and benefit clarity. Make them feel like they're missing something by not clicking.
- **Subject line carries most of the weight.** If the subject doesn't create desire, the email fails. Test 3–5 variants.

---

## PLACEHOLDERS

| Placeholder | Source | Notes |
|---|---|---|
| `[BRAND_NAME]` | `brand_kit.brand_name` | Sender identity |
| `[FROM_NAME]` | `brand_kit.email_from_name` | e.g. "Antonio from Growthub" |
| `[ASSET_TITLE]` | vault `lead_magnets[].title` | Title of the resource |
| `[ASSET_DESCRIPTION]` | vault `lead_magnets[].description` | What's inside — used for body framing |
| `[ASSET_URL]` | vault `lead_magnets[].url` | Landing page URL |
| `[ASSET_TYPE]` | vault `lead_magnets[].type` | e.g. "playbook", "guide", "database" |
| `[PRIMARY_CTA_TEXT]` | vault `lead_magnets[].cta_text` | Exact CTA copy from vault |
| `[PERSONA_DESCRIPTION]` | vault `lead_magnets[].audience` | Who should want this |
| `[PILLAR]` | vault `lead_magnets[].pillar` | Informs framing angle and language patterns |
| `[PAIN_POINT]` | brand kit pillar angle | What problem this resource solves |
| `[DESIRED_OUTCOME]` | brand kit pillar angle | What success looks like after using it |
| `[SEGMENT_TAG]` | campaign brief | Target segment |

---

## SUBJECT LINE SLOT

```
subject_line: [SUBJECT_LINE — see matrix below]
preview_text: [PREVIEW_TEXT — amplifies subject, adds curiosity]
```

### Subject line matrix — generate 3–5 options

| Type | Structure | Example |
|---|---|---|
| Outcome tease | "How [PERSONA] [achieves DESIRED_OUTCOME] without [PAIN_POINT]" | "How DTC teams scale creative without raising headcount" |
| Question | "What's your [metric] missing?" | "What's your ROAS missing?" |
| Curiosity gap | "The [resource] that changed how we [outcome]" | "The database that changed how we write hooks" |
| Social proof signal | "[NUMBER] [persona] are using this to [outcome]" | "800+ marketers used this to fix their hook problem" |
| Direct benefit | "Get [ASSET_TITLE] — free" | "Get the Winning Ads Playbook — free" |

---

## EMAIL BODY TEMPLATE

```
---
FROM:    [FROM_NAME]
TO:      [SEGMENT_TAG]
SUBJECT: [SUBJECT_LINE]
PREVIEW: [PREVIEW_TEXT]
---

[HOOK — 1 sentence. Name the pain or the opportunity. Make it specific.]

[PROBLEM FRAME — 1–2 sentences. Describe the situation [PERSONA_DESCRIPTION] is in
that makes [ASSET_TITLE] valuable. What's at stake if they don't have this?]

[RESOURCE INTRO — 1–2 sentences. Introduce the resource. Name it. Say what's inside
at a high level. Don't give everything away — create curiosity.]

[BENEFIT STATEMENT — 1 sentence. What they'll be able to do after. Outcome-focused.]

→ [PRIMARY_CTA_TEXT]
   [ASSET_URL]

[OPTIONAL PS — secondary benefit or social proof signal. One sentence.]

—
[FROM_NAME]
[BRAND_NAME]

---
[Footer: unsubscribe | physical address]
```

---

## FILLED EXAMPLE — Growthub

**Asset used:** `lm-05` — Free Competitor Ads Report
**Segment:** warm-leads-paid-media

```
---
FROM:    Antonio from Growthub
TO:      warm-leads-paid-media
SUBJECT: What are your competitors actually running on Meta?
PREVIEW: Most brands find out too late — here's how to see it for free.
---

Most brands find out what their competitors are running only after they've already
lost market share to it.

If you're running paid media on Meta, you should know exactly what creative angles,
hooks, and formats are working in your niche right now — not six weeks from now.

I put together a free report that shows you exactly that. Top ads, hooks, formats,
and angles from your competitive set. No tools to buy, no setup required.

You get the report for free — just tell me your niche.

→ Get my free competitor ads report →
   https://www.growthub.ai/f/winning-ads-signup

PS — Most teams who run this are surprised by what they find. The hooks that are
performing aren't the ones they expected.

—
Antonio
Growthub

---
[unsubscribe] · Growthub · [physical address]
```

---

## QA CHECKLIST

Before approving this broadcast:

- [ ] Subject line creates curiosity or benefit desire — not click-bait or manipulative
- [ ] Body is under 175 words
- [ ] One CTA only — points to landing page URL
- [ ] URL is correct, landing page is live and functional
- [ ] CTA text matches vault `cta_text` exactly
- [ ] Email teases value without fully delivering it (drives the click)
- [ ] Pain point and persona are specific — not generic
- [ ] FROM name matches `brand_kit.email_from_name`
- [ ] Footer present (unsubscribe + physical address)
- [ ] Segment confirmed — resource hasn't been sent to this segment in last 60 days
- [ ] 3–5 subject line variants generated for testing
