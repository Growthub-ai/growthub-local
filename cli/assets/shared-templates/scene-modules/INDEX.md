# Scene Module Library — INDEX
> These are the plug-in building blocks. Each module = one scene or one hook variation.
> Pull a module file → swap `[PLACEHOLDERS]` from brand-kit.md → paste into brief JS.
> All modules are format-compatible as noted. Mix across formats where marked.

---

## HOW MODULES WORK

Every module contains:
- **What it does** — the job this scene performs in the ad
- **Visual direction** — camera, character, setting, lighting
- **On-screen text** — exact template with `[PLACEHOLDERS]`
- **Actor dialogue** — full template with delivery notes
- **JS stub** — ready-to-paste `sceneBlock()` or `hookCard()` row content
- **AI generation prompt** — ready-to-paste Veo 3 / Runway prompt stub
- **Brand-kit placeholders** — maps each `[PLACEHOLDER]` to its source field

**Placeholder schema (universal across all modules):**
```
[BRAND_NAME]         → brand-kit.md → client_name
[PRODUCT_NAME]       → brand-kit.md → primary_service
[PRICE]              → brief content / website
[OFFER_TEXT]         → brand-kit.md → cta_offer
[LANDING_PAGE]       → brand-kit.md → landing_page
[PAIN_POINT]         → brand-kit.md → target_pain_point
[MECHANISM]          → brand-kit.md → approved_phrases
[ACTIVE_STATE]       → brief content (device glow, motion, effect)
[AI_ACTOR_AGE]       → brand-kit.md → ai_actor_age_range
[ACCENT_COLOR]       → brand-kit.md → colors.secondary (hex, no #)
[GUARANTEE_DAYS]     → brand-kit.md → compliance_notes
```

---

## HOOKS

> Scene 1 only. One hook per variation (A–E). Scenes 2–N identical across all variations.

| File | ID | Best For | Format |
|------|----|----------|--------|
| `hooks/meme-overlay.md` | `meme-overlay` | Relatable lifestyle pain (tired, broke, frustrated) | `bedroom-minimic-talk` |
| `hooks/tiktok-comment.md` | `tiktok-comment` | High-skepticism categories; objection-first opens | `bedroom-minimic-talk` |
| `hooks/pov-confession.md` | `pov-confession` | Mirror moment; female 25–35 demo; skincare/beauty | `bedroom-minimic-talk` |
| `hooks/dollar-amount.md` | `dollar-amount` | Any category where overspending is the shared pain | `bedroom-minimic-talk`, `villain-animation` |
| `hooks/villain-hook.md` | `villain-hook` | Animated format; any product displacing incumbents | `villain-animation` |

**Recommended hook pairings (5-variation set):**
```
bedroom-minimic-talk (skincare/beauty tech):
  A: meme-overlay      ← direct muse mirror — test first
  B: tiktok-comment    ← highest persuasion for skeptical categories
  C: dollar-amount     ← works for 28–40 Facebook/Meta feed
  D: product-reveal*   ← custom hook; device with active glow in frame 1
  E: pov-confession    ← native TikTok; mirror moment

villain-animation (pet / home / supplement):
  A–E: villain-hook × 5 with different VO lines (see villain-hook.md → Hook Variations section)
```
*product-reveal hook = custom variant; write inline in brief, no module file needed.

---

## BODY SCENES

> Scenes 2–N. Identical across all hook variations.

| File | ID | Scene # | Format | Beat |
|------|----|---------|--------|------|
| `body/minimic-problem.md` | `minimic-problem` | 2 | `bedroom-minimic-talk` | Authority + failed solutions confession |
| `body/tiktok-skeptic-pivot.md` | `tiktok-skeptic-pivot` | 3 | `bedroom-minimic-talk` | Skeptic disarm + product intro |
| `body/product-demo-glow.md` | `product-demo-glow` | 4 | `bedroom-minimic-talk` | Product in active use (glow/effect visible) |
| `body/villain-agitation.md` | `villain-agitation` | 2–5 (×4) | `villain-animation` | Stacked failed solutions as villain characters |
| `body/before-after-flatlay.md` | `before-after-flatlay` | 5 | `bedroom-minimic-talk` | Split-screen + "this is the real deal." flat lay |

**Sequencing rules:**
```
bedroom-minimic-talk order:
  minimic-problem → tiktok-skeptic-pivot → product-demo-glow → before-after-flatlay → [CTA]

villain-animation order:
  villain-agitation × 4 → [product intro inline] → [social proof inline] → [CTA]
  (product intro + social proof are format-specific — write inline, not from modules)
```

---

## CTAs

> Final scene only. One CTA per brief. Select based on offer type + format.

| File | ID | Format | Offer Type |
|------|----|--------|------------|
| `cta/bogo-meme-bookend.md` | `bogo-meme-bookend` | `bedroom-minimic-talk` | BOGO / % off / any flash offer |
| `cta/guarantee-close.md` | `guarantee-close` | `villain-animation` | Guarantee + social proof number |

**Offer → module mapping:**
```
Buy 1 Get 1 FREE       → bogo-meme-bookend
% Discount             → bogo-meme-bookend  (swap offer text)
Free trial             → bogo-meme-bookend  (swap offer text)
Satisfaction guarantee → guarantee-close
Bundle deal            → guarantee-close or bogo-meme-bookend depending on format
```

---

## ASSEMBLY RECIPES

Copy-paste these to brief the production team or start a new JS file.

### Recipe 1: Skincare/Beauty Tech — 23s BOGO (bedroom-minimic-talk)
```
Scene 1:  hooks/meme-overlay.md         (Hook A — test first)
          hooks/tiktok-comment.md        (Hook B)
          hooks/dollar-amount.md         (Hook C)
          [custom product-reveal hook]   (Hook D — write inline)
          hooks/pov-confession.md        (Hook E)
Scene 2:  body/minimic-problem.md
Scene 3:  body/tiktok-skeptic-pivot.md
Scene 4:  body/product-demo-glow.md
Scene 5:  body/before-after-flatlay.md
Scene 6:  cta/bogo-meme-bookend.md
```

### Recipe 2: Pet / Home / Supplement — 90–120s Villain Format
```
Scene 1:  hooks/villain-hook.md         (5 variations A–E)
Scene 2:  body/villain-agitation.md     (Agitation 1 — COST)
Scene 3:  body/villain-agitation.md     (Agitation 2 — EFFORT)
Scene 4:  body/villain-agitation.md     (Agitation 3 — FUTILITY)
Scene 5:  body/villain-agitation.md     (Agitation 4 — RISK)
Scene 6:  [product intro — write inline]
Scene 7:  [product in action — write inline]
Scene 8:  [social proof persona — write inline]
Scene 9:  cta/guarantee-close.md
```

---

## ADDING NEW MODULES

When you build a new brief and a scene is clearly reusable:
1. Create `scene-modules/<type>/<new-id>.md` using any existing module as the template
2. Add a row to the relevant table above
3. Add it to `ad-formats/INDEX.md` under the compatible format
4. Note which brief it was first deployed in at the bottom of the module file

---

*Scene Module Library — Creative Strategy Worker Kit — April 2026*
