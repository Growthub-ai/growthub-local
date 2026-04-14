# OpenMontage Fork Integration

This document describes how the local OpenMontage clone integrates with this worker kit.

---

## Architecture Overview

OpenMontage is an agent-first video production system. There is no code orchestrator — the AI agent IS the orchestrator.

```
Agent reads pipeline manifest (YAML) → stages, tools, review criteria
  ↓
Agent reads stage director skill (Markdown) → HOW to execute each stage
  ↓
Agent calls Python tools → scored provider selection across 7 dimensions
  ↓
Agent self-reviews → schema validation, quality checks
  ↓
Agent checkpoints state (JSON) → resumable, with decision log
  ↓
Pre-compose validation gate → delivery promise, slideshow risk
  ↓
Render (Remotion or FFmpeg)
  ↓
Post-render self-review → ffprobe, frame extraction, audio analysis
  ↓
Final video output
```

---

## Directory Layout

```
OpenMontage/
├── tools/              # 52 Python tools (the agent's hands)
│   ├── video/          # Video gen: Kling, Runway, Veo, Grok, WAN, Hunyuan, etc.
│   ├── audio/          # TTS: ElevenLabs, Google, OpenAI, Piper + music
│   ├── graphics/       # Image gen: FLUX, DALL-E, Imagen, Recraft, local diffusion
│   ├── enhancement/    # Upscale, bg remove, face enhance, color grade
│   ├── analysis/       # Transcription, scene detect, frame sampling
│   ├── avatar/         # Talking head, lip sync
│   └── subtitle/       # SRT/VTT generation
│
├── pipeline_defs/      # 12 YAML pipeline manifests
├── skills/             # 400+ Markdown skill files
│   ├── pipelines/      # Per-pipeline stage director skills
│   ├── creative/       # Creative technique skills
│   ├── core/           # Core tool skills
│   └── meta/           # Reviewer, checkpoint protocol
│
├── schemas/            # JSON Schemas for contract validation
├── styles/             # Visual style playbooks (YAML)
├── remotion-composer/  # React/Remotion video composition engine
├── lib/                # Core infrastructure
└── config.yaml         # Global configuration
```

---

## Tool Discovery

The tool registry auto-discovers all tools at startup:

```bash
cd ~/OpenMontage
python3 -c "from tools.tool_registry import registry; import json; registry.discover(); print(json.dumps(registry.support_envelope(), indent=2))"
```

This returns the full capability envelope: which tools are available, which providers are configured, and what the system can produce.

---

## Three-Layer Knowledge Architecture

| Layer | Location | Purpose |
|---|---|---|
| 1 | `tools/` + `pipeline_defs/` | What exists — executable capabilities + orchestration |
| 2 | `skills/` | How to use it — OpenMontage conventions and quality bars |
| 3 | `.agents/skills/` | How it works — 47 external technology knowledge packs |

---

## Pipeline Manifests

Each pipeline is defined as a YAML manifest in `pipeline_defs/`. The manifest specifies:
- Stages in order
- Tools available at each stage
- Review criteria
- Success gates

The agent reads the manifest, then reads the corresponding stage director skills to know HOW to execute each stage.

---

## Remotion Composition Engine

Located at `remotion-composer/`. A React-based programmatic video composition engine that:
- Renders TextCard, StatCard, charts, image scenes with spring animations
- Supports crossfade, wipe, zoom transitions
- Burns in TikTok-style word-level captions
- Outputs H.264 MP4 at any resolution/aspect ratio

Remotion is always available (no API key needed) and is the primary composition path for image-based video.

---

## Setup

```bash
bash setup/clone-fork.sh
```

This script:
1. Clones `https://github.com/calesthio/OpenMontage.git` to `~/OpenMontage`
2. Runs `make setup` (pip install + npm install + Piper TTS)
3. Verifies the tool registry

After setup, add API keys to `~/OpenMontage/.env` for additional provider access.
