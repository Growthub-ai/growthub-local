# Zernio Social Media Operator — Master Skill Doc

**Source of truth for methodology. Read this file completely before beginning any task.**

---

## QUICK REFERENCE TABLE

| Resource | Path |
|---|---|
| Agent operating law | `workers/zernio-social-operator/CLAUDE.md` |
| Brand kit template | `brands/_template/brand-kit.md` |
| Growthub example brand kit | `brands/growthub/brand-kit.md` |
| Output contract | `output-standards.md` |
| Runtime assumptions | `runtime-assumptions.md` |
| Zernio API integration | `docs/zernio-api-integration.md` |
| Platform coverage | `docs/platform-coverage.md` |
| AI caption layer | `docs/ai-caption-layer.md` |
| Posts + queues layer | `docs/posts-and-queues-layer.md` |
| Growthub Agentic UI shell | `docs/growthub-agentic-social-platform-ui-shell.md` |
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
5. Is `ZERNIO_API_KEY` present and valid (`api-live` or `hybrid` mode) or is this `agent-only`?
6. Which `ZERNIO_PROFILE_ID` owns the target social accounts?

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

If the user has a valid `ZERNIO_API_KEY`, inspect the live account before planning anything.

### Source-of-truth checks against the Zernio API

1. `GET /api/v1/profiles` — confirm the API key authenticates and list available profiles
2. `GET /api/v1/profiles/<ZERNIO_PROFILE_ID>` — confirm the target profile exists
3. `GET /api/v1/accounts?profileId=<id>` — list connected platforms on that profile
4. `GET /api/v1/queues?profileId=<id>` — check for existing recurring queues and time slots
5. `GET /api/v1/posts?profileId=<id>&status=scheduled` — inspect currently scheduled posts to avoid collisions

All calls use header `Authorization: Bearer ${ZERNIO_API_KEY}`.

### What to verify before planning

- Which platform integrations are connected and authorized on the profile
- What the profile's default posting timezone is
- Whether any queues already exist and are actively publishing
- Whether the API key has `read-write` permission (required for scheduling) or only `read`

If the API cannot be reached, use the frozen assumptions in `runtime-assumptions.md` and label outputs `assumption-based` and `dryRun: true`.

---

## STEP 3 — COMMAND SELECTION LOGIC

Select the narrowest command that satisfies the real job.

| Command | Primary Use | Scheduling? | AI Captions? |
|---|---|---|---|
| `/zernio campaign` | Full campaign from scratch — brief + calendar + publishing plan + captions | Optional | Yes |
| `/zernio calendar` | Content calendar for an existing brief | No | Partial |
| `/zernio captions` | Caption copy deck only — batch or single platform | No | Yes |
| `/zernio schedule` | Scheduling manifest from an existing calendar | Yes | No |
| `/zernio queue` | Define or update a recurring queue (time slots) | Yes (recurring) | No |
| `/zernio analytics` | Analytics briefing from API data or provided metrics | No | No |
| `/zernio inbox` | Draft replies for DMs, comments, reviews via unified inbox | No | Yes |
| `/zernio proposal` | Client-ready proposal with platform mix and ROI | No | No |
| `/zernio platforms` | Platform coverage report for client context | No | No |
| `/zernio quick` | 30-second campaign snapshot for a domain or brand | No | Minimal |

Default selection rules:

- "Build a campaign" → `/zernio campaign`
- "Draft captions for my posts" → `/zernio captions`
- "Schedule my content calendar" → `/zernio schedule`
- "Set up a recurring posting plan" → `/zernio queue`
- "How did my posts perform?" → `/zernio analytics`
- "Reply to my DMs and comments" → `/zernio inbox`
- "Pitch this to the client" → `/zernio proposal`
- "What platforms should I be on?" → `/zernio platforms`

---

## STEP 4 — PLATFORM SELECTION LOGIC

Select platforms based on: audience demographics, campaign objective, content format, and client capacity.

### Primary platform selection rules

