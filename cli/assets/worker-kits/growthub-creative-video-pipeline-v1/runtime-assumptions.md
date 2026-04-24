# Runtime Assumptions — Creative Video Pipeline

## Required dependencies

| Dependency | Version | Purpose |
|---|---|---|
| Node.js | >= 20 | CLI, Vite dev, Next.js dev |
| Git | any | Fork registration |
| FFmpeg | any | Stage 3 video render |
| Python 3 | >= 3.11 | video-use upstream pipeline |
| pip | any | video-use install |

Optional:

| Dependency | Purpose |
|---|---|
| yt-dlp | Downloading online source clips for Stage 3 |

## Required secrets

| Env var | Required when | Notes |
|---|---|---|
| `ELEVENLABS_API_KEY` | Always (Stage 3) | ElevenLabs Scribe word-level transcription |
| `GROWTHUB_BRIDGE_ACCESS_TOKEN` | `ADAPTER=growthub-pipeline` | Auth token from `growthub auth login` |
| `GROWTHUB_BRIDGE_BASE_URL` | `ADAPTER=growthub-pipeline` | Growthub hosted base URL |
| `GOOGLE_AI_API_KEY` | `ADAPTER=byo-api-key`, `PROVIDER=veo` | Google AI / Vertex key |
| `FAL_API_KEY` | `ADAPTER=byo-api-key`, `PROVIDER=fal` | fal.ai key |
| `RUNWAY_API_KEY` | `ADAPTER=byo-api-key`, `PROVIDER=runway` | Runway key |

## Workspace paths

| Path | Default | Purpose |
|---|---|---|
| `CREATIVE_VIDEO_PIPELINE_HOME` | `$HOME/creative-video-pipeline` | Kit workspace root |
| `VIDEO_USE_HOME` | `$HOME/video-use` | video-use upstream fork |
| `CREATIVE_STRATEGIST_HOME` | `$HOME/creative-strategist` | Optional: hooks library source |

## Growthub CLI

Minimum version: `0.4.3`. Verify:

```bash
growthub --version
```

Required for `growthub pipeline execute` (Stage 2, primary adapter) and `growthub kit fork` commands.

## video-use fork

Cloned to `${VIDEO_USE_HOME:-$HOME/video-use}` by `setup/clone-fork.sh`. Registered as a Claude Code skill by `setup/install-skill.sh`. Required for Stage 3.

## Claude Code skill

`~/.claude/skills/video-use` symlink must be present for conversational edit flow. Set up by `setup/install-skill.sh`.

## Credential hygiene

- No secrets are stored in this kit.
- All secrets live in the per-fork `.env` (not committed).
- `ELEVENLABS_API_KEY` must never appear in any output artifact.
- Provider keys must never appear in any output artifact.
