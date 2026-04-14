# Brand Visibility Report

> Template: `templates/brand-visibility-report.md`
> Save output to: `output/<client-slug>/<project-slug>/BrandVisibilityReport_v<N>_<YYYYMMDD>.md`

---

## Brand Audited

| Field | Value |
|---|---|
| Brand Name | <!-- client_name --> |
| Primary Domain | <!-- https://domain.com --> |
| Brand Slug | <!-- brand-slug --> |
| Scan Date | <!-- YYYY-MM-DD --> |
| Execution Mode | <!-- local-fork (brand_scanner.py) / agent-only --> |
| Script Used | <!-- scripts/brand_scanner.py / manual --> |

---

## Platform Scan Results

| Platform | Brand Present | Mention Count | Sentiment | Primary URL Found | Notes |
|---|---|---|---|---|---|
| YouTube | <!-- yes / no / partial --> | <!-- N --> | <!-- positive / neutral / negative / mixed --> | <!-- https://... --> | <!-- channel / mentions in videos --> |
| Reddit | <!-- yes / no / partial --> | <!-- N --> | <!-- positive / neutral / negative / mixed --> | <!-- subreddit or post URL --> | <!-- notable threads --> |
| Wikipedia | <!-- yes / no / partial --> | <!-- N --> | <!-- neutral --> | <!-- https://... --> | <!-- article or mention in related article --> |
| LinkedIn | <!-- yes / no / partial --> | <!-- N --> | <!-- positive / neutral / mixed --> | <!-- https://... --> | <!-- company page / employee mentions --> |
| Twitter / X | <!-- yes / no / partial --> | <!-- N --> | <!-- positive / neutral / negative / mixed --> | <!-- https://x.com/... --> | <!-- handle / mentions --> |
| GitHub | <!-- yes / no / partial --> | <!-- N --> | <!-- positive / neutral --> | <!-- https://github.com/... --> | <!-- repos / mentions --> |
| Quora | <!-- yes / no / partial --> | <!-- N --> | <!-- positive / neutral / negative --> | <!-- https://... --> | <!-- answers mentioning brand --> |
| Hacker News | <!-- yes / no / partial --> | <!-- N --> | <!-- positive / neutral / negative --> | <!-- https://news.ycombinator.com/... --> | <!-- posts / comments --> |

---

## Platform Detail Notes

### YouTube
<!-- Describe what was found: official channel exists / brand mentioned in competitor content / no presence found -->

### Reddit
<!-- Describe key threads, subreddits where brand appears, sentiment breakdown -->

### Wikipedia
<!-- Note: own Wikipedia article / mentioned in industry article / no presence -->

### LinkedIn
<!-- Official company page status, follower count if visible, employee mention density -->

### Twitter / X
<!-- Official handle / mention volume / notable brand advocates or critics -->

### GitHub
<!-- Open source repos / developer tools / mentions in issues or discussions -->

### Quora
<!-- Questions answered by brand representatives / brand mentioned in answers -->

### Hacker News
<!-- Any "Show HN" posts / brand mentioned in discussions / competitor comparisons -->

---

## Brand Authority Score

| Component | Score (0–100) | Weight | Weighted Score | Notes |
|---|---|---|---|---|
| Platform presence breadth | <!-- N --> | 30% | <!-- N × 0.30 --> | <!-- # platforms with meaningful presence / 8 --> |
| Sentiment quality | <!-- N --> | 25% | <!-- N × 0.25 --> | <!-- ratio of positive to negative mentions --> |
| Mention volume | <!-- N --> | 20% | <!-- N × 0.20 --> | <!-- total mentions normalized vs. category benchmark --> |
| Wikipedia or authority link | <!-- N --> | 15% | <!-- N × 0.15 --> | <!-- Wikipedia presence = 100, none = 0 --> |
| Developer / technical community | <!-- N --> | 10% | <!-- N × 0.10 --> | <!-- GitHub + HN combined signal --> |
| **TOTAL Brand Authority Score** | | **100%** | <!-- sum --> | |

---

## Gap Analysis

**Platforms with no meaningful presence:**
- <!-- Platform: why it matters and what to build there -->
- <!-- Platform: why it matters and what to build there -->

**Sentiment risks:**
- <!-- Any platform with negative-dominant sentiment: what is being said -->

**Brand authority gaps vs. competitors:**
| Gap | Competitor Advantage | Recommended Response |
|---|---|---|
| <!-- gap --> | <!-- competitor URL or example --> | <!-- recommended action --> |
| <!-- gap --> | <!-- competitor URL or example --> | <!-- recommended action --> |

---

## Recommended Actions

| Priority | Platform | Action | Timeline | Expected Impact |
|---|---|---|---|---|
| P1 | <!-- platform --> | <!-- specific action --> | <!-- Week 1-2 --> | <!-- High / Medium --> |
| P1 | <!-- platform --> | <!-- specific action --> | <!-- Week 1-2 --> | <!-- High / Medium --> |
| P2 | <!-- platform --> | <!-- specific action --> | <!-- Week 2-4 --> | <!-- Medium --> |
| P3 | <!-- platform --> | <!-- specific action --> | <!-- Week 4+ --> | <!-- Low / Long-term --> |
