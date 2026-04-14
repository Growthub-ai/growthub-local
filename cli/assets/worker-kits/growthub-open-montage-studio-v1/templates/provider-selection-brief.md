# Provider / CMS Node Selection Brief

## Project Reference

| Field | Value |
|---|---|
| Client | `<client-name>` |
| Project | `<project-name>` |
| Pipeline | `<selected-pipeline>` |
| Date | `YYYY-MM-DD` |

## Available Providers

### Direct API Providers (from .env)

| Provider | Key Set | Capabilities |
|---|---|---|
| fal.ai | `<yes/no>` | FLUX images, Kling/Veo/MiniMax video, Recraft |
| OpenAI | `<yes/no>` | DALL-E 3 images, OpenAI TTS |
| Google | `<yes/no>` | Google TTS (700+ voices), Imagen images |
| ElevenLabs | `<yes/no>` | Premium TTS, music, SFX |
| Runway | `<yes/no>` | Gen-4 video |
| Higgsfield | `<yes/no>` | Multi-model video orchestrator |
| xAI Grok | `<yes/no>` | Image + video generation |
| HeyGen | `<yes/no>` | Avatar videos |
| Suno | `<yes/no>` | AI music generation |

### CMS Node Providers (from GrowthHub)

| CMS Node Slug | Family | Execution Kind | Available |
|---|---|---|---|
| | | | |

### Local/Free Providers (always available)

| Provider | Capability |
|---|---|
| Piper TTS | Offline narration |
| Remotion | Programmatic video composition |
| FFmpeg | Encoding, subtitles, audio mixing |
| Archive.org | Free archival footage |
| Pexels / Pixabay / Unsplash | Free stock media (if keys set) |

## Provider Selection Per Stage

| Stage | Selected Provider | Score | Alternative | Cost Estimate |
|---|---|---|---|---|
| Image generation | | | | |
| Video generation | | | | |
| TTS / narration | | | | |
| Music | | | | |
| Composition | | | | |
| Post-production | | | | |

## 7-Dimension Scoring (Primary Provider)

| Dimension | Weight | Score (1-10) | Weighted |
|---|---|---|---|
| Task fit | 30% | | |
| Output quality | 20% | | |
| Control features | 15% | | |
| Reliability | 15% | | |
| Cost efficiency | 10% | | |
| Latency | 5% | | |
| Continuity | 5% | | |
| **Total** | **100%** | | **—** |

## Cost Estimate

| Category | Provider | Unit Cost | Quantity | Subtotal |
|---|---|---|---|---|
| Images | | | | |
| Video clips | | | | |
| TTS | | | | |
| Music | | | | |
| CMS nodes | GrowthHub billing | — | | — |
| **Total** | | | | **$—** |

## Budget Gate

| Field | Value |
|---|---|
| Per-action threshold | $0.50 |
| Total budget cap | $10.00 |
| Estimated total | $— |
| Within budget | `<yes / no>` |