| Objective | Recommended Primary Platforms |
|---|---|
| Brand awareness | Instagram, TikTok, YouTube |
| Lead generation | LinkedIn, X/Twitter, Facebook |
| Community growth | Reddit, Threads, Bluesky |
| Product launch | Instagram, TikTok, X/Twitter, YouTube |
| Thought leadership | LinkedIn, X/Twitter, Bluesky |
| Local business | Facebook, Instagram, Google Business |
| Direct conversation | Telegram, WhatsApp |

### Platform capacity rules

- Limit active platforms to 5 per campaign unless client explicitly has team capacity for more
- Always check `docs/platform-coverage.md` for per-platform format constraints before assigning content types
- Carousel posts: available on Instagram, LinkedIn, Pinterest, Facebook — not TikTok, X, or Bluesky
- Long-form video (>10 min): YouTube only — short-form elsewhere
- Thread format: X/Twitter, Bluesky, Threads
- Local-only: Google Business (tie to physical location verified inside Zernio)
- Messaging-only: Telegram, WhatsApp (require follower opt-in through the Zernio-connected account)

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
4. Apply platform character limits (full table in `docs/platform-coverage.md`):
   - X/Twitter: 280 characters (aim for ≤240 for re-share space)
   - LinkedIn: 3,000 characters (optimal engagement at 150–300 for opening)
   - Instagram: 2,200 characters (optimal: ≤150 above "more" fold)
   - TikTok: 2,200 characters (engagement hook in first 150)
   - Pinterest: 500 character description
   - Reddit: Variable by subreddit — default to long-form
   - Bluesky: 300 characters
   - Threads: 500 characters
   - Google Business: 1,500 characters
   - Telegram: 4,096 characters
   - WhatsApp: 1,024 characters
5. Add hashtag sets (platform-appropriate quantity):
   - Instagram: 3–5 primary hashtags
   - LinkedIn: 3–5 relevant professional hashtags
   - TikTok: 3–6 mixing trending and niche
   - Pinterest: 2–3 keyword-focused
   - X/Twitter: 1–2 maximum
   - Bluesky / Threads: none required (use in context only)
   - Google Business / Telegram / WhatsApp: none — discouraged by platform
6. Flag any captions that require visual assets with specific format requirements

---

## STEP 6 — CONTENT CALENDAR STRUCTURE

The content calendar template produces one row per scheduled post.

### Required columns

| Column | Content | Rules |
|---|---|---|
| Date | YYYY-MM-DD | Must fall within campaign window |
| Day | Weekday name | Include for readability |
| Platform | Zernio platform slug (from coverage doc) | Must be in approved platform list |
| Account | Zernio account id or handle | Must match an account under the active profile |
| Content Theme | Theme pillar name | Must be one of 3–5 defined pillars |
| Post Type | image / video / carousel / text / reel / short / story | Must be valid for that platform |
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

See `docs/posts-and-queues-layer.md` for full format specification. Every manifest is shaped to be a valid body for one or many `POST https://zernio.com/api/v1/posts` calls (one Zernio post per manifest entry; each post fans out to one or more platform+account tuples).

Quick format reference:

```json
{
  "zernioSchedulingManifest": {
    "version": "1.0",
    "profileId": "<ZERNIO_PROFILE_ID>",
    "timezone": "America/New_York",
    "dryRun": false,
    "generatedAt": "<ISO-8601-timestamp>",
    "posts": [
      {
        "clientPostId": "<client-slug>-<YYYYMMDD>-<sequence>",
        "content": "<selected-caption-variant>",
        "scheduledFor": "<ISO-8601-timestamp>",
        "timezone": "America/New_York",
        "media": [{ "mediaId": "<zernio-media-id>" }],
        "platforms": [
          { "platform": "twitter",  "accountId": "<zernio-account-id>" },
          { "platform": "linkedin", "accountId": "<zernio-account-id>" }
        ],
        "status": "pending"
      }
    ]
  }
}
```

