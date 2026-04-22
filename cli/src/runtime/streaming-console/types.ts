/**
 * Streaming Console — Type Definitions
 *
 * One shared primitive for any CLI surface that renders live events from:
 *   - hosted workflow execution (NDJSON events)
 *   - native-intelligence token streaming
 *   - harness chat replies
 *
 * Every event is written to a session transcript JSONL file so the full
 * interaction can be replayed, audited, or analyzed later.
 */

import type {
  ExecuteWorkflowStreamEvent,
  HostedExecutionArtifactRef,
} from "@growthub/api-contract/execute";

export type StreamingConsoleRole = "user" | "assistant" | "system";

export interface StreamingConsoleUserMessage {
  kind: "user_message";
  at: string;
  text: string;
}

export interface StreamingConsoleAssistantChunk {
  kind: "assistant_chunk";
  at: string;
  text: string;
  /** True when this chunk closes the assistant turn. */
  final?: boolean;
}

export interface StreamingConsoleAssistantMessage {
  kind: "assistant_message";
  at: string;
  text: string;
  modelId?: string;
  latencyMs?: number;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface StreamingConsoleSystemMessage {
  kind: "system_message";
  at: string;
  text: string;
}

export interface StreamingConsoleWorkflowEvent {
  kind: "workflow_event";
  at: string;
  event: ExecuteWorkflowStreamEvent;
}

export interface StreamingConsoleArtifactEvent {
  kind: "artifact";
  at: string;
  artifact: HostedExecutionArtifactRef;
}

export interface StreamingConsoleErrorEvent {
  kind: "error";
  at: string;
  message: string;
  cause?: string;
}

export type StreamingConsoleRecord =
  | StreamingConsoleUserMessage
  | StreamingConsoleAssistantChunk
  | StreamingConsoleAssistantMessage
  | StreamingConsoleSystemMessage
  | StreamingConsoleWorkflowEvent
  | StreamingConsoleArtifactEvent
  | StreamingConsoleErrorEvent;

export interface StreamingConsoleOptions {
  /** Session id; defaults to a random uuid. */
  sessionId?: string;
  /** Fork path to write the transcript under; defaults to cwd. */
  forkPath?: string;
  /** If false, no transcript file is written. */
  persist?: boolean;
  /** If true, suppress all stdout rendering (headless mode for agents). */
  silent?: boolean;
}

export interface StreamingConsoleHandle {
  readonly sessionId: string;
  readonly transcriptPath: string | null;
  writeUser(text: string): void;
  writeSystem(text: string): void;
  writeAssistantChunk(text: string, opts?: { final?: boolean }): void;
  writeAssistantMessage(message: Omit<StreamingConsoleAssistantMessage, "kind" | "at">): void;
  writeWorkflowEvent(event: ExecuteWorkflowStreamEvent): void;
  writeArtifact(artifact: HostedExecutionArtifactRef): void;
  writeError(message: string, cause?: string): void;
  /** Read the transcript as JSONL records (empty when persistence is off). */
  readRecords(): StreamingConsoleRecord[];
  /** Close the transcript file descriptor. */
  close(): void;
}
