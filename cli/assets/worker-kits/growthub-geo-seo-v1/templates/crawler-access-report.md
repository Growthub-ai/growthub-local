# Crawler Access Report

> Template: `templates/crawler-access-report.md`
> Save output to: `output/<client-slug>/<project-slug>/CrawlerAccessReport_v<N>_<YYYYMMDD>.md`

---

## URL Audited

| Field | Value |
|---|---|
| Target Domain | <!-- https://domain.com --> |
| robots.txt URL | <!-- https://domain.com/robots.txt --> |
| robots.txt Found | <!-- yes / no / error --> |
| llms.txt URL | <!-- https://domain.com/llms.txt --> |
| llms.txt Found | <!-- yes / no --> |
| Client | <!-- client_name --> |
| Analysis Date | <!-- YYYY-MM-DD --> |
| Execution Mode | <!-- local-fork / agent-only --> |

---

## robots.txt Raw Excerpt

```
<!-- Paste the full contents of robots.txt here, or mark as "Not found" -->
```

---

## Crawler Permission Matrix

| AI Crawler | User-Agent String | robots.txt Status | Access Level | Notes |
|---|---|---|---|---|
| GPTBot | `GPTBot` | <!-- Allowed / Blocked / Not mentioned --> | <!-- Full / Partial / None --> | <!-- any specific Disallow paths --> |
| ClaudeBot | `ClaudeBot` | <!-- Allowed / Blocked / Not mentioned --> | <!-- Full / Partial / None --> | <!-- notes --> |
| PerplexityBot | `PerplexityBot` | <!-- Allowed / Blocked / Not mentioned --> | <!-- Full / Partial / None --> | <!-- notes --> |
| Google-Extended | `Google-Extended` | <!-- Allowed / Blocked / Not mentioned --> | <!-- Full / Partial / None --> | <!-- notes --> |
| Bingbot | `Bingbot` | <!-- Allowed / Blocked / Not mentioned --> | <!-- Full / Partial / None --> | <!-- notes --> |
| Applebot-Extended | `Applebot-Extended` | <!-- Allowed / Blocked / Not mentioned --> | <!-- Full / Partial / None --> | <!-- notes --> |
| Anthropic-AI | `anthropic-ai` | <!-- Allowed / Blocked / Not mentioned --> | <!-- Full / Partial / None --> | <!-- notes --> |
| cohere-ai | `cohere-ai` | <!-- Allowed / Blocked / Not mentioned --> | <!-- Full / Partial / None --> | <!-- notes --> |
| Meta-ExternalFetcher | `meta-externalagent` | <!-- Allowed / Blocked / Not mentioned --> | <!-- Full / Partial / None --> | <!-- notes --> |
| YouBot | `YouBot` | <!-- Allowed / Blocked / Not mentioned --> | <!-- Full / Partial / None --> | <!-- notes --> |
| DuckAssistBot | `DuckAssistBot` | <!-- Allowed / Blocked / Not mentioned --> | <!-- Full / Partial / None --> | <!-- notes --> |
| Scrapy | `Scrapy` | <!-- Allowed / Blocked / Not mentioned --> | <!-- Full / Partial / None --> | <!-- notes --> |
| CCBot | `CCBot` | <!-- Allowed / Blocked / Not mentioned --> | <!-- Full / Partial / None --> | <!-- notes --> |
| ia_archiver | `ia_archiver` | <!-- Allowed / Blocked / Not mentioned --> | <!-- Full / Partial / None --> | <!-- notes --> |

---

## Access Level Summary

| Access Level | Count | Crawlers |
|---|---|---|
| Full access | <!-- N --> | <!-- list --> |
| Partial access (some paths blocked) | <!-- N --> | <!-- list --> |
| Blocked | <!-- N --> | <!-- list --> |
| Not mentioned (defaults to allowed) | <!-- N --> | <!-- list --> |

---

## llms.txt Status

| Item | Status | Notes |
|---|---|---|
| `llms.txt` present | <!-- yes / no --> | |
| `llms-full.txt` present | <!-- yes / no --> | |
| Format valid | <!-- yes / no / n/a --> | <!-- describe any issues --> |
| AI model sections defined | <!-- yes / no / n/a --> | <!-- which models listed --> |
| Disallow entries present | <!-- yes / no / n/a --> | <!-- what is blocked --> |
| Last modified (if detectable) | <!-- date or unknown --> | |

---

## llms.txt Contents (if present)

```
<!-- Paste full llms.txt contents here, or mark as "File not found" -->
```

---

## X-Robots-Tag Header

| Header | Value | Impact |
|---|---|---|
| `X-Robots-Tag` | <!-- value or "not set" --> | <!-- none / blocks indexing / noai --> |
| `noai` directive present | <!-- yes / no --> | <!-- blocks AI crawlers if yes --> |
| `noimageai` directive present | <!-- yes / no --> | <!-- blocks AI image training if yes --> |

---

## Summary

**Crawler access score:** <!-- N / 14 crawlers with full access --> (<!-- % -->)

**Critical issues:**
- <!-- any blocked crawlers that matter most, e.g., GPTBot or ClaudeBot -->
- <!-- any blanket wildcard blocks: "User-agent: * Disallow: /" -->

**Positive signals:**
- <!-- any correct explicit Allow rules for AI crawlers -->
- <!-- llms.txt present and valid -->

---

## Recommended Actions

| Priority | Action | Effort | Impact |
|---|---|---|---|
| P0 | <!-- e.g., "Remove blanket Disallow for GPTBot" --> | Low | Critical |
| P1 | <!-- e.g., "Create llms.txt at domain root" --> | Medium | High |
| P2 | <!-- e.g., "Verify Bingbot access after robots.txt update" --> | Low | Medium |
| P3 | <!-- e.g., "Add llms-full.txt with content index" --> | Medium | Low |
