# Ad Format: Bedroom Mini-Mic Talk
> ID: `bedroom-minimic-talk`
> Category: Skincare / Beauty Tech / Consumer Product (any)
> Length: 20–30 seconds (proven at 23s)
> Scene Count: 6
> Hook Variations: 5 (A–E)
> Status: ✅ PROVEN — Solawave BOGO brief, April 2026
> Aspect Ratios: 9:16 primary, 1:1 secondary

---

## MUSE REFERENCE

- **Creator:** @frankyshaw (Instagram / TikTok)
- **URL:** https://www.instagram.com/reels/DU1lWOeDsdg/
- **Original product featured:** Dr. Melaxin Cemenrete (Korean skincare)
- **Local muse file:** `~/Downloads/Korean skincare truth…mp4`
- **Runtime:** 23 seconds | 720×1280 | 9:16 vertical
- **Why it works:** High-spend, high-persuasion skincare category. Meme-bookend (opens tired/closes approving) creates an emotional payoff that feels earned. Mini-mic prop signals authenticity without production cost. TikTok comment overlay intercepts the #1 objection before it forms. Self-aware humor prevents it from feeling like an ad.

---

## FORMAT SIGNALS (non-negotiable)

These elements define the format. Remove any one and the format stops working.

1. **Mini-mic prop** — silver condenser-style microphone held at chin/chest level in every close-up. This is the TikTok "I'm about to tell you the truth" signal.
2. **Meme bookend** — viral meme overlay opens the ad (relatable problem) and closes it (approving/satisfied). Same meme character, emotional state flips from tired → happy. DW from Arthur was the original; any relatable viral character works.
3. **Bedroom / cozy desk setting** — warm ambient light, slightly messy background. Specifically NOT a studio. Authenticity depends on this.
4. **Karaoke-style captions** — white text, black outline, key words bolded. Bottom third. Essential — 70%+ views are silent.
5. **Product shown 3× minimum** — held casually (Scene 2), in use/active state (Scene 4), flat lay with arrows (Scene 5). Never just once.
6. **"this is the real deal."** — this exact phrase with arrows pointing at the product in the flat lay scene (Scene 5). Proven persuasion trigger. Do not paraphrase.
7. **TikTok comment overlay** — "Is this legit?" comment bubble overlaid in Scene 3. Addresses skepticism from inside the format, not as a defensive rebuttal.

---

## PROVEN SCENE STRUCTURE

| # | Scene Name | Timecode | Beat | Sacred Element |
|---|------------|----------|------|----------------|
| 1 | Opening Hook | 0–3s | Pattern interrupt — scroll stop | Meme overlay + problem statement. 5 variations (A–E). |
| 2 | Authority & Problem | 3–8s | Shared experience builds credibility | Mini-mic, product held casually, "$X spent, nothing worked" |
| 3 | Skeptic Pivot | 8–13s | Disarm objection before it forms | TikTok comment "Is this legit?" overlay + product reveal |
| 4 | Product Demo | 13–18s | Product in action — visual proof | Active visual effect (red light, glow, motion). Product in use. |
| 5 | Before/After + Authority | 18–21s | Receipt / social proof | Split screen + flat lay + arrows + "this is the real deal." |
| 6 | CTA Close | 21–23s | Convert | Meme bookend (approving) + offer overlay + "link in bio" |

---

## SCENE MODULES USED IN THIS FORMAT

Plug these directly from `scene-modules/`:

| Scene | Module ID | File |
|-------|-----------|------|
| 1 | `meme-overlay` OR `tiktok-comment` OR `pov-confession` OR `dollar-amount` | `hooks/<id>.md` |
| 2 | `minimic-problem` | `body/minimic-problem.md` |
| 3 | `tiktok-skeptic-pivot` | `body/tiktok-skeptic-pivot.md` |
| 4 | `product-demo-glow` | `body/product-demo-glow.md` |
| 5 | `before-after-flatlay` | `body/before-after-flatlay.md` |
| 6 | `bogo-meme-bookend` | `cta/bogo-meme-bookend.md` |

---

## ADAPTATION RULES

### Keep (sacred)
- Scene count: exactly 6
- Mini-mic prop in Scenes 1, 2, 3, 6
- Meme overlay in Scene 1 (hook) AND Scene 6 (approving bookend) — same meme, emotional flip
- TikTok comment overlay in Scene 3
- "this is the real deal." + arrows in Scene 5
- Self-aware humor beat — one moment in Scene 3–4 (breaks 4th wall)
- Bedroom/cozy setting throughout — never studio

### Swap (per brand)
- The specific meme character (DW from Arthur → any relatable viral character)
- The product shown — must have a visually active state (glow, motion, transformation)
- The dollar amount in Scene 2 ("$300 on serums" → "$X on [category product]")
- The TikTok comment text — keep structure, swap the product reference
- The offer text in Scene 6 ("BOGO" → "50% off" → "Free trial" → etc.)

