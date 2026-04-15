# Open Montage Studio — Master Skill Document

This is the canonical methodology reference for the Open Montage Studio Operator. Read this file at the start of every session before producing any artifacts.

---

## 1. Workflow Order

The operator follows a strict 10-step workflow defined in `workers/open-montage-studio-operator/CLAUDE.md`. This skill doc provides the detailed methodology for steps 5 through 9.

---

## 2. Pipeline Selection Logic

OpenMontage supports 12 production pipelines. Selection is a structured decision, not a guess.

### Decision Tree

```
Intent: Explain a topic to an audience?
  YES → Animated Explainer

Intent: Create motion graphics, kinetic typography, or abstract animation?
  YES → Animation

Intent: Avatar-driven presenter video?
  YES → Avatar Spokesperson

Intent: Cinematic trailer, teaser, or mood-driven brand film?
  YES → Cinematic

Intent: Batch of ranked short-form clips from one long source?
  YES → Clip Factory

Intent: Thematic montage from real stock footage or open archives?
  YES → Documentary Montage

Intent: Enhance existing footage with AI-generated support visuals?
  YES → Hybrid

Intent: Subtitle, dub, or translate existing video into other languages?
  YES → Localization & Dub

Intent: Turn podcast highlights into video?
  YES → Podcast Repurpose

Intent: Polished software screen recording or walkthrough?
  YES → Screen Demo

Intent: Footage-led speaker video, presentation, or vlog?
  YES → Talking Head
```

If the intent spans two pipelines, pick the primary and document the secondary as a composition layer or follow-up pipeline.

### Pipeline Stage Flow (Universal)

Every pipeline follows the same structured flow:

```
research → proposal → script → scene_plan → assets → edit → compose
```

Each stage has a dedicated director skill in the OpenMontage fork at `skills/pipelines/<pipeline-name>/`.

---

## 3. Provider Scoring Methodology

Every tool selection runs through a 7-dimension scoring engine.

| Dimension | Weight | What It Measures |
|-----------|--------|------------------|
| Task fit | 30% | How well the tool matches the specific production need |
| Output quality | 20% | Resolution, fidelity, consistency of results |
| Control features | 15% | Prompt adherence, style control, parameter granularity |
| Reliability | 15% | Uptime, error rate, queue latency |
| Cost efficiency | 10% | Price per output unit relative to quality |
| Latency | 5% | Time from request to deliverable |
| Continuity | 5% | Session persistence, resumability, rate limits |

### Provider Tiers

**Zero-cost (always available):**
- Piper TTS — offline narration
- Archive.org + NASA + Wikimedia — free archival footage
- Remotion — React-based programmatic video composition
- FFmpeg — encoding, subtitles, audio mixing, color grading

**Free-key (developer accounts, no charge):**
- Pexels, Pixabay, Unsplash — stock media
- Google TTS — 1M chars/month free
- ElevenLabs — 10K chars/month free

**Pay-as-you-go:**
- fal.ai (FAL_KEY) — FLUX images + Kling/Veo/MiniMax video
- OpenAI — DALL-E 3 + TTS
- Google Imagen — $0.02-0.06/image
- xAI Grok — images + video
- Runway Gen-4 — highest quality AI video
- Higgsfield — multi-model video orchestrator
- HeyGen — avatar videos
- Suno — AI music generation

**Local GPU (free, requires hardware):**
- WAN 2.1, Hunyuan, CogVideo, LTX-Video — local video generation
- Stable Diffusion — local image generation

---

## 4. CMS Node Bridge Mapping

GrowthHub CMS nodes expose video and image generation as hosted execution capabilities. The bridge maps these into the OpenMontage production flow.

### How It Works

1. Agent queries the CMS capability registry for available nodes in the `video` and `image` families
2. CMS nodes execute via hosted execution client, producing output URLs
3. Output URLs are treated as source assets in the OpenMontage pipeline
4. OpenMontage handles composition, post-production, and final rendering

### CMS Family → OpenMontage Mapping

