# Content Calendar — [Client Name] · [Project Name]

**Kit:** `growthub-zernio-social-v1`
**Generated:** [YYYY-MM-DD]
**Mode:** [api-live | agent-only | hybrid]
**Version:** `v1`

---

## Calendar Header

| Field | Value |
|---|---|
| Client | [Client Name] |
| Zernio profile id | [prof_... or placeholder] |
| Campaign window | [YYYY-MM-DD] → [YYYY-MM-DD] |
| Platforms | [comma-separated Zernio platform slugs] |
| Posting timezone | [IANA tz] |

---

## Calendar Table

Column contract (one row per scheduled post):

| Date | Day | Platform | Account | Theme | Post Type | Caption Preview | CTA | Media Notes | Status |
|---|---|---|---|---|---|---|---|---|---|
| YYYY-MM-DD | Mon | `instagram` | [@handle or accountId] | [Pillar] | image | [first 100 chars of variant A] | [CTA] | [dims, duration, overlays] | draft |
| YYYY-MM-DD | Mon | `twitter` | [@handle or accountId] | [Pillar] | text | [first 100 chars] | [CTA] | — | draft |
| YYYY-MM-DD | Tue | `linkedin` | [page id or accountId] | [Pillar] | carousel | [first 100 chars] | [CTA] | [slide count + order] | draft |
| ... | | | | | | | | | |

### Rules

- One row per scheduled post
- `Platform` values must exist in `docs/platform-coverage.md`
- `Post Type` must be valid for the platform
- `Caption Preview` is the first 100 characters of the selected variant — full captions live in the Caption Copy Deck
- `CTA` is required and non-empty
- `Media Notes` are required for image/video/carousel/reel/short/story
- `Status` defaults to `draft` and moves to `scheduled` once the manifest is submitted

---

## Posting Cadence Summary

| Platform | Posts / week | Best time window | Notes |
|---|---|---|---|
| `instagram` | [3] | [12:00–13:00 local] | [rationale] |
| `linkedin` | [3] | [08:00–09:30 local] | [rationale] |
| `twitter` | [7] | [spread: 08:00, 12:00, 17:00] | [rationale] |

---

## Theme Pillar Distribution

| Pillar | Count | % of calendar |
|---|---|---|
| [Pillar 1] | [N] | [40%] |
| [Pillar 2] | [N] | [30%] |
| [Pillar 3] | [N] | [20%] |
| [Pillar 4] | [N] | [10%] |

---

## Notes

- Cadence must match the Platform Publishing Plan
- Multi-platform posts spaced ≥30 minutes apart to avoid simultaneous-publishing optics
- Weekend slots default to community / engagement pillars unless client overrides
