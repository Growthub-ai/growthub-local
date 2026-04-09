# Scene Module: Mini-Mic Problem Confession
> ID: `minimic-problem`
> Type: body (Scene 2)
> Compatible Formats: `bedroom-minimic-talk`
> Timecode: 3–8s (in 23s format)
> Status: ✅ PROVEN — Solawave BOGO (Scene 2)

---

## WHAT IT DOES

The creator lists the things she's already tried — with specificity. Mini-mic in hand, product held casually in the other (not showcasing it yet). The point is to establish shared experience: she's not naive, she's done the work, nothing worked. This converts the viewer from skeptic to peer before the product is ever named.

**Why it works:** Shared struggle = trust. If she's tried the same $300 serums and $120 eye creams the viewer has, she has earned the right to recommend something. The casual product hold (not presenting it) creates subconscious anticipation — the viewer wonders what she's holding — without feeling sold to.

---

## VISUAL DIRECTION

```
Frame:    Creator close-up. Mini-mic in one hand at chin/chest level.
          [PRODUCT_NAME] held casually in OTHER hand — not presented, just held.
          Skincare/category items slightly out-of-focus in background (shelf, counter).
Lighting: Warm ambient — same bedroom setup as hook scene.
Camera:   Tight angles alternating: face → hands/product → face.
          Slight low angle — intimate, confiding.
Duration: 4–5 seconds.
```

---

## ON-SCREEN TEXT

```
Lists the failed products/attempts the creator has tried.
Appears as stacked caption beats, not all at once.

Template:
  "[FAILED_CATEGORY_1]. [FAILED_CATEGORY_2]. [FAILED_CATEGORY_3]."
  Key words bolded. White text, black outline. Bottom third.

Examples:
  "serums. eye creams. sheet masks."
  "$600 red light panels. microneedling. facials."
  "clay litter. crystal litter. enzyme cleaner."
  "supplements. probiotics. prescription topicals."
```

---

## ACTOR DIALOGUE

```
Pattern: [category items tried + dollar anchor] + [the honest failure] + [leads into product]

Full template:
  "I've tried [FAILED_1]. [FAILED_2]. [FAILED_3]. [DOLLAR_AMOUNT] later.
   Nothing was giving me what I actually needed for [PAIN_POINT]."

Short template (for tighter edits):
  "[DOLLAR_AMOUNT] on [CATEGORY_PRODUCTS]. Nothing for [PAIN_POINT]. Until this."

Delivery: Candid, slightly frustrated — but resolved. She's past the frustration.
          This is the origin story, not the complaint. Keep it moving.
          Target: 4–5 seconds spoken, ~30–35 words max.
```

---

## TRANSITION OUT

```
Direct cut to the product being lifted into frame (Scene 3 — Skeptic Pivot).
OR: Creator lifts the product naturally at end of line — camera follows.
Do NOT fade or wipe — this format uses hard cuts throughout.
```

---

## BRAND-KIT PLACEHOLDERS

| Placeholder | Source | Example |
|-------------|--------|---------|
| `[FAILED_1/2/3]` | Brief content + category research | "serums / eye creams / sheet masks" |
| `[DOLLAR_AMOUNT]` | Brief content | "$300" |
| `[CATEGORY_PRODUCTS]` | Brief content | "serums and red light panels" |
| `[PAIN_POINT]` | `brand-kit.md → target_pain_point` | "fine lines" / "cat odor" |
| `[PRODUCT_NAME]` | `brand-kit.md → primary_service` | "Solawave wand" |

---

## JS STUB (sceneBlock row content)

```js
// Drop into sceneBlock() rows array for Scene 2
["Visual Direction", "AI actor close-up, mini-mic in one hand at chin level. [PRODUCT_NAME] held casually in other hand — not presenting, just holding. [CATEGORY_ITEMS] slightly out-of-focus on shelf behind. Warm ambient light. Tight alternating angles: face / hands."],
["Actor Line",       "'I've tried [FAILED_1], [FAILED_2], [FAILED_3]. [DOLLAR_AMOUNT] later. Nothing was giving me what I actually needed for [PAIN_POINT].'"],
["On-Screen Text",   "'[FAILED_1]. [FAILED_2]. [FAILED_3].' — stacked caption beats. Key words bold."],
["Purpose",          "Build credibility through shared experience. Positions [PRODUCT_NAME] reveal as earned discovery, not ad pitch."],
["Transition",       "Direct cut to [PRODUCT_NAME] lifted into frame for Scene 3."],
```

---

## AI GENERATION PROMPT STUB

```
Photoreal female creator, [AI_ACTOR_AGE], natural look. Bedroom desk. Silver mini-mic in left hand at chin level. [PRODUCT_NAME] held casually in right hand (not presenting — just in hand). [CATEGORY_ITEMS] slightly blurred on shelf behind. She speaks directly and candidly — slightly frustrated resolving to confident. Warm golden ambient light. Tight alternating angles: face close-up / hands + product. Handheld feel. 9:16. 5 seconds.
```
