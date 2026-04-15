/**
 * Open Agents — Contract Types
 *
 * Stable types that define the boundary between the Growthub CLI and
 * an Open Agents backend (Vercel-style durable agent workflow runtime).
 *
 * Open Agents provides:
 *   - Durable multi-step agent workflow execution
 *   - Isolated sandbox environments (filesystem, network, shell, git)
 *   - GitHub integration (clone, branch, commit, PR)
 *   - Agent tools: file, search, shell, task delegation, skills
 *
 * Guardrails:
 *   - Local runtime remains canonical — this is a harness, not a replacement
 *   - CMS nodes and kit primitives remain the execution substrate
 *   - Open Agents adds durable orchestration and sandbox isolation
 *   - Config is persisted to ~/.paperclip/open-agents/config.json
 */

// ---------------------------------------------------------------------------
// Backend type
// ---------------------------------------------------------------------------

export type OpenAgentsBackendType = "local" | "hosted";

// ---------------------------------------------------------------------------
// Sandbox state
// ---------------------------------------------------------------------------

export type SandboxState =
  | "creating"
  | "running"
  | "hibernating"
  | "snapshotting"
  | "stopped"
  | "error";

// ---------------------------------------------------------------------------
// Agent session state
// ---------------------------------------------------------------------------

export type AgentSessionStatus =
  | "idle"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled";

// ---------------------------------------------------------------------------
// Agent run event types (streamed from backend)
// ---------------------------------------------------------------------------

export type AgentRunEventType =
  | "sandbox_create"
  | "sandbox_resume"
  | "sandbox_hibernate"
  | "tool_start"
  | "tool_result"
  | "file_edit"
  | "file_create"
  | "shell_exec"
  | "search"
  | "git_commit"
  | "git_push"
  | "git_pr"
  | "agent_message"
  | "agent_thinking"
  | "task_delegate"
  | "workflow_step"
  | "error";

// ---------------------------------------------------------------------------
// Agent run event
// ---------------------------------------------------------------------------

export interface AgentRunEvent {
  type: AgentRunEventType;
  timestamp: string;
  detail: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Session summary
// ---------------------------------------------------------------------------

export interface OpenAgentsSessionSummary {
  sessionId: string;
  status: AgentSessionStatus;
  repoUrl?: string;
  branch?: string;
  prompt?: string;
  createdAt: string;
  updatedAt?: string;
  eventCount: number;
  sandboxState: SandboxState;
}

// ---------------------------------------------------------------------------
// Health check result
// ---------------------------------------------------------------------------

export interface OpenAgentsHealthResult {
  available: boolean;
  latencyMs: number;
  version?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface OpenAgentsConfig {
  backendType: OpenAgentsBackendType;
  endpoint: string;
  apiKey?: string;
  defaultRepo?: string;
  defaultBranch?: string;
  sandboxTimeoutMs?: number;
  timeoutMs?: number;
}

export const DEFAULT_OPEN_AGENTS_CONFIG: OpenAgentsConfig = {
  backendType: "local",
  endpoint: "http://localhost:3000",
  sandboxTimeoutMs: 300_000,
  timeoutMs: 30_000,
};
