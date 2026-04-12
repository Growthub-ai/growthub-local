# Scene Module: Before/After + Product Flat Lay
> ID: `before-after-flatlay`
> Type: body (Scene 5)
> Compatible Formats: `bedroom-minimic-talk`
> Timecode: 18–21s (in 23s format)
> Status: ✅ PROVEN — Solawave BOGO (Scene 5)

---

## WHAT IT DOES

Two rapid clips back-to-back. First: a split-screen before/after that delivers the social proof in a single glance. Second: a product flat lay with arrows pointing at it and the phrase "this is the real deal." — the product authority close. Together these 3 seconds are the brief's receipt: proof it works, proof of what to buy.

**Why it works:** The split-screen is the most trusted visual format for product proof on TikTok/Reels — viewers parse it instantly. The flat lay + arrows is borrowed from the muse's most persuasive moment — it says "I'm putting the camera on the thing that actually matters" without any words needing to explain it. "this is the real deal." is the copy that closes this scene — it's been proven in the muse and should not be paraphrased.

---

## VISUAL DIRECTION

```
CLIP 1 — Split-Screen (1.5 seconds):
  LEFT side:   Bare, natural skin (or before-product state). Label: "before [BRAND_NAME]"
  RIGHT side:  Same creator/subject with [PRODUCT_NAME] in use ([ACTIVE_STATE]). Label: "[TIMEFRAME]"
  Lighting:    Matching warm light both sides. NOT dramatic — subtle, believable difference.
  Note:        "Before" should look normal/real — not intentionally bad. Authenticity > drama.

CLIP 2 — Product Flat Lay (1.5 seconds):
  Subject:     [PRODUCT_NAME] centered on clean surface (white, marble, or warm wood).
               [ACTIVE_STATE] ON — product facing camera.
  Arrows:      3 white animated arrows pointing DOWN toward the product.
               Appear in sequence (staggered 0.2s each) — not all at once.
  Text:        "this is the real deal." — bold white text. Appears after arrows.
  Brand:       "[BRAND_NAME]" in smaller text below.
  Lighting:    Warm, slightly aspirational. Clean but not clinical.
```

---

## ON-SCREEN TEXT

```
CLIP 1 — Split-Screen labels:
  Left:  "before [BRAND_NAME]" — small, white, top or bottom of left panel
  Right: "[TIMEFRAME]" — e.g. "week 3" / "day 14" / "30 days"
         Small, white, top or bottom of right panel.
  
  Note: "week 3" not "after 3 weeks" — brevity is required.
  Note: do not use "after" label — it implies a clinical claim. Use timeframe only.

CLIP 2 — Flat Lay:
  Line 1: "this is the real deal." — bold, white, all lowercase (muse style)
  Line 2: "[BRAND_NAME]" — slightly smaller, white
  Arrows: animated (not static) — stagger entry for dynamism
```

---

## ACTOR DIALOGUE

```
Spoken over BOTH clips (continuous):

Pattern: [personal result statement — specific but not a clinical claim]

Template:
  "This is the real deal. [PERSONAL_RESULT] since before I had a reason to worry about it."

Examples:
  "This is the real deal. My skin hasn't looked this good since before I had a reason to worry about it."
  "This is the real deal. The marking stopped. Week 3 — completely different house."
  "This is the real deal. I stopped counting how many serums are in the trash."

Delivery: Quiet conviction. Not shouting. Not a sales line. Just the truth.
          "This is the real deal." — slight pause before it. Let it land.
```

---

## TIMEFRAME CALIBRATION

```
Use a timeframe that is:
  - Long enough to be believable (not "next day")
  - Short enough to be motivating (not "after 6 months")
  - Consistent with brand compliance guidelines

Calibration guide:
  Skincare device:   "week 3" / "week 4" / "day 21"
  Supplement:        "day 30" / "week 6"
  Pet behavior:      "week 2" / "week 3" (behavior changes faster)
  Air quality:       "day 3" / "first week" (immediate-ish results credible)
  
  Check brand-kit.md → compliance_notes before setting timeframe.
  Never use exact % improvement without clinical backing.
```

---

## BRAND-KIT PLACEHOLDERS

| Placeholder | Source | Example |
|-------------|--------|---------|
| `[BRAND_NAME]` | `brand-kit.md → client_name` | "Solawave" |
| `[PRODUCT_NAME]` | `brand-kit.md → primary_service` | "Solawave wand" |
| `[ACTIVE_STATE]` | Brief content | "red light glowing" |
| `[TIMEFRAME]` | Brief content (compliance-checked) | "week 3" |
| `[PERSONAL_RESULT]` | Brief content | "My skin hasn't looked this good..." |

---

## COMPLIANCE CHECK (run before finalizing)

```
[ ] No "before/after" labels (use timeframe on right side only)
[ ] No specific % improvement claim
[ ] "Results may vary" included in Scene 6 bottom strip if making any outcome statement
[ ] Timeframe is plausible and consistent with brand-kit.md → compliance_notes
[ ] "this is the real deal." is a subjective personal statement — not a clinical claim ✓
```

---

## JS STUB (sceneBlock row content)

```js
// Drop into sceneBlock() rows array for Scene 5
["Visual Direction",  "(1) Split-screen 1.5s: bare [skin/state] LEFT 'before [BRAND_NAME]' — [PRODUCT_NAME] in use RIGHT '[TIMEFRAME]'. Matching warm light both sides.\n\n(2) Product flat lay: [PRODUCT_NAME] centered on [SURFACE]. [ACTIVE_STATE]. 3 staggered white arrows pointing down. 'this is the real deal.' bold white. '[BRAND_NAME]' below."],
["Actor Line",        "'This is the real deal. [PERSONAL_RESULT_STATEMENT].'"],
["On-Screen Text",    "Split: LEFT 'before [BRAND_NAME]' / RIGHT '[TIMEFRAME]'\n\nFlat lay: 'this is the real deal.' bold white + 3 animated arrows + '[BRAND_NAME]'"],
["Compliance note",   "No % claims. No 'after' label. '[TIMEFRAME]' only. 'Results may vary' in Scene 6 strip."],
["Purpose",           "Social proof + product authority. Split-screen is the receipt. 'this is the real deal.' closes the credibility loop before CTA."],
["Transition",        "Hard cut to CTA frame."],
```

---

## AI GENERATION PROMPT STUB

```
CLIP 1 (split-screen): Two-panel vertical split. LEFT: creator bare natural [skin/state], soft warm light, small label 'before [BRAND_NAME]'. RIGHT: same creator with [PRODUCT_NAME] in use [ACTIVE_STATE], small label '[TIMEFRAME]'. Matching warm ambient light both panels. Authentic, subtle difference — not dramatic. 9:16. 1.5 seconds.

CLIP 2 (flat lay): [PRODUCT_NAME] centered on [white marble/warm wood] surface. [ACTIVE_STATE] facing camera. Warm soft light. 3 white arrows animated in sequence pointing down at product. 'this is the real deal.' appears in bold white after arrows. Clean, minimal. 9:16. 1.5 seconds.
```
