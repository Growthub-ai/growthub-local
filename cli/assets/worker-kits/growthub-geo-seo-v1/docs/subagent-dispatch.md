# Subagent Dispatch — 5-Parallel Orchestration

---

## Overview

Phase 2 of the GEO audit runs 5 specialized subagents in parallel. Each subagent receives the Phase 1 fetch data as input and returns a component score (0–100) plus a findings list. The operator synthesizes all 5 results into the composite GEO Score.

---

## When Phase 2 Triggers

Phase 2 begins after Phase 1 fetch completes successfully.

**Phase 1 required outputs (all must be present before dispatching):**

- robots.txt contents (or confirmed 404)
- llms.txt status (present/missing/malformed)
- Rendered page HTML
- HTTP response headers
- Page word count and heading structure
- JSON-LD structured data (or confirmed absent)

If Phase 1 fails to fetch the target URL entirely (connection refused, server error), stop and report the error. Do not dispatch Phase 2 with no data.

If Phase 1 produces partial data (e.g., llms.txt returns 404), dispatch Phase 2 anyway and note the missing data in the relevant subagent's output.

---

## Subagent Definitions

### 1. geo-ai-visibility

**File:** `agents/geo-ai-visibility.md` (in fork)
**Scope:** AI crawler access and citation format quality
**GEO Score weight:** 25%

**Inputs from Phase 1:**
- robots.txt full text
- llms.txt full text (or `null` if missing)
- llms-full.txt status
- X-Robots-Tag header value
- Page canonical URL

**What it evaluates:**

| Signal | Method | Score Contribution |
|---|---|---|
| GPTBot access | Parse `User-agent: GPTBot` in robots.txt | High |
| ClaudeBot access | Parse `User-agent: ClaudeBot` | High |
| PerplexityBot access | Parse `User-agent: PerplexityBot` | High |
| Google-Extended access | Parse `User-agent: Google-Extended` | High |
| Bingbot access | Parse `User-agent: Bingbot` | Medium |
| Applebot-Extended access | Parse `User-agent: Applebot-Extended` | Medium |
| Anthropic-AI access | Parse `User-agent: anthropic-ai` | Medium |
| cohere-ai access | Parse `User-agent: cohere-ai` | Medium |
| Meta-ExternalFetcher access | Parse `User-agent: meta-externalagent` | Low |
| YouBot access | Parse `User-agent: YouBot` | Low |
| DuckAssistBot access | Parse `User-agent: DuckAssistBot` | Low |
| Scrapy access | Parse `User-agent: Scrapy` | Low |
| CCBot access | Parse `User-agent: CCBot` | Low |
| ia_archiver access | Parse `User-agent: ia_archiver` | Low |
| llms.txt present | File exists and returns 200 | High |
| llms.txt valid format | No parsing errors | Medium |
| llms-full.txt present | File exists | Medium |
| Citation format quality | Clean canonical, no JS-only content walls | High |
| X-Robots-Tag noai | Penalize heavily if present | Critical |

**Output format:**
```json
{
  "subagent": "geo-ai-visibility",
  "score": 0-100,
  "crawler_results": { "GPTBot": "allowed|blocked|partial", ... },
  "llms_txt_present": true|false,
  "llms_full_txt_present": true|false,
  "top_findings": ["finding 1", "finding 2", "finding 3"]
}
```

---

### 2. geo-content

**File:** `agents/geo-content.md` (in fork)
**Scope:** E-E-A-T signals, answer block quality, content self-containment
**GEO Score weight:** 20%

**Inputs from Phase 1:**
- Rendered page HTML (full text)
- Page word count
- Heading hierarchy (H1, H2, H3 counts)
- Any author markup found

**What it evaluates:**
- Experience signals (case studies, original data, first-person examples)
- Expertise signals (author bylines, credentials, domain terminology depth)
- Authoritativeness signals (external citations, authority domain references)
- Trustworthiness signals (HTTPS confirmed in Phase 1, contact info, privacy policy presence)
- Answer block quality (5-metric citability algorithm — see `docs/scoring-methodology.md`)

**Output format:**
```json
{
  "subagent": "geo-content",
  "score": 0-100,
  "eeat_scores": { "experience": 0-10, "expertise": 0-10, "authoritativeness": 0-10, "trustworthiness": 0-10 },
  "citability_score": 0-100,
  "top_findings": ["finding 1", "finding 2", "finding 3"]
}
```

---

### 3. geo-platform-analysis

**File:** `agents/geo-platform-analysis.md` (in fork)
**Scope:** Readiness for 4 major AI search platforms
**GEO Score weight:** 10%

**Inputs from Phase 1:**
- Page HTML structure
- Schema markup found
- llms.txt status (from geo-ai-visibility)
- Content signals (from geo-content)

**What it evaluates:**

