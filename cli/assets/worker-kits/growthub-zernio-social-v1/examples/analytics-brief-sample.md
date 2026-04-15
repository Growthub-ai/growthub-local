# Analytics Brief — Growthub · Q2 2026 Agent-Native CLI Launch

**Kit:** `growthub-zernio-social-v1`
**Generated:** 2026-06-02
**Mode:** api-live
**Version:** `v1`

---

## Period Summary

| Field | Value |
|---|---|
| Period | 2026-05-01 → 2026-05-30 |
| Total posts published | 82 |
| Platforms in scope | `twitter`, `linkedin`, `bluesky`, `youtube` |
| Data source | Zernio `GET /api/v1/analytics/posts` + `GET /api/v1/analytics/accounts` |
| Zernio profile id | prof_GRO_primary |

---

## Per-Platform Performance

| Platform | Posts | Impressions | Reach | Engagement rate | Follower growth | Link clicks |
|---|---|---|---|---|---|---|
| `twitter` | 30 | 184,000 | 92,300 | 4.1% | +438 | 1,240 |
| `linkedin` | 12 | 31,200 | 18,400 | 5.6% | +126 | 614 |
| `bluesky` | 13 | 22,800 | 14,100 | 6.9% | +215 | 310 |
| `youtube` | 9 videos (6 shorts, 3 long) | 64,500 | — | 7.2% (likes+comments / views) | +71 | — |

Engagement rate = (likes + comments + shares) / impressions × 100, normalized per platform.

---

## Top 3 Posts

| clientPostId | Platform | Date | Engagement rate | Why it worked |
|---|---|---|---|---|
| `growthub-20260514-022` | `twitter` | 2026-05-14 | 9.4% | Step-by-step thread on shipping a full campaign end-to-end landed on Hacker News; reply chain drove 60% of the engagement |
| `growthub-20260501-001` | `twitter` | 2026-05-01 | 8.2% | Launch-day thread — `Agent Harness production-ready` framing matched developer Twitter's appetite for concrete builds |
| `growthub-20260512-019` | `linkedin` | 2026-05-12 | 7.8% | Open-source maturity ladder carousel; carousel format on LinkedIn consistently beats plain text for diagram-driven content |

---

## Bottom 3 Posts

| clientPostId | Platform | Date | Engagement rate | Hypothesis |
|---|---|---|---|---|
| `growthub-20260509-018` | `twitter` | 2026-05-09 | 0.9% | Weekend "what are you building" prompt — low re-share fuel, generic CTA. Replace with a pinned answer-question format next cycle. |
| `growthub-20260517-026` | `bluesky` | 2026-05-17 | 1.6% | Sunday OSS spotlight posted after 20:00 local — Bluesky's text feed benefits from morning placement; re-slot to 10:00. |
| `growthub-20260523-032` | `linkedin` | 2026-05-23 | 1.8% | Long-form text without visual on Saturday; LinkedIn engagement dips on weekends. Move weekend posts to X only. |

---

## Inbox Activity

| Metric | Value |
|---|---|
| Open conversations (period start) | 6 |
| Open conversations (period end) | 9 |
| Avg first-response time | 38 minutes |
| Replies sent | 64 |
| Unresolved threads > 48h | 2 |

Pulled via `GET /api/v1/inbox?profileId=prof_GRO_primary`.

---

## Recommendations

1. **X/Twitter — double down on step-by-step threads.** Posts 22 and 01 each cleared 8% engagement. Schedule one full walkthrough thread per week anchored to a CLI command; target Thursday 12:00 local.
2. **LinkedIn — move to carousel-first.** Carousel posts outperformed plain text by ~2.4× in this period. Convert the next three planned LinkedIn text posts into 5-slide carousels sized 1080×1080.
3. **Bluesky — shift OSS spotlight to Sunday 10:00.** Data shows ≥2× engagement lift for morning placement versus evening on this audience.
4. **Weekend cadence — concentrate on X only.** LinkedIn and Bluesky weekend posts underperform. Free that capacity for 1 extra X post per weekend instead.
5. **YouTube Shorts — add captions-on by default.** Shorts with burned-in captions hit 7.9% engagement; shorts without hit 4.3%. Standardize captions-on in the platform publishing plan.

---

## Benchmark Comparison

| Platform | Our engagement rate | Benchmark (developer-tool peers) | Delta |
|---|---|---|---|
| `twitter` | 4.1% | 3.2% | +0.9 pts |
| `linkedin` | 5.6% | 4.0% | +1.6 pts |
| `bluesky` | 6.9% | 5.5% | +1.4 pts |

Benchmarks sourced from the brand kit's benchmark table.

---

## Source Queries

```
GET /api/v1/analytics/posts?profileId=prof_GRO_primary&from=2026-05-01&to=2026-05-30
GET /api/v1/analytics/accounts?profileId=prof_GRO_primary&from=2026-05-01&to=2026-05-30
GET /api/v1/inbox?profileId=prof_GRO_primary
```
