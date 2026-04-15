# Runtime Assumptions

**Frozen at kit creation: 2026-04-15. Update this file when upstream Postiz fork behavior changes.**

---

## Execution Mode Overview

| Mode | Requirements | Fork Used? | Postiz API? | Scheduling? | Caption AI? |
|---|---|---|---|---|---|
| `local-fork` | Node 18+, Docker, Postiz running | Yes | Yes | Yes | Yes |
| `agent-only` | Nothing (Claude Code only) | No | No | Dry-run JSON only | Yes |
| `hybrid` | ANTHROPIC_API_KEY + Postiz running | Yes | Yes | Yes | Yes |

### Choosing a Mode

- **Use `local-fork`** when you need real Postiz API scheduling, multi-workspace support, or live BullMQ queue management.
- **Use `agent-only`** when Postiz is not installed or when you only need campaign planning, content calendars, and caption drafts.
- **Use `hybrid`** when you want enhanced AI caption generation via Anthropic API alongside live Postiz scheduling.

---

## Postiz Upstream Assumptions

These are the assumptions frozen at kit creation time about the Postiz fork at https://github.com/gitroomhq/postiz-app.

### Service Topology

| Service | Container | Default Port | Purpose |
|---|---|---|---|
| Postiz App | `postiz` | 3000 | NestJS API + Next.js frontend |
| PostgreSQL | `postiz-postgres` | 5432 | Primary data store |
| Redis | `postiz-redis` | 6379 | BullMQ job queue, session cache |

All services are defined in `docker-compose.yml` at the fork root.

### Node.js Environment

| Requirement | Value | Notes |
|---|---|---|
| Node version | 18+ | Tested on 18 and 20 LTS |
| Package manager | pnpm | `pnpm install` from repo root |
| Monorepo structure | Turborepo | `apps/` and `libraries/` |
| Backend framework | NestJS | `apps/backend/` |
| Frontend framework | Next.js 14 | `apps/frontend/` |

### 28+ Platform Integrations (at time of freeze)

The following platform integrations ship with the Postiz codebase under `libraries/nestjs-libraries/src/integrations/`:

| Platform | Integration ID | Auth Method |
|---|---|---|
| Instagram | `instagram` | Meta OAuth |
| LinkedIn | `linkedin` | LinkedIn OAuth |
| TikTok | `tiktok` | TikTok OAuth |
| X/Twitter | `twitter` | Twitter OAuth 2.0 |
| YouTube | `youtube` | Google OAuth |
| Pinterest | `pinterest` | Pinterest OAuth |
| Reddit | `reddit` | Reddit OAuth |
| Facebook | `facebook` | Meta OAuth |
| Bluesky | `bluesky` | AT Protocol credentials |
| Mastodon | `mastodon` | Mastodon OAuth (instance-specific) |
| Slack | `slack` | Slack OAuth |
| Telegram | `telegram` | Telegram Bot API token |
| Discord | `discord` | Discord Bot token |
| Threads | `threads` | Meta OAuth |
| Dribbble | `dribbble` | Dribbble OAuth |
| Tumblr | `tumblr` | Tumblr OAuth |
| Medium | `medium` | Medium OAuth |
| DevTo | `devto` | DEV API key |
| Hashnode | `hashnode` | Hashnode API key |
| Lemmy | `lemmy` | Lemmy credentials |
| Nostr | `nostr` | Nostr keypair |

*Additional platforms may be available in newer Postiz releases. Check `libraries/nestjs-libraries/src/integrations/` in the fork for the current list.*

### BullMQ Queue Architecture

- Queue name: `post` (primary publishing queue)
- Job type: `publish-post`
- Delay scheduling: supported via BullMQ `delay` option (milliseconds from now)
- Retry logic: 3 attempts, exponential backoff (configurable in Postiz admin)
- Dead letter queue: failed jobs visible in Postiz admin at `/admin/queues`

### AI Caption Generation

Postiz ships with optional AI caption generation. At time of freeze:
- OpenAI GPT-4o: enabled when `OPENAI_API_KEY` is set in Postiz `.env`
- Anthropic Claude: enabled when `ANTHROPIC_API_KEY` is set
- AI captions are generated via `POST /api/v1/posts/ai/generate`
- This kit uses the agent's own Anthropic API key (via `ANTHROPIC_API_KEY` in this kit's `.env`) for caption drafts — independent of the Postiz instance's AI config

---

## Execution Surface Flows

### Local-Fork Mode

```
User request → Environment gate (Step 0)
  ↓
Read skills.md + brand kit (Step 1)
  ↓
Read runtime docs (Step 2)
  ↓
Inspect Postiz fork: docker ps, API healthcheck, platform list (Step 3)
  ↓
4-question gate (Step 4)
  ↓
Select /postiz command (Step 5)
  ↓
Phase 1: Campaign strategy + platform selection (Step 6)
  ↓
Phase 2: Content calendar + caption copy deck (Step 7)
  ↓
Phase 3: Scheduling manifest → POST /api/v1/posts/bulk (Step 8)
  ↓
Artifact package: 5–7 Markdown files + scheduling-manifest.json (Step 9)
  ↓
Log deliverable → brand kit DELIVERABLES LOG (Step 10)
```

### Agent-Only Mode

```
User request → Environment gate (Step 0 — confirm agent-only)
  ↓
Read skills.md + brand kit (Step 1)
  ↓
Read runtime docs (Step 2)
  ↓
Skip fork inspection (Step 3 — N/A)
  ↓
4-question gate (Step 4)
  ↓
Select /postiz command (Step 5)
  ↓
Phase 1: Campaign strategy + platform selection (Step 6)
  ↓
Phase 2: Content calendar + caption copy deck (Step 7)
  ↓
Phase 3: Dry-run scheduling manifest (JSON — for manual submission) (Step 8)
  ↓
Artifact package: 5–7 Markdown files + scheduling-manifest.json (Step 9)
  ↓
Log deliverable → brand kit DELIVERABLES LOG (Step 10)
```

---

## Output Assumption

All outputs are Markdown files written to:

```
output/<client-slug>/<project-slug>/
```

The scheduling manifest is a JSON file (`scheduling-manifest.json`) written alongside the Markdown artifacts. It is the machine-readable record for Postiz API submission.
