/**
 * Node Input Form — Schema-Driven Interactive Configuration
 *
 * Given a `CmsCapabilityNode`, prompt the operator for every field in
 * `executionTokens.input_template` plus every `requiredBinding` with
 * type-appropriate clack prompts. Returns bindings ready for
 * `HostedExecuteNodePayload.bindings` plus the list of local files
 * (MP4, PNG, audio, PDFs, etc.) that were picked, so executors can
 * upload them ahead of pipeline dispatch.
 *
 * This is the rich interface chat + pipeline surfaces use when the
 * operator says "configure this node". The primitive is shared —
 * nothing is specific to the chat command.
 */

import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import type { CmsCapabilityNode } from "@growthub/api-contract/capabilities";
import { introspectNodeContract } from "../cms-node-contracts/index.js";
import type { NodeContractSummary, NodeInputFieldContract } from "../cms-node-contracts/types.js";
import {
  describeLocalFile,
  humanSize,
  type LocalFileInfo,
  type MediaCategory,
} from "./mime.js";
import type {
  NodeInputAttachment,
  NodeInputFormOptions,
  NodeInputFormResult,
  NodeInputPromptKind,
  NodeInputPromptSpec,
} from "./types.js";

export type {
  NodeInputAttachment,
  NodeInputFormOptions,
  NodeInputFormResult,
  NodeInputPromptKind,
  NodeInputPromptSpec,
} from "./types.js";

export {
  describeLocalFile,
  humanSize,
  mimeFromPath,
  categorizeMime,
  MIME_TABLE,
  MEDIA_CATEGORIES,
  type LocalFileInfo,
  type MediaCategory,
} from "./mime.js";

// ---------------------------------------------------------------------------
// Heuristic — infer the prompt kind from an input field + required binding key
// ---------------------------------------------------------------------------

const MEDIA_KEY_HINTS: Array<{ keys: RegExp; categories: MediaCategory[] }> = [
  { keys: /video|clip|reel|footage|cinemagraph/i,                 categories: ["video"] },
  { keys: /image|photo|picture|thumbnail|cover|logo|poster/i,     categories: ["image"] },
  { keys: /audio|voice|music|sound|track/i,                        categories: ["audio"] },
  { keys: /document|pdf|report|article|doc(?:ument)?$/i,          categories: ["document"] },
  { keys: /attachment|asset|media|file|upload/i,                   categories: ["image", "video", "audio", "document", "archive"] },
];

const URL_KEY_HINTS = /url$|link$|href$|source(?:Url)?$/i;
const JSON_KEY_HINTS = /payload|metadata|extra|params$/i;
const ARRAY_KEY_HINTS = /list$|tags$|urls$|captions$|ids$/i;
const LONG_TEXT_KEY_HINTS = /prompt$|description$|copy$|script$|notes?$|message$|instruction(s)?$|brief$/i;

function inferPromptKind(field: NodeInputFieldContract): NodeInputPromptSpec {
  const key = field.key;
  const humanLabel = field.label;

  // File fields — always win over generic string when a media hint matches.
  for (const rule of MEDIA_KEY_HINTS) {
    if (rule.keys.test(key)) {
      return {
        key,
        label: humanLabel,
        kind: "url-or-file",
        required: field.required,
        acceptedCategories: rule.categories,
        placeholder: hintForCategories(rule.categories),
        defaultValue: typeof field.defaultValue === "string" ? field.defaultValue : undefined,
      };
    }
  }

  if (URL_KEY_HINTS.test(key)) {
    return {
      key,
      label: humanLabel,
      kind: "url-or-file",
      required: field.required,
      placeholder: "https://… or /path/to/file",
      defaultValue: typeof field.defaultValue === "string" ? field.defaultValue : undefined,
    };
  }

  if (field.type === "boolean") {
    return {
      key,
      label: humanLabel,
      kind: "boolean",
      required: field.required,
      defaultValue: field.defaultValue,
    };
  }

  if (field.type === "number") {
    return {
      key,
      label: humanLabel,
      kind: "number",
      required: field.required,
      defaultValue: field.defaultValue,
      placeholder: typeof field.defaultValue === "number" ? String(field.defaultValue) : undefined,
    };
  }

  if (field.type === "array" || ARRAY_KEY_HINTS.test(key)) {
    return {
      key,
      label: humanLabel,
      kind: "array",
      required: field.required,
      defaultValue: field.defaultValue,
      placeholder: "comma,separated,values",
    };
  }

  if (field.type === "object" || JSON_KEY_HINTS.test(key)) {
    return {
      key,
      label: humanLabel,
      kind: "json",
      required: field.required,
      defaultValue: field.defaultValue,
      placeholder: `{}`,
    };
  }

  if (LONG_TEXT_KEY_HINTS.test(key)) {
    return {
      key,
      label: humanLabel,
      kind: "long-text",
      required: field.required,
      defaultValue: field.defaultValue,
      placeholder: "Type the long-form value",
    };
  }

  return {
    key,
    label: humanLabel,
    kind: "text",
    required: field.required,
    defaultValue: field.defaultValue,
    placeholder: typeof field.defaultValue === "string" && field.defaultValue.length > 0
      ? String(field.defaultValue)
      : undefined,
  };
}

