# Marketing Operator — Skills & Methodology Reference

**Kit:** `growthub-marketing-skills-v1`
**Upstream:** [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills)

This document is the operator's source of truth for skill dispatch, framework selection, and cross-domain chaining. Read it at the start of every session.

---

## Skill Dispatch Table

Map user intent to the correct marketing workflow. When intent is ambiguous, ask for clarification before selecting.

| User Intent | Primary Skill | Framework | Template |
|---|---|---|---|
| Optimize page conversions | page-cro | 7-Dimension CRO Analysis | `templates/cro-audit-brief.md` |
| Optimize signup flow | signup-flow-cro | Funnel Step Analysis | `templates/cro-audit-brief.md` |
| Improve onboarding | onboarding-cro | Activation Milestone Mapping | `templates/cro-audit-brief.md` |
| Optimize forms | form-cro | Field Friction Analysis | `templates/cro-audit-brief.md` |
| Improve popups | popup-cro | Trigger & Timing Analysis | `templates/cro-audit-brief.md` |
| Optimize paywall | paywall-upgrade-cro | Upgrade Path Analysis | `templates/cro-audit-brief.md` |
| SEO audit | seo-audit | Technical + On-Page + E-E-A-T | `templates/seo-audit-report.md` |
| AI search visibility | ai-seo | Citability + LLM Optimization | `templates/seo-audit-report.md` |
| Programmatic SEO | programmatic-seo | Template Page Architecture | `templates/seo-audit-report.md` |
| Site architecture | site-architecture | Information Architecture Audit | `templates/seo-audit-report.md` |
| Schema markup | schema-markup | Structured Data Gap Analysis | `templates/seo-audit-report.md` |
| Write copy | copywriting | Benefit-Driven Copy Framework | domain template |
| Edit copy | copy-editing | Clarity & Conversion Editing | domain template |
| Content strategy | content-strategy | Pillar + Distribution Planning | `templates/content-strategy-plan.md` |
| Email sequence | email-sequence | Sequence Architecture (5 types) | `templates/email-sequence-plan.md` |
| Cold email | cold-email | Outbound Sequence Framework | `templates/email-sequence-plan.md` |
| Social content | social-content | Platform-Native Content | domain template |
| Paid ads | paid-ads | Campaign Structure Framework | domain template |
| Ad creative | ad-creative | Creative Brief + Hook Framework | domain template |
| A/B test setup | ab-test-setup | Hypothesis-Driven Test Design | domain template |
| Analytics tracking | analytics-tracking | Measurement Plan Framework | domain template |
| Marketing ideas | marketing-ideas | Brainstorm + Prioritization Matrix | domain template |
| Marketing psychology | marketing-psychology | Behavioral Framework Application | domain template |
| Launch strategy | launch-strategy | Phased Launch Playbook | `templates/launch-checklist.md` |
| Pricing strategy | pricing-strategy | Value-Based Pricing Analysis | domain template |
| Competitor analysis | competitor-alternatives | Positioning Gap Analysis | `templates/competitor-analysis.md` |
| Customer research | customer-research | Voice-of-Customer Extraction | domain template |
| Churn prevention | churn-prevention | Retention Lever Analysis | domain template |
| Free tool strategy | free-tool-strategy | Growth Loop Design | domain template |
| Referral program | referral-program | Referral Mechanics Design | domain template |
| Lead magnets | lead-magnets | Magnet-to-Offer Alignment | domain template |
| Sales enablement | sales-enablement | Sales Content Mapping | domain template |
| RevOps | revops | Pipeline-to-Revenue Analysis | domain template |
| Community marketing | community-marketing | Community Growth Framework | domain template |
| ASO audit | aso-audit | App Store Optimization | domain template |

---

## Cross-Skill Chaining

Skills are interconnected. When one analysis reveals a need in another domain, chain them in this order:

**Discovery chains:**
- customer-research → content-strategy → copywriting
- competitor-alternatives → pricing-strategy → launch-strategy
- analytics-tracking → ab-test-setup → page-cro

