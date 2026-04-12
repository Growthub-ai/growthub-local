# Scene Module: BOGO + Meme Bookend Close
> ID: `bogo-meme-bookend`
> Type: cta (Scene 6 / final scene)
> Compatible Formats: `bedroom-minimic-talk`
> Timecode: 21–23s (in 23s format)
> Status: ✅ PROVEN — Solawave BOGO (Scene 6)

---

## WHAT IT DOES

The ad closes with two elements in rapid sequence: (1) the meme bookend — same character from Scene 1, now in an approving/satisfied state — and (2) a clean offer overlay with the BOGO/discount and landing page. The meme bookend is the emotional payoff: the journey from tired/frustrated to approved/satisfied, visualised in the same character.

**Why it works:** The meme bookend creates a narrative closure that feels earned, not manufactured. The viewer subconsciously tracks the character from Scene 1 (problem state) to Scene 6 (resolved state) — it's a micro-story arc in 2 seconds. The offer overlay follows immediately so the emotional high converts to action before the feeling fades. "link in bio" is the lowest-friction CTA on TikTok/Reels.

---

## VISUAL DIRECTION

```
Opening (0.5–1s): Optional meme bookend
  Same meme character from Scene 1, now in APPROVING / SATISFIED state.
  e.g. D.W. Arthur meme — smiling version / "we did it" version
  Overlaid on creator as in Scene 1 — creator's face visible above.
  Duration: 0.5–1 second max. Blink-and-you-see-it.

Main CTA (1–1.5s): Creator on camera
  Actor back on camera, energized. Mini-mic in one hand.
  [PRODUCT_NAME] raised toward camera — [ACTIVE_STATE] facing lens.
  Expression: warm, direct, genuine "you should do this" energy.
  NOT a scripted-looking smile — real confidence.

Outro (0.5s): Offer graphic overlay
  Clean graphic appears over or after creator:
  Large: "[OFFER_TEXT]" — bold, brand primary or white on dark
  Medium: "[LANDING_PAGE]"
  Small: "Shop Now →" or "Link in bio →"
  Optional strip: "Limited time  |  Results may vary"
```

---

## ON-SCREEN TEXT

```
OFFER_TEXT options (bold, large, centered):
  "BUY 1 GET 1 FREE"
  "[X]% OFF — TODAY ONLY"
  "FREE [GIFT/TRIAL] WITH ORDER"
  "LIMITED TIME OFFER"

LANDING_PAGE:
  "[BRAND_SLUG].co" or full URL — white, smaller than offer text.

CTA BUTTON TEXT:
  "Shop Now →"
  "Link in bio →"
  "Grab yours →"

COMPLIANCE STRIP (bottom, very small):
  "Limited time offer  |  Results may vary"
  Only include if making outcome claims elsewhere in the ad.
```

---

## ACTOR DIALOGUE

```
Pattern: [offer text spoken directly] + [lowest-friction action]

Templates:
  "[OFFER_TEXT] right now — link in bio."
  "It's [OFFER_TEXT] right now. Link in bio, go."
  "[OFFER_TEXT] at [LANDING_PAGE] — I'll link it."
  "[OFFER_TEXT]. Link below."

Delivery: Direct, energetic, brief. Max 8 words. No explanation of the offer.
          The viewer already knows what Solawave is — just close.
          The meme bookend (if used) covers the one second before this line.
```

---

## OFFER TYPES THIS MODULE SUPPORTS

| Offer | CTA Text | Urgency Signal |
|-------|----------|----------------|
| Buy 1 Get 1 Free | "BUY 1 GET 1 FREE" | Default urgency inherent |
| % Discount | "[X]% OFF — TODAY ONLY" | "TODAY ONLY" adds scarcity |
| Free gift with order | "FREE [GIFT] WITH YOUR ORDER" | Limited supply implied |
| Bundle deal | "[BUNDLE NAME] — [PRICE]" | Value framing |
| Free trial | "TRY FREE — LINK IN BIO" | Risk-free conversion |

---

## MEME BOOKEND SELECTION

```
Rule: Same meme character as Scene 1, emotional state FLIPPED.
      Problem state in Scene 1 → Resolved/approving state in Scene 6.

Pairings:
  Scene 1: D.W. (tired, dark circles) → Scene 6: D.W. (smiling, "old rebecca approves")
  Scene 1: Crying meme              → Scene 6: Same character happy/relieved
  Scene 1: "this is fine" dog        → Scene 6: Dog in better situation / unbothered
  Scene 1: Sad Keanu                 → Scene 6: Content Keanu (rare but works)
  Scene 1: "me after $300 on serums" → Scene 6: "me after [PRODUCT_NAME]" same format

If no meme was used in Scene 1: skip the bookend. Use creator-only CTA.
```

---

## BRAND-KIT PLACEHOLDERS

| Placeholder | Source | Example |
|-------------|--------|---------|
| `[OFFER_TEXT]` | `brand-kit.md → cta_offer` | "BUY 1 GET 1 FREE" |
| `[LANDING_PAGE]` | `brand-kit.md → landing_page` | "solawave.co" |
| `[PRODUCT_NAME]` | `brand-kit.md → primary_service` | "Solawave wand" |
| `[ACTIVE_STATE]` | Brief content | "red light glowing" |
| `[MEME_CHARACTER_RESOLVED]` | Matches Scene 1 meme | "D.W. from Arthur — smiling version" |

---

## JS STUB (sceneBlock row content)

```js
// Drop into sceneBlock() rows array for Scene 6
["Visual Direction",  "Optional: [MEME_CHARACTER_RESOLVED] bookend overlaid 0.5–1s (same character as Scene 1, approving state).\n\nActor: mini-mic in hand, [PRODUCT_NAME] raised toward camera ([ACTIVE_STATE]). Warm energized expression.\n\nOutro graphic: '[OFFER_TEXT]' bold + '[LANDING_PAGE]' + 'Shop Now →'. Optional strip: 'Limited time | Results may vary'."],
["Actor Line",        "'[OFFER_TEXT] right now — link in bio.'"],
["On-Screen Text",    "'[OFFER_TEXT]' — large bold\n'[LANDING_PAGE]'\n'Shop Now →'\n(Optional: 'Limited time  |  Results may vary')"],
["Mirrors (muse)",    "Meme bookend close mirrors muse's 'old rebecca approves' exit. Humor register stays through CTA — doesn't feel like an ad break.\n\nActor holding product up = muse holding products throughout."],
["Purpose",           "Drive the one action: click the link. [OFFER] is the urgency mechanism. 2 seconds max — viewer already knows. Just close."],
```

---

## AI GENERATION PROMPT STUB

```
Photoreal female creator, [AI_ACTOR_AGE], energized expression. Bedroom setting with slightly brighter warm light than previous scenes. Mini-mic in one hand, [PRODUCT_NAME] raised toward camera in other hand ([ACTIVE_STATE] facing lens). Warm, direct smile — genuine not performative. Optional opening 0.5s: [MEME_CHARACTER_RESOLVED] overlay (approving/satisfied version of Scene 1 meme). Transitions to clean offer graphic overlay: '[OFFER_TEXT]' bold + '[LANDING_PAGE]' + 'Shop Now →'. 9:16. 2 seconds.
```
