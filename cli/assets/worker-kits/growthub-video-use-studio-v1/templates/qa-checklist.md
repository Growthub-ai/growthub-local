# QA Checklist — Twelve Production Rules

- [ ] Subtitles applied last, after every overlay
- [ ] 30 ms audio fade at every segment boundary
- [ ] Overlays shifted with `setpts=PTS-STARTPTS+T/TB`
- [ ] Every cut snapped to a word boundary
- [ ] Cut edges padded 30–200 ms
- [ ] No cut inside a word
- [ ] No re-transcription of a cached source
- [ ] Caption alignment matches the packed phrase-level transcript
- [ ] 30 ms fade-out on every overlay exit
- [ ] Subtitle sequencing respects speaker turns
- [ ] Output validated (duration, codec, resolution) before handoff
- [ ] Every destructive edit decision appended to `project.md`

## Delivery checks

- [ ] Duration matches brief (± 500 ms)
- [ ] Aspect ratio correct
- [ ] Audio sync verified
- [ ] `${VIDEO_USE_HOME}/<project>/edit/final.mp4` exists and plays end-to-end
