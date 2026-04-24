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
    - "Adapter selected from CREATIVE_VIDEO_PIPELINE_GENERATIVE_ADAPTER env var"
    - "growthub-pipeline path: DynamicRegistryPipeline JSON assembled from brief, growthub pipeline execute called directly"
    - "byo-api-key path: VIDEO_MODEL_PROVIDER resolved, provider SDK called"
    - "manifest.json written to output/<client>/<project>/generative/ with execution results"
    - "project.md and trace.jsonl updated with Stage 2 completion"
  maxRetries: 3
helpers:
  - "helpers/check-generative-adapter.sh"
  - "helpers/run-pipeline.sh"
---

# Generative Execution Sub-Skill

## Role
Execute Stage 2 via the official growthub CLI + `@growthub/api-contract` SDK. No custom execution layer.

## Adapter: growthub-pipeline (primary)

```bash
# Auth pre-flight
growthub auth whoami --json || { echo "Run: growthub auth login"; exit 1; }

# Assemble DynamicRegistryPipeline from the Stage 1 brief, then execute:
growthub pipeline execute '<DynamicRegistryPipeline JSON>'
```

**`DynamicRegistryPipeline` shape (from `@growthub/api-contract`):**
```json
{
  "pipelineId": "<uuid>",
  "executionMode": "hosted",
  "nodes": [
    {
      "nodeId": "video-gen-1",
      "slug": "video-generation",
      "bindings": {
        "videoModel": "veo-3.1-generate-001",
        "prompt": "<scene prompt from brief>",
        "seconds": 8,
        "aspectRatio": "9:16",
        "creativeCount": 1,
        "refs": [
          { "name": "brand_reference", "dataUrl": "data:image/jpeg;base64,<base64>" }
        ]
      }
    }
  ]
}
```

The CLI streams NDJSON `ExecutionEvent` objects typed by `@growthub/api-contract`. Use `isExecutionEvent()` to validate each line. The `complete` event signals success; the `error` event signals failure.

## Adapter: byo-api-key (secondary)
Resolve `VIDEO_MODEL_PROVIDER` (veo | fal | runway), call the provider SDK directly.

## Output
Write `output/<client>/<project>/generative/manifest.json`:
```json
{
  "kitId": "growthub-creative-video-pipeline-v1",
  "adapter": "growthub-pipeline",
  "executionId": "<from complete event>",
  "createdAt": "<iso>",
  "artifacts": [/* urls/paths from execution output */]
}
```

## Process
1. Read `CREATIVE_VIDEO_PIPELINE_GENERATIVE_ADAPTER`
2. Run `helpers/check-generative-adapter.sh`
3. Assemble `DynamicRegistryPipeline` JSON from Stage 1 brief prompts and reference images
4. Execute: `bash helpers/run-pipeline.sh '<payload>'`
5. Write `manifest.json` from the execution result
6. Append Stage 2 completion to `project.md` and `trace.jsonl`
