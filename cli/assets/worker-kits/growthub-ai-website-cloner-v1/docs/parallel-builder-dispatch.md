# Parallel Builder Dispatch

**Kit:** `growthub-ai-website-cloner-v1`

---

## Why parallel builders

A modern website has 5–20 distinct sections. Cloning them sequentially would be slow and would block each builder on the previous one. The parallel worktree system lets all builders work simultaneously, each in an isolated branch.

The orchestrator (the Growthub operator running as the main agent) dispatches all builders at once, waits for them to complete, then assembles the results.

---

## Worktree isolation

Each builder gets a dedicated `git worktree` — a separate working directory linked to the same repository but on a different branch:

```bash
# Create worktrees (orchestrator does this before dispatch)
git worktree add ../build-navigation build/navigation
git worktree add ../build-hero-section build/hero-section
git worktree add ../build-features build/features
git worktree add ../build-footer build/footer
```

Each builder's working directory is independent. They cannot conflict with each other during development.

---

## Builder constraints

Builders must follow these rules without exception:

| Rule | Detail |
|---|---|
| Write only to `src/components/<section-slug>/` | No writes to shared files |
| No writes to `src/app/` | The orchestrator owns the page |
| No writes to `src/lib/` | Shared utilities stay unchanged |
| No writes to `globals.css` | Tokens are in the design token file |
| No writes to `src/types/` | Types are defined by the orchestrator |
| No writes to `layout.tsx` | The root layout is owned by the orchestrator |
| One component file per section | `src/components/<section-slug>/<ComponentName>.tsx` |

---

## Builder input package

Each builder receives exactly:

1. **Section spec** — the complete component spec from `specs/<section-slug>.md`
2. **Design token sheet** — `templates/design-token-extraction.md` (full token set)
3. **Asset manifest** — `templates/asset-manifest.md` (all `public/` asset paths)
4. **Naming instructions** — component name, output path, export format

---

## Builder output format

Each builder produces a TypeScript React component:

```tsx
// src/components/hero-section/HeroSection.tsx
import Image from "next/image";

export function HeroSection() {
  return (
    <section className="...">
      {/* exact content from spec */}
    </section>
  );
}
```

Requirements:
- Named export (not default export)
- TypeScript strict — no `any`
- Tailwind CSS utility classes (no inline styles)
- Uses `cn()` from `src/lib/utils.ts` for conditional classes
- Asset paths from `public/` using Next.js `<Image>` or `<video>` tags
- Uses design tokens from the Tailwind config (via CSS variables)

---

## Assembly

After all builders complete, the orchestrator:

1. Merges all `build/*` branches into `main`
2. Resolves any conflicts (should be minimal since builders touch different files)
3. Writes `src/app/page.tsx` importing all components in order
4. Updates `src/app/layout.tsx` with correct metadata
5. Updates `globals.css` with the full design token set from the extraction sheet

---

## Conflict resolution

The most common merge conflicts:
- `package.json` — if two builders added the same dependency. Orchestrator de-dupes.
- `src/components/icons.tsx` — if two builders added SVG icons. Orchestrator merges all icons.

These are resolved by the orchestrator with full context about what all builders were doing.
