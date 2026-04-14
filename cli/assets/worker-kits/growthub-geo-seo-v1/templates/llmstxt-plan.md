# llms.txt Plan

> Template: `templates/llmstxt-plan.md`
> Save output to: `output/<client-slug>/<project-slug>/LlmstxtPlan_v<N>_<YYYYMMDD>.md`

---

## Domain

| Field | Value |
|---|---|
| Domain | <!-- https://domain.com --> |
| Client | <!-- client_name --> |
| Plan Date | <!-- YYYY-MM-DD --> |
| Execution Mode | <!-- local-fork / agent-only --> |
| Auto-generation available | <!-- yes (use scripts/llmstxt_generator.py) / no (manual) --> |

---

## Current Status

| File | Status | URL Checked | Notes |
|---|---|---|---|
| `llms.txt` | <!-- exists / missing / malformed --> | `https://domain.com/llms.txt` | <!-- contents summary if exists --> |
| `llms-full.txt` | <!-- exists / missing --> | `https://domain.com/llms-full.txt` | <!-- contents summary if exists --> |

**Current llms.txt contents (if present):**

```
<!-- Paste current llms.txt here, or mark as "File not found" -->
```

---

## Why llms.txt Matters

`llms.txt` is a plain-text file that signals to AI language model crawlers which content on your site is intended to be read, indexed, and cited by AI systems. It follows the pattern of `robots.txt` but is specifically designed for LLM training and retrieval systems.

Sites without `llms.txt` rely on AI crawlers interpreting `robots.txt` rules only — missing an opportunity to explicitly surface high-quality content for AI citation.

---

## Proposed llms.txt

```
# llms.txt for <!-- domain.com -->
# Generated: <!-- YYYY-MM-DD -->
# Documentation: https://llmstxt.org

# === Allowed for all AI systems ===
User-agent: *

# Primary content for AI training and citation
Allow: /blog/
Allow: /resources/
Allow: /case-studies/
Allow: /documentation/
Allow: /about/
Allow: /services/

# === Explicitly disallow private or non-content paths ===
Disallow: /admin/
Disallow: /checkout/
Disallow: /account/
Disallow: /api/
Disallow: /wp-admin/
Disallow: /search/

# === Content description ===
# Site-name: <!-- Client Name -->
# Site-description: <!-- One sentence describing what the site is about -->
# Primary-language: en
# Content-types: articles, guides, case studies, product documentation
# Last-updated: <!-- YYYY-MM-DD -->
```

---

## Proposed llms-full.txt

`llms-full.txt` is an extended version that provides AI systems with a structured content index — similar to a sitemap but optimized for LLM retrieval.

```
# llms-full.txt for <!-- domain.com -->
# Generated: <!-- YYYY-MM-DD -->
# Full content index for AI language model retrieval

## Site Overview
- Name: <!-- Client Name -->
- Domain: <!-- https://domain.com -->
- Primary Service: <!-- one-line description -->
- Industry: <!-- industry category -->
- Language: English

## Primary Content Categories

### Blog / Articles
- <!-- https://domain.com/blog/ --> — All blog posts and articles
- <!-- https://domain.com/blog/category-1/ --> — <!-- Category description -->
- <!-- https://domain.com/blog/category-2/ --> — <!-- Category description -->

### Resources
- <!-- https://domain.com/resources/ --> — Guides, whitepapers, tools
- <!-- https://domain.com/resources/guide-1/ --> — <!-- Guide title and description -->

### Services / Products
- <!-- https://domain.com/services/ --> — Service overview
- <!-- https://domain.com/services/service-1/ --> — <!-- Service name and description -->
- <!-- https://domain.com/services/service-2/ --> — <!-- Service name and description -->

### About / Trust
- <!-- https://domain.com/about/ --> — Company background and team
- <!-- https://domain.com/case-studies/ --> — Client case studies and results

## Contact
- <!-- support@domain.com -->

## Sitemap
- <!-- https://domain.com/sitemap.xml -->
```

---

## Implementation Steps

| Step | Action | Owner | Tool | Estimated Time |
|---|---|---|---|---|
| 1 | Create `llms.txt` file at domain root | <!-- Dev / Content --> | Text editor | 15 min |
| 2 | Verify file is accessible at `https://domain.com/llms.txt` | <!-- Dev --> | curl or browser | 5 min |
| 3 | Create `llms-full.txt` with content index | <!-- Content --> | Text editor / generator | 30 min |
| 4 | Verify `llms-full.txt` accessible | <!-- Dev --> | curl or browser | 5 min |
| 5 | Add `llms.txt` reference in robots.txt | <!-- Dev --> | Text editor | 5 min |
| 6 | Re-run crawler access check to confirm access | <!-- Operator --> | `/geo crawlers` | 10 min |
| 7 | Set calendar reminder to update llms-full.txt monthly | <!-- Owner --> | Calendar | 2 min |

---

## robots.txt Addition

Add this line to `robots.txt` to surface `llms.txt` to AI crawlers:

```
# AI Content Access
LLMs-txt: https://<!-- domain.com -->/llms.txt
```

---

## Auto-generation Command Reference

If the geo-seo-claude fork is available, generate `llms.txt` automatically:

```bash
# Generate llms.txt from sitemap
python scripts/llmstxt_generator.py --domain https://domain.com --from-sitemap

# Generate llms-full.txt with content index
python scripts/llmstxt_generator.py --domain https://domain.com --full

# Preview without writing files
python scripts/llmstxt_generator.py --domain https://domain.com --dry-run
```

---

## Maintenance Schedule

| Task | Frequency | Trigger |
|---|---|---|
| Update `llms-full.txt` content index | Monthly | New content published |
| Verify `llms.txt` is still accessible | Weekly (automated) | robots.txt or server change |
| Review disallow rules | Quarterly | New product areas or pages |
| Re-run `/geo crawlers` after any change | On change | Any robots.txt or llms.txt edit |
