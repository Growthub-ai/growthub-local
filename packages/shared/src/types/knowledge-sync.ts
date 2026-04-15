/**
 * Cross-Workspace Knowledge Sync — Shared Type Definitions
 *
 * These types define the unified transportation layer for knowledge items
 * across local workspaces (folders on the user's machine, each representing
 * an ecosystem or worker kit) and the hosted Growthub app.
 *
 * Design constraints:
 *   - Local runtime uses embedded Postgres via @paperclipai/db (Drizzle)
 *   - Hosted Growthub app uses Supabase Postgres + Next.js Auth
 *   - Transport layer never touches Supabase directly
 *   - All hosted relay goes through existing CLI authenticated endpoints
 *   - Every import is idempotent (duplicate sha256 bodies are skipped)
 */

// ---------------------------------------------------------------------------
// Workspace reference
// ---------------------------------------------------------------------------

/** How the target workspace is identified. */
export type WorkspaceRefKind =
  | "label"        // growthubWorkspaceLabel from auth config
  | "config_path"  // absolute path to a paperclip config file
  | "instance_id"  // paperclip instance ID (from worktree or config)
  | "hosted";      // the connected hosted Growthub app (via auth token)

export interface WorkspaceKnowledgeRef {
  kind: WorkspaceRefKind;
  /** For label/instance_id kinds: the string identifier. */
  value: string;
  /** Human-readable display name for this workspace. */
  displayName?: string;
}

// ---------------------------------------------------------------------------
// Knowledge sync envelope — the transport primitive
// ---------------------------------------------------------------------------

export type KnowledgeSyncEnvelopeVersion = 1;

export type KnowledgeSyncDirection = "export" | "import";

/** Payload inside the envelope — a batch of skill doc items. */
export interface KnowledgeSyncItem {
  /** Stable ID within the originating workspace (uuid). */
  originId: string;
  name: string;
  description: string;
  body: string;
  format: string;
  /** Source tag: "agent_run", "custom", "kit_seed", "cross_workspace", etc. */
  source: string;
  /** SHA-256 of body (UTF-8 encoded). Used for deduplication. */
  bodySha256: string;
  /** Additional structured metadata from the originating workspace. */
  metadata?: Record<string, unknown>;
}

/** Signed, versioned envelope for transporting knowledge items between workspaces. */
export interface KnowledgeSyncEnvelope {
  version: KnowledgeSyncEnvelopeVersion;
  envelopeId: string;
  createdAt: string;
  /** The workspace that produced this envelope. */
  sourceRef: WorkspaceKnowledgeRef;
  /** The intended destination workspace (may differ from actual importer). */
  targetRef?: WorkspaceKnowledgeRef;
  /** Knowledge items being transported. */
  items: KnowledgeSyncItem[];
  /** SHA-256 of the JSON-serialized `items` array (for integrity verification). */
  itemsSignature: string;
  /** Optional label for this sync batch. */
  label?: string;
  /** Total body bytes across all items. */
  totalBodyBytes: number;
}

// ---------------------------------------------------------------------------
// Cross-workspace kit bundle
// ---------------------------------------------------------------------------

/**
 * A multi-workspace knowledge bundle: knowledge collected from multiple
 * workspaces (ecosystems / worker kits) combined into a single transferable unit.
 */
export interface CrossWorkspaceKitBundle {
  version: 1;
  bundleId: string;
  createdAt: string;
  /** Descriptive label for this bundle. */
  label: string;
  /** Which workspaces contributed to this bundle. */
  sourceRefs: WorkspaceKnowledgeRef[];
  /** The combined envelopes, one per source workspace. */
  envelopes: KnowledgeSyncEnvelope[];
  /** Aggregate stats. */
  stats: {
    totalItems: number;
    totalBodyBytes: number;
    workspaceCount: number;
  };
}

// ---------------------------------------------------------------------------
// Sync result
// ---------------------------------------------------------------------------

export type KnowledgeSyncStatus =
  | "imported"
  | "skipped_duplicate"
  | "failed"
  | "relayed_to_hosted";

export interface KnowledgeSyncItemResult {
  originId: string;
  name: string;
  status: KnowledgeSyncStatus;
  localId?: string;
  reason?: string;
}

export interface KnowledgeSyncResult {
  envelopeId: string;
  processedAt: string;
  imported: number;
  skipped: number;
  failed: number;
  relayedToHosted: number;
  items: KnowledgeSyncItemResult[];
}

// ---------------------------------------------------------------------------
// Post-run knowledge capture
// ---------------------------------------------------------------------------

/** Input for the post-run capture primitive. */
export interface KnowledgeCaptureInput {
  /** Run or execution ID (for traceability). */
  runId: string;
  /** The company/workspace ID to write items into. */
  companyId: string;
  /** Artifacts produced by the run. */
  artifactSummaries: Array<{
    artifactType: string;
    sourceNodeSlug: string;
    outputText?: string;
    metadata?: Record<string, unknown>;
  }>;
  /** Human-readable execution summary text (from native-intelligence or deterministic). */
  executionSummary?: string;
  /** User intent / prompt that triggered the run, if available. */
  userIntent?: string;
  /** Whether to also relay captured items to the hosted app. */
  relayToHosted?: boolean;
}

/** A proposed knowledge item from the capture advisor. */
export interface CaptureProposal {
  name: string;
  description: string;
  body: string;
  format: "markdown" | "text" | "json";
  source: "agent_run";
  confidence: number;
  reason: string;
}

/** Result of the post-run capture operation. */
export interface KnowledgeCaptureResult {
  runId: string;
  proposalCount: number;
  savedCount: number;
  relayedCount: number;
  items: Array<{
    name: string;
    localId: string;
    relayed: boolean;
  }>;
}

// ---------------------------------------------------------------------------
// Sync status / discovery
// ---------------------------------------------------------------------------

/** Summary of the knowledge sync state for a workspace. */
export interface WorkspaceKnowledgeSyncStatus {
  workspaceRef: WorkspaceKnowledgeRef;
  localItemCount: number;
  lastSyncAt?: string;
  lastCaptureAt?: string;
  pendingExportCount: number;
  hostedSyncEnabled: boolean;
  hostedLastSyncAt?: string;
}
