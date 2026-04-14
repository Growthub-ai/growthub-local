# Pipeline Selection Brief

## Project Reference

| Field | Value |
|---|---|
| Client | Growthub |
| Project | How Neural Networks Learn — 60s Explainer |
| Date | 2026-04-14 |

## Requested Outcome

"Make a 60-second animated explainer about how neural networks learn."

## Selected Pipeline

| Field | Value |
|---|---|
| Pipeline | Animated Explainer |
| Reason | The user explicitly asked for an explainer about a technical topic. The Animated Explainer pipeline is purpose-built for educational content with research, scripting, AI-generated visuals, narration, and Remotion composition. |

## Pipeline Fit Assessment

| Criterion | Score (1-5) | Notes |
|---|---|---|
| Content type match | 5 | Explainer is the exact target content type |
| Available tool coverage | 5 | FLUX images via fal.ai + Piper TTS + Remotion |
| Source asset alignment | 4 | No source assets needed; all generated |
| Budget feasibility | 5 | ~$0.30 for 12 FLUX images, free TTS, free composition |
| Quality ceiling | 4 | Image-based video — need strong motion/animation |

## Input Asset Requirements

- None — the pipeline handles research, script, image generation, TTS, and composition end-to-end.

## Output Specification

| Field | Value |
|---|---|
| Primary deliverable | 60-second animated explainer video |
| Duration | 60 seconds |
| Resolution | 1920x1080 |
| Codec | H.264 |

## Fallback Pipeline

| Field | Value |
|---|---|
| Pipeline | Animation |
| Trigger | If the explainer pipeline cannot produce sufficient visual variety (slideshow risk > 40%) |
| Trade-off | Animation pipeline adds kinetic typography and motion graphics but requires more manual scene design |

## Pipeline Stage Plan

```
research → proposal → script → scene_plan → assets → edit → compose
```

| Stage | Owner | Tool / CMS Node | Notes |
|---|---|---|---|
| Research | Agent | Web search (15-25 searches) | YouTube, Reddit, academic sources on neural network education |
| Proposal | Agent | — | 2-3 concept variants for user approval |
| Script | Agent | — | 60s script with word-level timing targets |
| Scene plan | Agent | — | 10-12 scenes with transitions and audio cues |
| Assets | Agent + fal.ai | FLUX image gen + CMS image-generation node | 12 scene images + narration + music |
| Edit | Agent | Remotion | Animated composition with spring physics |
| Compose | Agent | FFmpeg | Final render with subtitles |
