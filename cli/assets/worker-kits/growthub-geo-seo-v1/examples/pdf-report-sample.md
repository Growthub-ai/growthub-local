# PDF Report Input Data — Sample (GrowthHub.com)

> Example: `examples/pdf-report-sample.md`
> This shows the input data structure passed to `scripts/generate_pdf_report.py` to produce a branded PDF.
> In local-fork mode, this JSON is written to `output/<client-slug>/<project-slug>/geo_score_data.json`
> and then consumed by the ReportLab PDF generator.

---

## How to Trigger PDF Generation

```bash
# From your geo-seo-claude fork directory:
python scripts/generate_pdf_report.py \
  --input output/growthub/studio-launch-reference/geo_score_data.json \
  --output output/growthub/studio-launch-reference/GrowthHub_GeoScoreReport_v1_20260414.pdf \
  --brand "Growthub" \
  --logo brands/growthub/assets/logo.png
```

In agent-only mode: skip PDF generation and produce the Markdown equivalent instead (GeoScoreSummary).

---

## Input Data Structure (geo_score_data.json)

```json
{
  "report_meta": {
    "client_name": "Growthub",
    "client_slug": "growthub",
    "target_url": "https://thegrowthub.com",
    "audit_date": "2026-04-14",
    "report_version": "1",
    "prepared_by": "Antonio",
    "execution_mode": "local-fork"
  },
  "geo_score": {
    "composite": 68,
    "grade": "C",
    "previous_composite": null,
    "score_change": null
  },
  "components": [
    {
      "name": "AI Citability & Visibility",
      "weight": 0.25,
      "raw_score": 58,
      "weighted_score": 14.5,
      "grade": "C",
      "status": "weak",
      "primary_issue": "No llms.txt — AI crawlers have no explicit content guidance. GPTBot not explicitly permitted."
    },
    {
      "name": "Brand Authority",
      "weight": 0.20,
      "raw_score": 66,
      "weighted_score": 13.2,
      "grade": "C",
      "status": "adequate",
      "primary_issue": "LinkedIn company page exists but has <200 followers. No Wikipedia presence. GitHub absent."
    },
    {
      "name": "Content Quality & E-E-A-T",
      "weight": 0.20,
      "raw_score": 71,
      "weighted_score": 14.2,
      "grade": "B",
      "status": "adequate",
      "primary_issue": "Statistical density low (7.0 data points per 1,000 words). No published original research."
    },
    {
      "name": "Technical Foundations",
      "weight": 0.15,
      "raw_score": 84,
      "weighted_score": 12.6,
      "grade": "B",
      "status": "strong",
      "primary_issue": "Strong overall. Minor issue: Sitemap directive missing from robots.txt."
    },
    {
      "name": "Structured Data",
      "weight": 0.10,
      "raw_score": 42,
      "weighted_score": 4.2,
      "grade": "D",
      "status": "weak",
      "primary_issue": "Only Organization schema present. Missing FAQPage, Article, BreadcrumbList, WebSite."
    },
    {
      "name": "Platform Optimization",
      "weight": 0.10,
      "raw_score": 61,
      "weighted_score": 6.1,
      "grade": "C",
      "status": "adequate",
      "primary_issue": "Google AI Overviews readiness limited by missing FAQPage schema. Perplexity readiness moderate."
    }
  ],
  "citability": {
    "score": 71,
    "grade": "B",
    "components": {
      "answer_block_quality": 82,
      "self_containment": 74,
      "structural_readability": 79,
      "statistical_density": 47,
      "uniqueness_signals": 52
    }
  },
  "crawler_access": {
    "total_crawlers": 14,
    "fully_allowed": 10,
    "partially_blocked": 2,
    "blocked": 0,
    "not_mentioned": 2,
    "llms_txt_present": false,
    "llms_full_txt_present": false
  },
  "top_findings": [
    {
      "rank": 1,
      "title": "No llms.txt file",
      "description": "thegrowthub.com does not have an llms.txt file. AI crawlers are using robots.txt rules only, with no explicit content guidance. This is the highest-impact single fix available.",
      "component": "AI Citability & Visibility",
      "priority": "P0",
      "expected_score_gain": 8,
      "effort": "Low"
    },
    {
      "rank": 2,
      "title": "Missing FAQPage and Article schema",
      "description": "Only Organization schema is present. FAQPage schema would directly feed Google AI Overviews. Article schema is required for blog post citation by AI systems.",
      "component": "Structured Data",
      "priority": "P0",
      "expected_score_gain": 12,
      "effort": "Medium"
    },
    {
      "rank": 3,
      "title": "Low statistical density on homepage",
      "description": "Homepage averages 7.0 data points per 1,000 words (target: 8–15). Adding quantified client results and performance benchmarks would improve citability score.",
      "component": "Content Quality & E-E-A-T",
      "priority": "P1",
      "expected_score_gain": 6,
      "effort": "Medium"
    },
    {
      "rank": 4,
      "title": "11 paragraph openers with unresolved pronouns",
      "description": "Paragraphs beginning with 'It,' 'This,' or 'They' without a prior noun anchor reduce self-containment score. Quick rewrite task.",
      "component": "Content Quality & E-E-A-T",
      "priority": "P1",
      "expected_score_gain": 4,
      "effort": "Low"
    },
    {
      "rank": 5,
      "title": "No Wikipedia or GitHub presence",
      "description": "Brand authority is limited by absence of Wikipedia article and GitHub organization. These are high-authority signals for AI brand knowledge graphs.",
      "component": "Brand Authority",
      "priority": "P2",
      "expected_score_gain": 5,
      "effort": "High"
    }
  ],
  "remediation_summary": {
    "score_before": 68,
    "score_after_projected": 83,
    "grade_before": "C",
    "grade_after_projected": "B",
    "sprint_weeks": 4,
    "rescore_date": "2026-05-14"
  },
  "pdf_config": {
    "template": "branded-audit",
    "color_primary": "#1A1A2E",
    "color_accent": "#E94560",
    "logo_path": "brands/growthub/assets/logo.png",
    "include_charts": true,
    "include_roadmap": true,
    "include_code_snippets": false,
    "page_size": "Letter"
  }
}
```

---

## PDF Sections Generated

The `generate_pdf_report.py` script produces the following sections in the output PDF:

| Section | Pages | Content |
|---|---|---|
| Cover page | 1 | Client logo, GEO Score gauge, grade, date |
| Executive summary | 1 | 3-bullet summary, score vs. benchmark |
| Component breakdown | 2 | Visual bar chart for 6 components |
| Citability analysis | 1 | 5-metric breakdown with letter grade |
| Crawler access matrix | 1 | 14-crawler table with color-coded status |
| Top 5 findings | 2 | Ranked findings with impact and effort |
| 4-week roadmap | 1 | Sprint table with actions and owners |
| Back cover | 1 | Growthub contact, next steps |

**Total pages:** 10

**Output file:** `GrowthHub_GeoScoreReport_v1_20260414.pdf`