### Never
- Studio lighting or production set — ruins the UGC authenticity
- Full-frame video meme cuts — meme must be overlay on creator's frame (eyes always visible above)
- Voiceover-only — the actor must be on screen speaking (this format is UGC dialogue, not VO)
- More than 3 seconds of uninterrupted talking head — always break with a visual
- Product shown without active state — for beauty tech, the glow/effect IS the product

---

## AI ACTOR SPEC (default — adapt per brand)

```yaml
age_range:      "22–32"
gender:         "Female-presenting"
look:           "Natural, warm skin tone. Light or no visible makeup. Hair loosely pulled back or down."
outfit:         "Oversized hoodie or neutral crew-neck top. Bedroom-casual — NOT styled."
setting:        "Cozy desk or bedroom. Warm ambient light (lamp or diffused window). Slight background clutter (books, skincare items, etc.) — NOT minimalist."
prop:           "Silver condenser-style mini microphone. Essential. Always in hand for Scenes 1–3 and 6."
energy:         "Conspiratorial best-friend energy. 'I looked this up so you don't have to.' NOT spokesperson."
```

---

## DOCX JS STUBS

Paste these sceneBlock() calls into the brief JS file. Replace `[PLACEHOLDERS]`.

```js
// SCENE 1 — Hook Window (use for the shared scene setup above the 5 hook cards)
sceneBlock("SCENE 1 — HOOK WINDOW", "0–3 seconds  |  MUST stop the scroll", [
  ["Visual Direction", "AI actor at desk/bedroom. Meme overlay fills lower 60% of frame. Actor's eyes visible above meme. Mini-mic in hand at chin level. Warm ambient lighting."],
  ["On-Screen Text",   "[Hook line from variation — white bold caption, bottom third]"],
  ["AI Actor VO",      "[Hook line from active variation — natural delivery, not scripted]"],
  ["Purpose",          "Stop the scroll. Pattern-interrupt with meme format. Identify pain point before viewer can tap away."],
])

// SCENE 2 — Authority & Problem
sceneBlock("SCENE 2 — AUTHORITY & PROBLEM", "3–8 seconds  |  Consistent across all variations", [
  ["Visual Direction",  "AI actor close-up. Mini-mic in one hand, [PRODUCT_NAME] held casually in the other. Skincare shelf visible, slightly out-of-focus background."],
  ["Actor Line",        "'I've tried [CATEGORY_PRODUCTS]. [DOLLAR_SPENT] later. Nothing gave me what I actually needed for [PAIN_POINT].'"],
  ["On-Screen Text",    "'[products listed].' — caption. Key words bold."],
  ["Purpose",           "Build credibility through shared experience. She's not naive — she's tried everything. Positions [PRODUCT_NAME] reveal as earned discovery."],
  ["Transition",        "Direct cut to close-up of [PRODUCT_NAME] being lifted into frame."],
])

// SCENE 3 — Skeptic Pivot + Product Intro
sceneBlock("SCENE 3 — SKEPTIC PIVOT + PRODUCT INTRO", "8–13 seconds  |  Consistent across all variations", [
  ["Visual Direction",  "TikTok comment bubble overlaid: 'Is this legit tho?' — actor glances at it, smiles, looks back at camera. [PRODUCT_NAME] now held up, [ACTIVE_STATE]."],
  ["Actor Line",        "'That's literally what I said. So I looked it up. [MECHANISM] — [WHAT IT DOES] — in [PRODUCT_FORM] you use at home.'"],
  ["On-Screen Text",    "TikTok comment: 'Is this legit tho?' → clears. Caption: '[MECHANISM]. at home.' — bold highlight on [MECHANISM]."],
  ["Purpose",           "Intercept #1 objection ('is this a gimmick?') before viewer consciously forms it. [ACTIVE_STATE] = visual proof it does something."],
  ["Transition",        "Cut to [PRODUCT_NAME] in use — [ACTIVE_STATE] in motion."],
])

// SCENE 4 — Product Demo
sceneBlock("SCENE 4 — PRODUCT DEMO", "13–18 seconds  |  Consistent across all variations", [
  ["Visual Direction",  "Close-up of [PRODUCT_NAME] in use: [USE_AREA_1], [USE_AREA_2], [USE_AREA_3]. [ACTIVE_STATE] visible and cinematic. Skin looks luminous, dewy."],
  ["Actor Line",        "'[MECHANISM_SHORT] — [BENEFIT]. You use it for [TIME]. Done.'"],
  ["On-Screen Text",    "'[MECHANISM_SHORT]' — caption. Then: '[TIME]. That's it.' — bold, centered."],
  ["Purpose",           "Show the product WORKING. [ACTIVE_STATE] is [BRAND]'s visual superpower. Make viewer want that effect on their own skin."],
  ["Transition",        "Cut to split-screen: before LEFT — [PRODUCT_NAME] in use RIGHT."],
])

// SCENE 5 — Before/After + Product Authority
sceneBlock("SCENE 5 — BEFORE/AFTER + PRODUCT AUTHORITY", "18–21 seconds  |  Consistent across all variations", [
  ["Visual Direction",  "(1) Split-screen 1.5s: bare skin LEFT — same with [PRODUCT_NAME] in use RIGHT.\n\n(2) Product flat lay: [PRODUCT_NAME] centered on clean surface. [ACTIVE_STATE]. 3 white arrows point down at product. Warm lighting."],
  ["Actor Line",        "'This is the real deal. [PERSONAL_RESULT_STATEMENT].'"],
  ["On-Screen Text",    "Split: LEFT 'before [BRAND_NAME]' / RIGHT '[TIMEFRAME]'\n\nFlat lay: 'this is the real deal.' — bold white + 3 animated arrows pointing down. '[BRAND_NAME]' below."],
  ["Purpose",           "Social proof + product authority. Split-screen is the receipt. 'this is the real deal.' closes the credibility loop before the CTA."],
  ["Transition",        "Hard cut to CTA frame."],
])

// SCENE 6 — CTA Close
sceneBlock("SCENE 6 — CTA + OFFER CLOSE", "21–23 seconds  |  Consistent across all variations", [
  ["Visual Direction",  "Actor back on camera, mini-mic in hand, [PRODUCT_NAME] raised toward camera ([ACTIVE_STATE]). Approving/confident expression. Optional: meme bookend (approving version of Scene 1 meme) for 0.5–1s."],
  ["Actor Line",        "'[OFFER_TEXT] right now — link in bio.'"],
  ["On-Screen Text",    "'[OFFER_TEXT]' — large bold\n'[LANDING_PAGE]' — below\n'Shop Now →'\n(Optional: 'Limited time | Results may vary')"],
  ["Purpose",           "Drive the one action: click. [OFFER] is the urgency mechanism. 2 seconds max — viewer already knows. Just close."],
])
```

