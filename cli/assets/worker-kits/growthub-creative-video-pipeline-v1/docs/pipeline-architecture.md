# Pipeline Architecture

## Stage 1 — Brief

**Input:** `brands/<client>/brand-kit.md`  
**Process:** Brand-constrained scene structure and hook generation  
**Output:** `output/<client>/<project>/brief/pipeline-brief.md`

The brief stage is purely Claude-driven. No external API calls. The brand-kit.md is the sole source of truth for brand voice, audience, scene count, and hook patterns. Optional: reference `CREATIVE_STRATEGIST_HOME/hooks/500-winning-hooks.csv` for hook inspiration — never as brand override.

## Stage 2 — Generate

**Input:** `pipeline-brief.md` scene prompts + reference images  
**Output:** `GenerativeArtifact[]` + `output/<client>/<project>/generative/manifest.json`

Two adapter paths with identical output contracts:

### growthub-pipeline (primary)
```
DynamicRegistryPipeline JSON → growthub pipeline execute → NDJSON stream
→ official CLI/SDK ExecutionEvent handling → GenerativeArtifact[]
```
Node: `video-generation` / Model: `veo-3.1-generate-001`

### byo-api-key (secondary)
```
VIDEO_MODEL_PROVIDER (veo|fal|runway) → provider SDK → GenerativeArtifact[]
```

## Stage 3 — Edit

**Input:** `manifest.json` source clips + `pipeline-brief.md` editing guidelines  
**Process:** Delegate entirely to `VIDEO_USE_HOME` video-use fork  
**Output:** `output/<client>/<project>/final/final.mp4`

```
edit-plan.md (handoff) → video-use fork → ElevenLabs Scribe → word-boundary EDL → FFmpeg → final.mp4
```

The kit does NOT inline any video-use logic. The `edit-plan.md` is the only interface.

## Data Flow

```
brand-kit.md
    │
    ▼ Stage 1
pipeline-brief.md
    │
    ▼ Stage 2 (adapter-routed)
GenerativeArtifact[] + manifest.json
    │
    ▼ Stage 3 (video-use delegation)
final.mp4
```

## Governance

Every stage boundary appends:
- `.growthub-fork/project.md` — human-readable progress log
- `trace.jsonl` — machine-readable stage events
