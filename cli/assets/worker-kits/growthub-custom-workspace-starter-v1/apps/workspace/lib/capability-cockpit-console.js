/**
 * Capability Cockpit projection — the governed oversight lens for a NON-scheduler
 * capability lane (deploy, workspace-data, messaging-send, ai-inference, …),
 * generalized directly from `deriveScheduleCockpit` (GOVERNED_CAPABILITY_BINDING_V1,
 * GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1).
 *
 * It is the SAME closed loop `/schedule` proved, for any capability:
 *
 *   state (config + receipts)
 *     → pure derivation (this module, reusing scanServerlessReadiness)
 *     → eligibility (per-card nextAction) + evidence (readiness, last-action proof)
 *     → action (hand-off to a governed capability action route)
 *     → receipt (workspace:agent-outcomes) — the reward signal
 *     → re-derive (next /deploy or /data call shows the state advanced)
 *
 * The emitted view-model doubles as the agent RL condition packet: `counts`,
 * `attention`, and each card's `nextAction` + `readiness` are exactly what a
 * human clicks OR an agent selects; the receipt's outcomeStatus is the reward.
 *
 * PURE deriver — no React, no fetch, no fs, no config writes. It introduces NO
 * new governed object, NO new PATCH field, and NO second readiness check:
 * capability install state comes from the existing API Registry rows and node
 * readiness is the existing `scanServerlessReadiness` causation driver.
 */

import { parseOrchestrationGraph } from "./orchestration-graph.js";
import { scanServerlessReadiness } from "./serverless-readiness.js";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function isApiRegistryObject(object) {
  const objectType = clean(object?.objectType);
  const id = clean(object?.id || object?.objectId);
  return objectType === "api-registry" || id === "api-registry";
}

/** Installed + verified capability products on a given lane (existing rows). */
function detectLaneProducts(workspaceConfig, lane) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const products = [];
  for (const object of objects) {
    if (!isApiRegistryObject(object)) continue;
    for (const row of Array.isArray(object.rows) ? object.rows : []) {
      if (clean(row?.executionLane) !== clean(lane)) continue;
      const integrationId = clean(row?.integrationId);
      if (!integrationId) continue;
      products.push({
        integrationId,
        label: clean(row?.Name) || integrationId,
        productId: clean(row?.productId),
        providerId: clean(row?.providerId),
        verified: clean(row?.syncStatus) === "verified" && Boolean(clean(row?.syncProof)),
        nodeSurface: clean(row?.nodeSurface) || "api-registry-call",
      });
    }
  }
  return products;
}

/** api-registry-call nodes in a workflow row's live graph that reference one of
 * the installed capability integrationIds (the node ↔ API Registry correlation). */
function capabilityNodesForRow(row, integrationIds) {
  const graph = parseOrchestrationGraph(row?.orchestrationGraph || row?.orchestrationConfig);
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  return nodes.filter((n) => {
    if (clean(n?.type) !== "api-registry-call") return false;
    const ref = clean(n?.config?.registryId || n?.config?.integrationId);
    return ref && integrationIds.has(ref);
  });
}

/** The single next move for a capability card (mirrors nextActionForCard). */
function nextActionForCapabilityCard({ state, hasCapability, actionVerb }) {
  switch (state) {
    case "ran":
      return { kind: "manage", label: "Manage binding" };
    case "blocked":
      return { kind: "readiness", label: "Resolve & rescan" };
    case "ready":
      return { kind: "run", label: actionVerb };
    case "bindable":
    default:
      return hasCapability
        ? { kind: "bind", label: "Bind to a workflow" }
        : { kind: "setup-provider", label: "Set up capability" };
  }
}

/**
 * Build a capability cockpit view-model for one lane.
 *
 * @param {object}   args
 * @param {string}   args.lane            e.g. "deploy" | "workspace-data"
 * @param {string}   args.title           cockpit title (e.g. "Deploy Cockpit")
 * @param {string}   args.actionVerb      the ready-state CTA (e.g. "Trigger deploy" | "Run query")
 * @param {object}   args.workspaceConfig
 * @param {string[]} [args.configuredEnvRefs]
 * @param {Array}    [args.receipts]
 * @returns {object} view-model (counts + filters + attention + capabilityCards)
 */
