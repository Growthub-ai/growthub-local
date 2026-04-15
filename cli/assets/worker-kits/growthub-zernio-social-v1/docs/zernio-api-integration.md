# Zernio API Integration

This document is the reference contract between the `growthub-zernio-social-v1` kit and the [Zernio](https://zernio.com) REST API. It is frozen at kit creation and should be updated when the upstream API contract changes.

> Source of truth upstream: [docs.zernio.com](https://docs.zernio.com). When this document conflicts with live Zernio docs, the live docs win; update this file and the kit version.

---

## Base Contract

| Field | Value |
|---|---|
| Base URL | `https://zernio.com/api/v1` |
| Env var | `ZERNIO_API_URL` (override only for regional / proxy deployments) |
| Transport | HTTPS only |
| Request content type | `application/json` (JSON endpoints) · `multipart/form-data` (`/media` upload) |
| Response content type | `application/json` |
| Character encoding | UTF-8 |

---

## Authentication

Every request carries a single bearer header:

```
Authorization: Bearer ${ZERNIO_API_KEY}
```

### Key format

- Prefix: `sk_`
- Body: 64 hex characters
- Total length: 67 characters

Regex: `^sk_[0-9a-fA-F]{64}$`

### Key scopes

| Scope | Purpose |
|---|---|
| `read` | Read-only endpoints only (profiles, accounts, analytics, inbox listing) |
| `read-write` | Everything in `read` plus create/update posts, queues, media, and inbox replies |

### Key scope filter

An individual key may be scoped `full` (any profile on the account) or `profiles-specific` (restricted to a list of profile IDs).

### Idempotency

Attach an `Idempotency-Key` header to every write request. The operator uses the `clientPostId` from the scheduling manifest as the idempotency key so the manifest can be re-submitted safely.

---

## Core Resource Model

Zernio models social publishing around five primary resources:

| Resource | Endpoint root | Role |
|---|---|---|
| Profiles | `/api/v1/profiles` | A container that groups social accounts. Every request is implicitly scoped to one profile for scheduling. |
| Accounts | `/api/v1/accounts` | A connected social account that belongs to a profile. Identified by `accountId`. |
| Posts | `/api/v1/posts` | Schedulable content. One post can fan out to many `{ platform, accountId }` pairs. |
| Queues | `/api/v1/queues` | Recurring time-slot schedule attached to a profile. Posts added to a queue auto-schedule into the next open slot. |
| Media | `/api/v1/media` | Image, video, and document assets uploaded once and referenced by `mediaId` from a post body. |

Two secondary resources:

| Resource | Endpoint root | Role |
|---|---|---|
| Inbox | `/api/v1/inbox` | Unified DM, comment, and review conversations aggregated per profile. |
| Analytics | `/api/v1/analytics` | Per-post and per-account metrics. |

Supporting endpoints:

| Endpoint | Role |
|---|---|
| `/api/v1/api-keys` | Create, list, rotate, and revoke API keys |
| `/api/v1/connect/<platform>` | Begin platform OAuth / credential flow for a new account on a profile |
| `/api/v1/platforms` | Live list of supported platforms and their per-platform capability flags |

---

## Endpoints Used By This Kit

### Profiles

- `GET /api/v1/profiles` — list profiles on the account
- `GET /api/v1/profiles/<profileId>` — fetch a single profile, including the default timezone

### Accounts

- `GET /api/v1/accounts?profileId=<id>` — list connected accounts on a profile (platform + handle + accountId)

### Media upload

- `POST /api/v1/media` — multipart upload; response includes `mediaId`
- `GET /api/v1/media/<mediaId>` — fetch metadata of an uploaded asset

### Posts

- `POST /api/v1/posts` — schedule one post with fan-out targets
- `GET /api/v1/posts?profileId=<id>&status=scheduled` — list scheduled posts
- `GET /api/v1/posts/<postId>` — fetch a single post
- `DELETE /api/v1/posts/<postId>` — unschedule a post (only while `status=scheduled`)

Minimal `POST /api/v1/posts` body:

```json
{
  "profileId": "prof_abc123",
  "content": "Launch day — shipping our new kit. →",
  "scheduledFor": "2026-05-01T09:00:00-04:00",
  "timezone": "America/New_York",
  "media": [{ "mediaId": "med_imgA" }],
  "platforms": [
    { "platform": "twitter",  "accountId": "acc_x_111" },
    { "platform": "linkedin", "accountId": "acc_li_222" }
  ]
}
```

### Queues (recurring schedules)

- `POST /api/v1/queues` — create a recurring queue
- `GET /api/v1/queues?profileId=<id>` — list queues on a profile
- `PUT /api/v1/queues/<queueId>` — replace queue configuration
- `DELETE /api/v1/queues/<queueId>` — remove queue (future slots stop; already-scheduled posts remain)

Minimal queue body:

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

Posts attached to a queue omit `scheduledFor` and include `queueId` instead:

```json
{
  "profileId": "prof_abc123",
  "queueId": "que_xyz789",
  "content": "Weekend builder log: three wins, one lesson.",
  "platforms": [{ "platform": "twitter", "accountId": "acc_x_111" }]
}
```

### Inbox (DMs, comments, reviews)

- `GET /api/v1/inbox?profileId=<id>` — unified conversation list
- `GET /api/v1/inbox/<conversationId>` — conversation thread
- `POST /api/v1/inbox/<conversationId>/reply` — reply to a conversation

### Analytics

- `GET /api/v1/analytics/posts?profileId=<id>&from=<date>&to=<date>` — per-post metrics
- `GET /api/v1/analytics/accounts?profileId=<id>&from=<date>&to=<date>` — per-account summary

### API keys

- `POST /api/v1/api-keys` — create a new key with `scope` and `permission`
- `GET /api/v1/api-keys` — list existing keys
- `DELETE /api/v1/api-keys/<keyId>` — revoke a key

---

## Error Model

All non-2xx responses return:

```json
{
  "error": {
    "code": "<machine_readable_code>",
    "message": "<human readable>",
    "requestId": "<uuid>"
  }
}
```

Well-known codes the operator handles:

| HTTP | Zernio code | Behavior |
|---|---|---|
| 401 | `auth_invalid` | Key missing / malformed / revoked — surface to user, fall back to agent-only |
| 403 | `permission_denied` | Key lacks `read-write` scope — surface with rotate-instructions |
| 404 | `profile_not_found` / `account_not_found` | Correct the id or fall back to dry-run |
| 409 | `conflict` | Typically an idempotency collision; safe to treat as success |
| 422 | `validation_failed` | Manifest shape bug — fix and retry |
| 429 | `rate_limited` | Back off using `Retry-After` header |
| 5xx | `internal_error` | Retry with exponential backoff up to 3 attempts |

---

## Rate Limit Handling

Default plan: 60 requests/minute per API key. The operator batches reads during account inspection and never issues more than one write per post per second.

When a 429 is returned:

1. Read `Retry-After` header (seconds)
2. Sleep for the returned value plus 500ms jitter
3. Retry the same request with the same `Idempotency-Key`
4. On third failure, stop and report to the user

---

## SDK + Harness Options (informational)

Zernio ships official SDKs for Node.js, Python, Go, Ruby, Java, PHP, .NET, and Rust, plus a `zernio-cli` and an MCP server. This kit intentionally uses the raw REST contract so the agent operates identically regardless of which local runtime the user has installed. If the user wants to wire up the Zernio MCP server separately, it is complementary — this kit stays SDK-agnostic.

Kit files never install or require any Zernio SDK.

---

## Security

- `ZERNIO_API_KEY` lives only in `.env` (ignored by git) and the runtime environment
- Outputs never include the raw key, request headers, or response payloads that contain keys
- `scheduling-manifest.json` contains only `clientPostId`, content, timestamps, and Zernio resource IDs — no secrets
- Any snippet of curl help in documentation uses `${ZERNIO_API_KEY}` as an expanded env var reference, never a literal
