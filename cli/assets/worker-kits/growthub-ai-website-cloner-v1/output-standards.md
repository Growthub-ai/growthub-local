# Output Standards — AI Website Cloner

**Kit:** `growthub-ai-website-cloner-v1`

---

## Output directory structure

All work products are stored inside the `ai-website-cloner-template` fork repository:

```
~/ai-website-cloner-template/
  output/
    <client-slug>/
      <project-slug>/
        research/
          reconnaissance-report.md
          design-token-extraction.md
          asset-inventory.md
        specs/
          <section-slug>.md       (one per identified section)
        qa/
          visual-qa-checklist.md
        platform-handoff.md
```

---

## Naming conventions

| Artifact | Naming pattern |
|---|---|
| Client slug | lowercase-kebab-case, e.g. `acme-corp` |
| Project slug | lowercase-kebab-case, e.g. `homepage-clone` |
| Section slug | lowercase-kebab-case matching section name, e.g. `hero-section` |
| Component files | PascalCase under `src/components/<section-slug>/`, e.g. `HeroSection.tsx` |

---

## Required deliverables per project

Every completed clone project must have:

1. `reconnaissance-report.md` — screenshots documented, tokens noted
2. `design-token-extraction.md` — complete token set with oklch conversions
3. One `specs/<section-slug>.md` per section cloned
4. `asset-inventory.md` — all external assets downloaded to `public/`
5. `qa/visual-qa-checklist.md` — completed with pass/deviation notes
6. `platform-handoff.md` — deployment-ready instructions

---

## Quality gates

Before producing the platform handoff, the following must pass:

- `npm run build` — TypeScript compilation and Next.js build succeeds
- `npm run lint` — ESLint passes with no errors
- `npm run typecheck` — TypeScript strict mode passes
- Visual diff — all sections visually reviewed against original screenshots

---

## Deviation logging

If a section cannot be cloned exactly (auth-gated content, missing assets, proprietary fonts), log the deviation in `visual-qa-checklist.md` under the "Deviations" section:

```markdown
## Deviations

| Section | Type | Reason | Resolution |
|---|---|---|---|
| hero-section | Font | Proprietary font not available | Replaced with closest system font; documented |
| pricing-table | Auth | Pricing content behind login | Placeholder content with noted limitation |
```