export function deriveCapabilityCockpit({ lane, title, actionVerb = "Run capability", workspaceConfig, configuredEnvRefs = [], receipts = [] } = {}) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const installedProducts = detectLaneProducts(workspaceConfig, lane);
  const hasCapability = installedProducts.some((p) => p.verified);
  const integrationIds = new Set(installedProducts.map((p) => p.integrationId));

  const cards = [];
  objects.forEach((object) => {
    if (clean(object?.objectType) !== "sandbox-environment") return;
    const objectId = clean(object?.id);
    const objectLabel = clean(object?.label || object?.name) || objectId;
    (Array.isArray(object.rows) ? object.rows : []).forEach((row, index) => {
      const name = clean(row?.Name);
      if (!name) return;
      const boundNodes = capabilityNodesForRow(row, integrationIds);
      if (!boundNodes.length) return; // only rows that USE this capability appear
      // Reuse the existing causation driver — it already gates api-registry-call
      // nodes on server-side creds + no-secret-leak + resolvable registry row.
      const readiness = scanServerlessReadiness({ row, workspaceConfig, configuredEnvRefs, phase: "pre-bind" });
      const lastRunStatus = clean(row?.lastCapabilityRunStatus || row?.lastScheduledRunStatus);
      const ran = Boolean(lastRunStatus);
      let state = "bindable";
      if (!readiness.ok) state = "blocked";
      else if (ran) state = "ran";
      else state = "ready";
      const boundIntegrationId = clean(boundNodes[0]?.config?.registryId || boundNodes[0]?.config?.integrationId);
      cards.push({
        cardId: `${objectId}::${clean(row?.id) || name}::${index}`,
        objectId,
        objectLabel,
        name,
        lane,
        state,
        filterBucket: state === "ran" ? "ready" : state,
        integrationId: boundIntegrationId,
        product: installedProducts.find((p) => p.integrationId === boundIntegrationId)?.label || boundIntegrationId,
        nodeCount: boundNodes.length,
        lastRunStatus,
        readiness: {
          ok: readiness.ok,
          status: readiness.status,
          deltaTags: readiness.deltaTags || [],
          blockingNodes: readiness.blockingNodes || [],
          helperActions: (readiness.blockingNodes || []).map((n) => n.helperAction).filter(Boolean),
        },
        nextAction: nextActionForCapabilityCard({ state, hasCapability, actionVerb }),
        artifact: { surface: "workflow-canvas", objectId, name },
      });
    });
  });

  const countOf = (s) => cards.filter((c) => c.state === s).length;
  const counts = {
    total: cards.length,
    ready: countOf("ready") + countOf("ran"),
    blocked: countOf("blocked"),
    ran: countOf("ran"),
    installedProducts: installedProducts.filter((p) => p.verified).length,
  };

  const filters = [
    { id: "all", label: "All", count: cards.length },
    { id: "ready", label: "Ready", count: counts.ready },
    { id: "blocked", label: "Blocked", count: counts.blocked },
  ].filter((f) => f.id === "all" || f.count > 0);

  // Highest-value next move: unblock first, then run a ready one.
  const ATTENTION = ["blocked", "ready"];
  let attention = null;
  for (const s of ATTENTION) {
    const hit = cards.find((c) => c.state === s);
    if (hit) { attention = hit; break; }
  }

  const safeReceipts = Array.isArray(receipts) ? receipts : [];
  const blockedAttempts = safeReceipts.filter((r) => r && r.outcomeStatus === "blocked").length;

  return {
    title: title || `${lane} Cockpit`,
    lane,
    capabilitySetupState: hasCapability ? "installed" : "none",
    installedProducts,
    hasCapability,
    capabilityCards: cards,
    filters,
    defaultFilter: "all",
    attention,
    counts,
    governance: { blockedAttempts },
    setupRoute: "/settings/add-ons",
    generatedFromReceipts: safeReceipts.length > 0,
  };
}

export default deriveCapabilityCockpit;
