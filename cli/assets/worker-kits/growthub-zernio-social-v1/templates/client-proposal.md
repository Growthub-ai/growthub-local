# Client Proposal — [Client Name] · [Campaign Name]

**Kit:** `growthub-zernio-social-v1`
**Generated:** [YYYY-MM-DD]
**Mode:** [api-live | agent-only | hybrid]
**Version:** `v1`

---

## Campaign Overview

| Field | Value |
|---|---|
| Client | [Client Name] |
| Campaign | [Campaign Name] |
| Window | [YYYY-MM-DD] → [YYYY-MM-DD] |
| Primary objective | [brand awareness | lead generation | engagement | product launch | community growth] |
| Platforms in scope | [comma-separated Zernio slugs] |

---

## Platform Mix Rationale

| Platform | Role in this campaign | Why selected |
|---|---|---|
| `instagram` | [Primary visual channel] | [Audience fit + content format fit] |
| `linkedin` | [B2B thought leadership] | [Rationale] |
| `twitter` | [Real-time voice + community] | [Rationale] |

---

## Content Strategy

- Theme pillars: [list]
- Format mix: [Per platform]
- Cadence: [Summary table reference to Platform Publishing Plan]
- Caption approach: A/B/C variants per post — see Caption Copy Deck

---

## Deliverables Scope

| Deliverable | Included | Notes |
|---|---|---|
| Social Campaign Brief | Yes | One per campaign |
| Content Calendar | Yes | 30 / 60 / 90 day |
| Platform Publishing Plan | Yes | One per campaign |
| Caption Copy Deck | Yes | A/B/C variants for every scheduled post |
| Scheduling Manifest | Yes | Zernio-shaped JSON + submission to `POST /api/v1/posts` |
| Recurring Queue | Optional | Only when campaign uses evergreen slots |
| Analytics Brief | Monthly | Pulled from Zernio API |
| Inbox reply coverage | Optional | DMs + comments + reviews via unified inbox |

---

## Pricing Tiers

| Tier | Scope | Monthly |
|---|---|---|
| Starter | 2 platforms, 3 posts/week, monthly analytics | $[X] |
| Growth | 4 platforms, daily posts, biweekly analytics, inbox coverage | $[X] |
| Scale | 6+ platforms, daily posts with queues, weekly analytics, priority inbox | $[X] |

All tiers include the full deliverable set scoped to the platform count.

---

## ROI Projection

Ground every number in documented platform benchmarks (see brand kit and `docs/platform-coverage.md`). Never invent metrics.

| KPI | Tier 1 target | Tier 2 target | Tier 3 target |
|---|---|---|---|
| Impressions / month | [N] | [N] | [N] |
| Engagement rate | [N%] | [N%] | [N%] |
| Follower growth | [+N] | [+N] | [+N] |
| Link clicks | [N] | [N] | [N] |

---

## Onboarding Plan

1. Connect target social accounts inside Zernio (`/api/v1/connect/<platform>`)
2. Confirm `ZERNIO_PROFILE_ID` and scope of the API key
3. Review Content Theme Pillars in the Social Campaign Brief
4. Approve the Platform Publishing Plan and cadence
5. Approve the Caption Copy Deck (A/B/C variants)
6. Submit the Scheduling Manifest to Zernio with `Idempotency-Key` per post
7. Cadence review at week 4 alongside the first Analytics Brief

---

## Terms

- Ownership of all content stays with the client
- API key and account credentials stay inside the client's Zernio account
- The operator never stores raw Zernio API keys or OAuth tokens
- Cancellation: [standard terms from retainer agreement]
