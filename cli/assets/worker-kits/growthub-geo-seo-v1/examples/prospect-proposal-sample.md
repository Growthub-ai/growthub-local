# Client Proposal — Sample (UrbanCycle.com)

> Example: `examples/prospect-proposal-sample.md`
> This is a filled sample proposal for a fictitious e-commerce client, UrbanCycle.com.
> Use this as a reference for what a completed ClientProposal looks like in production.

---

## Prospect

| Field | Value |
|---|---|
| Company | UrbanCycle Co. |
| Website | https://urbancycle.com |
| Industry | E-commerce — Urban Mobility / Electric Bikes |
| Contact | Sarah Chen, Head of Marketing |
| Proposal Date | 2026-04-14 |
| Prepared By | Antonio |
| Proposal Valid Until | 2026-05-14 |

---

## GEO Audit Summary

We ran a preliminary GEO (Generative Engine Optimization) scan on `urbancycle.com`. Here is what we found at a glance:

| Metric | Score | Grade | Benchmark Average |
|---|---|---|---|
| Overall GEO Score | 44 / 100 | D | 58 / 100 |
| AI Citability | 38 / 100 | F | 54 / 100 |
| Crawler Access | 6 / 14 crawlers | | 9 / 14 |
| Schema Coverage | 1 type found (WebSite only) | | 3 types |
| llms.txt Present | No | | 22% of sites |

---

## Why GEO Matters Now

AI search is changing where e-commerce traffic comes from — and urban mobility is one of the fastest-growing query categories in AI search.

- **"Best electric bike for commuting"** now returns an AI-generated answer in Google AI Overviews for 89% of US searchers (Q1 2026) — bypassing traditional organic results entirely.
- **ChatGPT Shopping** (launched Q4 2025) now surfaces product recommendations directly in chat — and it cites pages, not ads.
- **Perplexity AI** drove 41% more e-commerce referral traffic to its cited sources in Q1 2026 vs. Q3 2025. Sites not optimized for citability received zero of this traffic.
- Sites with a GEO Score above 75 receive **5.27× more AI-referred traffic** than sites scoring below 55 — a 527% gap that compounds monthly as AI search adoption grows.

UrbanCycle is currently a D-grade site for AI search visibility. Competitors like ElectrifyBikes.com (GEO Score: 79) and UrbanVolt.co (GEO Score: 71) are already capturing the AI-referred traffic that UrbanCycle is leaving on the table.

---

## Current Visibility Gap

Based on our preliminary scan of `urbancycle.com`:

**What AI systems can access:**
- 6 of 14 AI crawlers have explicit access — GPTBot (ChatGPT), ClaudeBot (Anthropic), PerplexityBot, and Google-Extended are **blocked** by a wildcard Disallow rule in robots.txt that was likely added to block scraper bots but inadvertently blocks AI systems as well.

**What AI systems can cite:**
- Citability score of 38/100 (F grade) — product pages use heavy JavaScript rendering that Playwright confirms is not crawler-readable. Page descriptions are thin (avg. 47 words per product page) with high pronoun density. No answer blocks found.

**Structured data gaps:**
- Only `WebSite` schema detected. No `Product`, `BreadcrumbList`, `FAQPage`, or `Organization` schema — meaning Google AI Overviews and ChatGPT Shopping cannot surface UrbanCycle product data in structured format.

---

## What We Found — 3 Critical Issues

### Issue 1: GPTBot and Major AI Crawlers Are Blocked

A wildcard rule in `robots.txt` (`User-agent: * Disallow: /products/`) prevents GPTBot, ClaudeBot, PerplexityBot, and Google-Extended from accessing product pages — the most valuable content on the site for AI citation.

**Impact:** ChatGPT, Claude, and Perplexity cannot see UrbanCycle products. When a user asks "what's the best e-bike under $2,000?", UrbanCycle will never appear — even if the products are objectively competitive.

### Issue 2: Product Pages Are Not AI-Citable

Product page copy averages 47 words with high pronoun density ("It features," "This model includes," "They are designed for"). There are no answer blocks — no self-contained paragraphs that AI systems can quote as authoritative product descriptions.

**Impact:** Even when AI crawlers can access the pages, they cannot extract clean, quotable product information. The AI system skips to a competitor whose product pages contain specific, data-rich descriptions ("The UrbanVolt S3 delivers 65Nm of torque and a 55-mile range on a single charge").

### Issue 3: No Product Schema — ChatGPT Shopping Cannot Surface Products

The site uses zero `Product` schema markup. ChatGPT Shopping, Google AI Overviews for commerce, and Perplexity's product finder all require structured `Product` schema (name, price, availability, description, image, brand, rating) to include a product in AI-generated shopping results.

