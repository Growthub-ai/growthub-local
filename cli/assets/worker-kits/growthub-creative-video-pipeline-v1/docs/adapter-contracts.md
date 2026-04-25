# Adapter Contracts

## Execution — growthub-pipeline (primary)

The official CLI + SDK is the execution layer. No custom wrapper.

```bash
growthub pipeline execute '<DynamicRegistryPipeline JSON>'
```

**SDK types:** `@growthub/api-contract`
- Input: `DynamicRegistryPipeline` — pipelineId, executionMode, nodes[].{nodeId, slug, bindings}
- Events: `ExecutionEvent` — validated with `isExecutionEvent()`
- Event types: `node_start`, `node_complete`, `node_error`, `progress`, `credit_warning`, `complete`, `error`

**Required env:**
- `GROWTHUB_BRIDGE_ACCESS_TOKEN`
- `GROWTHUB_BRIDGE_BASE_URL`
- Valid session from `growthub auth login` (`~/.claude/config/session.json`)

**Auth pre-flight:**
```bash
growthub auth whoami --json
```

**Payload (DynamicRegistryPipeline):**
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
        "prompt": "<scene prompt>",
        "seconds": 8,
        "aspectRatio": "9:16",
        "creativeCount": 1,
        "refs": [{ "name": "brand_reference", "dataUrl": "data:image/jpeg;base64,<b64>" }]
      }
    }
  ]
}
```

---

## Execution — byo-api-key (secondary)

**Required env:**
- `VIDEO_MODEL_PROVIDER` — `veo` | `fal` | `runway`
- Provider key: `GOOGLE_AI_API_KEY` / `FAL_API_KEY` / `RUNWAY_API_KEY`

Call the provider SDK directly. No CLI wrapper.

---

## Manifest (output contract)

`output/<client>/<project>/generative/manifest.json`:
```json
{
  "kitId": "growthub-creative-video-pipeline-v1",
  "adapter": "growthub-pipeline",
  "executionId": "<from complete event>",
  "createdAt": "<iso>",
  "artifacts": [{ "url": "<artifact url>", "type": "video", "nodeId": "..." }]
}
```

This is the Stage 2 → Stage 3 handoff artifact. Stage 3 reads this to locate source clips.
