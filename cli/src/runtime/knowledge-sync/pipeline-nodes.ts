/**
 * Knowledge Sync — Pipeline Node Contracts
 *
 * Static CmsCapabilityNode-compatible objects for knowledge-export and
 * knowledge-import nodes. These can be used in local pipeline assembly
 * (offline / local execution) and are discoverable through the same
 * registry interface as hosted CMS nodes.
 *
 * These are LOCAL-ONLY nodes (executionKind: "local-only") — they run
 * against the local kb_skill_docs store, not the hosted CMS runtime.
 */

import type { CmsCapabilityNode } from "../cms-capability-registry/types.js";

// ---------------------------------------------------------------------------
// knowledge-export node
// ---------------------------------------------------------------------------

export const KNOWLEDGE_EXPORT_NODE: CmsCapabilityNode = {
  slug: "knowledge-export",
  displayName: "Knowledge Export",
  icon: "📤",
  family: "knowledge",
  category: "knowledge_management",
  nodeType: "tool_execution",
  executionKind: "local-only",
  executionBinding: {
    type: "mcp_tool_call",
    strategy: "direct",
    timeoutMs: 30_000,
  },
  executionTokens: {
    tool_name: "knowledge_export",
    input_template: {
      company_id: "{{company_id}}",
      target_workspace: "{{target_workspace}}",
      label: "{{label}}",
    },
    output_mapping: {
      envelope_path: "$.envelopePath",
      item_count: "$.itemCount",
    },
  },
  requiredBindings: ["company_id"],
  outputTypes: ["knowledge_envelope"],
  enabled: true,
  experimental: false,
  visibility: "authenticated",
  description:
    "Exports knowledge items from the current workspace to a serialized envelope. " +
    "Supports local filesystem delivery and optional relay to the hosted Growthub app.",
};

// ---------------------------------------------------------------------------
// knowledge-import node
// ---------------------------------------------------------------------------

export const KNOWLEDGE_IMPORT_NODE: CmsCapabilityNode = {
  slug: "knowledge-import",
  displayName: "Knowledge Import",
  icon: "📥",
  family: "knowledge",
  category: "knowledge_management",
  nodeType: "tool_execution",
  executionKind: "local-only",
  executionBinding: {
    type: "mcp_tool_call",
    strategy: "direct",
    timeoutMs: 30_000,
  },
  executionTokens: {
    tool_name: "knowledge_import",
    input_template: {
      company_id: "{{company_id}}",
      envelope_path: "{{envelope_path}}",
      relay_to_hosted: "{{relay_to_hosted}}",
    },
    output_mapping: {
      imported_count: "$.importedCount",
      skipped_count: "$.skippedCount",
    },
  },
  requiredBindings: ["company_id", "envelope_path"],
  outputTypes: ["knowledge_import_result"],
  enabled: true,
  experimental: false,
  visibility: "authenticated",
  description:
    "Imports knowledge items from a serialized envelope into the current workspace. " +
    "Deduplication by SHA-256 body hash ensures idempotent imports.",
};

// ---------------------------------------------------------------------------
// knowledge-capture node
// ---------------------------------------------------------------------------

export const KNOWLEDGE_CAPTURE_NODE: CmsCapabilityNode = {
  slug: "knowledge-capture",
  displayName: "Knowledge Capture",
  icon: "🧠",
  family: "knowledge",
  category: "knowledge_management",
  nodeType: "tool_execution",
  executionKind: "local-only",
  executionBinding: {
    type: "mcp_tool_call",
    strategy: "direct",
    timeoutMs: 60_000,
  },
  executionTokens: {
    tool_name: "knowledge_capture",
    input_template: {
      company_id: "{{company_id}}",
      run_id: "{{run_id}}",
      user_intent: "{{user_intent}}",
      relay_to_hosted: "{{relay_to_hosted}}",
    },
    output_mapping: {
      saved_count: "$.savedCount",
      proposal_count: "$.proposalCount",
    },
  },
  requiredBindings: ["company_id", "run_id"],
  outputTypes: ["knowledge_capture_result"],
  enabled: true,
  experimental: false,
  visibility: "authenticated",
  description:
    "Captures compounding intelligence from a completed agent run and writes " +
    "structured knowledge items to the local knowledge base. Uses native intelligence " +
    "to propose what to save, with a deterministic fallback.",
};

// ---------------------------------------------------------------------------
// Registry export — all local knowledge nodes
// ---------------------------------------------------------------------------

export const LOCAL_KNOWLEDGE_NODES: CmsCapabilityNode[] = [
  KNOWLEDGE_EXPORT_NODE,
  KNOWLEDGE_IMPORT_NODE,
  KNOWLEDGE_CAPTURE_NODE,
];

export const LOCAL_KNOWLEDGE_NODE_SLUGS = LOCAL_KNOWLEDGE_NODES.map((n) => n.slug);
