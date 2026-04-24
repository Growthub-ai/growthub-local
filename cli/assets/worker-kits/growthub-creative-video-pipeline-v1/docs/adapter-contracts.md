# Adapter Contracts

## GenerativeArtifact

Both adapters must produce `GenerativeArtifact[]` objects conforming to:

```ts
interface GenerativeArtifact {
  id: string;            // uuid
  type: "video" | "image" | "audio";
  url: string | null;    // remote URL if available
  localPath: string | null; // local file path if downloaded
  mimeType: string | null;
  metadata: Record<string, unknown>;
  stage: "generative";
  createdAt: string;     // ISO 8601
}
```

## growthub-pipeline Adapter

**Required env:**
- `GROWTHUB_BRIDGE_ACCESS_TOKEN`
- `GROWTHUB_BRIDGE_BASE_URL`

**Payload shape (DynamicRegistryPipeline):**
```json
{
  "nodeType": "video-generation",
  "model": "veo-3.1-generate-001",
  "prompts": ["<scene prompt>"],
  "referenceImages": [
    { "type": "data", "data": "<base64>", "mimeType": "image/jpeg" }
  ],
  "outputFormat": "mp4",
  "clientId": "<client>",
  "projectId": "<project>"
}
```

**Normaliser:** `lib/adapters/generative/growthub-pipeline-normalizer.js`  
Accepts NDJSON `ExecutionEvent` stream, emits `GenerativeArtifact[]`.

## byo-api-key Adapter

**Required env:**
- `VIDEO_MODEL_PROVIDER` — one of `veo`, `fal`, `runway`
- Provider key: `GOOGLE_AI_API_KEY` / `FAL_API_KEY` / `RUNWAY_API_KEY`

Each provider SDK call must normalise output to the same `GenerativeArtifact[]` contract before writing `manifest.json`.

## Manifest

`output/<client>/<project>/generative/manifest.json`:
```json
{
  "kitId": "growthub-creative-video-pipeline-v1",
  "adapter": "growthub-pipeline",
  "createdAt": "<iso>",
  "artifacts": [/* GenerativeArtifact[] */]
}
```
