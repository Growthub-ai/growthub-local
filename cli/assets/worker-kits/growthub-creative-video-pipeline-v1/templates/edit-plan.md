# Edit Plan — [CLIENT] / [PROJECT]
> Stage 3 planning artifact. Hand this to the video-use agent alongside `pipeline-brief.md`.

---

## Source clips

| # | File | Duration | Scene | From manifest |
|---|---|---|---|---|
| 1 | generative/scene1-hook-a.mp4 | 5s | Hook A | manifest.json #id |
| 2 | generative/scene2.mp4 | 8s | Problem | manifest.json #id |
| N | generative/sceneN.mp4 | 5s | CTA | manifest.json #id |

VIDEO_USE_HOME staging path: `${VIDEO_USE_HOME}/<project>/`

---

## Cut strategy

- **Target duration:** [N]s
- **Opening hook:** Scene 1 (Hook [A–E] selected for this cut)
- **Core through-line:** Problem → Solution → CTA
- **Pacing bias:** tight (cut every ~3s) / breathing / mixed
- **Word-boundary cuts:** always — never cut inside a word
- **30 ms audio fades** at every segment boundary

---

## Overlay plan

| Time | Overlay | Tool | Notes |
|---|---|---|---|
| 0:00 | On-screen text: "[hook text]" | Manim / PIL | From brief Scene 1 |
| 0:05 | Caption track starts | FFmpeg subtitle filter | Subtitles applied last |
| 0:25 | CTA card: "[cta text]", [phone], [url] | Manim / PIL | From brand kit |

Subtitles are applied **last** — after all overlays. `setpts=PTS-STARTPTS+T/TB` for timing.

---

## Music direction

- **Style:** [description]
- **Tempo:** [BPM guidance]
- **Fade in/out:** [direction]

---

## Render target

| Format | Codec | Resolution | Aspect |
|---|---|---|---|
| MP4 | h264 | 1080×1920 | 9:16 |
| MP4 | h264 | 1080×1080 | 1:1 (if required) |

Output: `output/<client>/<project>/final/final.mp4`

---

## QA pass criteria

- [ ] Duration within ±10% of target
- [ ] Audio fades present at every segment boundary
- [ ] Subtitles applied last and aligned to phrase transcript
- [ ] No API keys or secrets in rendered output
- [ ] All 12 video-use production rules pass (see video-use qa-checklist.md)
