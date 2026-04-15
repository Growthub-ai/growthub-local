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

## Setup — One Command (Mac / Windows / Linux)

From the exported kit folder:

```bash
node setup/setup.mjs
```

That single command:

1. Detects your host OS (macOS / Windows / Linux)
2. Checks dependencies (Node 18+ required; `curl` and `git` optional)
3. Copies `.env.example` → `.env` if you don't have one yet
4. Runs `setup/verify-env.mjs` to validate your `ZERNIO_API_KEY` format and live-reachability against `GET /api/v1/profiles`
5. Prints the exact next step for your OS

**No bash required on Windows.** Everything runs under Node. PowerShell, cmd, WSL, git-bash all work identically.

### After the first run

Open `.env` and fill in:

| Variable | Required? | What to put |
|---|---|---|
| `ZERNIO_API_KEY` | Yes (for live mode) | `sk_` + 64 hex characters — create one at [zernio.com/signup](https://zernio.com/signup) or via `POST /api/v1/api-keys` |
| `ZERNIO_API_URL` | Yes | Default `https://zernio.com/api/v1` — override only for regional / proxy deployments |
| `ZERNIO_PROFILE_ID` | Yes (for scheduling) | The profile you'll post from — find it in the Zernio dashboard |
| `ZERNIO_TIMEZONE` | Optional | IANA tz name (e.g. `America/New_York`); defaults to the profile's timezone |
| `ANTHROPIC_API_KEY` | Optional | Only for enhanced caption drafting in hybrid mode |

Re-run `node setup/setup.mjs` after editing `.env` to confirm everything is valid.

### Agent-only mode (no Zernio key needed)

If you just want to plan, write captions, and produce dry-run manifests without touching the Zernio API, skip the key entirely:

```bash
node setup/setup.mjs --skip-verify
```

The operator falls back cleanly to `agent-only` mode and produces manifests with `"dryRun": true` that you can submit manually later.

---

## Open Your IDE

Point your IDE's Working Directory at this exported folder. The agent entrypoint is `workers/zernio-social-operator/CLAUDE.md`.

### macOS

```bash
open .
# or specifically:
open -a "Claude" .                 # Claude Desktop with this folder
code .                             # VS Code / Cursor
```

### Windows (PowerShell)

```powershell
start .
# or specifically:
code .                             # VS Code / Cursor
```

### Linux

```bash
xdg-open .
code .
```

Any of these IDEs can drive the operator from this folder:

- Claude Code (CLI)
- Claude Desktop
- Codex
- Cursor
- Gemini CLI
- OpenCode
- Qwen Code CLI
- Open Agents

See `docs/local-adapters.md` for per-IDE setup notes + optional MCP server install.

---

## What the per-OS paths look like

| OS | Exported kit path after `growthub kit download` |
|---|---|
| macOS | `~/paperclip/kits/exports/growthub-agent-worker-kit-zernio-social-v1/` |
| Linux | `~/paperclip/kits/exports/growthub-agent-worker-kit-zernio-social-v1/` |
| Windows | `%USERPROFILE%\paperclip\kits\exports\growthub-agent-worker-kit-zernio-social-v1\` |

Override the export path with `--out <path>` on `growthub kit download`.

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
| `setup/setup.mjs` | **One-command cross-platform bootstrap — start here** |
| `setup/verify-env.mjs` | Validates `ZERNIO_API_KEY` + live reachability |
| `setup/check-deps.mjs` | Cross-platform Node dependency check (Windows parity) |
| `setup/check-deps.sh` | Legacy Unix bash dependency check (Mac / Linux) |
| `setup/install-mcp.mjs` | Prints per-IDE MCP config JSON for plugging in Zernio's official MCP server |
| `workers/zernio-social-operator/CLAUDE.md` | Agent operating instructions |
| `skills.md` | Full methodology — read at every session |
| `brands/_template/brand-kit.md` | Blank brand kit template |
| `brands/growthub/brand-kit.md` | Growthub reference example |
| `output/README.md` | Output directory structure and naming |
| `docs/zernio-api-integration.md` | How this kit integrates with Zernio (REST contract + plans + capability surface) |
| `docs/platform-coverage.md` | All 14 supported platforms with format specs |
| `docs/ai-caption-layer.md` | AI caption generation methodology |
| `docs/posts-and-queues-layer.md` | Scheduling manifest + queue format for Zernio API |
| `docs/local-adapters.md` | Per-IDE setup matrix (Claude Code / Desktop / Codex / Cursor / Gemini / OpenCode / Qwen / Open Agents) |
| `docs/postiz-ui-shell-integration.md` | Optional — run this kit as the engine under the Postiz UI shell |
| `validation-checklist.md` | Pre-session checklist |
