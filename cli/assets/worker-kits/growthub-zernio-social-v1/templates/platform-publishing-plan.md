# Platform Publishing Plan — [Client Name] · [Project Name]

**Kit:** `growthub-zernio-social-v1`
**Generated:** [YYYY-MM-DD]
**Mode:** [api-live | agent-only | hybrid]
**Version:** `v1`

---

## Per-Platform Rows

Produce one row per platform in scope. Every field is required.

### [Platform — e.g., Instagram]

| Field | Value |
|---|---|
| Zernio platform id | `instagram` |
| Zernio account id | [acc_ig_... or `placeholder_@handle` in agent-only] |
| Format mix | [e.g., 40% reels, 30% carousel, 20% single image, 10% story] |
| Posting frequency | [e.g., 3/week + daily stories] |
| Best posting times (local) | [e.g., Tue 12:00, Thu 12:00, Sat 10:30] |
| Primary theme pillars | [pillar names] |
| Caption length target | [e.g., 125–150 chars above the fold] |
| Hashtag count | [e.g., 3–5 primary] |
| Content mix rationale | [One paragraph: why this mix fits the audience and objective] |

### [Platform — e.g., LinkedIn]

| Field | Value |
|---|---|
| Zernio platform id | `linkedin` |
| Zernio account id | [page id or accountId] |
| Format mix | [e.g., 50% text+image, 30% document carousel, 20% video] |
| Posting frequency | [e.g., 3/week] |
| Best posting times (local) | [e.g., Tue 08:30, Wed 08:30, Thu 08:30] |
| Primary theme pillars | [pillar names] |
| Caption length target | [e.g., 1,200–2,000 chars for thought leadership] |
| Hashtag count | [e.g., 3–5 professional] |
| Content mix rationale | [One paragraph] |

### [Platform — e.g., X/Twitter]

| Field | Value |
|---|---|
| Zernio platform id | `twitter` |
| Zernio account id | [acc_x_...] |
| Format mix | [e.g., 60% text, 25% image, 15% thread] |
| Posting frequency | [e.g., 7/week] |
| Best posting times (local) | [e.g., 08:00, 12:00, 17:00] |
| Primary theme pillars | [pillar names] |
| Caption length target | [e.g., 200–240 chars] |
| Hashtag count | [1–2] |
| Content mix rationale | [One paragraph] |

---

## Cross-Platform Orchestration

| Rule | Value |
|---|---|
| Minimum gap between simultaneous posts | 30 minutes |
| Collision check | Run against `GET /api/v1/posts?status=scheduled` before submission |
| Queue in use | [queue name or `none`] |
| Default timezone | [IANA tz] |

---

## Queue Coverage (if applicable)

| Queue name | Platforms covered | Slots per week |
|---|---|---|
| [weekly-evergreen] | [twitter, linkedin] | [3] |
| [daily-visual] | [instagram] | [5] |

If queues are used, posts scheduled into a queue omit `scheduledFor` from the Zernio body and include `queueId` — see `docs/posts-and-queues-layer.md`.

---

## Go-Live Checklist

- [ ] Every platform in this plan is connected on the Zernio profile
- [ ] Every `accountId` is a real Zernio id (live mode) or a documented placeholder (agent-only)
- [ ] Posting windows cross-checked against existing scheduled posts
- [ ] Hashtag and caption rules match `docs/ai-caption-layer.md`
- [ ] Client approved the plan before any write requests are issued
