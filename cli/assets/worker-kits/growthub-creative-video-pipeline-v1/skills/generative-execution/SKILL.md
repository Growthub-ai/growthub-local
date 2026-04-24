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
    - "growthub-pipeline path: DynamicRegistryPipeline JSON formed correctly, growthub pipeline execute called with payload as positional arg"
    - "byo-api-key path: VIDEO_MODEL_PROVIDER resolved, provider SDK called directly"
    - "Output normalised to GenerativeArtifact[] via node_complete output fields (.videos, .images)"
    - "project.md and trace.jsonl updated with Stage 2 completion"
  maxRetries: 3
helpers:
  - "helpers/check-generative-adapter.sh"
  - "helpers/run-pipeline.sh"
---

# Generative Execution Sub-Skill

## Role
Execute Stage 2: route through the configured generative adapter and normalise output to `GenerativeArtifact[]`.

## Adapter: growthub-pipeline (primary)

```bash
# Auth pre-flight
growthub auth whoami --json || { echo "Not authenticated. Run: growthub auth login"; exit 1; }

# Execute — payload is the sole positional argument (JSON string or file path)
growthub pipeline execute '<DynamicRegistryPipeline JSON>'
```

**Payload shape (`DynamicRegistryPipeline`):**
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

**NDJSON event types (from `@growthub/api-contract`):**
- `node_start` — node execution began
- `node_complete` — node finished; `output` may contain `.videos[]` and `.images[]`
- `node_error` — node failed; `error` contains the message
- `progress` — intermediate status
- `credit_warning` — credits low
- `complete` — pipeline finished; `summary.executionLog` may contain full artifact list
- `error` — pipeline-level failure

Pipe NDJSON stream through `growthub-pipeline-normalizer.js`:
- Collects `node_complete` outputs (.videos[], .images[])
- Extracts from `summary.executionLog` in the `complete` event (fallback)
- Normalises to `GenerativeArtifact[]`

## Adapter: byo-api-key (secondary)
Resolve `VIDEO_MODEL_PROVIDER` (veo | fal | runway), call provider SDK directly.
Normalise to the same `GenerativeArtifact[]` contract.

## Output Contract
All adapters must produce:
- `GenerativeArtifact[]` — id, type, url/localPath, mimeType, metadata (includes nodeId), stage, createdAt
- `output/<client>/<project>/generative/manifest.json`

## Process
1. Read `CREATIVE_VIDEO_PIPELINE_GENERATIVE_ADAPTER`
2. Run `helpers/check-generative-adapter.sh` to validate env
3. Build `DynamicRegistryPipeline` JSON from Stage 1 brief prompts + reference images
4. Execute via `bash helpers/run-pipeline.sh '<payload>'` or direct CLI call
5. Run `growthub-pipeline-normalizer.js` over the NDJSON trace
6. Write `manifest.json` to generative output dir
7. Append Stage 2 completion to `project.md` and `trace.jsonl`
