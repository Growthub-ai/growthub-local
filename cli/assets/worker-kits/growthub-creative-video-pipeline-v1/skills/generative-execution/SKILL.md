---
id: creative-video-pipeline/generative-execution
version: 1.0.0
triggers:
  - "run generative stage"
  - "stage 2 generate"
  - "generate video"
  - "execute pipeline generation"
selfEval:
  criteria:
    - "Adapter selected based on CREATIVE_VIDEO_PIPELINE_GENERATIVE_ADAPTER env var"
    - "growthub-pipeline path: DynamicRegistryPipeline JSON payload formed correctly, `growthub pipeline execute` called"
    - "byo-api-key path: VIDEO_MODEL_PROVIDER resolved, provider SDK called directly"
    - "Output normalised to GenerativeArtifact[] and manifest.json written"
    - "project.md and trace.jsonl updated with Stage 2 completion"
  maxRetries: 3
helpers:
  - "helpers/check-generative-adapter.sh"
  - "helpers/run-pipeline.sh"
---

# Generative Execution Sub-Skill

## Role
Execute Stage 2 of the pipeline: route through the configured generative adapter and normalise output to `GenerativeArtifact[]`.

## Adapter: growthub-pipeline (primary)
```bash
growthub pipeline execute \
  --workflow video-generation \
  --input '{"nodeType":"video-generation","model":"veo-3.1-generate-001","prompts":[...],"referenceImages":[...]}'
```
Pipe NDJSON stream through `growthub-pipeline-normalizer.js` → `GenerativeArtifact[]`.

## Adapter: byo-api-key (secondary)
Resolve `VIDEO_MODEL_PROVIDER` (veo | fal | runway), call provider SDK directly.
Normalise to the same `GenerativeArtifact[]` contract.

## Output Contract
All adapters must produce:
- `GenerativeArtifact[]` — id, type, url/localPath, mimeType, metadata, stage, createdAt
- `output/<client>/<project>/generative/manifest.json`

## Process
1. Read `CREATIVE_VIDEO_PIPELINE_GENERATIVE_ADAPTER`
2. Run `helpers/check-generative-adapter.sh` to validate env
3. Execute via selected adapter path
4. Write `manifest.json` to generative output dir
5. Append Stage 2 completion to `project.md` and `trace.jsonl`
