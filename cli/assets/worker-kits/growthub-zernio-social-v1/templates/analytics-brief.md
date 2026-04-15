# Analytics Brief — [Client Name] · [Project Name]

**Kit:** `growthub-zernio-social-v1`
**Generated:** [YYYY-MM-DD]
**Mode:** [api-live | agent-only | hybrid]
**Version:** `v1`

---

## Period Summary

| Field | Value |
|---|---|
| Period | [YYYY-MM-DD] → [YYYY-MM-DD] |
| Total posts published | [N] |
| Platforms in scope | [comma-separated Zernio slugs] |
| Data source | [Zernio `GET /api/v1/analytics` | client-provided CSV | hybrid] |
| Zernio profile id | [prof_... or `placeholder`] |

---

## Per-Platform Performance

| Platform | Posts | Impressions | Reach | Engagement rate | Follower growth | Link clicks |
|---|---|---|---|---|---|---|
| `instagram` | [N] | [N] | [N] | [N%] | [+N] | [N] |
| `linkedin`  | [N] | [N] | [N] | [N%] | [+N] | [N] |
| `twitter`   | [N] | [N] | [N] | [N%] | [+N] | [N] |

Engagement rate = (likes + comments + shares) / impressions × 100. Platform-normalized.

---

## Top 3 Posts

| clientPostId | Platform | Date | Engagement rate | Why it worked |
|---|---|---|---|---|
| [id] | `instagram` | YYYY-MM-DD | [N%] | [one-sentence hypothesis] |
| [id] | `linkedin` | YYYY-MM-DD | [N%] | [hypothesis] |
| [id] | `twitter` | YYYY-MM-DD | [N%] | [hypothesis] |

---

## Bottom 3 Posts

| clientPostId | Platform | Date | Engagement rate | Hypothesis |
|---|---|---|---|---|
| [id] | `tiktok` | YYYY-MM-DD | [N%] | [hypothesis] |
| [id] | `pinterest` | YYYY-MM-DD | [N%] | [hypothesis] |
| [id] | `threads` | YYYY-MM-DD | [N%] | [hypothesis] |

---

## Inbox Activity (optional)

If `/zernio inbox` was pulled:

| Metric | Value |
|---|---|
| Open conversations (period start) | [N] |
| Open conversations (period end) | [N] |
| Avg first-response time | [minutes] |
| Replies sent | [N] |
| Unresolved threads > 48h | [N] |

---

## Recommendations

3–5 specific, actionable items. Each must name platform, format, posting time, and expected impact.

1. [Recommendation]
2. [Recommendation]
3. [Recommendation]
4. [Recommendation]
5. [Recommendation]

---

## Benchmark Comparison (optional)

If industry benchmarks are provided in the brand kit:

| Platform | Our engagement rate | Benchmark | Delta |
|---|---|---|---|
| `instagram` | [N%] | [N%] | [+/- N pts] |
| `linkedin`  | [N%] | [N%] | [+/- N pts] |

---

## Source Queries

For reproducibility, log the Zernio queries that produced this brief:

```
GET /api/v1/analytics/posts?profileId=<id>&from=<date>&to=<date>
GET /api/v1/analytics/accounts?profileId=<id>&from=<date>&to=<date>
GET /api/v1/inbox?profileId=<id>
```

Never render raw response payloads in this file — summarize only.
