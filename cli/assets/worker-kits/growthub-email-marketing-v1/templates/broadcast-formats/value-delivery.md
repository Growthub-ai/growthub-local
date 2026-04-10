# Broadcast Format: Value Delivery

> **Format ID:** `value-delivery`
> **Purpose:** Deliver a free resource directly to the subscriber — no friction, no pitch. Pure value send.
> **Vault asset types:** Lead magnets (`lm-*`) from `broadcasts/<client>/broadcast-vault.md`
> **Recommended segment:** All active subscribers, new opt-ins, lead magnet requesters
> **Email count:** 1 (single broadcast)
> **Tone:** Generous, direct, no strings attached

---

## FORMAT RULES

- **No pitch.** This email gives something away. The only CTA is to access the resource. Never mention services or offers.
- **Short body.** Value-delivery emails should be scannable in under 30 seconds. Hook → 1–2 sentences of framing → CTA → done.
- **Lead with the gift.** The subject line and first sentence should make clear something valuable is coming. Don't bury the lede.
- **One resource, one CTA.** Never deliver multiple assets in a single value-delivery email.
- **PS line is optional but powerful.** Use to reinforce why this resource matters or tease what's in it.

---

## PLACEHOLDERS

| Placeholder | Source | Notes |
|---|---|---|
| `[BRAND_NAME]` | `brand_kit.brand_name` | Sender identity |
| `[FROM_NAME]` | `brand_kit.email_from_name` | e.g. "Antonio from Growthub" |
| `[ASSET_TITLE]` | vault `lead_magnets[].title` | Exact title of the resource |
| `[ASSET_DESCRIPTION]` | vault `lead_magnets[].description` | 1–2 sentence description |
| `[ASSET_URL]` | vault `lead_magnets[].url` | Direct link to resource |
| `[ASSET_TYPE]` | vault `lead_magnets[].type` | e.g. "playbook", "guide", "database" |
| `[PRIMARY_CTA_TEXT]` | vault `lead_magnets[].cta_text` | Exact CTA copy from vault |
| `[PERSONA_DESCRIPTION]` | vault `lead_magnets[].audience` | Who this is most relevant for |
| `[PILLAR]` | vault `lead_magnets[].pillar` | Informs tone + framing angle |
| `[SEGMENT_TAG]` | campaign brief | The list segment receiving this |

---

## SUBJECT LINE SLOT

```
subject_line: [SUBJECT_LINE — see matrix below]
preview_text: [PREVIEW_TEXT — 1 sentence, completes the subject]
```

### Subject line matrix — generate 3–5 options

**Structures to use for value-delivery:**

| Type | Structure | Example |
|---|---|---|
| Direct gift | "Here's [ASSET_TYPE]: [ASSET_TITLE]" | "Here's the playbook: Winning Ads 2026" |
| Curiosity gap | "[Outcome they get] — [resource name]" | "Better ad hooks in 10 minutes — get the database" |
| Personal handoff | "I put this together for [PERSONA_DESCRIPTION]" | "I built this for performance teams running paid media" |
| No-pitch signal | "No pitch. Just [resource]." | "No pitch. Just 500 proven hooks." |
| Earned value | "You asked, here it is — [ASSET_TITLE]" | "You asked, here it is — the AI Batch Image Guide" |

---

## EMAIL BODY TEMPLATE

```
---
FROM:    [FROM_NAME]
TO:      [SEGMENT_TAG]
SUBJECT: [SUBJECT_LINE]
PREVIEW: [PREVIEW_TEXT]
---

[HOOK — 1 sentence. State what they're getting. No fluff.]

[FRAMING — 1–2 sentences. Why this resource exists and who it's for.]

[VALUE BRIDGE — 1 sentence. What they'll be able to do after using it.]

→ [PRIMARY_CTA_TEXT]
   [ASSET_URL]

[OPTIONAL PS — reinforce the value or add a warm, human note.]

—
[FROM_NAME]
[BRAND_NAME]

---
[Footer: unsubscribe | physical address]
```

---

## FILLED EXAMPLE — Growthub

**Asset used:** `lm-10` — 500+ Proven Winning Hooks
**Segment:** All active subscribers

```
---
FROM:    Antonio from Growthub
TO:      all-active
SUBJECT: No pitch. Just 500 proven ad hooks.
PREVIEW: The same library we use internally for every creative brief.
---

Here's the hooks database — free, no strings.

We built this internally to speed up creative briefing. It's 500+ proven ad hooks
organized by niche, format, and hook type. When you're staring at a blank brief,
this is what we reach for.

If you're writing ads or briefing creative, this'll save you hours.

→ Access 500+ Winning Hooks →
   https://www.notion.so/growthub/2d7d28ab9783802aa48dcda105f8c63f?v=8e6120c3ec8e401daa8eaefad2de89d6

PS — If you find something useful in there, hit reply and tell me which hook type
worked for your niche. Always curious what's landing.

—
Antonio
Growthub

---
[unsubscribe] · Growthub · [physical address]
```

---

## QA CHECKLIST

Before approving this broadcast:

- [ ] Subject line matches value-delivery tone (no pitch language, no urgency manipulation)
- [ ] Body is under 150 words
- [ ] One CTA only — points to the resource URL
- [ ] URL is correct and live
- [ ] CTA text matches vault `cta_text` exactly
- [ ] No mention of services, pricing, or offers
- [ ] FROM name matches `brand_kit.email_from_name`
- [ ] Footer present (unsubscribe + physical address)
- [ ] Segment tag confirmed before send
- [ ] Cadence rules checked — same asset not sent to same segment in last 60 days
