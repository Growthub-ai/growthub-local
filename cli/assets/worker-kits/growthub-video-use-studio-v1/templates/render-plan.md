# Render Plan

## Source resolution

```bash
WORKSPACE="${VIDEO_USE_HOME:-${VIDEO_USE_FORK_PATH:-$HOME/video-use}}"
PROJECT_DIR="${WORKSPACE}/<project>"
```

## Transcription (idempotent — never re-transcribe a cached source)

```bash
cd "${PROJECT_DIR}"
# ElevenLabs Scribe, keyed by ELEVENLABS_API_KEY from .env
python -m video_use.transcribe --source <input.mp4>
```

## Render

```bash
cd "${PROJECT_DIR}"
python -m video_use.render \
  --edl ../output/<client-slug>/<project-slug>/edit-decision-list.md \
  --overlay <manim|remotion|pil> \
  --out edit/final.mp4
```

## FFmpeg hard constraints

- 30 ms audio fade at every segment boundary.
- Word-boundary snapping for all cuts; pad edges 30–200 ms.
- Overlays shifted with `setpts=PTS-STARTPTS+T/TB`.
- Subtitles are applied last.

## Checks

- Output path: `${PROJECT_DIR}/edit/final.mp4`
- Duration matches brief (± 500 ms)
- Codec: h264, audio: aac
- Self-evaluation loop runs up to 3 times before surfacing output
