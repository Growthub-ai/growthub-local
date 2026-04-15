# Multi-Phase Pipeline Architecture

**Kit:** `growthub-ai-website-cloner-v1`

---

## Overview

The clone pipeline runs in strict phase order. No phase may be skipped. Each phase produces artifacts consumed by the next.

```
Phase 0: Environment gate
    ↓
Phase 1: Load methodology + project context
    ↓
Phase 2: Load runtime docs
    ↓
Phase 3: Reconnaissance (screenshots, tokens, assets, interactions)
    ↓
Phase 4: 3-question gate (objective, exclusions, deployment target)
    ↓
Phase 5: Component spec writing (one spec per section)
    ↓
Phase 6: Builder dispatch (parallel worktrees)
    ↓
Phase 7: Assembly + Visual QA
    ↓
Phase 8: Platform handoff
```

---

## Phase 0 — Environment gate

**Gate criteria:**
1. Fork exists at `~/ai-website-cloner-template` (or `AI_CLONER_FORK_PATH`)
2. Node.js 24+ available
3. Fork `node_modules/` installed
4. AI agent active

**If any check fails:** stop, report the specific issue, do not proceed.

---

## Phase 3 — Reconnaissance (most critical phase)

Reconnaissance is the most time-sensitive phase. It must be thorough because all subsequent work depends on it.

### Screenshot protocol
The agent opens Chrome (or a Playwright browser) and captures:
- Desktop screenshots at every viewport height of content (scroll the page)
- Tablet and mobile screenshots at the same scroll depths
- Hover state screenshots for all interactive elements

### Token extraction
The agent runs `getComputedStyle()` extraction calls in the browser console. The exact calls are defined in `skills.md`. Tokens are extracted for:
- All colors in use (background, text, borders, accents)
- All typography combinations (family, size, weight, line-height)
- All spacing values (margin, padding)
- All border-radius, box-shadow, and transition values

### Asset download
All external assets are downloaded to `public/` immediately during reconnaissance — before spec writing. This prevents broken image references during building.

---

## Phase 5 — Component spec writing

Each spec is a complete, standalone brief for one builder. It must include:
- Exact computed CSS values (not estimates)
- Multi-state content for all interactive states
- Responsive behavior at all three breakpoints
- Exact asset paths in `public/`
- Exact content (no placeholders)

The spec is the builder's only source of truth. It must be self-contained.

---

## Phase 6 — Parallel builder dispatch

The orchestrator creates a `git worktree` for each builder:

```bash
# Orchestrator creates worktrees
git worktree add ../build-navigation build/navigation
git worktree add ../build-hero-section build/hero-section
# ... one per section
```

Each builder is dispatched as a subagent with:
1. Their section spec (inline)
2. The design token extraction sheet
3. The asset manifest
4. Clear output constraints (only write to `src/components/<section-slug>/`)

Builders run in parallel — the orchestrator does not wait for one before starting the next.

---

## Phase 7 — Assembly and visual QA

**Assembly:**
1. All builder branches are merged into `main` (or the integration branch)
2. The orchestrator writes `src/app/page.tsx` to import and wire all components
3. `npm run build` is run to confirm no errors
4. `npm run lint` and `npm run typecheck` must pass

**Visual QA:**
1. `npm run dev` is started
2. The agent opens the clone in the browser
3. Side-by-side comparison with original screenshots
4. Each section is checked at all three breakpoints
5. All hover/focus/active states are exercised interactively
6. Findings are documented in `visual-qa-checklist.md`

---

## Phase 8 — Platform handoff

The platform handoff document (`platform-handoff.md`) is the final deliverable. It includes:
- What was built (summary)
- How to run locally
- How to build for production
- Deployment instructions for the target platform
- All known deviations from the original
- Next customization steps

The brand kit is updated with a deliverable line.
