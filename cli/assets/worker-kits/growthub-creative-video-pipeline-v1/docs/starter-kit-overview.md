# Starter Kit Overview

`growthub-creative-video-pipeline-v1` is a fully self-contained worker kit that composes three governed primitives into a single three-stage creative video pipeline.

## What's Included

| Surface | Description |
|---------|-------------|
| `studio/` | Vite 5 + React 18 local-first UI shell |
| `apps/creative-video-pipeline/` | Next.js 16 + React 19 Vercel-deployable app |
| `workers/creative-video-pipeline-operator/` | Governed worker contract |
| `skills/` | Three sub-skill primitives (brief, generative, edit) |
| `helpers/` | Safe shell wrappers |
| `templates/` | Governed output templates |
| `brands/` | Brand kit template + Growthub reference brand |
| `setup/` | Dependency check, env verify, fork clone, skill install |
| `docs/` | Architecture, adapter contracts, deployment |

## Three-Stage Pipeline

```
Stage 1 — Brief      brands/<client>/brand-kit.md → pipeline-brief.md
Stage 2 — Generate   growthub-pipeline | byo-api-key → GenerativeArtifact[] + manifest.json
Stage 3 — Edit       VIDEO_USE_HOME fork → Scribe → EDL → FFmpeg → final.mp4
```

## Governed Workspace

Every stage boundary writes:
- Updated `.growthub-fork/project.md`
- A `{"type":"stage-complete","stage":"<name>","ts":"<iso>"}` event to `trace.jsonl`

See `docs/governed-workspace-primitives.md` for the full primitive contract.
