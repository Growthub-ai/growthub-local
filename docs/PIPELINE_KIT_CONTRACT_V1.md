# Pipeline Kit Contract — v1 (convention)

This document **describes a repeatable pattern** observed in shipped worker
kits. It does not introduce SDK types, CLI behavior, or runtime gates. It is a
convention so that agents and humans can read any complex multi-stage worker
kit with the same mental model.

**Reference implementation:** `cli/assets/worker-kits/growthub-creative-video-pipeline-v1/`
shipped in commit `7eb832d` (`feat: ship creative video pipeline worker kit`).

**Status:** Frozen as v1 convention. Promotion to `@growthub/api-contract`
types is **deferred** until at least two pipeline-style kits validate the
shape end-to-end (per the
[`AGENTS.md`](../AGENTS.md) source-of-truth order).

---

## Why this exists

The creative-video-pipeline kit composes:

- a brand-driven brief stage
- a hosted Growthub CMS node OR a BYOK provider stage
- an external-repo (`video-use`) edit stage
- a Vite operator shell + a Next.js app surface
- per-stage sub-skills + helpers
- artifact output topology + project memory + trace appends

That pattern is repeatable. Capturing it now — **before** SDK promotion —
prevents the wrong abstraction from being frozen too early.

---

## What a Pipeline Kit is

A Pipeline Kit is any Growthub worker kit whose `kit.json` payload coordinates
**two or more sequential stages**, each of which:

1. has its own sub-skill SKILL.md under `skills/<stage-id>/`
2. consumes a typed input artifact and produces a typed output artifact on
   disk under `output/<client>/<project>/`
3. records its boundary in `.growthub-fork/project.md` and `trace.jsonl`

A single-stage kit is **not** a pipeline kit — it does not need this contract.

---

## The seven surfaces

A Pipeline Kit declares the following surfaces. Names are conventions, not
SDK types yet.

| Surface | What it answers | Lives at |
|---|---|---|
| `id` | Stable kit identifier | `kit.json#kit.id` |
| `stages[]` | Ordered execution lanes | `pipeline.manifest.json#stages` |
| `adapters[]` | Provider-boundary contracts | `docs/adapter-contracts.md` (kit-local) |
| `externalDependencies[]` | Repos / forks the kit delegates to | `workspace.dependencies.json` |
| `outputTopology` | Disk layout for artifacts | `output-standards.md` |
| `tracePolicy` | Stage-boundary event names + shape | `docs/PIPELINE_TRACE_CONVENTION_V1.md` |
| `sessionMemoryPolicy` | Where `project.md` lives + when it is appended | `templates/project.md` |

---

## Stage contract

Each entry under `pipeline.manifest.json#stages[]` follows this shape.
All paths are **relative to the kit root** in source, and to the
exported workspace root at runtime.

```json
{
  "id": "generative-execution",
  "label": "Generate",
  "subSkillPath": "skills/generative-execution/SKILL.md",
  "inputArtifacts": [
    "output/<client>/<project>/brief/pipeline-brief.md"
  ],
  "outputArtifacts": [
    "output/<client>/<project>/generative/manifest.json"
  ],
  "helperPaths": [
    "helpers/run-pipeline.sh",
    "helpers/check-generative-adapter.sh"
  ],
  "adapterModes": [
    "growthub-pipeline",
    "byo-api-key"
  ],
  "traceRequired": true,
  "projectMemoryRequired": true
}
```

### Hard rules

- **Sub-skill = stage boundary.** A stage is the unit at which a parallel
  sub-agent can execute under
  [`SkillSubSkillRef`](../packages/api-contract/src/skills.ts).
- **Artifacts are paths, not opaque blobs.** The handoff between stages is
  always a file under `output/<client>/<project>/`.
- **Adapter modes are explicit.** Stages with multiple provider paths declare
  every mode they support; selection happens via env or config, never via
  branching on provider internals inside domain code.
- **External systems are reached through adapters or handoff artifacts only.**
  No inlined logic from external repos (e.g. the kit MUST NOT inline
  `video-use` editing logic — `edit-plan.md` is the only interface).
- **Trace + project-memory append at every stage boundary.** No silent stages.

---

## External dependency contract

`workspace.dependencies.json` is the kit-local manifest of external repos /
forks. Each entry follows:

