# Runtime Assumptions — Open Montage Studio

This file documents the runtime environment expectations for the Open Montage Studio Worker Kit.

---

## Execution Modes

| Mode | Requirements | Description |
|---|---|---|
| `local-fork` | Python 3.10+, FFmpeg, Node.js 18+, OpenMontage clone | Full tool access — agent runs pipelines directly |
| `agent-only` | GrowthHub session or zero-key mode | No local clone — CMS nodes or free tools provide generation |
| `hybrid` | GrowthHub session + partial local tools | CMS nodes for generation + local post-production |

---

## Local-Fork Mode Requirements

### System Dependencies

| Dependency | Minimum Version | Check Command | Purpose |
|---|---|---|---|
| Python | 3.10+ | `python3 --version` | OpenMontage tool execution |
| FFmpeg | any recent | `ffmpeg -version` | Video encoding, subtitle burn-in, audio mixing |
| Node.js | 18+ | `node --version` | Remotion composition engine |
| npm | any recent | `npm --version` | Remotion dependency management |

### OpenMontage Clone

- Default path: `~/OpenMontage` (override with `OPENMONTAGE_PATH` in `.env`)
- Setup: `git clone https://github.com/calesthio/OpenMontage.git && cd OpenMontage && make setup`
- The clone includes Python requirements, Remotion composer, and Piper TTS

### API Keys

All keys are optional. More keys = more tools available. Recommended setup order:

1. Free stock media keys (Pexels, Pixabay) — completely free
2. Google API key — 1M chars/month free TTS + $300 new account credits
3. ElevenLabs — 10K chars/month free premium TTS
4. fal.ai — FLUX images + multi-model video (~$0.03/image)

---

## Agent-Only Mode Requirements

- Active GrowthHub session (`growthub auth:login`) for CMS node access
- OR: zero-key mode (Piper TTS + free archives + Remotion guidance only)
- No local OpenMontage clone needed
- Agent produces production artifacts and composition guidance
- Actual generation happens via CMS hosted execution

---

## Hybrid Mode Requirements

- Active GrowthHub session for CMS node generation
- Local FFmpeg for post-production (composition, subtitles, audio mixing)
- Optional: local OpenMontage clone for full Remotion composition
- CMS node outputs (URLs) are downloaded locally for post-production

---

## File System Assumptions

- Working directory is this kit folder (exported via `growthub kit download`)
- Output goes to `output/<client-slug>/<project-slug>/`
- Brand kits live in `brands/<client-slug>/`
- The agent reads `skills.md` and templates from relative paths

---

## Network Assumptions

- Internet access required for: provider API calls, CMS node execution, stock media search, web research
- Local-fork Remotion rendering is fully offline after assets are downloaded
- FFmpeg post-production is fully offline

---

## Known Limitations

- Piper TTS quality is lower than cloud TTS — acceptable for drafts, recommend ElevenLabs or Google for final output
- Local GPU video generation (WAN 2.1, Hunyuan) requires NVIDIA GPU with 6-24GB VRAM — not available on most laptops
- Remotion composition renders images into animated video — not the same as AI-generated motion clips
- CMS node execution latency depends on GrowthHub hosted infrastructure — may be slower than direct API calls
