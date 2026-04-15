# Technical Foundations Report

> Template: `templates/technical-foundations.md`
> Save output to: `output/<client-slug>/<project-slug>/TechnicalFoundations_v<N>_<YYYYMMDD>.md`

---

## URL Analyzed

| Field | Value |
|---|---|
| Target URL | <!-- https://... --> |
| Client | <!-- client_name --> |
| Analysis Date | <!-- YYYY-MM-DD --> |
| Execution Mode | <!-- local-fork / agent-only --> |
| Script Used | <!-- scripts/fetch_page.py / manual --> |

---

## Server Headers

| Header | Value | Status | Notes |
|---|---|---|---|
| Server | <!-- nginx / Apache / Cloudflare / unknown --> | <!-- informational --> | |
| Content-Type | <!-- text/html; charset=UTF-8 --> | <!-- pass / fail --> | <!-- charset required --> |
| Cache-Control | <!-- max-age=3600 / no-cache / missing --> | <!-- pass / warn / fail --> | <!-- recommended: public, max-age ≥ 3600 --> |
| Content-Encoding | <!-- gzip / br / identity / missing --> | <!-- pass / warn --> | <!-- gzip or brotli preferred --> |
| Strict-Transport-Security | <!-- max-age=N; includeSubDomains --> | <!-- pass / fail / missing --> | <!-- HSTS required for A-grade --> |
| X-Content-Type-Options | <!-- nosniff / missing --> | <!-- pass / warn --> | |
| X-Frame-Options | <!-- SAMEORIGIN / DENY / missing --> | <!-- pass / warn --> | |
| X-XSS-Protection | <!-- 1; mode=block / missing --> | <!-- informational --> | |
| Referrer-Policy | <!-- strict-origin-when-cross-origin / missing --> | <!-- pass / warn --> | |
| Permissions-Policy | <!-- set / missing --> | <!-- informational --> | |
| X-Robots-Tag | <!-- none / noindex / noai --> | <!-- pass / warn / critical --> | <!-- noai blocks AI crawlers --> |
| CDN indicator | <!-- Cloudflare-Ray / X-Cache / Via --> | <!-- present / absent --> | |

---

## Core Signals

| Signal | Status | Value | Notes |
|---|---|---|---|
| HTTPS enforced | <!-- yes / no --> | <!-- redirect from HTTP: yes/no --> | <!-- HTTP → HTTPS redirect verified --> |
| HSTS header present | <!-- yes / no --> | <!-- max-age value --> | <!-- Strict-Transport-Security present --> |
| Mobile viewport meta | <!-- yes / no --> | <!-- `<meta name="viewport" ...>` present --> | <!-- responsive layout signal --> |
| robots.txt accessible | <!-- yes / no / error --> | <!-- https://domain.com/robots.txt --> | <!-- HTTP 200 vs 404/500 --> |
| robots.txt syntax valid | <!-- yes / no --> | <!-- no parser errors --> | |
| Sitemap linked in robots.txt | <!-- yes / no --> | <!-- Sitemap: https://... --> | |
| sitemap.xml accessible | <!-- yes / no / error --> | <!-- https://domain.com/sitemap.xml --> | |
| llms.txt accessible | <!-- yes / no --> | <!-- https://domain.com/llms.txt --> | |
| Canonical tag present | <!-- yes / no --> | <!-- `<link rel="canonical" ...>` --> | |
| No duplicate canonicals | <!-- yes / no --> | | |

---

## Page Speed Signals

| Signal | Status | Notes |
|---|---|---|
| Images have explicit width/height | <!-- yes / partial / no --> | <!-- prevents Cumulative Layout Shift (CLS) --> |
| Images use modern format (WebP/AVIF) | <!-- yes / partial / no --> | <!-- reduces Largest Contentful Paint (LCP) --> |
| Render-blocking scripts in `<head>` | <!-- none / N found --> | <!-- scripts should be deferred or async --> |
| Largest visible element (LCP hint) | <!-- text / image / video --> | <!-- primary content type above fold --> |
| Estimated LCP element | <!-- element description --> | <!-- largest above-fold element --> |
| Third-party script count | <!-- N --> | <!-- each adds latency --> |
| Font loading strategy | <!-- font-display: swap / block / missing --> | <!-- swap preferred --> |
| Lazy loading images | <!-- yes / partial / no --> | <!-- `loading="lazy"` attribute --> |

---

## Core Web Vitals Signals

| Metric | Signal Found | Target | Assessment |
|---|---|---|---|
| LCP (Largest Contentful Paint) | <!-- estimated: fast / medium / slow --> | < 2.5s | <!-- pass / warn / fail estimate --> |
| CLS (Cumulative Layout Shift) | <!-- images have dimensions: yes/no --> | < 0.1 | <!-- pass / warn / fail estimate --> |
| INP (Interaction to Next Paint) | <!-- JS heavy: yes/no / event handlers: N --> | < 200ms | <!-- pass / warn / fail estimate --> |
| FCP (First Contentful Paint) | <!-- render-blocking resources: N --> | < 1.8s | <!-- pass / warn / fail estimate --> |

> Note: These are structural signals estimated from page source analysis. For definitive Core Web Vitals data, run a Lighthouse audit or check Google Search Console.

---

## Technical Score

| Component | Score (0–100) | Weight | Weighted Score |
|---|---|---|---|
| HTTPS and security headers | <!-- N --> | 30% | <!-- N × 0.30 --> |
| Crawlability (robots.txt, sitemap, llms.txt) | <!-- N --> | 25% | <!-- N × 0.25 --> |
| Page speed signals | <!-- N --> | 25% | <!-- N × 0.25 --> |
| Mobile and rendering | <!-- N --> | 20% | <!-- N × 0.20 --> |
| **TOTAL** | | **100%** | <!-- sum --> |

---

## Critical Fixes

Issues that must be resolved before other remediation work proceeds:

| Priority | Issue | Fix | Effort | Impact |
|---|---|---|---|---|
| P0 | <!-- e.g., "HTTP does not redirect to HTTPS" --> | <!-- specific fix --> | <!-- Low / Medium --> | Critical |
| P0 | <!-- e.g., "X-Robots-Tag: noai is blocking AI crawlers" --> | <!-- specific fix --> | Low | Critical |
| P1 | <!-- e.g., "robots.txt missing Sitemap directive" --> | <!-- specific fix --> | Low | High |
| P1 | <!-- e.g., "No llms.txt file found" --> | <!-- specific fix --> | Medium | High |
| P2 | <!-- e.g., "5 render-blocking scripts in <head>" --> | <!-- specific fix --> | Medium | Medium |
| P2 | <!-- e.g., "Images missing width/height attributes (CLS risk)" --> | <!-- specific fix --> | Low | Medium |
| P3 | <!-- e.g., "No Content-Security-Policy header" --> | <!-- specific fix --> | Medium | Low |
