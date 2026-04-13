# Scene Module: Dollar Amount Confession Hook
> ID: `dollar-amount`
> Type: hook (Scene 1)
> Compatible Formats: `bedroom-minimic-talk`, `villain-animation`
> Status: ✅ PROVEN — Solawave BOGO (Hook C)

---

## WHAT IT DOES

Opens with a specific dollar amount the viewer has already wasted on the category. No product shown. No solution yet. Just the number — and the frustration. The specificity of the dollar amount is what makes it land: "spent $300 on serums" is a receipt the viewer recognizes from their own life.

**Why it works:** Specificity creates credibility. "$300" is a real number that signals the creator has lived the same experience. Vague language ("I tried so many things") is forgettable. A dollar amount is a memory trigger. Works across all demographics — everyone has overspent on something that didn't work.

---

## VISUAL DIRECTION

```
Frame:   Creator at desk, mini-mic in hand. Leaning slightly toward camera.
         No product shown. No meme overlay. Pure spoken confession.
         Expression: slightly exasperated → resolving to knowing.
Lighting: Warm ambient bedroom. Consistent with rest of format.
```

**Variation: Text-over-shoulder stack**
Dollar amount and product list appear as stacked text overlaid beside the creator's face:
```
"$300 on serums ❌"
"$120 eye cream ❌"  
"red light panel $600 ❌"
```

---

## ON-SCREEN TEXT

```
Option A — Single stat:
  "spent $[AMOUNT] on [CATEGORY]. still [PROBLEM]."

Option B — Stack:
  "$[AMOUNT_1] on [PRODUCT_1] ❌"
  "$[AMOUNT_2] on [PRODUCT_2] ❌"
  "$[AMOUNT_3] on [PRODUCT_3] ❌"

Style:  White text, black outline. Dollar amounts bolded.
        ❌ emoji optional — signals failure visually without words.
```

---

## ACTOR DIALOGUE

```
Pattern: [dollar amount + category] + [the failure] + [discovery pivot]

Templates:
  "I was that person. [AMOUNT] on [CATEGORY]. Zero results. Then I found this."
  "Spent [AMOUNT] on [CATEGORY_PRODUCTS]. Nothing was working. Until [PRODUCT_NAME]."
  "I did the [AMOUNT] routine. The whole thing. Didn't move the needle."

Delivery: Matter-of-fact. Not self-pitying. She's moved past it — this is the origin story.
          Slight emphasis on the dollar amount.
```

---

## BRAND-KIT PLACEHOLDERS

| Placeholder | Source | Example |
|-------------|--------|---------|
| `[AMOUNT]` | Brief context / category research | "$300" / "$500" / "$150" |
| `[CATEGORY]` | `brand-kit.md → industry` | "serums" / "supplements" / "litter" |
| `[CATEGORY_PRODUCTS]` | Brief content | "serums, eye creams, sheet masks" |
| `[PROBLEM]` | `brand-kit.md → target_pain_point` | "still saw fine lines" |
| `[PRODUCT_NAME]` | `brand-kit.md → primary_service` | "Solawave" |

**Amount calibration by category:**
- Skincare/beauty: $150–$400
- Pet products: $200–$500
- Home devices: $300–$800
- Supplements: $100–$300

---

## JS STUB (hookCard)

```js
hookCard("C", "Dollar Amount Confession",
  "VISUAL: Actor at desk, mini-mic in hand, leaning toward camera. No meme, no product. Pure confession.\n" +
  "Optional: stacked text overlay beside face listing products + prices + ❌.\n\n" +
  "ON-SCREEN TEXT: 'spent $[AMOUNT] on [CATEGORY]. still [PROBLEM].'\n\n" +
  "ACTOR LINE: 'I was that person. [AMOUNT] on [CATEGORY_PRODUCTS]. Zero results. Then I found [PRODUCT_NAME].'\n\n" +
  "NOTE: Dollar-amount specificity is the credibility signal. Pick an amount the target audience actually spends."
)
```

---

## AI GENERATION PROMPT STUB

```
Photoreal female creator, [AI_ACTOR_AGE], natural look, warm skin tone. Bedroom desk. Silver mini-mic in hand, leaning slightly toward camera. Expression: slightly exasperated at first, resolving to knowing confidence. No meme overlay. Warm ambient light. Optional: stacked text overlaid beside face ('$[AMOUNT] on [PRODUCT] ❌'). Direct, candid delivery. 9:16. 3 seconds.
```
