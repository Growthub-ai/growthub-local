# CRO Audit Brief — Growthub / Homepage

**Date:** 2026-04-15
**Version:** v1
**Domain:** CRO
**Operator:** marketing-operator

---

## Executive Summary

- Homepage value proposition is clear but buried below the fold — headline focuses on category rather than benefit
- CTA copy is generic ("Get Started") and misses the primary conversion action (CLI install)
- Strong trust signals (open source, MIT license, npm published) but not positioned near the CTA
- No objection handling before the primary conversion point
- Quick win: rewrite headline to lead with the benefit, move trust signals above the fold

---

## Page Under Review

| Field | Value |
|---|---|
| URL | growthub.ai |
| Page type | Homepage |
| Traffic source | Organic + GitHub referral |
| Current conversion rate | Unknown |
| Primary conversion goal | CLI install via `npx @growthub/create-growthub-local` |

---

## 7-Dimension Analysis

### 1. Value Proposition Clarity

**Score:** Adequate (2)

**Findings:** The one-liner "Local-first AI agent runtime" is technically accurate but doesn't communicate the benefit to the user. Visitors from non-technical backgrounds may not understand what "runtime" means in this context.

**Recommendations:** Lead with the outcome: "Ship marketing without hiring an agency" or "Run AI agent kits locally — your data stays on your machine."

### 2. Headline Effectiveness

**Score:** Weak (1)

**Findings:** Headline describes the category (AI agent runtime) rather than the promise. Doesn't match the messaging from GitHub (where most traffic originates) which emphasizes "worker kits" and "local execution."

**Recommendations:** Test benefit-driven headlines that match the traffic source messaging. Options:
1. "Download a marketing team in one command"
2. "AI agent kits that actually know your product"
3. "Local-first worker kits for marketing and growth"

### 3. CTA Placement & Copy

**Score:** Adequate (2)

**Findings:** Primary CTA exists above the fold but uses generic "Get Started" copy. The actual conversion action (CLI install command) is a better CTA since it's one command and feels low-commitment.

**Recommendations:** Replace "Get Started" with the actual install command: `npx @growthub/create-growthub-local` — developers respond better to concrete commands than vague buttons.

### 4. Visual Hierarchy

**Score:** Strong (3)

**Findings:** Clean layout with clear sections. Good use of whitespace. Discovery hub screenshot provides social proof of the actual product experience.

**Recommendations:** No critical changes needed. Consider adding kit-specific screenshots below the fold to show what users actually get.

### 5. Trust Signals

**Score:** Adequate (2)

**Findings:** Open source badge, MIT license mention, and npm published status are present but positioned in the footer area. GitHub stars count is not prominently displayed.

**Recommendations:** Move "MIT Licensed | Open Source | Works with Claude, Cursor, Codex, Gemini" above the fold, near the CTA. Add GitHub stars badge.

### 6. Objection Handling

**Score:** Missing (0)

**Findings:** No objection handling before the CTA. Common objections ("How is this different from ChatGPT?", "Does it work with my agent?", "Is it hard to set up?") are not addressed.

**Recommendations:** Add a 3-row objection-handling section between the hero and the CTA. Use the customer language from the product-marketing context.

### 7. Friction Points

**Score:** Strong (3)

**Findings:** Install is one command. No signup form, no email gate, no account required. This is the lowest-friction conversion path possible for a developer tool.

**Recommendations:** Preserve this simplicity. Do not add a signup wall before the CLI install.

---

## Composite Score

| Dimension | Score |
|---|---|
| Value Proposition Clarity | 2/3 |
| Headline Effectiveness | 1/3 |
| CTA Placement & Copy | 2/3 |
| Visual Hierarchy | 3/3 |
| Trust Signals | 2/3 |
| Objection Handling | 0/3 |
| Friction Points | 3/3 |
| **Total** | **13/21** |

---

## Quick Wins

1. Rewrite headline to lead with benefit, not category
2. Replace "Get Started" CTA with the actual install command
3. Move open-source trust signals above the fold

## High-Impact Changes

1. Add objection-handling section (3 common objections with one-line answers)
2. Add kit-specific screenshots showing what users actually get after install
3. Add GitHub stars badge as social proof

## A/B Test Hypotheses

| Test | Hypothesis | Expected Impact | Priority |
|---|---|---|---|
| Headline: benefit vs. category | Benefit-driven headline will increase CLI installs by 15-25% | High | 1 |
| CTA: "Get Started" vs. install command | Showing the actual command will increase clicks by 10-20% | Medium | 2 |
| Trust signals above fold | Moving trust signals up will reduce bounce rate by 5-10% | Medium | 3 |
