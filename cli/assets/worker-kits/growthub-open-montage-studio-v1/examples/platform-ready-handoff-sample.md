# Platform-Ready Execution Handoff

## Project Reference

| Field | Value |
|---|---|
| Client | Growthub |
| Project | How Neural Networks Learn — 60s Explainer |
| Pipeline | Animated Explainer |
| Execution mode | local-fork |
| Date | 2026-04-14 |

## Deliverable Summary

| Field | Value |
|---|---|
| Video title | How Neural Networks Learn |
| Duration | 62 seconds |
| Resolution | 1920x1080 |
| Aspect ratio | 16:9 |
| Platform target | YouTube |
| Estimated cost | $0.45 |
| Actual cost | $0.38 |

## Execution Instructions

### For local-fork mode

```bash
cd ~/OpenMontage

# 1. Verify environment
python -c "from tools.tool_registry import registry; registry.discover(); print('OK')"

# 2. The agent executed the Animated Explainer pipeline:
#    research → proposal → script → scene_plan → assets → edit → compose
#
#    Research: 18 web searches across YouTube, Reddit, ArXiv
#    Proposal: 3 concepts presented, user selected concept B (metaphor-driven)
#    Script: 62-second narrated script with 12 scene markers
#    Assets: 12 FLUX images + 1 Piper TTS narration + 1 royalty-free BGM
#    Edit: Remotion composition with spring animations and crossfade transitions
#    Compose: FFmpeg final render with burned-in subtitles

# 3. Final render
# Output: output/growthub/neural-networks-explainer/assets/render/final.mp4
```

## Asset Manifest

| ID | Type | Source | URL / Path | Status |
|---|---|---|---|---|
| A-001 | image | FLUX (fal.ai) | assets/images/01-image-001.png | ready |
| A-002 | image | FLUX (fal.ai) | assets/images/02-image-001.png | ready |
| A-003 | image | FLUX (fal.ai) | assets/images/03-image-001.png | ready |
| A-004 | image | FLUX (fal.ai) | assets/images/04-image-001.png | ready |
| A-005 | image | FLUX (fal.ai) | assets/images/05-image-001.png | ready |
| A-006 | image | FLUX (fal.ai) | assets/images/06-image-001.png | ready |
| A-007 | image | FLUX (fal.ai) | assets/images/07-image-001.png | ready |
| A-008 | image | FLUX (fal.ai) | assets/images/08-image-001.png | ready |
| A-009 | image | FLUX (fal.ai) | assets/images/09-image-001.png | ready |
| A-010 | image | FLUX (fal.ai) | assets/images/10-image-001.png | ready |
| A-011 | image | FLUX (fal.ai) | assets/images/11-image-001.png | ready |
| A-012 | image | FLUX (fal.ai) | assets/images/12-image-001.png | ready |
| A-013 | narration | Piper TTS | assets/audio/narration.wav | ready |
| A-014 | music | Royalty-free | assets/audio/bgm.mp3 | ready |
| A-015 | subtitles | Built-in | assets/audio/subtitles.srt | ready |
| A-016 | render | Remotion + FFmpeg | assets/render/final.mp4 | ready |

## Post-Production Steps

| Step | Tool | Input | Output | Notes |
|---|---|---|---|---|
| 1 | Remotion | 12 scene images + animation config | Draft composition | Spring physics, crossfade transitions, Ken Burns |
| 2 | WhisperX | Narration audio | Word-level SRT | Aligned to narration timing |
| 3 | FFmpeg | Draft + narration + BGM + SRT | Final render | H.264, 1920x1080, 30fps, 8 Mbps |

## Render Profile

| Field | Value |
|---|---|
| Resolution | 1920x1080 |
| FPS | 30 |
| Codec | H.264 |
| Bitrate | 8 Mbps |
| Audio codec | AAC |
| Container | MP4 |

## Known Limitations

- Image-based video — no actual motion clips. Remotion provides animated transitions, zoom, and Ken Burns effects to mitigate slideshow risk.
- Slideshow risk score: 7.2/10 (above 6.0 threshold — approved).

## Approval

| Gate | Status |
|---|---|
| Production brief approved | yes |
| Budget approved | yes |
| QA checklist passed | yes |
| Ready for execution | yes |
