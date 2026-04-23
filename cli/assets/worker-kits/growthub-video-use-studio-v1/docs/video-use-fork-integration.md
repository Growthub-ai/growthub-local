# Video Use Fork Integration

Upstream repository:

- `https://github.com/browser-use/video-use`

Primary execution flow:

1. Clone + install with `setup/clone-fork.sh` (runs `pip install -e .` inside the fork).
2. Register as a Claude Code skill with `setup/install-skill.sh` (symlinks the fork into `~/.claude/skills/video-use`).
3. Stage raw footage under `${VIDEO_USE_HOME}/<project>/`.
4. Launch `claude` from the project directory and start the conversational edit loop.

Pipeline contract (upstream):

```
inventory → transcribe (ElevenLabs Scribe) → pack phrase-level transcript
         → converse + propose strategy (4–8 sentences)
         → user confirmation
         → EDL generation (word-boundary cuts)
         → render (FFmpeg + Manim / Remotion / PIL overlays)
         → self-evaluation (up to 3 iterations)
         → final.mp4 at <project>/edit/final.mp4
```

Session persistence:

- Every confirmed decision is appended to `project.md` inside the source video directory.

Two-layer architecture:

- Layer 1 — ElevenLabs Scribe transcript (word-level, speaker-tagged, audio-event markers). The packed transcript is the editor's primary reading view (≈12 KB text + occasional PNGs).
- Layer 2 — Visual composites (filmstrip / waveform / word labels) generated on-demand for ambiguous decision points only.

Token budget: orders of magnitude lower than raw frame processing.