function hintForCategories(categories: MediaCategory[]): string {
  const labels = categories.map((c) =>
    c === "image" ? "PNG/JPG/WEBP/SVG"
    : c === "video" ? "MP4/MOV/WEBM"
    : c === "audio" ? "MP3/WAV/OGG"
    : c === "document" ? "PDF/TXT/MD"
    : c === "archive" ? "ZIP/TAR/GZ"
    : "any",
  );
  return `https://… or local path (${labels.join(" / ")})`;
}

// ---------------------------------------------------------------------------
// Build specs from the node contract
// ---------------------------------------------------------------------------

export function buildInputPromptSpecs(
  node: CmsCapabilityNode,
  opts?: { onlyKeys?: string[] },
): NodeInputPromptSpec[] {
  const contract = introspectNodeContract(node);
  const seen = new Set<string>();
  const specs: NodeInputPromptSpec[] = [];

  for (const field of contract.inputs) {
    if (opts?.onlyKeys && !opts.onlyKeys.includes(field.key)) continue;
    seen.add(field.key);
    specs.push(inferPromptKind(field));
  }

  // Required bindings that weren't already present in the template — treat
  // as short-text inputs (often credentials or connection ids). We mark
  // required=true so the form won't let the operator skip them silently.
  for (const bindingKey of contract.requiredBindings) {
    if (seen.has(bindingKey)) continue;
    if (opts?.onlyKeys && !opts.onlyKeys.includes(bindingKey)) continue;
    seen.add(bindingKey);
    specs.push({
      key: bindingKey,
      label: humanizeKey(bindingKey),
      kind: URL_KEY_HINTS.test(bindingKey) ? "url-or-file" : "text",
      required: true,
      description: "Required binding",
    });
  }

  return specs;
}

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_.\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Individual field prompts
// ---------------------------------------------------------------------------

async function promptText(spec: NodeInputPromptSpec, seed?: unknown): Promise<string | symbol> {
  const initial = typeof seed === "string" ? seed : typeof spec.defaultValue === "string" ? spec.defaultValue : undefined;
  return p.text({
    message: fieldPromptMessage(spec),
    placeholder: spec.placeholder,
    initialValue: initial,
    validate: (value) => {
      if (spec.required && (!value || !value.trim())) return "Required";
      return undefined;
    },
  });
}

async function promptNumber(spec: NodeInputPromptSpec, seed?: unknown): Promise<number | symbol | null> {
  const initial = typeof seed === "number" ? String(seed) : typeof spec.defaultValue === "number" ? String(spec.defaultValue) : undefined;
  const raw = await p.text({
    message: fieldPromptMessage(spec),
    placeholder: spec.placeholder,
    initialValue: initial,
    validate: (value) => {
      if (!value || !value.trim()) {
        return spec.required ? "Required" : undefined;
      }
      if (!Number.isFinite(Number(value))) return "Not a number";
      return undefined;
    },
  });
  if (p.isCancel(raw)) return raw;
  const str = (raw as string).trim();
  if (!str) return null;
  return Number(str);
}

async function promptBoolean(spec: NodeInputPromptSpec, seed?: unknown): Promise<boolean | symbol> {
  const initial = typeof seed === "boolean" ? seed : typeof spec.defaultValue === "boolean" ? spec.defaultValue : false;
  return p.confirm({
    message: fieldPromptMessage(spec),
    initialValue: initial,
  });
}

