# BullMQ Queue Layer

**Scheduling manifest format and queue architecture for Postiz API submission.**

---

## Overview

Postiz uses BullMQ (backed by Redis) as its job queue for scheduled post publishing. When this kit generates a scheduling manifest, it produces a JSON file that can be submitted to the Postiz API's bulk scheduling endpoint. The API enqueues each post with a delay calculated from `scheduledAt - now()`.

---

## Scheduling Manifest Format

The full JSON format for the scheduling manifest:

```json
{
  "postizSchedulingManifest": {
    "version": "1.0",
    "workspaceId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "generatedAt": "2026-04-15T10:00:00-05:00",
    "dryRun": false,
    "posts": [
      {
        "postId": "urbancycle-20260420-instagram-001",
        "platform": "instagram",
        "scheduledAt": "2026-04-20T09:00:00-05:00",
        "content": "Building for the long game means planting seeds you won't harvest for years. At Urban Cycle, we're still running routes we mapped in 2021. Where are you building today that you won't see pay off until 2028? Share in the comments — we read every one. #urbanmobility #sustainableliving #cycling",
        "mediaAssets": [
          {
            "type": "image",
            "path": "assets/2026-04-20-instagram-001.jpg",
            "altText": "Urban Cycle team on a community cycling route, morning light"
          }
        ],
        "tags": ["#urbanmobility", "#sustainableliving", "#cycling"],
        "status": "pending"
      }
    ]
  }
}
```

---

## Field Reference

| Field | Type | Required | Description |
|---|---|---|---|
| `version` | string | Yes | Manifest version — always `"1.0"` for this kit |
| `workspaceId` | string (UUID) | Yes | Postiz workspace UUID from Settings → Workspace |
| `generatedAt` | string (ISO 8601) | Yes | Manifest generation timestamp |
| `dryRun` | boolean | Yes | `true` for agent-only mode (no API submission); `false` for live submission |
| `posts[].postId` | string | Yes | Unique post identifier — see naming convention below |
| `posts[].platform` | string | Yes | Postiz platform integration ID (from `docs/platform-coverage.md`) |
| `posts[].scheduledAt` | string (ISO 8601) | Yes | Target publish timestamp with timezone offset |
| `posts[].content` | string | Yes | Full caption text (selected A/B/C variant) |
| `posts[].mediaAssets` | array | No | Media asset references (empty array if text-only post) |
| `posts[].mediaAssets[].type` | string | Yes | `"image"` \| `"video"` \| `"carousel"` |
| `posts[].mediaAssets[].path` | string | Yes | Relative path to asset file |
| `posts[].mediaAssets[].altText` | string | No | Accessibility alt text for images |
| `posts[].tags` | array | No | Hashtag strings (with `#` prefix) |
| `posts[].status` | string | Yes | Always `"pending"` in generated manifest |

---

## Post ID Naming Convention

```
<client-slug>-<YYYYMMDD>-<platform>-<sequence>
```

| Part | Rule | Example |
|---|---|---|
| client-slug | Lowercase, hyphenated, no special chars | `urban-cycle` |
| YYYYMMDD | Scheduled post date | `20260420` |
| platform | Postiz platform ID | `instagram` |
| sequence | 3-digit zero-padded sequence | `001`, `002`, `003` |

**Example:** `urban-cycle-20260420-instagram-001`

---

## Timestamp Format

All `scheduledAt` values must use ISO 8601 format with explicit timezone offset:

```
YYYY-MM-DDTHH:MM:SS±HH:MM
```

**Examples:**
- `2026-04-20T09:00:00-05:00` — 9am CDT
- `2026-04-20T09:00:00-04:00` — 9am EDT
- `2026-04-20T14:00:00Z` — 2pm UTC

Never use `Z` for local time unless the workspace timezone is explicitly UTC.

---

## Submission to Postiz API

```bash
# Submit the scheduling manifest to Postiz bulk scheduling endpoint
curl -X POST "${POSTIZ_API_URL}/api/v1/posts/bulk" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt-token>" \
  -d @scheduling-manifest.json

# Verify queue health after submission
curl "${POSTIZ_API_URL}/api/v1/queue/health" \
  -H "Authorization: Bearer <jwt-token>"
```

Obtain the JWT token from Postiz admin UI → Settings → API Keys, or via `POST /api/v1/auth/login`.

---

## Queue Monitoring

After submitting the manifest, monitor the BullMQ queue:

1. **Postiz admin UI** → Queue Management: shows pending, active, completed, and failed jobs
2. **API endpoint**: `GET /api/v1/queue/health` — returns queue stats
3. **Redis CLI** (advanced): `redis-cli monitor` — raw job events

### Job States

| State | Meaning |
|---|---|
| `waiting` | Job is queued, delay has not expired |
| `active` | Job is currently being processed (publishing now) |
| `completed` | Post was published successfully |
| `failed` | Post failed to publish — check error in admin UI |
| `delayed` | Job is waiting for `scheduledAt` time |

### Retry Logic

Postiz retries failed publish jobs 3 times with exponential backoff by default:
- Attempt 1: immediately after failure
- Attempt 2: 5 seconds after first retry
- Attempt 3: 30 seconds after second retry

Failed jobs after 3 attempts are moved to the dead letter queue and visible in the admin UI → Failed Jobs.

---

## Dry-Run Mode

When `dryRun: true` in the manifest header:
- The manifest is produced as a JSON file but is **not submitted to the Postiz API**
- All `status` fields remain `"pending"`
- The manifest can be reviewed and submitted manually
- Use `dryRun: true` in all agent-only mode sessions

The agent must set `dryRun: true` automatically when the Postiz API is not reachable or when execution mode is `agent-only`.
