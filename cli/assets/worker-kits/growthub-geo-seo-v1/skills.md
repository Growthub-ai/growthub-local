# GEO SEO Operator — Master Skill Doc

**Source of truth for methodology. Read this file completely before beginning any task.**

---

## QUICK REFERENCE TABLE

| Resource | Path |
|---|---|
| Agent operating law | `workers/geo-seo-operator/CLAUDE.md` |
| Brand kit template | `brands/_template/brand-kit.md` |
| Growthub example brand kit | `brands/growthub/brand-kit.md` |
| Output contract | `output-standards.md` |
| Runtime assumptions | `runtime-assumptions.md` |
| Fork integration notes | `docs/geo-seo-fork-integration.md` |
| Subagent dispatch | `docs/subagent-dispatch.md` |
| Scoring methodology | `docs/scoring-methodology.md` |
| PDF report layer | `docs/pdf-report-layer.md` |
| GEO audit brief | `templates/geo-audit-brief.md` |
| Citability analysis | `templates/citability-analysis.md` |
| Crawler access report | `templates/crawler-access-report.md` |
| Brand visibility report | `templates/brand-visibility-report.md` |
| GEO score summary | `templates/geo-score-summary.md` |
| Content analysis | `templates/content-analysis.md` |
| Schema validation | `templates/schema-validation.md` |
| Technical foundations | `templates/technical-foundations.md` |
| llms.txt plan | `templates/llmstxt-plan.md` |
| Remediation roadmap | `templates/remediation-roadmap.md` |
| Client proposal | `templates/client-proposal.md` |
| Sample audit brief | `examples/geo-audit-sample.md` |
| Sample citability | `examples/citability-sample.md` |
| Sample PDF data | `examples/pdf-report-sample.md` |
| Sample proposal | `examples/prospect-proposal-sample.md` |

---

## STEP 0 — BEFORE ANY TASK, ANSWER THESE QUESTIONS

Before producing anything, confirm:

1. Which client or brand is this for?
2. What is the target URL or domain?
3. What is the audit scope: quick / citability-only / full / specific command?
4. What delivery format is required: Markdown only / PDF / both?
5. Is the geo-seo-claude fork available locally?
6. What execution mode: local-fork / agent-only / hybrid?

If any of these are unknown after the 3-question gate in CLAUDE.md, stop and ask.

---

## STEP 1 — LOAD THE BRAND KIT

Read `brands/<client-slug>/brand-kit.md` if it exists. Otherwise start from `brands/_template/brand-kit.md`.

Extract:
- client identity (name, slug, industry)
- target URL and competitor URLs
- audit scope and delivery format preference
- messaging tone and guardrails
- agency context (prospect stage, retainer range)
- existing deliverables log

The brand kit drives all output naming, tone calibration, and proposal pricing context.

---

## STEP 2 — CHECK THE WORKING SUBSTRATE

If the user has a local geo-seo-claude fork, inspect it before planning anything.

### Source-of-truth file order in the fork

1. `README.md`
2. `geo/` — main skill entry point and command routing
3. `skills/` — 14 sub-skill definition files
4. `agents/` — 5 subagent definition files
5. `scripts/fetch_page.py` — fetches and parses pages via Playwright
6. `scripts/citability_scorer.py` — runs the 5-metric citability algorithm
7. `scripts/brand_scanner.py` — scans platforms for brand mentions
8. `scripts/generate_pdf_report.py` — produces branded PDF via ReportLab
9. `scripts/llmstxt_generator.py` — generates llms.txt and llms-full.txt
10. `scripts/crm_dashboard.py` — Flask-based CRM dashboard
11. `schema/` — 6 JSON-LD templates for structured data recommendations

### What to verify in the fork

- Which of the 14 commands are implemented and callable
- Whether Playwright is installed and chromium browser is available
- Whether `requirements.txt` dependencies are installed
- What the Python version is (`python3 --version`)
- Whether `schema/` contains JSON-LD templates for all common types
- Whether `agents/` has definitions for all 5 subagents

If the fork cannot be inspected, use the frozen assumptions in `runtime-assumptions.md` and label outputs `assumption-based`.

---

## STEP 3 — COMMAND SELECTION LOGIC

