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
 *
 * Trust boundary: a bare hash is NEVER accepted here — evidence-shaped input
 * is not evidence. The full receipt must be present (HTTP-facing callers
 * must have resolved it server-side and discarded the caller-shaped body),
 * and when the parent's identity is supplied it must bind: the child must
 * declare THIS parent as its spawning receipt, and its tenant scope hash
 * must match. A valid child receipt therefore cannot be replayed under a
 * different parent, tool call, tenant, or run.
 */
export function ingestChildReceipt({
  toolCallId = "",
  workflowRef = "",
  childReceipt = null,
  childReceiptSha256 = "",
  forbiddenReceiptIds = [],
  expectedParentReceiptId = "",
  expectedScopeSha256 = "",
  requireScopeBinding = false,
  evidenceBasis = "",
} = {}) {
  if (!childReceipt || typeof childReceipt !== "object") {
    const sha = String(childReceiptSha256 || "").toLowerCase();
    return {
      ok: false,
      error: /^[0-9a-f]{64}$/.test(sha)
        ? { code: "child_receipt_hash_only", message: "a bare child_receipt_sha256 is evidence-shaped input, not evidence; the full child receipt must be resolved server-side" }
        : { code: "child_receipt_missing", message: "a child workflow tool result requires the child's full verification receipt" },
    };
  }
  if (childReceipt.kind !== "growthub-inference-verification-receipt-v1" || !childReceipt.receipt_id) {
    return { ok: false, error: { code: "child_receipt_invalid", message: "child_receipt is not a growthub inference verification receipt" } };
  }
  const childId = String(childReceipt.receipt_id);
  // Parent binding: the child must have been spawned FROM this awaiting
  // receipt (the binding headers hand the executor exactly this id). A
  // receipt minted under any other parent — or with no parent — is a replay
  // or a forgery, not this call's child.
  const wantedParent = String(expectedParentReceiptId || "").trim();
  if (wantedParent) {
    const declaredParent = String(childReceipt.lineage?.parent_receipt_id || "").trim();
    if (declaredParent !== wantedParent) {
      return {
        ok: false,
        error: {
          code: "child_receipt_parent_mismatch",
          message: `child receipt ${childId} declares parent ${declaredParent || "(none)"}; this continuation requires ${wantedParent}`,
        },
      };
    }
  }
  // Tenant/scope binding: both receipts hash the same server-owned tenant
  // scope into their cache evidence; a cross-tenant receipt cannot bind.
  // Under `requireScopeBinding` (live execution) the binding must be
  // PROVABLE: a continuation without a concrete server-owned scope, or a
  // child receipt that carries no scope hash, fails closed — an absent
  // scope is not isolation.
  const wantedScope = String(expectedScopeSha256 || "").trim();
  const childScope = String(childReceipt.cache?.cache_scope_sha256 || "").trim();
  if (requireScopeBinding && (!wantedScope || !childScope)) {
    return {
      ok: false,
      error: {
        code: "child_receipt_scope_unbound",
        message: !wantedScope
          ? `child receipt ${childId} cannot be scope-verified: this continuation has no concrete server-owned tenant scope`
          : `child receipt ${childId} carries no cache_scope_sha256; live execution cannot prove tenant-scope binding`,
      },
    };
  }
  if (wantedScope && childScope && wantedScope !== childScope) {
    return { ok: false, error: { code: "child_receipt_scope_mismatch", message: `child receipt ${childId} was produced under a different tenant/workspace scope` } };
  }
  // Cycle guard: a child receipt may not BE this parent's own receipt, nor
  // any receipt already on this continuation's ancestry (parent/prior).
  const forbidden = new Set((Array.isArray(forbiddenReceiptIds) ? forbiddenReceiptIds : []).map(String).filter(Boolean));
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
      child_receipt_id: childId,
      child_receipt_sha256: receiptSha256(childReceipt),
      child_status: failed ? "FAILED" : "COMPLETED",
      ...(toolCallId ? { tool_call_id: toolCallId } : {}),
      ...(workflowRef ? { workflow_ref: workflowRef } : {}),
      // Honest provenance of the receipt body itself: "server-resolved"
      // means the canonical receipt came from server-owned persisted records
      // (the only basis live execution accepts); "caller-draft" means a
      // caller-supplied body was ingested by a development/draft lane and is
      // NOT trusted production evidence.
      ...(evidenceBasis ? { evidence_basis: String(evidenceBasis) } : {}),
      ...(failed ? { error: firstError } : {}),
    },
  };
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

