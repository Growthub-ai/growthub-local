# Design Token Extraction

**Project:** [PROJECT NAME]  
**Target URL:** [https://example.com]  
**Date:** YYYY-MM-DD

---

## Color palette

| Token name | Hex | oklch | Usage |
|---|---|---|---|
| `color-primary` | `#000000` | `oklch(0% 0 0)` | [CTAs, headings] |
| `color-bg` | `#ffffff` | `oklch(100% 0 0)` | [Page background] |
| `color-text` | `#1a1a1a` | `oklch(12% 0 0)` | [Body text] |
| `color-text-secondary` | `#666666` | `oklch(45% 0 0)` | [Secondary text] |
| `color-accent` | `#0070f3` | `oklch(50% 0.2 260)` | [Links, hover states] |
| `color-border` | `#e5e5e5` | `oklch(91% 0 0)` | [Dividers, borders] |

---

## Typography

| Token name | Font family | Size | Line height | Weight | Usage |
|---|---|---|---|---|---|
| `text-h1` | [family] | [size] | [lh] | [weight] | [page heading] |
| `text-h2` | [family] | [size] | [lh] | [weight] | [section heading] |
| `text-h3` | [family] | [size] | [lh] | [weight] | [card heading] |
| `text-body` | [family] | [size] | [lh] | [weight] | [body copy] |
| `text-caption` | [family] | [size] | [lh] | [weight] | [captions, labels] |
| `text-button` | [family] | [size] | [lh] | [weight] | [button labels] |

---

## Spacing scale

| Token name | Value | Usage |
|---|---|---|
| `spacing-xs` | [value] | [usage] |
| `spacing-sm` | [value] | [usage] |
| `spacing-md` | [value] | [usage] |
| `spacing-lg` | [value] | [usage] |
| `spacing-xl` | [value] | [usage] |
| `spacing-2xl` | [value] | [usage] |

---

## Border radius

| Token name | Value | Usage |
|---|---|---|
| `radius-sm` | [value] | [buttons, inputs] |
| `radius-md` | [value] | [cards] |
| `radius-lg` | [value] | [modals, sections] |
| `radius-full` | `9999px` | [pills, avatars] |

---

## Box shadows

| Token name | Value | Usage |
|---|---|---|
| `shadow-sm` | [value] | [subtle cards] |
| `shadow-md` | [value] | [elevated cards] |
| `shadow-lg` | [value] | [modals, dropdowns] |

---

## Transitions

| Token name | Value | Usage |
|---|---|---|
| `transition-fast` | [duration easing] | [hover color changes] |
| `transition-base` | [duration easing] | [transform, opacity] |
| `transition-slow` | [duration easing] | [page transitions] |

---

## Tailwind CSS v4 config snippet

```css
@theme {
  --color-primary: oklch(0% 0 0);
  --color-bg: oklch(100% 0 0);
  --color-text: oklch(12% 0 0);
  --color-accent: oklch(50% 0.2 260);
  /* Add all extracted tokens here */
}
```
