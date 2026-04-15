# Posts + Queues Layer

This document specifies the JSON shapes the operator must produce. Every shape is a valid request body for the corresponding Zernio REST endpoint, so manifests can be piped directly into `curl` or the Zernio SDKs with no re-shaping.

---

## Scheduling Manifest

The scheduling manifest is the machine-readable record the operator writes to `output/<client-slug>/<project-slug>/scheduling-manifest.json` whenever scheduling is requested.

### Top-level shape

```json
{
  "zernioSchedulingManifest": {
    "version": "1.0",
    "profileId": "<ZERNIO_PROFILE_ID>",
    "timezone": "America/New_York",
    "dryRun": false,
    "generatedAt": "2026-04-15T14:30:00-04:00",
    "notes": "<free-form operator notes — kept with the manifest>",
    "posts": [ /* post entries */ ]
  }
}
```

| Field | Required | Type | Notes |
|---|---|---|---|
| `version` | Yes | string | Manifest schema version. Current: `"1.0"`. |
| `profileId` | Yes | string | Must be a real Zernio profile id in api-live mode. In agent-only mode may be `"placeholder"` provided `dryRun: true`. |
| `timezone` | Yes | string | IANA name. Default: value of `ZERNIO_TIMEZONE` or the profile's default. |
| `dryRun` | Yes | boolean | `true` in agent-only mode. `false` in api-live and hybrid modes. |
| `generatedAt` | Yes | string | ISO 8601 with tz offset. |
| `notes` | No | string | Free-form notes — kept with the manifest for audit. |
| `posts` | Yes | array | 1..N entries. |

### Per-post entry shape

Each entry is a direct body for `POST /api/v1/posts`, with two additional fields the operator uses for bookkeeping (`clientPostId`, `status`).

```json
{
  "clientPostId": "urban-cycle-20260501-001",
  "content": "Launch day — shipping our spring gravel lineup. Ride it today →",
  "scheduledFor": "2026-05-01T09:00:00-04:00",
  "timezone": "America/New_York",
  "media": [{ "mediaId": "med_HERO_01" }],
  "platforms": [
    { "platform": "instagram", "accountId": "acc_ig_UrbanCycle" },
    { "platform": "twitter",   "accountId": "acc_x_UrbanCycle" }
  ],
  "status": "pending"
}
```

| Field | Required | Type | Notes |
|---|---|---|---|
| `clientPostId` | Yes | string | Operator-generated id. Format: `<client-slug>-<YYYYMMDD>-<sequence>`. Used as the `Idempotency-Key` when submitting to Zernio. Not sent in the body. |
| `content` | Yes | string | The selected caption variant. |
| `scheduledFor` | Conditional | string | ISO 8601 with tz offset. Required unless the post is attached to a queue via `queueId`. |
| `timezone` | Yes | string | IANA name. |
| `media` | No | array | Array of `{ "mediaId": "<id>" }`. In api-live mode must reference real Zernio `mediaId` values obtained from `POST /api/v1/media`. |
| `platforms` | Yes | array | 1..N `{ platform, accountId }`. Every `platform` must exist in `docs/platform-coverage.md`. |
| `queueId` | Conditional | string | Only when the post is attached to a queue. Mutually exclusive with `scheduledFor`. |
| `status` | Yes | string | Operator bookkeeping. Always starts at `"pending"` and transitions to `"scheduled"` / `"published"` / `"failed"` once Zernio confirms. |

### Submitting a manifest

Each entry becomes one Zernio POST:

```bash
curl -sS -X POST \
  "${ZERNIO_API_URL:-https://zernio.com/api/v1}/posts" \
  -H "Authorization: Bearer ${ZERNIO_API_KEY}" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: <clientPostId>" \
  --data-binary @- <<'JSON'
{
  "profileId": "prof_abc123",
  "content": "...",
  "scheduledFor": "2026-05-01T09:00:00-04:00",
  "timezone": "America/New_York",
  "media": [{ "mediaId": "med_HERO_01" }],
  "platforms": [{ "platform": "twitter", "accountId": "acc_x_111" }]
}
JSON
```

The operator is responsible for issuing one request per `posts[]` entry and for retrying on 429/5xx with the same `Idempotency-Key`.

