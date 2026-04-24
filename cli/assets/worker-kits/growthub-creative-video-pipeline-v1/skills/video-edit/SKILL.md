---
id: creative-video-pipeline/video-edit
version: 1.0.0
triggers:
  - "run edit stage"
  - "stage 3 edit"
  - "assemble final video"
  - "video-use edit"
selfEval:
  criteria:
    - "edit-plan.md written from generative manifest and brief"
    - "VIDEO_USE_HOME is set and resolves to a cloned video-use fork"
    - "Handoff to video-use fork executed — do not duplicate video-use pipeline logic"
    - "final.mp4 copied to output/<client>/<project>/final/"
    - "project.md and trace.jsonl updated with Stage 3 completion"
  maxRetries: 3
---

# Video Edit Sub-Skill

## Role
Execute Stage 3: delegate edit to the `VIDEO_USE_HOME` video-use fork and collect final output.

## Dependencies
- `VIDEO_USE_HOME` — absolute path to video-use fork clone
- `ELEVENLABS_API_KEY` — for ElevenLabs Scribe word-level transcription
- `ffmpeg` — must be on PATH inside the video-use fork environment

## Process
1. Read `output/<client>/<project>/generative/manifest.json` to identify source clips
2. Read `output/<client>/<project>/brief/pipeline-brief.md` for editing guidelines
3. Write `output/<client>/<project>/edit-plan.md` from `templates/edit-plan.md`
4. Delegate to video-use fork — do NOT inline video-use logic here
5. Copy final rendered `final.mp4` to `output/<client>/<project>/final/final.mp4`
6. Append Stage 3 completion to `project.md` and `trace.jsonl`

## Handoff
The video-use fork owns the full Scribe → word-boundary EDL → FFmpeg render pipeline.
This sub-skill's only job is to form the `edit-plan.md` handoff and collect the output artifact.
