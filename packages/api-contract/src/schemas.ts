/**
 * @growthub/api-contract — Node input / output schemas (CMS SDK v1)
 *
 * Schema-driven node contract.
 *
 * This is the one machine-readable surface every Growthub consumer
 * (CLI, hosted UI, harnesses, local intelligence, third-party
 * adapters) is expected to render, validate, and reason over.
 *
 * Today the CLI derives forms from {@link CapabilityExecutionTokens}
 * `input_template` and `output_mapping`. This file freezes the richer,
 * explicit form of that contract so surfaces can share a single form
 * renderer and a single validator.
 *
 * Rules:
 *   - Additive only.
 *   - Every field union member MUST carry a `fieldType` discriminator.
 *   - No provider-specific fields. Provider routing is in `./providers.ts`.
 */

import type { ExecutionMode } from "./execution.js";

// ---------------------------------------------------------------------------
// Shared field metadata
// ---------------------------------------------------------------------------

/**
 * UI hint for a field renderer.
 *
 * Renderers SHOULD treat unknown hints as the default for the field's
 * {@link NodeInputField.fieldType}.
 */
export type NodeInputUiHint =
  | "default"
  | "textarea"
  | "rich-text"
  | "password"
  | "toggle"
  | "dropdown"
  | "multi-select"
  | "file-picker"
  | "url-or-file"
  | "json-editor";

/**
 * Provider-neutral intent describing what a field represents.
 *
 * This is what lets local intelligence reason about a field without
 * having to learn capability-specific vocabulary.
 */
export type NodeInputProviderNeutralIntent =
  | "prompt"
  | "negative-prompt"
  | "seed"
  | "count"
  | "aspect-ratio"
  | "duration"
  | "quality"
  | "style"
  | "model"
  | "reference-image"
  | "reference-video"
  | "reference-audio"
  | "document"
  | "connection"
  | "api-key"
  | "unspecified";

/**
 * Execution-mode hints a field can carry so surfaces can selectively
 * render / hide fields based on the current execution mode.
 */
export interface NodeInputExecutionModeHints {
  /** Modes in which this field is relevant. If omitted, the field applies to all modes. */
  relevantModes?: ExecutionMode[];
  /** Modes in which this field should be hidden. */
  hiddenInModes?: ExecutionMode[];
}

interface NodeInputFieldBase {
  key: string;
  label: string;
  required: boolean;
  description?: string;
  uiHint?: NodeInputUiHint;
  providerNeutralIntent?: NodeInputProviderNeutralIntent;
  acceptedMediaTypes?: string[];
  defaultValue?: unknown;
  executionModeHints?: NodeInputExecutionModeHints;
}

// ---------------------------------------------------------------------------
// Field union
// ---------------------------------------------------------------------------

export interface TextField extends NodeInputFieldBase {
  fieldType: "text";
  /** Maximum allowed length. */
  maxLength?: number;
}

export interface LongTextField extends NodeInputFieldBase {
  fieldType: "long-text";
  maxLength?: number;
}

export interface NumberField extends NodeInputFieldBase {
  fieldType: "number";
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
}

export interface BooleanField extends NodeInputFieldBase {
  fieldType: "boolean";
}

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

export interface SelectField extends NodeInputFieldBase {
  fieldType: "select";
  options: SelectOption[];
  multiple?: boolean;
}

export interface ArrayField extends NodeInputFieldBase {
  fieldType: "array";
  /** Shape of each item. `fieldType` of the item is required. */
  itemSchema?: NodeInputField;
  minItems?: number;
  maxItems?: number;
}

export interface JsonField extends NodeInputFieldBase {
  fieldType: "json";
}

export interface UrlField extends NodeInputFieldBase {
  fieldType: "url";
}

export interface FileField extends NodeInputFieldBase {
  fieldType: "file";
}

/**
 * Media-intent field that accepts either a remote URL or a local file path.
 *
 * Runtimes are expected to lift local paths into `NodeInputAttachment`
 * records at dispatch time.
 */
export interface UrlOrFileField extends NodeInputFieldBase {
  fieldType: "url-or-file";
}

export type NodeInputField =
  | TextField
  | LongTextField
  | NumberField
  | BooleanField
  | SelectField
  | ArrayField
  | JsonField
  | UrlField
  | FileField
  | UrlOrFileField;

// ---------------------------------------------------------------------------
// Output schema
// ---------------------------------------------------------------------------

export type NodeOutputFieldType =
  | "text"
  | "long-text"
  | "number"
  | "boolean"
  | "array"
  | "object"
  | "image"
  | "video"
  | "slides"
  | "audio"
  | "file"
  | "unknown";

export interface NodeOutputField {
  key: string;
  fieldType: NodeOutputFieldType;
  /** Whether the runtime guarantees this output is always present. */
  required: boolean;
  description?: string;
  acceptedMediaTypes?: string[];
}

// ---------------------------------------------------------------------------
// Container schemas
// ---------------------------------------------------------------------------

export interface NodeInputSchema {
  fields: NodeInputField[];
}

export interface NodeOutputSchema {
  outputs: NodeOutputField[];
}

// ---------------------------------------------------------------------------
// Attachment
// ---------------------------------------------------------------------------

/**
 * Resolved attachment payload produced when a {@link UrlOrFileField}
 * resolves to a local file.
 *
 * Runtimes SHOULD upload these before dispatching execution, then
 * swap the binding value to the resulting URL.
 */
export interface NodeInputAttachment {
  /** Logical kind of attachment. */
  kind: "file";
  /** Absolute path on the authoring machine. */
  absolutePath: string;
  /** MIME type resolved from the file extension. */
  mediaType?: string;
  /** File size in bytes, when known. */
  sizeBytes?: number;
}
