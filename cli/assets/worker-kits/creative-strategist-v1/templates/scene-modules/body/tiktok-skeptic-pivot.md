# Scene Module: TikTok Skeptic Pivot
> ID: `tiktok-skeptic-pivot`
> Type: body (Scene 3)
> Compatible Formats: `bedroom-minimic-talk`
> Timecode: 8–13s (in 23s format)
> Status: ✅ PROVEN — Solawave BOGO (Scene 3)

---

## WHAT IT DOES

A TikTok comment bubble ("Is this legit tho?") appears overlaid on screen. The creator reads it, recognizes it as her own former question, and uses it as the bridge to introduce the product. The comment externalises the viewer's skepticism — she answers it, not defensively, but as someone who did the research.

**Why it works:** This is the highest-leverage scene in the format. By the time Scene 3 starts, the viewer is curious but skeptical. The comment names their doubt in their own voice before they consciously form the objection. The creator's response ("I asked that too — here's what I found") converts resistance into open curiosity. Product introduced here lands 3× harder than if introduced in Scene 2.

---

## VISUAL DIRECTION

```
Frame:    Creator close-up. Same warm bedroom setting.
Comment:  TikTok-style comment bubble overlaid — dark rounded rectangle, white text.
          Username: @[generic relatable handle — e.g. @sarahtrying2024]
          Comment text: "Is this legit tho?" or variation (see below)
          Positioned: lower-center or left-of-center. Does NOT cover creator's face.
Beat:     Creator glances DOWN at comment (0.5s) → slight smile / raised eyebrow (0.5s)
          → looks UP at camera (1s) → lifts [PRODUCT_NAME] into frame ([ACTIVE_STATE] visible).
Duration: 4–5 seconds total.
```

**Comment text variations:**
```
"Is this legit tho?"                          ← default (proven)
"wait does this actually work"
"is this legit or just another [CAT] scam?"
"tried so many of these. do they actually work?"
"my derm said these don't do anything lol"
```

---

## ON-SCREEN TEXT

```
Step 1:  TikTok comment bubble visible for 1.5–2 seconds.
Step 2:  Comment fades. Creator's response caption appears:
         "[RESPONSE_LINE]"
         e.g. "that's literally what I asked."
         e.g. "i went down the rabbit hole for you."

Step 3:  Product mechanism caption:
         "[MECHANISM]. at home."
         e.g. "red light therapy. at home."
         Key word ([MECHANISM]) bolded/highlighted.
```

---

## ACTOR DIALOGUE

```
Pattern: [validates the comment] + [earned credibility — she did the research] + [mechanism reveal]

Full template:
  "That's literally what I said. So I looked it up.
   [MECHANISM] — [WHAT_IT_DOES] — in [PRODUCT_FORM] you use at home."

Short template:
  "Same question. I looked it up. [MECHANISM]. At home. For [PRICE_ANCHOR]."

Delivery: Slight amused recognition at the comment. Then direct, clear, confident.
          She's answering a question she had herself — not defending a brand.
          Speed: crisp but not rushed. ~30 words in 4–5 seconds.
```

---

## TRANSITION OUT

```
Immediate cut to product in active state ([ACTIVE_STATE] in motion) — Scene 4 Demo.
The word "home" or the mechanism name is the verbal cue to cut.
Do NOT linger. The momentum built here needs an immediate visual payoff.
```

---

## BRAND-KIT PLACEHOLDERS

| Placeholder | Source | Example |
|-------------|--------|---------|
| `[MECHANISM]` | `brand-kit.md → approved_phrases` | "red light therapy" / "UV-C light" / "pheromone tech" |
| `[WHAT_IT_DOES]` | Brief content | "reduces fine lines" / "eliminates odor at the source" |
| `[PRODUCT_FORM]` | Brief content | "a wand" / "a plug-in device" / "a patch" |
| `[PRICE_ANCHOR]` | Brief / brand-kit | "under $200" / "$49" / "less than one derm visit" |
| `[ACTIVE_STATE]` | Brief content | "red light glowing" / "UV-C on" / "pheromone releasing" |
| `[PRODUCT_NAME]` | `brand-kit.md → primary_service` | "Solawave" |

---

## JS STUB (sceneBlock row content)

```js
// Drop into sceneBlock() rows array for Scene 3
["Visual Direction",  "TikTok comment bubble overlaid: 'Is this legit tho?' — actor glances down, slight smile, looks up at camera. Lifts [PRODUCT_NAME] into frame — [ACTIVE_STATE] visible."],
["Actor Line",        "'That\\'s literally what I said. So I looked it up. [MECHANISM] — [WHAT_IT_DOES] — in [PRODUCT_FORM] you use at home.'"],
["On-Screen Text",    "Comment bubble: 'Is this legit tho?' → clears → response: 'that\\'s literally what I asked.' → '[MECHANISM]. at home.' (key word bolded)."],
["Mirrors (muse)",    "'Is this legit?' mirrors muse's 'if you even [care]' — both address viewer skepticism, breaking 4th wall.\n\n'[MECHANISM]. at home.' mirrors muse's 'is the only' — the revelation moment."],
["Purpose",           "Intercept #1 objection before it forms. [ACTIVE_STATE] = immediate visual proof product does something."],
["Transition",        "Cut to [PRODUCT_NAME] in use — [ACTIVE_STATE] in motion."],
```

---

## AI GENERATION PROMPT STUB

```
Photoreal female creator, [AI_ACTOR_AGE], natural look. Bedroom desk. Silver mini-mic visible. TikTok comment bubble overlaid: 'Is this legit tho?' (@[generic_username], dark rounded rectangle, white text). She glances DOWN at comment, raises eyebrow in recognition, looks UP at camera with slight knowing smile. Then lifts [PRODUCT_NAME] into frame — [ACTIVE_STATE] facing camera. Warm bedroom lighting. Handheld feel. 9:16. 5 seconds.
```
