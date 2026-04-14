/**
 * Artifact Contract Layer — Type Definitions
 *
 * Standardizes outputs from dynamic pipelines so they work the same across:
 *   - local runtime
 *   - browser surfaces
 *   - hosted app
 *   - serverless futures
 *
 * Compatible with:
 *   - manifest registry artifact semantics
 *   - thread-scoped output logic
 *   - IssueWorkProduct types (packages/shared)
 */

// ---------------------------------------------------------------------------
// Artifact types
// ---------------------------------------------------------------------------

export type GrowthubArtifactType =
  | "video"
  | "image"
  | "slides"
  | "text"
  | "report"
  | "pipeline";

export type ArtifactExecutionContext = "local" | "hosted" | "hybrid";

export type ArtifactStatus =
  | "pending"
  | "generating"
  | "ready"
  | "failed"
  | "archived";

// ---------------------------------------------------------------------------
// Core artifact manifest
// ---------------------------------------------------------------------------

export interface GrowthubArtifactManifest {
  /** Unique artifact ID. */
  id: string;
  /** Artifact type classification. */
  artifactType: GrowthubArtifactType;
  /** CMS capability slug that produced this artifact. */
  sourceNodeSlug: string;
  /** Machine connection ID that produced this artifact. */
  createdByConnectionId?: string;
  /** Execution context where the artifact was produced. */
  executionContext: ArtifactExecutionContext;
  /** Current artifact status. */
  status: ArtifactStatus;
  /** Pipeline ID that produced this artifact (if pipeline-scoped). */
  pipelineId?: string;
  /** Pipeline node ID that produced this artifact. */
  nodeId?: string;
  /** Thread/conversation ID scope. */
  threadId?: string;
  /** ISO timestamp when the artifact was created. */
  createdAt: string;
  /** ISO timestamp when the artifact was last updated. */
  updatedAt?: string;
  /** Opaque metadata from the producing node or pipeline. */
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Artifact content reference
// ---------------------------------------------------------------------------

export interface ArtifactContentRef {
  /** Artifact ID this content belongs to. */
  artifactId: string;
  /** Content MIME type. */
  mimeType: string;
  /** Content URL (hosted/S3/local path). */
  url?: string;
  /** Local file path (for local-context artifacts). */
  localPath?: string;
  /** Content size in bytes, if known. */
  sizeBytes?: number;
  /** SHA-256 checksum, if computed. */
  sha256?: string;
}

// ---------------------------------------------------------------------------
// Artifact query
// ---------------------------------------------------------------------------

export interface ArtifactQuery {
  /** Filter by artifact type. */
  artifactType?: GrowthubArtifactType;
  /** Filter by pipeline ID. */
  pipelineId?: string;
  /** Filter by source node slug. */
  sourceNodeSlug?: string;
  /** Filter by execution context. */
  executionContext?: ArtifactExecutionContext;
  /** Filter by status. */
  status?: ArtifactStatus;
  /** Filter by thread ID. */
  threadId?: string;
  /** Limit results. */
  limit?: number;
}

// ---------------------------------------------------------------------------
// Artifact store metadata
// ---------------------------------------------------------------------------

export interface ArtifactStoreMeta {
  /** Total artifacts tracked. */
  total: number;
  /** Source of the data. */
  source: "local" | "hosted" | "merged";
  /** ISO timestamp of freshness. */
  fetchedAt: string;
}
