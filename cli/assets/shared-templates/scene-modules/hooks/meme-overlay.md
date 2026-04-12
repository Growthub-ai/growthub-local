# Scene Module: Meme Overlay Hook
> ID: `meme-overlay`
> Type: hook (Scene 1)
> Compatible Formats: `bedroom-minimic-talk`
> Status: ✅ PROVEN — Solawave BOGO (Hook A)

---

## WHAT IT DOES

Opens with a viral meme character overlaid on the creator's frame (lower 60% of screen). Creator's eyes are visible above the meme. The meme character expresses the target audience's pain state (tired, stressed, broke, defeated). The meme clears at ~2 seconds and the creator speaks — now the viewer is already emotionally calibrated.

**Why it works:** The meme is a pre-loaded emotional shorthand. The viewer sees "D.W. Arthur tired face" and instantly downloads 8 words of emotional context in 0.5 seconds. It also signals "this person has the same taste as me" — a micro-trust signal before any product is mentioned.

---

## VISUAL DIRECTION

```
Frame: Creator at bedroom desk, mini-mic at chin level.
Meme:  [MEME_CHARACTER] overlaid — fills lower 60% of frame.
       Creator's eyes and forehead visible above.
       Meme should match the pain state (tired = dark circles, broke = crying money, etc.)
Duration: 1.5–2 seconds of meme before it clears or fades.
Lighting: Warm ambient — bedroom or desk lamp.
```

**Meme selection guide:**
- Under-eye / tired skin → D.W. from Arthur (dark circles), "4am" memes
- Wasted money on skincare → Sad Keanu, Crying Jordan, "SPENT $300" text meme
- Feeling old → Miss Minutes, aging character memes
- Frustrated with solutions not working → "This is fine" dog, "I've tried everything" formats
- Skepticism → "well yes but actually no" meme, Pacha "ugh finally" reverse

---

## ON-SCREEN TEXT

```
Line 1: "[RELATABLE_PAIN_STATEMENT]"
         e.g. "me looking at my forehead every morning"
         e.g. "oh hey 4am its me"
         e.g. "me after spending $300 on skincare"

Style:   White text, black outline. Bold key words. Bottom third.
Timing:  Text appears with meme, stays through creator's first spoken word.
```

---

## ACTOR DIALOGUE (spoken after meme clears)

```
Pattern: [acknowledgment of meme state] + [pivot to discovery]

Templates:
  "ok but actually... I found something."
  "real. and then I found [PRODUCT_NAME]."
  "been that person. here's what actually worked."
  "[laugh/exhale] — ok so this changed it."

Delivery: Casual, slightly conspiratorial. NOT an announcer voice. 
          Like texting a friend the thing that fixed it.
```

---

## BRAND-KIT PLACEHOLDERS

| Placeholder | Source | Example |
|-------------|--------|---------|
| `[MEME_CHARACTER]` | User direction or brief | "D.W. from Arthur (tired face)" |
| `[RELATABLE_PAIN_STATEMENT]` | `brand-kit.md → target_pain_point` | "me looking at my forehead every morning" |
| `[PRODUCT_NAME]` | `brand-kit.md → primary_service` | "Solawave wand" |

---

## MUSE REFERENCE

Muse: @frankyshaw — frame_1s.jpg, frame_2s.jpg
Text: "oh hey 4am its me" + "getting five"
Meme: D.W. from Arthur (cartoon character with dark circles, tired expression)
Format: Meme overlay on creator's face. Eyes visible above. Mini-mic in hand.

---

## JS STUB (hookCard)

```js
hookCard("A", "Tired Skin Meme — Direct Muse Mirror",
  "VISUAL: [MEME_CHARACTER] overlaid on lower 60% of frame. Actor's eyes visible above. Mini-mic in hand.\n\n" +
  "ON-SCREEN TEXT: '[RELATABLE_PAIN_STATEMENT]'\n\n" +
  "ACTOR LINE (after meme clears): '[PIVOT_LINE_TO_PRODUCT]'\n\n" +
  "NOTE: Direct mirror of muse format. Test first — highest muse fidelity."
)
```

---

## AI GENERATION PROMPT STUB

```
Photoreal female creator, [AI_ACTOR_AGE], natural look, warm skin tone. Bedroom desk. Casual [OUTFIT]. Silver condenser mini-mic held at chin. [MEME_CHARACTER] overlay fills lower 60% of frame — creator's eyes and forehead visible above. She glances slightly downward at the meme, looks up with a knowing half-smile. Warm ambient light from left (bedside lamp). Handheld feel. Authentic TikTok creator bedroom aesthetic. 9:16. 3 seconds.
```