**Optimization chains:**
- seo-audit → content-strategy → programmatic-seo
- page-cro → copywriting → ab-test-setup
- email-sequence → copywriting → analytics-tracking

**Growth chains:**
- marketing-ideas → launch-strategy → paid-ads → analytics-tracking
- customer-research → referral-program → community-marketing
- lead-magnets → email-sequence → sales-enablement

When chaining, complete the upstream skill's deliverable before starting the downstream skill. Do not merge outputs — each skill produces its own artifact.

---

## Framework Summaries

### CRO — 7-Dimension Analysis

1. **Value Proposition Clarity** — Can users understand the offer within 5 seconds?
2. **Headline Effectiveness** — Does the headline match traffic source messaging and promise a clear benefit?
3. **CTA Placement & Copy** — Single primary action with benefit-driven language, visible without scrolling?
4. **Visual Hierarchy** — Scannable layout with intentional whitespace guiding the eye?
5. **Trust Signals** — Logos, testimonials, case studies, reviews positioned near decision points?
6. **Objection Handling** — Are price, fit, difficulty, and risk concerns addressed before the CTA?
7. **Friction Points** — Excessive form fields, confusing navigation, broken mobile experience?

Output structure: Quick Wins → High-Impact Changes → A/B Test Hypotheses → Copy Alternatives

### SEO — Technical + On-Page + E-E-A-T

**Priority order:** Crawlability & indexation → Technical foundations → On-page optimization → Content quality → Authority & links

**Technical**: robots.txt, XML sitemaps, site speed (LCP <2.5s, INP <200ms, CLS <0.1), mobile, HTTPS, URL structure
**On-Page**: Title tags (50-60 chars), meta descriptions (150-160 chars), heading hierarchy, content depth, internal linking
**E-E-A-T**: Experience signals, expertise demonstration, authority indicators, trust markers

Output structure: Executive Summary → Findings by Priority → Prioritized Action Plan

### Content Strategy — Pillar + Distribution

**Content pillars**: Map 3-5 core topics to audience pain points and business goals
**Gap analysis**: Identify missing content across awareness / consideration / decision stages
**Editorial calendar**: Topic, format, channel, publish date, distribution plan
**Distribution**: Organic, paid, earned, owned channel mapping per content piece

### Email — Sequence Architecture

Five standard types:
- Welcome (5-7 emails / 12-14 days) — activation focus
- Nurture (6-8 emails / 2-3 weeks) — trust through expertise
- Re-engagement (3-4 emails / 2 weeks) — win-back or clean
- Onboarding (5-7 emails / 14 days) — feature adoption
- Event-based (variable) — trigger-dependent

Principles: One email one job. Value before ask. Relevance over volume.

### Launch — Phased Playbook

**Pre-launch**: Audience building, waitlist, beta testing, asset preparation
**Launch day**: Coordinated announcements, real-time monitoring, rapid response
**Post-launch**: Iteration based on data, retention activation, growth loop setup

---

## Evaluation Criteria by Domain

### CRO Scoring (per dimension)
- Strong (3): Optimized, no issues found
- Adequate (2): Functional but improvement opportunities exist
- Weak (1): Significant issues impacting conversions
- Missing (0): Not present or fundamentally broken

### SEO Priority Matrix
- Critical: Blocking indexation or causing ranking penalties
- High: Significant ranking impact, moderate effort to fix
- Medium: Incremental improvement, low-moderate effort
- Low: Nice-to-have, minimal ranking impact

### Content Quality (E-E-A-T)
- Experience: First-hand experience signals present
- Expertise: Depth and accuracy of information
- Authoritativeness: Source credibility and recognition
- Trustworthiness: Accuracy, transparency, safety

---

## Quality Bar

Every deliverable must meet these criteria:
1. Grounded in the client's product-marketing context — no generic advice
2. Actionable — every finding has a specific recommendation with priority
3. Structured — follows the template from `templates/`, section order preserved
4. Evidence-based — recommendations cite specific findings, not assumptions
5. Prioritized — critical items first, then quick wins, then long-term improvements
6. Customer-language-first — use verbatim phrases from the product-marketing context over marketing jargon
