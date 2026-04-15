# Social Campaign Brief — [Client Name] · [Project Name]

**Kit:** `growthub-zernio-social-v1`
**Generated:** [YYYY-MM-DD]
**Mode:** [api-live | agent-only | hybrid]
**Version:** `v1`

---

## Project Overview

| Field | Value |
|---|---|
| Client | [Client Name] |
| Project | [Project Name] |
| Campaign window | [YYYY-MM-DD] → [YYYY-MM-DD] |
| Zernio profile id | [prof_...] or `placeholder` in agent-only mode |
| Posting timezone | [IANA tz name, e.g., America/New_York] |

---

## Campaign Objective

**Primary:** [brand awareness | lead generation | engagement | product launch | community growth]

**Why this objective:** [One paragraph grounded in the brand kit's current stage and retainer context.]

---

## Target Platforms

| Platform | Zernio ID | Account | Rationale |
|---|---|---|---|
| [Instagram] | `instagram` | [@handle or accountId] | [Why selected — demographics, format fit, client capacity] |
| [LinkedIn]  | `linkedin`  | [company page or accountId] | [Why selected] |
| [X/Twitter] | `twitter`   | [@handle] | [Why selected] |

Max 5 platforms unless the brand kit documents the team capacity to support more.

---

## Audience Profile

### Primary

| Attribute | Value |
|---|---|
| Age range | [range] |
| Geography | [regions or countries] |
| Interests | [top 3–5] |
| Pain points | [top 3] |
| Content preferences | [formats + topics] |

### Secondary

| Attribute | Value |
|---|---|
| Age range | [range] |
| Platforms | [where they are concentrated] |
| Interests | [top 2–3] |

---

## KPI Targets

| KPI | Metric | Target | Timeline |
|---|---|---|---|
| [Brand awareness] | [Impressions] | [50,000/month] | [Month 1] |
| [Engagement] | [Engagement rate] | [≥3%] | [Rolling] |
| [Lead generation] | [Link clicks] | [200/month] | [Month 1] |

---

## Content Theme Pillars

| Pillar | Description | % of calendar | Primary platforms |
|---|---|---|---|
| [Pillar 1] | [One-sentence definition] | [40%] | [platforms] |
| [Pillar 2] | [Definition] | [30%] | [platforms] |
| [Pillar 3] | [Definition] | [20%] | [platforms] |
| [Pillar 4] | [Definition] | [10%] | [platforms] |

---

## Brand Voice Summary

| Attribute | Spec |
|---|---|
| Tone | [From brand kit] |
| Words to use | [Top 5–8] |
| Words to avoid | [Top 5–8] |
| Emoji rule | [Per platform] |
| CTA style | [From brand kit] |

---

## Execution Notes

- Caption variants: 3 per post (A direct, B narrative, C question/hook)
- Every write request to Zernio uses `Idempotency-Key = clientPostId`
- `dryRun` is `[true/false]` based on execution mode
- Manifest submission order: media uploads → posts → (optional) queue creation
