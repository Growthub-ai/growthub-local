# Video Model Contract Verification

Date: 2026-04-26

This note is a verification packet for the Growthub Local CLI/SDK JSON path
against the gh-app video-generation runtime.

## Verified Sources

- gh-app runtime registry:
  `/Users/antonio/gh-app/packages/agents-sandbox/lib/tools/helpers/atlas-model-registry.ts`
- gh-app runtime validator:
  `/Users/antonio/gh-app/packages/agents-sandbox/lib/tools/video-generation.ts`
- gh-app hosted manifest route:
  `/Users/antonio/gh-app/src/app/api/cms/capabilities/route.ts`
- Growthub Local manifest client:
  `cli/src/runtime/cms-manifest-client/index.ts`
- Growthub Local capability registry:
  `cli/src/runtime/cms-capability-registry/`

## Quantified Model Truth

Run:

```bash
node scripts/verify-video-model-contract.mjs --hosted
```

Verified counts from the current gh-app source:

| Surface | Count |
| --- | ---: |
| Stable video schema IDs | 6 |
| Atlas video registry rows | 77 |
| Atlas image registry rows | 60 |
| Atlas total generative media rows | 137 |
| Stable/Atlas overlap | 2 |
| Unique accepted videoModel IDs | 81 |
| Atlas-only video IDs | 75 |

The "100+" catalog number is the combined Atlas generative media catalog
`77 video + 60 image = 137`. The active video runtime has 81 unique accepted
`videoModel` IDs when Sora, Veo, and Seedance stable aliases are included.

## Schema Proof

The active gh-app video tool validates `videoModel`, not `video_model`.

The verifier proves:

```json
{
  "camelAtlas": { "ok": true, "provider": "Atlas" },
  "snakeAtlasOnly": { "ok": false, "error": "videoModel required" },
  "bothConflict": { "ok": true, "provider": "Veo" },
  "badCamel": { "ok": false, "error": "unsupported videoModel" }
}
```

Implication: `video_model` must not be emitted as canonical CLI/SDK JSON. If
accepted for compatibility, it should only be normalized at an input boundary:

1. if `videoModel` is absent and `video_model` is present, copy
   `video_model` to `videoModel`;
2. if both are present and differ, reject or warn clearly;
3. internal/runtime JSON remains `videoModel`.

## Hosted Discovery Proof

Hosted production exposes Atlas capabilities only when experimental rows are
requested:

```bash
node - <<'NODE'
(async () => {
  const url = 'https://www.growthub.ai/api/cms/capabilities?family=video&include_experimental=true&include_disabled=true'
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  const json = await res.json()
  console.log(json.capabilities.map((c) => c.slug))
})()
NODE
```

Verified slugs include:

- `video-generation`
- `atlas-video-generation`
- `seedance-video-generation`
- `sora-video-generation`
- `veo-generate-video`

Default CLI discovery previously missed this because the local manifest client
called `/api/cms/capabilities` without `include_experimental=true`.

## Implemented Local CLI Patch

Growthub Local now has an explicit experimental discovery path:

- `fetchCapabilityManifest({ includeExperimental, includeDisabled })`
- `CapabilityQuery.includeExperimental`
- `growthub capability list --include-experimental`
- `growthub capability inspect <slug> --include-experimental`

This keeps normal discovery conservative while allowing Atlas verification and
operator scripting through the supported manifest path.

The flag is the existing CMS/SDK field:

```json
{
  "slug": "atlas-video-generation",
  "experimental": true
}
```

Do not create a second stability primitive for this. CLI text may label the row
as experimental for readability, but machine consumers should read
`experimental`.

## Canonical JSON Output Shape

Use `videoModel` for both the one-true public node and Atlas-specific hidden
capability rows.

Public single-node video generation:

```json
{
  "pipelineId": "video_public_atlas_model",
  "executionMode": "hosted",
  "nodes": [
    {
      "id": "node_video_1",
      "slug": "video-generation",
      "bindings": {
        "videoModel": "atlas-runway-gen4-turbo-i2v",
        "prompt": "Generate the requested video.",
        "seconds": "8",
        "resolution": "1080p",
        "aspectRatio": "16:9",
        "creativeCount": 1,
        "refs": [],
        "referenceImages": [],
        "firstFrame": "",
        "inputReference": ""
      }
    }
  ]
}
```

Experimental Atlas capability inspection/execution shape:

```json
{
  "pipelineId": "video_atlas_capability",
  "executionMode": "hosted",
  "nodes": [
    {
      "id": "node_atlas_video_1",
      "slug": "atlas-video-generation",
      "bindings": {
        "provider": "atlascloud",
        "videoModel": "atlas-runway-gen4-turbo-i2v",
        "prompt": "Generate the requested video.",
        "seconds": "8",
        "resolution": "1080p",
        "aspectRatio": "16:9",
        "creativeCount": 1,
        "inputReference": null,
        "referenceImages": []
      }
    }
  ]
}
```

## Next Hardening Steps

1. Add a boundary normalizer in the CLI pipeline JSON loader:
   `video_model` to `videoModel` only when unambiguous.
2. Add a focused test asserting the normalizer rejects conflicting
   `videoModel` and `video_model`.
3. Add a manifest projection test that `--include-experimental` surfaces
   `atlas-video-generation`.
4. Keep all execution payloads canonical on `videoModel`.

## Authenticated Artifact Download Pattern

Generated media should be captured from execution output, then downloaded
through Growthub auth. Do not extract Supabase anon keys from the browser
bundle.

The hosted video tools already return the required fields:

```json
{
  "videoUrl": "https://...",
  "storagePath": "workflow_videos/{userId}/{threadId}/{videoId}.mp4",
  "bucket": "node_documents"
}
```

SDK/CLI consumers should persist the full execution result immediately:

```bash
growthub pipeline execute ./payload.json --json > result.json
```

Then extract secure download pointers from node results:

```bash
node -e "
  const r = require('./result.json')
  Object.entries(r.nodeResults)
    .filter(([, n]) => n.output?.storagePath)
    .forEach(([nodeId, n]) => console.log(nodeId, n.output.storagePath))
"
```

The authenticated download URL is:

```text
{hostedBaseUrl}/api/secure-image?bucket=node_documents&path={encodeURIComponent(storagePath)}
```

Request it with the Growthub CLI session bearer token:

```js
const res = await fetch(url, {
  headers: { Authorization: `Bearer ${session.accessToken}` }
})
```

Server-side hardening required in gh-app: for
`workflow_videos/{userId}/{threadId}/...`, `/api/secure-image` must compare the
path user id with the authenticated session user id before service-role
download. Path allowlisting alone is not enough.
