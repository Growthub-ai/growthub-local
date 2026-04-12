# Scene Module: POV Mirror Confession Hook
> ID: `pov-confession`
> Type: hook (Scene 1)
> Compatible Formats: `bedroom-minimic-talk`
> Status: ✅ PROVEN — Solawave BOGO (Hook E)

---

## WHAT IT DOES

Creator is caught in a candid moment: looking at herself in a mirror, scrutinizing her skin. "POV:" text appears — a TikTok native language signal that puts the viewer IN the moment. She turns to camera with mini-mic, transitioning from the private moment to the share.

**Why it works:** "POV:" is the highest-engagement text format on TikTok/Reels — it collapses the distance between creator and viewer. The mirror moment is relatable to anyone who's ever examined their own face. The turn-to-camera creates a reveal beat in 3 seconds.

---

## VISUAL DIRECTION

```
Frame:   Creator in bathroom or bedroom, facing mirror. Camera captures her OVER THE SHOULDER
         so we see both her face and the mirror reflection simultaneously.
         OR: creator looking directly into front camera as if checking skin — then pulls back.
Beat:    She leans in to look at her skin (1 second) → recognition/reaction face (0.5s) 
         → turns toward camera/phone with mini-mic (1.5s).
Lighting: Warm bathroom/vanity light. Natural, slightly imperfect. NOT studio.
```

---

## ON-SCREEN TEXT

```
Line 1:  "POV: [PAIN_POINT_AS_POV_STATEMENT]"

Templates:
  "POV: your $80 eye cream stopped working"
  "POV: you've been using the same serum for 6 months and nothing changed"
  "POV: you just turned [AGE] and your face noticed first"
  "POV: you've tried every skincare thing on your FYP"

Style:   White text, black outline. "POV:" in slightly smaller text than the statement.
         Appears at top of frame (unlike other hooks which use bottom third).
```

---

## ACTOR DIALOGUE

```
Pattern: [names the specific failed product/investment] + [pivot to solution]

Templates:
  "Been there. Here's what actually moved the needle."
  "That was me. And then I stopped wasting money and tried this."
  "Same. For [TIME]. Until I found [PRODUCT_NAME]."
  "I had that exact face every morning until [PRODUCT_NAME]."

Delivery: Matter-of-fact. She's past the frustration stage — she found the answer.
          Slight confidence in the turn-to-camera moment.
```

---

## BRAND-KIT PLACEHOLDERS

| Placeholder | Source | Example |
|-------------|--------|---------|
| `[PAIN_POINT_AS_POV_STATEMENT]` | `brand-kit.md → target_pain_point` | "your $80 eye cream stopped working" |
| `[PRODUCT_NAME]` | `brand-kit.md → primary_service` | "Solawave" |
| `[AGE]` | `brand-kit.md → target_age_range` midpoint | "28" / "32" |

---

## JS STUB (hookCard)

```js
hookCard("E", "POV Mirror Confession",
  "VISUAL: Creator in bathroom/bedroom facing mirror. Camera over-shoulder — we see face + reflection.\n" +
  "She leans in to examine skin, reaction face, then turns to camera with mini-mic.\n\n" +
  "ON-SCREEN TEXT (top of frame): 'POV: [PAIN_POINT_AS_POV_STATEMENT]'\n\n" +
  "ACTOR LINE: '[PIVOT_TO_SOLUTION_LINE]'\n\n" +
  "NOTE: Native TikTok language. Mirror moment is universally relatable. Best for 25–35 female demo."
)
```

---

## AI GENERATION PROMPT STUB

```
Photoreal female creator, [AI_ACTOR_AGE], natural look. Bathroom or bedroom vanity. Camera captures her over-the-shoulder — both face and mirror reflection visible. She leans in to look at her skin, expression: scrutiny → recognition → resolves to discovery. Turns to camera/phone with silver mini-mic in hand. Warm vanity/bathroom lighting. Unfiltered, authentic. Text overlay at top: 'POV: [PAIN_POINT]'. 9:16. 3 seconds.
```
