# Runtime Assumptions

- Upstream project: `https://github.com/browser-use/video-use`
- Python `>=3.11` with `pip` available
- `ffmpeg` available in PATH (required)
- `yt-dlp` available in PATH (optional — only for downloading online sources)
- `ELEVENLABS_API_KEY` set in `.env` — required for transcript generation via ElevenLabs Scribe
- `~/.claude/skills/video-use` symlink present — set up by `setup/install-skill.sh`
- Commands run from an exported working directory; raw footage lives under `${VIDEO_USE_HOME}/<project>/`
