# Output Standards

**All GEO SEO Operator outputs must meet these standards before being delivered to a client.**

---

## Output Directory Structure

```
output/
  <client-slug>/
    <project-slug>/
      GeoAuditBrief_v<N>_<YYYYMMDD>.md
      CitabilityAnalysis_v<N>_<YYYYMMDD>.md
      CrawlerAccessReport_v<N>_<YYYYMMDD>.md
      BrandVisibilityReport_v<N>_<YYYYMMDD>.md
      GeoScoreSummary_v<N>_<YYYYMMDD>.md
      ContentAnalysis_v<N>_<YYYYMMDD>.md
      SchemaValidation_v<N>_<YYYYMMDD>.md
      TechnicalFoundations_v<N>_<YYYYMMDD>.md
      LlmstxtPlan_v<N>_<YYYYMMDD>.md
      RemediationRoadmap_v<N>_<YYYYMMDD>.md
      ClientProposal_v<N>_<YYYYMMDD>.md       (if requested)
      geo_score_data.json                     (always — powers PDF and rescores)
      <ClientSlug>_GeoScoreReport_v<N>_<YYYYMMDD>.pdf  (if PDF requested)
```

---

## File Naming Convention

```
<ClientSlug>_<OutputType>_v<N>_<YYYYMMDD>.md
```

| Part | Rules | Example |
|---|---|---|
| ClientSlug | TitleCase, no spaces, no special chars | `UrbanCycle` |
| OutputType | CamelCase from the list below | `GeoScoreSummary` |
| Version | `v` + integer, starting at 1 | `v1` |
| Date | `YYYYMMDD` format | `20260414` |

**Output type names:**

| Artifact | OutputType string |
|---|---|
| GEO Audit Brief | `GeoAuditBrief` |
| Citability Analysis | `CitabilityAnalysis` |
| Crawler Access Report | `CrawlerAccessReport` |
| Brand Visibility Report | `BrandVisibilityReport` |
| GEO Score Summary | `GeoScoreSummary` |
| Content Analysis | `ContentAnalysis` |
| Schema Validation | `SchemaValidation` |
| Technical Foundations | `TechnicalFoundations` |
| llms.txt Plan | `LlmstxtPlan` |
| Remediation Roadmap | `RemediationRoadmap` |
| Client Proposal | `ClientProposal` |

---

## Required Sections Per Artifact

Each artifact must include all sections from its template. Incomplete sections must be marked `<!-- data-gap: reason -->` — never left blank without explanation.

| Artifact | Minimum Required Sections |
|---|---|
| GeoAuditBrief | Project Overview table, Audit Objective, Command Selection Plan, Success Criteria |
| CitabilityAnalysis | URL Audited, Citability Score table, Component Breakdown table, Top 3 Improvements |
| CrawlerAccessReport | URL Audited, Crawler Permission Matrix (all 14 rows), Summary, Recommended Actions |
| BrandVisibilityReport | Brand Audited, Platform Scan table (all 8 rows), Brand Authority Score, Gap Analysis |
| GeoScoreSummary | Overall GEO Score (number + grade), Component Scores table, Score Narrative, Priority Recommendations |
| ContentAnalysis | E-E-A-T Assessment table, Answer Block Analysis, Self-Containment Check, Content Quality Score |
| SchemaValidation | Schema Types Found table, Validation Errors table, Missing Recommended Types, Implementation Priority |
| TechnicalFoundations | Server Headers table, Core Signals table, Technical Score, Critical Fixes |
| LlmstxtPlan | Current Status, Proposed llms.txt content, Proposed llms-full.txt content, Implementation Steps |
| RemediationRoadmap | Current vs. Target Score, 4-Week Sprint Plan (all 4 weeks), Estimated Score After Roadmap |
| ClientProposal | GEO Audit Summary, Why GEO Matters Now, 3 Critical Issues, Recommended Engagement (all 3 tiers), ROI Projection |

---

## Quality Bar

### Data-Grounded

- Every score must be derived from actual page data, not estimated without basis
- If a score cannot be determined (e.g., robots.txt returns 500), use 50 and flag as `data-gap`
- Never invent a score to complete a section — a flagged gap is more useful than a fabricated number

### No Filler

- Every sentence must either present data, explain a finding, or specify an action
- Remove phrases like "This is an important area to consider" — replace with the actual consideration
- Recommendations must be specific: name the exact robots.txt line, the exact schema type, the exact paragraph to rewrite

### Actionable

- Every finding must have a corresponding action in the Remediation Roadmap
- Actions must include: what to do, who should do it, how long it should take, what the expected impact is
- Code snippets in SchemaValidation must be copy-pasteable

### Consistent

- All scores in all artifacts must match — the GEO Score in GeoScoreSummary must equal the calculated composite from all component scores
- Dates must be consistent across all artifacts
- Client name and URL must match the brand kit exactly

### Output Order

Artifacts must be produced and numbered in this order:

1. GeoAuditBrief
2. CitabilityAnalysis
3. CrawlerAccessReport
4. BrandVisibilityReport
5. GeoScoreSummary
6. ContentAnalysis
7. SchemaValidation
8. TechnicalFoundations
9. LlmstxtPlan
10. RemediationRoadmap
11. ClientProposal (if requested)

---

## Versioning Rules

| Scenario | Action |
|---|---|
| First audit for a client | All files at v1 |
| Rescore after remediation | Increment all files to v2 (or current version + 1) |
| Partial update (one artifact revised) | Increment only the revised artifact's version |
| Major scope change | Start new project-slug, all files at v1 |

---

## geo_score_data.json

This file must always be written to the output directory. It is the machine-readable record of the audit and is required for:
- PDF generation (`generate_pdf_report.py`)
- Rescore comparison (load v1 data, compare to v2)
- CRM dashboard import (`crm_dashboard.py`)

See `examples/pdf-report-sample.md` for the complete format.
