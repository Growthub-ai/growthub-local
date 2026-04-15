# Clone Brief — Sample

**Project:** Acme Corp Homepage Clone  
**Client:** Acme Corp  
**Target URL(s):** `https://acme.example.com`  
**Date:** 2026-04-15  
**Operator:** `ai-website-cloner-operator`

---

## Objective

Pixel-perfect clone of the Acme Corp homepage into a modern Next.js 16 codebase. The client needs the source code for a planned migration from their legacy Webflow site to a self-hosted Next.js deployment.

---

## Scope

### Pages to clone
- [x] `https://acme.example.com` — Homepage

### Sections to include
- [x] Navigation / Header (sticky, with dropdown menus)
- [x] Hero — full-viewport with background video
- [x] Features grid — 3-column, 6 feature cards
- [x] Social proof — testimonials carousel
- [x] CTA banner — centered, high-contrast
- [x] FAQ accordion
- [x] Footer — 4-column with newsletter signup

### Sections to exclude
- [x] Login flow — auth-gated, excluded by client request
- [x] Blog listing — dynamic content, excluded from v1 scope

---

## Constraints

- **Deployment target:** Vercel
- **Custom domain:** `acme.com` (configured post-handoff)
- **Proprietary fonts:** "Acme Sans" — not publicly available; replaced with Inter (documented deviation)
- **Auth-gated content:** Login flow excluded from scope
- **Terms of Service notes:** Confirmed with client — they own this site and have rights to reproduce it

---

## Deliverables

- [x] Cloned Next.js codebase in `~/ai-website-cloner-template`
- [x] Reconnaissance report
- [x] Design token extraction sheet (24 colors, 8 typography combinations)
- [x] 7 component specs
- [x] Visual QA checklist — PASS with 1 noted deviation (font)
- [x] Platform handoff document
