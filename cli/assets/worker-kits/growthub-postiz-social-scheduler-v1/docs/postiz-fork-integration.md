# Postiz Fork Integration Notes

This document tells the agent what to inspect in a maintained local Postiz fork before it commits to a plan.

---

## EXPECTED REPO LAYOUT

Based on the upstream repository (`github.com/gitroomhq/postiz-app`):

```text
apps/
  backend/           # NestJS backend
  frontend/          # Next.js frontend
libraries/
  nestjs-libraries/
    src/
      integrations/  # Platform adapters (28+)
      bull-mq-transport/  # Job queue
prisma/
  schema.prisma      # Database schema
docker-compose.yml
package.json
README.md
```

The agent should treat these as the runtime-critical zones:
- `libraries/nestjs-libraries/src/integrations/` — which platforms are enabled
- `libraries/nestjs-libraries/src/bull-mq-transport/` — how scheduling works
- `apps/backend/src/api/` — API endpoints for post creation
- `apps/frontend/src/` — UI components and pages
- `prisma/schema.prisma` — data model for posts, workspaces, organizations
- `docker-compose.yml` — deployment configuration

---

## WHAT TO INSPECT BEFORE GENERATING

1. Which social platform integrations are currently enabled
2. How the BullMQ job queue processes scheduled posts
3. What API endpoints exist for post creation and scheduling
4. Whether AI content generation is configured and available
5. Which media upload formats are accepted
6. How workspaces and organizations are structured in the data model
7. Whether analytics endpoints are available for post-publish tracking
8. What the Docker Compose stack includes (app, postgres, redis)

---

## SOURCE OF TRUTH RULES

- `integrations/` is the platform capability source of truth
- `bull-mq-transport/` is the scheduling behavior source of truth
- `prisma/schema.prisma` is the data model source of truth
- `apps/backend/src/api/` is the API surface source of truth
- `docker-compose.yml` is the deployment source of truth
- `README.md` is the environment and setup overview

If these conflict, prefer:
1. actual integration code behavior
2. API endpoint behavior
3. data model schema
4. README summary

---

## PLATFORM INTEGRATIONS

The upstream repo supports 28+ platforms. Key integrations to inspect:

| Platform | Integration path | Key files |
|---|---|---|
| Instagram | `integrations/instagram/` | OAuth, post creation, media upload |
| LinkedIn | `integrations/linkedin/` | OAuth, post/article creation |
| TikTok | `integrations/tiktok/` | OAuth, video upload |
| Twitter/X | `integrations/twitter/` | OAuth, tweet/thread creation |
| YouTube | `integrations/youtube/` | OAuth, video/short upload |
| Facebook | `integrations/facebook/` | OAuth, page post creation |
| Reddit | `integrations/reddit/` | OAuth, post/comment creation |
| Pinterest | `integrations/pinterest/` | OAuth, pin creation |
| Mastodon | `integrations/mastodon/` | Instance auth, toot creation |
| Bluesky | `integrations/bluesky/` | Auth, post creation |

---

## FORK-AWARE OUTPUT RULE

Every handoff should say whether it was:
- `fork-verified` — agent inspected the actual fork files
- `upstream-verified` — agent used public upstream repo docs
- `assumption-based` — agent used frozen kit assumptions only
