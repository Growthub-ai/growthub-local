---
name: growthub-video-generation
description: Execute the one-true `video-generation` CMS node with correct reference-image bindings (typed data URLs via `refs[].dataUrl`, not URL-only `referenceImages`). Use when the user asks to generate video, use Veo / Vertex video generation, or execute a video workflow with a local reference image.
---

# Growthub Video Generation — Adapter Rules

There is exactly one correct node for video generation:

```
graph slug: video-generation
```

Provider choice lives entirely inside `inputs.videoModel`. Do not create or invoke provider-specific graph nodes (e.g. `node_clarifion_veo`).

Source of truth: `docs/CLI_WORKFLOWS_DISCOVERY_V1.md` and `cli/src/runtime/hosted-execution-client/`.

## Full input slot specification

```json
{
  "videoModel": "veo-3.1-generate-001",
  "prompt": "<video generation prompt>",
  "seconds": "8",
  "resolution": "1080p",
  "aspectRatio": "16:9",
  "creativeCount": 1,
  "refs": [
    {
      "name": "<reference label>",
      "dataUrl": "data:image/jpeg;base64,<base64-encoded-image>"
    }
  ],
  "referenceImages": [],
  "firstFrame": "",
  "inputReference": ""
}
```

## Critical adapter rules

| Slot | Rule |
|------|------|
| `refs[].dataUrl` | Must be a typed data URL. Example: `data:image/jpeg;base64,...`. |
| `referenceImages` | Keep empty (`[]`) when using `refs`. |
| `firstFrame` | Keep empty (`""`) on this path. |
| `inputReference` | Keep empty (`""`) on this path. |
| `videoModel` | Must match the provider slug exactly. |

Do not pass URL-only `referenceImages`. The Veo executor maps `refs[].dataUrl` to the Vertex reference-image path. URL-only payloads fail with `image mime type is empty` at Vertex.

## Validated provider models

- `veo-3.1-generate-001` — confirmed working in production execution.

## Local reference image → data URL

When the user provides a local image path, convert it to a typed data URL before embedding in `refs[]`:

```bash
mime=$(file --mime-type -b "$PATH_TO_IMAGE")
b64=$(base64 -w 0 "$PATH_TO_IMAGE" 2>/dev/null || base64 "$PATH_TO_IMAGE")
dataUrl="data:${mime};base64,${b64}"
```

Use the exact user-provided file path. Do not silently swap files.

## Two execution paths

### Path A — assemble, save, execute via discovery (recommended)

```
growthub discover
  → Workflows
  → Templates
  → Video
  → Video Generation
  → Assemble a pipeline from this template
  → (fill prompt and bindings)
  → Save pipeline          # POST /api/cli/profile?action=save-workflow
Then:
  → Saved Workflows
  → <select>
  → Execute saved workflow # confirm x2 (intent + credits)
```

### Path B — scripted `pipeline execute` (headless)

```bash
growthub pipeline execute '<DynamicRegistryPipeline JSON>' --json
```

Pipeline JSON must include:

- `executionMode: "hosted"`
- a single node with `slug: "video-generation"`
- a detailed prompt honoring user constraints
- `videoModel` binding requested by user (e.g. `veo-3.1-generate-001`)
- `refs[]` populated from the local file data URL, plus `referenceImages: []`, `firstFrame: ""`, `inputReference: ""`

Substitute `node "$REPO/cli/dist/index.js" …` or `bash "$REPO/scripts/demo-cli.sh" cli -- …` if the installed CLI is unavailable.

## Prompt quality requirements

The prompt must:

- specify composition intent (framing, camera motion, subject action),
- include brand/style constraints,
- request exact preservation of logos or reference anchors when a ref is provided ("logo mark unchanged, no text replacement"),
- include the visible-text constraint only when the user asks for it.

If the user says "under 25 words", apply that to **visible text in the generated clip** — not to the prompt — unless they explicitly say "prompt-length limit".

Do not shorten the prompt unless the user requests brevity.

## Hosted config parity

When CLI serializes to the hosted wire shape, nodes carry `type: "cmsNode"` with `data.slug` and `data.inputs`, and positions increment by 300 on x. Use `buildHostedWorkflowConfig` via the template assembler — never hand-construct hosted JSON.

## Success criteria

Consider the task complete only if all are true:

1. execution `status` is `succeeded`,
2. output includes at least one video artifact,
3. artifact URL is returned to the user,
4. user constraints are reflected in prompt and bindings,
5. reference image (if provided) was embedded as a typed data URL in `refs[].dataUrl`.

## Required response format to the user

Return:

- execution id
- workflow id / thread id
- final artifact URL
- exact prompt used
- confirmation that the local reference image was embedded as a data URL in `refs[].dataUrl`, with `referenceImages: []`, `firstFrame: ""`, `inputReference: ""`

If quality is off, run a tighter second pass with stricter logo-placement and composition wording — do not change the node slug or the bindings shape.

## Anti-patterns (do not do)

- Do not use `node_clarifion_veo` or any provider-specific slug.
- Do not pass URL-only `referenceImages`.
- Do not hand-construct hosted workflow JSON; use the Templates surface or the pipeline assembler.
- Do not bypass Saved Workflows lifecycle menus for archive/delete.
