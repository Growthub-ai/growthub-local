# GEO Score Summary

> Template: `templates/geo-score-summary.md`
> Save output to: `output/<client-slug>/<project-slug>/GeoScoreSummary_v<N>_<YYYYMMDD>.md`

---

## URL Audited

| Field | Value |
|---|---|
| Target URL | <!-- https://... --> |
| Client | <!-- client_name --> |
| Audit Date | <!-- YYYY-MM-DD --> |
| Execution Mode | <!-- local-fork / agent-only --> |
| Audit Scope | <!-- full / quick / specific --> |

---

## Overall GEO Score

```
╔══════════════════════════════╗
║   GEO SCORE: ── / 100        ║
║   GRADE: ─                   ║
╚══════════════════════════════╝
```

| Field | Value |
|---|---|
| Composite Score | <!-- N / 100 --> |
| Letter Grade | <!-- A / B / C / D / F --> |
| Previous Score | <!-- N/A or previous score + date --> |
| Score Change | <!-- +N / -N / no change --> |

---

## Component Scores

| Component | Raw Score (0–100) | Weight | Weighted Contribution | Grade | Status |
|---|---|---|---|---|---|
| AI Citability & Visibility | <!-- N --> | 25% | <!-- N × 0.25 = N --> | <!-- A/B/C/D/F --> | <!-- strong / adequate / weak / data-gap --> |
| Brand Authority | <!-- N --> | 20% | <!-- N × 0.20 = N --> | <!-- A/B/C/D/F --> | <!-- strong / adequate / weak / data-gap --> |
| Content Quality & E-E-A-T | <!-- N --> | 20% | <!-- N × 0.20 = N --> | <!-- A/B/C/D/F --> | <!-- strong / adequate / weak / data-gap --> |
| Technical Foundations | <!-- N --> | 15% | <!-- N × 0.15 = N --> | <!-- A/B/C/D/F --> | <!-- strong / adequate / weak / data-gap --> |
| Structured Data | <!-- N --> | 10% | <!-- N × 0.10 = N --> | <!-- A/B/C/D/F --> | <!-- strong / adequate / weak / data-gap --> |
| Platform Optimization | <!-- N --> | 10% | <!-- N × 0.10 = N --> | <!-- A/B/C/D/F --> | <!-- strong / adequate / weak / data-gap --> |
| **COMPOSITE TOTAL** | | **100%** | **<!-- sum -->** | **<!-- grade -->** | |

---

## Score Narrative

<!-- 3–5 sentence summary grounding the score in actual findings.

Example: "thegrowthub.com scores 68/100 (C) on the GEO Score. The site's strongest component is Technical Foundations (82/100) — HTTPS is enforced, robots.txt is valid, and Core Web Vitals signals are healthy. The primary drag is AI Citability & Visibility (51/100), driven by a missing llms.txt and blanket GPTBot block in robots.txt. Brand Authority is moderate (66/100) — LinkedIn and Twitter/X presence is established, but Wikipedia and GitHub presence is missing. Fixing the crawler access issues alone is projected to add 8–12 points to the composite score." -->

---

## Component Score Visualization

```
AI Citability & Visibility   [██████████░░░░░░░░░░] <!-- N -->%
Brand Authority              [████████████░░░░░░░░] <!-- N -->%
Content Quality & E-E-A-T    [██████████████░░░░░░] <!-- N -->%
Technical Foundations        [████████████████░░░░] <!-- N -->%
Structured Data              [████████░░░░░░░░░░░░] <!-- N -->%
Platform Optimization        [██████████░░░░░░░░░░] <!-- N -->%
```

---

## Benchmark Comparison

| Metric | This Site | Category Average | Top Quartile |
|---|---|---|---|
| Overall GEO Score | <!-- N --> | 58 | 81 |
| AI Citability | <!-- N --> | 54 | 78 |
| Crawler Access (of 14) | <!-- N / 14 --> | 9 / 14 | 13 / 14 |
| Schema Types Present | <!-- N --> | 3 | 7 |
| llms.txt Present | <!-- yes / no --> | 22% of sites | 100% |

> Benchmark figures are based on geo-seo-claude audit data across audited sites. Category average represents the operator's current client portfolio baseline.

---

## Priority Recommendations

These are the top 3 actions ranked by expected GEO Score impact:

| Rank | Action | Affected Component | Expected Score Gain |
|---|---|---|---|
| 1 | <!-- Specific action grounded in findings --> | <!-- Component --> | +<!-- N --> points |
| 2 | <!-- Specific action grounded in findings --> | <!-- Component --> | +<!-- N --> points |
| 3 | <!-- Specific action grounded in findings --> | <!-- Component --> | +<!-- N --> points |

**Projected score after top 3 actions:** <!-- N --> / 100 (<!-- grade -->)

---

## What This Score Means

<!-- Paste the appropriate interpretation from docs/scoring-methodology.md based on grade.
For grade C: "Moderate visibility. You are not capturing significant AI-referred traffic yet. A full remediation roadmap is recommended." -->

---

## Next Steps

- [ ] Review full Remediation Roadmap: `output/<client-slug>/<project-slug>/RemediationRoadmap_v<N>_<YYYYMMDD>.md`
- [ ] Review Crawler Access Report for specific crawler fixes
- [ ] Review llms.txt Plan for implementation instructions
- [ ] Schedule rescore after remediation sprint (recommended: 30 days)
