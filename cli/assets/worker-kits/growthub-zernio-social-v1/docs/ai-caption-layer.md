# AI Caption Layer

The AI caption layer is the operator's methodology for drafting platform-adapted captions at volume while preserving brand voice.

The kit produces **A/B/C variants** for every post. Each variant is meaningfully different. This document defines what "meaningfully different" means and how to get there.

---

## Caption Source

- Primary source: Claude (the agent running the operator). Uses the local `ANTHROPIC_API_KEY` only when explicitly configured for enhanced drafting.
- Secondary source: Zernio's own caption service (not used by this kit).

The kit produces captions deterministically from the agent. The Zernio account's AI configuration is never invoked as part of scheduled manifest creation.

---

## Variant Contract

Every post in the Caption Copy Deck has exactly three variants:

| Variant | Hook style | When to pick it |
|---|---|---|
| A — Direct | Declarative fact or benefit in the first line | Product announcements, educational content, lead gen |
| B — Narrative | Story beat, anecdote, or "I / we used to..." opening | Brand building, founder voice, community posts |
| C — Question | Question or provocation as the opener | Engagement-driven posts, polls, community prompts |

Variants must differ in:

- Opening hook
- Structural rhythm (list vs. paragraph vs. question-answer)
- Called-out angle (data, emotion, curiosity)

Minor word swaps (e.g., "great" → "excellent") do not count as separate variants. If three variants cannot be meaningfully differentiated for a post, collapse it to one and note the reason in the Caption Copy Deck.

---

## Per-Platform Character Targets

| Platform | Hard limit | Optimal target | Notes |
|---|---|---|---|
| `twitter` | 280 | 200–240 | Reserve space for quote-share |
| `instagram` | 2,200 | 125–150 above the "more" fold | Emoji usage moderate |
| `facebook` | 63,206 | 100–250 | Longer works but engagement peaks under 250 |
| `linkedin` | 3,000 | 1,200–2,000 for thought leadership | First 210 chars are the preview |
| `tiktok` | 2,200 | 100–150 | First 150 chars decide watch-through |
| `youtube` | Title 100 / Description 5,000 | Title 55–65 / Description 1,500 | Put key benefit in title |
| `pinterest` | 500 | 200–300 | Keyword-dense; no emoji |
| `reddit` | Varies | Subreddit-native (read mods' pinned post) | No marketing voice |
| `bluesky` | 300 | 180–240 | No hashtags, context only |
| `threads` | 500 | 200–350 | Text-first, image secondary |
| `googlebusiness` | 1,500 | 150–250 | Lead with action or offer |
| `telegram` | 4,096 | 300–800 (channel posts) | Preview shows first 2 lines |
| `snapchat` | 80 (snap overlay) | ≤60 | Must read without audio |
| `whatsapp` | 1,024 | ≤200 | Personal tone |

---

## Hashtag Rules

| Platform | Count | Rule |
|---|---|---|
| `instagram` | 3–5 | Mix branded + niche; skip filler (#love, #instagood) |
| `linkedin` | 3–5 | Professional and topical only |
| `tiktok` | 3–6 | Mix trending + niche; avoid banned tags |
| `pinterest` | 2–3 | Keyword hashtags matched to pin description |
| `twitter` | 1–2 | One branded max; one topical max |
| `bluesky` | 0 | Platform convention is no hashtags |
| `threads` | 0–1 | Hashtags used sparingly |
| `reddit` | 0 | Hashtags read as marketing; remove them |
| `googlebusiness` | 0 | Not used by platform |
| `facebook` | 1–2 | Optional; brand-specific |
| `youtube` | 3–5 in description, 1 in title if relevant | Descriptions tolerate more |
| `telegram` | 0–2 | Channel-culture dependent |
| `snapchat` | 0 | Not used by platform |
| `whatsapp` | 0 | Not used by platform |

---

## Brand Voice Preservation

Every variant must pass these guardrails drawn from the active brand kit (`brands/<client-slug>/brand-kit.md`):

1. Tone matches the brand's voice spec (e.g., "direct, technically credible")
2. No blocked words (from the brand kit's "Words to Avoid")
3. Preferred words are represented where natural (from "Words to Use")
4. Emoji usage respects per-platform limits from the brand kit
5. CTA matches the client's approved CTA style

If a variant cannot satisfy all five guardrails, regenerate — do not ship it.

---

## CTA Catalog

Pick one CTA per post. "Learn more" is acceptable; blank is not. Examples mapped to common objectives:

| Objective | CTA options |
|---|---|
| Brand awareness | "Follow for more", "Save for later", "Share with your team" |
| Lead generation | "Get the guide", "Request a demo", "Join the waitlist" |
| Engagement | "What's your take?", "Drop a comment", "Tag a friend" |
| Product launch | "Try it today", "See what's new", "Book a walkthrough" |
| Community | "Join the conversation", "Share your build", "Introduce yourself" |
| Local (Google Business) | "Visit us today", "Claim the offer", "Call to book" |

---

## Media Notes in Captions

If a post depends on a media asset (image, video, carousel, reel, short, story):

- Include one line in the Media Notes column of the Content Calendar
- Cite: dimensions, duration, required overlays, brand safe zones, version (landscape/portrait)
- For carousels, note slide count and order of slides (1 = hook, last = CTA)
- For videos, note captions-on-by-default requirement and soundtrack licensing status

Captions must never describe content that the media does not contain.

---

## AI Enhancement Workflow

When `ANTHROPIC_API_KEY` is present and the user asks for enhanced drafting:

1. Draft the three variants with the rules above
2. Run a quality pass asking: "which variant would an experienced social editor ship?"
3. Revise the other two so they represent genuinely different angles — not alternate phrasings
4. Score each variant against the brand voice guardrails
5. Store scores in the Caption Copy Deck table

This workflow runs entirely inside the agent. No calls go to Zernio for caption content generation.