---

## AI GENERATION PROMPTS (per-scene stubs)

Replace `[PLACEHOLDERS]` with brand-specific values.

```
SCENE 1 — Muse Hook
Photoreal female creator, [AI_ACTOR_AGE], natural look, warm skin tone. Bedroom desk. Casual [OUTFIT]. Silver condenser mini-mic in hand. [MEME_CHARACTER] overlay fills lower 60% — creator's eyes visible above. She glances at meme, looks up with knowing half-smile. Authentic TikTok creator bedroom reel. 9:16. 3 seconds.

SCENE 2 — Authority & Problem
Same creator. Mini-mic in left hand. [PRODUCT_NAME] held casually in right (not presenting). [CATEGORY_ITEMS] slightly out-of-focus on shelf behind. She speaks candidly, slightly frustrated then resolving. Warm golden light. Tight angles: face / hands / shelf. 9:16. 5 seconds.

SCENE 3 — Skeptic Pivot + Reveal
Same creator. TikTok comment bubble overlaid: 'Is this legit tho?' — she glances at it, smiles, looks at camera. Turns [PRODUCT_NAME] toward lens — [ACTIVE_STATE] faces camera. [ACTIVE_STATE] cinematic and warm. Handheld feel. 9:16. 5 seconds.

SCENE 4 — Product Demo
Extreme close-up of [PRODUCT_NAME] gliding along skin: [USE_AREA_1], [USE_AREA_2], [USE_AREA_3]. [ACTIVE_STATE] warm and cinematic. Dewy healthy skin texture. Micro-clips, cut every 1.5–2s. Creator's voice continues over. 9:16. 5 seconds.

SCENE 5 — Before/After + Flat Lay
CLIP 1: Split-screen. LEFT bare natural skin label 'before [BRAND_NAME]' / RIGHT [PRODUCT_NAME] in use label '[TIMEFRAME]'. Matching warm light both sides.
CLIP 2: [PRODUCT_NAME] centered on white/marble surface. [ACTIVE_STATE]. 3 white arrows pointing down. 'this is the real deal.' bold white text. 9:16. 3 seconds.

SCENE 6 — CTA
Creator energized, [PRODUCT_NAME] raised toward camera ([ACTIVE_STATE]). Warm, direct smile. Optional: meme bookend 0.5s. Fades to: '[OFFER_TEXT]' bold + '[LANDING_PAGE]' + 'Shop Now →'. 9:16. 2 seconds.
```

---

## FIRST DEPLOYED — Solawave BOGO Campaign

- Brief: `~/Downloads/Solawave_VideoBrief_KoreanSkincaretruth_v1_20260409.docx`
- Brand kit: `brands/solawave/brand-kit.md`
- Script: `/tmp/docx_work/solawave_brief_v1.js`
