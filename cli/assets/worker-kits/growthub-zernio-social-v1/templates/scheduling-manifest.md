# Scheduling Manifest — [Client Name] · [Project Name]

**Kit:** `growthub-zernio-social-v1`
**Generated:** [YYYY-MM-DD]
**Mode:** [api-live | agent-only | hybrid]
**Version:** `v1`

---

## Purpose

This file documents the Zernio-shaped scheduling manifest for this campaign. The machine-readable companion is `scheduling-manifest.json` in the same folder — the operator writes that file alongside this Markdown record.

Manifest shape is fully specified in `docs/posts-and-queues-layer.md`. Every post entry is a valid `POST /api/v1/posts` body (minus the two bookkeeping fields `clientPostId` and `status`).

---

## Manifest Header

| Field | Value |
|---|---|
| `version` | `1.0` |
| `profileId` | [prof_... or `placeholder`] |
| `timezone` | [IANA tz, e.g., `America/New_York`] |
| `dryRun` | [true in agent-only mode, false otherwise] |
| `generatedAt` | [ISO 8601 with tz offset] |
| Post count | [N entries] |

---

## Post Entries (reference table)

| clientPostId | scheduledFor | platforms (count) | media (count) | status |
|---|---|---|---|---|
| `urban-cycle-20260501-001` | 2026-05-01T09:00:00-04:00 | 2 | 1 | pending |
| `urban-cycle-20260501-002` | 2026-05-01T12:30:00-04:00 | 1 | 0 | pending |

Full JSON lives in `scheduling-manifest.json` beside this file.

---

## Reference JSON Block

```json
{
  "zernioSchedulingManifest": {
    "version": "1.0",
    "profileId": "prof_abc123",
    "timezone": "America/New_York",
    "dryRun": false,
    "generatedAt": "2026-04-15T14:30:00-04:00",
    "posts": [
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
    ]
  }
}
```

---

## Submission Sequence

1. Upload every referenced media asset via `POST /api/v1/media`, capturing each returned `mediaId`
2. Replace placeholder media IDs in `scheduling-manifest.json`
3. Iterate `posts[]`, issuing one `POST /api/v1/posts` per entry with `Idempotency-Key: <clientPostId>`
4. Update each entry's `status` from `pending` to `scheduled` on 2xx, or `failed` on non-2xx with the Zernio `requestId`
5. If the campaign uses a recurring queue, submit `POST /api/v1/queues` first so its id can be referenced by queued post entries

---

## Validation Before Submit

- [ ] Every post in the manifest also exists in the Content Calendar
- [ ] Every caption is the selected variant from the Caption Copy Deck
- [ ] Every platform exists in `docs/platform-coverage.md`
- [ ] Every `scheduledFor` is ISO 8601 with timezone offset
- [ ] Every `clientPostId` follows `<client-slug>-<YYYYMMDD>-<sequence>`
- [ ] In api-live mode, every `accountId` is confirmed via `GET /api/v1/accounts`
- [ ] `dryRun` matches the execution mode declared in the Social Campaign Brief

Failure on any of these blocks submission.
