# geo-seo-claude Fork Integration

**Source repo:** https://github.com/zubair-trabzada/geo-seo-claude

---

## What geo-seo-claude Is

`geo-seo-claude` is an open-source Claude Code skill for GEO (Generative Engine Optimization) and SEO auditing. It provides 14 specialized commands that run against any live URL to produce AI search visibility data, citability scores, crawler access reports, and remediation artifacts.

The Growthub GEO SEO Studio wraps this tool with:
- A brand kit system (per-client configuration)
- Structured output templates (11 templates, 9 core artifact types)
- A 5-layer documentation architecture
- A 4-week remediation roadmap format
- PDF report generation integration
- Agency proposal templates

---

## Architecture of the Fork

```
geo-seo-claude/
  geo/                        # Main skill entry point — Claude Code reads this
    skill.md                  # Master skill definition
  skills/                     # 14 sub-skill definitions (one per /geo command)
    audit.md
    citability.md
    crawlers.md
    brands.md
    report.md
    report-pdf.md
    content.md
    schema.md
    technical.md
    llmstxt.md
    quick.md
    proposal.md
    prospect.md
    compare.md
  agents/                     # 5 parallel subagent definitions
    geo-ai-visibility.md
    geo-content.md
    geo-platform-analysis.md
    geo-schema.md
    geo-technical.md
  scripts/                    # Python utility scripts
    fetch_page.py             # Playwright-based page fetcher and parser
    citability_scorer.py      # 5-metric citability algorithm
    brand_scanner.py          # 8-platform brand mention scanner
    generate_pdf_report.py    # ReportLab PDF generator
    llmstxt_generator.py      # llms.txt and llms-full.txt generator
    crm_dashboard.py          # Flask CRM dashboard
  schema/                     # 6 JSON-LD templates
    organization.json
    article.json
    faqpage.json
    product.json
    localbusiness.json
    breadcrumblist.json
  requirements.txt            # Python dependencies
  README.md
```

---

## Key Scripts and What Each Does

### `scripts/fetch_page.py`

Fetches a URL using Playwright (chromium) and extracts all signals needed for GEO analysis.

**What it produces:**
- Rendered HTML (after JavaScript execution)
- robots.txt contents (fetched from domain root)
- llms.txt and llms-full.txt status (exists/missing/malformed)
- sitemap.xml discovery and URL count
- HTTP response headers
- Page word count and heading hierarchy
- JSON-LD structured data blocks

**Usage:**
```bash
python scripts/fetch_page.py https://example.com
python scripts/fetch_page.py https://example.com --output analysis.json
```

---

### `scripts/citability_scorer.py`

Runs the 5-metric citability algorithm against page content extracted by `fetch_page.py`.

**5 metrics:**
1. Answer Block Quality (30%)
2. Self-Containment (25%)
3. Structural Readability (20%)
4. Statistical Density (15%)
5. Uniqueness Signals (10%)

**Usage:**
```bash
python scripts/citability_scorer.py --input analysis.json
python scripts/citability_scorer.py --url https://example.com
```

---

### `scripts/brand_scanner.py`

Scans 8 platforms for brand mentions and computes a brand authority score.

**Platforms scanned:**
YouTube, Reddit, Wikipedia, LinkedIn, Twitter/X, GitHub, Quora, HackerNews

**Usage:**
```bash
python scripts/brand_scanner.py --brand "Brand Name" --domain example.com
```

---

### `scripts/generate_pdf_report.py`

Generates a branded PDF report using ReportLab from a GEO score JSON data file.

**Inputs required:**
- `geo_score_data.json` — machine-readable score data produced by the audit
- Client name and target URL
- Optional: logo file path, color scheme

**Usage:**
```bash
python scripts/generate_pdf_report.py \
  --input output/<client>/geo_score_data.json \
  --output output/<client>/report.pdf \
  --brand "Client Name"
```

---

### `scripts/llmstxt_generator.py`

Generates `llms.txt` and `llms-full.txt` files for a domain.

**Usage:**
```bash
python scripts/llmstxt_generator.py --domain https://example.com --from-sitemap
python scripts/llmstxt_generator.py --domain https://example.com --full
python scripts/llmstxt_generator.py --domain https://example.com --dry-run
```

---

### `scripts/crm_dashboard.py`

Launches a Flask web dashboard for managing audit history and client accounts.

**Usage:**
```bash
python scripts/crm_dashboard.py
# Dashboard available at http://localhost:5000 (or FLASK_PORT if set)
```

---

## Python Dependencies

```
beautifulsoup4      # HTML parsing
playwright          # Dynamic page fetching (requires: playwright install chromium)
reportlab           # PDF generation
flask               # CRM dashboard web server
rich                # Terminal output formatting
validators          # URL validation
requests            # HTTP requests for robots.txt, llms.txt
lxml                # Fast XML/HTML parsing (sitemap processing)
```

Install all:
```bash
pip install -r requirements.txt
playwright install chromium
```

---

## Installation

```bash
# Clone the fork
git clone https://github.com/zubair-trabzada/geo-seo-claude ~/geo-seo-claude

# Install Python dependencies
cd ~/geo-seo-claude
pip install -r requirements.txt

# Install Playwright browser
playwright install chromium

# Verify installation
python scripts/fetch_page.py https://example.com
```

Or use the kit's setup script:
```bash
bash setup/clone-fork.sh
```

---

## When the Fork Is Unavailable

If the local fork is not cloned, the GEO SEO Operator switches to **agent-only mode**:

- Page fetching is performed via Claude's built-in fetch capability
- Citability scoring is performed manually using the 5-metric algorithm from `docs/scoring-methodology.md`
- Brand scanning is performed via Claude's knowledge of platform signals
- PDF generation is not available — Markdown equivalents are produced instead
- All output artifacts are still produced and follow the same templates

Agent-only mode is always valid and produces complete outputs. The local fork adds:
- Higher accuracy citability scores (Python parser vs. agent estimate)
- Real-time robots.txt parsing with exact user-agent matching
- Playwright-rendered page content (handles JavaScript-heavy sites)
- PDF generation capability
- Flask CRM dashboard

---

## Upstream Assumptions Frozen in This Kit

These assumptions were verified against the fork at kit creation time (2026-04-14):

- 14 /geo commands are available (listed in skills.md)
- 5 parallel subagents are defined in `agents/`
- Python 3.8+ is required
- Playwright uses chromium by default
- `requirements.txt` includes all dependencies listed above
- `schema/` contains 6 JSON-LD templates
- CRM dashboard runs on Flask at port 5000 by default

If the upstream fork changes its API or file structure after this date, update `runtime-assumptions.md` accordingly.
