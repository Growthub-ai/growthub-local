/**
 * @growthub/api-contract — Workspace Helper (v1)
 *
 * Typed surface for the Growthub workspace-native helper: a governed,
 * workspace-grammar-aware planning engine that drafts dashboards, widget
 * layouts, API registry rows, and custom business objects, then returns
 * structured proposals for explicit human review before any mutation.
 *
 * The helper always operates in propose mode first. Mutation is a separate
 * governed apply step (POST /api/workspace/helper/apply) that validates
 * every proposal against the PATCH allowlist before writing.
 *
 * Wire shape: POST /api/workspace/helper/query
 *
 * Rules:
 *   - Additive only. The proposal type registry is append-only.
 *   - No direct mutation. The helper never writes workspace config.
 *   - Secrets never enter the prompt. workspaceSnapshot is sanitized
 *     server-side before being passed to the inference adapter.
 *   - The PATCH allowlist (dashboards, widgetTypes, canvas, dataModel)
 *     is the ceiling for every proposal type.
 */

// ---------------------------------------------------------------------------
// Intent
// ---------------------------------------------------------------------------

/**
 * What the caller wants the helper to produce. Each intent maps to a
 * distinct system-prompt specialization and a distinct set of valid
 * proposal types in the response.
 */
export type WorkspaceHelperIntent =
  | "build_dashboard"
  | "create_widget"
  | "register_api"
  | "create_object"
  | "edit_view"
  | "repair"
  | "explain";

export const WORKSPACE_HELPER_INTENT_VALUES: WorkspaceHelperIntent[] = [
  "build_dashboard",
  "create_widget",
  "register_api",
  "create_object",
  "edit_view",
  "repair",
  "explain",
];

// ---------------------------------------------------------------------------
// Proposal types
// ---------------------------------------------------------------------------

/**
 * Every concrete change the helper can propose. Each type maps to exactly
 * one top-level PATCH allowlist key (dashboards, widgetTypes, canvas,
 * dataModel) so the apply step can route without heuristics.
 *
 * Naming convention: <target>.<verb>
 */
export type WorkspaceProposalType =
  | "dashboard.create"
  | "dashboard.update"
  | "widgetType.bind"
  | "canvas.widget.add"
  | "canvas.tab.create"
  | "dataModel.object.create"
  | "dataModel.object.update"
  | "dataModel.row.add"
  | "repair.binding"
  | "explain.object";

export const WORKSPACE_HELPER_PROPOSAL_TYPES: WorkspaceProposalType[] = [
  "dashboard.create",
  "dashboard.update",
  "widgetType.bind",
  "canvas.widget.add",
  "canvas.tab.create",
  "dataModel.object.create",
  "dataModel.object.update",
  "dataModel.row.add",
  "repair.binding",
  "explain.object",
];

/**
 * Maps each proposal type to the PATCH allowlist key it belongs to.
 * Used by the apply step to route without branching on string prefixes.
 */
export const PROPOSAL_TYPE_TO_PATCH_FIELD: Record<WorkspaceProposalType, "dashboards" | "widgetTypes" | "canvas" | "dataModel"> = {
  "dashboard.create": "dashboards",
  "dashboard.update": "dashboards",
  "widgetType.bind": "widgetTypes",
  "canvas.widget.add": "canvas",
  "canvas.tab.create": "canvas",
  "dataModel.object.create": "dataModel",
  "dataModel.object.update": "dataModel",
  "dataModel.row.add": "dataModel",
  "repair.binding": "dataModel",
  "explain.object": "dataModel",
};

// ---------------------------------------------------------------------------
// Proposal
// ---------------------------------------------------------------------------

/**
 * A single governed change the helper proposes. The payload is the partial
 * workspace config fragment that should be merged into the target patch field.
 * It is intentionally untyped here — workspace-schema.js validates it at
 * apply time via validateWorkspaceConfig.
 */
