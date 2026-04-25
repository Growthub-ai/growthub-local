/**
 * @growthub/api-contract — Pipeline Kits (CMS SDK v1)
 *
 * Public, type-only surface for the Pipeline Kit Contract v1.
 *
 * A Pipeline Kit is any Growthub worker kit whose `kit.json` payload
 * coordinates two or more sequential stages, each of which has its own
 * sub-skill, consumes a typed input artifact, produces a typed output
 * artifact, and records its boundary in `.growthub-fork/project.md` and
 * `trace.jsonl`.
 *
 * The reference implementation is `growthub-creative-video-pipeline-v1`,
 * which ships `pipeline.manifest.json` matching this shape.
 *
 * The convention is documented in
 * `docs/PIPELINE_KIT_CONTRACT_V1.md`. This module makes the shape
 * machine-readable so CLI, agents, and hosted surfaces can inspect
 * pipeline topology without parsing prose.
 *
 * Rules:
 *   - Additive only. Existing kits without `pipeline.manifest.json` stay
 *     valid.
 *   - No runtime behavior. Consumers parse JSON into these shapes.
 *   - SDK describes what must be true, not how it is done. No fields
 *     reference provider SDKs, model IDs, or kit-specific implementation
 *     details.
 */
/**
 * A pipeline artifact path. Stage inputs and outputs are always
 * represented as POSIX-style paths under the kit's output topology
 * (typically `output/<client>/<project>/<bucket>/<file>`).
 *
 * The path may contain `<client>` / `<project>` placeholders in the
 * manifest; consumers substitute them at runtime.
 */
export interface PipelineArtifactRef {
    /** POSIX-style path, possibly including `<client>` / `<project>` placeholders. */
    path: string;
    /**
     * Optional descriptor of what this artifact is. Used by agents to
     * decide how to read it (markdown brief vs. JSON manifest vs. video
     * file). Free-form; not enumerated.
     */
    kind?: string;
}
/**
 * A named adapter mode a stage may operate under. The manifest only
 * declares which modes the stage supports; selection happens at runtime
 * via env or kit config.
 *
 * See `@growthub/api-contract/adapters` for the full adapter contract.
 */
export interface PipelineAdapterModeRef {
    /** Adapter mode identifier (e.g. `growthub-pipeline`, `byo-api-key`). */
    id: string;
    /**
     * Optional env var name a kit reads to select this mode. Surfaces it
     * for agents performing pre-flight checks.
     */
    envSelector?: string;
}
/**
 * What the stage commits to record. A pipeline kit MUST emit at least
 * `pipeline_stage_started` and one of `pipeline_stage_completed` /
 * `pipeline_stage_failed`. Additional event names are declared per stage.
 *
 * See `@growthub/api-contract/trace` (PipelineTraceEvent) for the
 * additive event union.
 */
export interface PipelineTraceExpectation {
    /** Whether the stage MUST append to `.growthub-fork/trace.jsonl`. */
    required: boolean;
    /**
     * Whether the stage MUST append to `.growthub-fork/project.md`
     * (human-readable session memory).
     */
    projectMemoryRequired: boolean;
    /** Optional explicit list of event names the stage emits. */
    events?: string[];
}
/**
 * One stage of a pipeline. Sub-skill is the execution boundary
 * (primitive #5). Inputs and outputs are typed paths. Adapter modes are
 * declared if the stage has provider variability.
 */
