# Ad Format: Villain Object Animation
> ID: `villain-animation`
> Category: Pet Products / Home Devices / Supplements / Any product displacing an incumbent
> Length: 90–120 seconds (proven at 98s)
> Scene Count: 9
> Hook Variations: 5 (A–E)
> Status: ✅ PROVEN — Clarifion ODRx brief, April 2026
> Aspect Ratios: 9:16 primary, 1:1 secondary

---

## MUSE REFERENCE

- **Creator/Brand:** TheraPet (AI animation ad)
- **URL:** https://www.facebook.com/100068524006696/posts/1227321179562004
- **Original product featured:** TheraPet pheromone plug-in device (pet behavior / cat marking)
- **Local muse file:** `~/Downloads/AQN2IbZ…mp4`
- **Runtime:** 98.47 seconds | 360×640 | 9:16 vertical | 30fps
- **Why it works:** Long-form agitation stack + villain character format creates emotional investment before the product appears. 4× agitation scenes build genuine frustration — by the time the hero product arrives, the viewer is psychologically primed to want it. Animated villain objects prevent competitor brand legal issues while being more visually memorable than live footage. Tone flip at Scene 6 is a hard emotional reset — the color/warmth change signals "it's over now."

---

## FORMAT SIGNALS (non-negotiable)

1. **Animated villain objects** — competing/failed products rendered as cartoon characters with expressive faces, small arms, frustrated/evil expressions. Never show real competitor branding — use generic category labels ("Enzyme Cleaner," "Scented Plug-In," "Litter Bag").
2. **4× agitation stack** — Scenes 2–5 are each a different failed solution. Each one ends with the villain still losing / the problem persisting. Do not compress to fewer agitation scenes — the stack is what builds the emotional case.
3. **Karaoke word-by-word text** — 1–4 words at a time, key word highlighted in brand accent color. This text rhythm is sacred. Full sentences break the format.
4. **Hard tone flip at Scene 6** — full color, lighting, energy reversal. Cold/chaotic/frustrated → warm/golden/calm. This scene flip is the emotional payoff. It must be distinct — not a gentle transition.
5. **Product trio reveal** — 3 hero product units on the floor/surface in formation before being plugged in. This staging is consistent across the muse.
6. **Gray-haired woman social proof** — Carol-type persona in Scene 8 with a calendar on the wall showing the guarantee period. This is the trust anchor before the CTA.
7. **Stacked product boxes CTA** — Scene 9 shows bundled/stacked product boxes with satisfied animals/characters. Product must be in its packaging, not just the unit.

---

## PROVEN SCENE STRUCTURE

| # | Scene Name | Timecode | Beat | Sacred Element |
|---|------------|----------|------|----------------|
| 1 | Hook | 0–17s | Scroll stop — villain established | Villain between 3 competing devices. Agitation energy. Hook line variations A–E. |
| 2 | Agitation 1 | 17–29s | Failed solution #1 | Villain INSIDE the failed product. Specific dollar amount wasted. |
| 3 | Agitation 2 | 29–41s | Failed solution #2 | Different villain character / product category. "You've tried [X]..." |
| 4 | Agitation 3 | 41–50s | Failed solution #3 | Different villain — natural/DIY solutions that also fail. |
| 5 | Agitation 4 | 50–62s | Failed solution #4 | Most extreme failed solution — medical/pharmaceutical or highest-stakes option. |
| 6 | Product Intro — TONE FLIP | 62–74s | Hero enters — full emotional reset | Warm lighting ON. Hero product in trio formation on floor, glowing. Problem framing drops. |
| 7 | Product in Action | 74–83s | Mechanism proof | Product plugged in / in use. Animal/character calm below it. Low camera angle. |
| 8 | Social Proof | 83–92s | Trust anchor | Carol-type persona + satisfied animals + calendar (guarantee days). |
| 9 | CTA | 92–98s | Convert | Stacked product boxes + animals + satisfaction guarantee text. |

---

## SCENE MODULES USED IN THIS FORMAT

| Scene | Module ID | File |
|-------|-----------|------|
| 1 | `villain-hook` | `hooks/villain-hook.md` |
| 2–5 | `villain-agitation` × 4 | `body/villain-agitation.md` |
| 6–7 | product intro + in-action (format-specific — use inline, not modular) | — |
| 8 | social proof persona (format-specific — use inline) | — |
| 9 | `guarantee-close` | `cta/guarantee-close.md` |