export interface WorkspaceHelperProposal {
  /** Stable proposal type — determines the apply route and patch field. */
  type: WorkspaceProposalType;
  /**
   * The partial config payload to merge.
   * Shape matches the corresponding PATCH allowlist key value.
   * e.g. for "dashboard.create": a dashboard object `{ id, name, status, ... }`
   */
  payload: Record<string, unknown>;
  /** One-line human rationale for why this change was proposed. */
  rationale: string;
  /** Which top-level PATCH field this proposal targets. */
  affectedField: "dashboards" | "widgetTypes" | "canvas" | "dataModel";
  /** Optional confidence 0–1 from the local model. */
  confidence?: number;
}

// ---------------------------------------------------------------------------
// Receipt
// ---------------------------------------------------------------------------

/**
 * Metadata attached to every helper query response. Stored with run records
 * to seed the fine-tune loop — accepted proposals become training signal.
 */
export interface WorkspaceHelperReceipt {
  /** Model identifier used (e.g. "gemma3:4b", "growthub-local-expert"). */
  model: string;
  /** Adapter mode (e.g. "ollama", "lmstudio", "vllm"). */
  adapterMode: string;
  /** Inference endpoint hit. */
  endpoint: string;
  /** Aggregate confidence across all proposals (0–1). */
  confidence: number;
  /** Wall-clock latency in ms for the inference call. */
  latencyMs: number;
  /** ISO timestamp of this query. */
  ranAt: string;
  /** Server-generated run identifier for source-record tracing. */
  runId: string;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Sanitized workspace snapshot passed into the helper prompt.
 * Server strips envRefs values, credentials, and source-record contents
 * before this leaves the server. Only schema shape travels in the prompt.
 */
export interface WorkspaceHelperSnapshot {
  /** Top-level workspace id and name for context. */
  workspaceId?: string;
  workspaceName?: string;
  /** Existing dashboards (ids + names only — no widget payloads). */
  dashboards?: Array<{ id: string; name: string; status?: string }>;
  /** Currently registered widget types. */
  widgetTypes?: Array<{ kind: string; label: string }>;
  /** Existing data model object summaries (schema shape, no row data). */
  dataModelObjects?: Array<{
    id: string;
    label: string;
    objectType?: string;
    columns?: string[];
    rowCount?: number;
  }>;
  /** Canvas state summary (widget kinds present, tab count). */
  canvasSummary?: {
    widgetCount: number;
    tabCount: number;
    activeTabId?: string;
  };
}

/**
 * Request body for POST /api/workspace/helper/query.
 */
export interface WorkspaceHelperQuery {
  /** What the helper should produce. */
  intent: WorkspaceHelperIntent;
  /**
   * Optional pre-sanitized workspace snapshot.
   * If omitted the server reads and sanitizes the live growthub.config.json.
   */
  workspaceSnapshot?: WorkspaceHelperSnapshot;
  /** Natural-language business brief from the user. */
  userPrompt: string;
  /**
   * Execution mode. Currently only "propose" is supported.
   * Future: "apply" will skip the review step for trusted callers.
   */
  mode?: "propose";
  /**
   * Override the local model used for this query.
   * Falls back to the sandbox-environment row configuration or env defaults.
   */
  model?: string;
  /**
   * Override the adapter mode (ollama | lmstudio | vllm | custom-openai-compatible).
   * Falls back to the sandbox-environment row or NATIVE_INTELLIGENCE env defaults.
   */
  adapterMode?: string;
  /**
   * Override the local inference endpoint URL.
   * Falls back to env defaults (OLLAMA_BASE_URL, LMSTUDIO_BASE_URL, etc.).
   */
  localEndpoint?: string;
}

// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------

/**
 * Response body from POST /api/workspace/helper/query.
 */
export interface WorkspaceHelperResponse {
  ok: boolean;
  /** One-sentence summary of what the helper intends to change. */
  summary: string;
  /** Ordered list of governed proposals ready for human review + apply. */
  proposals: WorkspaceHelperProposal[];
  /** Non-blocking warnings (schema mismatches, low confidence, etc.). */
  warnings: string[];
  /** Run metadata for tracing and fine-tune loop seeding. */
  receipts: WorkspaceHelperReceipt;
  /** Error message if ok === false. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Apply request / response (used by POST /api/workspace/helper/apply)
// ---------------------------------------------------------------------------

/**
 * Request body for POST /api/workspace/helper/apply.
 * Accepts the proposals array from WorkspaceHelperResponse plus review metadata.
 */
export interface WorkspaceHelperApplyRequest {
  /** Proposals to apply. Must be a subset of a prior query response. */
  proposals: WorkspaceHelperProposal[];
  /** Human or agent identifier that reviewed and accepted these proposals. */
  reviewedBy?: string;
  /** Session identifier linking this apply to a prior query receipt. */
  sessionId?: string;
}

/**
 * Per-proposal apply outcome.
 */
export interface WorkspaceHelperApplyReceipt {
  type: WorkspaceProposalType;
  affectedField: "dashboards" | "widgetTypes" | "canvas" | "dataModel";
  appliedAt: string;
  reviewedBy?: string;
  sessionId?: string;
  rationale: string;
}

/**
 * Response body from POST /api/workspace/helper/apply.
 */
export interface WorkspaceHelperApplyResponse {
  ok: boolean;
  /** Receipts for every proposal that was successfully written. */
  applied: WorkspaceHelperApplyReceipt[];
  /** Proposals skipped with the reason they were skipped. */
  skipped: Array<{ proposal: WorkspaceHelperProposal; reason: string }>;
  /** Updated workspace config snapshot after all applies. */
  workspaceConfig?: Record<string, unknown>;
  error?: string;
}

// ---------------------------------------------------------------------------
// Pipeline node shapes (Phase 3 / SDK-first external surface)
// ---------------------------------------------------------------------------

/**
 * Input shape for a "workspace-helper" pipeline node.
 * Extends WorkspaceHelperQuery with pipeline execution metadata.
 */
export interface WorkspaceHelperNodeInput extends WorkspaceHelperQuery {
  /** Pipeline node identifier. */
  nodeId: string;
  /** Pipeline identifier this node belongs to. */
  pipelineId: string;
  /** Stage identifier within the pipeline. */
  stageId?: string;
}

/**
 * Output shape for a "workspace-helper" pipeline node.
 */
export interface WorkspaceHelperNodeOutput {
  ok: boolean;
  proposals: WorkspaceHelperProposal[];
  warnings: string[];
  receipts: WorkspaceHelperReceipt;
  pipelineMetadata: {
    nodeId: string;
    pipelineId: string;
    stageId?: string;
    ranAt: string;
  };
  error?: string;
}

/**
 * Capability manifest fragment for the workspace-helper node.
 * Compatible with CapabilityManifestEnvelope.capabilities[].
 */
export interface WorkspaceHelperCapabilityManifest {
  id: "workspace-helper";
  version: 1;
  intents: WorkspaceHelperIntent[];
  modes: Array<"propose">;
  proposalTypes: WorkspaceProposalType[];
  patchFields: Array<"dashboards" | "widgetTypes" | "canvas" | "dataModel">;
  localAdapters: Array<"local-intelligence">;
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isWorkspaceHelperResponse(value: unknown): value is WorkspaceHelperResponse {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["ok"] === "boolean" &&
    typeof v["summary"] === "string" &&
    Array.isArray(v["proposals"]) &&
    Array.isArray(v["warnings"]) &&
    v["receipts"] !== null &&
    typeof v["receipts"] === "object"
  );
}

export function isWorkspaceProposal(value: unknown): value is WorkspaceHelperProposal {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["type"] === "string" &&
    typeof v["payload"] === "object" &&
    v["payload"] !== null &&
    typeof v["rationale"] === "string" &&
    typeof v["affectedField"] === "string"
  );
}

// ---------------------------------------------------------------------------
// Version sentinel
// ---------------------------------------------------------------------------

export const WORKSPACE_HELPER_CONTRACT_VERSION = 1 as const;
