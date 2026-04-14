# Provider Adapter Layer

OpenMontage uses a scored provider selection system. This document describes how providers integrate and how GrowthHub CMS nodes fit into the provider model.

---

## Provider Selection Model

Every tool selection runs through a 7-dimension scoring engine:

| Dimension | Weight | Description |
|---|---|---|
| Task fit | 30% | How well the provider matches the specific task |
| Output quality | 20% | Resolution, fidelity, consistency |
| Control features | 15% | Prompt adherence, parameter granularity |
| Reliability | 15% | Uptime, error rate, queue latency |
| Cost efficiency | 10% | Price per output unit |
| Latency | 5% | Request to deliverable time |
| Continuity | 5% | Session persistence, rate limits |

The agent scores available providers for each task and selects the highest-scoring option. Alternatives are logged with their scores in the decision audit trail.

---

## Provider Categories

### Cloud API Providers

| Provider | Env Key | Capabilities |
|---|---|---|
| fal.ai | `FAL_KEY` | FLUX images, Kling/Veo/MiniMax video, Recraft images |
| OpenAI | `OPENAI_API_KEY` | DALL-E 3 images, OpenAI TTS |
| Google | `GOOGLE_API_KEY` | Google TTS (700+ voices), Imagen images |
| ElevenLabs | `ELEVENLABS_API_KEY` | Premium TTS, music, SFX |
| xAI Grok | `XAI_API_KEY` | Image + video generation |
| Runway | `RUNWAY_API_KEY` | Gen-4 video |
| Higgsfield | `HIGGSFIELD_API_KEY` | Multi-model video orchestrator |
| HeyGen | `HEYGEN_API_KEY` | Avatar videos |
| Suno | `SUNO_API_KEY` | AI music generation |

### Free Stock Media

| Provider | Env Key | Capabilities |
|---|---|---|
| Pexels | `PEXELS_API_KEY` | Stock photos + videos |
| Pixabay | `PIXABAY_API_KEY` | Stock photos + videos |
| Unsplash | `UNSPLASH_ACCESS_KEY` | Stock images |

### Local Providers (Always Available)

| Provider | Capabilities |
|---|---|
| Piper TTS | Offline text-to-speech, ~30 English voices |
| Remotion | React-based programmatic video composition |
| FFmpeg | Video encoding, subtitles, audio mixing, color grading |
| Archive.org + NASA + Wikimedia | Free archival footage |

### Local GPU Providers (Optional)

| Provider | Env Key | Requirements |
|---|---|---|
| WAN 2.1 | `VIDEO_GEN_LOCAL_ENABLED` | NVIDIA GPU, 6-24GB VRAM |
| Hunyuan | `VIDEO_GEN_LOCAL_ENABLED` | NVIDIA GPU, 12GB VRAM |
| CogVideo | `VIDEO_GEN_LOCAL_ENABLED` | NVIDIA GPU, 6-10GB VRAM |
| LTX-Video | `VIDEO_GEN_LOCAL_ENABLED` | NVIDIA GPU, 8GB VRAM |
| Stable Diffusion | — | NVIDIA GPU, 4GB+ VRAM |

---

## GrowthHub CMS Nodes as Providers

GrowthHub CMS nodes act as an additional provider source in the scoring model. They are treated identically to cloud providers with the following characteristics:

| Dimension | CMS Node Score Basis |
|---|---|
| Task fit | Matches if the CMS node family matches the task (video/image) |
| Output quality | Depends on the underlying provider routed by the CMS node |
| Control features | Limited to CMS node input bindings |
| Reliability | GrowthHub hosted infrastructure SLA |
| Cost efficiency | GrowthHub billing (may be included in plan) |
| Latency | Hosted execution overhead + provider latency |
| Continuity | Depends on GrowthHub session |

When CMS nodes are available and the user prefers unified GrowthHub billing, the scoring engine should weight cost efficiency higher for CMS nodes.

---

## Fallback Strategy

When the primary provider path fails:

1. Fall back to the next highest-scored provider for the same task
2. If no alternative provider exists, fall back to a different tool category (e.g., image-to-video instead of text-to-video)
3. If all providers fail, fall back to free/local tools (Piper TTS, Remotion composition, stock media)
4. Mark the handoff with the exact fallback trigger and trade-offs

---

## Adding a New Provider

New providers integrate by:
1. Adding a tool in the appropriate `tools/` subdirectory
2. Implementing the tool contract (BaseTool inheritance)
3. The registry auto-discovers it
4. The scoring engine includes it in selection automatically
