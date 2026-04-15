# [SectionName] — Component Spec

**Project:** [PROJECT NAME]  
**Section slug:** `[section-slug]`  
**Output component:** `src/components/[section-slug]/[ComponentName].tsx`  
**Date:** YYYY-MM-DD

---

## Purpose

[What this section does for the user — one paragraph.]

---

## Layout

- **Container max-width:** [value]
- **Container padding (desktop):** [top right bottom left]
- **Container padding (mobile):** [top right bottom left]
- **Display:** [flex | grid | block]
- **Grid columns (desktop):** [value]
- **Grid columns (tablet):** [value]
- **Grid columns (mobile):** [value]
- **Gap:** [value]
- **Section min-height:** [value]
- **Background:** [color token]

---

## Typography

| Element | Font family | Size | Line height | Weight | Color | Notes |
|---|---|---|---|---|---|---|
| Heading | [family] | [size] | [lh] | [weight] | [color] | — |
| Subheading | [family] | [size] | [lh] | [weight] | [color] | — |
| Body | [family] | [size] | [lh] | [weight] | [color] | — |
| Caption | [family] | [size] | [lh] | [weight] | [color] | — |
| Button label | [family] | [size] | [lh] | [weight] | [color] | — |

---

## Colors

- **Background:** [hex] / [oklch]
- **Text primary:** [hex] / [oklch]
- **Text secondary:** [hex] / [oklch]
- **Accent / CTA:** [hex] / [oklch]
- **Border:** [hex] / [oklch]

---

## States

### Default
[Describe normal rendering]

### Hover
- **Trigger:** [what element triggers the state]
- **Transform:** [e.g. `translateY(-2px)`]
- **Color change:** [describe]
- **Transition:** [e.g. `all 0.2s ease`]
- **Shadow change:** [describe]

### Active
[Describe active/pressed state]

### Focus
- **Focus ring color:** [hex / oklch]
- **Focus ring offset:** [value]
- **Focus ring width:** [value]

---

## Responsive behavior

### Desktop (1440px)
[Describe layout]

### Tablet (768px)
[Describe layout changes from desktop]

### Mobile (375px)
[Describe layout changes from tablet]

---

## Assets

| Asset | Type | Public path | Source URL |
|---|---|---|---|
| [image name] | image | `public/images/[filename].[ext]` | [original CDN URL] |
| [icon name] | SVG | `src/components/icons.tsx` as `[IconName]` | [inline / file] |

---

## Content

[Paste the exact text content from the target site. No placeholder text.]

**Heading:**  
[exact heading text]

**Body copy:**  
[exact body text]

**CTA label:**  
[exact button/link text]

---

## Accessibility

- **ARIA landmark:** `[nav | main | aside | section]`
- **Heading level:** `[h1 | h2 | h3]`
- **Image alt text:** [describe required alt text]
- **Tab order:** [describe keyboard navigation path through this section]
- **Screen reader notes:** [any special ARIA labels, descriptions]

---

## Implementation notes

[Any tricky implementation details, browser quirks, or decisions made during spec writing]