Select the narrowest command that satisfies the real job.

| Command | Primary Use | Phase 2 Subagents? | PDF Output? |
|---|---|---|---|
| `/geo audit` | Full GEO + SEO audit, all components | Yes | Optional |
| `/geo citability` | Citability score only, fast | No | No |
| `/geo crawlers` | AI crawler permission check | No | No |
| `/geo brands` | Brand mention and authority scan | No | No |
| `/geo report` | Structured Markdown report from existing data | No | No |
| `/geo report-pdf` | Branded PDF report via ReportLab | No | Yes |
| `/geo content` | E-E-A-T and content quality | Partial | No |
| `/geo schema` | Structured data validation | No | No |
| `/geo technical` | Server headers and technical health | No | No |
| `/geo llmstxt` | Generate llms.txt plan or file | No | No |
| `/geo quick` | 60-second AI visibility snapshot | No | No |
| `/geo proposal` | Client proposal with pricing | No | No |
| `/geo prospect` | Prospect qualification scan | Partial | No |
| `/geo compare` | Side-by-side GEO comparison of 2+ URLs | Yes | Optional |

Default selection rules:
- "Full audit" → `/geo audit`
- "Quick look" or "first pass" → `/geo quick`
- "Check if crawlers can access" → `/geo crawlers`
- "Can AI cite this page?" → `/geo citability`
- "Build a proposal for this prospect" → `/geo proposal`
- "Compare to competitors" → `/geo compare`

---

## STEP 4 — PHASE 1: FETCH AND PARSE LOGIC

`fetch_page.py` uses Playwright (chromium) to load the target URL dynamically and extract all signals needed for Phase 2.

### What to extract

| Signal | Source | Notes |
|---|---|---|
| `robots.txt` | `https://domain.com/robots.txt` | Parse Disallow/Allow rules for each of the 14 AI crawler user-agents |
| `llms.txt` | `https://domain.com/llms.txt` | Exists / missing / malformed — record file contents if present |
| `llms-full.txt` | `https://domain.com/llms-full.txt` | Exists / missing |
| `sitemap.xml` | `https://domain.com/sitemap.xml` | URL count, lastmod dates, priority values |
| HTML `<title>` | Page source | Record exact value |
| `<meta description>` | Page source | Record exact value |
| `<link rel="canonical">` | Page source | Record exact value |
| Open Graph tags | Page source | og:title, og:description, og:type, og:image |
| HTTP response headers | Server response | Server, Cache-Control, Content-Type, X-Robots-Tag, Strict-Transport-Security |
| Page word count | Rendered HTML | After JS execution — Playwright renders dynamic content |
| Heading hierarchy | Rendered HTML | H1 count, H2 count, nesting order |
| Structured data | Page source | JSON-LD blocks, Microdata, RDFa |
| HTTPS status | URL scheme + redirect | Confirm HTTPS redirect from HTTP |

In agent-only mode, perform this extraction manually by reading the page via fetch/curl equivalent and parsing visible content.

---

## STEP 5 — PHASE 2: SUBAGENT DISPATCH LOGIC

After Phase 1 completes, dispatch all 5 subagents in parallel. Each subagent receives the Phase 1 data as input.

### geo-ai-visibility (25% of GEO Score)

**Scope:** AI crawler access and citation format quality

**Inputs:** robots.txt parsed rules, llms.txt contents (if any), page HTML structure

**What it checks:**
- Permission status for each of the 14 AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Bingbot, Applebot-Extended, Anthropic-AI, cohere-ai, Meta-ExternalFetcher, YouBot, DuckAssistBot, Scrapy, CCBot, ia_archiver)
- Whether llms.txt exists and follows the correct format
- Whether llms-full.txt exists
- Citation format quality — does the page structure support clean citation by AI systems?
- Presence of clean canonical URLs, no JavaScript-only content walls

**Outputs:** Crawler permission matrix (14 rows), llms.txt status, citation format score (0–100)

---

### geo-content (20% of GEO Score)

**Scope:** E-E-A-T signals, answer block quality, content self-containment

**Inputs:** Rendered page HTML, word count, heading structure, author markup

