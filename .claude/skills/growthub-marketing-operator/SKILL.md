---
name: growthub-marketing-operator
description: Dispatch marketing intents (CRO, SEO, content, email, launch, pricing, competitor, ASO, etc.) to the correct `growthub-marketing-skills-v1` kit skill, framework, and template. Use when the user asks for marketing help grounded in the repo's operator kit (page-cro, seo-audit, content-strategy, email-sequence, launch-strategy, competitor analysis, etc.).
triggers:
  - marketing operator
  - page cro
  - seo audit
  - content strategy
  - launch strategy
  - competitor analysis
progressiveDisclosure: true
sessionMemory:
  path: .growthub-fork/project.md
selfEval:
  criteria:
    - Intent dispatched to the correct kit skill + framework + template.
    - Deliverable shape matches the chosen output-standards.md.
    - Brand constraints (tone, approved phrases, do-not list) honoured.
  maxRetries: 3
  traceTo: .growthub-fork/trace.jsonl
helpers: []
subSkills: []
mcpTools: []
---

# Growthub Marketing Operator — Skill Dispatch

Kit: `growthub-marketing-skills-v1` (shipped in commit `70ff66f`).

In-repo paths:

- Operator knowledge base: `cli/assets/worker-kits/growthub-marketing-skills-v1/skills.md`
- Worker profile: `cli/assets/worker-kits/growthub-marketing-skills-v1/workers/marketing-operator/CLAUDE.md`
- Templates: `cli/assets/worker-kits/growthub-marketing-skills-v1/templates/`
- Docs: `cli/assets/worker-kits/growthub-marketing-skills-v1/docs/`
- Brand context (template): `cli/assets/worker-kits/growthub-marketing-skills-v1/brands/_template/product-marketing-context.md`

