# Platform Handoff

**Project:** [PROJECT NAME]  
**Client:** [CLIENT NAME]  
**Date:** YYYY-MM-DD  
**Clone source:** [https://example.com]  
**Codebase location:** `~/ai-website-cloner-template` (or custom fork path)

---

## What was built

[One-paragraph summary of what was cloned and what the output codebase contains.]

---

## Running the clone locally

```bash
cd ~/ai-website-cloner-template
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Building for production

```bash
cd ~/ai-website-cloner-template
npm run build
npm run start
```

---

## Deploying to Vercel

```bash
npm install -g vercel
cd ~/ai-website-cloner-template
vercel --prod
```

Or connect the repository to [vercel.com](https://vercel.com) for automatic deploys.

---

## Deploying to other platforms

### Self-hosted (Node.js)
```bash
npm run build
node .next/standalone/server.js
```

### Static export (if no server-side features used)
```bash
# Add output: 'export' to next.config.ts first
npm run build
# Output is in out/
```

---

## Project structure overview

```
src/
  app/
    page.tsx          # Main cloned page
    layout.tsx        # Root layout (fonts, globals)
    globals.css       # Design tokens and base styles
  components/
    navigation/       # Navigation component
    hero-section/     # Hero section
    [section-slug]/   # One directory per cloned section
    icons.tsx         # Extracted SVG icons
  lib/
    utils.ts          # cn() utility
public/
  images/             # Downloaded images
  videos/             # Downloaded videos
  seo/                # Favicon, OG image, webmanifest
docs/
  research/           # Reconnaissance output
```

---

## Known deviations from original

| Section | Type | Notes |
|---|---|---|
| [section] | [font/color/layout/asset] | [description] |

---

## Customization next steps

1. [ ] Replace placeholder content in all sections with client's actual content
2. [ ] Update `src/app/layout.tsx` metadata (title, description, OG image)
3. [ ] Configure deployment environment variables if any
4. [ ] Remove proprietary assets if not licensed for redistribution
5. [ ] Update `public/seo/` with client's actual favicon and OG images

---

## QA result

See `qa/visual-qa-checklist.md` for the full QA report.

**Overall result:** [PASS / PASS WITH NOTED DEVIATIONS / FAIL]