/** Explicit input bounds for the transitive cycle check. A graph outside
 * these bounds is refused (fail closed), never partially verified: silently
 * truncating ids or edges could merge two distinct receipts and produce a
 * false verdict in either direction. */
export const LINEAGE_GRAPH_MAX_NODES = 5_000;
export const LINEAGE_GRAPH_MAX_EDGES = 20_000;
export const LINEAGE_RECEIPT_ID_MAX_CHARS = 256;
const LINEAGE_CYCLE_PATH_MAX = 32;

/**
 * Transitive cycle detection over a recorded edge set. Ingestion-time guards
 * are necessarily local (a gateway sees one continuation at a time); this
 * check is the global verdict run wherever a full edge set exists — workflow
 * DAG assembly and the persistence layer — so a cycle recorded by concurrent
 * continuations is still refused before it is trusted.
 *
 * Iterative O(V+E) DFS (an explicit stack, so an adversarially deep chain
 * cannot exhaust the call stack), with hard bounds on node count, edge
 * count, and receipt-id size. Exceeding a bound is a fail-closed verdict
 * (`boundsExceeded: true`), and a reported cycle path is bounded.
 *
 * @param {Array<{ receipt_id: string, parent_receipt_id?: string|null, children?: Array<{ child_receipt_id?: string }> }>} edges
 * @returns {{ ok: boolean, cyclePath: string[], boundsExceeded?: boolean, reason?: string }}
 */
export function detectLineageCycle(edges) {
  const adjacency = new Map();
  let edgeCount = 0;
  let overflow = "";
  const boundId = (raw) => {
    const id = String(raw || "");
    if (id.length > LINEAGE_RECEIPT_ID_MAX_CHARS) {
      overflow = `receipt id exceeds ${LINEAGE_RECEIPT_ID_MAX_CHARS} characters`;
      return "";
    }
    return id;
  };
  const addEdge = (from, to) => {
    if (!from || !to || overflow) return;
    edgeCount += 1;
    if (edgeCount > LINEAGE_GRAPH_MAX_EDGES) {
      overflow = `receipt graph exceeds ${LINEAGE_GRAPH_MAX_EDGES} edges`;
      return;
    }
    if (!adjacency.has(from)) adjacency.set(from, new Set());
    adjacency.get(from).add(to);
    if (!adjacency.has(to)) adjacency.set(to, new Set());
    if (adjacency.size > LINEAGE_GRAPH_MAX_NODES) {
      overflow = `receipt graph exceeds ${LINEAGE_GRAPH_MAX_NODES} nodes`;
    }
  };
  for (const edge of Array.isArray(edges) ? edges : []) {
    if (overflow) break;
    const id = boundId(edge?.receipt_id);
    if (!id) continue;
    const parent = boundId(edge?.parent_receipt_id);
    if (parent) addEdge(parent, id);
    for (const child of Array.isArray(edge?.children) ? edge.children : []) {
      addEdge(id, boundId(child?.child_receipt_id));
    }
  }
  if (overflow) {
    return { ok: false, cyclePath: [], boundsExceeded: true, reason: overflow };
  }
  const visiting = new Set();
  const done = new Set();
  for (const start of adjacency.keys()) {
    if (done.has(start)) continue;
    // Each frame keeps its own child iterator so the walk is a true
    // iterative DFS: one push per discovered node, one pop per finished node.
    const path = [start];
    const stack = [{ node: start, iterator: (adjacency.get(start) || new Set()).values() }];
    visiting.add(start);
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const step = frame.iterator.next();
      if (step.done) {
        visiting.delete(frame.node);
        done.add(frame.node);
        stack.pop();
        path.pop();
        continue;
      }
      const next = step.value;
      if (done.has(next)) continue;
      if (visiting.has(next)) {
        const cycleStart = path.indexOf(next);
        const cycle = [...path.slice(cycleStart >= 0 ? cycleStart : 0), next];
        return { ok: false, cyclePath: cycle.slice(0, LINEAGE_CYCLE_PATH_MAX) };
      }
      visiting.add(next);
      path.push(next);
      stack.push({ node: next, iterator: (adjacency.get(next) || new Set()).values() });
    }
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
