# Pipeline Kit Contract — v1 (specialization)

A **Pipeline Kit** is an *optional specialization* of a Worker Kit
([`WORKER_KIT_CONTRACT_V1.md`](./WORKER_KIT_CONTRACT_V1.md)). It applies
when a kit coordinates **two or more sequential stages**, each with a
typed input and output artifact.

A Pipeline Kit:

- still satisfies every Worker Kit primitive (kit.json, SKILL.md,
  templates, frozen-asset list, output topology)
- additionally ships `pipeline.manifest.json` to declare its stage
  topology in machine-readable form
- (commonly) also adopts orthogonal specializations
  ([workspace dependencies](./WORKER_KIT_CONTRACT_V1.md#optional-orthogonal-specializations),
  [adapter contracts](./ADAPTER_CONTRACTS_V1.md))

A single-skill kit is **not** a pipeline kit — it does not need this
specialization. The contract is opt-in.

---

## SDK source of truth

```ts
import type {
  PipelineKitManifest,       // top-level pipeline.manifest.json shape
  PipelineStageRef,          // one stage of execution
  PipelineArtifactRef,       // typed input/output artifact path
  PipelineAdapterModeRef,    // provider-mode declaration on a stage
  PipelineTraceExpectation,  // trace policy declared per stage
  PipelineOutputTopology,    // root + buckets layout
  PipelineTracePolicy,       // trace-file + project-memory paths
  PipelineSessionMemoryPolicy, // when to append to project.md
} from "@growthub/api-contract/pipeline-kits";
import { PIPELINE_KIT_MANIFEST_VERSION } from "@growthub/api-contract/pipeline-kits";
```

CLI consumer:

```bash
growthub kit pipeline inspect <kit-id-or-path> [--json]
```

The interactive `growthub kit` picker exposes this as a sub-action on
each kit's detail menu. Backwards compatible: kits without a
`pipeline.manifest.json` render an info message, not an error.

---

## Stage contract

Each `pipeline.manifest.json#stages[]` entry follows this shape:

```json
{
  "id": "<stage-id>",
  "label": "<short human label>",
  "subSkillPath": "skills/<stage-id>/SKILL.md",
  "inputArtifacts":  ["output/<client>/<project>/<bucket>/<input-file>"],
  "outputArtifacts": ["output/<client>/<project>/<bucket>/<output-file>"],
  "helperPaths":     ["helpers/<helper>.sh"],
  "adapterModes":    ["<mode-a>", "<mode-b>"],
  "externalDependencies": ["<dep-id>"],
  "traceRequired": true,
  "projectMemoryRequired": true
}
```

### Hard rules

- **Sub-skill is the stage boundary.** Each stage `id` matches a
  `skills/<id>/SKILL.md` (Worker Kit primitive #5).
- **Artifacts are paths, not opaque blobs.** The handoff between
  stages is always a file under `output/<client>/<project>/`.
- **Adapter modes are explicit.** Stages with provider variability
  declare every supported mode; selection happens via env or kit
  config, never by branching on provider internals inside domain code.
- **External dependencies are reached only through workspace
  dependencies.** Stages MUST NOT inline logic from external repos;
  they handoff via a file written under `output/`.
- **Trace + project-memory append at every stage boundary.** No
  silent stages.

---

## Output topology

Pipeline Kits use a fixed three-tier layout:

```
output/<client>/<project>/<bucket>/<artifact>
```

`buckets[]` enumerates the per-stage subdirectories (`brief`,
`generative`, `final`, etc., per the kit's choice).

The disk topology IS the pipeline state contract: an agent can resume
mid-pipeline from `output/` alone.

---

## Trace policy

See [`PIPELINE_TRACE_CONVENTION_V1.md`](./PIPELINE_TRACE_CONVENTION_V1.md).

Pipeline Kits emit (at minimum):

- `pipeline_stage_started`
- `pipeline_stage_completed` or `pipeline_stage_failed`
- `pipeline_artifact_written` per artifact
- `pipeline_handoff_created` when an artifact crosses a stage boundary
  or hands off to an external dependency

These events are **additive** on top of any kit-local trace events the
kit was already emitting (the v1 contract does not require renaming).

---

## Adapter policy

See [`ADAPTER_CONTRACTS_V1.md`](./ADAPTER_CONTRACTS_V1.md).

A stage that has provider variability MUST express it as an adapter,
never as branching inside domain code. Each adapter mode has:

- an env or config selector
- a provider-specific implementation
- a normalized output shape that downstream stages read

---

## Reference adoption

| Kit | Stages | External deps | Adapter modes |
|---|---|---|---|
| `growthub-creative-video-pipeline-v1` | 3 (brief → generate → edit) | 1 (`video-use`) | `growthub-pipeline`, `byo-api-key` |

Other kits in the catalog are eligible to adopt this specialization
when they grow into multi-stage workflows. The
[`WORKER_KIT_CONTRACT_V1.md`](./WORKER_KIT_CONTRACT_V1.md) catalog
table tracks adoption.

---

## What this specialization does NOT do

- It does **not** require any kit to adopt it. Single-skill kits
  remain valid Worker Kits without a `pipeline.manifest.json`.
- It does **not** privilege any adapter mode. Multiple modes are
  peers and must produce identical normalized outputs.
- It does **not** mandate runtime enforcement: today the CLI inspects
  and reports; it does not block kit downloads or executions on
  contract failures. `runtimeEnforcement: "none"` in every manifest
  envelope.
- It does **not** absorb implementation details into the SDK. The
  manifest declares stage shape; each kit owns its stage logic.

---

## Cross-references

- [`WORKER_KIT_CONTRACT_V1.md`](./WORKER_KIT_CONTRACT_V1.md) — foundation contract
- [`ADAPTER_CONTRACTS_V1.md`](./ADAPTER_CONTRACTS_V1.md) — adapter rule
- [`PIPELINE_TRACE_CONVENTION_V1.md`](./PIPELINE_TRACE_CONVENTION_V1.md) — trace events
- [`packages/api-contract/src/pipeline-kits.ts`](../packages/api-contract/src/pipeline-kits.ts) — SDK types
- [`cli/src/runtime/pipeline-kits/`](../cli/src/runtime/pipeline-kits/) — CLI runtime reader
