# Scene Module: Villain Agitation Stack
> ID: `villain-agitation`
> Type: body (Scenes 2–5)
> Compatible Formats: `villain-animation`
> Timecode: ~12s per scene (in 98s format); stack 4× for full agitation arc
> Status: ✅ PROVEN — Clarifion ODRx brief (Scenes 2–5)

---

## WHAT IT DOES

Each agitation scene introduces a different failed solution as an animated villain character. The viewer has tried this product too — and it failed them. Four stacked scenes build frustration to a crescendo before the hero product arrives. Each scene must feature a DIFFERENT villain and a DIFFERENT angle on the failure (cost, effort, danger, futility).

**Why it works:** The agitation stack is the emotional engine of this format. One failed solution is forgivable. Four failed solutions, each with its own villain character, builds a case that the problem is systemic — not the viewer's fault. By Scene 5, the viewer is primed to accept anything that actually works. The villain character format externalises the blame onto the product, not the person.

**Critical rule:** Stack exactly 4 agitation scenes (Scenes 2–5). Never fewer. The emotional build requires the full stack to work.

---

## SCENE STRUCTURE (one agitation = one villain)

```
Per-scene structure:
  Setting:   Same problem environment as Scene 1, slightly different angle/focus.
  Villain:   Different villain character than previous scene.
  Focus:     A different dimension of failure: COST / EFFORT / RISK / FUTILITY.
  Text:      Karaoke word-by-word, 1–4 words per beat.
  VO:        Direct address — "You've tried X. And Y. Because Z. But [problem] is still there."
  End beat:  Villain triumphant OR problem persisting — reinforces futility.
```

**4-Agitation Arc (proven order):**
| # | Villain Type | Failure Dimension | Karaoke Focus |
|---|---|---|---|
| Agitation 1 | Most common solution in category | COST ("You've spent $X") | Dollar amount wasted |
| Agitation 2 | Secondary common solution | EFFORT ("You've tried everything in X") | Number of attempts |
| Agitation 3 | Natural/DIY alternatives | FUTILITY ("Natural options that still failed") | Still happening |
| Agitation 4 | Most extreme/medical solution | RISK ("Even the risky option didn't help") | Side effects / extremity |

---

## VISUAL DIRECTION (per agitation scene)

```
Villain:   New character — different product category from previous scenes.
           Same animation style: expressive face, small arms, frustrated/smug emotion.
           Specific to the failed product: litter bag, pill bottle, spray can, serum tube, etc.

Setting:   Same core environment. Small variation in angle or focus area.
           Lighting: still dark/cool/chaotic — no warmth enters until Scene 6.

Animals/characters: Present in every scene. Still unhappy/frustrated.
                    Emotional state mirrors the ongoing problem, not resolution.

Beat:      Scene ends with villain still "winning" — problem unresolved.
           This is CRITICAL — do not let agitation scenes accidentally imply progress.
```

---

## ON-SCREEN TEXT (karaoke)

```
Format: 1–4 words per beat, 0.5–1 second each. Key word in [BRAND_ACCENT_COLOR].

Agitation 1 — COST:
  "YOU'VE SPENT" → "$[AMOUNT]" → "IN EVERY" → "[ROOM/AREA]"
  "RIGHT NEXT TO" → "[ANIMAL/PERSON]" → "YOU ARE JUST" → "[FAILURE_OUTCOME]"

Agitation 2 — EFFORT:
  "YOU'VE TRIED" → "[PRODUCT_CATEGORY]" → "AND YOUR [ANIMAL/PERSON]" → "[PROBLEM_PERSISTS]"
  "[SPECIFIC_PROBLEM]" → "SYSTEM" → "[STILL]" → "HAPPENING"

Agitation 3 — FUTILITY (natural/DIY):
  "YOU'VE TRIED" → "[NATURAL_SOLUTION_1]" → "AND [SOLUTION_2]" → "AND [SOLUTION_3]"
  "PROBLEM IS" → "[STILL]" → "EXACTLY WHERE" → "[THEY/IT] [LEFT/IS]"

Agitation 4 — RISK/EXTREME:
  "[EXTREME_OPTION]" → "SURE [SIDE_EFFECT]" → "WON'T [POSITIVE_THING]" → "WON'T [ANOTHER_POSITIVE]"
  "YOU GOT" → "[NEGATIVE_OUTCOME]" → "YOU'RE [VERB]-ING" → "THEM"
```

