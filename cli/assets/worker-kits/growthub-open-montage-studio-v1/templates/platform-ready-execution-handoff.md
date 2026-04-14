# Platform-Ready Execution Handoff

## Project Reference

| Field | Value |
|---|---|
| Client | `<client-name>` |
| Project | `<project-name>` |
| Pipeline | `<selected-pipeline>` |
| Execution mode | `<local-fork / agent-only / hybrid>` |
| Date | `YYYY-MM-DD` |

## Deliverable Summary

| Field | Value |
|---|---|
| Video title | |
| Duration | `<seconds>` |
| Resolution | `<WxH>` |
| Aspect ratio | `<ratio>` |
| Platform target | `<YouTube / TikTok / Instagram / LinkedIn>` |
| Estimated cost | `$—` |
| Actual cost | `$—` |

## Execution Instructions

### For local-fork mode

```bash
cd ~/OpenMontage

# 1. Verify environment
python -c "from tools.tool_registry import registry; registry.discover(); print('OK')"

# 2. Run the pipeline
# The agent executes each stage in order:
#   research → proposal → script → scene_plan → assets → edit → compose

# 3. Final render location
# Output: output/<project-slug>/final-render.<ext>
```

### For agent-only mode (CMS node generation)

1. Execute CMS nodes via GrowthHub hosted execution:

| Step | CMS Node Slug | Inputs | Expected Output |
|---|---|---|---|
| 1 | | | |
| 2 | | | |

2. Collect output URLs from CMS node execution results
3. Follow post-production guidance below

### For hybrid mode

1. Generate assets via CMS nodes (see agent-only instructions above)
2. Run local OpenMontage post-production:

```bash
cd ~/OpenMontage
# Composition, audio mixing, subtitle burn-in, color grading
# Use the scene plan and prompt matrix from this handoff
```

## Asset Manifest

| ID | Type | Source | URL / Path | Status |
|---|---|---|---|---|
| | | | | |

## Post-Production Steps

| Step | Tool | Input | Output | Notes |
|---|---|---|---|---|
| 1 | Remotion / FFmpeg | Scene assets | Draft composition | |
| 2 | Subtitle gen | Narration audio | SRT/VTT file | |
| 3 | FFmpeg | Draft + subtitles | Subtitled render | |
| 4 | FFmpeg | Subtitled render | Color-graded final | Optional |

## Render Profile

| Field | Value |
|---|---|
| Resolution | |
| FPS | |
| Codec | |
| Bitrate | |
| Audio codec | |
| Container | |

## Known Limitations

<!-- Any manual steps, unsupported features, or quality compromises. -->

## Approval

| Gate | Status |
|---|---|
| Production brief approved | `<yes / no>` |
| Budget approved | `<yes / no>` |
| QA checklist passed | `<yes / no>` |
| Ready for execution | `<yes / no>` |
