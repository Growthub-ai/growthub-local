# PDF Report Layer

---

## When to Trigger PDF Generation

Trigger PDF generation only in these cases:

1. The user explicitly requests `/geo report-pdf`
2. The brand kit has `delivery_format: pdf` or `delivery_format: both`
3. The operator completes a full audit and the user confirms PDF delivery

Do not generate a PDF unless one of these conditions is met. Markdown is the default delivery format.

---

## Script and Requirements

**Script:** `scripts/generate_pdf_report.py` (in geo-seo-claude fork)

**Python dependency:** ReportLab (`pip install reportlab`)

**Required data:** The script consumes `geo_score_data.json` — the machine-readable score data produced at the end of the audit workflow. This file must be written to the output directory before triggering PDF generation.

---

## What the Script Needs

The following inputs are required by `generate_pdf_report.py`:

| Input | Source | Required |
|---|---|---|
| `--input path/to/geo_score_data.json` | Written by operator at end of audit | Yes |
| `--output path/to/report.pdf` | Specified by operator | Yes |
| `--brand "Client Name"` | From brand kit `client_name` field | Yes |
| Target URL | From `geo_score_data.json` | Yes (in data) |
| All 6 component scores | From `geo_score_data.json` | Yes (in data) |
| Top findings list | From `geo_score_data.json` | Yes (in data) |
| Remediation roadmap summary | From `geo_score_data.json` | Yes (in data) |
| `--logo path/to/logo.png` | From brand kit `logo_file` field | Optional |

---

## Usage

```bash
# Standard invocation from kit root
python ~/geo-seo-claude/scripts/generate_pdf_report.py \
  --input output/<client-slug>/<project-slug>/geo_score_data.json \
  --output output/<client-slug>/<project-slug>/<ClientSlug>_GeoScoreReport_v1_<YYYYMMDD>.pdf \
  --brand "Client Name" \
  --logo brands/<client-slug>/assets/logo.png

# Without logo (logo will use default Growthub placeholder)
python ~/geo-seo-claude/scripts/generate_pdf_report.py \
  --input output/<client-slug>/<project-slug>/geo_score_data.json \
  --output output/<client-slug>/<project-slug>/report.pdf \
  --brand "Client Name"
```

---

## What the PDF Contains

The branded PDF report produced by `generate_pdf_report.py` includes the following sections:

| Section | Pages | Content |
|---|---|---|
| Cover page | 1 | Client name, target URL, GEO Score gauge visualization, letter grade, audit date |
| Executive summary | 1 | 3 key findings, score vs. category benchmark, top recommended action |
| GEO Score breakdown | 2 | Visual bar chart for all 6 components, weighted contribution table |
| Citability analysis | 1 | 5-metric breakdown with visual gauges, letter grade, top 3 improvements |
| Crawler access matrix | 1 | 14-crawler table with color-coded access status (green/yellow/red) |
| Top findings | 2 | Ranked findings with impact level, effort estimate, and specific fix instructions |
| 4-week roadmap | 1 | Sprint table with actions, owners, and projected score gain |
| Back cover | 1 | Growthub contact information, next steps, rescore recommendation |

**Typical PDF length:** 10–12 pages (Letter or A4)

---

## geo_score_data.json Format

The operator must write this file before triggering PDF generation. See `examples/pdf-report-sample.md` for the complete format.

Minimum required structure:
```json
{
  "report_meta": {
    "client_name": "",
    "target_url": "",
    "audit_date": "",
    "report_version": "1"
  },
  "geo_score": {
    "composite": 0,
    "grade": ""
  },
  "components": [
    { "name": "", "weight": 0.0, "raw_score": 0, "weighted_score": 0.0, "grade": "", "primary_issue": "" }
  ],
  "top_findings": [
    { "rank": 1, "title": "", "description": "", "component": "", "priority": "", "expected_score_gain": 0 }
  ],
  "remediation_summary": {
    "score_before": 0,
    "score_after_projected": 0
  }
}
```

---

## In Agent-Only Mode

If the local fork is not available, PDF generation is not possible.

**Fallback behavior:**
1. Produce the complete `GeoScoreSummary` Markdown file as the primary score artifact
2. Note at the top: `> PDF generation requires the local geo-seo-claude fork. Run bash setup/clone-fork.sh to enable.`
3. Write `geo_score_data.json` to the output directory so PDF can be generated later when the fork is available

The Markdown output is a complete substitute for stakeholder communication. All the same data is present — the PDF simply adds visual formatting.

---

## PDF Styling

The PDF uses the brand kit's color values:

| Element | Color Source |
|---|---|
| Header and cover background | `colors.primary` from brand kit |
| Accent bars and highlights | `colors.accent` from brand kit |
| Score gauge fill | Dynamic: green (A), blue (B), yellow (C), orange (D), red (F) |
| Body text | `colors.dark` or black |
| Table alternating rows | `colors.secondary` at 10% opacity |

If no brand kit colors are found, the PDF uses Growthub defaults (`#1A1A2E` primary, `#E94560` accent).
