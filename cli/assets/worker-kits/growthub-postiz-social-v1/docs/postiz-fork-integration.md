# Postiz Fork Integration

**How this kit integrates with the Postiz open-source social media platform.**

---

## What Postiz Is

[Postiz](https://github.com/gitroomhq/postiz-app) is an open-source, self-hosted social media scheduling and automation platform built on NestJS + Next.js. It supports 28+ social media platforms and ships with a BullMQ job queue, multi-workspace management, AI caption generation, media upload, and a public REST API.

GitHub: https://github.com/gitroomhq/postiz-app
License: MIT
Stars: ~28,000+ (as of kit creation)

---

## Integration Architecture

```
growthub-postiz-social-v1 (this kit)
  │
  ├── workers/postiz-social-operator/CLAUDE.md
  │     Agent operating law — drives campaign planning, caption drafts,
  │     scheduling manifest generation, and analytics briefing
  │
  ├── setup/clone-fork.sh
  │     Clones gitroomhq/postiz-app → ~/postiz-app
  │     Runs docker compose up -d (starts Postiz + Redis + PostgreSQL)
  │     Waits for API healthcheck at http://localhost:3000/api/healthcheck
  │
  ├── setup/verify-env.mjs
  │     Checks fork existence, API reachability, POSTIZ_WORKSPACE_ID, ANTHROPIC_API_KEY
  │
  └── templates/scheduling-manifest.md
        BullMQ-compatible JSON manifest format for bulk post scheduling
        via POST /api/v1/posts/bulk
```

---

## Service Topology

When running in local-fork mode, Postiz operates as a Docker Compose stack:

```
postiz-app container (port 3000)
  ├── NestJS API (apps/backend/)         ← REST API, BullMQ job scheduler
  └── Next.js Frontend (apps/frontend/)  ← Admin UI, calendar view, analytics

postiz-redis container (port 6379)
  └── Redis                              ← BullMQ queue backend, session cache

postiz-postgres container (port 5432)
  └── PostgreSQL                         ← Posts, workspaces, platform credentials, analytics
```

All services are defined in `docker-compose.yml` at the fork root.

---

## Postiz API — Key Endpoints Used By This Kit

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/healthcheck` | GET | Verify Postiz is running |
| `/api/v1/workspace` | GET | Retrieve workspace ID and metadata |
| `/api/v1/posts/bulk` | POST | Submit scheduling manifest |
| `/api/v1/posts/{id}` | GET | Verify a scheduled post |
| `/api/v1/analytics` | GET | Retrieve engagement analytics |
| `/api/v1/queue/health` | GET | Check BullMQ queue health |
| `/api/v1/posts/ai/generate` | POST | AI caption generation (Postiz-side) |

Authentication is via JWT bearer token. Obtain from Postiz admin UI → Settings → API Keys.

---

## Platform Integration Layer

Platform integrations live under `libraries/nestjs-libraries/src/integrations/` in the Postiz repo. Each integration file:
- Defines the OAuth flow for connecting the platform account
- Implements `post()` for publishing content
- Implements `analytics()` for pulling engagement data
- Declares the integration ID (used as the `platform` field in scheduling manifests)

When this kit generates a scheduling manifest, platform IDs must match the integration IDs in the running Postiz instance. See `docs/platform-coverage.md` for the full list.

---

## AI Caption Generation

Postiz has its own AI caption generation endpoint (`/api/v1/posts/ai/generate`), activated when `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` is set in the Postiz `.env`. This is **separate** from the agent-side caption drafting in this kit.

**This kit's caption workflow:**
- The `postiz-social-operator` agent drafts A/B/C caption variants using its own reasoning and the AI caption methodology in `docs/ai-caption-layer.md`
- Postiz's own AI caption feature is available to the user independently in the admin UI
- The kit does not call the Postiz AI endpoint — it produces its own caption drafts

---

## BullMQ Queue Behavior

When a post is submitted to Postiz via `POST /api/v1/posts/bulk`:

1. Postiz validates the payload against the workspace's connected platforms
2. Each post is enqueued in BullMQ with a delay calculated from `scheduledAt - now()`
3. When the delay expires, BullMQ triggers the `publish-post` job
4. The job calls the platform integration's `post()` method
5. On success: post marked as `published` in PostgreSQL
6. On failure: retried up to 3 times (configurable), then moved to dead letter queue

Monitor the queue via Postiz admin UI → Queue Management, or via `GET /api/v1/queue/health`.

---

## Workspace Isolation

Postiz supports multiple workspaces. Each workspace has:
- Its own set of connected platform accounts
- Its own posting queue
- Its own analytics data
- A UUID (`workspaceId`) required in all API calls

The `POSTIZ_WORKSPACE_ID` in this kit's `.env` must match the workspace configured in the Postiz admin UI. Get it from Settings → Workspace in the admin UI, or from `GET /api/v1/workspace`.

---

## Inspecting the Fork Before Planning

Before generating any campaign or scheduling manifest, inspect the running Postiz instance:

```bash
# Verify all containers are running
docker compose ps

# Check API health
curl http://localhost:3000/api/healthcheck

# List connected platform integrations (requires auth)
curl http://localhost:3000/api/v1/integrations \
  -H "Authorization: Bearer <jwt-token>"
```

Do not generate scheduling manifests for platforms that are not connected and authorized in the Postiz admin UI. Unconnected platform posts will fail at publish time.
