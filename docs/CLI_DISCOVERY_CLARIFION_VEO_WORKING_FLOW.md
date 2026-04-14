# CLI Discovery Clarifion VEO Working Flow

This document is the frozen runbook for the validated Clarifion video-generation path that:

- saves through the interactive discovery CLI
- executes through the interactive discovery CLI
- uses the existing universal `video-generation` node
- returns a hosted video artifact in the user asset library

This covers the current working production path only.

## Outcome

The validated end-to-end result is:

- workflow saved in hosted Growthub through the CLI discovery flow
- workflow executed again from `Saved Workflows` through the CLI discovery flow
- output video persisted into hosted asset storage and visible in the media library

Validated artifact example:

- execution id: `e7a7626a-05b9-4ec0-9cae-b596bf22f9b5`
- clip URL: [veo-1776180800897.mp4](https://ibzcaryrkhjlalylcuog.supabase.co/storage/v1/object/public/node_documents/workflow_videos/20d81c2e-c440-4f93-afe2-1c45f39abd81/e7a7626a-05b9-4ec0-9cae-b596bf22f9b5/veo-1776180800897.mp4)

## The One True Node

Do not introduce a provider-specific workflow node for this path.

The working graph node is the existing universal node:

- graph slug: `video-generation`

Identity separation remains:

- pipeline identity: workflow / template surface
- graph identity: `video-generation`
- runtime identity: `Video Generation`

The provider choice belongs in the node inputs:

- `videoModel: "veo-3.1-generate-001"`

## Source Of Truth Contract

The relevant gh-app implementation already supports the working path:

- [video-generation.ts](/Users/antonio/gh-app/packages/agents-sandbox/lib/tools/video-generation.ts)
- [veo-executor.ts](/Users/antonio/gh-app/packages/agents-sandbox/lib/tools/helpers/veo-executor.ts)
- [VideoGenerationInputRenderer.tsx](/Users/antonio/gh-app/packages/agents-sandbox/lib/workflow/components/VideoGenerationInputRenderer.tsx)

The critical contract is:

- `referenceImages?: string[]`
- `refs?: Array<{ name?: string; dataUrl: string }>`

The runtime tool explicitly handles `refs` from the CMS executor and maps `refs[].dataUrl` into the Veo reference-image path.

That is the key adapter rule for this working flow.

## Why Older Clarifion Variants Failed

The failing Clarifion variants were built around the wrong image slot shape for this execution path.

The broken patterns were:

- URL-only `referenceImages`
- `firstFrame` or `inputReference` used as the primary Veo reference-image transport
- public URL image payloads that reached Vertex without a usable image mime contract

The observed failure on those variants was the Vertex-side error:

- `image mime type is empty`

## Exact Working Adapter Shape

For the validated Clarifion VEO save and execution path, use:

```json
{
  "videoModel": "veo-3.1-generate-001",
  "prompt": "Create a clean premium product video for the Clarifion device using the provided reference image, bright white background, soft blue edge glow, slow cinematic push-in, polished ecommerce lighting, subtle cable detail, 9:16 social ad framing.",
  "seconds": "8",
  "resolution": "1080p",
  "aspectRatio": "16:9",
  "creativeCount": 1,
  "refs": [
    {
      "name": "Clarifion reference",
      "dataUrl": "data:image/jpeg;base64,..."
    }
  ],
  "referenceImages": [],
  "firstFrame": "",
  "inputReference": ""
}
```

Important details:

- use `refs`, not URL-only `referenceImages`, for the working Veo reference-image bridge
- `refs[].dataUrl` must be a typed data URL, for example `data:image/jpeg;base64,...`
- keep `referenceImages` empty on this path
- keep `firstFrame` empty on this path
- keep `inputReference` empty on this path
- use the existing `video-generation` node slug

## Discovery Save Flow

The save must happen through the interactive discovery flow:

```text
Growthub Local
-> Workflows
-> Templates
-> Video
-> Video Generation
-> Assemble a pipeline from this template
-> Save pipeline
```

Hosted persistence is handled by the existing CLI bridge:

- `POST /api/cli/profile?action=save-workflow`

The CLI is the invoking surface.
Hosted Growthub remains the persistence layer.

## Discovery Execute Flow

The validated execution path must also stay inside the discovery surface:

```text
Growthub Local
-> Workflows
-> Saved Workflows
-> Clarifion VEO Discovery Working
-> Execute saved workflow
```

Validated discovery execution result:

```text
Workflow run [========================] 100% video-generation

Pipeline Execution Result
────────────────────────────────────────────────────────────────────────
  Execution ID: e7a7626a-05b9-4ec0-9cae-b596bf22f9b5
  Thread ID:    e7a7626a-05b9-4ec0-9cae-b596bf22f9b5
  Status:       succeeded
────────────────────────────────────────────────────────────────────────
  succeeded start-1 (start-1)
  succeeded video-generation (node_clarifion_veo)
  succeeded end-1 (end-1)
```

## Asset Library Confirmation

The successful run persisted into the hosted asset library as a generated video artifact.

The observed browser result showed:

- video card present in media library
- generated clip visible as `veo-1776181454561.mp4`
- source attributed to `Agent`

This confirms the CLI discovery execution path is not only terminal-successful. It also lands in the hosted media surface.

## Working Workflow Record

The known-good saved workflow is:

- name: `Clarifion VEO Discovery Working`
- workflow id: `e7a7626a-05b9-4ec0-9cae-b596bf22f9b5`

This is the workflow that matched the validated end-to-end path.

## Cleanup Reality

There were multiple older Clarifion workflows created while narrowing the adapter contract, including variants like:

- `Clarifion VEO Refs JPEG`
- `Clarifion VEO Clean PNG`
- `Clarifion VEO Clean JPEG`
- `Clarifion VEO Public JPEG`
- `Clarifion VEO Reference Object`
- `Clarifion VEO Public PNG`
- `Clarifion VEO Public URL`
- `Clarifion VEO No Image`
- `Clarifion VEO DataURL`

Those are confusing and should not be treated as canonical.

However, the current CLI bridge exposes:

- workflow list
- workflow detail
- workflow save
- workflow execute

It now exposes hosted workflow lifecycle actions from Saved Workflows, including archive and delete, through the CLI profile bridge actions.

The hosted delete route requires the normal browser-authenticated server session, not the CLI bearer bridge.

So the correct product follow-up is:

- keep `Clarifion VEO Discovery Working` as the canonical reference workflow
- add CLI bridge deletion support later if workflow cleanup must also be terminal-native

## Required Rules For Future Saves

If this flow is repeated for other reference-image Veo workflows, keep these rules:

1. Stay on the universal `video-generation` node.
2. Put provider choice in `videoModel`.
3. Use `refs[].dataUrl` for the reference image payload.
4. Save through `Workflows -> Templates`.
5. Execute through `Workflows -> Saved Workflows`.
6. Treat hosted Growthub as the source of truth for saved workflows and artifacts.

## Definition Of Done

This flow is correct only when all of the following are true:

- the workflow was created from the discovery CLI template flow
- the workflow was saved through the hosted CLI bridge
- the workflow was executed from discovery `Saved Workflows`
- the execution returned `succeeded`
- the resulting clip appears in the hosted asset library
