# Pipeline Trace Convention — v1 (specialization)

Stage-boundary trace events for **multi-stage worker kits** (those that
adopt the [Pipeline Kit
specialization](./PIPELINE_KIT_CONTRACT_V1.md)). It is an *additive*
layer on top of any kit-local trace events the kit was already
emitting; nothing existing is renamed.

The SDK source of truth is
[`@growthub/api-contract/pipeline-trace`](../packages/api-contract/src/pipeline-trace.ts):

```ts
import type {
  PipelineTraceEvent,
  PipelineStageStartedEvent,
  PipelineStageCompletedEvent,
  PipelineStageFailedEvent,
  PipelineArtifactWrittenEvent,
  PipelineHandoffCreatedEvent,
} from "@growthub/api-contract/pipeline-trace";
import {
  isPipelineTraceEvent,
  PIPELINE_TRACE_VERSION,
} from "@growthub/api-contract/pipeline-trace";
```

Distinct from `@growthub/api-contract/events` (`ExecutionEvent`), which
types hosted CLI/SDK NDJSON streams. These two unions do not overlap
and serve different surfaces.

---

## Scope

This convention applies to any Worker Kit that:

- declares a `pipeline.manifest.json` (Pipeline Kit specialization);
- writes stage-boundary trace events to `.growthub-fork/trace.jsonl`.

Single-skill kits and operator kits emit kit-level trace events
(`auth-preflight`, `adapter-selected`, `artifact-written`,
`self-eval-pass`, `self-eval-retry`, etc.) — those continue to be
valid. This document does not change them.

---

## v1 event names

| Event name | When emitted | Required fields |
|---|---|---|
| `pipeline_stage_started` | Just before a stage runs | `pipelineId`, `stageId`, `client`, `project`, `timestamp` |
| `pipeline_stage_completed` | After a stage finishes successfully | `pipelineId`, `stageId`, `client`, `project`, `outputArtifacts`, `timestamp` |
| `pipeline_stage_failed` | After a stage fails | `pipelineId`, `stageId`, `client`, `project`, `error`, `timestamp` |
| `pipeline_artifact_written` | Whenever a stage writes a tracked artifact | `pipelineId`, `stageId`, `path`, `bytes`, `timestamp` |
| `pipeline_handoff_created` | When the artifact crosses a stage boundary (input to the next stage, or output to an external dependency) | `pipelineId`, `fromStageId`, `toStageId` (or `toDependencyId`), `path`, `timestamp` |

Every event also includes the kit's `kitId`.

---

## Event detail shape

NDJSON, one JSON object per line, appended to
`.growthub-fork/trace.jsonl`.

```json
{
  "type": "pipeline_stage_completed",
  "kitId": "<kit-id>",
  "pipelineId": "<pipelineId from pipeline.manifest.json>",
  "stageId": "<stage id>",
  "client": "<client slug>",
  "project": "<project slug>",
  "inputArtifacts": ["..."],
  "outputArtifacts": ["..."],
  "adapter": "<adapter mode if applicable>",
  "timestamp": "<ISO-8601 UTC>"
}
```

---

## Backwards compatibility

Existing kit-local event names remain valid. The v1 union is additive,
not a replacement.

| Existing kit-local name | v1 mapping (additive) |
|---|---|
| `stage-complete` | also emit `pipeline_stage_completed` |
| `auth-preflight` | unchanged — kit-level diagnostic |
| `adapter-selected` | unchanged — kit-level diagnostic |
| `artifact-written` | also emit `pipeline_artifact_written` |
| `self-eval-pass` / `self-eval-retry` | unchanged — `SkillSelfEval` events |

A v1-conformant kit MAY emit both legacy and v1 names during a
migration window. Readers MUST handle both. The SDK type guard
`isPipelineTraceEvent` returns `true` only for v1 events, so consumers
can branch cleanly.

---

## What this specialization does NOT do

- It does **not** require every kit to emit pipeline trace events —
  only kits with a `pipeline.manifest.json` should.
- It does **not** rename existing kit-local event names.
- It does **not** mandate a specific NDJSON writer.
- It does **not** define cross-kit aggregation.

---

## Cross-references

- [`WORKER_KIT_CONTRACT_V1.md`](./WORKER_KIT_CONTRACT_V1.md) — foundation contract
- [`PIPELINE_KIT_CONTRACT_V1.md`](./PIPELINE_KIT_CONTRACT_V1.md) — pipeline kit specialization
- [`packages/api-contract/src/pipeline-trace.ts`](../packages/api-contract/src/pipeline-trace.ts) — SDK types
- [`packages/api-contract/src/events.ts`](../packages/api-contract/src/events.ts) — distinct hosted `ExecutionEvent` NDJSON contract
