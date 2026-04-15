# AI Caption Layer

**Methodology for AI-assisted caption generation in the Postiz Social Media Operator.**

---

## Overview

The AI caption layer produces A/B/C caption variants for every post in the content calendar. This document defines the tone profiles, variant construction rules, and quality bar applied to every caption draft.

The agent generates captions using:
1. The brand kit's voice guidelines (`brands/<client-slug>/brand-kit.md`)
2. The platform tone profiles defined in this document
3. The theme pillar context from the Social Campaign Brief
4. The character limits and hashtag rules from `docs/platform-coverage.md`

---

## Platform Tone Profiles

| Platform | Tone | Voice | Avoid |
|---|---|---|---|
| Instagram | Visual-first, aspirational, authentic | First-person POV, sensory language, short punchy sentences | Corporate jargon, excessive hashtags, stock-photo clichés |
| LinkedIn | Professional, insight-driven, confident | Data-backed claims, industry terminology, no jargon | Salesy language, superlatives without proof, informal slang |
| TikTok | Casual, trend-aware, energetic, hook-first | Gen Z cadence, pattern interrupt, hook in first 2 words | Formal tone, long sentences, no emoji, corporate speak |
| X/Twitter | Concise, punchy, opinionated | Declarative sentences, take-first, thread-opening hooks | Wishy-washy hedging, long-winded intros, excessive hashtags |
| Pinterest | Aspirational, instructional, keyword-rich | Descriptive, actionable verbs, lifestyle context | Vague descriptions, missing context, non-searchable language |
| Facebook | Conversational, community-first, warm | Inclusive "we/our", questions, local/personal context | Overly promotional, algorithm-bait language |
| Bluesky | Direct, open-web-aware, intellectual | Concise, tech-savvy, first-principles reasoning | Overly polished PR-speak, platform-specific references |
| Mastodon | Community-focused, inclusive, decentralization-aware | Plain language, CamelCase hashtags for accessibility | Algorithmic optimization language, commercial urgency |
| Reddit | Authentic, community-native, contribution-first | Reddit idioms where appropriate, value-first, no self-promotion optics | Obvious promotional tone, link dumps without context |

---

## Variant Construction Rules

### Variant A — Direct / Factual

- Lead with the core fact, data point, or product statement
- Second sentence: supporting evidence or context
- Third sentence (if length allows): CTA
- Tone: confident, no hedging language
- Use numbers when available: "78% of marketers say..." outperforms "many marketers say..."

**Structure template:**
```
[Core claim or insight.] [Evidence or context.] [CTA verb phrase.]
```

### Variant B — Storytelling / Narrative

- Open with a scene, scenario, or relatable before-state
- Middle: transition to the insight or product context
- Close: resolution or CTA
- Tone: warm, specific, first-person or second-person

**Structure template:**
```
[Scene/scenario that the audience recognizes.] [Transition: "That's when we realized..." / "Here's what changed..."] [Insight or product context.] [CTA.]
```

### Variant C — Question / Engagement Hook

- Open with a direct question or provocative statement
- The question must be genuinely answerable in comments
- Follow with 1–2 supporting sentences before the CTA
- Tone: curious, conversational, invites participation

**Structure template:**
```
[Question the audience wants to answer?] [Context that makes the question worth answering.] [CTA that directs to comment or click.]
```

---

## Character Limit Compliance

Every caption variant must be checked against the platform character limit before being considered complete. The agent must note the character count in the Caption Copy Deck entry.

| Platform | Hard Limit | Target Range | Notes |
|---|---|---|---|
| Instagram | 2,200 | ≤150 (above fold) / up to 500 for educational | First 125 chars are critical — fold cuts here on mobile |
| LinkedIn | 3,000 | 150–300 for opening hook | Algorithm may suppress posts with very short captions on company pages |
| TikTok | 2,200 | ≤150 | First 150 chars visible before "more" |
| X/Twitter | 280 | ≤240 | Leave 40 chars for RT space |
| Pinterest | 500 | 100–300 | Keyword density matters for discovery |
| Bluesky | 300 | ≤280 | Hard limit — truncation destroys message |
| Mastodon | 500 | ≤400 | Instance limits may vary |
| Reddit | Variable | Long-form (300–1000 words) for text posts | Subreddit rules override; check before drafting |

---

## Emoji Usage Guidelines

| Platform | Usage Level | Notes |
|---|---|---|
| Instagram | Moderate (2–5 per caption) | Use as visual separators and tone enhancers |
| LinkedIn | Minimal (0–2 per post) | Bullets acceptable on company pages; personal posts: 0–1 |
| TikTok | Liberal (5–10) | Emoji-first hooks are platform-native |
| X/Twitter | Minimal (0–2) | One emoji at start of tweet is acceptable; more feels crowded |
| Pinterest | None to minimal (0–2) | Focuses on keyword discoverability |
| Facebook | Moderate (2–4) | Consistent with casual community tone |
| Bluesky | Minimal (0–2) | Text-first culture |
| Mastodon | None to minimal | Accessibility-first: screen readers read emoji alt-text |

---

## AI Caption Quality Bar

A complete caption variant must:

1. **Stay within character limits** — hard requirement, not optional
2. **Have an explicit CTA** — at minimum: "Learn more", "Link in bio", "Comment below", "Drop your thoughts"
3. **Match platform tone** — LinkedIn caption must not read like a TikTok caption
4. **Reference the content** — caption must connect to the media asset or post topic
5. **Not open with "I"** — Instagram algorithm and general best practice: lead with the hook, not the subject
6. **Avoid placeholder language** — no "[INSERT BRAND NAME]" fragments in the final copy deck
7. **Be meaningfully different across A/B/C** — changing one word does not constitute a variant
