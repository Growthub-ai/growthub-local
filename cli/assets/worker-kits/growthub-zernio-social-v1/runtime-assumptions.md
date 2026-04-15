# Runtime Assumptions

**Frozen at kit creation: 2026-04-15. Update this file when Zernio API behavior changes.**

---

## Execution Mode Overview

| Mode | Requirements | Zernio API? | Live scheduling? | Caption AI? |
|---|---|---|---|---|
| `api-live` | Valid `ZERNIO_API_KEY` with `read-write` scope | Yes | Yes | Built-in (optional Anthropic enhancement) |
| `agent-only` | Nothing (Claude Code only) | No | Dry-run JSON only | Yes |
| `hybrid` | `ANTHROPIC_API_KEY` + valid `ZERNIO_API_KEY` | Yes | Yes | Enhanced via Anthropic |

### Choosing a Mode

- **Use `api-live`** when you want real Zernio scheduling, queue management, and analytics pull-back.
- **Use `agent-only`** when you only need campaign planning, content calendars, and caption drafts, or when no Zernio key is available.
- **Use `hybrid`** for the highest-quality caption drafting plus live Zernio scheduling.

---

## Zernio API Assumptions (frozen at kit creation)

These are the assumptions frozen at kit creation time about the Zernio API at `https://zernio.com/api/v1`.

### Base URL + versioning

| Field | Value |
|---|---|
| Base URL | `https://zernio.com/api/v1` |
| Version prefix | `v1` in the path |
| Content-Type | `application/json` for all JSON endpoints |
| Media upload | `multipart/form-data` on `/api/v1/media` |

### Authentication

- Header: `Authorization: Bearer ${ZERNIO_API_KEY}`
- Key format: `sk_` + 64 hex characters (67 total)
- Scopes: `read` or `read-write`
- Scope per key: `full` or `profiles-specific`
- Rotate keys via `POST /api/v1/api-keys` / `DELETE /api/v1/api-keys/<id>`

### Core resources

| Resource | Endpoint | Purpose |
|---|---|---|
| Profiles | `/api/v1/profiles` | Containers that group social accounts together |
| Accounts | `/api/v1/accounts` | Connected social accounts on a profile |
| Posts | `/api/v1/posts` | Schedulable content, fan-out to multiple accounts |
| Queues | `/api/v1/queues` | Recurring time-slot schedules |
| Media | `/api/v1/media` | Upload images, videos, carousels |
| Inbox | `/api/v1/inbox` | Unified DMs, comments, reviews |
| Analytics | `/api/v1/analytics` | Per-post and per-account metrics |
| API Keys | `/api/v1/api-keys` | Key lifecycle management |
| Connect | `/api/v1/connect/<platform>` | OAuth / credential flow entrypoint |

### 14 platforms (at time of freeze)

| Platform | Zernio platform id | Auth method (Zernio-managed) |
|---|---|---|
| X/Twitter | `twitter` | Twitter OAuth 2.0 |
| Instagram | `instagram` | Meta OAuth |
| Facebook | `facebook` | Meta OAuth |
| LinkedIn | `linkedin` | LinkedIn OAuth |
| TikTok | `tiktok` | TikTok OAuth |
| YouTube | `youtube` | Google OAuth |
| Pinterest | `pinterest` | Pinterest OAuth |
| Reddit | `reddit` | Reddit OAuth |
| Bluesky | `bluesky` | AT Protocol |
| Threads | `threads` | Meta OAuth |
| Google Business | `googlebusiness` | Google OAuth |
| Telegram | `telegram` | Bot API token |
| Snapchat | `snapchat` | Snapchat Marketing API |
| WhatsApp | `whatsapp` | WhatsApp Business API |

*Additional platforms may be added in newer Zernio releases. Always confirm against `GET /api/v1/platforms` for the live list.*

### Rate limits (assumed)

| Limit | Value |
|---|---|
| Default plan | 60 requests/minute per API key |
| Posts burst | ≤30 scheduled posts per single `POST /api/v1/posts` call |
| Media uploads | ≤10 media objects per minute per profile |
| Analytics pull | ≤10 calls/minute per profile |

If a 429 is returned, back off using the `Retry-After` header. Treat rate-limit retries as idempotent only when a client-provided `Idempotency-Key` header is attached.

### Idempotency

- Include `Idempotency-Key: <uuid>` on every write (`POST /posts`, `POST /queues`, `POST /media`)
- Use `clientPostId` values from the manifest as the idempotency key when creating scheduled posts — this makes manifest re-submission safe

### Optional AI caption enhancement

Zernio ships its own caption-enhancement endpoint, but this kit uses the operator's Anthropic key directly for caption drafting. Zernio's built-in caption service is treated as secondary.

- Kit caption source: Anthropic (via the agent calling Claude)
- Zernio caption service: documented but not used as the primary source

---

## Execution Surface Flows

### Api-Live Mode

```
User request → Environment gate (Step 0)
  ↓
Read skills.md + brand kit (Step 1)
  ↓
Read runtime docs (Step 2)
  ↓
Inspect Zernio account: profiles, accounts, queues, scheduled posts (Step 3)
  ↓
4-question gate (Step 4)
  ↓
Select /zernio command (Step 5)
  ↓
Phase 1: Campaign strategy + platform selection (Step 6)
  ↓
Phase 2: Content calendar + caption copy deck (Step 7)
  ↓
Phase 3: Scheduling manifest → POST /api/v1/posts (Step 8)
  ↓
Optional queue definition → POST /api/v1/queues (Step 8b)
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
Skip live account inspection (Step 3 — N/A)
  ↓
4-question gate (Step 4)
  ↓
Select /zernio command (Step 5)
  ↓
Phase 1: Campaign strategy + platform selection (Step 6)
  ↓
Phase 2: Content calendar + caption copy deck (Step 7)
  ↓
Phase 3: Dry-run scheduling manifest (JSON, dryRun: true) (Step 8)
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

The scheduling manifest is a JSON file (`scheduling-manifest.json`) written alongside the Markdown artifacts. It is the machine-readable record for Zernio API submission and stays aligned to the `POST /api/v1/posts` body shape documented in `docs/posts-and-queues-layer.md`.
