# Scene Module: TikTok Comment Hook
> ID: `tiktok-comment`
> Type: hook (Scene 1)
> Compatible Formats: `bedroom-minimic-talk`
> Status: ✅ PROVEN — Solawave BOGO (Hook B)

---

## WHAT IT DOES

Opens with a TikTok-style comment bubble overlaid on screen. The comment voices the viewer's exact skepticism about the category/product ("Is this legit or just another skincare scam?"). The creator reads it, recognizes it, and responds directly to camera — turning the comment into a shared moment rather than a defensive rebuttal.

**Why it works:** It names the objection in the viewer's own voice before the viewer consciously forms it. The comment feels like a peer asking, not an ad defending. The creator's response ("Girl, I had the same question") transforms skepticism into curiosity in 3 seconds. High persuasion hook for any category with trust barriers.

---

## VISUAL DIRECTION

```
Frame:   Creator at bedroom desk, mini-mic in one hand.
         She's holding her phone slightly toward the camera, or comment appears as overlay.
Comment: TikTok-style comment bubble (dark rounded rectangle, white username + text).
         Positioned in lower-middle or left-of-center of frame.
         Creator glances DOWN at it → raises an eyebrow → looks UP at camera.
Duration: Comment visible for 1.5–2 seconds.
Lighting: Warm bedroom ambient.
```

**Comment text options (pick one per variation):**
```
"Is this legit or just another skincare scam?"
"does this actually work or is it just hype"
"Is this legit tho?"
"wait is this actually real??"
"tried so many of these. Do they actually work?"
```

---

## ON-SCREEN TEXT

```
Overlay:  [TikTok comment bubble] — "Is this legit or just another [CATEGORY] scam?"
          Username: @[generic — e.g. @sarahtrying2024 / @beautygirl_real]

After:    Comment fades. Creator's caption appears:
          "[RESPONSE_LINE]"
          e.g. "girl. i had the same question."
```

---

## ACTOR DIALOGUE

```
Pattern: [validates the question] + [earned credibility signal] + [pivot to answer]

Templates:
  "Girl. I had the same question. So I actually tested it."
  "Literally me 3 weeks ago. I looked it up."
  "Same. I went down the rabbit hole so you don't have to."
  "I asked that too. Here's what I found."

Delivery: Slight amused smile at the comment. Recognition, not defensiveness.
          She's not selling — she's answering a question she had herself.
```

---

## BRAND-KIT PLACEHOLDERS

| Placeholder | Source | Example |
|-------------|--------|---------|
| `[CATEGORY]` | `brand-kit.md → industry` | "skincare" / "pet" / "supplement" |
| `[PRODUCT_NAME]` | `brand-kit.md → primary_service` | "Solawave wand" |
| `[RESPONSE_LINE]` | Brief content | "girl. i had the same question." |

---

## DUAL USE: Hook OR Body Scene

This module works in TWO positions:
1. **As Hook A or B** (Scene 1, 0–3s) — pure skepticism open. No product shown.
2. **As Scene 3 body beat** (8–13s) — comment appears mid-ad as the "skeptic pivot" after the problem confession. Product is introduced immediately after.

When used in Scene 3, pair with `body/tiktok-skeptic-pivot.md` for the full beat.

---

## MUSE REFERENCE

Muse: @frankyshaw — frames around 11–13s (the "if you even" + "me rn editing" beat)
The muse doesn't use a literal TikTok comment — but addresses viewer skepticism directly at this beat.
The TikTok comment format is the **Solawave enhancement** of that skepticism-disarm beat.

---

## JS STUB (hookCard)

```js
hookCard("B", "TikTok Comment — 'Is This Legit?'",
  "VISUAL: TikTok comment bubble overlaid: 'Is this legit or just another [CATEGORY] scam?'\n" +
  "Actor glances down at it, raises eyebrow, looks back at camera with amused recognition.\n\n" +
  "ON-SCREEN TEXT: [comment bubble] → clears → '[RESPONSE_LINE]'\n\n" +
  "ACTOR LINE: '[RESPONSE_LINE] So I actually tested it.'\n\n" +
  "NOTE: Preempts #1 consumer objection in the first 2 seconds. High persuasion."
)
```

---

## AI GENERATION PROMPT STUB

```
Photoreal female creator, [AI_ACTOR_AGE], natural look, warm skin tone. Bedroom desk. Silver mini-mic in one hand. TikTok comment bubble overlaid on frame: 'Is this legit or just another [CATEGORY] scam?' (dark rounded rectangle, white text, @username visible). She looks down at comment, raises an eyebrow in recognition, looks up at camera with slight amused smile. Warm ambient bedroom lighting. Authentic TikTok creator aesthetic. 9:16. 3 seconds.
```
