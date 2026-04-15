# Client Proposal — Growthub · Q2 2026 Agent-Native CLI Launch

**Kit:** `growthub-zernio-social-v1`
**Generated:** 2026-04-15
**Mode:** api-live
**Version:** `v1`

> Internal reference proposal for the Growthub flagship campaign. Demonstrates the expected format and grounding depth for a real client proposal.

---

## Campaign Overview

| Field | Value |
|---|---|
| Client | Growthub |
| Campaign | Q2 2026 Agent-Native CLI Launch |
| Window | 2026-05-01 → 2026-05-30 |
| Primary objective | Community growth (secondary: lead generation via CLI downloads) |
| Platforms in scope | `twitter`, `linkedin`, `bluesky`, `youtube` |

---

## Platform Mix Rationale

| Platform | Role in this campaign | Why selected |
|---|---|---|
| `twitter` | Anchor — daily technical commentary | Developer community is concentrated here; 280-char format fits our voice |
| `linkedin` | B2B thought leadership + hiring signal | Partners and enterprise prospects live here; carousel format amplifies architectural content |
| `bluesky` | Early-adopter tech audience | Strong overlap with the agent-tooling audience; text-first matches Growthub's style |
| `youtube` | Long-form + shorts | Weekly long-form drives durable discovery; shorts feed the algorithm with CLI walkthroughs |

Instagram is deferred until team capacity supports a sustained visual pipeline.

---

## Content Strategy

- **Theme pillars:** Product Builds (35%), Developer Tutorials (30%), Open Source (20%), Community (15%)
- **Format mix:** Threads on X, carousels on LinkedIn, long-form + shorts on YouTube, text on Bluesky
- **Cadence:** X daily, LinkedIn 3×/week, Bluesky 3×/week, YouTube 1 long + 1 short/week
- **Caption approach:** A/B/C variants per post — Variant A direct, B narrative, C question-hook. Selected variant is shipped; all three are logged for client review

---

## Deliverables Scope

| Deliverable | Included | Notes |
|---|---|---|
| Social Campaign Brief | Yes | One-time at campaign start |
| Content Calendar | Yes | 30-day plan, refreshed monthly |
| Platform Publishing Plan | Yes | Per-platform format + time window |
| Caption Copy Deck | Yes | A/B/C variants for every scheduled post |
| Scheduling Manifest | Yes | Zernio-shaped JSON + submission to `POST /api/v1/posts` |
| Recurring Queue | Yes | `weekly-build-log` for weekend community posts |
| Analytics Brief | Monthly | Pulled from `GET /api/v1/analytics/*` |
| Inbox reply coverage | Yes | Unified DMs/comments via `GET /api/v1/inbox` |

---

## Pricing Tiers

| Tier | Scope | Monthly |
|---|---|---|
| Starter | 2 platforms, 3 posts/week, monthly analytics | $2,800 |
| Growth | 4 platforms, daily posts, biweekly analytics, inbox coverage | $5,400 |
| Scale | 6+ platforms, daily posts with queues, weekly analytics, priority inbox | $9,800 |

Growthub's Q2 campaign fits **Growth** (4 platforms, daily posts, biweekly analytics, inbox coverage). Tier may move to Scale in Q3 if Instagram and Threads are added.

---

## ROI Projection

Based on the brand-kit benchmarks and May 2026 forecast (extrapolated from April 2026 baseline):

| KPI | Growth-tier target | Scale-tier upside |
|---|---|---|
| Impressions / month | 300,000 | 520,000 |
| Engagement rate | 4.5% | 5.2% |
| Follower growth | +750 | +1,200 |
| Link clicks | 1,800 | 3,100 |
| CLI downloads attributable to social | +1,000 | +1,800 |

Assumptions: median developer-tool engagement rate ~3.2%; Growthub's recent baseline on X is 3.8%; incremental lift comes from disciplined A/B/C variant shipping and carousel-first on LinkedIn.

---

## Onboarding Plan

1. Connect X, LinkedIn, Bluesky, YouTube inside Zernio (`/api/v1/connect/<platform>`)
2. Confirm `ZERNIO_PROFILE_ID=prof_GRO_primary` and create a read-write API key scoped to it
3. Review and approve Content Theme Pillars in the Social Campaign Brief
4. Approve the Platform Publishing Plan and posting cadence
5. Approve the Caption Copy Deck A/B/C variants (1–2 revision cycles expected)
6. Submit the Scheduling Manifest with `Idempotency-Key = clientPostId`
7. Cadence review at week 4 alongside the first Analytics Brief

---

## Terms

- Content ownership stays with Growthub
- `ZERNIO_API_KEY`, `ANTHROPIC_API_KEY`, and any per-platform OAuth tokens stay inside Growthub's Zernio account and local `.env` — never included in deliverables
- Cancellation: 30-day written notice
- Revisions: two full revision cycles per deliverable included in each tier
