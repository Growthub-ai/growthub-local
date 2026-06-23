/**
 * Growthub Workspace Authority Intelligence V1 — the canonical pure combiner.
 *
 * This is the single read-model that unifies the two formerly-separate
 * projections — workspace health + agent context (`lib/workspace-health.js`)
 * and governance causation / route-shopping (`lib/governance-causation-console.js`)
 * — into ONE operator intelligence layer answering one question:
 *
 *     "Is this workspace safe, healthy, understandable, and governed enough
 *      for agents to act?"
 *
 * It owns NO new derivation logic of its own beyond composition: every signal
 * is produced by the existing pure derivers. It adds:
 *
 *   1. deriveAuthorityStatus({ health, governance })
 *      The rolled-up operator status across both lanes:
 *        unhealthy health OR alert governance      → "attention"
 *        degraded health OR watch governance       → "watch"
 *        clean health AND clear governance         → "clear"
 *
 *   2. deriveAuthorityNextActions({ health, governance, agentContext })
 *      ONE normalized "needs your attention" action model spanning health
 *      issues and governance signals, each pointing at an EXISTING fix
 *      surface only (data-model / builder / workflow-canvas / swarm-run /
 *      source-refresh). High-severity governance outranks everything; a
 *      health error outranks a low/medium governance watch; health warnings
 *      are lowest.
 *
 *   3. deriveWorkspaceAuthorityIntelligence({ metadataStore, metadataGraph,
 *      workspaceConfig, receipts })
 *      The full canonical packet: { kind, version, status, health,
 *      agentContext, governance, summary, nextActions, generatedFrom }.
 *
 * Invariants (inherited from both source derivers):
 *   - Pure. No React, no fetch, no filesystem, no config writes, no browser
 *     storage, no timers. Composition only.
 *   - Never throws on partial / unknown / absent input — returns a typed,
 *     empty-baseline envelope instead.
 *   - Never echoes secrets. It reads only the already-redacted derived read
 *     models; it surfaces no raw config rows, source rows, tokens, or auth
 *     material.
 *   - Deterministic ordering so consumers can diff between calls.
 *
 * Authority boundary: this is a DERIVED read model, not authority.
 * growthub.config.json + growthub.source-records.json + the agent-outcomes
 * receipt stream remain the authoritative artifacts. Writes still flow through
 * the governed lanes (PATCH /api/workspace, helper/apply, sandbox-run). This
 * module introduces NO mutation lane, NO PATCH field, NO new object type, NO
 * persistence, and NO new runtime.
 */

import { deriveWorkspaceHealth, deriveAgentContextPacket } from "./workspace-health.js";
import { deriveGovernanceCausation } from "./governance-causation-console.js";

const AUTHORITY_KIND = "growthub-workspace-authority-intelligence-v1";
const AUTHORITY_VERSION = 1;

