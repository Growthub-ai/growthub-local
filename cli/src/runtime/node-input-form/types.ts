/**
 * Node Input Form — Type Definitions
 *
 * A `NodeInputPromptSpec` is the distilled "how do I ask the operator for
 * this field?" decision made by the form. The form inspects a
 * `NodeContractSummary` and returns one spec per input field, then drives
 * the clack prompt loop with a uniform code path.
 *
 * Output bindings come back as a plain object so they're drop-in for
 * `HostedExecuteNodePayload.bindings`. Every local file is additionally
 * surfaced as a `NodeInputAttachment` so executors can upload it ahead of
 * pipeline dispatch if they need to.
 */

import type { LocalFileInfo, MediaCategory } from "./mime.js";

export type NodeInputPromptKind =
  | "text"          // single-line string
  | "long-text"     // multi-line prompt (stays as text prompt in clack v0.10)
  | "number"
  | "boolean"
  | "select"
  | "file"          // local file path, mime-detected
  | "url-or-file"   // accept http(s)/gs/s3 URL or a local path
  | "json"          // raw JSON value
  | "array";        // comma-separated list collected as string[]

export interface NodeInputPromptSpec {
  key: string;
  label: string;
  kind: NodeInputPromptKind;
  required: boolean;
  description?: string;
  placeholder?: string;
  defaultValue?: unknown;
  /** For "file" / "url-or-file": categories the field accepts. */
  acceptedCategories?: MediaCategory[];
  /** For "select": the choice set. */
  options?: Array<{ value: string; label: string; hint?: string }>;
}

export interface NodeInputAttachment {
  key: string;
  file: LocalFileInfo;
}

export interface NodeInputFormResult {
  bindings: Record<string, unknown>;
  attachments: NodeInputAttachment[];
  specs: NodeInputPromptSpec[];
  cancelled: boolean;
}

export interface NodeInputFormOptions {
  /** Pre-seed values by key; the form will offer them as defaults. */
  seed?: Record<string, unknown>;
  /**
   * Restrict the form to these keys only. If omitted, prompts for every
   * field in the node's input template plus its requiredBindings.
   */
  onlyKeys?: string[];
  /** When true, do not render the header summary card. */
  silent?: boolean;
}
