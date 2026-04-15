# Growthub Postiz Social Media Studio — Quickstart

**Kit:** `growthub-postiz-social-v1`
**Worker:** `postiz-social-operator`
**Platform:** [Postiz](https://github.com/gitroomhq/postiz-app)

---

## What This Kit Does

The Growthub Postiz Social Media Studio is a self-contained AI agent environment for planning, drafting, scheduling, and analyzing social media campaigns using the Postiz open-source platform. It wraps the self-hosted Postiz workspace to produce:

- Social campaign briefs (objective, platforms, audience, KPIs)
- 30/60/90-day content calendars with theme pillars
- Platform publishing plans for 28+ social networks
- Caption copy decks with A/B/C variants per post
- BullMQ-compatible scheduling manifests for Postiz API
- Analytics briefings (engagement, reach, growth signals)
- Client-ready proposals with platform mix and ROI projections

Supported platforms include: Instagram, LinkedIn, TikTok, X/Twitter, YouTube, Pinterest, Reddit, Bluesky, Facebook, Mastodon, Slack, Telegram, and 16+ more. See `docs/platform-coverage.md` for the full list.

---

## Setup — 6 Steps

### Step 1 — Point Your Working Directory

Export this kit to a local folder and point Claude Code's Working Directory at the kit root. All paths in the kit are relative to the kit root.

### Step 2 — Copy the Environment File

```bash
cp .env.example .env
```

Fill in your Postiz workspace credentials and API endpoint. No platform OAuth tokens are stored in this kit — those live inside the Postiz admin UI.

### Step 3 — Verify the Environment

```bash
node setup/verify-env.mjs
```

This checks:
- Whether the Postiz fork is cloned at `POSTIZ_FORK_PATH` (default: `~/postiz-app`)
- Whether the Postiz API is reachable on port 3000
- Whether `ANTHROPIC_API_KEY` is valid format (if set for AI caption enhancement)
- No OAuth tokens are validated here — those are managed inside Postiz

### Step 4 — Check Dependencies

```bash
bash setup/check-deps.sh
```

Verifies that `node`, `docker`, `docker compose`, and `git` are available. Checks Node.js version (18+ required). Checks Docker engine is running.

### Step 5 — Clone and Start the Postiz Workspace (Local-Fork Mode Only)

```bash
bash setup/clone-fork.sh
```

This clones `postiz-app` to `~/postiz-app` (or `POSTIZ_FORK_PATH` if set), runs `docker compose up -d` to start Redis, PostgreSQL, and the Postiz API, and waits for the API healthcheck to pass.

Skip this step if you are using **agent-only mode** — the operator can plan campaigns, draft captions, and produce content calendars without a running Postiz instance.

### Step 6 — Start a Session

Open Claude Code, set the Working Directory to this kit root, and start your session. The operator will guide you through the 10-step workflow.

---

## Execution Modes

| Mode | Requirements | Use When |
|---|---|---|
| `local-fork` | Node 18+, Docker, Postiz running | You want to schedule posts via the Postiz API and use multi-workspace features |
| `agent-only` | Nothing — Claude handles everything | You need campaign planning, content calendars, and caption drafts without a running instance |
| `hybrid` | ANTHROPIC_API_KEY + Postiz running | Best of both — agent reasoning with live Postiz API scheduling |

---

## First Run

1. Tell the operator: **"Plan a 30-day Instagram + LinkedIn campaign for [your brand]"**
2. The operator will ask 4 clarifying questions (client, platforms, objective, cadence)
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
| `/postiz campaign` | Full campaign brief + content calendar + publishing plan |
| `/postiz calendar` | Content calendar only — existing brief provided |
| `/postiz captions` | Caption copy deck for a specific platform or batch |
| `/postiz schedule` | Generate BullMQ-compatible scheduling manifest |
| `/postiz analytics` | Analytics briefing from Postiz API data or provided metrics |
| `/postiz proposal` | Client-ready proposal with platform mix and ROI projection |
| `/postiz platforms` | Platform coverage report for a specific client context |
| `/postiz quick` | 30-second campaign snapshot for a domain or brand |

---

## Key Files

| File | Purpose |
|---|---|
| `workers/postiz-social-operator/CLAUDE.md` | Agent operating instructions (start here) |
| `skills.md` | Full methodology — read at every session |
| `brands/_template/brand-kit.md` | Blank brand kit template |
| `brands/growthub/brand-kit.md` | Growthub reference example |
| `output/README.md` | Output directory structure and naming |
| `docs/postiz-fork-integration.md` | How this kit integrates with Postiz |
| `docs/platform-coverage.md` | All 28+ supported platforms with format specs |
| `docs/ai-caption-layer.md` | AI caption generation methodology |
| `docs/bullmq-queue-layer.md` | Scheduling manifest format for Postiz API |
| `validation-checklist.md` | Pre-session checklist |
