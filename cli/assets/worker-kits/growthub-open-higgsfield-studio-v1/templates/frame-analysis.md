# Frame Analysis Primitive

Use this when the operator has a local reference video and the shot plan should mirror proven pacing or framing.

## Extraction

```bash
mkdir -p /tmp/open_higgsfield_frames
ffmpeg -i "/path/to/reference.mp4" -vf fps=1/2 /tmp/open_higgsfield_frames/frame_%04d.jpg
```

## Record per frame cluster

| Cluster | Approx time | What changes | Composition | Motion | Text rhythm | Notes |
|---|---|---|---|---|---|---|
| C01 | | | | | | |

## Convert analysis into planning

1. identify shot boundaries
2. name the narrative function of each segment
3. map each segment to a studio and model
4. convert visual observations into prompt controls
5. add continuity rules to the shot plan
