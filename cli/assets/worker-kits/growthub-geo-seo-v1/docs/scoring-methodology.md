# GEO Scoring Methodology

**Source of truth for all scoring rules. The operator must apply these formulas exactly.**

---

## GEO Score Formula

The GEO Score is a weighted composite of 6 component scores, each ranging from 0 to 100.

```
GEO Score = (AI Citability & Visibility × 0.25)
          + (Brand Authority × 0.20)
          + (Content Quality & E-E-A-T × 0.20)
          + (Technical Foundations × 0.15)
          + (Structured Data × 0.10)
          + (Platform Optimization × 0.10)
```

### Component Weights

| Component | Weight | Rationale |
|---|---|---|
| AI Citability & Visibility | 25% | Core measure of AI search readiness — crawler access + citability signals |
| Brand Authority | 20% | AI systems prefer to cite recognized, cross-platform brands |
| Content Quality & E-E-A-T | 20% | Google and AI systems both weight E-E-A-T heavily for content ranking |
| Technical Foundations | 15% | Technical barriers prevent all other optimization from working |
| Structured Data | 10% | Schema markup directly feeds AI answer surfaces (Google AI Overviews, ChatGPT) |
| Platform Optimization | 10% | Platform-specific readiness for the 4 major AI search engines |

### Computation Rules

- Each component score is 0–100 (no decimals before aggregation)
- Apply weights before rounding
- Round the composite score to the nearest integer
- If a component score is unavailable (data gap), use **50** as the neutral default
- Flag any data-gap component in the GeoScoreSummary output

**Example:**
```
AI Citability:  58 × 0.25 = 14.50
Brand Auth:     66 × 0.20 = 13.20
Content:        71 × 0.20 = 14.20
Technical:      84 × 0.15 = 12.60
Schema:         42 × 0.10 =  4.20
Platform:       61 × 0.10 =  6.10
                            ─────
Composite:                  64.80 → rounds to 65
```

---

## Letter Grade Thresholds

| Grade | Score Range | AI Search Status |
|---|---|---|
| A | 85–100 | Highly optimized — strong citability, clean crawler access, rich schema |
| B | 70–84 | Good — some gaps, addressable in one sprint cycle |
| C | 55–69 | Moderate — missing key citability signals, schema gaps, crawler issues |
| D | 40–54 | Poor — likely not capturing meaningful AI-referred traffic |
| F | Below 40 | Not AI-search-ready — critical issues across multiple components |

---

## Citability Algorithm

The Citability Score (one of the inputs to AI Citability & Visibility) uses a 5-metric algorithm.

### 5-Metric Breakdown

| Metric | Weight | What It Measures | Scoring Method |
|---|---|---|---|
| Answer Block Quality | 30% | Do paragraphs contain complete, self-sufficient answers AI can quote verbatim? | Score each paragraph 0–10; average across all paragraphs |
| Self-Containment | 25% | Can each paragraph be understood without reading surrounding context? | Pronoun-to-noun ratio; lower = better self-containment |
| Structural Readability | 20% | Does the page use headings, short paragraphs, and lists to enable AI parsing? | Check H1/H2/list/paragraph-length signals |
| Statistical Density | 15% | Does the page contain specific numbers, percentages, and data references? | Count data points per 1,000 words; optimal: 8–15 |
| Uniqueness Signals | 10% | Does the content contain proprietary claims or data not found elsewhere? | Check for first-party research, original data, unique terminology |

**Citability Score formula:**
```
Citability = (Answer Block Quality × 0.30)
           + (Self-Containment × 0.25)
           + (Structural Readability × 0.20)
           + (Statistical Density × 0.15)
           + (Uniqueness Signals × 0.10)
```

---

### Metric Scoring Rules

#### Answer Block Quality (0–100)

Evaluate each paragraph on 3 criteria:
1. Subject is clearly stated (no pronoun-as-subject opener)
2. Supporting evidence or data is present
3. No unresolved pronoun references

Score each paragraph:
- All 3 criteria met: 10/10
- 2 criteria met: 7/10
- 1 criterion met: 4/10
- None met: 1/10

Average across all paragraphs. Multiply by 10 to get 0–100 score.

**High-score example:**
> "GPTBot (used by ChatGPT's Browse mode) is blocked in the site's robots.txt. This means ChatGPT cannot fetch and cite this page's content, even when users directly ask about topics the page covers."

