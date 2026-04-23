# Edit Decision List

Every cut is snapped to a word boundary from the packed transcript. Timestamps are source-relative (HH:MM:SS.mmm). Never cut inside a word.

| # | Source file | In (word-boundary) | Out (word-boundary) | Pad (ms) | Overlay | Notes |
|---|---|---|---|---|---|---|
|   |   |   |   |   |   |   |

## Overlay references

- Overlay tool (Manim / Remotion / PIL):
- Timing shift formula: `setpts=PTS-STARTPTS+T/TB`

## Caption strategy

- Packed phrase-level transcript path:
- Subtitles applied last, after all overlays.
