/**
 * CMS Capability Registry — Structural Validation
 *
 * Lightweight validators for:
 *   - HostedCapabilityRecord (wire shape served by /api/cli/capabilities)
 *   - CmsCapabilityNode (canonical form after normalization)
 *   - LocalCapabilityExtension (operator-authored files under
 *     `<forkPath>/.growthub-fork/capabilities/*.json`)
 *
 * The CLI does not pull in a runtime schema library on the hot path; this
 * module implements structural checks inline. Use `validate...` to get
 * a { ok, issues } verdict suitable for CLI error messages.
 */

import type { CapabilityFamily, CmsCapabilityNode } from "@growthub/api-contract/capabilities";
import type { LocalCapabilityExtension } from "@growthub/api-contract/manifest";
import { CAPABILITY_FAMILIES } from "@growthub/api-contract/capabilities";

const FAMILY_SET = new Set<string>(CAPABILITY_FAMILIES as readonly string[]);
const EXECUTION_KINDS = new Set(["hosted-execute", "provider-assembly", "local-only"]);
const NODE_TYPES = new Set(["tool_execution", "cms_workflow"]);
const VISIBILITIES = new Set(["public", "authenticated", "admin"]);
const EXECUTION_STRATEGIES = new Set(["direct", "sequential-with-persistence", "async_operation"]);

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationVerdict {
  ok: boolean;
  issues: ValidationIssue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mustString(value: unknown, path: string, issues: ValidationIssue[]): string {
  if (typeof value !== "string" || !value.trim()) {
    issues.push({ path, message: `expected non-empty string` });
    return "";
  }
  return value;
}

function mustOneOf(value: unknown, allowed: Set<string>, path: string, issues: ValidationIssue[]): string {
  const str = mustString(value, path, issues);
  if (str && !allowed.has(str)) {
    issues.push({ path, message: `expected one of ${[...allowed].join(", ")}, got "${str}"` });
  }
  return str;
}

function mustArray<T>(value: unknown, path: string, issues: ValidationIssue[]): T[] {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "expected array" });
    return [];
  }
  return value as T[];
}

function mustRecord(value: unknown, path: string, issues: ValidationIssue[]): Record<string, unknown> {
  if (!isRecord(value)) {
    issues.push({ path, message: "expected object" });
    return {};
  }
  return value;
}

export function validateCmsCapabilityNode(value: unknown): ValidationVerdict {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: "$", message: "expected object" }] };
  }

  mustString(value.slug, "$.slug", issues);
  mustString(value.displayName, "$.displayName", issues);
  mustOneOf(value.family, FAMILY_SET, "$.family", issues);
  mustOneOf(value.executionKind, EXECUTION_KINDS, "$.executionKind", issues);
  mustOneOf(value.nodeType, NODE_TYPES, "$.nodeType", issues);
  mustOneOf(value.visibility, VISIBILITIES, "$.visibility", issues);

  const binding = mustRecord(value.executionBinding, "$.executionBinding", issues);
  if (Object.keys(binding).length) {
    if (binding.type !== "mcp_tool_call") {
      issues.push({ path: "$.executionBinding.type", message: 'expected "mcp_tool_call"' });
    }
    mustOneOf(binding.strategy, EXECUTION_STRATEGIES, "$.executionBinding.strategy", issues);
  }

  const tokens = mustRecord(value.executionTokens, "$.executionTokens", issues);
  if (Object.keys(tokens).length) {
    mustString(tokens.tool_name, "$.executionTokens.tool_name", issues);
    mustRecord(tokens.input_template, "$.executionTokens.input_template", issues);
    mustRecord(tokens.output_mapping, "$.executionTokens.output_mapping", issues);
  }

  mustArray<string>(value.requiredBindings, "$.requiredBindings", issues);
  mustArray<string>(value.outputTypes, "$.outputTypes", issues);

  if (typeof value.enabled !== "boolean") {
    issues.push({ path: "$.enabled", message: "expected boolean" });
  }
  if (typeof value.experimental !== "boolean") {
    issues.push({ path: "$.experimental", message: "expected boolean" });
  }

  return { ok: issues.length === 0, issues };
}

export function isCmsCapabilityNode(value: unknown): value is CmsCapabilityNode {
  return validateCmsCapabilityNode(value).ok;
}

export function validateLocalCapabilityExtension(value: unknown): ValidationVerdict {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: "$", message: "expected object" }] };
  }
  if (value.version !== 1) {
    issues.push({ path: "$.version", message: 'expected 1' });
  }
  if (typeof value.active !== "boolean") {
    issues.push({ path: "$.active", message: "expected boolean" });
  }
  const nodeVerdict = validateCmsCapabilityNode(value.node);
  for (const issue of nodeVerdict.issues) {
    issues.push({ path: `$.node${issue.path.slice(1)}`, message: issue.message });
  }
  return { ok: issues.length === 0, issues };
}

export function isLocalCapabilityExtension(value: unknown): value is LocalCapabilityExtension {
  return validateLocalCapabilityExtension(value).ok;
}

/** List of recognized capability families (for CLI error messages). */
export function listCapabilityFamilies(): CapabilityFamily[] {
  return [...CAPABILITY_FAMILIES];
}