async function promptJson(spec: NodeInputPromptSpec, seed?: unknown): Promise<unknown | symbol> {
  const initial = seed !== undefined
    ? JSON.stringify(seed)
    : spec.defaultValue !== undefined
      ? JSON.stringify(spec.defaultValue)
      : undefined;
  const raw = await p.text({
    message: fieldPromptMessage(spec) + pc.dim(" (JSON)"),
    placeholder: spec.placeholder ?? "{}",
    initialValue: initial,
    validate: (value) => {
      if (!value || !value.trim()) {
        return spec.required ? "Required" : undefined;
      }
      try {
        JSON.parse(value);
        return undefined;
      } catch {
        return "Invalid JSON";
      }
    },
  });
  if (p.isCancel(raw)) return raw;
  const str = (raw as string).trim();
  if (!str) return null;
  return JSON.parse(str);
}

async function promptArray(spec: NodeInputPromptSpec, seed?: unknown): Promise<string[] | symbol | null> {
  const initial = Array.isArray(seed)
    ? seed.map((s) => String(s)).join(", ")
    : Array.isArray(spec.defaultValue)
      ? (spec.defaultValue as unknown[]).map((s) => String(s)).join(", ")
      : undefined;
  const raw = await p.text({
    message: fieldPromptMessage(spec) + pc.dim(" (comma-separated)"),
    placeholder: spec.placeholder,
    initialValue: initial,
  });
  if (p.isCancel(raw)) return raw;
  const str = (raw as string).trim();
  if (!str) return spec.required ? null : [];
  return str.split(",").map((s) => s.trim()).filter(Boolean);
}

function isRemoteUrl(value: string): boolean {
  return /^(https?|gs|s3|ipfs|data):/i.test(value.trim());
}

async function promptUrlOrFile(
  spec: NodeInputPromptSpec,
  seed?: unknown,
): Promise<
  | { kind: "remote"; url: string }
  | { kind: "local"; file: LocalFileInfo }
  | { kind: "none" }
  | symbol
> {
  const initial = typeof seed === "string" ? seed : typeof spec.defaultValue === "string" ? spec.defaultValue : undefined;
  const raw = await p.text({
    message: fieldPromptMessage(spec),
    placeholder: spec.placeholder ?? "https://… or /path/to/file",
    initialValue: initial,
    validate: (value) => {
      if (!value || !value.trim()) {
        return spec.required ? "Required" : undefined;
      }
      const trimmed = value.trim();
      if (isRemoteUrl(trimmed)) return undefined;
      const info = describeLocalFile(trimmed);
      if (!info.exists) return `File not found at ${info.absolutePath}`;
      if (!info.isFile)  return `Path is not a file: ${info.absolutePath}`;
      if (!info.readable) return `File not readable: ${info.absolutePath}`;
      if (spec.acceptedCategories && !spec.acceptedCategories.includes(info.category) && info.category !== "binary") {
        return `Expected ${spec.acceptedCategories.join("/")} (got ${info.category} · ${info.mime})`;
      }
      return undefined;
    },
  });

  if (p.isCancel(raw)) return raw;
  const str = (raw as string).trim();
  if (!str) return { kind: "none" };
  if (isRemoteUrl(str)) return { kind: "remote", url: str };
  return { kind: "local", file: describeLocalFile(str) };
}

function fieldPromptMessage(spec: NodeInputPromptSpec): string {
  const requiredTag = spec.required ? pc.red("*") : pc.dim("?");
  const typeTag = pc.dim(`(${spec.kind})`);
  return `${requiredTag} ${pc.bold(spec.label)} ${typeTag}`;
}

// ---------------------------------------------------------------------------
// Main form
// ---------------------------------------------------------------------------

function renderHeader(node: CmsCapabilityNode, contract: NodeContractSummary): void {
  const inputCount = contract.inputs.length;
  const bindingCount = contract.requiredBindings.length;
  console.log("");
  console.log(`${pc.bold(node.icon ? node.icon + " " : "")}${pc.bold(node.displayName)}  ${pc.dim(node.slug)}`);
  console.log(pc.dim(`  ${node.family} · ${node.executionKind} · ${inputCount} inputs · ${bindingCount} required bindings`));
  if (node.description) console.log(pc.dim(`  ${node.description}`));
  console.log("");
}

