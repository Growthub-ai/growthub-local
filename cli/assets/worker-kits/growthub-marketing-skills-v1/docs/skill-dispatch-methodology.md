# Skill Dispatch Methodology

## How the Operator Routes User Intent

The marketing operator uses a two-phase routing system:

### Phase 1 — Domain Detection

The operator scans the user's request for trigger signals and maps to a primary marketing domain:

| Signal Pattern | Domain |
|---|---|
| "conversions", "landing page", "bounce rate", "CRO", URL shared | CRO |
| "rankings", "traffic", "SEO", "organic", "indexing" | SEO |
| "content strategy", "blog", "editorial", "pillars" | Content |
| "email", "sequence", "nurture", "cold outbound" | Email |
| "launch", "go-to-market", "GTM", "product launch" | Launch |
| "competitors", "alternatives", "positioning" | Competitive |
| "write copy", "headline", "ad copy" | Copy |
| "growth ideas", "referral", "pricing", "churn" | Growth |

When signals are ambiguous or span multiple domains, the 3-question gate resolves the primary domain.

### Phase 2 — Framework Selection

Once the domain is identified, the operator loads the appropriate template and framework from `templates/`. Each framework defines:

1. **Evaluation dimensions** — what to assess
2. **Scoring criteria** — how to rate findings (where applicable)
3. **Output structure** — required sections in the deliverable
4. **Cross-references** — when to chain to another domain

## Cross-Domain Chaining

Skills are interconnected. The operator follows upstream-to-downstream ordering:

```
customer-research → content-strategy → copywriting
competitor-analysis → pricing-strategy → launch-strategy
seo-audit → content-strategy → programmatic-seo
page-cro → copywriting → ab-test-setup
```

Each domain in the chain produces its own deliverable. Outputs are never merged across domains.

## Relationship to Upstream Skills

The dispatch table maps to 36+ skills from [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills). The operator consolidates these into 8 primary domains with framework summaries rather than loading individual skill files. This keeps the cognitive load manageable while preserving the evaluation rigor of the underlying frameworks.

Users who want deeper skill-level granularity can install the upstream skills alongside this kit. The operator's dispatch table documents which upstream skill maps to which domain.