**What it checks:**
- Experience signals: case studies, original data, first-person examples
- Expertise signals: author credentials, bylines, About page depth
- Authoritativeness signals: external citations, backlink signals (if available), Wikipedia mentions
- Trustworthiness signals: HTTPS, contact info, privacy policy, review count
- Answer block quality: does the page contain self-contained answer paragraphs that AI systems can quote directly?
- Self-containment check: word count vs. pronoun density — pages with high pronoun density relative to noun density score lower
- Statistical density: presence of percentages, numbered lists, data references
- Uniqueness signals: original research, proprietary data, non-generic claims

**Outputs:** E-E-A-T score (0–100), content quality score (0–100), top 3 content gaps

---

### geo-platform-analysis (10% of GEO Score)

**Scope:** Readiness for specific AI search platforms

**Inputs:** Page structure, schema markup, llms.txt status, content signals

**What it checks:**
- ChatGPT readiness: Browse with Bing access, clean URL structure, answer-block format
- Perplexity readiness: Direct URL crawlability, citation format, structured answers
- Google AI Overviews readiness: E-E-A-T signals, structured data, FAQ schema, featured snippet optimization
- Gemini readiness: Google entity graph signals, Knowledge Panel readiness, schema breadth

**Outputs:** Platform readiness table (4 platforms × 5 signals × score), composite platform score (0–100)

---

### geo-schema (10% of GEO Score)

**Scope:** Structured data coverage and validation

**Inputs:** Page source JSON-LD blocks, Microdata, RDFa markup

**What it checks:**
- Which schema types are present (Organization, WebSite, Article, BreadcrumbList, FAQPage, HowTo, Product, LocalBusiness, etc.)
- Validation errors (missing required properties, incorrect value types)
- Missing recommended schema types for the page type
- Schema richness score — number of types × completeness per type

**Outputs:** Schema type coverage table, validation error list, missing types list, schema score (0–100)

---

### geo-technical (15% of GEO Score)

**Scope:** Technical SEO and server health

**Inputs:** HTTP response headers, HTTPS status, page load signals, robots.txt

**What it checks:**
- HTTPS enforcement (redirect from HTTP, HSTS header)
- Mobile friendliness signals (viewport meta tag, responsive CSS indicators)
- robots.txt validity (valid syntax, no wildcard blocks on critical paths)
- Sitemap accessibility (sitemap.xml found, linked from robots.txt)
- Core Web Vitals signals (from Lighthouse or page source — LCP hints, CLS hints, FID/INP hints)
- Server headers (Cache-Control, Content-Encoding, CDN indicators)
- Page speed indicators (image optimization signals, script loading strategy)

**Outputs:** Server headers table, Core Web Vitals signal table, technical score (0–100), critical fixes list

---

## STEP 6 — GEO SCORE SYNTHESIS

Apply the weighted formula after all subagent results are collected.

### GEO Score Formula

```
GEO Score = (AI Citability × 0.25) + (Brand Authority × 0.20) + (Content Quality × 0.20) +
            (Technical Foundations × 0.15) + (Structured Data × 0.10) + (Platform Optimization × 0.10)
```

### Component Score Normalization

Each component subagent returns a raw score 0–100. If a component cannot be scored (data gap), use 50 as the neutral default and flag the component as `data-gap`.

### Letter Grade Thresholds

| Grade | Score Range | Meaning |
|---|---|---|
| A | 85–100 | Highly optimized for AI search — strong citability, clean access, rich schema |
| B | 70–84 | Good AI visibility — some gaps, addressable in one sprint cycle |
| C | 55–69 | Moderate visibility — missing key citability signals, schema gaps, crawler issues |
| D | 40–54 | Poor AI visibility — likely blocked or thin content, major remediation needed |
| F | Below 40 | Not AI-search-ready — crawlers blocked, no schema, low citability |

### Score Interpretation for Client Communication

- **A (85+):** "Your site is well-positioned for AI-driven search. We recommend ongoing monitoring and targeted improvements to maintain this position."
- **B (70–84):** "Good foundation. Targeted improvements in [lowest component] can push you into the A tier within 30–60 days."
- **C (55–69):** "Moderate visibility. You are not capturing significant AI-referred traffic yet. A full remediation roadmap is recommended."
- **D (40–54):** "Your site has significant AI search blindspots. AI systems may not be citing or recommending your content at all."
- **F (below 40):** "Critical issues detected. AI crawlers may be blocked outright. Immediate technical and content remediation required."