| CMS Node Family | CMS Execution Kind | OpenMontage Integration Point |
|-----------------|--------------------|-----------------------------|
| `video` | `hosted-execute` | Source clips for `tools/video/` input or direct composition via Remotion/FFmpeg |
| `image` | `hosted-execute` | Scene images for `tools/graphics/` input or Remotion animated composition |
| `slides` | `hosted-execute` | Slide deck assets for Screen Demo pipeline |
| `text` | `hosted-execute` | Script/narration text for TTS processing |

### CMS Node Output → OpenMontage Asset Type

| CMS Output Type | OpenMontage Asset Category | Typical Usage |
|-----------------|---------------------------|---------------|
| Video URL | `source_clip` | Scene footage, B-roll, transition clips |
| Image URL | `scene_image` | Hero shots, backgrounds, product stills |
| Audio URL | `narration` or `music` | Voiceover, soundtrack |
| Text | `script` | Script content for TTS conversion |

### When to Use CMS Nodes vs Direct Providers

Use CMS nodes when:
- The user has an active GrowthHub session
- The generation type matches an available CMS node
- The user wants unified billing through GrowthHub
- The user does not have direct provider API keys

Use direct providers when:
- Local-fork mode with full tool access
- The specific tool/model is not available as a CMS node
- Lower latency is needed (direct API vs hosted execution)
- The user has provider keys and prefers direct access

---

## 5. Prompt Planning Rules

### Image Prompts

1. Lead with the subject and composition
2. Include style directive (photorealistic, illustrated, anime, etc.)
3. Specify lighting and mood
4. Add technical parameters (aspect ratio, resolution)
5. Include negative prompts when the provider supports them

### Video Prompts

1. Describe the motion and camera movement
2. Specify duration target
3. Reference the source image if using image-to-video
4. Include style consistency directives
5. Note any audio sync requirements

### Scene Sequencing

1. Each scene maps to one pipeline stage asset
2. Scenes must have explicit transition types (cut, crossfade, wipe, zoom)
3. Audio cues align to scene boundaries
4. Subtitle timing derives from script word timestamps

---

## 6. Output Artifact Order

Produce artifacts in this strict order:

1. **VideoProductionBrief** — What we are making, why, for whom
2. **PipelineSelectionBrief** — Which pipeline, why, fallback
3. **ProviderSelectionBrief** — Which providers/CMS nodes, scoring, cost estimate
4. **ScenePlan** — Scene-by-scene breakdown with timing, transitions, audio cues
5. **PromptMatrix** — Per-scene prompts for all generation tools
6. **GenerationBatchPlan** — Execution order, dependencies, parallel opportunities
7. **AssetTracking** — Generated asset inventory with URLs, statuses, costs
8. **ReviewQAChecklist** — Quality gates, validation points, approval criteria
9. **PlatformReadyExecutionHandoff** — Complete handoff doc for execution

---

## 7. QA Standards

### Pre-Compose Validation

Before rendering:
- All scene assets exist and are accessible
- Audio tracks are present and duration-matched
- Subtitle timing is aligned
- Delivery promise is achievable with available tools
- Budget is within approved cap

### Post-Render Self-Review

After rendering:
- ffprobe validation (codec, resolution, duration, bitrate)
- Frame extraction at key points (first, middle, last, transitions)
- Audio level analysis (no clipping, consistent volume)
- Subtitle readability check
- Delivery promise verification

### Slideshow Risk Check

If the output is image-based video, score across 6 dimensions:
- Motion variety (camera moves, parallax, Ken Burns)
- Transition diversity (not all cuts)
- Animation layer count (particles, overlays, text motion)
- Audio-visual sync
- Pacing variation
- Visual grammar complexity

A score below 60% triggers a warning and requires explicit user approval to proceed.

---

## 8. Budget Governance

- Estimate costs before execution
- Reserve budget before each provider call
- Reconcile actual spend after each call
- Default per-action approval threshold: $0.50
- Default total budget cap: $10
- CMS node costs flow through GrowthHub billing (no separate tracking needed)
- Always present cost summary before starting generation

---

## 9. Handoff Standards

Every handoff document must include:
- Execution mode (local-fork / agent-only / hybrid)
- Complete asset manifest with URLs or file paths
- Provider/CMS node execution instructions
- Post-production steps (composition, audio, subtitles, color grade)
- Render profile (resolution, aspect ratio, codec, target platform)
- Estimated total cost and actual spend
- Known limitations or manual steps required
