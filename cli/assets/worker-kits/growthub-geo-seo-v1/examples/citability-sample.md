# Citability Analysis — Sample (GrowthHub.com)

> Example: `examples/citability-sample.md`
> This is a filled sample based on a fictitious citability analysis of thegrowthub.com.
> Use this as a reference for what a completed CitabilityAnalysis looks like in production.

---

## URL Audited

| Field | Value |
|---|---|
| Target URL | https://thegrowthub.com |
| Client | Growthub |
| Analysis Date | 2026-04-14 |
| Execution Mode | local-fork |
| Script Used | scripts/citability_scorer.py |

---

## Citability Score

| Metric | Value |
|---|---|
| Raw Score | **71 / 100** |
| Letter Grade | **B** |
| Percentile Estimate | Top 33% of audited pages |
| Score Date | 2026-04-14 |
| Previous Score | N/A (first audit) |

---

## Component Breakdown

| Metric | Raw Score (0–100) | Weight | Weighted Score | Status |
|---|---|---|---|---|
| Answer Block Quality | 82 | 30% | 24.6 | Strong |
| Self-Containment | 74 | 25% | 18.5 | Adequate |
| Structural Readability | 79 | 20% | 15.8 | Strong |
| Statistical Density | 47 | 15% | 7.05 | Weak |
| Uniqueness Signals | 52 | 10% | 5.2 | Adequate |
| **TOTAL** | | **100%** | **71.15** | **B** |

---

## Answer Block Quality Detail

**Score: 82 / 100**

Paragraphs evaluated: 24

| Paragraph # | Subject Clear | Evidence Present | No Unresolved Pronouns | Score |
|---|---|---|---|---|
| 1 (Hero intro) | Yes | No | Yes | 7 |
| 2 (Problem statement) | Yes | Yes | Yes | 9 |
| 3 (Solution description) | Yes | Yes | No | 7 |
| 4 (Feature 1) | Yes | Yes | Yes | 9 |
| 5 (Feature 2) | Yes | No | No | 5 |
| 6 (Social proof) | Yes | Yes | Yes | 10 |

Average across 24 paragraphs: 8.2 / 10 (normalized to 82 / 100)

**Best answerable paragraph:**
> "GrowthHub's AI-enabled worker kits reduce campaign production time by 65% — from 12 hours of manual brief-writing and asset coordination to 4 hours of structured operator execution. Each kit ships with pre-built templates, brand kit integration, and a step-by-step workflow that any team member can follow without prior AI training."

**Weakest paragraph (needs rewrite):**
> "It integrates seamlessly with your existing tools. This means you don't have to change how you work — it just makes everything faster and more consistent for your team."

*Problem: "It" and "This" in the opening sentences are unresolved. What does "it" refer to? AI systems cannot cleanly cite this paragraph.*

---

## Self-Containment Check

| Signal | Value | Status |
|---|---|---|
| Total word count | 1,847 words | Good (within 800–2,500 range) |
| Pronoun count | 94 instances | |
| Noun count | 412 instances | |
| Pronoun-to-noun ratio | 0.23 : 1 | Good (< 0.3) |
| Optimal word count range | 800–2,500 words | On target |
| Contextual dependency score | 27 / 100 | Low dependency — good |

**Self-containment score: 74 / 100**

Primary drag: 11 paragraphs open with "This," "It," or "They" without a prior noun anchor in the same sentence. These are individually readable but drop the raw self-containment score.

---

## Structural Readability Check

| Signal | Status | Notes |
|---|---|---|
| H1 present | Yes | "Growthub — AI-Enabled Growth Infrastructure" |
| H2 count | 7 | Well-structured — above the ≥2 minimum |
| H3 count | 12 | Good depth |
| Numbered lists | Yes | 3 numbered lists found |
| Bulleted lists | Yes | 8 bulleted lists found |
| Average paragraph length | 77 words | Well within the ≤150 word target |
| Wall-of-text sections | No | Longest unbroken block is 134 words (acceptable) |

**Structural readability score: 79 / 100**

Strong performance. Minor deduction: 2 of the 7 H2 sections have only a single H3 child — slight structural thinness.

---

## Statistical Density Check

| Signal | Value | Status |
|---|---|---|
| Percentage references | 4 instances | Low |
| Numbered data points | 6 instances | Low |
| Dollar/currency figures | 0 instances | Missing |
| Year/date references | 3 instances | |
| Data points per 1,000 words | 7.0 | Slightly below optimal (8–15) |
| Statistical density score | 47 / 100 | Weak |

**Key finding:** Statistical density is the weakest component. The homepage copy is benefit-focused but lacks specific performance numbers, client results, or category statistics. Adding 6–8 concrete data points (e.g., "reduces production time by 65%," "used by 120+ agencies") would push this score above 70.

---

## Uniqueness Signals Check

| Signal | Present | Example |
|---|---|---|
| First-party study or research | No | — |
| Proprietary data references | No | — |
| Original methodology | Yes | "Worker kit architecture" is a proprietary concept defined on the page |
| Unique terminology | Yes | "operator execution," "worker kit," "GEO Score" — distinctive phrasing |
| Non-generic claims | Partial | "AI-enabled growth infrastructure" is specific but unquantified |

**Uniqueness score: 52 / 100**

Growthub has genuine intellectual property in its worker kit architecture. The terminology is distinctive. The score is limited by the absence of original research or first-party data claims.

---

## Key Findings

1. **Answer Block Quality is the standout strength.** The homepage copy is well-structured for AI citation — paragraphs are clear, evidence-backed, and readable. The top 40% of paragraphs score 9–10/10 individually.

2. **Statistical Density is the primary drag on the citability score.** With 7.0 data points per 1,000 words (target: 8–15), the page is slightly data-thin. Adding quantified client results or performance benchmarks would be the highest-leverage single edit.

3. **Self-containment is solid but improvable.** The pronoun-to-noun ratio of 0.23 is healthy, but 11 paragraphs open with unresolved pronoun references. Fixing these 11 opening sentences would add approximately 5–6 points to the self-containment score.

---

## Top 3 Improvements

| Priority | Action | Expected Score Gain | Effort |
|---|---|---|---|
| 1 | Add 6 quantified performance claims (%, numbers, client results) throughout the homepage | +8 to +12 points (Statistical Density) | Medium — 2–3 hours of content editing |
| 2 | Rewrite 11 paragraph openers that begin with "It," "This," or "They" to use explicit noun subjects | +5 to +7 points (Self-Containment + Answer Block Quality) | Low — 45 minutes |
| 3 | Publish one original data report or methodology explainer (e.g., "Worker Kit Performance Report Q1 2026") | +4 to +6 points (Uniqueness Signals) | High — 1–2 weeks of content production |
