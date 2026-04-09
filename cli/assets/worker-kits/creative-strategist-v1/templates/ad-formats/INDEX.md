# Ad Format Template Library — INDEX
> Read this file first. It tells you every frozen format and scene module available.
> Pull the format file for full scene structure, JS stubs, and adaptation rules.

---

## HOW TO USE THIS LIBRARY

**In a brief session:**
1. User provides a muse or concept → check this index for matching format
2. If a match exists → load that format file → it replaces Steps 2b–2b5 in `skills.md`
3. If no match → extract frames as normal (Step 2b) → freeze new format after the brief

**Interoperability rule:** Every format file + every scene module shares the same placeholder schema:
`[BRAND_NAME]` `[PRODUCT_NAME]` `[PRICE]` `[OFFER]` `[LANDING_PAGE]` `[AI_ACTOR_AGE]`
Swap these from the brand-kit.md and the module is production-ready.

---

## FORMAT LIBRARY

| ID | Format Name | Length | Scenes | Category | Muse | Status |
|----|-------------|--------|--------|----------|------|--------|
| `bedroom-minimic-talk` | Bedroom Mini-Mic Talk | 23s | 6 | Skincare / Beauty Tech / Any | @frankyshaw Korean skincare Reel | ✅ PROVEN |
| `villain-animation` | Villain Object Animation | 98s | 9 | Pet / Home / Supplement | TheraPet AI Animation | ✅ PROVEN |
| `process-specialist-medical` | The Process Specialist | ~50s | 5 | Medical / Regenerative Medicine / Healthcare Authority | Greentree Medical Center original | ✅ PROVEN |

**No match? → Use frame extraction methodology:** `templates/ad-formats/frame-analysis.md`
After completing the brief, freeze the new format using that file's Phase 6 instructions.

**Format files:** `templates/ad-formats/<ID>.md`

---

## SCENE MODULE LIBRARY

Modules are plug-in components. Mix across formats. Each module has a JS stub ready to paste.

### HOOKS (Scene 1 — swap per variation)

| ID | Hook Name | Best Format | Trigger |
|----|-----------|-------------|---------|
| `meme-overlay` | Meme Overlay Hook | `bedroom-minimic-talk` | Relatable lifestyle meme (tired, broke, stressed) |
| `tiktok-comment` | TikTok Comment "Is this legit?" | `bedroom-minimic-talk` | Skepticism-first, high-objection categories |
| `pov-confession` | POV Mirror Confession | `bedroom-minimic-talk` | Mirror + candid skin moment |
| `dollar-amount` | Dollar Amount Confession | `bedroom-minimic-talk` + `villain-animation` | "Spent $X. Didn't work." |
| `villain-hook` | Villain Character Hook | `villain-animation` | Product objects as animated villain characters |

**Module files:** `templates/scene-modules/hooks/<ID>.md`

### BODY SCENES (Scenes 2–N)

| ID | Module Name | Best Format | Beat |
|----|-------------|-------------|------|
| `minimic-problem` | Mini-Mic Problem Confession | `bedroom-minimic-talk` | Authority + failed solutions |
| `tiktok-skeptic-pivot` | TikTok Skeptic Pivot | `bedroom-minimic-talk` | "Is this legit?" disarm + product intro |
| `product-demo-glow` | Product Demo (Light/Glow) | `bedroom-minimic-talk` | Device with visible effect (red light, UV, glow) |
| `villain-agitation` | Villain Agitation Stack | `villain-animation` | 1–4× stacked agitation scenes with villain objects |
| `before-after-flatlay` | Before/After + Flat Lay | `bedroom-minimic-talk` | Split screen + product flat lay + "this is the real deal." |

**Module files:** `templates/scene-modules/body/<ID>.md`

### CTAs (Final Scene)

| ID | CTA Name | Best Format | Offer Type |
|----|----------|-------------|------------|
| `bogo-meme-bookend` | BOGO + Meme Bookend Close | `bedroom-minimic-talk` | Buy 1 Get 1 / % Off / Flash Offer |
| `guarantee-close` | Guarantee Calendar Close | `villain-animation` | 30/60-day satisfaction guarantee |

**Module files:** `templates/scene-modules/cta/<ID>.md`

---

## QUICK BRIEF ASSEMBLY GUIDE

| Brief Type | Start With | Hook Module | Body Modules | CTA Module |
|------------|------------|-------------|--------------|------------|
| Skincare UGC (23s) | `bedroom-minimic-talk` | `meme-overlay` OR `tiktok-comment` | `minimic-problem` + `tiktok-skeptic-pivot` + `product-demo-glow` + `before-after-flatlay` | `bogo-meme-bookend` |
| Pet/Home Device (90s+) | `villain-animation` | `villain-hook` | `villain-agitation` × 3–4 + product reveal | `guarantee-close` |
| Any brand, new muse | Extract frames → build new format → freeze here | — | — | — |

---

## FREEZING A NEW FORMAT

After completing a muse-based brief, freeze the format:
1. Create `templates/ad-formats/<new-id>.md` using the schema in any existing format file
2. Add a row to this INDEX table
3. Extract the reusable scene modules → add to `scene-modules/` if not already there
4. Update `skills.md` QUICK REFERENCE table to include the new format

---

*Template Library — Creative Strategy Worker Kit — April 2026*
