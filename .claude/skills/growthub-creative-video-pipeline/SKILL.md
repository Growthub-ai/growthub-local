---
id: growthub-creative-video-pipeline
version: 1.0.0
kitId: growthub-creative-video-pipeline-v1
triggers:
  - "run creative video pipeline"
  - "execute video pipeline"
  - "brief to video"
  - "pipeline brief generate edit"
  - "creative video pipeline"
selfEval:
  criteria:
    - "Brief grounded in brand-kit.md — no invented brand attributes"
    - "Generative stage routes through configured adapter (growthub-pipeline or byo-api-key)"
    - "Stage 3 delegated to VIDEO_USE_HOME video-use fork"
    - "project.md appended at each stage boundary"
    - "trace.jsonl events written for each stage completion"
  maxRetries: 3
helpers:
  - "helpers/run-pipeline.sh"
  - "helpers/check-generative-adapter.sh"
subSkills:
  - "skills/brief-generation/SKILL.md"
  - "skills/generative-execution/SKILL.md"
  - "skills/video-edit/SKILL.md"
---

# Growthub Creative Video Pipeline

Catalog entry for the `growthub-creative-video-pipeline-v1` worker kit.

## What It Does

Runs the full three-stage governed pipeline:
1. **Brief** — brand-grounded creative brief from `brands/<client>/brand-kit.md`
2. **Generate** — generative image/video via growthub-pipeline or byo-api-key adapter
3. **Edit** — word-boundary EDL edit via video-use fork

## Activation

This skill is activated when the operator triggers one of the listed phrases or explicitly runs `creative-video-pipeline-operator`.

## Kit Location

`cli/assets/worker-kits/growthub-creative-video-pipeline-v1/`

## Quick Install

```bash
cd cli/assets/worker-kits/growthub-creative-video-pipeline-v1
bash setup/install-skill.sh
```
