# Runtime Assumptions — Postiz Social Scheduler v1

This document defines the runtime boundary for this kit.

---

## OVERVIEW

This kit targets a self-contained local working directory used by an agent operating against one of three execution surfaces:

| Mode | When to use | Assumption |
|---|---|---|
| `local-fork` | local checkout of Postiz is available via Docker or dev mode | repo files can be inspected before planning |
| `browser-hosted` | operator uses a hosted Postiz instance | platform behavior follows the public hosted workflow |
| `api-direct` | operator schedules posts programmatically via Postiz API | API endpoints and auth are configured |

Default planning mode is `local-fork` when a checkout exists. Otherwise use `browser-hosted`.

---

## POSTIZ PLATFORM ASSUMPTIONS

Frozen upstream assumptions for this kit:
- repo is `github.com/gitroomhq/postiz-app` (~28k GitHub stars, MIT license)
- built with NestJS (backend) + Next.js (frontend)
- supports 28+ social platforms including Instagram, LinkedIn, TikTok, X/Twitter, YouTube, Pinterest, Reddit, Slack, Mastodon, Bluesky, Facebook
- BullMQ/Redis job queue handles post scheduling
- multi-workspace and multi-organization support
- AI-powered content generation built in
- public API for programmatic post management
- media upload support (images, videos)
- analytics dashboard for engagement tracking
- Docker Compose is the primary local deployment method

If the local fork differs, the fork wins.

---

## ARCHITECTURE OVERVIEW

### Backend (NestJS)

```text
apps/backend/
├── src/
│   ├── api/          # REST API routes
│   ├── services/     # Business logic
│   └── main.ts       # Entry point
```

### Frontend (Next.js)

```text
apps/frontend/
├── src/
│   ├── components/   # UI components
│   ├── pages/        # Next.js pages
│   └── stores/       # State management
```

### Integrations

```text
libraries/nestjs-libraries/src/integrations/
├── instagram/
├── linkedin/
├── tiktok/
├── twitter/
├── youtube/
├── facebook/
├── reddit/
├── pinterest/
├── mastodon/
├── bluesky/
└── ... (28+ platform adapters)
```

### Job Queue

```text
libraries/nestjs-libraries/src/bull-mq-transport/
├── bull-mq.provider.ts
└── bull-mq.module.ts
```

---

## LOCAL DEPLOYMENT ASSUMPTIONS

### Docker Compose (primary method)

The upstream repo provides a `docker-compose.yml` that starts:
- Postiz app (frontend + backend)
- PostgreSQL database
- Redis (for BullMQ job queue)

Default ports:
- Frontend: `5000`
- Backend API: `3000` (proxied through frontend)
- PostgreSQL: `5432`
- Redis: `6379`

### Dev mode (alternative)

For development, the repo supports:
```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

This starts both frontend and backend in watch mode.

---

## EXECUTION SURFACES

### Local fork

Expected operator flow:
1. inspect `README.md` and `docker-compose.yml`
2. inspect `libraries/nestjs-libraries/src/integrations/` for available platforms
3. inspect `prisma/schema.prisma` for data model
4. inspect API routes for post creation endpoints
5. prepare content calendar, drafts, and scheduling plan
6. execute through the local Postiz UI or API

### Browser-hosted

Expected operator flow:
1. open hosted Postiz instance
2. authenticate and select workspace
3. connect social media accounts
4. create and schedule posts per the content calendar
5. review scheduling queue
6. monitor analytics after posting

### API-direct

Expected operator flow:
1. authenticate via API key or OAuth
2. create posts via `POST /api/posts` endpoints
3. schedule posts with timestamp parameters
4. monitor job queue status
5. collect analytics data

---

## LOCAL STATE ASSUMPTIONS

The Postiz platform maintains:
- workspace and organization data
- connected social media account credentials
- scheduled post queue (BullMQ/Redis)
- media uploads
- analytics history
- AI generation history

The agent should treat these as workflow assets:
- prefer reusing connected accounts over re-authentication
- document which workspace posts target
- track scheduling queue state
- avoid assuming analytics are available immediately after posting

---

## OUTPUT WRITING ASSUMPTION

All deliverables are written as Markdown in:

```text
output/<client-slug>/<campaign-slug>/
```

The kit does not require its own npm install or custom CLI to be operational.