---

## STEP 7 — CITABILITY ALGORITHM

The citability score measures how well a page can be cleanly quoted and cited by AI systems.

### 5-Metric Algorithm

| Metric | Weight | What It Measures |
|---|---|---|
| Answer Block Quality | 30% | Do paragraphs contain complete, self-sufficient answers AI can quote verbatim? |
| Self-Containment | 25% | Can a paragraph be understood without reading surrounding context? Low pronoun-to-noun ratio = better. |
| Structural Readability | 20% | Does the page use headings, short paragraphs, and numbered lists to enable AI parsing? |
| Statistical Density | 15% | Does the page contain specific numbers, percentages, and data references AI prefers to cite? |
| Uniqueness Signals | 10% | Does the content contain proprietary claims, original research, or data not found elsewhere? |

### Computing Each Metric

- **Answer Block Quality:** Score each paragraph 0–10 on: clear subject, predicate, supporting evidence, no unresolved pronouns. Average across all paragraphs.
- **Self-Containment:** Count pronoun references (it, they, this, that) as a fraction of total noun references. Lower ratio = higher score.
- **Structural Readability:** Check presence of: H1 (required), H2s (≥2), numbered/bulleted lists (≥1), paragraph length ≤150 words, no wall-of-text sections.
- **Statistical Density:** Count numerical data references (% signs, numbered lists, dates with years, dollar figures) per 1000 words. Optimal: 8–15 data points per 1000 words.
- **Uniqueness Signals:** Check for: "first-party study," "based on our data," "internal research," proprietary methodology references, or unique terminology.

---

## STEP 8 — REMEDIATION ROADMAP LOGIC

Build the roadmap by ranking all findings by impact × urgency.

### Priority Matrix

| Priority | Impact | Urgency | Action |
|---|---|---|---|
| P0 — Critical | High | Immediate | Fix this week — crawlers blocked, HTTPS broken, major schema errors |
| P1 — High | High | This sprint | Add llms.txt, fix citability blockers, add missing schema types |
| P2 — Medium | Medium | Week 2–3 | E-E-A-T improvements, statistical density, answer block rewrites |
| P3 — Low | Low | Week 4+ | Brand authority campaigns, platform optimization, monitoring setup |

### 4-Week Sprint Structure

- **Week 1:** P0 and P1 items — all technical and crawler-access blockers
- **Week 2:** P2 items — content quality improvements, schema additions
- **Week 3:** P2 continuation — E-E-A-T depth, self-containment rewrites
- **Week 4:** P3 items — brand platform seeding, monitoring, reporting loop setup

---

## STEP 9 — OUTPUT ORDER

Produce artifacts in this strict order:

1. GEO Audit Brief (`templates/geo-audit-brief.md`)
2. Citability Analysis (`templates/citability-analysis.md`)
3. Crawler Access Report (`templates/crawler-access-report.md`)
4. Brand Visibility Report (`templates/brand-visibility-report.md`)
5. GEO Score Summary (`templates/geo-score-summary.md`)
6. Content Analysis (`templates/content-analysis.md`)
7. Schema Validation (`templates/schema-validation.md`)
8. Technical Foundations (`templates/technical-foundations.md`)
9. llms.txt Plan (`templates/llmstxt-plan.md`)
10. Remediation Roadmap (`templates/remediation-roadmap.md`)
11. Client Proposal (`templates/client-proposal.md`) — only if requested

---

## STEP 10 — QUALITY BAR

Good output looks like this:

- All scores derived from actual page data — no invented numbers
- GEO Score uses the exact formula defined in Step 6 — no rounding before final aggregate
- Citability analysis applies all 5 metrics, not just the top 2
- Crawler access report covers all 14 AI crawlers by exact user-agent string
- Remediation roadmap is sequenced by impact × urgency, not alphabetically
- Client proposal grounds ROI projections in AI search traffic trend data
- Every output file can be handed to a client or developer and acted on immediately
- No filler paragraphs — every sentence either presents data, explains a finding, or specifies an action