---

## ADAPTATION RULES

### Keep (sacred)
- 9 scenes — no exceptions
- 4 agitation scenes (Scenes 2–5) — never compress to fewer
- Animated villain object format — never swap to real competitor footage
- Hard tone flip at Scene 6 — warm/golden must be visually distinct from Scenes 1–5
- Karaoke word-by-word text rhythm — 1–4 words at a time
- Gray-haired woman persona in Scene 8 — age and warmth signal are part of the trust mechanic
- Stacked product boxes in CTA — not just the device

### Swap (per brand)
- Villain character design — match the category (litter bag for pet, pill bottle for supplement, etc.)
- Dollar amounts — match what target audience actually spends ($300 on litter, etc.)
- Calendar day count — match guarantee period exactly (30 days for ODRx, 60 days for TheraPet)
- Animal type — match product's target animal (cats, dogs, etc.)
- Guarantee language — must match compliance exactly
- Product glow color — match brand's device color/LED color

### Never
- Real competitor brand names — use generic labels
- "Home stops smelling" → check compliance, may need "room" instead
- Specific medical claims in agitation scenes — "zombifying" language only if cleared
- Tone flip before Scene 6 — the first 5 scenes must stay cold/frustrated

---

## AI ACTOR / ANIMATION SPEC

```yaml
character_style:    "Animated 3D — expressive faces, small arms, exaggerated frustrated emotions"
villain_format:     "Product objects as characters — litter bags, pill bottles, spray cans, etc. each with villain face"
hero_product:       "Clean, glowing, warm — NOT animated with face. Product is aspirational, not a character."
social_proof_persona: "Animated woman, 60–70, gray or white hair, warm smile. 'Carol'-type. Relatable grandmother energy."
setting_villain:    "Chaotic, dark, cluttered — matches the frustration of the problem"
setting_hero:       "Warm, golden, organized — immediate visual contrast from villain scenes"
```

---

## DOCX JS STUBS

Paste these sceneBlock() calls. Replace `[PLACEHOLDERS]`.

