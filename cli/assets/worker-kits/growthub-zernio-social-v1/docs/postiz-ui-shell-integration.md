# Postiz UI Shell + Zernio Engine — Integration Recipe

This document is the canonical recipe for running `growthub-zernio-social-v1` as the engine layer underneath the stable `growthub-postiz-social-v1` kit's UI shell.

**Read order:** `../runtime-assumptions.md` → `./zernio-api-integration.md` → this file.

---

## Architectural split

| Layer | Owned by | What it does |
|---|---|---|
| Presentation | `growthub-postiz-social-v1` (Postiz UI) | Calendar, compose, analytics shell, team workspace |
| Engine | `growthub-zernio-social-v1` (this kit) | Posts, queues, media, inbox, analytics transport against Zernio REST API |

**Core principle:** Postiz stays the UI. Zernio replaces Postiz's native provider/posting engine. Nothing in Postiz's own database schema, Redis queue runner, React app, or auth/team/workspace system changes. The diff surface is the provider + publish-bridge layers only.

---

## The 7 Module Integration Map

### Module 1 — Provider Override (Zernio as the transport)

Postiz's provider system is where per-platform OAuth and posting normally live. Replace it with a single `ZernioProvider`:

- `baseUrl` → `https://zernio.com/api/v1`
- `authHeader` → `Authorization: Bearer ${ZERNIO_API_KEY}`
- All 14 platforms route through this one provider — no per-platform OAuth apps on the Postiz side
- Postiz's "Connect Account" UI validates `ZERNIO_API_KEY` instead of OAuth dancing — Zernio handles all OAuth upstream

The config for this provider mirrors exactly `buildZernioSocialConfig()` in `cli/src/kits/core/index.ts`:

```ts
{
  providerId: "zernio",
  providerName: "Zernio (hosted)",
  providerBaseUrl: "https://zernio.com/api/v1",
  providerAuthField: "Authorization",
  apiKeyEnvVar: "ZERNIO_API_KEY",
  additionalRequiredEnvVars: ["ZERNIO_API_URL"],
}
```

### Module 2 — Post Submission Bridge

The Zernio operator already produces manifests shaped as valid `POST /api/v1/posts` bodies. The bridge:

1. Intercepts Postiz's internal `publishPost()` call
2. Transforms the Postiz post into a Zernio manifest entry (see `./posts-and-queues-layer.md`)
3. Fires `POST ${ZERNIO_API_URL}/posts` with `Authorization: Bearer ${ZERNIO_API_KEY}` and `Idempotency-Key: <clientPostId>`
4. Feeds Zernio's response back into Postiz's job tracker

`clientPostId` format stays `<client-slug>-<YYYYMMDD>-<sequence>`. Re-submitting the same manifest under the same key is safe.

### Module 3 — Queue Sync Layer

Postiz's queue concept maps 1:1 onto Zernio queues (`POST /api/v1/queues`):

- Postiz queue scheduler → Zernio `queues` endpoint (create) / `queues/<queueId>` (update)
- `Idempotency-Key: queue-<name>` prevents double-fire on retry
- Posts attached to a queue omit `scheduledFor` and include `queueId`
- The 10-step `zernio-social-operator` workflow becomes the execution contract for each queue job

### Module 4 — AI Caption Layer Surface

The agent-side `/zernio` command surface replaces Postiz's native AI composer:

- Postiz compose textarea → `/zernio captions` (or `/zernio campaign` for full scope)
- Caption drafts come from the A/B/C variant rules in `./ai-caption-layer.md`
- Claude Code runs as a background operator session; Postiz compose UI is the front-end trigger
- The 10 `/zernio` subcommands wire into Postiz's compose surface as slash-quick-actions

### Module 5 — Platform Coverage Config

`./platform-coverage.md` is the source of truth for Postiz channel configuration:

- Disable native Postiz channel handlers
- Register 14 channels pointing to the Zernio transport from Module 1
- The per-platform format spec (char limits, aspect ratios, post types, carousel eligibility, thread support, cadence) drives Postiz's per-channel validation + preview rendering
- `skills.md` per-platform tone rules feed the compose UI's voice hints