| Platform | Key Signals Checked |
|---|---|
| ChatGPT (Browse mode) | Clean URL, no crawler block, answer-block format, Bing indexability |
| Perplexity AI | Direct URL crawlability, self-contained paragraphs, citation format |
| Google AI Overviews | FAQPage schema, E-E-A-T signals, featured snippet optimization, structured data |
| Gemini | Google entity graph signals, Knowledge Panel readiness, broad schema coverage |

**Output format:**
```json
{
  "subagent": "geo-platform-analysis",
  "score": 0-100,
  "platform_scores": {
    "chatgpt": 0-100,
    "perplexity": 0-100,
    "google_ai_overviews": 0-100,
    "gemini": 0-100
  },
  "top_findings": ["finding 1", "finding 2", "finding 3"]
}
```

---

### 4. geo-schema

**File:** `agents/geo-schema.md` (in fork)
**Scope:** Structured data coverage and validation
**GEO Score weight:** 10%

**Inputs from Phase 1:**
- All JSON-LD blocks from page source
- Microdata and RDFa markup (if present)
- Page type determination

**What it evaluates:**
- Which schema types are present
- Required property completeness for each type
- Validation errors (missing required fields, incorrect value types)
- Missing recommended schema types for the detected page type
- Schema richness score (types × completeness)

**Output format:**
```json
{
  "subagent": "geo-schema",
  "score": 0-100,
  "types_found": ["Organization", "WebSite"],
  "types_missing": ["FAQPage", "Article", "BreadcrumbList"],
  "validation_errors": [
    { "type": "Organization", "property": "contactPoint", "error": "missing required property" }
  ],
  "top_findings": ["finding 1", "finding 2", "finding 3"]
}
```

---

### 5. geo-technical

**File:** `agents/geo-technical.md` (in fork)
**Scope:** Technical SEO and server health
**GEO Score weight:** 15%

**Inputs from Phase 1:**
- Full HTTP response headers
- HTTPS status
- robots.txt validity
- sitemap.xml accessibility
- Page HTML (for Core Web Vitals structural signals)

**What it evaluates:**

| Signal | Check Method | Weight |
|---|---|---|
| HTTPS enforced | HTTP→HTTPS redirect + HSTS header | High |
| HSTS present | `Strict-Transport-Security` header | Medium |
| Mobile viewport | `<meta name="viewport">` present | Medium |
| robots.txt valid syntax | Parser runs without errors | High |
| Sitemap in robots.txt | `Sitemap:` directive present | Medium |
| sitemap.xml accessible | HTTP 200 response | Medium |
| llms.txt accessible | HTTP 200 response | High |
| Canonical tag present | `<link rel="canonical">` in source | Medium |
| Render-blocking scripts | `<script>` in `<head>` without defer/async | Medium |
| Images have dimensions | `width` and `height` attributes | Low |
| Content-Encoding | gzip or brotli present | Low |
| Cache-Control | public caching enabled | Low |

**Output format:**
```json
{
  "subagent": "geo-technical",
  "score": 0-100,
  "https_enforced": true|false,
  "hsts_present": true|false,
  "mobile_ready": true|false,
  "robots_valid": true|false,
  "sitemap_accessible": true|false,
  "critical_issues": ["issue 1", "issue 2"],
  "top_findings": ["finding 1", "finding 2", "finding 3"]
}
```

---

## Collecting Results

After all 5 subagents return, the operator:

1. Validates that all 5 responses are present
2. Extracts the `score` from each response
3. Applies the GEO Score formula (see `docs/scoring-methodology.md`)
4. Collects all `top_findings` arrays into a unified findings list
5. Ranks findings by impact for the Remediation Roadmap

---

## Error Handling

If a subagent fails or returns incomplete data:

| Scenario | Action |
|---|---|
| Subagent returns no score | Use 50 as neutral default. Flag component as `data-gap` in GeoScoreSummary. |
| robots.txt fetch fails (404/500) | Mark all crawler statuses as "unknown (robots.txt inaccessible)". Do not assume blocked or allowed. |
| llms.txt returns 500 error | Treat as "missing" rather than "blocked". Note the error in CrawlerAccessReport. |
| Page fetch fails entirely | Stop Phase 2. Report to user. Do not produce scores. |
| One subagent times out | Log the timeout. Use 50 as default for that component. Note in output. |

Never invent scores. A `data-gap` flag is more useful than a fabricated number.

---

## Brand Authority (Separate Pass)

Brand Authority (20% weight) is not a Phase 2 parallel subagent — it is a separate `/geo brands` command pass that runs `scripts/brand_scanner.py` against the 8 target platforms.

Run it after Phase 2 completes:
```bash
python scripts/brand_scanner.py --brand "Client Name" --domain example.com
```

Or trigger it via: `/geo brands`

The Brand Authority score is then incorporated into the final GEO Score calculation.
