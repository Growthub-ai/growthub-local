# Remediation Roadmap

> Template: `templates/remediation-roadmap.md`
> Save output to: `output/<client-slug>/<project-slug>/RemediationRoadmap_v<N>_<YYYYMMDD>.md`

---

## Client / URL

| Field | Value |
|---|---|
| Client | <!-- client_name --> |
| Target URL | <!-- https://... --> |
| Roadmap Date | <!-- YYYY-MM-DD --> |
| Roadmap Owner | <!-- account_owner --> |
| Overall GEO Score Before | <!-- N / 100 (Grade) --> |
| Target GEO Score | <!-- N / 100 (Grade) --> |
| Timeline | <!-- 4-week sprint starting YYYY-MM-DD --> |

---

## Current vs. Target Score

| Component | Current Score | Target Score | Gap |
|---|---|---|---|
| AI Citability & Visibility | <!-- N --> | <!-- N --> | <!-- +N --> |
| Brand Authority | <!-- N --> | <!-- N --> | <!-- +N --> |
| Content Quality & E-E-A-T | <!-- N --> | <!-- N --> | <!-- +N --> |
| Technical Foundations | <!-- N --> | <!-- N --> | <!-- +N --> |
| Structured Data | <!-- N --> | <!-- N --> | <!-- +N --> |
| Platform Optimization | <!-- N --> | <!-- N --> | <!-- +N --> |
| **Composite GEO Score** | **<!-- N -->** | **<!-- N -->** | **<!-- +N -->** |

---

## Priority Matrix

Issues are ranked by Impact × Urgency:

| ID | Issue | Component | Impact | Urgency | Priority |
|---|---|---|---|---|---|
| R01 | <!-- issue description --> | <!-- component --> | <!-- High / Med / Low --> | <!-- Immediate / Sprint / Backlog --> | P0 |
| R02 | <!-- issue description --> | <!-- component --> | <!-- High / Med / Low --> | <!-- Immediate / Sprint / Backlog --> | P0 |
| R03 | <!-- issue description --> | <!-- component --> | <!-- High / Med / Low --> | <!-- Immediate / Sprint / Backlog --> | P1 |
| R04 | <!-- issue description --> | <!-- component --> | <!-- High / Med / Low --> | <!-- Immediate / Sprint / Backlog --> | P1 |
| R05 | <!-- issue description --> | <!-- component --> | <!-- High / Med / Low --> | <!-- Immediate / Sprint / Backlog --> | P2 |
| R06 | <!-- issue description --> | <!-- component --> | <!-- High / Med / Low --> | <!-- Immediate / Sprint / Backlog --> | P2 |
| R07 | <!-- issue description --> | <!-- component --> | <!-- High / Med / Low --> | <!-- Immediate / Sprint / Backlog --> | P3 |

---

## 4-Week Sprint Plan

### Week 1 — Technical Unblocking and Crawler Access

| # | Action | Issue ID | Owner | Expected Score Impact | Priority |
|---|---|---|---|---|---|
| 1.1 | <!-- e.g., Remove GPTBot block from robots.txt --> | R01 | <!-- Dev --> | +<!-- N --> pts (AI Citability) | P0 |
| 1.2 | <!-- e.g., Create llms.txt at domain root --> | R02 | <!-- Dev / Content --> | +<!-- N --> pts (AI Citability) | P0 |
| 1.3 | <!-- e.g., Add Sitemap directive to robots.txt --> | R03 | <!-- Dev --> | +<!-- N --> pts (Technical) | P1 |
| 1.4 | <!-- e.g., Enforce HTTPS redirect from HTTP --> | R04 | <!-- Dev --> | +<!-- N --> pts (Technical) | P1 |
| 1.5 | <!-- e.g., Add Organization schema to homepage --> | R05 | <!-- Dev --> | +<!-- N --> pts (Structured Data) | P1 |

**Week 1 projected score gain:** +<!-- N --> points (<!-- current → new -->)

---

### Week 2 — Schema and Content Infrastructure

| # | Action | Issue ID | Owner | Expected Score Impact | Priority |
|---|---|---|---|---|---|
| 2.1 | <!-- e.g., Add FAQPage schema to top 3 service pages --> | R06 | <!-- Dev --> | +<!-- N --> pts (Structured Data) | P1 |
| 2.2 | <!-- e.g., Add Article schema to all blog posts --> | R07 | <!-- Dev --> | +<!-- N --> pts (Structured Data) | P2 |
| 2.3 | <!-- e.g., Rewrite top 5 pages' intro paragraphs for answer-block quality --> | R08 | <!-- Content --> | +<!-- N --> pts (Content) | P2 |
| 2.4 | <!-- e.g., Add statistical data to 3 thin service pages --> | R09 | <!-- Content --> | +<!-- N --> pts (Content) | P2 |
| 2.5 | <!-- e.g., Add author byline and bio to all blog posts --> | R10 | <!-- Content --> | +<!-- N --> pts (E-E-A-T) | P2 |