// Every next action must hand off to one of these EXISTING surfaces. A surface
// outside this set is dropped (artifact: null) so the cockpit can never offer a
// link to a route that does not exist.
const AUTHORITY_SURFACES = new Set([
  "data-model",
  "builder",
  "workflow-canvas",
  "swarm-run",
  "source-refresh",
]);

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeString(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

/**
 * Roll the two lane statuses up into one operator status. Pure, total.
 */
function deriveAuthorityStatus({ health, governance } = {}) {
  const healthStatus = safeString(health?.status);
  const governanceStatus = safeString(governance?.status);
  if (healthStatus === "unhealthy" || governanceStatus === "alert") return "attention";
  if (healthStatus === "degraded" || governanceStatus === "watch") return "watch";
  return "clear";
}

// Map a health issue to its EXISTING fix surface. These are the same targets
// the (now folded) health panel used — no new navigation pattern.
function healthArtifactFor(issue) {
  switch (issue?.type) {
    case "missing_source":
      return issue.objectId
        ? { surface: "data-model", objectId: safeString(issue.objectId) }
        : { surface: "data-model" };
    case "dangling_edge":
      return issue.ref?.objectId
        ? { surface: "data-model", objectId: safeString(issue.ref.objectId) }
        : { surface: "builder" };
    case "stale_widget":
      return { surface: "builder", widgetId: safeString(issue.widgetId) };
    case "unhealthy_pipeline":
    case "untested_pipeline":
      return issue.objectId && issue.rowName
        ? { surface: "workflow-canvas", objectId: safeString(issue.objectId), rowName: safeString(issue.rowName) }
        : { surface: "workflow-canvas" };
    default:
      return { surface: "builder" };
  }
}

const HEALTH_ISSUE_LABEL = {
  stale_widget: "Stale widget",
  missing_source: "Missing source",
  dangling_edge: "Broken reference",
  unhealthy_pipeline: "Failing pipeline",
  untested_pipeline: "Untested pipeline",
};

// Deterministic priority. Governance high outranks everything; a health error
// outranks a low/medium governance watch; health warnings are lowest.
function actionPriority(source, severity) {
  if (source === "governance") {
    if (severity === "high") return 100;
    if (severity === "medium") return 60;
    return 50; // low
  }
  if (source === "health") {
    if (severity === "error") return 80;
    return 40; // warning
  }
  return 10; // context / anything else
}

function normalizeArtifact(artifact) {
  if (!artifact || typeof artifact !== "object") return null;
  return AUTHORITY_SURFACES.has(artifact.surface) ? artifact : null;
}

/**
 * Build the ONE normalized next-action list across health + governance. Each
 * entry: { id, source, severity, priority, label, reason, artifact }.
 *
 * @returns {Array} sorted highest-priority first; the cockpit renders [0] as
 *   the single "Needs your attention" card and the rest as the list.
 */
function deriveAuthorityNextActions({ health, governance, agentContext } = {}) {
  const actions = [];

  // Governance signals — one action per confirmed route-shop pair. Duplicate
  // same-actor signals never collapse: each carries a stable signalId.
  for (const signal of safeArray(governance?.signals)) {
    const severity = safeString(signal?.severity) || "low";
    actions.push({
      id: `governance::${safeString(signal?.signalId)}`,
      source: "governance",
      severity,
      priority: actionPriority("governance", severity),
      label: `Review route-shopping by ${safeString(signal?.actor) || "an actor"}`,
      reason: safeString(signal?.headline),
      artifact: normalizeArtifact(signal?.handoff),
    });
  }

  // Health issues — errors before warnings (the deriver already orders them).
  for (const issue of safeArray(health?.issues)) {
    const severity = issue?.severity === "error" ? "error" : "warning";
    const ref = safeString(issue?.widgetId || issue?.objectId || issue?.workflow || issue?.sourceId);
    actions.push({
      id: `health::${safeString(issue?.type)}::${ref}`,
      source: "health",
      severity,
      priority: actionPriority("health", severity),
      label: `${HEALTH_ISSUE_LABEL[issue?.type] || safeString(issue?.type) || "Issue"}${ref ? ` · ${ref}` : ""}`,
      reason: safeString(issue?.reason),
      artifact: normalizeArtifact(healthArtifactFor(issue)),
    });
  }

  // Stable sort: priority desc, otherwise preserve insertion order (Node's
  // Array.prototype.sort is stable) so equal-priority items stay deterministic.
  actions.sort((a, b) => b.priority - a.priority);
  return actions;
}

/**
 * Build the full Workspace Authority Intelligence packet.
 *
 * @param {object} args
 * @param {object} [args.metadataStore]   workspace metadata store (or null).
 * @param {object} [args.metadataGraph]   workspace metadata graph (or null).
 * @param {object} [args.workspaceConfig] growthub.config.json contents.
 * @param {Array}  [args.receipts]        the workspace:agent-outcomes stream.
 * @returns {object} canonical authority intelligence read model.
 */
function deriveWorkspaceAuthorityIntelligence({
  metadataStore = null,
  metadataGraph = null,
  workspaceConfig = {},
  receipts = [],
} = {}) {
  const health = deriveWorkspaceHealth(metadataStore, metadataGraph);
  const agentContext = deriveAgentContextPacket(metadataStore, metadataGraph, health, workspaceConfig);
  const governance = deriveGovernanceCausation({ receipts: safeArray(receipts) });

  const status = deriveAuthorityStatus({ health, governance });
  const nextActions = deriveAuthorityNextActions({ health, governance, agentContext });

  const summary = {
    status,
    health: safeString(health?.status) || "healthy",
    governance: safeString(governance?.status) || "clear",
    issueCount: safeArray(health?.issues).length,
    routeShopSignals: Number(governance?.totals?.routeShopSignals) || 0,
    highSeverityGovernance: Number(governance?.totals?.highSeverity) || 0,
    capabilities: safeArray(agentContext?.capabilities),
    nextActionCount: nextActions.length,
  };

  return {
    kind: AUTHORITY_KIND,
    version: AUTHORITY_VERSION,
    status,
    health,
    agentContext,
    governance,
    summary,
    nextActions,
    generatedFrom: {
      metadataGraph: Boolean(metadataStore || metadataGraph),
      receipts: Array.isArray(receipts) && receipts.length > 0,
      sourceRecords: true,
    },
  };
}

export {
  AUTHORITY_KIND,
  AUTHORITY_VERSION,
  AUTHORITY_SURFACES,
  deriveAuthorityStatus,
  deriveAuthorityNextActions,
  deriveWorkspaceAuthorityIntelligence,
};

export default deriveWorkspaceAuthorityIntelligence;