**Low-score example:**
> "It blocks them from accessing the site. This causes problems because they can't see what's there."
*(No subject named, no evidence, multiple unresolved pronouns)*

---

#### Self-Containment (0–100)

**Pronoun inventory:** it, they, this, that, these, those, he, she, we (when antecedent is not in same sentence)

1. Count pronouns used as subjects or objects without a prior noun in the same sentence
2. Count total noun references (named entities + common nouns)
3. Pronoun-to-noun ratio = pronoun count / noun count

**Scoring:**
- Ratio < 0.15: 100
- Ratio 0.15–0.25: 85
- Ratio 0.25–0.35: 70
- Ratio 0.35–0.50: 50
- Ratio 0.50–0.65: 30
- Ratio > 0.65: 10

Also penalize for word count outside the 300–3,000 word range:
- < 300 words: score cap at 40 (too thin to be self-contained on a topic)
- 300–800 words: light penalty (-10)
- 800–2,500 words: optimal range, no penalty
- > 2,500 words: light penalty (-5) — tends toward context-dependent sprawl

---

#### Structural Readability (0–100)

Start at 100 and deduct:

| Issue | Deduction |
|---|---|
| No H1 present | -30 |
| Fewer than 2 H2 sections | -15 |
| No numbered or bulleted lists | -15 |
| Average paragraph length > 150 words | -15 |
| Any paragraph > 300 words (wall of text) | -10 per occurrence, capped at -20 |
| No visual separation between sections | -10 |

Minimum score: 0.

---

#### Statistical Density (0–100)

Count data points per 1,000 words. Data points include:
- Percentage figures (e.g., "47%," "3x increase")
- Specific numbers with units (e.g., "65ms," "$2,800," "14 crawlers")
- Named statistics (e.g., "200M weekly active users")
- Year references as evidence (e.g., "Q1 2026 data shows...")

**Scoring:**
- < 2 data points per 1,000 words: 10
- 2–5: 35
- 5–8: 60
- 8–15: 100 (optimal range)
- 15–25: 85 (slightly over-cited — readability may suffer)
- > 25: 60 (data overload — hard for AI to extract clean answers)

---

#### Uniqueness Signals (0–100)

| Signal | Points |
|---|---|
| First-party study or original research | 35 |
| Proprietary data or named internal data source | 25 |
| Original methodology with named process | 20 |
| Unique branded terminology | 15 |
| Non-generic competitive differentiation statement | 10 |
| Named case study with specific results | 10 |

Cap at 100. If total > 100, use 100.

---

## Component Score Normalization

Each subagent returns a raw 0–100 score. No normalization is needed — all scores are already on the same scale.

Do not normalize scores before applying weights. Apply weights directly to the 0–100 values.

---

## Score Interpretation for Client Communication

### Grade A (85–100)
> "Your site is well-positioned for AI-driven search. You are in the top tier for citability, crawler access, and content quality. We recommend ongoing monthly monitoring and targeted improvements to maintain this position as AI search evolves."

### Grade B (70–84)
> "Good foundation. You have established AI search presence, but specific gaps are limiting your ceiling. Targeted improvements in [lowest-scoring component] can push you into the A tier within 30–60 days."

### Grade C (55–69)
> "Moderate visibility. You are not capturing significant AI-referred traffic yet. A full remediation roadmap is recommended. Addressing the top 3 gaps typically produces a measurable score improvement within 30 days."

### Grade D (40–54)
> "Your site has significant AI search blindspots. AI systems may not be citing or recommending your content at all, even for queries you should rank for. Immediate technical and content remediation is required."

### Grade F (below 40)
> "Critical issues detected. AI crawlers may be blocked outright, or your content lacks the structural signals needed for AI citation. A full remediation engagement is required before any AI-referred traffic is possible."

---

## Benchmark Context

These benchmarks are based on geo-seo-claude audit data:

| Benchmark | Score |
|---|---|
| Portfolio average (all audited sites) | 58 / 100 |
| Top quartile (25th percentile from top) | 76 / 100 |
| Top 10% | 85 / 100 |
| Minimum for meaningful AI-referred traffic | ~65 / 100 |
| Sites that actively appear in Perplexity citations | ~72+ / 100 |
| Sites that appear in Google AI Overviews regularly | ~78+ / 100 |

**llms.txt adoption rate:** Approximately 22% of audited sites have a valid `llms.txt` as of Q1 2026.
