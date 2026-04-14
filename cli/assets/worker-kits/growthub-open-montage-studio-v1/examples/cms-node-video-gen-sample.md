# CMS Node Integration Example — Video Generation

This example shows how a GrowthHub CMS video-generation node integrates into an OpenMontage Cinematic pipeline.

---

## Scenario

A user wants to create a 30-second cinematic product trailer. They have a GrowthHub session with access to the `video-generation` CMS node (which routes to a hosted video generation provider). They also have a local OpenMontage clone for post-production.

**Execution mode:** hybrid

---

## Step 1 — Discover Available CMS Nodes

The agent queries the CMS capability registry:

```
Family: video
Execution kind: hosted-execute
```

Result:
- `video-generation` — family: video, executionKind: hosted-execute, outputTypes: ["video_url"]

---

## Step 2 — Map CMS Node to Pipeline Stage

| CMS Node | Pipeline Stage | Role |
|---|---|---|
| `video-generation` | `assets` | Generate 4 motion clips for scene footage |

The `video-generation` CMS node replaces what would normally be a direct `kling_video` or `veo_video` tool call in the OpenMontage pipeline.

---

## Step 3 — Prepare Input Bindings

For each scene clip, the agent prepares CMS node inputs:

| Scene | Input Key | Value |
|---|---|---|
| 1 | prompt | "Cinematic close-up of a glowing smart water bottle rotating slowly on a dark surface, volumetric lighting, product photography" |
| 1 | duration | 5 |
| 1 | aspect_ratio | "16:9" |
| 2 | prompt | "Hand reaching for the smart water bottle, LED ring pulsing blue, shallow depth of field, warm lighting" |
| 2 | duration | 5 |
| 2 | aspect_ratio | "16:9" |

---

## Step 4 — Execute CMS Nodes

The agent triggers hosted execution for each scene:

```
CMS Node: video-generation
Execution: hosted-execute via HostedExecutionClient
Result: { outputUrl: "https://cdn.growthub.ai/gen/abc123.mp4", status: "completed" }
```

---

## Step 5 — Feed Outputs into OpenMontage

The output URLs from CMS node execution become source assets in the OpenMontage pipeline:

```
Scene 1 source clip: https://cdn.growthub.ai/gen/abc123.mp4
Scene 2 source clip: https://cdn.growthub.ai/gen/def456.mp4
Scene 3 source clip: https://cdn.growthub.ai/gen/ghi789.mp4
Scene 4 source clip: https://cdn.growthub.ai/gen/jkl012.mp4
```

These feed into the `edit` and `compose` stages of the Cinematic pipeline, where OpenMontage handles:
- Timeline assembly and scene ordering
- Transition effects (crossfades, zooms)
- Audio mixing (narration + music)
- Subtitle burn-in
- Color grading
- Final H.264 render

---

## Step 6 — Post-Production via Local OpenMontage

```bash
cd ~/OpenMontage
# Agent uses FFmpeg tools for:
# - Video stitch (combine 4 clips into timeline)
# - Audio mix (narration + background music)
# - Subtitle burn-in (word-level SRT)
# - Color grade (cinematic LUT)
# - Final render (1920x1080, H.264, 8 Mbps)
```

---

## Cost Summary

| Item | Provider | Cost |
|---|---|---|
| 4 video clips | CMS node (GrowthHub billing) | Included in plan |
| TTS narration | Piper (local) | $0.00 |
| Background music | Free royalty-free | $0.00 |
| Post-production | FFmpeg (local) | $0.00 |
| **Total direct cost** | | **$0.00** (CMS node costs on GrowthHub billing) |
