# Builder Dispatch Plan

**Project:** [PROJECT NAME]  
**Date:** YYYY-MM-DD  
**Total builders:** [N]

---

## Dispatch rules

1. Each builder works in `git worktree` on branch `build/<section-slug>`
2. Each builder receives: section spec + design token extraction + asset manifest
3. Builders output ONLY to `src/components/<section-slug>/`
4. No builder touches: `src/app/`, `src/lib/`, `src/types/`, `globals.css`, `layout.tsx`
5. Orchestrator assembles the page and resolves merge conflicts

---

## Builder assignments

| Builder | Branch | Section | Spec file | Est. complexity |
|---|---|---|---|---|
| 1 | `build/navigation` | Navigation | `specs/navigation.md` | [low/med/high] |
| 2 | `build/hero-section` | Hero | `specs/hero-section.md` | [low/med/high] |
| 3 | `build/[slug]` | [Section] | `specs/[slug].md` | [low/med/high] |
| N | `build/footer` | Footer | `specs/footer.md` | [low/med/high] |

---

## Shared context for all builders

All builders receive the following files inline:
- `templates/design-token-extraction.md` (full token set)
- `templates/asset-manifest.md` (all downloaded assets)
- Their section's spec file

---

## Assembly order

After all builders complete, the orchestrator assembles in this order:

```tsx
// src/app/page.tsx
import { Navigation } from "@/components/navigation/Navigation";
import { HeroSection } from "@/components/hero-section/HeroSection";
// ... in section order
import { Footer } from "@/components/footer/Footer";

export default function Page() {
  return (
    <>
      <Navigation />
      <main>
        <HeroSection />
        {/* sections in order */}
      </main>
      <Footer />
    </>
  );
}
```

---

## Merge instructions

After all `build/*` branches are complete:

```bash
cd ~/ai-website-cloner-template
git checkout main

# Merge each builder branch
git merge build/navigation --no-ff -m "feat: navigation component"
git merge build/hero-section --no-ff -m "feat: hero section"
# ... continue for all builders

# Assemble the page
# Edit src/app/page.tsx to import and wire all components

# Run quality checks
npm run build
npm run lint
npm run typecheck
```

---

## Conflict resolution notes

[Document any merge conflicts encountered and how they were resolved]
