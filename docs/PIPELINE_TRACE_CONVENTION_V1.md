# Pipeline Trace Convention — v1

This document **describes the stage-boundary event names** that pipeline-style
worker kits write to `.growthub-fork/trace.jsonl`. It is a convention so that
agents reading any pipeline kit's trace can resume work without parsing prose.

**Status:** Frozen as v1 convention. Promotion to a typed
`PipelineTraceEvent` union in `@growthub/api-contract` is **deferred** until
at least two pipeline-style kits emit these events without divergence.

---

## Why

The creative-video-pipeline kit shipped in commit `7eb832d` already appends
to `.growthub-fork/project.md` (human) and `.growthub-fork/trace.jsonl`
(machine) at every stage boundary. The kit-local
`docs/governed-workspace-primitives.md` documents these event types:
`stage-complete`, `auth-preflight`, `adapter-selected`, `artifact-written`,
`self-eval-pass`, `self-eval-retry`.

This document **does not break** those names. It defines a richer,
generic event set that any pipeline kit can adopt going forward without
giving up backwards compatibility.

---

## Event names

| Event name | When emitted | Required fields |
|---|---|---|
| `pipeline_stage_started` | Just before a stage runs | `pipelineId`, `stageId`, `client`, `project`, `timestamp` |
| `pipeline_stage_completed` | After a stage finishes successfully | `pipelineId`, `stageId`, `client`, `project`, `outputArtifacts`, `timestamp` |
| `pipeline_stage_failed` | After a stage fails | `pipelineId`, `stageId`, `client`, `project`, `error`, `timestamp` |
| `pipeline_artifact_written` | Whenever a stage writes a tracked artifact | `pipelineId`, `stageId`, `path`, `bytes`, `timestamp` |
| `pipeline_handoff_created` | When the artifact crosses a stage boundary (input to the next stage, or output to an external repo) | `pipelineId`, `fromStageId`, `toStageId` (or `toDependencyId`), `path`, `timestamp` |

All events MUST also include the kit's `kitId`.

---

## Event detail shape

Events are NDJSON lines (one JSON object per line) appended to
`.growthub-fork/trace.jsonl`.

```json
{
  "type": "pipeline_stage_completed",
  "kitId": "growthub-creative-video-pipeline-v1",
  "pipelineId": "creative-video-pipeline",
  "stageId": "generative-execution",
  "client": "growthub",
  "project": "spring-launch",
  "inputArtifacts": [
    "output/growthub/spring-launch/brief/pipeline-brief.md"
  ],
  "outputArtifacts": [
    "output/growthub/spring-launch/generative/manifest.json"
  ],
  "adapter": "growthub-pipeline",
  "timestamp": "2026-04-25T14:32:11.123Z"
}
```

### Required fields (any pipeline event)

- `type` — one of the v1 event names above OR a kit-local legacy name
- `kitId` — the kit emitting the event
- `pipelineId` — from `pipeline.manifest.json#pipelineId`
- `timestamp` — ISO-8601 UTC

### Stage-event fields

- `stageId` — from `pipeline.manifest.json#stages[].id`
- `client`, `project` — derived from output topology
- `inputArtifacts[]`, `outputArtifacts[]` — POSIX paths under
  `output/<client>/<project>/`
- `adapter` — when the stage selected an adapter mode

### Handoff-event fields

- `fromStageId` — upstream stage
- `toStageId` OR `toDependencyId` — downstream stage, or external dependency
  id from `workspace.dependencies.json`
- `path` — handoff artifact path

---

## Backwards compatibility with existing event names

The creative-video-pipeline kit currently writes:

| Existing name | v1 mapping (additive, not replacement) |
|---|---|
| `stage-complete` | also emit `pipeline_stage_completed` |
| `auth-preflight` | unchanged — kit-local diagnostic |
| `adapter-selected` | unchanged — kit-local diagnostic |
| `artifact-written` | also emit `pipeline_artifact_written` |
| `self-eval-pass` / `self-eval-retry` | unchanged — `SkillSelfEval` events |

A v1-conformant kit MAY emit both the legacy and the v1 names during a
migration window. Readers MUST handle both.

---

## What this convention does NOT do

- It does **not** add a `PipelineTraceEvent` type to
  `@growthub/api-contract` yet.
- It does **not** require any kit to rename existing events.
- It does **not** mandate a specific NDJSON writer; any append-only writer
  that produces one JSON object per line is conformant.
- It does **not** define cross-kit aggregation.

---

## Promotion criteria (deferred)

Promote `PipelineTraceEvent` into `@growthub/api-contract` only when:

1. Two pipeline-style kits emit all five v1 event names.
2. The fields are unchanged across both kits (no per-kit divergence in
   shape).
3. A reader (the SDK's NDJSON parser, the studio shell, or the Vercel app)
   can resume a pipeline from `trace.jsonl` alone.

Until then, the source of truth is **this document plus each kit's
`pipeline.manifest.json#tracePolicy`**.

---

## Cross-references

- [`PIPELINE_KIT_CONTRACT_V1.md`](./PIPELINE_KIT_CONTRACT_V1.md) — pipeline
  kit convention
- [`packages/api-contract/src/events.ts`](../packages/api-contract/src/events.ts)
  — existing `ExecutionEvent` types from the hosted bridge
- [`cli/assets/worker-kits/growthub-creative-video-pipeline-v1/docs/governed-workspace-primitives.md`](../cli/assets/worker-kits/growthub-creative-video-pipeline-v1/docs/governed-workspace-primitives.md)
  — kit-local trace policy
