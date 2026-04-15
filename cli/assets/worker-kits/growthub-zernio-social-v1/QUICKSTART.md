# Growthub Zernio Social Media Studio — Quickstart

**Kit:** `growthub-zernio-social-v1`
**Worker:** `zernio-social-operator`
**Platform:** [Zernio](https://zernio.com) — unified social media REST API for developers and AI agents

---

## What This Kit Does

The Growthub Zernio Social Media Studio is a self-contained AI agent environment for planning, drafting, scheduling, and analyzing social media campaigns against the Zernio REST API. It produces:

- Social campaign briefs (objective, platforms, audience, KPIs)
- 30/60/90-day content calendars with theme pillars
- Platform publishing plans for 14 social networks
- Caption copy decks with A/B/C variants per post
- Zernio-shaped scheduling manifests (`POST /api/v1/posts`) + recurring queue definitions
- Analytics briefings (engagement, reach, growth signals)
- Client-ready proposals with platform mix and ROI projections

Supported platforms: X/Twitter, Instagram, Facebook, LinkedIn, TikTok, YouTube, Pinterest, Reddit, Bluesky, Threads, Google Business, Telegram, Snapchat, WhatsApp. See `docs/platform-coverage.md` for the full list.

---

## Setup — 5 Steps

### Step 1 — Point Your Working Directory

Export this kit to a local folder and point Claude Code's Working Directory at the kit root. All paths in the kit are relative to the kit root.

### Step 2 — Copy the Environment File

```bash
cp .env.example .env
```

Fill in your Zernio API key and the target profile id. Platform OAuth is handled inside Zernio — no per-platform tokens live in this kit.

### Step 3 — Verify the Environment

```bash
node setup/verify-env.mjs
```

This checks:

- `ZERNIO_API_KEY` is set and matches the `sk_` + 64 hex format
- `ZERNIO_API_URL` is reachable (default `https://zernio.com/api/v1`)
- Current API key is accepted by `GET /api/v1/profiles`
- `ZERNIO_PROFILE_ID` exists in your account
- `ANTHROPIC_API_KEY` is a plausible format (optional — used only for caption enhancement)

No OAuth tokens are validated here — those are managed inside the Zernio dashboard.

### Step 4 — Check Dependencies

```bash
bash setup/check-deps.sh
```

Verifies `node` (18+), `curl`, and `git` are available.

### Step 5 — Start a Session

Open Claude Code, set the Working Directory to this kit root, and start your session. The operator will guide you through the 10-step workflow.

---

## Execution Modes

| Mode | Requirements | Use When |
|---|---|---|
| `api-live` | Valid `ZERNIO_API_KEY` + at least one connected account on a profile | You want to schedule posts and queues via the live Zernio API |
| `agent-only` | Nothing — Claude Code handles everything | You need campaign planning, calendars, and captions without touching the Zernio API |
| `hybrid` | `ANTHROPIC_API_KEY` + valid `ZERNIO_API_KEY` | Enhanced caption drafting via Anthropic plus live Zernio scheduling |
| `postiz-ui-shell` | `api-live` / `hybrid` + the Postiz kit (`growthub-postiz-social-v1`) running | You want Postiz's UI (calendar, compose, analytics shell) with Zernio as the transport engine. See `docs/postiz-ui-shell-integration.md` for the 7-module bridge. |

**Agent-only mode is always valid.** Zernio reachability never blocks campaign planning.

---

## First Run

1. Tell the operator: **"Plan a 30-day Instagram + LinkedIn campaign for [your brand]"**
2. The operator asks the 4-question gate (client, platforms, objective, cadence)
3. The operator runs the 10-step workflow and produces all campaign artifacts
4. Output is saved to `output/<client-slug>/<project-slug>/`

---

## New Client Setup

See `brands/NEW-CLIENT.md` for instructions on adding a new client brand kit.

Quick version:

```bash
cp brands/_template/brand-kit.md brands/<client-slug>/brand-kit.md
# Then fill in the fields in the new file
```

---

## Available Commands

Tell the operator which you need:

| Command | What It Does |
|---|---|
| `/zernio campaign` | Full campaign brief + content calendar + publishing plan |
| `/zernio calendar` | Content calendar only — existing brief provided |
| `/zernio captions` | Caption copy deck for a specific platform or batch |
| `/zernio schedule` | Generate Zernio-shaped scheduling manifest (`POST /api/v1/posts`) |
| `/zernio queue` | Define or update a recurring Zernio queue (time slots) |
| `/zernio analytics` | Analytics briefing from Zernio API metrics or provided data |
| `/zernio inbox` | Draft replies for DMs, comments, reviews in the Zernio unified inbox |
| `/zernio proposal` | Client-ready proposal with platform mix and ROI projection |
| `/zernio platforms` | Platform coverage report for a specific client context |
| `/zernio quick` | 30-second campaign snapshot for a domain or brand |

---

## Key Files

| File | Purpose |
|---|---|
| `workers/zernio-social-operator/CLAUDE.md` | Agent operating instructions (start here) |
| `skills.md` | Full methodology — read at every session |
| `brands/_template/brand-kit.md` | Blank brand kit template |
| `brands/growthub/brand-kit.md` | Growthub reference example |
| `output/README.md` | Output directory structure and naming |
| `docs/zernio-api-integration.md` | How this kit integrates with Zernio |
| `docs/platform-coverage.md` | All 14 supported platforms with format specs |
| `docs/ai-caption-layer.md` | AI caption generation methodology |
| `docs/posts-and-queues-layer.md` | Scheduling manifest + queue format for Zernio API |
| `docs/postiz-ui-shell-integration.md` | Optional — how to run this kit as the engine under the Postiz UI shell (`growthub-postiz-social-v1`) |
| `validation-checklist.md` | Pre-session checklist |
