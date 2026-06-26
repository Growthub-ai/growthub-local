/**
 * Growthub Workspace Workflow-Impact V1 — outcome-level impact deriver.
 *
 * `deriveBlastRadius` answers "what nodes depend on X?". For a workflow step
 * the operationally important question is one hop further: *if I change this
 * step, which RUNS re-execute and which promotable DELIVERABLES go stale?* —
 * i.e. roll the reverse closure up to the outcome boundary the governance
 * plane actually cares about (runs, run outputs, output artifacts, and the
 * `promotable` ones among them).
 *
 * This composes two shipped primitives, building NO new graph:
 *   1. `deriveBlastRadius` (reverse closure) → the workflows + runs that depend
 *      on the changed step.
 *   2. `findDependencies` (one forward hop) from each affected run → the
 *      artifacts that run PRODUCED (`producedArtifact` / `producedRunOutput`),
 *      which are the deliverables now potentially invalidated.
 *
 * Pure, deterministic, bounded, cycle-safe (inherits those from the spine),
 * secret-free. Output is a compact, ordered view-model for swarm preflight,
 * the CEO cockpit readiness lens, and the CLI `plan` command.
 */

import { deriveBlastRadius } from "./workspace-metadata-impact.js";
import { findDependencies } from "./workspace-metadata-graph.js";

const WORKFLOW_IMPACT_KIND = "growthub-workspace-workflow-impact-v1";
const WORKFLOW_IMPACT_VERSION = 1;

const DEFAULT_MAX_NODES = 500;

// Node types that represent an end-to-end OUTCOME (vs. an intermediate config
// node). Reaching one of these means the change has outcome-level consequences.
const OUTCOME_TYPES = new Set(["run", "runOutput", "outputArtifact", "workflow"]);

// Forward relations from a run to the things it produced.
const PRODUCTION_RELATIONS = new Set(["producedArtifact", "producedRunOutput", "materializedAs"]);

function safeString(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

function summarizeNode(node) {
  if (!node || typeof node !== "object") return null;
  return { id: node.id, type: node.type, label: node.label, metadataId: node.metadataId };
}

/**
 * @param {object} graph a `buildWorkspaceMetadataGraph` envelope
 * @param {string} originId the metadataId of the step being changed
 * @param {object} [options]
 * @param {number} [options.maxNodes=500]
 * @returns {object} `{ kind, version, origin, affectedRuns[], affectedWorkflows[],
 *   staleDeliverables[], promotableAtRisk, total, truncated, summary, warnings }`
 */
function deriveWorkflowImpact(graph, originId, options = {}) {
  const maxNodes = Number.isFinite(options.maxNodes) && options.maxNodes > 0
    ? Math.floor(options.maxNodes)
    : DEFAULT_MAX_NODES;

  const empty = (warning) => ({
    kind: WORKFLOW_IMPACT_KIND,
    version: WORKFLOW_IMPACT_VERSION,
    origin: null,
    affectedRuns: [],
    affectedWorkflows: [],
    staleDeliverables: [],
    promotableAtRisk: 0,
    total: 0,
    truncated: false,
    summary: "No workflow impact computed.",
    warnings: warning ? [warning] : []
  });

  if (!graph || typeof graph !== "object" || !Array.isArray(graph.nodes)) {
    return empty("graph missing or malformed");
  }
  const id = safeString(originId).trim();
  if (!id) return empty("originId missing");

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const originNode = nodesById.get(id);
  if (!originNode) return empty(`origin "${id}" not found in graph`);

  // ── 1. reverse closure → affected workflows + runs (reuse the spine) ────
  const blast = deriveBlastRadius(graph, id, { maxNodes });
  const affectedRuns = [];
  const affectedWorkflows = [];
  for (const impacted of blast.impacted) {
    if (impacted.type === "run") affectedRuns.push(impacted);
    else if (impacted.type === "workflow") affectedWorkflows.push(impacted);
  }

  // ── 2. one forward hop from each affected run → produced deliverables ────
  const deliverablesById = new Map();
  let promotableAtRisk = 0;
  for (const run of affectedRuns) {
    const produced = findDependencies(graph, run.id);
    for (const { node, relation } of produced) {
      if (!PRODUCTION_RELATIONS.has(relation)) continue;
      if (deliverablesById.has(node.id)) continue;
      const promotable = Boolean(node.summary && node.summary.promotable);
      if (promotable) promotableAtRisk += 1;
      deliverablesById.set(node.id, {
        id: node.id,
        type: node.type,
        label: node.label,
        metadataId: node.metadataId,
        viaRun: run.id,
        viaRelation: relation,
        promotable
      });
    }
  }

  let staleDeliverables = Array.from(deliverablesById.values());
  let truncated = blast.truncated;
  if (staleDeliverables.length > maxNodes) {
    staleDeliverables = staleDeliverables.slice(0, maxNodes);
    truncated = true;
  }

  const order = (a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id);
  affectedRuns.sort(order);
  affectedWorkflows.sort(order);
  staleDeliverables.sort((a, b) =>
    Number(b.promotable) - Number(a.promotable) || order(a, b)
  );

  const total = affectedWorkflows.length + affectedRuns.length + staleDeliverables.length;

  return {
    kind: WORKFLOW_IMPACT_KIND,
    version: WORKFLOW_IMPACT_VERSION,
    origin: summarizeNode(originNode),
    affectedWorkflows,
    affectedRuns,
    staleDeliverables,
    promotableAtRisk,
    total,
    truncated,
    summary: summarizeWorkflowImpact(originNode, affectedWorkflows, affectedRuns, staleDeliverables, promotableAtRisk, truncated),
    warnings: []
  };
}

function summarizeWorkflowImpact(originNode, workflows, runs, deliverables, promotableAtRisk, truncated) {
  const label = originNode?.label || originNode?.id || "step";
  if (!workflows.length && !runs.length && !deliverables.length) {
    return `Changing "${label}" has no outcome-level impact — no workflow, run, or deliverable depends on it.`;
  }
  const parts = [];
  if (workflows.length) parts.push(`${workflows.length} workflow(s)`);
  if (runs.length) parts.push(`${runs.length} run(s)`);
  if (deliverables.length) {
    const promo = promotableAtRisk ? `, ${promotableAtRisk} promotable` : "";
    parts.push(`${deliverables.length} deliverable(s)${promo}`);
  }
  const tail = truncated ? " (truncated)" : "";
  return `Changing "${label}" reaches ${parts.join(", ")}${tail}.`;
}

export {
  WORKFLOW_IMPACT_KIND,
  WORKFLOW_IMPACT_VERSION,
  DEFAULT_MAX_NODES,
  OUTCOME_TYPES,
  deriveWorkflowImpact,
  summarizeWorkflowImpact
};
