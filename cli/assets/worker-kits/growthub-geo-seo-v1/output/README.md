# Output Directory

All GEO SEO audit artifacts are written here. Each client gets a subdirectory. Each engagement gets a project subdirectory.

---

## Directory Structure

```
output/
  <client-slug>/
    <project-slug>/
      GeoAuditBrief_v1_YYYYMMDD.md
      CitabilityAnalysis_v1_YYYYMMDD.md
      CrawlerAccessReport_v1_YYYYMMDD.md
      BrandVisibilityReport_v1_YYYYMMDD.md
      GeoScoreSummary_v1_YYYYMMDD.md
      ContentAnalysis_v1_YYYYMMDD.md
      SchemaValidation_v1_YYYYMMDD.md
      TechnicalFoundations_v1_YYYYMMDD.md
      LlmstxtPlan_v1_YYYYMMDD.md
      RemediationRoadmap_v1_YYYYMMDD.md
      ClientProposal_v1_YYYYMMDD.md        (if requested)
      geo_score_data.json                  (machine-readable score data for PDF generation)
      <ClientSlug>_GeoScoreReport_v1_YYYYMMDD.pdf  (if PDF delivery requested)
```

---

## File Naming Convention

```
<ClientSlug>_<OutputType>_v<N>_<YYYYMMDD>.md
```

| Part | Format | Example |
|---|---|---|
| ClientSlug | TitleCase, no spaces | `GrowthHub` |
| OutputType | CamelCase artifact type | `GeoScoreSummary` |
| Version | `v` + integer | `v1`, `v2` |
| Date | `YYYYMMDD` | `20260414` |

Full example: `GrowthHub_GeoScoreSummary_v1_20260414.md`

---

## Artifact Types (9 Core + 2 Optional)

| Artifact | File Name Pattern | Description |
|---|---|---|
| GEO Audit Brief | `GeoAuditBrief_v<N>_<YYYYMMDD>.md` | Project scope, objective, command plan |
| Citability Analysis | `CitabilityAnalysis_v<N>_<YYYYMMDD>.md` | 5-metric citability score with component breakdown |
| Crawler Access Report | `CrawlerAccessReport_v<N>_<YYYYMMDD>.md` | 14 AI crawler permission matrix |
| Brand Visibility Report | `BrandVisibilityReport_v<N>_<YYYYMMDD>.md` | 8-platform brand mention scan |
| GEO Score Summary | `GeoScoreSummary_v<N>_<YYYYMMDD>.md` | 6-component weighted composite score |
| Content Analysis | `ContentAnalysis_v<N>_<YYYYMMDD>.md` | E-E-A-T, answer blocks, statistical density |
| Schema Validation | `SchemaValidation_v<N>_<YYYYMMDD>.md` | Structured data coverage and errors |
| Technical Foundations | `TechnicalFoundations_v<N>_<YYYYMMDD>.md` | Server headers, Core Web Vitals signals |
| llms.txt Plan | `LlmstxtPlan_v<N>_<YYYYMMDD>.md` | llms.txt implementation plan and files |
| Remediation Roadmap | `RemediationRoadmap_v<N>_<YYYYMMDD>.md` | 4-week sprint plan with owners |
| Client Proposal | `ClientProposal_v<N>_<YYYYMMDD>.md` | Agency proposal with pricing and ROI |
| PDF Report | `<ClientSlug>_GeoScoreReport_v<N>_<YYYYMMDD>.pdf` | Branded PDF for stakeholder delivery |

---

## Usage Notes

- **Never edit output files directly.** Always run a new audit and increment the version number.
- **Version numbering:** Start at v1. Increment on each rescore or significant update.
- **Rescore tracking:** Compare GEO Score Summary files across versions to track improvement.
- **Brand kit log:** The operator appends a line to the brand kit's DELIVERABLES LOG after each package is delivered.

---

## Deliverable Tracking Format

Append this line to `brands/<client-slug>/brand-kit.md` after each delivery:

```
- YYYY-MM-DD | GEO SEO Audit Package v<N> — <Project Name> | output/<client-slug>/<project-slug>/
```

Examples:
```
- 2026-04-14 | GEO SEO Audit Package v1 — Studio Launch Reference | output/growthub/studio-launch-reference/
- 2026-05-01 | GEO SEO Audit Package v1 — UrbanCycle Full Audit | output/urban-cycle/full-audit-q2-2026/
- 2026-05-15 | GEO SEO Audit Package v2 — UrbanCycle Post-Remediation Rescore | output/urban-cycle/rescore-may-2026/
```

---

## Example Layout (Populated)

```
output/
  growthub/
    studio-launch-reference/
      GeoAuditBrief_v1_20260414.md
      CitabilityAnalysis_v1_20260414.md
      CrawlerAccessReport_v1_20260414.md
      BrandVisibilityReport_v1_20260414.md
      GeoScoreSummary_v1_20260414.md
      ContentAnalysis_v1_20260414.md
      SchemaValidation_v1_20260414.md
      TechnicalFoundations_v1_20260414.md
      LlmstxtPlan_v1_20260414.md
      RemediationRoadmap_v1_20260414.md
      geo_score_data.json
      GrowthHub_GeoScoreReport_v1_20260414.pdf
  urban-cycle/
    full-audit-q2-2026/
      GeoAuditBrief_v1_20260501.md
      ...
```