---

## Recurring Queue Definition

Queues define a repeating schedule on a profile. Posts attached to a queue auto-schedule into the next available slot.

### Queue shape

Body of `POST /api/v1/queues` and `PUT /api/v1/queues/<queueId>`:

```json
{
  "profileId": "prof_abc123",
  "name": "weekly-evergreen",
  "timezone": "America/New_York",
  "slots": [
    { "day": "mon", "time": "09:00", "platforms": ["twitter", "linkedin"] },
    { "day": "wed", "time": "12:30", "platforms": ["instagram"] },
    { "day": "fri", "time": "17:00", "platforms": ["bluesky", "threads"] }
  ]
}
```

| Field | Required | Type | Notes |
|---|---|---|---|
| `profileId` | Yes | string | Zernio profile owning the queue. |
| `name` | Yes | string | Lowercase kebab-case recommended. |
| `timezone` | Yes | string | IANA name. |
| `slots` | Yes | array | 1..N slots. |
| `slots[].day` | Yes | string | One of `mon|tue|wed|thu|fri|sat|sun`. |
| `slots[].time` | Yes | string | `HH:MM` 24-hour. |
| `slots[].platforms` | Yes | array | Platforms enabled for this slot. |

### Post attached to a queue

```json
{
  "profileId": "prof_abc123",
  "queueId": "que_xyz789",
  "content": "Weekend builder log: three wins, one lesson.",
  "platforms": [{ "platform": "twitter", "accountId": "acc_x_111" }]
}
```

The request is still `POST /api/v1/posts` but with `queueId` instead of `scheduledFor`. Zernio returns the computed `scheduledFor` in the response.

### Queue deliverable in the kit

The operator writes a queue definition alongside the scheduling manifest as:

```
output/<client-slug>/<project-slug>/queue-<queue-name>.json
```

The file contains one JSON object — the `zernioQueue` wrapper below — so that it reads as documentation plus a ready-to-submit request body.

```json
{
  "zernioQueue": {
    "version": "1.0",
    "profileId": "<ZERNIO_PROFILE_ID>",
    "dryRun": false,
    "queue": {
      "profileId": "<ZERNIO_PROFILE_ID>",
      "name": "weekly-evergreen",
      "timezone": "America/New_York",
      "slots": [
        { "day": "mon", "time": "09:00", "platforms": ["twitter", "linkedin"] }
      ]
    }
  }
}
```

---

## Media Upload

Every image or video referenced by a post must be uploaded first.

```bash
curl -sS -X POST \
  "${ZERNIO_API_URL:-https://zernio.com/api/v1}/media" \
  -H "Authorization: Bearer ${ZERNIO_API_KEY}" \
  -H "Idempotency-Key: media-urban-cycle-20260501-hero-01" \
  -F "file=@./media/urban-cycle/hero-01.png" \
  -F "profileId=prof_abc123"
```

The response includes `mediaId`. That id is what the scheduling manifest references.

In `agent-only` mode the operator emits placeholder `mediaId` values prefixed with `placeholder_` and documents the required asset in the Caption Copy Deck's "Media Notes" column. The user uploads the real media and replaces placeholders before submitting.

---

## Idempotency Contract

| Endpoint | Idempotency key source |
|---|---|
| `POST /api/v1/posts` | `clientPostId` from the manifest entry |
| `POST /api/v1/queues` | `queue.name` prefixed with `queue-` |
| `POST /api/v1/media` | `media-<client-slug>-<YYYYMMDD>-<asset-slug>` |

The operator must NEVER send different bodies under the same `Idempotency-Key`. If content changes, increment the manifest version and use a new key.

---

## Validation Rules (pre-submission)

Before any submission, re-run through `validation-checklist.md`. Specifically:

- Every `posts[].platforms[].platform` exists in `docs/platform-coverage.md`
- Every `clientPostId` matches the filename conventions in `output-standards.md`
- `scheduledFor` timestamps all fall inside the campaign window from the Social Campaign Brief
- `dryRun` matches the declared execution mode
- No post entry exceeds per-platform character limits from `docs/ai-caption-layer.md`

Failure on any of these is a blocker — fix the manifest before submitting.
