/**
 * @growthub/api-contract — Agent Outcome Loop V1 (CMS SDK v1)
 *
 * The positive-governance layer above the workspace mutation boundary
 * (`./workspace-patch`). The mutation firewall answers "can this change
 * happen?"; this contract answers "what outcome did the agent produce,
 * what proves it, and how does the next agent continue from it?".
 *
 * Every mutation lane in the workspace runtime emits the same canonical
 * receipt into the existing source-record sidecar
 * (`growthub.source-records.json`) under the stable source id
 * `workspace:agent-outcomes` — no new persistence backend:
 *
 *   - `PATCH /api/workspace`                  → kind "direct-patch"
 *   - `POST /api/workspace/patch/preflight`   → kind "patch-preflight" (blocked only)
 *   - `POST /api/workspace/sandbox-run`       → kind "sandbox-run"
 *   - `POST /api/workspace/workflow/publish`  → kind "workflow-publish"
 *   - `POST /api/workspace/helper/apply`      → kind "helper-apply"
 *
 * Read side: `GET /api/workspace/agent-outcomes` returns the receipt
 * stream plus the derived governance summary (the cockpit data model).
 *
 * Type-only plus frozen vocabulary constants. Runtime truth lives in the
 * workspace app (`lib/workspace-outcome-receipts.js`).
 */

// ---------------------------------------------------------------------------
// Receipt vocabulary
// ---------------------------------------------------------------------------

/** Which mutation/proof lane produced the receipt. Additive union. */
export const AGENT_OUTCOME_RECEIPT_KINDS = [
  "patch-preflight",
  "direct-patch",
  "helper-apply",
  "sandbox-run",
  "workflow-publish",
  "agent-outcome",
] as const;

export type AgentOutcomeReceiptKind =
  (typeof AGENT_OUTCOME_RECEIPT_KINDS)[number];

/** Where the receipt sits in the outcome lifecycle. Additive union. */
export const AGENT_OUTCOME_STATUSES = [
  "blocked",
  "drafted",
  "tested",
  "published",
  "failed",
  "verified",
] as const;

export type AgentOutcomeStatus = (typeof AGENT_OUTCOME_STATUSES)[number];

/** Lane trust classification — every lane is named, none is an unlabelled bypass. */
export type AgentOutcomeLane =
  | "untrusted-direct" // PATCH /api/workspace — full policy firewall
  | "governed-proposal" // helper/apply — human-reviewed, server-built payloads
  | "execution-proof" // sandbox-run — produces run lineage
  | "server-authoritative"; // workflow/publish — owns draft → live

/** A workspace object/row a receipt touched. */
export interface AgentOutcomeObjectRef {
  objectId: string;
  /** Sandbox-row capital-N `Name` when row-scoped. */
  rowName?: string;
  objectType?: string;
}

// ---------------------------------------------------------------------------
// The canonical receipt
// ---------------------------------------------------------------------------

