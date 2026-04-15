# HeroSection — Component Spec (Sample)

**Project:** Acme Corp Homepage Clone  
**Section slug:** `hero-section`  
**Output component:** `src/components/hero-section/HeroSection.tsx`  
**Date:** 2026-04-15

---

## Purpose

Full-viewport hero section with a looping background video, centered headline, subheadline, and two CTA buttons. First visible content above the fold on desktop and mobile.

---

## Layout

- **Container max-width:** 1280px
- **Container padding (desktop):** 0 80px
- **Container padding (mobile):** 0 24px
- **Display:** flex, column, center-aligned
- **Section min-height:** 100vh
- **Background:** `#0a0a0a` / `oklch(7% 0 0)` with video overlay

---

## Typography

| Element | Font family | Size | Line height | Weight | Color | Notes |
|---|---|---|---|---|---|---|
| Headline | Inter | 72px | 1.1 | 700 | `#ffffff` | Desktop only |
| Headline | Inter | 40px | 1.15 | 700 | `#ffffff` | Mobile |
| Subheadline | Inter | 20px | 1.5 | 400 | `rgba(255,255,255,0.7)` | Desktop |
| Subheadline | Inter | 16px | 1.5 | 400 | `rgba(255,255,255,0.7)` | Mobile |
| CTA primary | Inter | 16px | 1 | 600 | `#0a0a0a` | — |
| CTA secondary | Inter | 16px | 1 | 600 | `#ffffff` | — |

---

## Colors

- **Background:** `#0a0a0a` / `oklch(7% 0 0)` (with bg video)
- **Text primary:** `#ffffff` / `oklch(100% 0 0)`
- **Text secondary:** `rgba(255,255,255,0.7)` / `oklch(100% 0 0 / 0.7)`
- **CTA primary bg:** `#ffffff` / `oklch(100% 0 0)`
- **CTA secondary border:** `rgba(255,255,255,0.3)` / `oklch(100% 0 0 / 0.3)`

---

## States

### Default
Headline + subheadline centered. Two CTAs side by side. Background video loops silently at `opacity: 0.4`.

### Hover — CTA primary
- Transform: none
- Background: `oklch(91% 0 0)` (slight dim)
- Transition: `background 0.2s ease`

### Hover — CTA secondary
- Border-color: `oklch(100% 0 0 / 0.6)`
- Background: `oklch(100% 0 0 / 0.08)`
- Transition: `all 0.2s ease`

### Focus (both CTAs)
- Focus ring color: `#3b82f6` / `oklch(59% 0.2 260)`
- Focus ring offset: 3px
- Focus ring width: 2px

---

## Responsive behavior

### Desktop (1440px)
72px headline, two CTAs side by side, background video full-coverage

### Tablet (768px)
56px headline, CTAs stack vertically, video still full-coverage

### Mobile (375px)
40px headline, 16px subheadline, CTAs full-width and stacked

---

## Assets

| File | Public path | Source URL |
|---|---|---|
| hero-bg.mp4 | `public/videos/hero-bg.mp4` | `https://cdn.acme.example.com/hero-bg.mp4` |

---

## Content

**Headline:**  
The Future of Work Starts Here

**Subheadline:**  
Automate your growth with AI. Launch faster, scale smarter, and let your team focus on what matters.

**CTA primary:**  
Start for free

**CTA secondary:**  
Watch demo

---

## Accessibility

- **ARIA landmark:** `<section aria-label="Hero">`
- **Heading level:** `<h1>`
- **Video:** `<video autoPlay muted loop playsInline aria-hidden="true">` (decorative)
- **Tab order:** CTA primary → CTA secondary
- **Reduced motion:** video paused if `prefers-reduced-motion: reduce`

---

## Implementation notes

The background video must use `object-fit: cover` and position `absolute` behind the content. The content must be `relative` with `z-index: 1`.

Tailwind v4 class for the video overlay: use `bg-black/60` over the video to ensure text contrast.