Upstream reference: `coreyhaines31/marketingskills` (36+ upstream skills consolidated into the kit's dispatch table).

## Dispatch — user intent → skill → framework → template

Match the user's intent to one row. When intent is ambiguous, ask for clarification before dispatching.

| User Intent | Primary Skill | Framework | Template |
|---|---|---|---|
| Optimize page conversions | `page-cro` | 7-Dimension CRO Analysis | `templates/cro-audit-brief.md` |
| Optimize signup flow | `signup-flow-cro` | Funnel Step Analysis | `templates/cro-audit-brief.md` |
| Improve onboarding | `onboarding-cro` | Activation Milestone Mapping | `templates/cro-audit-brief.md` |
| Optimize forms | `form-cro` | Field Friction Analysis | `templates/cro-audit-brief.md` |
| Improve popups | `popup-cro` | Trigger & Timing Analysis | `templates/cro-audit-brief.md` |
| Optimize paywall | `paywall-upgrade-cro` | Upgrade Path Analysis | `templates/cro-audit-brief.md` |
| SEO audit | `seo-audit` | Technical + On-Page + E-E-A-T | `templates/seo-audit-report.md` |
| AI search visibility | `ai-seo` | Citability + LLM Optimization | `templates/seo-audit-report.md` |
| Programmatic SEO | `programmatic-seo` | Template Page Architecture | `templates/seo-audit-report.md` |
| Site architecture | `site-architecture` | Information Architecture Audit | `templates/seo-audit-report.md` |
| Schema markup | `schema-markup` | Structured Data Gap Analysis | `templates/seo-audit-report.md` |
| Write copy | `copywriting` | Benefit-Driven Copy Framework | domain template |
| Edit copy | `copy-editing` | Clarity & Conversion Editing | domain template |
| Content strategy | `content-strategy` | Pillar + Distribution Planning | `templates/content-strategy-plan.md` |
| Email sequence | `email-sequence` | Sequence Architecture (5 types) | `templates/email-sequence-plan.md` |
| Cold email | `cold-email` | Outbound Sequence Framework | `templates/email-sequence-plan.md` |
| Social content | `social-content` | Platform-Native Content | domain template |
| Paid ads | `paid-ads` | Campaign Structure Framework | domain template |
| Ad creative | `ad-creative` | Creative Brief + Hook Framework | domain template |
| A/B test setup | `ab-test-setup` | Hypothesis-Driven Test Design | domain template |
| Analytics tracking | `analytics-tracking` | Measurement Plan Framework | domain template |
| Marketing ideas | `marketing-ideas` | Brainstorm + Prioritization Matrix | domain template |
| Marketing psychology | `marketing-psychology` | Behavioral Framework Application | domain template |
| Launch strategy | `launch-strategy` | Phased Launch Playbook | `templates/launch-checklist.md` |
| Pricing strategy | `pricing-strategy` | Value-Based Pricing Analysis | domain template |
| Competitor analysis | `competitor-alternatives` | Positioning Gap Analysis | `templates/competitor-analysis.md` |
| Customer research | `customer-research` | Voice-of-Customer Extraction | domain template |
| Churn prevention | `churn-prevention` | Retention Lever Analysis | domain template |
| Free tool strategy | `free-tool-strategy` | Growth Loop Design | domain template |
| Referral program | `referral-program` | Referral Mechanics Design | domain template |
| Lead magnets | `lead-magnets` | Magnet-to-Offer Alignment | domain template |
| Sales enablement | `sales-enablement` | Sales Content Mapping | domain template |
| RevOps | `revops` | Pipeline-to-Revenue Analysis | domain template |
| Community marketing | `community-marketing` | Community Growth Framework | domain template |
| ASO audit | `aso-audit` | App Store Optimization | domain template |

## Cross-skill chaining

Skills are interconnected. When one analysis reveals a need in another domain, chain in this order (complete the upstream deliverable before starting the downstream one; do not merge outputs):

**Discovery chains:**

- `customer-research` → `content-strategy` → `copywriting`
- `competitor-alternatives` → `pricing-strategy` → `launch-strategy`
- `analytics-tracking` → `ab-test-setup` → `page-cro`

**Optimization chains:**

- `seo-audit` → `content-strategy` → `programmatic-seo`
- `page-cro` → `copywriting` → `ab-test-setup`
- `email-sequence` → `copywriting` → `analytics-tracking`

**Growth chains:**

- `marketing-ideas` → `launch-strategy` → `paid-ads` → `analytics-tracking`
- `customer-research` → `referral-program` → `community-marketing`
- `lead-magnets` → `email-sequence` → `sales-enablement`

## Required grounding before delivering output

Read, in order, before drafting any deliverable:

1. `cli/assets/worker-kits/growthub-marketing-skills-v1/skills.md` (dispatch, chaining, frameworks)
2. `cli/assets/worker-kits/growthub-marketing-skills-v1/workers/marketing-operator/CLAUDE.md` (operator behavior)
3. The brand's `product-marketing-context.md` (or the `_template` one if a brand context is not yet created)
4. The exact template file from the table above

Do not substitute generic marketing advice for content grounded in the brand's product-marketing context.

## Framework anchors (summaries — full detail in kit docs)

- **CRO 7-Dimension**: Value Prop Clarity → Headline → CTA Placement & Copy → Visual Hierarchy → Trust Signals → Objection Handling → Friction. Output: Quick Wins → High-Impact Changes → A/B Test Hypotheses → Copy Alternatives.
- **SEO Priority Order**: Crawlability & indexation → Technical → On-page → Content quality → Authority & links. Output: Executive Summary → Findings by Priority → Prioritized Action Plan.
- **Content Strategy**: 3–5 pillars → gap analysis (awareness / consideration / decision) → editorial calendar → distribution mapping.
- **Email Sequences**: Welcome (5–7 / 12–14d) · Nurture (6–8 / 2–3w) · Re-engagement (3–4 / 2w) · Onboarding (5–7 / 14d) · Event-based. One email, one job. Value before ask. Relevance over volume.
- **Launch Playbook**: Pre-launch → Launch day → Post-launch. Coordinated announcements, real-time monitoring, iteration based on data.

## Quality bar

Every deliverable must:

1. Be grounded in the client's product-marketing context — no generic advice.
2. Be actionable — each finding has a specific recommendation with priority.
3. Follow the template from `templates/` — preserve section order.
4. Cite specific findings, not assumptions.
5. Lead with critical items, then quick wins, then long-term.
6. Use verbatim customer phrases from the product-marketing context over marketing jargon.

## Non-negotiable rules

1. When intent is ambiguous, ask — do not guess.
2. Do not merge two skills into one deliverable. Chain them; each skill produces its own artifact.
3. Do not shorten or skip sections of a template; if a section is not applicable, mark it and explain why.
4. Do not fabricate evidence; if data is missing, flag it and list the observation that would resolve it.

## Success criteria

Marketing work is complete when:

1. The correct template file has been filled end-to-end.
2. Every recommendation cites a specific finding (not a generic best practice).
3. Priorities are explicit (Critical / High / Medium / Low or the template's equivalent).
4. Customer language from the product-marketing context appears in headlines, CTAs, and copy suggestions.
5. Chained follow-up skills are listed as next steps, not merged into the current artifact.
