# Scene Module: Villain Character Hook
> ID: `villain-hook`
> Type: hook (Scene 1)
> Compatible Formats: `villain-animation`
> Status: ✅ PROVEN — Clarifion ODRx brief (Scenes 1–5 villain format)

---

## WHAT IT DOES

Opens with animated villain characters — the failing/competing products rendered as cartoon objects with expressive faces and small arms — standing in the problem environment. Establishes the enemy and the frustration in one visual before a single word of VO plays. The viewer's problem is externalised as a villain, not their own failure.

**Why it works:** Villain characters make the problem feel conquerable. When a litter bag or a scented plug-in has a smug face, the viewer's frustration has a target. The animated format also bypasses competitor brand legal concerns while being more memorable than live footage. The emotional shorthand is immediate: chaotic + dark + villain face = "I know exactly what this is."

---

## VISUAL DIRECTION

```
Setting:  [PROBLEM_ENVIRONMENT] — the place where the problem lives.
          e.g. wall outlets (air quality), litter box area (pet odor), bathroom sink (skincare)
          Color palette: dark, cool, slightly chaotic. Contrasts sharply with the hero scenes.

Villain:  [VILLAIN_CHARACTER] — animated version of the competing/failed product.
          Has: expressive face (smug, angry, mocking), small stubby arms, exaggerated emotions.
          Positioned: center frame, between 2–3 other failed products.
          Animation: slight idle bounce or arm-wave — alive and antagonistic.

Animals/characters: If relevant to category — present and frustrated/unhappy.
                    Positioned near the villain (reinforces the problem, not the solution).
```

**Villain design by category:**
- Air quality / odor: Animated scented plug-in with smug face between 3 wall outlets
- Pet behavior: Litter bag villain inside/near litter box. Clay, crystal, enzyme cleaner villains.
- Supplement / pill: Pill bottle villain with exaggerated grimace. Supplement jar. 
- Skincare: Cream jar or serum bottle with frustrated face. "Still not working" energy.
- Home cleaning: Spray bottle villain, baking soda box, mop — all with villain faces.

---

## ON-SCREEN TEXT

```
Style:  Karaoke word-by-word — 1–4 words at a time. Key word highlighted in brand accent color.
        This is the ONLY text rhythm for this format. Do not use full sentences.

Hook line template:
  "[WHY NOTHING] / [CHANGED] / [AND YOU HAVE] / [MIGHT WORK] / [WE RAN OUT]"
  (each chunk = one karaoke beat, ~0.5–1 second each)

Examples:
  "WHY NOTHING / WORKED" → "AND YOU SPENT" → "$[AMOUNT]" → "TRYING"
  "STILL HAPPENING" → "EVERY SINGLE" → "DAY"
  "YOU'VE TRIED" → "EVERYTHING" → "NOTHING STICKS"
```

---

## ACTOR/VO DIALOGUE

```
This format uses VOICEOVER (not on-camera creator). The VO speaks over the animation.

Pattern: [addresses viewer's frustration directly] + [acknowledges failed attempts] + [implies answer is coming]

Templates:
  "Why nothing changed — and you have [FAILED_PRODUCT_1], [FAILED_PRODUCT_2], and [FAILED_PRODUCT_3]..."
  "You've tried everything. And [VILLAIN] is still there every single morning."
  "Still happening. Even after [DOLLAR_AMOUNT] and [TIME_SPENT]."

Delivery: Direct, slightly conspiratorial. NOT an announcer. Voice of a peer who's been there.
          Pace matches the karaoke text rhythm — one thought per beat.
```

---

## BRAND-KIT PLACEHOLDERS

| Placeholder | Source | Example |
|-------------|--------|---------|
| `[PROBLEM_ENVIRONMENT]` | `brand-kit.md → target_pain_point` | "wall outlets + living room" |
| `[VILLAIN_CHARACTER]` | Brief content / category | "animated scented plug-in with smug face" |
| `[FAILED_PRODUCT_1/2/3]` | Brief content | "Enzyme Cleaner, Scented Plug-In, Clay Litter" |
| `[DOLLAR_AMOUNT]` | Brief content | "$300" |
| `[BRAND_ACCENT_COLOR]` | `brand-kit.md → colors.secondary` | "2C7FF8" (Clarifion blue) |

---

## HOOK VARIATIONS FOR THIS MODULE (5 A–E)

```
Hook A — "Why Nothing Changed" (direct muse mirror)
  VO: "Why nothing changed — and you've tried [FAILED_1], [FAILED_2], [FAILED_3]..."
  Villain: center frame, mocking expression, surrounded by competing products

Hook B — "You've Spent [AMOUNT]"
  VO: "You've spent [AMOUNT] on [CATEGORY]. And [PROBLEM] is still there."
  Villain: inside/on the failed product, arms raised triumphantly

Hook C — "Every Morning / Every Night"
  VO: "Every single [morning/night]. Same problem. Different product. Nothing works."
  Villain: animated in daily-loop — same scene repeating

Hook D — "The Thing That Actually Works"
  VO: "The thing that actually works isn't what they keep selling you."
  Villain: running away from incoming hero product light (tone flip tease)

Hook E — "You Gave Up Too Soon"
  VO: "You didn't give up. The products gave up on you."
  Villain: visually failing/broken — villainizes the product, not the viewer
```

---

## JS STUB (hookCard)

```js
hookCard("A", "Villain Hook — Direct Muse Mirror",
  "VISUAL: Animated [PROBLEM_ENVIRONMENT]. [VILLAIN_CHARACTER] center frame with smug/angry face + small arms.\n" +
  "2–3 competing products visible around it. [ANIMAL/CHARACTER] unhappy nearby. Dark, chaotic color palette.\n\n" +
  "ON-SCREEN TEXT (karaoke): '[WHY_NOTHING]' → '[CHANGED]' → '[AND_YOU_HAVE]' — key word in [ACCENT_COLOR].\n\n" +
  "VO: '[HOOK_A_LINE]'\n\n" +
  "NOTE: Identical villain format to muse. Test first."
)
```

---

## AI GENERATION PROMPT STUB

```
3D animated [PROBLEM_ENVIRONMENT]. [VILLAIN_CHARACTER] with expressive cartoon face (smug/angry) and small stubby arms, positioned center frame. 2–3 other [FAILED_PRODUCTS] rendered as villain characters surrounding it. [ANIMAL/CHARACTER] in background looking frustrated/unhappy. Dark, cool, slightly chaotic color palette. Karaoke text overlaid word-by-word in white with [ACCENT_COLOR] highlight on key word. Animated villain has slight idle bounce. 9:16. 15–17 seconds.
```
