# Postiz Social Media Operator — Master Skill Doc

**Source of truth for methodology. Read this file completely before beginning any task.**

---

## QUICK REFERENCE TABLE

| Resource | Path |
|---|---|
| Agent operating law | `workers/postiz-social-operator/CLAUDE.md` |
| Brand kit template | `brands/_template/brand-kit.md` |
| Growthub example brand kit | `brands/growthub/brand-kit.md` |
| Output contract | `output-standards.md` |
| Runtime assumptions | `runtime-assumptions.md` |
| Fork integration notes | `docs/postiz-fork-integration.md` |
| Platform coverage | `docs/platform-coverage.md` |
| AI caption layer | `docs/ai-caption-layer.md` |
| BullMQ queue layer | `docs/bullmq-queue-layer.md` |
| Social campaign brief | `templates/social-campaign-brief.md` |
| Content calendar | `templates/content-calendar.md` |
| Platform publishing plan | `templates/platform-publishing-plan.md` |
| Caption copy deck | `templates/caption-copy-deck.md` |
| Analytics brief | `templates/analytics-brief.md` |
| Scheduling manifest | `templates/scheduling-manifest.md` |
| Client proposal | `templates/client-proposal.md` |
| Sample campaign | `examples/social-campaign-sample.md` |
| Sample calendar | `examples/content-calendar-sample.md` |
| Sample analytics | `examples/analytics-brief-sample.md` |
| Sample proposal | `examples/client-proposal-sample.md` |

---

## STEP 0 — BEFORE ANY TASK, ANSWER THESE QUESTIONS

Before producing anything, confirm:

1. Which client or brand is this campaign for?
2. Which platforms are in scope (select from `docs/platform-coverage.md`)?
3. What is the campaign objective: brand awareness / lead generation / engagement / product launch / community growth?
4. What is the campaign timeframe and posting cadence?
5. Is the Postiz fork running locally?
6. What execution mode: local-fork / agent-only / hybrid?

If any of these are unknown after the 4-question gate in CLAUDE.md, stop and ask.

---

## STEP 1 — LOAD THE BRAND KIT

Read `brands/<client-slug>/brand-kit.md` if it exists. Otherwise start from `brands/_template/brand-kit.md`.

Extract:
- client identity (name, slug, industry)
- target platforms and primary audience demographics
- content themes and messaging guardrails
- campaign objectives and KPI targets
- competitor accounts for reference
- agency context (prospect stage, retainer range)
- existing deliverables log

The brand kit drives all output naming, tone calibration, platform selection, and proposal pricing context.

---

## STEP 2 — CHECK THE WORKING SUBSTRATE

If the user has a local Postiz fork running, inspect it before planning anything.

### Source-of-truth check in the Postiz workspace

1. `docker compose ps` — confirm all services are up (postiz-app, Redis, PostgreSQL)
2. `curl http://localhost:3000/api/healthcheck` — confirm API responds
3. Postiz admin UI at `http://localhost:3000` — confirm workspace is initialized
4. `libraries/nestjs-libraries/src/integrations/` — platform integrations available
5. Postiz API → `GET /api/v1/workspace` — retrieve workspace ID for scheduling

### What to verify in the fork

- Which platform integrations are connected and authorized in the Postiz admin UI
- Whether the BullMQ Redis queue is healthy (`GET /api/v1/queue/health`)
- Whether AI caption generation is enabled (`OPENAI_API_KEY` or `ANTHROPIC_API_KEY` set in Postiz `.env`)
- What the current workspace posting timezone is set to

If the fork cannot be inspected, use the frozen assumptions in `runtime-assumptions.md` and label outputs `assumption-based`.

---

## STEP 3 — COMMAND SELECTION LOGIC

Select the narrowest command that satisfies the real job.

| Command | Primary Use | Scheduling? | AI Captions? |
|---|---|---|---|
| `/postiz campaign` | Full campaign from scratch — brief + calendar + publishing plan + captions | Optional | Yes |
| `/postiz calendar` | Content calendar for an existing brief | No | Partial |
| `/postiz captions` | Caption copy deck only — batch or single platform | No | Yes |
| `/postiz schedule` | Scheduling manifest from an existing calendar | Yes | No |
| `/postiz analytics` | Analytics briefing from API data or provided metrics | No | No |
| `/postiz proposal` | Client-ready proposal with platform mix and ROI | No | No |
| `/postiz platforms` | Platform coverage report for client context | No | No |
| `/postiz quick` | 30-second campaign snapshot for a domain or brand | No | Minimal |

Default selection rules:
- "Build a campaign" → `/postiz campaign`
- "Draft captions for my posts" → `/postiz captions`
- "Schedule my content calendar" → `/postiz schedule`
- "How did my posts perform?" → `/postiz analytics`
- "Pitch this to the client" → `/postiz proposal`
- "What platforms should I be on?" → `/postiz platforms`

---

## STEP 4 — PLATFORM SELECTION LOGIC

Select platforms based on: audience demographics, campaign objective, content format, and client capacity.

### Primary platform selection rules

| Objective | Recommended Primary Platforms |
|---|---|
| Brand awareness | Instagram, TikTok, YouTube |
| Lead generation | LinkedIn, X/Twitter, Facebook |
| Community growth | Reddit, Discord, Slack |
| Product launch | Instagram, TikTok, X/Twitter, YouTube |
| Thought leadership | LinkedIn, X/Twitter, Bluesky |
| Local business | Facebook, Instagram, Google Business |

### Platform capacity rules

- Limit active platforms to 5 per campaign unless client explicitly has team capacity for more
- Always check `docs/platform-coverage.md` for per-platform format constraints before assigning content types
- Carousel posts: available on Instagram, LinkedIn, Pinterest — not TikTok or X
- Long-form video (>10 min): YouTube only — short-form elsewhere
- Thread format: X/Twitter, Bluesky, Mastodon

