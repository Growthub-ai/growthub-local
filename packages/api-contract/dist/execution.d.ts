/**
 * @growthub/api-contract — Execution (CMS SDK v1)
 *
 * Frozen public surface for the hosted execution bridge.
 *
 * These types mirror the already-shipped growthub-local hosted execution
 * client contract in `cli/src/runtime/hosted-execution-client/types.ts`.
 * They are the *public, stable* version of that contract.
 *
 * Rules:
 *   - Execution payloads are transport-neutral.
 *   - Provider readiness is NOT part of execution results — see
 *     `./providers.ts` for the provider assembly contract.
 *   - Streaming events are NOT part of these payloads — see
 *     `./events.ts` for the canonical event union.
 */
export type ExecutionMode = "local" | "hosted" | "hybrid";
/**
 * A single node payload inside a workflow execution request.
 *
 * Frozen from `HostedExecuteNodePayload`.
 */
export interface ExecuteNodePayload {
    /** Unique node instance id within the pipeline. */
    nodeId: string;
    /** CMS capability slug identifying the primitive. */
    slug: string;
    /** Resolved bindings for this node (provider keys, connection refs, etc.). */
    bindings: Record<string, unknown>;
    /** Upstream node ids whose outputs feed into this node. */
    upstreamNodeIds?: string[];
}
/**
 * Frozen from `HostedExecuteWorkflowInput`.
 */
export interface ExecuteWorkflowInput {
    /** Pipeline id from the dynamic registry pipeline builder. */
    pipelineId: string;
    /** Optional persisted hosted workflow id (for workflow_runs/chat_messages linkage). */
    workflowId?: string;
    /** Thread / conversation id to scope execution artifacts. */
    threadId?: string;
    /** User-facing prompt to persist alongside the workflow run. */
    userPrompt?: string;
    /** Ordered node execution payloads. */
    nodes: ExecuteNodePayload[];
    /** Execution mode hint for the runtime. */
    executionMode: ExecutionMode;
    /** Opaque caller metadata forwarded to the runtime. */
    metadata?: Record<string, unknown>;
}
export type WorkflowExecutionStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type NodeExecutionStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";
/**
 * Per-node result. Frozen from `HostedNodeResult`.
 */
export interface NodeResult {
    nodeId: string;
    slug: string;
    status: NodeExecutionStatus;
    output?: Record<string, unknown>;
    error?: string;
}
/**
 * Execution-produced artifact pointer. Frozen from `HostedExecutionArtifactRef`.
 */
export interface ExecutionArtifactRef {
    artifactId: string;
    artifactType: string;
    nodeId: string;
    url?: string;
    storagePath?: string;
    metadata?: Record<string, unknown>;
}
/**
 * Condensed summary for CLI / UI consumers.
 *
 * Intentionally a loose shape — surfaces may ignore fields they do not
 * know how to render.
 */
export interface WorkflowExecutionSummary {
    outputText?: string;
    imageCount?: number;
    slideCount?: number;
    videoCount?: number;
    workflowRunId?: string;
    keyboardShortcutHint?: string;
}
/**
 * Frozen from `HostedExecuteWorkflowResult`.
 */
export interface ExecuteWorkflowResult {
    /** Server-assigned execution id. */
    executionId: string;
    /** Hosted thread id used for the run. */
    threadId?: string;
    /** Overall execution status. */
    status: WorkflowExecutionStatus;
    /** Per-node results keyed by nodeId. */
    nodeResults: Record<string, NodeResult>;
    /** Artifacts produced by the execution. */
    artifacts: ExecutionArtifactRef[];
    /** ISO timestamp when execution started. */
    startedAt?: string;
    /** ISO timestamp when execution completed. */
    completedAt?: string;
    /**
     * Raw execution log returned by the streamed workflow endpoint.
     *
     * Consumers that want a typed event stream should subscribe to the
     * streaming contract in `./events.ts` instead of parsing this log.
     */
    executionLog?: Array<Record<string, unknown>>;
    /** Condensed summary metadata. */
    summary?: WorkflowExecutionSummary;
}
//# sourceMappingURL=execution.d.ts.map