export interface AgentOutcomeReceipt {
  /** Stable unique id, e.g. `aor_<timestamp>_<random>`. */
  receiptId: string;
  kind: AgentOutcomeReceiptKind | (string & {});
  lane: AgentOutcomeLane | (string & {});
  /**
   * Plain-language statement of what the actor was trying to do. Supplied
   * by the caller (`intent` field on mutation requests) or derived by the
   * route when absent. Never includes secret values.
   */
  intent?: string;
  /** Who acted: "agent" | "operator" | "system" | a caller-supplied label. */
  actor?: string;
  /** Workspace objects/rows affected (or targeted, when blocked). */
  objectRefs?: AgentOutcomeObjectRef[];
  /** Allowlisted config fields the mutation changed (or attempted). */
  changedFields?: string[];
  /** Mutation-policy verdict (from `./workspace-patch` violations). */
  policyVerdict?: { ok: boolean; violationCodes?: string[] };
  /** Merged-config schema verdict. */
  schemaVerdict?: { ok: boolean; errorCount?: number };
  /** Sandbox run lineage. */
  runId?: string;
  /** Source-record id the proof lives under (e.g. `sandbox:<objectId>:<slug>`). */
  sourceId?: string;
  /** Canonical parsed-graph hash of a tested draft. */
  draftSha256?: string;
  /** Canonical parsed-graph hash of a published live graph. */
  publishedSha256?: string;
  /** Row version after a publish. */
  version?: string;
  outcomeStatus: AgentOutcomeStatus | (string & {});
  /** One-line, secret-redacted, bounded human summary. */
  summary: string;
  /** What an agent should do next (repair steps, follow-on calls). */
  nextActions?: string[];
  /**
   * Replay/rollback handle. For publishes: the previous version + delta
   * index so an operator can diff or restore; for runs: the sourceId.
   */
  rollbackRef?: {
    objectId?: string;
    rowName?: string;
    liveField?: string;
    previousVersion?: string;
    deltaIndex?: number;
    sourceId?: string;
  };
  /** App identity when the action ran under `x-growthub-app-scope`. */
  appId?: string;
  /** Server-side monotonic sequence (tamper-evidence). */
  seq?: number;
  /**
   * sha256(stableStringify(previous receipt)) — hash chain over the stream;
   * a mutated or removed receipt breaks every subsequent link. Null for the
   * first receipt. No signing key/TEE exists in this runtime; a signed
   * anchor is named future work.
   */
  prevReceiptSha256?: string | null;
  /** ISO timestamp. */
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Receipt stream + governance summary (cockpit data model)
// ---------------------------------------------------------------------------

/** Stable sidecar source id the receipt stream is stored under. */
export const AGENT_OUTCOMES_SOURCE_ID = "workspace:agent-outcomes" as const;

/** Derived, always-recomputable governance counters for the operator. */
export interface WorkspaceGovernanceSummary {
  /** Receipts with outcomeStatus "blocked" (policy/gate rejections). */
  blockedAttempts: number;
  /** Receipts with kind "workflow-publish" + status "published". */
  publishes: number;
  /** Sandbox rows with a populated draft and no passing test attestation. */
  draftsAwaitingTest: number;
  /** Sandbox rows tested (attested) but not yet published. */
  draftsTestedNotPublished: number;
  /** Live workflow rows whose last run failed. */
  liveRowsWithFailedLastRun: number;
  /** Live workflow rows with no recorded run at all. */
  liveRowsWithoutProof: number;
  /** Helper applies recorded in the stream. */
  helperApplies: number;
}

/** Response shape of `GET /api/workspace/agent-outcomes`. */
export interface AgentOutcomesResponse {
  ok: boolean;
  sourceId: typeof AGENT_OUTCOMES_SOURCE_ID;
  /** Newest-first, bounded (the sidecar keeps a rolling window). */
  receipts: AgentOutcomeReceipt[];
  summary: WorkspaceGovernanceSummary;
}

// ---------------------------------------------------------------------------
// The canonical agent loop (recipe — sequence logic agents must not invent)
// ---------------------------------------------------------------------------

/**
 * Agent Outcome Loop V1. Each step names the route that owns it. The SDK
 * stays type-only; this constant is the blessed sequence a client wrapper
 * or an agent follows verbatim instead of hand-rolling route order.
 */
export const WORKSPACE_AGENT_LOOP_V1 = [
  { step: "understand", call: "GET /api/workspace" },
  { step: "preflight", call: "POST /api/workspace/patch/preflight" },
  { step: "draft", call: "PATCH /api/workspace (allowlisted keys / draft fields only)" },
  { step: "prove", call: "POST /api/workspace/sandbox-run (useDraft:true for workflow drafts)" },
  { step: "publish", call: "POST /api/workspace/workflow/publish (workflow drafts) or the PATCH above (plain config)" },
  { step: "receipt", call: "GET /api/workspace/agent-outcomes (verify your receipt; cite receiptId)" },
] as const;

// ---------------------------------------------------------------------------
// Guards + version sentinel
// ---------------------------------------------------------------------------

export function isAgentOutcomeReceipt(value: unknown): value is AgentOutcomeReceipt {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { receiptId?: unknown }).receiptId === "string" &&
    typeof (value as { kind?: unknown }).kind === "string" &&
    typeof (value as { outcomeStatus?: unknown }).outcomeStatus === "string" &&
    typeof (value as { summary?: unknown }).summary === "string" &&
    typeof (value as { createdAt?: unknown }).createdAt === "string"
  );
}

/** Additive changes keep the literal `1`. */
export const WORKSPACE_OUTCOME_CONTRACT_VERSION = 1 as const;
