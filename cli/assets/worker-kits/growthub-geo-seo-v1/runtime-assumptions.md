# Runtime Assumptions

**Frozen at kit creation: 2026-04-14. Update this file when upstream fork behavior changes.**

---

## Execution Mode Overview

| Mode | Requirements | Fork Used? | Python Scripts? | PDF? | Accuracy |
|---|---|---|---|---|---|
| `local-fork` | Python 3.8+, Playwright, geo-seo-claude clone | Yes | Yes | Yes | Highest |
| `agent-only` | Nothing (Claude Code only) | No | No | No | Good |
| `hybrid` | ANTHROPIC_API_KEY + fork | Yes | Yes | Yes | Highest |

### Choosing a Mode

- **Use `local-fork`** when you need the most accurate citability scores (Python parser), real Playwright-rendered page content, or PDF output.
- **Use `agent-only`** when the fork is not installed or when speed matters more than exact precision. All outputs are still produced using the same templates and formulas.
- **Use `hybrid`** when you want agent reasoning layer on top of Python data collection — useful for complex competitor comparisons or detailed content rewrites.

---

## geo-seo-claude Upstream Assumptions

These are the assumptions frozen at kit creation time about the `geo-seo-claude` fork at https://github.com/zubair-trabzada/geo-seo-claude.

### Python Environment

| Requirement | Value | Notes |
|---|---|---|
| Python version | 3.8+ | Tested on 3.10 and 3.11 |
| Package manager | pip | `pip install -r requirements.txt` |
| Key dependencies | BeautifulSoup4, Playwright, ReportLab, Flask, Rich, validators | See requirements.txt |
| Playwright browser | chromium | `playwright install chromium` |

### 14 CLI Skills (Commands)

All 14 `/geo` commands are available in `skills/` directory:

| Command | File | Status |
|---|---|---|
| `/geo audit` | `skills/audit.md` | Available |
| `/geo citability` | `skills/citability.md` | Available |
| `/geo crawlers` | `skills/crawlers.md` | Available |
| `/geo brands` | `skills/brands.md` | Available |
| `/geo report` | `skills/report.md` | Available |
| `/geo report-pdf` | `skills/report-pdf.md` | Available |
| `/geo content` | `skills/content.md` | Available |
| `/geo schema` | `skills/schema.md` | Available |
| `/geo technical` | `skills/technical.md` | Available |
| `/geo llmstxt` | `skills/llmstxt.md` | Available |
| `/geo quick` | `skills/quick.md` | Available |
| `/geo proposal` | `skills/proposal.md` | Available |
| `/geo prospect` | `skills/prospect.md` | Available |
| `/geo compare` | `skills/compare.md` | Available |

### 5 Parallel Subagents

All 5 subagent definitions are in `agents/` directory:

| Subagent | File | Weight |
|---|---|---|
| geo-ai-visibility | `agents/geo-ai-visibility.md` | 25% |
| geo-content | `agents/geo-content.md` | 20% |
| geo-platform-analysis | `agents/geo-platform-analysis.md` | 10% |
| geo-schema | `agents/geo-schema.md` | 10% |
| geo-technical | `agents/geo-technical.md` | 15% |

### Key Python Scripts

| Script | Path in Fork | Purpose |
|---|---|---|
| fetch_page.py | `scripts/fetch_page.py` | Playwright-based page fetcher |
| citability_scorer.py | `scripts/citability_scorer.py` | 5-metric citability algorithm |
| brand_scanner.py | `scripts/brand_scanner.py` | 8-platform brand mention scanner |
| generate_pdf_report.py | `scripts/generate_pdf_report.py` | ReportLab PDF generator |
| llmstxt_generator.py | `scripts/llmstxt_generator.py` | llms.txt generator |
| crm_dashboard.py | `scripts/crm_dashboard.py` | Flask CRM dashboard |

### Schema Templates

6 JSON-LD templates in `schema/` directory:

| Template | Type |
|---|---|
| organization.json | Organization |
| article.json | Article |
| faqpage.json | FAQPage |
| product.json | Product |
| localbusiness.json | LocalBusiness |
| breadcrumblist.json | BreadcrumbList |

---

## Execution Surface Flows

### Local-Fork Mode

```
User request → Environment gate (Step 0)
  ↓
Read skills.md + brand kit (Step 1)
  ↓
Read runtime docs (Step 2)
  ↓
Inspect fork: README, skills/, agents/, scripts/ (Step 3)
  ↓
3-question gate (Step 4)
  ↓
Select /geo command (Step 5)
  ↓
Phase 1: python fetch_page.py <url> → phase1_data.json (Step 6)
  ↓
Phase 2: 5 subagents in parallel → component scores (Step 7)
  ↓
GEO Score synthesis → composite score (Step 8)
  ↓
Artifact package: 9–11 Markdown files (Step 9)
  ↓ (if PDF requested)
python generate_pdf_report.py --input geo_score_data.json (Step 9)
  ↓
Log deliverable → brand kit DELIVERABLES LOG (Step 10)
```

### Agent-Only Mode

```
User request → Environment gate (Step 0 — confirm agent-only)
  ↓
Read skills.md + brand kit (Step 1)
  ↓
Read runtime docs (Step 2)
  ↓
Skip fork inspection (Step 3 — N/A)
  ↓
3-question gate (Step 4)
  ↓
Select /geo command (Step 5)
  ↓
Phase 1: fetch page via Claude built-in fetch → parse manually (Step 6)
  ↓
Phase 2: 5 subagents via Claude reasoning → component scores (Step 7)
  ↓
GEO Score synthesis → composite score (Step 8)
  ↓
Artifact package: 9–11 Markdown files + geo_score_data.json (Step 9)
  ↓ (PDF not available — note Markdown equivalent)
Log deliverable → brand kit DELIVERABLES LOG (Step 10)
```

---

## Output Assumption

All outputs are Markdown files written to:

```
output/<client-slug>/<project-slug>/
```

The operator does not write directly to client systems. Outputs are produced locally and then shared with clients via the agreed delivery channel.

---

## Flask CRM Dashboard Assumption

The CRM dashboard (`crm_dashboard.py`) runs as a separate process. It is not started automatically during an audit session.

To launch manually from the fork directory:
```bash
python scripts/crm_dashboard.py
# Accessible at http://localhost:5000 (or FLASK_PORT if set)
```

The dashboard reads from the `output/` directory and displays audit history across all clients.
