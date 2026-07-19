/**
 * Receipt lineage — the agent-to-agent receipt DAG.
 *
 * A parent inference receipt no longer ends at "HTTP 200 from the child": a
 * governed child workflow returns its full verification receipt, the parent
 * gateway hashes it, and the parent receipt stores the Merkle edge
 * (`child_receipt_sha256`). Because the parent's own receipt hash covers its
 * children's hashes, the DAG chains parent -> child -> grandchild without
 * copying child evidence bodies. A declared child that never ingests a
 * receipt fails the parent closed; a failed child is recorded with its exact
 * error instead of being orphaned.
 */

import { sha256Hex, stableStringify } from "./contracts.js";

export const INFERENCE_SPAN_KINDS = Object.freeze(["ROOT", "CHILD_TOOL", "CHILD_WORKFLOW"]);

/** Headers a governed executor must forward when it invokes a child workflow. */
export const CHILD_RECEIPT_REQUIRED_HEADER = "x-growthub-child-receipt-required";
export const PARENT_SPAN_ID_HEADER = "x-growthub-parent-span-id";
export const PARENT_RECEIPT_ID_HEADER = "x-growthub-parent-receipt-id";

export function normalizeSpanKind(rawKind, rawParentReceiptId) {
  const parentReceiptId = String(rawParentReceiptId || "").trim();
  const requested = String(rawKind || "").trim().toUpperCase();
  if (!requested) {
    return { ok: true, spanKind: parentReceiptId ? "CHILD_WORKFLOW" : "ROOT", parentReceiptId };
  }
  if (!INFERENCE_SPAN_KINDS.includes(requested)) {
    return { ok: false, error: { code: "span_kind_invalid", message: `span_kind must be one of ${INFERENCE_SPAN_KINDS.join(", ")}` } };
  }
  if (requested === "ROOT" && parentReceiptId) {
    return { ok: false, error: { code: "span_kind_invalid", message: "a ROOT span cannot declare parent_receipt_id" } };
  }
  if (requested !== "ROOT" && !parentReceiptId) {
    return { ok: false, error: { code: "span_kind_invalid", message: `${requested} requires parent_receipt_id` } };
  }
  return { ok: true, spanKind: requested, parentReceiptId };
}

/** Canonical hash of a full receipt JSON — the Merkle node identity. */
export function receiptSha256(receipt) {
  return sha256Hex(stableStringify(receipt));
}

/**
 * OpenAPI operations that target a governed Growthub workflow endpoint.
 * Marked explicitly with `x-growthub-workflow: true` or by the canonical
 * sandbox-run path. Tool calls against these operations REQUIRE a child
 * receipt at continuation time.
 */
export function workflowOperationIds(rawSpec) {
  const spec = rawSpec && typeof rawSpec === "object" ? rawSpec : {};
  const paths = spec.paths && typeof spec.paths === "object" ? spec.paths : {};
  const ids = new Set();
  for (const [pathTemplate, operations] of Object.entries(paths)) {
    if (!operations || typeof operations !== "object") continue;
    for (const operation of Object.values(operations)) {
      if (!operation || typeof operation !== "object") continue;
      const operationId = String(operation.operationId || "");
      if (!operationId) continue;
      if (operation["x-growthub-workflow"] === true || /\/api\/workspace\/sandbox-run/.test(pathTemplate)) {
        ids.add(operationId);
      }
    }
  }
  return ids;
}

/**
 * Validate and hash one ingested child receipt. The child's own status maps
 * to the DAG edge status; a rejected/failed child is COMPLETED evidence of a
 * FAILED child, carrying the child's exact first error.
 */
export function ingestChildReceipt({ toolCallId = "", workflowRef = "", childReceipt = null, childReceiptSha256 = "", forbiddenReceiptIds = [] } = {}) {
  if (childReceipt && typeof childReceipt === "object") {
    if (childReceipt.kind !== "growthub-inference-verification-receipt-v1" || !childReceipt.receipt_id) {
      return { ok: false, error: { code: "child_receipt_invalid", message: "child_receipt is not a growthub inference verification receipt" } };
    }
    // Cycle guard: a child receipt may not BE this parent's own receipt, nor
    // any receipt already on this continuation's ancestry (parent/prior).
    // A workflow that loops back onto its own lineage is rejected instead of
    // minting a self-referential DAG edge.
    const forbidden = new Set((Array.isArray(forbiddenReceiptIds) ? forbiddenReceiptIds : []).map(String).filter(Boolean));
    const childId = String(childReceipt.receipt_id);
    const childAncestors = [childId, ...(Array.isArray(childReceipt.lineage?.children) ? childReceipt.lineage.children.map((link) => String(link?.child_receipt_id || "")) : [])];
    if (childAncestors.some((id) => id && forbidden.has(id))) {
      return { ok: false, error: { code: "child_receipt_cycle", message: `child receipt ${childId} closes a cycle onto this request's own receipt lineage` } };
    }
    const failed = childReceipt.status === "rejected" || childReceipt.status === "failed";
    const firstError = Array.isArray(childReceipt.errors) && childReceipt.errors.length
      ? { code: String(childReceipt.errors[0].code || "child_failed"), message: String(childReceipt.errors[0].message || "").slice(0, 512) }
      : { code: "child_failed", message: `child receipt status ${childReceipt.status}` };
    return {
      ok: true,
      link: {
        child_receipt_id: String(childReceipt.receipt_id),
        child_receipt_sha256: receiptSha256(childReceipt),
        child_status: failed ? "FAILED" : "COMPLETED",
        ...(toolCallId ? { tool_call_id: toolCallId } : {}),
        ...(workflowRef ? { workflow_ref: workflowRef } : {}),
        ...(failed ? { error: firstError } : {}),
      },
    };
  }
  const sha = String(childReceiptSha256 || "").toLowerCase();
  if (/^[0-9a-f]{64}$/.test(sha)) {
    return {
      ok: true,
      link: {
        child_receipt_id: "",
        child_receipt_sha256: sha,
        child_status: "COMPLETED",
        ...(toolCallId ? { tool_call_id: toolCallId } : {}),
        ...(workflowRef ? { workflow_ref: workflowRef } : {}),
      },
    };
  }
  return { ok: false, error: { code: "child_receipt_missing", message: "a child workflow tool result requires child_receipt or child_receipt_sha256" } };
}