---

## STEP 5 — CAPTION GENERATION LOGIC

Apply the AI caption layer for every content calendar entry.

### Caption workflow

1. Extract key message from content theme pillar
2. Identify platform tone profile from `docs/ai-caption-layer.md`
3. Draft 3 variants (A/B/C):
   - Variant A: Direct and factual
   - Variant B: Storytelling or narrative
   - Variant C: Question or engagement-hook opening
4. Apply platform character limits:
   - X/Twitter: 280 characters (aim for ≤240 for re-share space)
   - LinkedIn: 3,000 characters (optimal engagement at 150–300 characters for opening)
   - Instagram: 2,200 characters (optimal: ≤150 characters above "more" fold)
   - TikTok: 2,200 characters (most engagement in first 150 characters)
   - Pinterest: 500 character description
   - Reddit: Variable by subreddit — default to long-form
   - Bluesky: 300 characters
   - Mastodon: 500 characters (instance-configurable)
5. Add hashtag sets (platform-appropriate quantity):
   - Instagram: 3–5 primary hashtags (moved away from 30-hashtag practice)
   - LinkedIn: 3–5 relevant professional hashtags
   - TikTok: 3–6 hashtags mixing trending and niche
   - Pinterest: 2–3 keyword-focused hashtags
   - X/Twitter: 1–2 hashtags maximum
   - Bluesky: None required (use in context only)
6. Flag any captions that require visual assets with specific format requirements

---

## STEP 6 — CONTENT CALENDAR STRUCTURE

The content calendar template produces one row per scheduled post.

### Required columns

| Column | Content | Rules |
|---|---|---|
| Date | YYYY-MM-DD | Must fall within campaign window |
| Day | Weekday name | Include for readability |
| Platform | Platform slug (from coverage doc) | Must be in approved platform list |
| Content Theme | Theme pillar name | Must be one of 3–5 defined pillars |
| Post Type | image / video / carousel / text / reel / story | Must be valid for that platform |
| Caption Preview | First 100 characters of selected variant | Do not paste full caption |
| CTA | Call-to-action phrase | Required — never "N/A" |
| Media Notes | Asset requirements, dimensions, duration | Required for image/video/carousel |
| Status | draft / approved / scheduled / published | Default: draft |

### Cadence rules

- Minimum 3 posts per week per platform for meaningful growth signal
- Maximum 3 posts per day per platform to avoid feed fatigue
- Space multi-platform posts by at least 30 minutes to avoid simultaneous publishing optics
- Reserve weekends for engagement/community posts rather than promotional content unless client specifies otherwise

---

## STEP 7 — SCHEDULING MANIFEST FORMAT

See `docs/bullmq-queue-layer.md` for full format specification.

Quick format reference:

```json
{
  "postizSchedulingManifest": {
    "version": "1.0",
    "workspaceId": "<postiz-workspace-uuid>",
    "generatedAt": "<ISO-8601-timestamp>",
    "posts": [
      {
        "postId": "<client-slug>-<YYYYMMDD>-<platform>-<sequence>",
        "platform": "<postiz-platform-id>",
        "scheduledAt": "<ISO-8601-timestamp>",
        "content": "<selected-caption-variant>",
        "mediaAssets": [],
        "status": "pending"
      }
    ]
  }
}
```

---

## STEP 8 — ANALYTICS BRIEFING LOGIC

When analytics data is provided (from Postiz API export or client-provided metrics):

### Required metrics to collect per platform

| Metric | Source | Notes |
|---|---|---|
| Impressions | Postiz analytics or platform export | Total times content was displayed |
| Reach | Platform native | Unique accounts that saw the content |
| Engagement rate | Calculated: (likes + comments + shares) / impressions × 100 | Platform-normalized |
| Follower growth | Platform native | Net new followers during period |
| Link clicks | Postiz UTM tracking or platform bio links | Only for platforms with link support |
| Top posts | By engagement rate, not raw likes | Surface the 3 best-performing posts |

### Analytics briefing structure

1. Period summary (date range, total posts published, platforms)
2. Per-platform performance table (all collected metrics)
3. Top 3 performing posts (with engagement rate, format, theme pillar)
4. Bottom 3 performing posts (with failure mode hypothesis)
5. Recommendations (3–5 actionable items for next period)
6. Benchmark comparison (if industry benchmarks are available from brand kit)

---

## STEP 9 — OUTPUT ORDER

Produce artifacts in this strict order:

1. Social Campaign Brief (`templates/social-campaign-brief.md`)
2. Content Calendar (`templates/content-calendar.md`)
3. Platform Publishing Plan (`templates/platform-publishing-plan.md`)
4. Caption Copy Deck (`templates/caption-copy-deck.md`)
5. Scheduling Manifest (`templates/scheduling-manifest.md`) — only if scheduling requested
6. Analytics Brief (`templates/analytics-brief.md`) — only if analytics data available
7. Client Proposal (`templates/client-proposal.md`) — only if requested

---

## STEP 10 — QUALITY BAR

Good output looks like this:

- All platform IDs match the official list in `docs/platform-coverage.md` — no invented platform slugs
- All caption variants respect the character limits for their target platform
- Content calendar rows contain no empty CTAs — every post must have an explicit call to action
- Scheduling manifest timestamps are in ISO 8601 format and fall within the campaign window
- Analytics briefings derive all metrics from provided data — no invented engagement rates
- Client proposals ground ROI projections in documented platform benchmark data
- Every output file can be handed to an operator or client and acted on immediately
- No filler paragraphs — every sentence either presents data, explains a constraint, or specifies an action
