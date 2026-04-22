/**
 * CMS SDK v1 — Execution event stream contract.
 *
 * One streaming event model usable by terminals, browsers, chat consoles,
 * and background agents. Parsers/renderers can discriminate on `type` with
 * no CLI-internal knowledge.
 */

export interface NodeStartEvent {
  type: "node_start";
  nodeId: string;
  slug: string;
  at: string;
}

export interface NodeCompleteEvent {
  type: "node_complete";
  nodeId: string;
  slug: string;
  output?: unknown;
  at: string;
}

export interface NodeErrorEvent {
  type: "node_error";
  nodeId: string;
  slug: string;
  error: string;
  at: string;
}

export interface CreditWarningEvent {
  type: "credit_warning";
  availableCredits?: number;
  message?: string;
  at: string;
}

export interface ProgressEvent {
  type: "progress";
  stage: string;
  message?: string;
  at: string;
}

export interface CompleteEvent {
  type: "complete";
  executionId: string;
  summary?: unknown;
  at: string;
}

export interface ErrorEvent {
  type: "error";
  message: string;
  at: string;
}

export type ExecutionEvent =
  | NodeStartEvent
  | NodeCompleteEvent
  | NodeErrorEvent
  | CreditWarningEvent
  | ProgressEvent
  | CompleteEvent
  | ErrorEvent;

export type ExecutionEventType = ExecutionEvent["type"];
