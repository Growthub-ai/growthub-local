# GEO Audit Brief — Sample (GrowthHub.com)

> Example: `examples/geo-audit-sample.md`
> This is a filled sample based on a fictitious full audit run of thegrowthub.com.
> Use this as a reference for what a completed GeoAuditBrief looks like in production.

---

## Project Overview

| Field | Value |
|---|---|
| Client | Growthub |
| Target URL | https://thegrowthub.com |
| Audit Scope | Full audit — all 6 GEO components |
| Execution Mode | local-fork |
| Primary Command | `/geo audit` |
| Requested By | Antonio |
| Date | 2026-04-14 |
| Brand Kit | brands/growthub/brand-kit.md |
| Project Slug | studio-launch-reference |

---

## Audit Objective

Establish a baseline GEO Score for thegrowthub.com as the studio launch reference audit. Determine which AI search platforms can currently access and cite Growthub content, identify the top structural barriers to AI citability, and produce a complete remediation roadmap that can serve as both an internal reference and a client-facing demo of the GEO SEO Studio kit.

---

## Current Visibility Context

**Known strengths:**
- Site is on HTTPS with a valid SSL certificate
- robots.txt exists and has valid syntax
- Core Web Vitals signals are healthy based on PageSpeed data from March 2026
- Homepage has basic Organization schema in JSON-LD

**Known concerns:**
- llms.txt has never been created — AI crawlers have no explicit content guidance
- GPTBot and ClaudeBot were found to be implicitly allowed but not explicitly listed in robots.txt
- No FAQPage or Article schema on blog posts
- Content citability has not been measured previously — pronoun density unknown

**Prior audit outputs:**
| Date | Audit Type | Output Location |
|---|---|---|
| N/A | First audit | N/A |

---

## Competitor Reference URLs

| Competitor | URL | Notes |
|---|---|---|
| Jasper.ai | https://jasper.ai | AI content tool competitor — strong brand authority |
| Copy.ai | https://copy.ai | High GEO Score expected — large content library |
| Writesonic | https://writesonic.com | Active blog with strong E-E-A-T signals |

---

## Existing Assets

| Asset | Status | Location |
|---|---|---|
| robots.txt | Present | https://thegrowthub.com/robots.txt |
| sitemap.xml | Present | https://thegrowthub.com/sitemap.xml |
| llms.txt | Missing | https://thegrowthub.com/llms.txt (404) |
| llms-full.txt | Missing | https://thegrowthub.com/llms-full.txt (404) |
| Existing schema markup | JSON-LD (Organization only) | Homepage `<head>` |
| Previous GEO report | No | N/A |

---

## Command Selection Plan

**Primary command:** `/geo audit`

**Rationale:** Full audit selected because this is the baseline reference run for the studio kit. All 6 components must be scored, all 14 crawlers must be checked, and the full remediation roadmap must be produced. A quick scan would not produce the depth required for a reference example.

**Secondary commands (full audit sequence):**

| Command | Purpose | Sequence |
|---|---|---|
| `/geo audit` | Full composite audit entrypoint | 1 |
| `/geo crawlers` | AI crawler permission check — verify robots.txt rules per crawler | 2 |
| `/geo brands` | Brand authority scan — 8 platforms | 3 |
| `/geo schema` | Structured data validation — full JSON-LD review | 4 |
| `/geo technical` | Technical health check — headers, HTTPS, Core Web Vitals signals | 5 |
| `/geo llmstxt` | llms.txt generation plan — file does not exist | 6 |
| `/geo report` | Final Markdown report compilation | 7 |

---

## Delivery Requirements

| Requirement | Value |
|---|---|
| Delivery format | Both (Markdown + PDF) |
| PDF report needed | Yes — branded PDF for internal stakeholder reference |
| Client-facing proposal | No — internal reference only |
| Output deadline | Same-day (reference run) |
| Stakeholder recipient | Antonio |

---

## Success Criteria

- [x] GEO Score composite produced with all 6 components scored
- [x] Crawler access status confirmed for all 14 AI crawlers
- [x] Citability analysis completed with letter grade assigned
- [x] At least 5 actionable remediation items identified and prioritized
- [x] llms.txt plan produced — file does not exist, full plan required
- [x] Remediation roadmap covers 4-week sprint with owner assignments
- [x] All output files saved to `output/growthub/studio-launch-reference/`
- [x] Brand kit DELIVERABLES LOG updated

---

## Audit Notes (Operator)

This audit was run in local-fork mode with geo-seo-claude cloned at `~/geo-seo-claude`. Python 3.11 was used. All 14 /geo skills confirmed present in `skills/` directory. Playwright chromium installed and verified. `fetch_page.py` ran successfully against thegrowthub.com — page renders fully in Playwright (no JS rendering issues detected).

Phase 2 subagents dispatched in parallel at 14:03:22. All 5 subagents returned results within 90 seconds. Brand authority scan (`/geo brands`) run separately as sequential command — completed in 45 seconds using `brand_scanner.py`.

PDF generation triggered at end of session using `python scripts/generate_pdf_report.py --input output/growthub/studio-launch-reference/geo_score_data.json`.
