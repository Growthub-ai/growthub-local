# AI Website Cloner Operator — Skills

**Kit:** `growthub-ai-website-cloner-v1`  
**Worker ID:** `ai-website-cloner-operator`

---

## SKILL: `/clone-website`

The primary skill. Accepts one or more target URLs and executes the full clone pipeline.

### Invocation

```
/clone-website <target-url1> [<target-url2> ...]
```

### Pipeline phases (strict order)

| Phase | Name | Key output |
|---|---|---|
| 0 | Environment gate | Pass/fail — fork exists, Node 24+, deps installed |
| 1 | Reconnaissance | Screenshots, design tokens, interaction map, asset inventory |
| 2 | Foundation | Design token extraction sheet, fonts, globals, layout scaffold |
| 3 | Component specs | One spec file per section with exact computed CSS values |
| 4 | Asset download | All images, videos, SVGs, fonts downloaded to `public/` |
| 5 | Builder dispatch | Parallel worktrees — one per section/component |
| 6 | Assembly | Merge all worktrees, wire up route, resolve conflicts |
| 7 | Visual QA | Diff against original screenshots, document deviations |
| 8 | Platform handoff | Build verified, deployment instructions, client deliverable |

---

## RECONNAISSANCE CHECKLIST

Before writing any spec, capture all of the following:

### Screenshots
- Desktop: 1440px wide, full scroll depth (every viewport height of content)
- Tablet: 768px wide, same depth
- Mobile: 375px wide, same depth
- Interactive states: hover states on navigation, CTAs, cards

### Design token extraction
- Color palette: exact hex values + oklch equivalents for CSS
- Typography: every font family, size, weight, line-height, letter-spacing combination in use
- Spacing: all margin/padding values used in the layout (identify the scale)
- Border radius: all border-radius values
- Box shadows: all box-shadow definitions
- Transitions: all transition/animation timing values

### Interaction sweep
- Navigation: all hover states, dropdowns, mobile hamburger
- CTAs and buttons: hover, active, focus, disabled states
- Cards: hover transforms, shadows
- Scroll-triggered: parallax, fade-ins, stickiness
- Forms: focus, validation, error states

### Asset inventory
- All `<img>` src values (CDN URLs)
- All `<video>` src values
- All background-image URLs
- All SVG icons (inline or file)
- All custom webfont sources

---

## DESIGN TOKEN EXTRACTION METHODOLOGY

Use `getComputedStyle()` in the browser DevTools console to extract exact values:

```js
// Get all colors used in the page
[...document.querySelectorAll('*')].flatMap(el => {
  const s = getComputedStyle(el);
  return [s.color, s.backgroundColor, s.borderColor].filter(c => c && c !== 'rgba(0, 0, 0, 0)');
}).filter((v, i, a) => a.indexOf(v) === i);
```

Document all values in `templates/design-token-extraction.md`. Convert to oklch for Tailwind CSS v4.

---

## COMPONENT SPEC FORMAT

Each spec file must include these sections:

```markdown
# <SectionName> — Component Spec

## Purpose
What this section does for the user.

## Layout
- Container max-width: <value>
- Padding: <top> <right> <bottom> <left>
- Display: <flex|grid|block>
- Grid columns (desktop/tablet/mobile): <values>
- Gap: <value>

## Typography
- Heading: <font-family>, <size>/<line-height>, weight <weight>
- Body: <font-family>, <size>/<line-height>, weight <weight>
- Caption: <font-family>, <size>/<line-height>, weight <weight>

## Colors
- Background: <hex> / oklch(<value>)
- Text primary: <hex> / oklch(<value>)
- Text secondary: <hex> / oklch(<value>)
- Accent: <hex> / oklch(<value>)
- Border: <hex> / oklch(<value>)

## States
- Default: [describe]
- Hover: [describe — exact transform, color change, transition timing]
- Active: [describe]
- Focus: [describe — focus ring color, offset]

## Responsive
- Desktop (1440px): [layout description]
- Tablet (768px): [layout changes]
- Mobile (375px): [layout changes]

## Assets
- Image: public/images/<filename>.<ext> — originally from <cdn-url>
- Icon: src/components/icons.tsx as <IconName>

## Content
[Exact text content from the target — no placeholders]

## Accessibility
- ARIA role: <role>
- Landmark: <nav|main|aside|footer>
- Tab order: [describe]
- Keyboard navigation: [describe]
```

---

## BUILDER DISPATCH RULES

1. Each builder receives exactly one component spec
2. Each builder works in a fresh `git worktree` on a dedicated branch: `build/<section-slug>`
3. Builders output files ONLY to `src/components/<section-slug>/`
4. No builder writes to: `src/app/`, `src/lib/`, `src/types/`, `globals.css`, `layout.tsx`
5. The orchestrator owns all assembly and shared file writes
6. After all builders complete, orchestrator merges all `build/*` branches
7. Merge conflicts are resolved by the orchestrator with full spec context
8. Assembly order follows the spec list in the dispatch plan

---

## VISUAL QA STANDARDS

A clone passes QA when:

| Criterion | Threshold |
|---|---|
| Layout accuracy | All major sections within 2px of original |
| Color fidelity | All token values match extracted values |
| Typography | Font family, size, weight identical for all text |
| Asset completeness | All images, videos, icons present and loading |
| Responsive | No layout breaks at 1440, 768, 375px |
| Interaction | All hover/focus/active states visually match |
| Build | `npm run build` exits 0 with no errors |
| Lint | `npm run lint` exits 0 |

Any deviation must be documented in `visual-qa-checklist.md` with a reason and resolution.

---

## OUTPUT NAMING

All outputs use the pattern:
```
output/<client-slug>/<project-slug>/<artifact-type>.<extension>
```

Examples:
```
output/acme-corp/homepage-clone/research/reconnaissance-report.md
output/acme-corp/homepage-clone/specs/hero-section.md
output/acme-corp/homepage-clone/specs/navigation.md
output/acme-corp/homepage-clone/qa/visual-qa-checklist.md
output/acme-corp/homepage-clone/platform-handoff.md
```
