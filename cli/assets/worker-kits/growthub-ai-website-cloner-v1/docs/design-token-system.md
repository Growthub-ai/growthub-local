# Design Token System

**Kit:** `growthub-ai-website-cloner-v1`

---

## Overview

The clone's design system uses Tailwind CSS v4 with oklch color tokens. All design values extracted from the target site are expressed as CSS custom properties in the `@theme` block of `globals.css`.

---

## Token extraction methodology

The operator uses `getComputedStyle()` in the browser DevTools console to extract exact computed values from the live target site.

### Color extraction

```js
// Run in browser DevTools console on the target site
// Extract all unique colors in use
[...document.querySelectorAll('*')].flatMap(el => {
  const s = getComputedStyle(el);
  return [s.color, s.backgroundColor, s.borderColor, s.outlineColor]
    .filter(c => c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent');
}).filter((v, i, a) => a.indexOf(v) === i).sort();
```

### Typography extraction

```js
// Extract all typography combinations
[...document.querySelectorAll('*')].map(el => {
  const s = getComputedStyle(el);
  return `${s.fontFamily} | ${s.fontSize} | ${s.fontWeight} | ${s.lineHeight}`;
}).filter((v, i, a) => a.indexOf(v) === i).sort();
```

### Spacing extraction

```js
// Extract spacing values from a specific element
const el = document.querySelector('.hero-section');
const s = getComputedStyle(el);
console.log({
  padding: s.padding,
  margin: s.margin,
  gap: s.gap,
  columnGap: s.columnGap,
  rowGap: s.rowGap,
});
```

---

## Converting to oklch

Tailwind CSS v4 uses oklch as the primary color format. Convert extracted hex/rgb values:

```js
// Paste into browser console to convert RGB to oklch approximation
// (or use https://oklch.com/ for manual conversion)
function rgbToOklch(r, g, b) {
  // Simplified — use the oklch.com tool for production values
  const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return `oklch(${(L * 100).toFixed(0)}% 0 0)`;
}
```

Use [oklch.com](https://oklch.com/) for precise conversion during token extraction.

---

## Tailwind CSS v4 `@theme` configuration

All extracted tokens go into `src/app/globals.css`:

```css
@import "tailwindcss";

@theme {
  /* Colors */
  --color-primary: oklch(12% 0 0);
  --color-bg: oklch(100% 0 0);
  --color-text: oklch(15% 0 0);
  --color-text-secondary: oklch(45% 0 0);
  --color-accent: oklch(50% 0.2 260);
  --color-border: oklch(91% 0 0);

  /* Typography */
  --font-sans: "Inter", system-ui, sans-serif;
  --font-heading: "Geist", "Inter", system-ui, sans-serif;

  /* Spacing scale */
  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2rem;
  --spacing-2xl: 3rem;

  /* Border radius */
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;

  /* Shadows */
  --shadow-sm: 0 1px 2px oklch(0% 0 0 / 0.05);
  --shadow-md: 0 4px 6px oklch(0% 0 0 / 0.1);
  --shadow-lg: 0 10px 15px oklch(0% 0 0 / 0.1);
}
```

---

## How builders use tokens

Builders use Tailwind utility classes that reference the tokens:

```tsx
// Using color tokens
<div className="bg-[var(--color-bg)] text-[var(--color-text)]">

// Using spacing tokens
<section className="px-[var(--spacing-xl)] py-[var(--spacing-2xl)]">

// Using radius tokens
<button className="rounded-[var(--radius-md)]">

// Using shadow tokens
<div className="shadow-[var(--shadow-md)]">
```

All token references are from the extraction sheet. No builder should invent new token names.
