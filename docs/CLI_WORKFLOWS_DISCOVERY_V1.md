# CLI Workflow Node CMS Orchestrator — Setup & Discovery Guide

This is the agent-facing source of truth for the `growthub-local` workflow discovery surface.

It covers:
- discovery entrypoints for workflow lanes
- the three supported workflow surfaces and when to use each
- hosted workflow config and bridge schema expectations
- CMS node adapter contract
- save and execute bridge endpoints
- what the CLI owns vs what hosted Growthub owns

---

## Discovery Entrypoint

The single correct entrypoint for this repo is:

```bash
zsh /Users/antonio/growthub-local/scripts/demo-cli.sh cli discover
```

Or via the public CLI after install:

```bash
growthub discover
```

Auth must be active before using Workflows:

```bash
growthub auth login
growthub auth whoami
```

---

## Top-Level Discovery Menu (Workflow-Relevant)

```
Growthub Local
├── Agent Harness      (filter and harness tooling)
├── Worker Kits
├── Templates
├── Workflows          ← requires auth
├── Local Intelligence
├── Settings           ← includes account connection and integration lanes
└── Help CLI
```

Inside `Workflows`, the hub presents three surfaces:

```
Workflows
├── Saved Workflows      (hosted-authenticated, no machine link required)
├── Templates            (requires hosted auth + local machine link)
└── Dynamic Pipelines    (requires hosted auth + local machine link)
```

---

## Surface 1 — Saved Workflows

Use this to list, inspect, and execute workflows already persisted in hosted Growthub.

### What it does

1. Fetches the workflow list from `GET /api/cli/profile?view=workflows`
2. Paginates the list (10 per page, searchable)
3. Loads workflow detail from `GET /api/cli/profile?view=workflow&workflowId=<id>`
4. Shows node count, node slugs, creation date
5. Requires two confirmations before execution (intent + credit acknowledgement)
6. Deserializes the hosted config back into a `DynamicRegistryPipeline`
7. Executes via `POST /api/execute-workflow`
8. Streams progress, renders completion summary, reports credits
9. Supports lifecycle actions from the same menu:
   - archive via `POST /api/cli/profile?action=archive-workflow`
   - delete via `POST /api/cli/profile?action=delete-workflow`

### Discovery path

```
Workflows
-> Saved Workflows
-> <select workflow by name>
-> Execute saved workflow
-> Confirm x2
```

### Fallback

If hosted auth is unavailable, falls back to local JSON files at:

```
~/.paperclip/workflows/*.json
```

---

## Surface 2 — Templates

Use this to assemble a new hosted workflow from a built-in CMS capability node.

### What it does

1. Reads the built-in CMS capability registry (shipped with the CLI)
2. Filters by family (video / image / slides / text / data / ops / research / vision)
3. Shows template card: displayName, slug, family, category, nodeType, execution strategy, tool name, output types, input fields
4. Assembles a single-node pipeline via `createPipelineBuilder`
5. Pre-fills bindings from the node's `input_template`; prompts only for empty string fields
6. Saves the workflow through `POST /api/cli/profile?action=save-workflow`

### Discovery path

```
Workflows
-> Templates
-> <select family>
-> <select template>
-> Assemble a pipeline from this template
-> <fill required inputs>
-> Save pipeline
```

### Saved name format

Workflows saved through this path are named `<displayName> Workflow`.

---

## Surface 3 — Dynamic Pipelines

Use this when you need to hand-assemble a multi-node pipeline interactively.

Entry delegates to `runPipelineAssembler` in `cli/src/commands/pipeline.ts`.

### Discovery path

```
Workflows
-> Dynamic Pipelines
-> <follow pipeline assembler prompts>
```

Requires hosted auth + local machine link.

---

## Hosted Workflow Config Schema

This is the wire shape the hosted runtime expects. The CLI builds this via `buildHostedWorkflowConfig`.

```json
{
  "name": "<pipelineId>",
  "nodes": [
    {
      "id": "start-1",
      "type": "start",
      "position": { "x": 0, "y": 0 },
      "data": {}
    },
    {
      "id": "<node-id>",
      "type": "cmsNode",
      "position": { "x": 300, "y": 0 },
      "data": {
        "slug": "<node-slug>",
        "inputs": { "<key>": "<value>" }
      }
    },
    {
      "id": "end-1",
      "type": "end",
      "position": { "x": 600, "y": 0 },
      "data": {}
    }
  ],
  "edges": [
    { "id": "e-start-1-<node-id>", "source": "start-1", "target": "<node-id>" },
    { "id": "e-<node-id>-end-1",   "source": "<node-id>", "target": "end-1" }
  ]
}
```

### Node position rule

Each node position increments by 300 on the x-axis:
- `start-1` → `x: 0`
- first CMS node → `x: 300`
- second CMS node → `x: 600`
- `end-1` → `x: (cmsNodes.length + 1) * 300`

### Edge wiring rules

- Every CMS node with no `upstreamNodeIds` connects from `start-1`
- Every CMS node that is not a source for another node connects to `end-1`
- Multi-node chains use explicit upstream-to-downstream edges

---

## DynamicRegistryPipeline Schema

This is the internal pipeline shape the CLI uses before converting to the hosted config.

```ts
{
  pipelineId: string;
  executionMode: "hosted";
  nodes: Array<{
    id: string;
    slug: string;
    bindings: Record<string, unknown>;
    upstreamNodeIds?: string[];
  }>;
  metadata?: {
    hostedWorkflowId?: string;
    workflowName?: string;
  };
}
```

