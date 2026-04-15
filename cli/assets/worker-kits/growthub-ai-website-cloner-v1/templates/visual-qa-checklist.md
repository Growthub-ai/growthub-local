# Visual QA Checklist

**Project:** [PROJECT NAME]  
**Clone URL:** [http://localhost:3000]  
**Original URL:** [https://example.com]  
**Date:** YYYY-MM-DD  
**QA reviewer:** `ai-website-cloner-operator`

---

## Build checks

- [ ] `npm run build` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm run typecheck` exits 0
- [ ] Dev server starts without errors: `npm run dev`
- [ ] No 404s in browser console for assets

---

## Layout QA — Desktop (1440px)

| Section | Status | Notes |
|---|---|---|
| Navigation | [ ] Pass / [ ] Deviation | — |
| Hero | [ ] Pass / [ ] Deviation | — |
| [Section] | [ ] Pass / [ ] Deviation | — |
| Footer | [ ] Pass / [ ] Deviation | — |

---

## Layout QA — Tablet (768px)

| Section | Status | Notes |
|---|---|---|
| Navigation | [ ] Pass / [ ] Deviation | — |
| Hero | [ ] Pass / [ ] Deviation | — |
| [Section] | [ ] Pass / [ ] Deviation | — |
| Footer | [ ] Pass / [ ] Deviation | — |

---

## Layout QA — Mobile (375px)

| Section | Status | Notes |
|---|---|---|
| Navigation | [ ] Pass / [ ] Deviation | — |
| Hero | [ ] Pass / [ ] Deviation | — |
| [Section] | [ ] Pass / [ ] Deviation | — |
| Footer | [ ] Pass / [ ] Deviation | — |

---

## Color fidelity

| Token | Expected | Actual | Pass |
|---|---|---|---|
| Background | [hex] | [hex] | [ ] |
| Text primary | [hex] | [hex] | [ ] |
| Accent | [hex] | [hex] | [ ] |

---

## Typography fidelity

| Element | Expected font | Actual | Expected size | Actual | Pass |
|---|---|---|---|---|---|
| H1 | [family] | [actual] | [size] | [actual] | [ ] |
| Body | [family] | [actual] | [size] | [actual] | [ ] |

---

## Asset completeness

- [ ] All images loading (no broken images)
- [ ] All videos loading
- [ ] All SVG icons rendering
- [ ] Custom fonts loading

---

## Interaction states

| Element | State | Expected | Actual | Pass |
|---|---|---|---|---|
| Primary CTA | Hover | [describe] | [actual] | [ ] |
| Navigation | Hover | [describe] | [actual] | [ ] |
| Mobile nav | Tap | Opens hamburger | [actual] | [ ] |

---

## Deviations

| Section | Type | Reason | Resolution |
|---|---|---|---|
| [section] | [font/color/layout/asset/content] | [reason] | [how resolved] |

---

## Final QA result

- [ ] **PASS** — Clone meets all quality gates
- [ ] **PASS WITH NOTED DEVIATIONS** — Deviations documented above
- [ ] **FAIL** — Blocking issues must be resolved before handoff

**Reviewer notes:**  
[Any additional notes]
