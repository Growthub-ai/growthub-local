# Review QA Checklist

## Project Reference

| Field | Value |
|---|---|
| Client | `<client-name>` |
| Project | `<project-name>` |
| Pipeline | `<selected-pipeline>` |
| Date | `YYYY-MM-DD` |

## Pre-Compose Validation

- [ ] All scene assets exist and are accessible (URLs resolve, files present)
- [ ] Asset resolutions match the target render profile
- [ ] Audio tracks are present and duration-matched to scene plan
- [ ] Subtitle timing is aligned to narration word boundaries
- [ ] Delivery promise is achievable with available tools
- [ ] Budget is within approved cap
- [ ] No placeholder or draft assets remain in the batch plan

## Composition Review

- [ ] Scene order matches scene plan
- [ ] Transitions render correctly (no black frames, no jumps)
- [ ] Audio levels are consistent across scenes (no clipping, no drops)
- [ ] Subtitles are readable against all backgrounds
- [ ] Lower thirds and overlays are positioned correctly
- [ ] Opening and closing frames are intentional (no abrupt start/end)

## Post-Render Self-Review

- [ ] ffprobe validation: codec, resolution, duration, bitrate match spec
- [ ] Frame extraction: first, middle, last, and transition frames look correct
- [ ] Audio analysis: consistent levels, no silence gaps, no clipping
- [ ] Subtitle check: timing accuracy, no overlapping text
- [ ] Platform compliance: aspect ratio, duration, file size within limits

## Slideshow Risk Assessment (image-based video only)

| Dimension | Score (1-10) | Notes |
|---|---|---|
| Motion variety | | |
| Transition diversity | | |
| Animation layer count | | |
| Audio-visual sync | | |
| Pacing variation | | |
| Visual grammar complexity | | |
| **Average** | **—** | Minimum 6.0 to proceed |

## Final Sign-Off

| Gate | Status | Reviewer |
|---|---|---|
| Pre-compose | `<pass / fail>` | |
| Composition | `<pass / fail>` | |
| Post-render | `<pass / fail>` | |
| Slideshow risk (if applicable) | `<pass / fail / n/a>` | |
| **Overall** | `<approved / blocked>` | |