When deserializing a hosted workflow for execution, the CLI converts:
- `node.data.slug` → `node.slug`
- `node.data.inputs` → `node.bindings`
- Edge source/target → `upstreamNodeIds`
- `workflowId` → `metadata.hostedWorkflowId`

---

## Hosted Bridge Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/cli/session` | Verify active session |
| `GET` | `/api/cli/profile?view=workflows` | List saved workflows |
| `GET` | `/api/cli/profile?view=workflow&workflowId=<id>` | Load workflow detail + config |
| `POST` | `/api/cli/profile?action=save-workflow` | Save new workflow |
| `POST` | `/api/cli/profile?action=archive-workflow` | Archive existing workflow |
| `POST` | `/api/cli/profile?action=delete-workflow` | Delete existing workflow |
| `GET` | `/api/cli/profile?view=credits` | Read credit balance |
| `POST` | `/api/execute-workflow` | Execute a workflow pipeline |

---

## CMS Node Adapter Contract

Every CMS capability node registered in the CLI must conform to this shape in its `executionTokens`:

```ts
{
  tool_name: string;
  input_template: Record<string, unknown>;   // default values for each input field
}
```

The CLI reads `input_template` to pre-fill bindings during template assembly. Fields with empty string values (`""`) are prompted interactively. All other fields use their default.

### Available Template Families

| Family | Color label | Notes |
|--------|-------------|-------|
| `video` | Video | Includes `video-generation` |
| `image` | Image | |
| `slides` | Slides | |
| `text` | Text | |
| `data` | Data | |
| `ops` | Ops | |
| `research` | Research | |
| `vision` | Vision | |

---

## Video Generation Node — Adapter Specification

### The one true node

Do not create provider-specific graph nodes for video generation.

```
graph slug: video-generation
```

The provider choice belongs entirely inside `inputs.videoModel`.

### Full input slot specification

```json
{
  "videoModel": "veo-3.1-generate-001",
  "prompt": "<your video generation prompt>",
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

### Critical adapter rules

| Slot | Rule |
|------|------|
| `refs[].dataUrl` | Must be a typed data URL. Example: `data:image/jpeg;base64,...` |
| `referenceImages` | Keep empty (`[]`) when using `refs` |
| `firstFrame` | Keep empty (`""`) on this path |
| `inputReference` | Keep empty (`""`) on this path |
| `videoModel` | Must match the provider slug exactly |

**Do not** pass URL-only `referenceImages`. The Veo executor maps `refs[].dataUrl` to the Vertex reference-image path. URL-only payloads cause `image mime type is empty` at Vertex.

### Validated provider models

- `veo-3.1-generate-001` — proven working, confirmed in production execution

---

## End-to-End Setup — Custom Video Pipeline

To set up a new custom video generation workflow through discovery:

### Step 1 — Authenticate

```bash
growthub auth login
growthub auth whoami
```

### Step 2 — Open discovery

```bash
zsh /Users/antonio/growthub-local/scripts/demo-cli.sh cli discover
```

### Step 3 — Assemble and save

```
Growthub Local
-> Workflows
-> Templates
-> Video
-> Video Generation
-> Assemble a pipeline from this template
-> <fill prompt field>
-> Save pipeline
```

The workflow is saved to hosted Growthub via `POST /api/cli/profile?action=save-workflow`.

Name format: `Video Generation Workflow` (unless customized in the pipeline assembler).

### Step 4 — Execute from Saved Workflows

```
Growthub Local
-> Workflows
-> Saved Workflows
-> <select workflow>
-> Execute saved workflow
-> Confirm x2
```

### Step 5 — Verify in asset library

After execution completes with `Status: succeeded`, the generated artifact appears in the hosted Growthub media library automatically. This is handled by the hosted runtime persistence layer, not the CLI.

---

## Output And Persistence Model

```
CLI (invoking surface)
  └── POST /api/execute-workflow
        └── Hosted runtime (execution layer)
              └── Hosted asset storage (persistence layer)
                    └── Media library (browser-visible)
```

The CLI does not own artifact storage. It owns invocation and terminal rendering only.

---

## Definition Of Done For Any Video Pipeline Save

A video pipeline save is correct only when all of the following are true:

1. The workflow was assembled from the `Templates` surface using the `video-generation` slug
2. The `refs[].dataUrl` field carries a typed data URL for reference image payloads
3. The workflow was saved through `POST /api/cli/profile?action=save-workflow`
4. The workflow appears in `Saved Workflows` in the discovery hub
5. The workflow can be executed from `Saved Workflows` and returns `Status: succeeded`
6. The generated clip appears in the hosted asset library

---

## Commands Reference

```bash
# Interactive discovery (repo path)
zsh /Users/antonio/growthub-local/scripts/demo-cli.sh cli discover

# Interactive discovery (public CLI)
growthub discover

# Workflow surfaces
growthub workflow
growthub workflow templates
growthub workflow templates --family video
growthub workflow templates --json
growthub workflow saved
growthub workflow saved --json

# Auth
growthub auth login
growthub auth whoami

# Pipeline assembler
growthub pipeline
growthub pipeline assemble
```

---

## Anti-Patterns

- Do not use `node_clarifion_veo` or any provider-specific node slug. Use `video-generation`.
- Do not pass URL-only `referenceImages`. Use `refs[].dataUrl` with typed data URLs.
- Do not manually construct the hosted config shape. Use `buildHostedWorkflowConfig` or the template assembler.
- Do not bypass the `Saved Workflows` lifecycle menu for archive/delete; use the hosted bridge actions so CLI and GH app state stay consistent.
- Do not describe the two-terminal dev loop as the repo default. Use `scripts/runtime-control.sh`.
