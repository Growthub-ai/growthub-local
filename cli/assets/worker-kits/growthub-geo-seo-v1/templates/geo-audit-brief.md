# GEO Audit Brief

> Template: `templates/geo-audit-brief.md`
> Save output to: `output/<client-slug>/<project-slug>/GeoAuditBrief_v<N>_<YYYYMMDD>.md`

---

## Project Overview

| Field | Value |
|---|---|
| Client | <!-- client_name from brand kit --> |
| Target URL | <!-- target_url from brand kit --> |
| Audit Scope | <!-- quick / citability-only / full / specific command --> |
| Execution Mode | <!-- local-fork / agent-only / hybrid --> |
| Primary Command | <!-- /geo audit / /geo quick / /geo citability / etc. --> |
| Requested By | <!-- account_owner --> |
| Date | <!-- YYYY-MM-DD --> |
| Brand Kit | <!-- brands/<client-slug>/brand-kit.md --> |
| Project Slug | <!-- <project-slug> --> |

---

## Audit Objective

<!-- 2–4 sentences describing what this audit is intended to answer.
Example: "Determine whether thegrowthub.com is discoverable and citable by major AI search platforms including ChatGPT, Perplexity, and Google AI Overviews. Identify the top 3 structural barriers to AI citability and produce a prioritized remediation roadmap." -->

---

## Current Visibility Context

**Known strengths:**
- <!-- any existing SEO wins, content depth, known rankings -->
- <!-- schema types already implemented, if known -->

**Known concerns:**
- <!-- any reported traffic drops, AI search gaps, crawler warnings -->
- <!-- previous audit findings, if any -->

**Prior audit outputs:**
| Date | Audit Type | Output Location |
|---|---|---|
| <!-- YYYY-MM-DD --> | <!-- type --> | <!-- output/path --> |

---

## Competitor Reference URLs

| Competitor | URL | Notes |
|---|---|---|
| <!-- Competitor 1 --> | <!-- https://... --> | <!-- why included --> |
| <!-- Competitor 2 --> | <!-- https://... --> | <!-- why included --> |
| <!-- Competitor 3 --> | <!-- https://... --> | <!-- why included --> |

---

## Existing Assets

| Asset | Status | Location |
|---|---|---|
| robots.txt | <!-- present / missing / check needed --> | <!-- URL --> |
| sitemap.xml | <!-- present / missing / check needed --> | <!-- URL --> |
| llms.txt | <!-- present / missing / check needed --> | <!-- URL --> |
| llms-full.txt | <!-- present / missing / check needed --> | <!-- URL --> |
| Existing schema markup | <!-- JSON-LD / Microdata / none --> | <!-- page(s) --> |
| Previous GEO report | <!-- yes / no --> | <!-- output/path --> |

---

## Command Selection Plan

**Primary command:** `<!-- /geo command -->`

**Rationale:** <!-- why this command was selected over alternatives -->

**Secondary commands (if full audit):**

| Command | Purpose | Sequence |
|---|---|---|
| `/geo audit` | Full composite audit | 1 |
| `/geo crawlers` | AI crawler permission check | 2 |
| `/geo brands` | Brand authority scan | 3 |
| `/geo schema` | Structured data validation | 4 |
| `/geo technical` | Technical health check | 5 |
| `/geo llmstxt` | llms.txt generation plan | 6 |
| `/geo report` | Final Markdown report | 7 |

---

## Delivery Requirements

| Requirement | Value |
|---|---|
| Delivery format | <!-- Markdown / PDF / both --> |
| PDF report needed | <!-- yes / no --> |
| Client-facing proposal | <!-- yes / no --> |
| Output deadline | <!-- date or ASAP --> |
| Stakeholder recipient | <!-- name / email --> |

---

## Success Criteria

<!-- What does a successful audit look like for this client? -->

- [ ] GEO Score composite produced with all 6 components scored
- [ ] Crawler access status confirmed for all 14 AI crawlers
- [ ] Citability analysis completed with letter grade assigned
- [ ] At least 5 actionable remediation items identified and prioritized
- [ ] llms.txt plan produced (even if existing file is valid)
- [ ] Remediation roadmap covers 4-week sprint with owner assignments
- [ ] All output files saved to `output/<client-slug>/<project-slug>/`
- [ ] Brand kit DELIVERABLES LOG updated
