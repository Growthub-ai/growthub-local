# Validation Checklist — AI Website Cloner

**Kit:** `growthub-ai-website-cloner-v1`

Run through this checklist before producing the platform handoff.

---

## Environment validation

- [ ] Fork exists at `~/ai-website-cloner-template` (or `AI_CLONER_FORK_PATH`)
- [ ] Node.js 24+ confirmed (`node --version`)
- [ ] `node_modules/` installed in fork root
- [ ] AI agent is active and running in the fork directory

---

## Reconnaissance validation

- [ ] Desktop screenshots captured (1440px, all scroll depths)
- [ ] Tablet screenshots captured (768px)
- [ ] Mobile screenshots captured (375px)
- [ ] Design tokens extracted (`design-token-extraction.md` complete)
- [ ] All hover/focus/active states documented
- [ ] Asset inventory complete (all external URLs collected)
- [ ] All assets downloaded to `public/images/`, `public/videos/`, `public/seo/`

---

## Spec validation

- [ ] One spec file per identified section in `output/<client>/<project>/specs/`
- [ ] Each spec has exact computed CSS values (not estimated)
- [ ] Each spec documents responsive breakpoints
- [ ] Each spec documents interaction states
- [ ] Asset paths in specs match `public/` inventory

---

## Build validation

- [ ] `npm run build` exits 0 (no TypeScript errors, no build errors)
- [ ] `npm run lint` exits 0 (no ESLint errors)
- [ ] `npm run typecheck` exits 0 (TypeScript strict mode clean)
- [ ] Dev server runs: `npm run dev` → `localhost:3000` loads without errors
- [ ] No 404s for assets in browser console

---

## Visual QA validation

- [ ] All sections rendered at desktop 1440px — reviewed against screenshot
- [ ] All sections rendered at tablet 768px — reviewed against screenshot
- [ ] All sections rendered at mobile 375px — reviewed against screenshot
- [ ] All hover states verified interactively
- [ ] All focus states verified via keyboard navigation
- [ ] Color tokens match extracted values (spot-check 5+ elements)
- [ ] Typography matches (spot-check font family, size, weight, line-height)
- [ ] All images loading (no broken images)
- [ ] All videos loading (no broken videos)
- [ ] All SVG icons rendering correctly

---

## Deviations documented

- [ ] All known deviations listed in `qa/visual-qa-checklist.md`
- [ ] Each deviation has a type, reason, and resolution

---

## Handoff validation

- [ ] `platform-handoff.md` complete
- [ ] Deployment instructions for the target platform written
- [ ] Brand kit updated with deliverable line
