# Citability Analysis

> Template: `templates/citability-analysis.md`
> Save output to: `output/<client-slug>/<project-slug>/CitabilityAnalysis_v<N>_<YYYYMMDD>.md`

---

## URL Audited

| Field | Value |
|---|---|
| Target URL | <!-- https://... --> |
| Client | <!-- client_name --> |
| Analysis Date | <!-- YYYY-MM-DD --> |
| Execution Mode | <!-- local-fork / agent-only --> |
| Script Used | <!-- scripts/citability_scorer.py / manual --> |

---

## Citability Score

| Metric | Value |
|---|---|
| Raw Score | <!-- 0–100 --> |
| Letter Grade | <!-- A / B / C / D / F --> |
| Percentile Estimate | <!-- e.g., "Top 28% of audited pages" --> |
| Score Date | <!-- YYYY-MM-DD --> |
| Previous Score | <!-- N/A or previous score + date --> |

---

## Component Breakdown

| Metric | Raw Score (0–100) | Weight | Weighted Score | Status |
|---|---|---|---|---|
| Answer Block Quality | <!-- score --> | 30% | <!-- score × 0.30 --> | <!-- strong / adequate / weak --> |
| Self-Containment | <!-- score --> | 25% | <!-- score × 0.25 --> | <!-- strong / adequate / weak --> |
| Structural Readability | <!-- score --> | 20% | <!-- score × 0.20 --> | <!-- strong / adequate / weak --> |
| Statistical Density | <!-- score --> | 15% | <!-- score × 0.15 --> | <!-- strong / adequate / weak --> |
| Uniqueness Signals | <!-- score --> | 10% | <!-- score × 0.10 --> | <!-- strong / adequate / weak --> |
| **TOTAL** | | **100%** | <!-- sum --> | |

---

## Answer Block Quality Detail

**Score: <!-- N/A → fill -->**

Paragraphs evaluated: <!-- count -->

| Paragraph # | Subject Clear | Evidence Present | No Unresolved Pronouns | Score |
|---|---|---|---|---|
| 1 | <!-- yes/no --> | <!-- yes/no --> | <!-- yes/no --> | <!-- 0–10 --> |
| 2 | <!-- yes/no --> | <!-- yes/no --> | <!-- yes/no --> | <!-- 0–10 --> |
| 3 | <!-- yes/no --> | <!-- yes/no --> | <!-- yes/no --> | <!-- 0–10 --> |

**Best answerable paragraph:**
> <!-- quote the strongest paragraph verbatim -->

**Weakest paragraph (needs rewrite):**
> <!-- quote the weakest paragraph verbatim -->

---

## Self-Containment Check

| Signal | Value | Status |
|---|---|---|
| Total word count | <!-- N --> | <!-- good (>800) / low (<300) --> |
| Pronoun count | <!-- N --> | |
| Noun count | <!-- N --> | |
| Pronoun-to-noun ratio | <!-- N:N --> | <!-- good (<0.3) / moderate / poor (>0.6) --> |
| Optimal word count range | 800–2,500 words | |
| Contextual dependency score | <!-- 0–100 --> | <!-- lower is better --> |

---

## Structural Readability Check

| Signal | Status | Notes |
|---|---|---|
| H1 present | <!-- yes / no --> | <!-- H1 text if present --> |
| H2 count | <!-- N --> | <!-- ≥2 recommended --> |
| H3 count | <!-- N --> | |
| Numbered lists | <!-- yes / no --> | <!-- count --> |
| Bulleted lists | <!-- yes / no --> | <!-- count --> |
| Average paragraph length | <!-- N words --> | <!-- ≤150 recommended --> |
| Wall-of-text sections | <!-- yes / no --> | <!-- describe if yes --> |

---

## Statistical Density Check

| Signal | Value | Status |
|---|---|---|
| Percentage references | <!-- N --> | |
| Numbered data points | <!-- N --> | |
| Dollar/currency figures | <!-- N --> | |
| Year/date references | <!-- N --> | |
| Data points per 1,000 words | <!-- N.N --> | <!-- optimal: 8–15 --> |
| Statistical density score | <!-- 0–100 --> | |

---

## Uniqueness Signals Check

| Signal | Present | Example |
|---|---|---|
| First-party study or research | <!-- yes / no --> | <!-- excerpt --> |
| Proprietary data references | <!-- yes / no --> | <!-- excerpt --> |
| Original methodology | <!-- yes / no --> | <!-- excerpt --> |
| Unique terminology | <!-- yes / no --> | <!-- excerpt --> |
| Non-generic claims | <!-- yes / no --> | <!-- excerpt --> |

---

## Key Findings

1. <!-- Most impactful finding — what is driving the score up or down most -->
2. <!-- Second finding -->
3. <!-- Third finding -->

---

## Top 3 Improvements

| Priority | Action | Expected Score Gain | Effort |
|---|---|---|---|
| 1 | <!-- Specific action, e.g., "Rewrite intro paragraph to remove 4 unresolved pronouns" --> | +<!-- N --> points | <!-- Low / Medium / High --> |
| 2 | <!-- Specific action --> | +<!-- N --> points | <!-- Low / Medium / High --> |
| 3 | <!-- Specific action --> | +<!-- N --> points | <!-- Low / Medium / High --> |
