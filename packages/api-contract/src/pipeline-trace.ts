/**
 * @growthub/api-contract — Pipeline Trace (CMS SDK v1)
 *
 * Public, type-only surface for stage-boundary trace events.
 *
 * Distinct from `./events.ts` (which types hosted CLI/SDK
 * `ExecutionEvent` NDJSON streams). This module types the events a
 * Pipeline Kit appends to `.growthub-fork/trace.jsonl` at every stage
 * boundary.
 *
 * The convention is documented in
 * `docs/PIPELINE_TRACE_CONVENTION_V1.md`.
 *
 * Rules:
 *   - Additive only. Kits emitting only legacy event names
 *     (`stage-complete`, `adapter-selected`, etc.) stay valid; readers
 *     handle both.
 *   - No runtime behavior. Writers append NDJSON lines; readers parse
 *     them.
 *   - Events MUST be JSON-serializable.
 */

// ---------------------------------------------------------------------------
// Common envelope — fields every pipeline trace event carries
// ---------------------------------------------------------------------------

/**
 * Fields present on every pipeline trace event.
 */
export interface PipelineTraceEnvelope {
  /** Event type discriminator. */
  type: PipelineTraceEventType;
  /** Kit identifier emitting the event. */
  kitId: string;
  /** Pipeline identifier (matches `pipeline.manifest.json#pipelineId`). */
  pipelineId: string;
  /** ISO-8601 UTC timestamp. */
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export type PipelineTraceEventType =
  | "pipeline_stage_started"
  | "pipeline_stage_completed"
  | "pipeline_stage_failed"
  | "pipeline_artifact_written"
  | "pipeline_handoff_created";

// ---------------------------------------------------------------------------
// Stage-boundary events
// ---------------------------------------------------------------------------

/**
 * Emitted just before a stage runs.
 */
export interface PipelineStageStartedEvent extends PipelineTraceEnvelope {
  type: "pipeline_stage_started";
  stageId: string;
  client: string;
  project: string;
  inputArtifacts?: string[];
  /** Adapter mode selected for the stage, if applicable. */
  adapter?: string;
}

/**
 * Emitted after a stage finishes successfully.
 */
export interface PipelineStageCompletedEvent extends PipelineTraceEnvelope {
  type: "pipeline_stage_completed";
  stageId: string;
  client: string;
  project: string;
  inputArtifacts?: string[];
  outputArtifacts: string[];
  adapter?: string;
}

/**
 * Emitted after a stage fails. The kit's self-eval / retry policy
 * (`SkillSelfEval.maxRetries`) governs whether the runner retries.
 */
export interface PipelineStageFailedEvent extends PipelineTraceEnvelope {
  type: "pipeline_stage_failed";
  stageId: string;
  client: string;
  project: string;
  /** Free-form error message. */
  error: string;
  /** Optional structured error code (e.g. `auth-failed`, `provider-rate-limit`). */
  code?: string;
  adapter?: string;
}

/**
 * Emitted whenever a stage writes a tracked artifact.
 */
export interface PipelineArtifactWrittenEvent extends PipelineTraceEnvelope {
  type: "pipeline_artifact_written";
  stageId: string;
  /** POSIX-style path (substituted, no `<client>` / `<project>` placeholders). */
  path: string;
  /** Optional byte size of the artifact. */
  bytes?: number;
}

/**
 * Emitted when an artifact crosses a stage boundary — input to the next
 * stage, or output to an external dependency / repo.
 */
export interface PipelineHandoffCreatedEvent extends PipelineTraceEnvelope {
  type: "pipeline_handoff_created";
  fromStageId: string;
  /** Either a downstream stage id OR an external dependency id (mutually exclusive). */
  toStageId?: string;
  toDependencyId?: string;
  path: string;
}

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------

export type PipelineTraceEvent =
  | PipelineStageStartedEvent
  | PipelineStageCompletedEvent
  | PipelineStageFailedEvent
  | PipelineArtifactWrittenEvent
  | PipelineHandoffCreatedEvent;

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

const PIPELINE_TRACE_EVENT_TYPES = new Set<PipelineTraceEventType>([
  "pipeline_stage_started",
  "pipeline_stage_completed",
  "pipeline_stage_failed",
  "pipeline_artifact_written",
  "pipeline_handoff_created",
]);

/**
 * Returns `true` when the value is a v1 pipeline trace event. Returns
 * `false` for legacy kit-local event names (e.g. `stage-complete`),
 * which remain valid in `trace.jsonl` but are not part of this union.
 */
export function isPipelineTraceEvent(value: unknown): value is PipelineTraceEvent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.type !== "string") return false;
  if (!PIPELINE_TRACE_EVENT_TYPES.has(v.type as PipelineTraceEventType)) return false;
  if (typeof v.kitId !== "string") return false;
  if (typeof v.pipelineId !== "string") return false;
  if (typeof v.timestamp !== "string") return false;
  return true;
}

// ---------------------------------------------------------------------------
// Version sentinel
// ---------------------------------------------------------------------------

/**
 * Sentinel for `PipelineTraceEvent` consumers. Additive changes (new
 * event types) keep this literal `1`; renames or removals force a bump.
 */
export const PIPELINE_TRACE_VERSION = 1 as const;
