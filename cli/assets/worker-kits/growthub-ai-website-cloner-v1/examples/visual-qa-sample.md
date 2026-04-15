# Visual QA Checklist — Sample

**Project:** Acme Corp Homepage Clone  
**Clone URL:** `http://localhost:3000`  
**Original URL:** `https://acme.example.com`  
**Date:** 2026-04-15  
**QA reviewer:** `ai-website-cloner-operator`

---

## Build checks

- [x] `npm run build` exits 0
- [x] `npm run lint` exits 0
- [x] `npm run typecheck` exits 0
- [x] Dev server starts without errors: `npm run dev`
- [x] No 404s in browser console for assets

---

## Layout QA — Desktop (1440px)

| Section | Status | Notes |
|---|---|---|
| Navigation | Pass | Sticky behavior matches; dropdowns exact |
| Hero | Pass | Video loops, overlays correct, headlines match |
| Features grid | Pass | 3-column layout, spacing matches |
| Testimonials | Pass | Carousel transitions match |
| CTA Banner | Pass | High-contrast colors exact |
| FAQ accordion | Pass | Open/close transitions match |
| Footer | Pass | 4-column layout, links correct |

---

## Layout QA — Tablet (768px)

| Section | Status | Notes |
|---|---|---|
| Navigation | Pass | Hamburger appears, menu overlay works |
| Hero | Pass | 56px headline, CTAs stack correctly |
| Features grid | Pass | 2-column at tablet |
| Testimonials | Pass | Single column at tablet |
| CTA Banner | Pass | — |
| FAQ accordion | Pass | — |
| Footer | Pass | 2-column at tablet |

---

## Layout QA — Mobile (375px)

| Section | Status | Notes |
|---|---|---|
| Navigation | Pass | Hamburger, overlay, full-screen nav match |
| Hero | Pass | 40px headline, full-width CTAs |
| Features grid | Pass | 1-column at mobile |
| Testimonials | Pass | Swipe gesture works |
| CTA Banner | Pass | — |
| FAQ accordion | Pass | Touch targets 44px minimum |
| Footer | Pass | Single column, stacked |

---

## Color fidelity

| Token | Expected | Actual | Pass |
|---|---|---|---|
| Background | `#0a0a0a` | `oklch(7% 0 0)` | Pass |
| Text primary | `#ffffff` | `oklch(100% 0 0)` | Pass |
| Accent | `#3b82f6` | `oklch(59% 0.2 260)` | Pass |
| Border | `rgba(255,255,255,0.1)` | Match | Pass |

---

## Typography fidelity

| Element | Expected font | Actual | Expected size | Actual | Pass |
|---|---|---|---|---|---|
| H1 | Inter | Inter (system fallback) | 72px | 72px | Pass |
| Body | Inter | Inter (system fallback) | 20px | 20px | Pass |

---

## Asset completeness

- [x] All images loading (no broken images)
- [x] Hero background video loading and looping
- [x] All SVG icons rendering
- [x] Fonts loading (Inter via Next.js font optimization)

---

## Interaction states

| Element | State | Expected | Actual | Pass |
|---|---|---|---|---|
| CTA primary | Hover | Dims slightly | Dims `oklch(91%)` | Pass |
| CTA secondary | Hover | Border brightens | Border `opacity 0.6` | Pass |
| Navigation | Hover | Underline appears | Underline `2px` | Pass |
| Mobile nav | Tap | Overlay opens | Full-screen overlay | Pass |
| FAQ items | Click | Accordion expands | Smooth height transition | Pass |

---

## Deviations

| Section | Type | Reason | Resolution |
|---|---|---|---|
| All headings | Font | "Acme Sans" not publicly available | Replaced with Inter; noted in handoff |

---

## Final QA result

- [ ] PASS
- [x] PASS WITH NOTED DEVIATIONS — see Deviations table above
- [ ] FAIL

**Reviewer notes:**  
The only deviation is the proprietary font. All layout, color, interaction, and asset checks pass. Client has been informed that the font replacement is the only visual difference.
