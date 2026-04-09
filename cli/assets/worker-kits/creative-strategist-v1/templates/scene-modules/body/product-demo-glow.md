# Scene Module: Product Demo — Glow / Active Effect
> ID: `product-demo-glow`
> Type: body (Scene 4)
> Compatible Formats: `bedroom-minimic-talk`
> Timecode: 13–18s (in 23s format)
> Status: ✅ PROVEN — Solawave BOGO (Scene 4)

---

## WHAT IT DOES

Close-up of the product in active use — the mechanism is visible (red light, UV-C glow, steam, vibration). This is the scene where the product EARNS its claim. No words needed to explain what's happening — the visual does the work. Three micro-clips edited back-to-back at 1.5–2 second intervals: different use areas, same active state.

**Why it works:** For any product with a visible active state (light, motion, color, texture change), this scene is the single highest-converting moment in the ad. The viewer imagines it on their own skin/home. The "glow" is aspirational without being a claim — it's just the product working. Skin looks luminous because of the light, not because of a claim.

**Use this module when:** The product has a visually distinct active state. If the product has no visible effect (e.g. a cream), swap to a texture/application demo instead.

---

## VISUAL DIRECTION

```
Format:  3 micro-clips in sequence, cut every 1.5–2 seconds.
         Each clip: extreme close-up of product in use on a different area.

Clip 1:  [USE_AREA_1] — e.g. under-eye, under-snout, near outlet
Clip 2:  [USE_AREA_2] — e.g. cheekbone/jaw, flank area, second outlet
Clip 3:  [USE_AREA_3] — e.g. forehead, neck, third outlet / wide establishing

Active state: [ACTIVE_STATE] warm and cinematic. Product's signature visual element.
Skin/surface: Dewy, healthy texture. No exaggeration — natural luminosity.
Camera: Extreme close-up. Product fills 40–60% of frame.
Lighting: Warm ambient. [ACTIVE_STATE] light adds practical illumination.
```

**Active state guide by product type:**
- Red light therapy (Solawave): warm red/amber glow. Skin reflects it. Cinematic.
- UV-C (Clarifion ODRx): soft blue/violet glow. Device face visible.
- Microcurrent: subtle shimmer on skin. Focus on smoothing motion.
- Vibration/massage: motion blur suggestion. Muscle relaxation visual.
- Pheromone plug-in: soft warm light emanating from outlet. Cat/pet calming nearby.
- Serum/topical: texture close-up. Application swipe. Absorption into skin.

---

## ON-SCREEN TEXT

```
Beat 1 (with Clip 1–2):
  "[MECHANISM_SHORT]" — e.g. "microcurrent + red light"
  White caption, key words bold.

Beat 2 (with Clip 3):
  "[TIME_CLAIM]. That's it." — e.g. "5 minutes. That's it."
  Bold, centered. White on slight dark scrim.
```

---

## ACTOR DIALOGUE (VO over demo clips)

```
Pattern: [mechanism in plain language] + [key benefit] + [time/ease anchor]

Full template:
  "[MECHANISM_1] + [MECHANISM_2] — [BENEFIT]. You use it for [TIME]. Done."

Examples:
  "Microcurrent + red light — exactly what I needed. 5 minutes. Done."
  "UV-C light breaks down the odor molecules. You plug it in. Done."
  "Pheromone tech — calms the territorial behavior at the source. Plug it in."

Delivery: Clean, direct, no fluff. She's describing the mechanism the way you'd text it.
          Speed: slightly faster than Scenes 2–3 — this is the momentum scene.
```

---

## TRANSITION OUT

```
Cut to split-screen: bare/before skin LEFT — product in use RIGHT. (Scene 5: Before/After)
The word "done" or end of sentence is the verbal cut cue.
```

---

## BRAND-KIT PLACEHOLDERS

| Placeholder | Source | Example |
|-------------|--------|---------|
| `[ACTIVE_STATE]` | Brief content | "red light glowing" / "UV-C on" |
| `[USE_AREA_1/2/3]` | Brief content | "under-eye / cheekbone / forehead" |
| `[MECHANISM_SHORT]` | `brand-kit.md → approved_phrases` | "microcurrent + red light" |
| `[BENEFIT]` | `brand-kit.md → core_message` | "reduces fine lines" / "calms marking behavior" |
| `[TIME_CLAIM]` | Brief content | "5 minutes" / "plug it in once" |

---

## JS STUB (sceneBlock row content)

```js
// Drop into sceneBlock() rows array for Scene 4
["Visual Direction", "3 micro-clips: [USE_AREA_1], [USE_AREA_2], [USE_AREA_3]. Cut every 1.5–2s. [ACTIVE_STATE] warm and cinematic throughout. Extreme close-up — product fills 40–60% of frame. Dewy, healthy skin/surface texture."],
["Actor Line",       "'[MECHANISM_SHORT] — [BENEFIT]. You use it for [TIME_CLAIM]. Done.'"],
["On-Screen Text",   "'[MECHANISM_SHORT]' → '[TIME_CLAIM]. That\\'s it.' — bold, centered."],
["Purpose",          "Show the product WORKING. [ACTIVE_STATE] is [BRAND]'s visual superpower. Make viewer want that effect on their own [skin/home/pet]."],
["Transition",       "Cut to split-screen: bare [skin/before] LEFT — [PRODUCT_NAME] in use RIGHT."],
```

---

## AI GENERATION PROMPT STUB

```
CLIP 1: Extreme close-up of [PRODUCT_NAME] gliding along [USE_AREA_1]. [ACTIVE_STATE] warm and cinematic. [SKIN/SURFACE] texture: dewy, healthy, natural. 9:16. 1.5 seconds.

CLIP 2: Same setup, [USE_AREA_2]. [ACTIVE_STATE] faces camera slightly. 9:16. 1.5 seconds.

CLIP 3: [USE_AREA_3] or slight pullback showing product in context. Creator's face partially in frame. [ACTIVE_STATE] illuminates the area naturally. 9:16. 2 seconds.

Edit: hard cuts between clips. No transitions. Creator's VO continues over all three.
```