```json
{
  "id": "video-use",
  "kind": "git-fork",
  "env": "VIDEO_USE_HOME",
  "setup": "setup/clone-fork.sh",
  "install": "setup/install-skill.sh",
  "health": "setup/verify-env.mjs",
  "usedByStages": ["video-edit"],
  "interfaceArtifact": "output/<client>/<project>/generative/manifest.json",
  "handoffArtifact": "output/<client>/<project>/final/final.mp4"
}
```

### Hard rules

- **Every external repo a stage depends on must appear here.** No hidden
  clones, no implicit fork URLs in shell scripts.
- **`env` is the only contract for locating the dependency at runtime.** Kits
  must not hardcode absolute paths.
- **`interfaceArtifact` is the upstream stage's output.** The dependency
  reads it.
- **`handoffArtifact` is the dependency's output.** A downstream stage (or
  the workspace consumer) reads it.

---

## Output topology

Pipeline Kits use a fixed three-tier output layout:

```
output/<client>/<project>/<stage-bucket>/<artifact>
```

Where `<stage-bucket>` is one of `brief/`, `generative/`, `final/`, or any
additional bucket the kit declares in `output-standards.md`.

This is the **pipeline state contract**: an agent (or operator) can resume
mid-pipeline by inspecting the topology alone.

---

## Trace policy

See [`PIPELINE_TRACE_CONVENTION_V1.md`](./PIPELINE_TRACE_CONVENTION_V1.md).

Every stage MUST emit at least:

- `pipeline_stage_started`
- `pipeline_stage_completed` (or `pipeline_stage_failed`)
- `pipeline_artifact_written` for each artifact produced
- `pipeline_handoff_created` when the artifact crosses a stage boundary

Existing kit-local event names (`stage-complete`, `adapter-selected`,
`artifact-written`, `self-eval-pass`, `self-eval-retry`, `auth-preflight`)
remain valid; the v1 convention does not require renaming.

---

## Adapter policy

See [`ADAPTER_CONTRACTS_V1.md`](./ADAPTER_CONTRACTS_V1.md).

A stage that has provider variability MUST express it as an adapter, never
as branching inside domain code. Each adapter mode has:

- an env or config selector
- a provider-specific implementation
- a normalized output shape that downstream stages read

---

## Session-memory policy

`.growthub-fork/project.md` is seeded from `templates/project.md` at fork
register time and appended at every stage boundary. The append format is
free-form prose; the machine-readable counterpart is `trace.jsonl`.

---

## What this contract does NOT do

- It does **not** add types to `@growthub/api-contract`.
- It does **not** change CLI runtime behavior.
- It does **not** introduce a global `growthub kit health` command.
- It does **not** require non-pipeline kits to add a `pipeline.manifest.json`.
- It does **not** privilege the hosted Growthub adapter over BYOK.

---

## Promotion criteria (deferred work)

Promote any of the seven surfaces into `@growthub/api-contract` only when:

1. At least **two** pipeline-style kits ship with both
   `pipeline.manifest.json` and `workspace.dependencies.json`.
2. Independent agents (Claude Code, Cursor, Codex) can read both manifests
   and successfully resume a pipeline mid-flight without reading the kit's
   prose docs.
3. The trace event union has been used by both kits without divergence.

When all three are true, the proposed SDK landing zones are:

- `packages/api-contract/src/pipelines.ts` — `PipelineKitManifest`,
  `PipelineStageRef`, `ArtifactRef`
- `packages/api-contract/src/workspaces.ts` — `WorkspaceDependencyRef`
- `packages/api-contract/src/adapters.ts` — `AdapterContractRef`

Until then, the source of truth is **this document plus the kit-local
manifests**.

---

## Cross-references

- [`AGENTS.md`](../AGENTS.md) — repository agent contract
- [`docs/WORKER_KIT_ARCHITECTURE.md`](./WORKER_KIT_ARCHITECTURE.md) — kit
  architecture baseline
- [`docs/ADAPTER_CONTRACTS_V1.md`](./ADAPTER_CONTRACTS_V1.md) — adapter
  generic rule
- [`docs/PIPELINE_TRACE_CONVENTION_V1.md`](./PIPELINE_TRACE_CONVENTION_V1.md)
  — stage trace events
- [`cli/assets/worker-kits/growthub-creative-video-pipeline-v1/docs/pipeline-architecture.md`](../cli/assets/worker-kits/growthub-creative-video-pipeline-v1/docs/pipeline-architecture.md)
  — kit-local architecture (reference implementation)