```js
// SCENE 1 — Hook (use sceneBlock + 5 hookCards above it)
sceneBlock("SCENE 1 — HOOK", "0–17s  |  MUST stop the scroll", [
  ["Visual Direction", "Animated setting: [PROBLEM_ENVIRONMENT]. Villain character ([VILLAIN_1_TYPE] with angry face + small arms) positioned between 3 competing [PRODUCT_CATEGORY] devices. Chaotic, dim, frustrated energy."],
  ["On-Screen Text",   "Karaoke word-by-word: [HOOK_LINE] — 1–4 words at a time. Key word highlighted in [BRAND_ACCENT_COLOR]."],
  ["VO",               "[HOOK_VO_LINE]"],
  ["Purpose",          "Establish the problem AND the villain in one scene. Viewer must recognize their own frustration immediately."],
])

// SCENE 2 — Agitation 1
sceneBlock("SCENE 2 — AGITATION 1", "17–29s  |  Consistent across all variations", [
  ["Visual Direction", "[VILLAIN_1_TYPE] INSIDE the failed product ([SPECIFIC_PRODUCT]). [ANIMAL/CHARACTER] still frustrated. Same chaotic setting."],
  ["On-Screen Text",   "Karaoke: '[DOLLAR_AMOUNT_WASTED] / [PRODUCT_CATEGORY] / [FAILURE_STATEMENT]'"],
  ["VO",               "[AGITATION_1_VO]"],
  ["Purpose",          "Quantify the pain. Dollar amount makes it visceral. Villain inside the product = the problem is in the product, not the user."],
])

// SCENES 3–5: repeat sceneBlock pattern with different villain types and products

// SCENE 6 — Tone Flip + Product Intro
sceneBlock("SCENE 6 — TONE FLIP + PRODUCT INTRO", "62–74s  |  EMOTIONAL RESET", [
  ["Visual Direction", "FULL TONE FLIP: warm golden lighting replaces cold/chaotic. [HERO_PRODUCT] × 3 units in trio formation on [SURFACE], [ACTIVE_STATE] glowing. [ANIMAL/CHARACTER] present and CALM. No villain characters."],
  ["On-Screen Text",   "Karaoke: '[UNLIKE_THOSE / PRODUCT_NAME / ALL IN ONE]' — positive framing for first time"],
  ["VO",               "[PRODUCT_INTRO_VO — first mention of hero product by name]"],
  ["Purpose",          "Full emotional reset. Problem era is over. Every visual signal (color, warmth, calm animals) signals the solution has arrived."],
])

// SCENE 7 — Product in Action
sceneBlock("SCENE 7 — PRODUCT IN ACTION", "74–83s  |  Mechanism proof", [
  ["Visual Direction", "[HERO_PRODUCT] plugged in / in use. [ACTIVE_STATE] visible. [ANIMAL/CHARACTER] calm and resting below or near device. Low camera angle looking up at product."],
  ["On-Screen Text",   "Karaoke: '[MECHANISM] / [KEY_BENEFIT] / [TIME_CLAIM]'"],
  ["VO",               "[MECHANISM_VO — how it works, simply]"],
  ["Purpose",          "Show the product DOING SOMETHING. The [ACTIVE_STATE] is the proof. Low camera angle makes product feel significant."],
])

// SCENE 8 — Social Proof
sceneBlock("SCENE 8 — SOCIAL PROOF", "83–92s  |  Trust anchor", [
  ["Visual Direction", "Animated [PERSONA_AGE]-year-old woman, warm smile. [ANIMAL/CHARACTER] happy beside her. Calendar on wall showing [GUARANTEE_DAYS] days."],
  ["On-Screen Text",   "Karaoke: '[GUARANTEE_DAYS] DAYS / [PRODUCT_BENEFIT] / [ACTION]'"],
  ["VO",               "[SOCIAL_PROOF_VO]"],
  ["Purpose",          "Human trust anchor before the ask. Calendar = risk reversal is real. Persona age should match target audience."],
])

// SCENE 9 — CTA
sceneBlock("SCENE 9 — CTA", "92–98s  |  Convert", [
  ["Visual Direction", "Bokeh/clean background. Stacked [HERO_PRODUCT] boxes. [ANIMAL/CHARACTER] happy. Satisfaction guarantee badge visible."],
  ["On-Screen Text",   "Karaoke: '[SOCIAL_PROOF_NUMBER] / [OFFER_TEXT] / [GUARANTEE_TEXT]'"],
  ["VO",               "[CTA_VO — product name + action + guarantee]"],
  ["Purpose",          "Drive the one action. Stacked boxes signal availability/popularity. Guarantee removes final objection."],
])
```

---

## AI GENERATION PROMPTS (per-scene stubs)

```
SCENE 1 — Villain Hook
3D animated [PROBLEM_ENVIRONMENT]. [VILLAIN_1_TYPE] character with angry cartoon face and small arms stands between 3 competing [PRODUCT_CATEGORY] devices. Dark, chaotic, frustrated color palette. [ANIMAL/CHARACTER] present looking unhappy. Karaoke text overlaid word-by-word. 9:16. 17 seconds.

SCENES 2–5 — Agitation Stack
3D animated [VILLAIN_N_TYPE] character inside/near [FAILED_PRODUCT]. Same chaotic setting. Each scene ends with villain laughing or problem persisting. 9:16. 8–12 seconds each.

SCENE 6 — Tone Flip
DRAMATIC TRANSITION: cold/chaotic → warm/golden. [HERO_PRODUCT] × 3 units on [SURFACE] glowing [ACTIVE_COLOR]. [ANIMAL/CHARACTER] calm and peaceful. Soft warm ambient lighting replaces all previous harsh tones. 9:16. 12 seconds.

SCENE 9 — CTA Close
Clean bokeh background. Stacked [HERO_PRODUCT] boxes in pyramid/stack arrangement. [ANIMAL/CHARACTER] happy sitting nearby. Satisfaction guarantee badge in corner. Warm, aspirational lighting. 9:16. 6 seconds.
```

---

## FIRST DEPLOYED — Clarifion ODRx Campaign

- Brief: `~/Downloads/Clarifion_ODRx_VideoBrief_TheraPetAI_v1_20260408.docx`
- Brand kit: `brands/clarifion/brand-kit.md`
- Script: `/tmp/docx_work/odrx_brief_v3.js`
