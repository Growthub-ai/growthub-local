# Content Analysis

> Template: `templates/content-analysis.md`
> Save output to: `output/<client-slug>/<project-slug>/ContentAnalysis_v<N>_<YYYYMMDD>.md`

---

## URL Analyzed

| Field | Value |
|---|---|
| Target URL | <!-- https://... --> |
| Client | <!-- client_name --> |
| Page Type | <!-- homepage / blog post / service page / landing page / other --> |
| Analysis Date | <!-- YYYY-MM-DD --> |
| Execution Mode | <!-- local-fork / agent-only --> |
| Word Count | <!-- N words --> |

---

## E-E-A-T Assessment

| Signal | Signals Found | Score (0–10) | Notes |
|---|---|---|---|
| **Experience** | <!-- first-person examples, case studies, original data points --> | <!-- N --> | <!-- what was found / what is missing --> |
| **Expertise** | <!-- author byline, credentials, About page depth, domain expertise signals --> | <!-- N --> | <!-- what was found / what is missing --> |
| **Authoritativeness** | <!-- external citations, backlinks from authority domains, Wikipedia mentions, industry recognition --> | <!-- N --> | <!-- what was found / what is missing --> |
| **Trustworthiness** | <!-- HTTPS, contact info, privacy policy, review count, schema Trust signals --> | <!-- N --> | <!-- what was found / what is missing --> |

**E-E-A-T Composite Score:** <!-- N / 40 → normalize to N / 100 --> / 100

---

## Experience Signals Detail

| Signal | Present | Example / Location |
|---|---|---|
| First-person case study | <!-- yes / no --> | <!-- URL or excerpt --> |
| Original data or research | <!-- yes / no --> | <!-- URL or excerpt --> |
| Personal experience narrative | <!-- yes / no --> | <!-- URL or excerpt --> |
| Before/after examples | <!-- yes / no --> | <!-- URL or excerpt --> |
| Named results with specifics | <!-- yes / no --> | <!-- URL or excerpt --> |

---

## Expertise Signals Detail

| Signal | Present | Example / Location |
|---|---|---|
| Author byline with name | <!-- yes / no --> | <!-- name found --> |
| Author credentials visible | <!-- yes / no --> | <!-- title, bio, link --> |
| Deep domain terminology | <!-- yes / no --> | <!-- examples --> |
| Source citations (external) | <!-- yes / no --> | <!-- N citations found --> |
| Expert quotes (attributed) | <!-- yes / no --> | <!-- N quotes found --> |

---

## Answer Block Analysis

**Total paragraphs evaluated:** <!-- N -->

**Answer-block eligible paragraphs:** <!-- N --> (paragraphs that AI can quote verbatim)

| Block | First 20 Words | Self-Contained | Has Data | AI-Quotable |
|---|---|---|---|---|
| Block 1 | <!-- excerpt --> | <!-- yes / no --> | <!-- yes / no --> | <!-- yes / no --> |
| Block 2 | <!-- excerpt --> | <!-- yes / no --> | <!-- yes / no --> | <!-- yes / no --> |
| Block 3 | <!-- excerpt --> | <!-- yes / no --> | <!-- yes / no --> | <!-- yes / no --> |
| Block 4 | <!-- excerpt --> | <!-- yes / no --> | <!-- yes / no --> | <!-- yes / no --> |

**Most citable paragraph:**
> <!-- Quote the strongest answer block verbatim -->

---

## Self-Containment Check

| Metric | Value | Target | Status |
|---|---|---|---|
| Total word count | <!-- N --> | 800–2,500 | <!-- on target / below / above --> |
| Pronouns (it, they, this, that, these) | <!-- N instances --> | | |
| Nouns (named entities + common) | <!-- N instances --> | | |
| Pronoun-to-noun ratio | <!-- N:N --> | <0.3 for good citability | <!-- good / moderate / poor --> |
| Self-containment score | <!-- 0–100 --> | | |

---

## Statistical Density

| Metric | Value | Target Range | Status |
|---|---|---|---|
| Percentage figures | <!-- N instances --> | | |
| Specific numbers / measurements | <!-- N instances --> | | |
| Dollar / currency figures | <!-- N instances --> | | |
| Year / date references | <!-- N instances --> | | |
| Named statistics | <!-- N instances --> | | |
| **Data points per 1,000 words** | <!-- N.N --> | **8–15** | <!-- below / optimal / above --> |
| Statistical density score | <!-- 0–100 --> | | |

---

## Uniqueness Signals

| Signal | Present | Strength | Example |
|---|---|---|---|
| First-party research | <!-- yes / no --> | <!-- strong / weak --> | <!-- excerpt --> |
| Proprietary methodology | <!-- yes / no --> | <!-- strong / weak --> | <!-- excerpt --> |
| Non-generic claims | <!-- yes / no --> | <!-- strong / weak --> | <!-- excerpt --> |
| Original terminology | <!-- yes / no --> | <!-- strong / weak --> | <!-- excerpt --> |
| Competitive differentiation statement | <!-- yes / no --> | <!-- strong / weak --> | <!-- excerpt --> |

**Uniqueness score:** <!-- 0–100 -->

---

## Content Quality Score

| Component | Score (0–100) | Weight | Weighted Score |
|---|---|---|---|
| E-E-A-T composite | <!-- N --> | 35% | <!-- N × 0.35 --> |
| Answer block quality | <!-- N --> | 25% | <!-- N × 0.25 --> |
| Statistical density | <!-- N --> | 20% | <!-- N × 0.20 --> |
| Uniqueness signals | <!-- N --> | 20% | <!-- N × 0.20 --> |
| **TOTAL** | | **100%** | <!-- sum --> |

---

## Top 5 Content Gaps

| Gap | Impact | Recommended Fix | Effort |
|---|---|---|---|
| <!-- gap description --> | <!-- High / Medium / Low --> | <!-- specific action --> | <!-- Low / Medium / High --> |
| <!-- gap description --> | <!-- High / Medium / Low --> | <!-- specific action --> | <!-- Low / Medium / High --> |
| <!-- gap description --> | <!-- High / Medium / Low --> | <!-- specific action --> | <!-- Low / Medium / High --> |
| <!-- gap description --> | <!-- High / Medium / Low --> | <!-- specific action --> | <!-- Low / Medium / High --> |
| <!-- gap description --> | <!-- High / Medium / Low --> | <!-- specific action --> | <!-- Low / Medium / High --> |
