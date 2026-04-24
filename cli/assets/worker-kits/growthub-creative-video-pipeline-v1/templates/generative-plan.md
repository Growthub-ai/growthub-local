# Generative Plan — [CLIENT] / [PROJECT]
> Stage 2 planning artifact. Fill before running `helpers/run-pipeline.sh` or BYOK execution.

---

## Adapter

```
CREATIVE_VIDEO_PIPELINE_GENERATIVE_ADAPTER=
VIDEO_MODEL_PROVIDER= (if byo-api-key)
```

---

## Node bindings

| Scene | Type | Model | Prompt (from brief Appendix) | Duration | Aspect |
|---|---|---|---|---|---|
| Scene 1 (Hook A) | video | veo-3.1-generate-001 | | 5s | 9:16 |
| Scene 2 | video | veo-3.1-generate-001 | | 8s | 9:16 |
| Scene N | image | (image capability) | | — | 9:16 |

---

## Reference images

> Bind as typed data URLs: `data:image/jpeg;base64,<base64>` per `@growthub/api-contract` ref spec.
> Never pass raw URLs as `refs[].dataUrl`.

| Name | Source | Purpose |
|---|---|---|
| brand_reference | brands/<client>/assets/logo.jpg | Brand anchor |
| scene_reference | brands/<client>/assets/reference.jpg | Visual style |

Shell command to convert a local image to a typed data URL:

```bash
python3 -c "
import base64, sys
with open(sys.argv[1], 'rb') as f:
    b64 = base64.b64encode(f.read()).decode()
print(f'data:image/{sys.argv[2]};base64,{b64}')
" brands/<client>/assets/logo.jpg jpeg
```

---

## Pipeline payload (growthub-pipeline adapter)

```json
{
  "pipelineId": "",
  "executionMode": "hosted",
  "nodes": [
    {
      "nodeId": "video-gen-1",
      "slug": "video-generation",
      "bindings": {
        "videoModel": "veo-3.1-generate-001",
        "prompt": "",
        "seconds": 8,
        "aspectRatio": "9:16",
        "creativeCount": 1,
        "refs": [
          { "name": "brand_reference", "dataUrl": "" }
        ]
      }
    }
  ]
}
```

---

## Expected output

```
output/<client>/<project>/generative/
├── manifest.json
├── scene1-hook-a.mp4
├── scene2.mp4
└── scene-n-bg.jpg
```