/** A MISSING edge — a declared child that never ingested a receipt. */
export function missingChildLink({ toolCallId = "", workflowRef = "", error } = {}) {
  return {
    child_receipt_id: "",
    child_receipt_sha256: null,
    child_status: "MISSING",
    ...(toolCallId ? { tool_call_id: toolCallId } : {}),
    ...(workflowRef ? { workflow_ref: workflowRef } : {}),
    error: error || { code: "child_receipt_missing", message: "declared child workflow call completed without receipt ingestion" },
  };
}

/** Assemble the lineage evidence block for a receipt. */
export function buildReceiptLineage({ spanKind = "ROOT", parentReceiptId = "", children = [] } = {}) {
  const links = Array.isArray(children) ? children : [];
  const missing = links.filter((link) => link.child_status === "MISSING");
  const lineageSha = links.length
    ? sha256Hex(stableStringify(links.map((link) => ({
        id: link.child_receipt_id,
        sha256: link.child_receipt_sha256,
        status: link.child_status,
      }))))
    : null;
  return {
    span_kind: spanKind,
    parent_receipt_id: parentReceiptId || null,
    children: links,
    lineage_sha256: lineageSha,
    status: links.length === 0 ? "leaf" : missing.length ? "incomplete" : "complete",
    ...(missing.length ? { reason: `${missing.length} declared child receipt(s) were never ingested` } : {}),
  };
}

/**
 * Transitive cycle detection over a recorded edge set. Ingestion-time guards
 * are necessarily local (a gateway sees one continuation at a time); this
 * DFS is the global check run wherever a full edge set exists — workflow DAG
 * assembly and the persistence layer — so a cycle recorded by concurrent
 * continuations is still caught and flagged before it is trusted.
 *
 * @param {Array<{ receipt_id: string, parent_receipt_id?: string|null, children?: Array<{ child_receipt_id?: string }> }>} edges
 * @returns {{ ok: boolean, cyclePath: string[] }}
 */
export function detectLineageCycle(edges) {
  const adjacency = new Map();
  const addEdge = (from, to) => {
    if (!from || !to) return;
    if (!adjacency.has(from)) adjacency.set(from, new Set());
    adjacency.get(from).add(to);
  };
  for (const edge of Array.isArray(edges) ? edges : []) {
    const id = String(edge?.receipt_id || "");
    if (!id) continue;
    const parent = String(edge?.parent_receipt_id || "");
    if (parent) addEdge(parent, id);
    for (const child of Array.isArray(edge?.children) ? edge.children : []) {
      addEdge(id, String(child?.child_receipt_id || ""));
    }
  }
  const visiting = new Set();
  const done = new Set();
  const path = [];
  const walk = (node) => {
    if (done.has(node)) return null;
    if (visiting.has(node)) return [...path.slice(path.indexOf(node)), node];
    visiting.add(node);
    path.push(node);
    for (const next of adjacency.get(node) || []) {
      const cycle = walk(next);
      if (cycle) return cycle;
    }
    visiting.delete(node);
    done.add(node);
    path.pop();
    return null;
  };
  for (const node of adjacency.keys()) {
    const cycle = walk(node);
    if (cycle) return { ok: false, cyclePath: cycle };
  }
  return { ok: true, cyclePath: [] };
}

/**
 * Headers the awaiting-tool-result envelope hands to the governed executor
 * for calls that target a child workflow, so the child gateway knows a
 * receipt callback is required and which parent span to bind.
 */
export function childExecutionHeaders({ parentReceiptId, parentSpanId }) {
  return {
    [CHILD_RECEIPT_REQUIRED_HEADER]: "true",
    [PARENT_SPAN_ID_HEADER]: String(parentSpanId || ""),
    [PARENT_RECEIPT_ID_HEADER]: String(parentReceiptId || ""),
  };
}