### Module 6 — ENV + Secret Surface

Direct alignment — the cleanest module:

| Kit env var | Postiz field |
|---|---|
| `ZERNIO_API_KEY` | provider credentials field (replaces all per-platform OAuth tokens) |
| `ZERNIO_API_URL` | provider baseUrl override (regional/proxy deployments only) |
| `ZERNIO_PROFILE_ID` | default profile scope for all write requests |
| `ZERNIO_TIMEZONE` | default posting timezone when the profile's timezone isn't used |

`setup/verify-env.mjs` and `setup/check-deps.sh` run as Postiz's pre-start health checks. The secret-hygiene scan (`sk_` + 64-hex leak detection from the kit test suite) is the canonical gate on any output or log line.

### Module 7 — Workspace CLI Entry Point

`@growthub/cli >= 0.3.57` is the operator terminal that sits beside Postiz:

- `growthub kit download growthub-zernio-social-v1` — materialize the kit
- `growthub kit path growthub-zernio-social-v1` — print the working-directory path
- Point a Claude Code session at that folder; the operator handles the full 10-step workflow
- Postiz UI reflects the output — scheduled posts, queue runs, generated captions, analytics
- The 7 artifacts declared by `buildZernioSocialConfig()` (brief, calendar, publishing plan, caption deck, scheduling manifest, analytics brief, client proposal) are the canonical source of truth for what the UI shows

---

## Integration Sequence (request path)

```
Postiz UI (compose / schedule)
        ↓
Module 2 — Post Submission Bridge
        ↓
Module 1 — ZernioProvider (Authorization: Bearer ZERNIO_API_KEY)
        ↓
Zernio API  →  POST /api/v1/posts
            +  POST /api/v1/queues
            +  POST /api/v1/media
            +  GET  /api/v1/inbox
            +  GET  /api/v1/analytics/*
        ↑
Module 3 — Queue Sync reads back status
        ↑
Postiz Calendar / Analytics shell renders state
```

Claude Code + the `/zernio` surface sits **laterally** — it feeds the compose box in Postiz before submission, not inside the request path. This keeps the agent lane non-blocking for end-user UI latency.

---

## What Stays Untouched in Postiz

| Layer | Status |
|---|---|
| Postgres schema | Unchanged |
| Redis queue runner | Unchanged (different job payloads, same runner) |
| React frontend | Unchanged (except the compose AI hook in Module 4) |
| Auth / team / workspace | Unchanged |
| Existing Postiz kit payload (`growthub-postiz-social-v1`) | Unchanged — it remains valid for self-hosted-only operators |

This keeps the diff surface minimal and keeps `growthub-zernio-social-v1` fully isolated as the engine layer.

---

## Operator Setup Order (when paired with Postiz UI shell)

1. Stand up Postiz via its own kit (`growthub kit download growthub-postiz-social-v1`) — optional if only the UI layer is desired
2. Download this kit: `growthub kit download growthub-zernio-social-v1`
3. Fill `.env` — `ZERNIO_API_KEY`, `ZERNIO_API_URL`, `ZERNIO_PROFILE_ID`
4. Run `node setup/verify-env.mjs` (kit-level) and the Postiz pre-start checks
5. Apply Modules 1–3 inside the Postiz fork (provider override, publish bridge, queue sync). Everything else stays default.
6. Open Claude Code at the Zernio kit's exported folder for the `/zernio` surface

Standalone (without Postiz UI): everything still works — the kit is self-contained, and Modules 1–3 are optional.

---

## Validation Before Go-Live

- [ ] Zernio API key scope is `read-write`
- [ ] `GET /api/v1/accounts?profileId=...` returns at least one connected platform
- [ ] A dry-run manifest round-trips through Module 2 with a successful 2xx from `POST /api/v1/posts`
- [ ] A queue definition round-trips through Module 3 with a returned `queueId`
- [ ] Postiz channel list surfaces all 14 Zernio platform slugs from `./platform-coverage.md`
- [ ] Compose surface calls into `/zernio captions` and renders A/B/C variants
- [ ] Kit secret-hygiene scan on the Postiz fork's logs is clean
