/**
 * CMS SDK v1 — Schema-driven node input/output contracts.
 *
 * Makes the hidden input/output metadata currently carried inside CMS
 * `executionTokens.input_template` / `output_mapping` explicit and
 * machine-readable, so CLI, hosted surfaces, and third-party builders can
 * render or validate against the same shape.
 */

export type NodeFieldType =
  | "text"
  | "long_text"
  | "number"
  | "boolean"
  | "select"
  | "array"
  | "json"
  | "url"
  | "file"
  | "url_or_file";

export interface NodeFieldBase {
  key: string;
  label: string;
  required: boolean;
  description?: string;
  uiHint?: string;
  providerNeutralIntent?: string;
  executionModeHints?: string[];
}

export interface TextField extends NodeFieldBase {
  fieldType: "text";
  defaultValue?: string;
  maxLength?: number;
}

export interface LongTextField extends NodeFieldBase {
  fieldType: "long_text";
  defaultValue?: string;
  maxLength?: number;
}

export interface NumberField extends NodeFieldBase {
  fieldType: "number";
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
}

export interface BooleanField extends NodeFieldBase {
  fieldType: "boolean";
  defaultValue?: boolean;
}

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

export interface SelectField extends NodeFieldBase {
  fieldType: "select";
  options: SelectOption[];
  defaultValue?: string;
  allowMultiple?: boolean;
}

export interface ArrayField extends NodeFieldBase {
  fieldType: "array";
  itemType: NodeFieldType;
  defaultValue?: unknown[];
  minItems?: number;
  maxItems?: number;
}

export interface JsonField extends NodeFieldBase {
  fieldType: "json";
  defaultValue?: Record<string, unknown>;
  schemaRef?: string;
}

export interface UrlField extends NodeFieldBase {
  fieldType: "url";
  defaultValue?: string;
  acceptedMediaTypes?: string[];
}

export interface FileField extends NodeFieldBase {
  fieldType: "file";
  acceptedMediaTypes?: string[];
}

export interface UrlOrFileField extends NodeFieldBase {
  fieldType: "url_or_file";
  acceptedMediaTypes?: string[];
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

export interface NodeInputSchema {
  fields: NodeInputField[];
}

export interface NodeOutputField {
  key: string;
  label?: string;
  fieldType: NodeFieldType;
  required: boolean;
  description?: string;
  mediaType?: string;
}

export interface NodeOutputSchema {
  outputs: NodeOutputField[];
}
