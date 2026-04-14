# OpenMontage Pipeline Reference

Quick reference for all 12 OpenMontage production pipelines.

---

## Pipelines

### Animated Explainer

| Field | Value |
|---|---|
| Best for | Educational content, tutorials, topic breakdowns |
| Stage flow | research → proposal → script → scene_plan → assets → edit → compose |
| Key tools | Web search, image gen (FLUX/DALL-E), TTS, Remotion, FFmpeg |
| Typical cost | $0.15-$3.00 |
| Duration range | 30-300 seconds |

### Animation

| Field | Value |
|---|---|
| Best for | Social media, product demos, abstract concepts |
| Stage flow | research → proposal → script → scene_plan → assets → edit → compose |
| Key tools | Image gen, video gen (optional), Remotion motion graphics |
| Typical cost | $0.15-$5.00 |
| Duration range | 15-120 seconds |

### Avatar Spokesperson

| Field | Value |
|---|---|
| Best for | Corporate comms, training, announcements |
| Stage flow | research → proposal → script → scene_plan → assets → edit → compose |
| Key tools | HeyGen avatar, TTS, Remotion |
| Typical cost | $2.00-$10.00 |
| Duration range | 30-300 seconds |

### Cinematic

| Field | Value |
|---|---|
| Best for | Brand films, teasers, promotional content |
| Stage flow | research → proposal → script → scene_plan → assets → edit → compose |
| Key tools | Video gen (Kling/Veo/Runway), image gen, music gen, FFmpeg |
| Typical cost | $1.00-$10.00 |
| Duration range | 15-120 seconds |

### Clip Factory

| Field | Value |
|---|---|
| Best for | Repurposing long content for social media |
| Stage flow | analysis → ranking → extraction → edit → compose |
| Key tools | Transcriber, scene detect, FFmpeg trim, subtitle gen |
| Typical cost | $0.00-$1.00 |
| Duration range | 15-60 seconds per clip |

### Documentary Montage

| Field | Value |
|---|---|
| Best for | Video essays, mood pieces, real-footage B-roll edits |
| Stage flow | research → corpus_build → clip_selection → edit → compose |
| Key tools | Pexels/Archive.org/Wikimedia, CLIP search, FFmpeg, music |
| Typical cost | $0.00-$2.00 |
| Duration range | 30-300 seconds |

### Hybrid

| Field | Value |
|---|---|
| Best for | Enhancing existing footage with AI-generated support visuals |
| Stage flow | analysis → proposal → assets → edit → compose |
| Key tools | Scene detect, image gen, video gen, FFmpeg overlay |
| Typical cost | $0.50-$5.00 |
| Duration range | 15-300 seconds |

### Localization & Dub

| Field | Value |
|---|---|
| Best for | Multi-language distribution |
| Stage flow | analysis → transcription → translation → dub → compose |
| Key tools | Transcriber, TTS (multi-language), subtitle gen, FFmpeg |
| Typical cost | $0.50-$5.00 per language |
| Duration range | Matches source |

### Podcast Repurpose

| Field | Value |
|---|---|
| Best for | Podcast marketing, audiogram videos |
| Stage flow | analysis → highlight_extraction → visual_design → compose |
| Key tools | Transcriber, image gen, Remotion audiogram, FFmpeg |
| Typical cost | $0.00-$2.00 |
| Duration range | 30-120 seconds per clip |

### Screen Demo

| Field | Value |
|---|---|
| Best for | Product demos, tutorials, documentation |
| Stage flow | proposal → script → recording → edit → compose |
| Key tools | Screen capture, TTS narration, Remotion overlays, FFmpeg |
| Typical cost | $0.00-$1.00 |
| Duration range | 30-600 seconds |

### Talking Head

| Field | Value |
|---|---|
| Best for | Presentations, vlogs, interviews |
| Stage flow | proposal → script → recording → edit → compose |
| Key tools | Source footage, face enhance, TTS (optional), FFmpeg |
| Typical cost | $0.00-$2.00 |
| Duration range | 30-600 seconds |

---

## Universal Stage Flow

All pipelines follow the same core structure:

```
research → proposal → script → scene_plan → assets → edit → compose
```

Some pipelines have specialized stages (e.g., `corpus_build` for Documentary Montage, `analysis` for Clip Factory), but the overall flow is always: understand → plan → generate → assemble → deliver.

---

## Pipeline Selection Decision Matrix

| If the user wants... | Select... |
|---|---|
| Explain a topic | Animated Explainer |
| Motion graphics / kinetic typography | Animation |
| Avatar presenter | Avatar Spokesperson |
| Cinematic trailer / brand film | Cinematic |
| Batch clips from long content | Clip Factory |
| Real footage montage / video essay | Documentary Montage |
| Enhance existing footage | Hybrid |
| Translate / dub | Localization & Dub |
| Podcast to video | Podcast Repurpose |
| Software walkthrough | Screen Demo |
| Speaker-led video | Talking Head |
