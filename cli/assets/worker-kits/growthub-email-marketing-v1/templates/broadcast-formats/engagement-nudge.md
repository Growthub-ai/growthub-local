# Broadcast Format: Engagement Nudge

> **Format ID:** `engagement-nudge`
> **Purpose:** Re-warm cold or disengaged subscribers. Deliver low-friction value — a YouTube video,
> community invite, or educational resource — with the goal of getting a click or reply. No hard sell.
> **Vault asset types:** YouTube videos (`yt-*`), community (`lm-04`), educational lead magnets (`lm-*`)
> **Recommended segment:** Cold leads (30+ days inactive), un-engaged subscribers, passive opt-ins
> **Email count:** 1 (single broadcast)
> **Tone:** Human, low-key, conversational — like a message from a peer, not a campaign

---

## FORMAT RULES

- **No pitch, no ask.** The only goal is a click or a reply. Nothing about services, nothing about buying.
- **Short and human.** This email should feel like a quick message from someone who thought of you, not a newsletter blast. Under 100 words in the body.
- **Pick low-friction assets.** YouTube videos and community links work well because there's no form to fill. Just one click.
- **Open with something useful, not a premise about being busy.** Don't start with "I know you're busy" or "I just wanted to check in". Lead with the value.
- **PS can be a soft re-engagement question.** "What are you working on right now?" is more effective than any funnel tactic.
- **Goal is reactivation.** A click or a reply means the contact is re-engaged. That's the win — not a conversion.

---

## PLACEHOLDERS

| Placeholder | Source | Notes |
|---|---|---|
| `[BRAND_NAME]` | `brand_kit.brand_name` | Sender identity |
| `[FROM_NAME]` | `brand_kit.email_from_name` | e.g. "Antonio from Growthub" |
| `[ASSET_TITLE]` | vault asset `title` | Video title, community name, or LM title |
| `[ASSET_URL]` | vault asset `url` | Direct link — no landing page friction |
| `[ASSET_TYPE]` | vault asset `type` | "video", "community", "guide" |
| `[PRIMARY_CTA_TEXT]` | vault asset `cta_text` | CTA text from vault |
| `[ASSET_TEASER]` | vault asset `description` (condensed) | 1-sentence tease of what's inside |
| `[PILLAR]` | vault asset `pillar` | Informs angle and language |
| `[SEGMENT_TAG]` | campaign brief | Target segment |
| `[RE_ENGAGEMENT_HOOK]` | brand kit / campaign brief | Optional: what's changed or new that makes now relevant |

---

## SUBJECT LINE SLOT

```
subject_line: [SUBJECT_LINE — see matrix below]
preview_text: [PREVIEW_TEXT — low-key, adds context]
```

### Subject line matrix — generate 3–5 options

| Type | Structure | Example |
|---|---|---|
| Soft share | "Thought you'd like this" | unchanged |
| Topic tease | "Quick [VIDEO/GUIDE] on [TOPIC]" | "Quick video on AI batch image generation" |
| Personal frame | "Been working on this for [persona]" | "Been building this for marketing teams" |
| No-hype share | "Worth 10 minutes if you're into [topic]" | "Worth 10 minutes if you're into AI creative" |
| Open loop | "Have you seen what's working in [area] right now?" | "Have you seen what's working in Meta creative right now?" |

---

## EMAIL BODY TEMPLATE

```
---
FROM:    [FROM_NAME]
TO:      [SEGMENT_TAG]
SUBJECT: [SUBJECT_LINE]
PREVIEW: [PREVIEW_TEXT]
---

[SOFT OPENER — 1 sentence. Introduce the asset with a low-key, human frame.
"Made this", "Found this useful", "Been thinking about this" style.]

[ASSET TEASE — 1–2 sentences. What's inside, who it's for, why it's worth a click.
Keep it light — this is a share, not a pitch.]

→ [PRIMARY_CTA_TEXT]
   [ASSET_URL]

[OPTIONAL PS — re-engagement question or soft signal. "What are you working on?"
or "Reply if you want more like this." Human, not automated-feeling.]

—
[FROM_NAME]
[BRAND_NAME]

---
[Footer: unsubscribe | physical address]
```

---

## FILLED EXAMPLE A — YouTube video

**Asset used:** `yt-01` — Antonio YouTube Video 1
**Segment:** cold-leads-30-days

```
---
FROM:    Antonio from Growthub
TO:      cold-leads-30-days
SUBJECT: Worth watching if you're running AI creative
PREVIEW: Put this together for teams trying to move faster with AI.
---

Put this video together for marketing teams who are using AI tools but still
spending too long on production. Covers the workflow, the shortcuts, and the
things most people miss.

15 minutes. No fluff.

→ Watch on YouTube →
   https://youtu.be/yACECplpWGU?si=cFtQCyG_k_98KTtl

PS — Hit reply and tell me what's taking the most time in your creative workflow
right now. Working on a resource around the most common bottlenecks.

—
Antonio
Growthub

---
[unsubscribe] · Growthub · [physical address]
```

---

## FILLED EXAMPLE B — Community invite

**Asset used:** `lm-04` — Growthub SKOOL Community
**Segment:** new-opt-ins-cold

```
---
FROM:    Antonio from Growthub
TO:      new-opt-ins-cold
SUBJECT: There's a free community for this
PREVIEW: 4,000+ marketers learning AI marketing and growth — free to join.
---

If you're figuring out AI marketing and growth, there's a community for it.

4,000+ marketers, founders, and operators sharing what's working, what's not,
and building together. Templates, resources, and conversations you won't find
on a podcast. Free to join.

→ Join the free community →
   https://www.skool.com/growthub/about

PS — Once you're in, introduce yourself. The threads in the community are
where the real conversations happen.

—
Antonio
Growthub

---
[unsubscribe] · Growthub · [physical address]
```

---

## QA CHECKLIST

Before approving this broadcast:

- [ ] Body is under 120 words — this should feel like a quick message, not a campaign
- [ ] No mention of services, pricing, or offers anywhere in the email
- [ ] One asset, one CTA
- [ ] URL is correct and goes directly to the asset (no extra landing page friction)
- [ ] Tone is conversational — reads like a human wrote it, not a campaign builder
- [ ] Subject line is low-key — no urgency, no hype, no manipulation
- [ ] PS (if used) is a question or soft human signal — not a sales trigger
- [ ] FROM name matches `brand_kit.email_from_name`
- [ ] Footer present (unsubscribe + physical address)
- [ ] Segment confirmed — these are cold/disengaged, not warm pipeline contacts