---

## ACTOR/VO DIALOGUE (per scene)

```
Pattern: [acknowledges the solution tried] + [why it seemed reasonable] + [why it still failed]

Agitation 1 template:
  "You've spent [AMOUNT] on [PRODUCT_CATEGORY]. Put [PRODUCT] in every [LOCATION].
   Right next to [ANIMAL/PERSON]. You are just [FAILURE_OUTCOME]."

Agitation 2 template:
  "You've tried [PRODUCT_TYPE_1]. And [PRODUCT_TYPE_2]. And [PRODUCT_TYPE_3].
   [PROBLEM] is [still exactly where it was / happening every day]."

Agitation 3 template:
  "You've tried [NATURAL_1] and [NATURAL_2] and [NATURAL_3].
   The problem doesn't care. [VILLAIN] is still [LAUGHING / THERE / WINNING]."

Agitation 4 template:
  "Sure — [EXTREME_OPTION] works. But [SIDE_EFFECT_1] and [SIDE_EFFECT_2].
   [NEGATIVE_FRAMING]. You're [VERB]-ing [THEM/IT]."

Delivery: Tone escalates across the 4 scenes — empathetic (S2) → exasperated (S3) → incredulous (S4) → almost absurd (S5).
```

---

## BRAND-KIT PLACEHOLDERS

| Placeholder | Source | Example (ODRx) |
|-------------|--------|----------------|
| `[VILLAIN_N_TYPE]` | Brief content | "animated litter bag" / "pill bottle" / "enzyme cleaner" |
| `[PRODUCT_CATEGORY]` | Brief content | "litter boxes" / "serums" / "supplements" |
| `[AMOUNT]` | Brief content | "$300" / "$500" |
| `[NATURAL_SOLUTION_N]` | Brief content | "vinegar" / "baking soda" / "enzyme spray" |
| `[EXTREME_OPTION]` | Brief content | "Floxetine" / "prescription topicals" / "laser" |
| `[BRAND_ACCENT_COLOR]` | `brand-kit.md → colors.secondary` | "2C7FF8" |

---

## ADAPTATION RULES

- **Agitation 1** always = the most common/expected solution (highest viewer recognition)
- **Agitation 4** always = the most extreme option (creates emotional peak before the flip)
- Never use real competitor brand names — use generic category labels
- Each villain must be visually distinct from all others — different shape, color, personality
- Dollar amounts should reflect real category spend — research before writing
- Never let any agitation scene accidentally solve the problem or imply partial improvement

---

## JS STUB (sceneBlock — replicate 4× with different values)

```js
// Agitation 1
sceneBlock("SCENE 2 — AGITATION 1", "17–29s  |  Consistent across all variations", [
  ["Visual Direction", "[VILLAIN_1_TYPE] character INSIDE / ON [FAILED_PRODUCT_1]. [ANIMAL/CHARACTER] still frustrated. Dark chaotic setting. Same environment as Scene 1."],
  ["On-Screen Text",   "Karaoke: 'YOU\\'VE SPENT' → '$[AMOUNT]' → '[FAILURE_CONTEXT]' — key word in [ACCENT_COLOR]."],
  ["VO",               "'You\\'ve spent [AMOUNT] on [PRODUCT_CATEGORY]. [FAILURE_DETAIL]. You are just [FAILURE_OUTCOME].'"],
  ["Purpose",          "Quantify the cost of the problem. Dollar amount makes the pain visceral. Villain inside the product = problem is IN the product, not the viewer."],
])

// Replicate for Agitation 2, 3, 4 — change villain, product, failure dimension
```

---

## AI GENERATION PROMPT STUB

```
AGITATION [N]:
3D animated [PROBLEM_ENVIRONMENT]. New villain: [VILLAIN_N_TYPE] with expressive cartoon face ([EMOTION]) and small arms. Positioned in/near [FAILED_PRODUCT_N]. [ANIMAL/CHARACTER] nearby, still unhappy. Dark cool chaotic lighting — identical to previous agitation scenes. Villain ends scene still triumphant / problem unresolved. Karaoke text overlaid. 9:16. 12 seconds.
```