In `agent-only` mode, set `dryRun: true` and use placeholder `accountId` values tagged with the account handle for the user to resolve later.

Every `POST /api/v1/posts` request must carry an `Idempotency-Key` header set to the entry's `clientPostId`. This makes re-submitting the manifest safe after partial failures.

---

## STEP 8 — RECURRING QUEUE FORMAT

Zernio also supports recurring posting queues — time slots on a profile that auto-schedule added posts. Use `/zernio queue` to manage them.

Minimum queue definition the operator must produce (see `docs/posts-and-queues-layer.md` for full format):

```json
{
  "zernioQueue": {
    "profileId": "<ZERNIO_PROFILE_ID>",
    "name": "<queue-name>",
    "timezone": "America/New_York",
    "slots": [
      { "day": "mon", "time": "09:00", "platforms": ["twitter", "linkedin"] },
      { "day": "wed", "time": "12:30", "platforms": ["instagram"] },
      { "day": "fri", "time": "17:00", "platforms": ["bluesky", "threads"] }
    ]
  }
}
```

Queues target `POST /api/v1/queues` (create) or `PUT /api/v1/queues/<queueId>` (update). Posts attached to a queue are scheduled into the next available slot — `scheduledFor` is omitted from the post body.

---

## STEP 9 — ANALYTICS BRIEFING LOGIC

When analytics data is provided (from `GET /api/v1/analytics` or client-provided metrics):

### Required metrics to collect per platform

| Metric | Source | Notes |
|---|---|---|
| Impressions | Zernio analytics or platform export | Total times content was displayed |
| Reach | Platform native via Zernio pass-through | Unique accounts that saw the content |
| Engagement rate | Calculated: (likes + comments + shares) / impressions × 100 | Platform-normalized |
| Follower growth | Platform native via Zernio | Net new followers during period |
| Link clicks | Zernio UTM tracking or platform bio links | Only for platforms with link support |
| Top posts | By engagement rate, not raw likes | Surface the 3 best-performing posts |
| Inbox activity | `GET /api/v1/inbox` | Open conversations, response rate |

### Analytics briefing structure

1. Period summary (date range, total posts published, platforms)
2. Per-platform performance table (all collected metrics)
3. Top 3 performing posts (with engagement rate, format, theme pillar)
4. Bottom 3 performing posts (with failure mode hypothesis)
5. Recommendations (3–5 actionable items for next period)
6. Benchmark comparison (if industry benchmarks are available from brand kit)

---

## STEP 10 — OUTPUT ORDER

Produce artifacts in this strict order:

1. Social Campaign Brief (`templates/social-campaign-brief.md`)
2. Content Calendar (`templates/content-calendar.md`)
3. Platform Publishing Plan (`templates/platform-publishing-plan.md`)
4. Caption Copy Deck (`templates/caption-copy-deck.md`)
5. Scheduling Manifest (`templates/scheduling-manifest.md`) — only if scheduling requested
6. Analytics Brief (`templates/analytics-brief.md`) — only if analytics data available
7. Client Proposal (`templates/client-proposal.md`) — only if requested

---

## QUALITY BAR

Good output looks like this:

- All platform IDs match the official list in `docs/platform-coverage.md` — no invented platform slugs
- All caption variants respect the character limits for their target platform
- Content calendar rows contain no empty CTAs — every post must have an explicit call to action
- Scheduling manifest timestamps are in ISO 8601 format with timezone, and fall within the campaign window
- Every platform referenced in the manifest is backed by a real Zernio account id (or a clearly-placeholdered handle in `dryRun: true` mode)
- Analytics briefings derive all metrics from provided data — no invented engagement rates
- Client proposals ground ROI projections in documented platform benchmark data
- Every output file can be handed to an operator or client and acted on immediately
- No filler paragraphs — every sentence either presents data, explains a constraint, or specifies an action
- No secrets in outputs: `ZERNIO_API_KEY`, `ANTHROPIC_API_KEY`, or OAuth tokens are never rendered into deliverables