export async function promptNodeInputs(
  node: CmsCapabilityNode,
  options: NodeInputFormOptions = {},
): Promise<NodeInputFormResult> {
  const contract = introspectNodeContract(node);
  const specs = buildInputPromptSpecs(node, { onlyKeys: options.onlyKeys });

  if (!options.silent) renderHeader(node, contract);

  const bindings: Record<string, unknown> = { ...(options.seed ?? {}) };
  const attachments: NodeInputAttachment[] = [];

  for (const spec of specs) {
    const seed = options.seed?.[spec.key];
    switch (spec.kind) {
      case "text":
      case "long-text": {
        const value = await promptText(spec, seed);
        if (p.isCancel(value)) return { bindings, attachments, specs, cancelled: true };
        const str = String(value).trim();
        if (str) bindings[spec.key] = str;
        break;
      }
      case "number": {
        const value = await promptNumber(spec, seed);
        if (p.isCancel(value)) return { bindings, attachments, specs, cancelled: true };
        if (value !== null && value !== undefined) bindings[spec.key] = value;
        break;
      }
      case "boolean": {
        const value = await promptBoolean(spec, seed);
        if (p.isCancel(value)) return { bindings, attachments, specs, cancelled: true };
        bindings[spec.key] = value;
        break;
      }
      case "json": {
        const value = await promptJson(spec, seed);
        if (p.isCancel(value)) return { bindings, attachments, specs, cancelled: true };
        if (value !== null) bindings[spec.key] = value;
        break;
      }
      case "array": {
        const value = await promptArray(spec, seed);
        if (p.isCancel(value)) return { bindings, attachments, specs, cancelled: true };
        if (value !== null) bindings[spec.key] = value;
        break;
      }
      case "file":
      case "url-or-file": {
        const result = await promptUrlOrFile(spec, seed);
        if (typeof result === "symbol") {
          return { bindings, attachments, specs, cancelled: true };
        }
        if (result.kind === "none") break;
        if (result.kind === "remote") {
          bindings[spec.key] = { kind: "url", url: result.url };
        } else {
          const file = result.file;
          const fileBinding = {
            kind: "file",
            path: file.absolutePath,
            mime: file.mime,
            category: file.category,
            sizeBytes: file.sizeBytes,
          };
          bindings[spec.key] = fileBinding;
          attachments.push({ key: spec.key, file });
          if (!options.silent) {
            console.log(pc.dim(`  attached ${file.category} · ${file.mime} · ${humanSize(file.sizeBytes)} · ${file.absolutePath}`));
          }
        }
        break;
      }
      case "select": {
        const value = await p.select({
          message: fieldPromptMessage(spec),
          options: spec.options ?? [],
        });
        if (p.isCancel(value)) return { bindings, attachments, specs, cancelled: true };
        bindings[spec.key] = value;
        break;
      }
    }
  }

  return { bindings, attachments, specs, cancelled: false };
}

/** Render a compact summary of a completed form. */
export function renderInputFormSummary(result: NodeInputFormResult): string {
  if (result.cancelled) return pc.yellow("  (form cancelled)");
  const lines: string[] = [pc.bold("Bindings")];
  for (const spec of result.specs) {
    const value = result.bindings[spec.key];
    const rendered = value === undefined
      ? pc.dim("(skipped)")
      : renderBindingValue(value);
    lines.push(`  ${spec.key}: ${rendered}`);
  }
  if (result.attachments.length > 0) {
    lines.push("", pc.bold("Attachments"));
    for (const att of result.attachments) {
      lines.push(`  ${att.key} → ${att.file.mime} · ${humanSize(att.file.sizeBytes)} · ${att.file.absolutePath}`);
    }
  }
  return lines.join("\n");
}

function renderBindingValue(value: unknown): string {
  if (value === null) return pc.dim("null");
  if (typeof value === "string") return value.length > 80 ? value.slice(0, 77) + "…" : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(renderBindingValue).join(", ")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (obj.kind === "file" && typeof obj.path === "string") {
      return `${pc.magenta("file")} ${obj.path}`;
    }
    if (obj.kind === "url" && typeof obj.url === "string") {
      return `${pc.cyan("url")} ${obj.url}`;
    }
    return JSON.stringify(value);
  }
  return String(value);
}

/** Read and base64-encode a local file for environments that need inline bytes. */
export function readFileBase64(filePath: string): string {
  return fs.readFileSync(path.resolve(filePath)).toString("base64");
}
