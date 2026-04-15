/**
 * Knowledge Sync Runtime — Type Definitions
 *
 * CLI-runtime-level types for cross-workspace knowledge transport.
 * These extend the shared types with filesystem and auth-layer details
 * that only exist in the CLI process context.
 *
 * Shared envelope types live in @paperclipai/shared; re-exported here
 * for single-import ergonomics within the CLI.
 */

export type {
  WorkspaceRefKind,
  WorkspaceKnowledgeRef,
  KnowledgeSyncEnvelope,
  KnowledgeSyncItem,
  KnowledgeSyncEnvelopeVersion,
  CrossWorkspaceKitBundle,
  KnowledgeSyncResult,
  KnowledgeSyncItemResult,
  KnowledgeSyncStatus,
  KnowledgeCaptureInput,
  CaptureProposal,
  KnowledgeCaptureResult,
  WorkspaceKnowledgeSyncStatus,
} from "@paperclipai/shared/types/knowledge-sync.js";

// ---------------------------------------------------------------------------
// Local filesystem workspace resolution
// ---------------------------------------------------------------------------

/**
 * A fully resolved local workspace: config path is known and the workspace
 * server URL (if running) is available for direct API calls.
 */
export interface ResolvedLocalWorkspace {
  instanceId: string;
  configPath: string;
  label?: string;
  /** Port the local Paperclip server is running on, if detectable. */
  serverPort?: number;
  /** Full base URL for direct API calls, e.g. http://127.0.0.1:3100 */
  serverBaseUrl?: string;
}

// ---------------------------------------------------------------------------
// Transport options
// ---------------------------------------------------------------------------

export interface ExportOptions {
  /** Company/workspace ID to export from (local DB). */
  companyId: string;
  /** Resolved workspace this export originates from. */
  sourceWorkspace: ResolvedLocalWorkspace;
  /** Optional target workspace ref (for envelope metadata). */
  targetRef?: import("@paperclipai/shared/types/knowledge-sync.js").WorkspaceKnowledgeRef;
  /** Max bytes per envelope. Default: 512 KB. */
  maxBytes?: number;
  /** Optional human label for this export batch. */
  label?: string;
}

export interface ImportOptions {
  /** Company/workspace ID to import into (local DB). */
  companyId: string;
  /** The envelope to import. */
  envelope: import("@paperclipai/shared/types/knowledge-sync.js").KnowledgeSyncEnvelope;
  /** Whether to also relay to hosted Growthub app. Default: false. */
  relayToHosted?: boolean;
  /** Auth session for hosted relay (required if relayToHosted is true). */
  hostedSession?: import("../../auth/session-store.js").CliAuthSession;
}

// ---------------------------------------------------------------------------
// Hosted relay options
// ---------------------------------------------------------------------------

export interface HostedRelayOptions {
  envelope: import("@paperclipai/shared/types/knowledge-sync.js").KnowledgeSyncEnvelope;
  session: import("../../auth/session-store.js").CliAuthSession;
  /** Base URL of the hosted Growthub app. Falls back to session growthubBaseUrl. */
  baseUrl?: string;
}

export interface HostedRelayResult {
  ok: boolean;
  relayed: number;
  skipped: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Capture advisor input/output (CLI-side, wraps shared types)
// ---------------------------------------------------------------------------

export interface CaptureAdvisorInput {
  runId: string;
  executionSummaryText: string;
  userIntent?: string;
  artifactSummaries: Array<{
    artifactType: string;
    sourceNodeSlug: string;
    outputText?: string;
  }>;
}

export interface CaptureAdvisorResult {
  proposals: import("@paperclipai/shared/types/knowledge-sync.js").CaptureProposal[];
  explanation: string;
  confidence: number;
}
