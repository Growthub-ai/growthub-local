# Provider Adapter Layer

This kit is a custom workspace package and does not add a new server adapter or agent harness.

It relies on:

- Worker kit export contract
- Working Directory execution
- Upstream `browser-use/video-use` fork
- ElevenLabs Scribe (transcription) via `ELEVENLABS_API_KEY`
- Local FFmpeg for render
- Optional `yt-dlp` for pulling online sources
- Claude Code skill loader at `~/.claude/skills/video-use`

No credentials are stored in this repo. All secrets live in the per-export `.env`.
