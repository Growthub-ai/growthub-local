# Video Use Studio Skills

1. Read `runtime-assumptions.md`.
2. Read `docs/video-use-fork-integration.md`.
3. Confirm target format: content type, target length, aesthetic direction.
4. Produce, in order:
   - `templates/video-brief.md` — source inventory, goal, audience, duration
   - `templates/edit-strategy.md` — 4–8 sentence proposed approach, wait for confirmation
   - `templates/edit-decision-list.md` — transcript-anchored EDL with word-boundary cuts
   - `templates/render-plan.md` — FFmpeg commands, overlay tool choice (Manim / Remotion / PIL)
   - `templates/qa-checklist.md` — twelve production rules pass, subtitles-last validation

Non-negotiable rules enforced by this kit:

- Subtitles are applied last, after all overlays.
- 30 ms audio fades at every segment boundary.
- Word-boundary snapping for every cut; never cut inside a word.
- Overlays use `setpts=PTS-STARTPTS+T/TB` for timing.
- Cached transcripts are reused; never re-transcribe a source twice.

Use deterministic command paths. Resolve workspace with `${VIDEO_USE_HOME:-$HOME/video-use}`. Never expose `ELEVENLABS_API_KEY` in output artifacts.