export interface PipelineStageRef {
    /** Stable stage identifier (kebab-case). Matches the sub-skill directory. */
    id: string;
    /** Short human label for UIs and logs. */
    label?: string;
    /** Path to the sub-skill SKILL.md (relative to kit root). */
    subSkillPath: string;
    /** Artifact paths the stage reads. */
    inputArtifacts: PipelineArtifactRef[] | string[];
    /** Artifact paths the stage writes. */
    outputArtifacts: PipelineArtifactRef[] | string[];
    /** Helper script paths the stage may invoke. */
    helperPaths?: string[];
    /** Adapter modes the stage supports, if any. */
    adapterModes?: PipelineAdapterModeRef[] | string[];
    /** External dependency ids (from workspace.dependencies.json) the stage delegates to. */
    externalDependencies?: string[];
    /** Trace expectations for the stage. May be a single boolean for legacy compatibility. */
    traceRequired?: boolean | PipelineTraceExpectation;
    /** Whether the stage MUST append to `.growthub-fork/project.md`. */
    projectMemoryRequired?: boolean;
}
/**
 * Where a pipeline writes its artifacts. Matches the convention in
 * `docs/PIPELINE_KIT_CONTRACT_V1.md`:
 *
 *   `output/<client>/<project>/<bucket>/<artifact>`
 *
 * `buckets[]` enumerates the per-stage subdirectories (e.g. `brief`,
 * `generative`, `final`).
 */
export interface PipelineOutputTopology {
    /** Root, typically `output/<client>/<project>`. */
    root: string;
    /** Bucket names corresponding to stage outputs. */
    buckets: string[];
}
/**
 * Trace policy declared once at the manifest level. Per-stage
 * expectations may override on each `PipelineStageRef`.
 */
export interface PipelineTracePolicy {
    /** Doc reference (e.g. `docs/PIPELINE_TRACE_CONVENTION_V1.md`). */
    convention?: string;
    /** Trace file path inside the fork (e.g. `.growthub-fork/trace.jsonl`). */
    traceFile?: string;
    /** Project-memory file path (e.g. `.growthub-fork/project.md`). */
    projectMemoryFile?: string;
}
/**
 * Session-memory policy declared once at the manifest level.
 */
export interface PipelineSessionMemoryPolicy {
    /** Template path used to seed session memory at fork-register time. */
    seedTemplate?: string;
    /** Boundary names where the kit appends to session memory. */
    appendOn?: string[];
}
/**
 * Convention envelope. Lets readers verify they understand the manifest
 * version and assert that the manifest is convention-only (no runtime
 * enforcement) until a future SDK release flips the gate.
 */
export interface PipelineConventionEnvelope {
    /** Path to the convention doc (e.g. `docs/PIPELINE_KIT_CONTRACT_V1.md`). */
    spec?: string;
    /** Convention version. Matches `PIPELINE_KIT_MANIFEST_VERSION`. */
    version?: number;
    /** Who interprets the manifest at runtime. Typically `agents-and-operators-only` in v1. */
    interpretedBy?: string;
    /** Whether the CLI / runtime enforces the manifest. `none` in v1. */
    runtimeEnforcement?: "none" | "warn" | "error";
}
/**
 * Top-level pipeline kit manifest. Lives at
 * `cli/assets/worker-kits/<kit>/pipeline.manifest.json`.
 */
export interface PipelineKitManifest {
    /** Manifest schema version. Matches `PIPELINE_KIT_MANIFEST_VERSION`. */
    version: number;
    /** Kit identifier (matches `kit.json#kit.id`). */
    kitId: string;
    /** Pipeline identifier (stable across kit versions). */
    pipelineId: string;
    /** Output topology. */
    outputTopology?: PipelineOutputTopology;
    /** Trace policy. */
    tracePolicy?: PipelineTracePolicy;
    /** Session memory policy. */
    sessionMemoryPolicy?: PipelineSessionMemoryPolicy;
    /** Stages in execution order. */
    stages: PipelineStageRef[];
    /** Convention envelope. */
    convention?: PipelineConventionEnvelope;
}
/**
 * Sentinel for `PipelineKitManifest.version`. Surfaces may read this to
 * confirm they are talking to the v1 manifest shape. Additive changes
 * keep this literal `1`.
 */
export declare const PIPELINE_KIT_MANIFEST_VERSION: 1;
//# sourceMappingURL=pipeline-kits.d.ts.map