**Week 2 projected score gain:** +<!-- N --> points

---

### Week 3 — E-E-A-T Depth and Citability Optimization

| # | Action | Issue ID | Owner | Expected Score Impact | Priority |
|---|---|---|---|---|---|
| 3.1 | <!-- e.g., Publish original research study or data report --> | R11 | <!-- Content --> | +<!-- N --> pts (E-E-A-T) | P2 |
| 3.2 | <!-- e.g., Add llms-full.txt with content index --> | R12 | <!-- Content / Dev --> | +<!-- N --> pts (AI Citability) | P2 |
| 3.3 | <!-- e.g., Reduce pronoun-to-noun ratio on 5 key pages --> | R13 | <!-- Content --> | +<!-- N --> pts (Citability) | P2 |
| 3.4 | <!-- e.g., Add 3 external authority citations per blog post --> | R14 | <!-- Content --> | +<!-- N --> pts (E-E-A-T) | P2 |
| 3.5 | <!-- e.g., Implement BreadcrumbList schema site-wide --> | R15 | <!-- Dev --> | +<!-- N --> pts (Structured Data) | P2 |

**Week 3 projected score gain:** +<!-- N --> points

---

### Week 4 — Brand Authority and Platform Seeding

| # | Action | Issue ID | Owner | Expected Score Impact | Priority |
|---|---|---|---|---|---|
| 4.1 | <!-- e.g., Create and optimize LinkedIn company page --> | R16 | <!-- Marketing --> | +<!-- N --> pts (Brand Authority) | P3 |
| 4.2 | <!-- e.g., Answer 5 Quora questions in target niche --> | R17 | <!-- Marketing --> | +<!-- N --> pts (Brand Authority) | P3 |
| 4.3 | <!-- e.g., Post original thread on HackerNews or Reddit --> | R18 | <!-- Marketing --> | +<!-- N --> pts (Brand Authority) | P3 |
| 4.4 | <!-- e.g., Set up monthly GEO rescore monitoring --> | R19 | <!-- Operator --> | Baseline maintenance | P3 |
| 4.5 | <!-- e.g., Run /geo audit rescore and compare to baseline --> | R20 | <!-- Operator --> | Measurement | P3 |

**Week 4 projected score gain:** +<!-- N --> points

---

## Quick Wins (This Week — Under 2 Hours Each)

These items require minimal effort and have immediate score impact:

- [ ] **Remove GPTBot block from robots.txt** — unblocks ChatGPT indexing immediately
- [ ] **Add Sitemap directive to robots.txt** — 5-minute fix, improves Technical score
- [ ] **Create a basic llms.txt** — 15-minute task, signals AI-crawler intent
- [ ] **Add Organization JSON-LD to homepage** — copy from Schema Validation report code snippet
- [ ] **Verify llms.txt is accessible** — `curl https://domain.com/llms.txt`

---

## Medium-Term Actions (Weeks 2–3)

- Schema deployment across all primary page types
- Content rewrites targeting citability metrics (answer blocks, statistical density)
- E-E-A-T improvements: author bios, external citations, original data

---

## Strategic Actions (Week 4+)

- Brand authority platform seeding (LinkedIn, Quora, Reddit, HackerNews)
- Original research publication for uniqueness signals
- Monthly rescore loop using `/geo audit` to track improvements

---

## Estimated Score After Full Roadmap

| Component | Before | After | Change |
|---|---|---|---|
| AI Citability & Visibility | <!-- N --> | <!-- N --> | <!-- +N --> |
| Brand Authority | <!-- N --> | <!-- N --> | <!-- +N --> |
| Content Quality & E-E-A-T | <!-- N --> | <!-- N --> | <!-- +N --> |
| Technical Foundations | <!-- N --> | <!-- N --> | <!-- +N --> |
| Structured Data | <!-- N --> | <!-- N --> | <!-- +N --> |
| Platform Optimization | <!-- N --> | <!-- N --> | <!-- +N --> |
| **Composite GEO Score** | **<!-- N (Grade) -->** | **<!-- N (Grade) -->** | **<!-- +N -->** |

**Rescore date:** <!-- YYYY-MM-DD (30 days from roadmap start) -->