**Impact:** UrbanCycle is invisible to every AI-powered shopping surface — a growing channel that drove $2.1B in AI-attributed e-commerce revenue in Q1 2026 (Similarweb AI Commerce Report, March 2026).

---

## Recommended Engagement

### Option A — Quick GEO Audit

**Best for:** Validating the scope of the problem before committing to a full engagement.

| Deliverable | Details |
|---|---|
| GEO Score Snapshot | Composite score with all 6 components |
| Crawler Unblock Plan | Exact robots.txt edits needed, ready to implement |
| Top 3 Critical Gaps | Product schema, citability, llms.txt |
| Quick Wins Checklist | Fixes executable in under 2 hours by your dev team |
| Delivery Format | Markdown report |
| Turnaround | 48 hours |

**Investment: $1,800**

---

### Option B — Full GEO + SEO Audit

**Best for:** Teams ready to act with a complete, implementation-ready remediation plan.

| Deliverable | Details |
|---|---|
| Full GEO Score Report | All 6 components, all 14 crawlers checked |
| Citability Analysis | Page-by-page breakdown for top 10 product pages |
| Crawler Access Report | Full robots.txt review and rewrite recommendation |
| Product Schema Package | Code-ready JSON-LD for top 20 products |
| llms.txt + llms-full.txt | Files ready to deploy at domain root |
| Technical Foundations | Server headers, Core Web Vitals, HTTPS status |
| Remediation Roadmap | 4-week sprint with owner assignments |
| PDF Report | Branded deliverable for stakeholder presentation |
| Turnaround | 7 business days |

**Investment: $3,500**

---

### Option C — Monthly GEO Monitoring + Remediation Retainer

**Best for:** E-commerce teams launching new products regularly who need continuous AI search visibility management.

| Included Monthly | Details |
|---|---|
| GEO Rescore | Full audit run each month — track score trend |
| Product Page Citability Reviews | Up to 10 product pages reviewed and improved per month |
| Schema Maintenance | New product schema as SKUs are added |
| Crawler Access Monitoring | Weekly automated check — alerts on blocks |
| Brand Authority Tasks | Platform seeding, mention monitoring (Reddit, YouTube) |
| Monthly Report | Score trend, wins, next month plan |
| Slack Access | Async support Mon–Fri |

**Investment: $2,800 / month**
**Minimum term: 3 months**

---

## ROI Projection

Based on UrbanCycle's current D-grade GEO Score and the identified gaps, completing the Full Audit remediation roadmap is projected to produce:

| Metric | Current State | After Remediation | Change |
|---|---|---|---|
| GEO Score | 44 / 100 (D) | 76 / 100 (B) | +32 points |
| AI-referred traffic | ~0.3% of total | ~2.1% of total | +600% |
| Product pages citable by AI | ~0 of top pages | ~18 of top 20 pages | +18 pages |
| AI crawlers with full access | 6 / 14 | 13 / 14 | +7 crawlers |
| ChatGPT Shopping visibility | None | Active (Product schema live) | New channel |

**Conservative AI traffic uplift estimate:** If UrbanCycle currently receives 40,000 monthly visitors, moving from 0.3% to 2.1% AI-referred traffic = **+720 additional monthly visitors** from AI search alone — at $0 ad spend. At a 2.8% e-commerce conversion rate and an average order value of $1,400, that is **$28,224 in incremental monthly revenue potential** (rough estimate, results depend on implementation quality and product competitiveness).

> Projection grounded in geo-seo-claude audit data and Similarweb AI Commerce Report Q1 2026. Actual results vary by site, category, and implementation speed.

---

## Next Steps

1. **Review and sign** the proposal by 2026-05-14
2. **Kickoff call** (30 min) — Sarah + Antonio confirm scope, target pages, and delivery format
3. **Audit begins** — operator runs `/geo audit https://urbancycle.com` with all secondary commands
4. **Week 1 delivery** — Crawler Access Report and Quick Wins delivered first for immediate action
5. **Full delivery** — Complete audit package delivered within 7 business days

To proceed, reply to this proposal or email antonio@thegrowthub.com.

---

## Guarantee / Risk Reversal

If we complete the Full GEO Audit and your development team implements all P0 and P1 remediation items within 30 days without seeing measurable improvement in AI crawler access (verifiable via `/geo crawlers` rescore), we will provide a second full audit at no charge.

We do not produce generic SEO advice. Every finding is backed by data from your actual pages, your robots.txt, and your live site structure — verified by geo-seo-claude running against the real URL.

---

*Prepared by Antonio · Growthub · 2026-04-14*
*geo-seo-claude audit run: 2026-04-14 14:03 UTC · Execution mode: local-fork · GEO Score: 44/100 (D)*
