# Scene Module: Guarantee Calendar Close
> ID: `guarantee-close`
> Type: cta (Scene 9 / final scene)
> Compatible Formats: `villain-animation`
> Timecode: 92–98s (in 98s format)
> Status: ✅ PROVEN — Clarifion ODRx brief (Scene 9)

---

## WHAT IT DOES

Closes the ad with stacked product boxes, satisfied animals/characters, and a satisfaction guarantee badge. The guarantee is the final objection remover — it converts "this looks good but I'm not sure" into "what do I have to lose?" The bokeh/clean background isolates the product and the proof, removing all cognitive clutter before the ask.

**Why it works:** After 4 agitation scenes and a product reveal, the viewer wants the product but fears waste. The guarantee calendar (already seen in Scene 8 social proof) is called back here — but now it's in the context of the CTA, not just social proof. Stacked product boxes signal popularity and availability. Satisfied animals complete the emotional arc: problem → solution → peace.

---

## VISUAL DIRECTION

```
Setting:  Clean bokeh background. Soft warm out-of-focus environment.
          No environment clutter — complete contrast to Scenes 1–5.

Products: [HERO_PRODUCT] × 1–3 boxes stacked or arranged.
          Shows product packaging (box), not just the device.
          Stacking implies popularity/bundle/value.

Animals/Characters: [ANIMAL/CHARACTER] present and visibly calm/happy.
                    Positioned near or beside the product stack.
                    This is the "everything is resolved" signal.

Badge:    Satisfaction guarantee badge visible in corner or overlaid.
          Shows [GUARANTEE_DAYS]-day guarantee explicitly.

Animation: Subtle particle or glow effect optional — aspirational, not distracting.
```

---

## ON-SCREEN TEXT

```
Karaoke beats (continue word-by-word rhythm from throughout the ad):
  "[SOCIAL_PROOF_NUMBER]" → "PARENTS/CUSTOMERS" → "ALREADY" → "[TRIED/TRUSTED]"
  "[OFFER_TEXT]" → "FREE [BENEFIT]" → "IN [TIMEFRAME]"
  "[GUARANTEE_DAYS] DAY" → "[GUARANTEE_TYPE]" → "GUARANTEED"

CTA overlay (final 2 seconds):
  Line 1: "[OFFER_TEXT]" — large, bold
  Line 2: "[LANDING_PAGE]"  
  Line 3: "Shop Now →" or "Order Today →"
  Badge:  "[GUARANTEE_DAYS]-Day Satisfaction Guarantee"
```

---

## ACTOR/VO DIALOGUE

```
Pattern: [social proof number] + [offer] + [guarantee as risk-removal]

Full template:
  "[NUMBER] [CUSTOMERS/PET PARENTS] already [trusted/tried] [PRODUCT_NAME].
   [OFFER_TEXT]. And if it doesn't work — [GUARANTEE_DAYS]-day money back. Guaranteed."

Short template:
  "[OFFER_TEXT] at [LANDING_PAGE]. [GUARANTEE_DAYS] days, money back. Try it."

Delivery: Confident, calm, direct. The VO has earned trust through the ad — no need to push.
          "Guaranteed" is the last word heard — it neutralises the final hesitation.
```

---

## GUARANTEE CALIBRATION

```
Match EXACTLY to brand-kit.md → compliance_notes and the actual guarantee offered.

Common guarantee periods:
  30 days: Standard consumer product guarantee
  60 days: Premium / higher-ticket product
  90 days: Supplement category standard

Language compliance:
  ✅ "[N]-Day Satisfaction Guarantee"
  ✅ "[N]-Day Money Back Guarantee"  
  ✅ "Try it risk-free for [N] days"
  ❌ "It will definitely work" — never
  ❌ "100% guaranteed results" — never (results may vary required)
  
  Always verify against brand-kit.md → compliance_notes before finalizing.
```

---

## SOCIAL PROOF NUMBER

```
Use a real number if available from brand assets.
If not available, use ranges: "thousands of" / "over 10,000" / "[X]K+ customers"

Sources to check:
  - brand-kit.md → previous_ads / asset_links
  - Brand website (review count, customer count)
  - Instagram / TikTok (follower / engagement signal)
  
Never fabricate a specific number without brand confirmation.
```

---

## BRAND-KIT PLACEHOLDERS

| Placeholder | Source | Example |
|-------------|--------|---------|
| `[HERO_PRODUCT]` | `brand-kit.md → primary_service` | "Clarifion ODRx" |
| `[ANIMAL/CHARACTER]` | Brief content | "happy cats" / "calm dog" |
| `[GUARANTEE_DAYS]` | `brand-kit.md → compliance_notes` | "30" / "60" |
| `[OFFER_TEXT]` | `brand-kit.md → cta_offer` | "Buy 1 Get 1 FREE" |
| `[LANDING_PAGE]` | `brand-kit.md → landing_page` | "info.clarifionodrx.com" |
| `[SOCIAL_PROOF_NUMBER]` | Brand research | "10,000+" / "thousands of" |
| `[BRAND_ACCENT_COLOR]` | `brand-kit.md → colors.secondary` | "2C7FF8" |

---

## JS STUB (sceneBlock row content)

```js
// Drop into sceneBlock() rows array for final CTA scene
["Visual Direction",  "Bokeh/clean background. [HERO_PRODUCT] × 1–3 boxes stacked. [ANIMAL/CHARACTER] calm and happy nearby. Satisfaction guarantee badge visible. Subtle warm glow — aspirational, not clinical."],
["On-Screen Text",    "Karaoke: '[SOCIAL_PROOF_NUMBER]' → 'ALREADY' → '[TRUSTED]'\n\nCTA overlay: '[OFFER_TEXT]' large bold + '[LANDING_PAGE]' + 'Shop Now →' + '[GUARANTEE_DAYS]-Day Satisfaction Guarantee' badge."],
["VO",                "'[SOCIAL_PROOF_NUMBER] [customers] already [trusted] [PRODUCT_NAME]. [OFFER_TEXT]. [GUARANTEE_DAYS] days, money back. Guaranteed.'"],
["Purpose",           "Remove the final objection: risk of waste. Guarantee converts hesitation to action. Stacked boxes = popularity signal."],
```

---

## AI GENERATION PROMPT STUB

```
3D animated bokeh background — clean, warm, soft focus. [HERO_PRODUCT] boxes stacked in pyramid or neat stack (2–3 boxes, packaging visible). [ANIMAL/CHARACTER] seated calmly beside the stack — happy, peaceful expression. Satisfaction guarantee badge in lower corner. Warm aspirational lighting. Subtle particle glow effect optional. Karaoke text overlaid word-by-word. Final 2s: CTA overlay '[OFFER_TEXT]' + '[LANDING_PAGE]' + 'Shop Now →'. 9:16. 6 seconds.
```
