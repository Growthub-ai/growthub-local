# Platform Handoff — Sample

**Project:** Acme Corp Homepage Clone  
**Client:** Acme Corp  
**Date:** 2026-04-15  
**Clone source:** `https://acme.example.com`  
**Codebase location:** `~/ai-website-cloner-template`

---

## What was built

A pixel-perfect clone of the Acme Corp homepage, rebuilt in Next.js 16 + shadcn/ui + Tailwind CSS v4. The clone includes all 7 sections of the original page (navigation, hero, features, testimonials, CTA banner, FAQ, footer) with all assets downloaded and all interactive states matched. The only deviation is the proprietary "Acme Sans" font, replaced with Inter (documented below).

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

Expected build output: ~45 static pages + 1 dynamic route.

---

## Deploying to Vercel

```bash
npm install -g vercel
cd ~/ai-website-cloner-template
vercel --prod
```

The app will be live at `https://ai-website-cloner-template.vercel.app` until you configure a custom domain.

---

## Project structure

```
src/
  app/
    page.tsx                    # Main homepage
    layout.tsx                  # Root layout with Inter font
    globals.css                 # Full design token set (24 colors)
  components/
    navigation/Navigation.tsx
    hero-section/HeroSection.tsx
    features-grid/FeaturesGrid.tsx
    testimonials/Testimonials.tsx
    cta-banner/CtaBanner.tsx
    faq/Faq.tsx
    footer/Footer.tsx
    icons.tsx                   # 18 extracted SVG icons
public/
  images/                       # 11 downloaded images
  videos/
    hero-bg.mp4                 # Hero background video
  seo/
    favicon.ico
    og-image.png
```

---

## Known deviations from original

| Section | Type | Notes |
|---|---|---|
| All headings | Font | "Acme Sans" is a proprietary font not available via CDN. Replaced with Inter (weight 700). Visual difference is subtle — baseline spacing may differ by ~2px on some headings. |

---

## Customization next steps

1. [ ] Replace `public/seo/og-image.png` with the client's actual OG image
2. [ ] Update `src/app/layout.tsx` metadata: title, description, canonical URL
3. [ ] Configure Vercel environment variables for any future dynamic features
4. [ ] If "Acme Sans" is obtained via license, add it to `src/app/layout.tsx` and update `globals.css`
5. [ ] Remove `public/videos/hero-bg.mp4` and replace with a client-owned video file before redistribution

---

## QA result

See `qa/visual-qa-checklist.md` for the full QA report.

**Overall result:** PASS WITH NOTED DEVIATIONS (font only)
