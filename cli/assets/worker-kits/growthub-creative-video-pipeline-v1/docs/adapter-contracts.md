# Adapter Contracts

## GenerativeArtifact

Both adapters must produce `GenerativeArtifact[]` objects. This is a kit-internal type — it is NOT exported from `@growthub/api-contract`:

```ts
interface GenerativeArtifact {
  id: string;            // video.id | video.storage_path | uuid fallback
  type: "video" | "image";
  url: string | null;    // remote URL if available
  localPath: string | null;
  mimeType: string | null;  // "video/mp4" | "image/jpeg" etc.
  metadata: { nodeId: string } & Record<string, unknown>;
  stage: "generative";
  createdAt: string;     // ISO 8601
}
```

---

## growthub-pipeline Adapter

**Required env:**
- `GROWTHUB_BRIDGE_ACCESS_TOKEN`
- `GROWTHUB_BRIDGE_BASE_URL`
- Valid `growthub auth login` session in `~/.claude/config/session.json`

**CLI invocation:**
```bash
growthub pipeline execute '<DynamicRegistryPipeline JSON>'
```
Single positional argument — JSON string or path to a JSON file. No `--workflow` or `--input` flags.

**Payload shape (DynamicRegistryPipeline):**
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

**NDJSON ExecutionEvent types** (from `@growthub/api-contract`):
```
node_start     { type, nodeId, slug, at }
node_complete  { type, nodeId, slug, output?, at }   ← .output may contain .videos[], .images[]
node_error     { type, nodeId, slug, error, at }
progress       { type, stage, message?, at }
credit_warning { type, availableCredits?, message?, at }
complete       { type, executionId, summary?, at }   ← summary.executionLog may have full artifact list
error          { type, message, at }
```

**There is no `artifact` event type.** Artifacts are extracted from:
1. `node_complete.output.videos[]` / `.images[]` during streaming
2. `complete.summary.executionLog[].output.videos[]` / `.images[]` at termination

**Normaliser:** `lib/adapters/generative/growthub-pipeline-normalizer.js`

---

## byo-api-key Adapter

**Required env:**
- `VIDEO_MODEL_PROVIDER` — one of `veo`, `fal`, `runway`
- Provider key: `GOOGLE_AI_API_KEY` / `FAL_API_KEY` / `RUNWAY_API_KEY`

Each provider SDK call must normalise output to the same `GenerativeArtifact[]` contract before writing `manifest.json`.

---

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

---

## Auth Pre-flight

Before any growthub-pipeline execution:
```bash
growthub auth whoami --json
```

If the session is expired or absent:
```bash
growthub auth login
```

Session is stored at `~/.claude/config/session.json` by the growthub CLI.
