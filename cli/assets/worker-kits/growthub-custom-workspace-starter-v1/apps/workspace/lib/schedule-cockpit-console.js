/**
 * Schedule cockpit projection — the governed "/schedule" oversight lens over the
 * existing workflow fleet (GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1, the same
 * primitive class as the CEO cockpit).
 *
 * PURE deriver — no React, no fetch, no fs, no config writes, no CSS. It takes
 * the workspace config (+ the already-resolved `configuredEnvRefs` env-status
 * signal, never secret values) and emits a low-entropy view-model the
 * ScheduleCockpit component renders. It introduces NO new governed object, NO
 * new API, NO new PATCH field, and NO second compatibility check: scheduler
 * capability comes from the existing API Registry / marketplace rows, and
 * readiness is the existing `scanServerlessReadiness` causation driver.
 *
 *   workspace schedule cockpit =
 *     pure inventory + causation-derived readiness + governed action buttons
 *     over the existing schedule routes
 *
 * Every "action" on a card is a hand-off to an EXISTING governed schedule route
 * (install/pause/resume/readiness/uninstall) or the Add-ons marketplace setup
 * path — the cockpit never schedules, never mutates config, never PATCHes a row.
 */

import { parseOrchestrationGraph } from "./orchestration-graph.js";
import { scanServerlessReadiness, READINESS_DELTA_TAGS } from "./serverless-readiness.js";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function truthy(value) {
  return ["true", "1", "on", "yes"].includes(clean(value).toLowerCase()) || value === true;
}

function isApiRegistryObject(object) {
  const objectType = clean(object?.objectType);
  const id = clean(object?.id || object?.objectId);
  return objectType === "api-registry" || id === "api-registry";
}

const SERVERLESS_SCHEDULER_LANE = "serverless-scheduler";
// First-class default provider integration id — see workspace-add-ons.js. Kept
// as a known slug ONLY to label/route the Upstash setup shortcut; everything
// else is provider-agnostic via executionLane + schedulerRegistryId.
const UPSTASH_QSTASH_INTEGRATION_ID = "upstash-qstash-workflow";

/** Detect every scheduler-capable product/provider from existing governed state. */
function detectSchedulerProducts(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const products = [];
  for (const object of objects) {
    if (!isApiRegistryObject(object)) continue;
    for (const row of Array.isArray(object.rows) ? object.rows : []) {
      if (clean(row?.executionLane) !== SERVERLESS_SCHEDULER_LANE) continue;
      const integrationId = clean(row?.integrationId);
      if (!integrationId) continue;
      const verified = clean(row?.syncStatus) === "verified";
      const isUpstash = integrationId === UPSTASH_QSTASH_INTEGRATION_ID || clean(row?.productId) === "upstash-qstash";
      products.push({
        integrationId,
        label: clean(row?.Name) || integrationId,
        productId: clean(row?.productId),
        providerId: clean(row?.providerId) || (isUpstash ? "upstash" : ""),
        verified,
        provider: isUpstash ? "QStash" : "Custom",
        custom: !isUpstash,
        region: clean(row?.region),
      });
    }
  }
  return products;
}

/** Resolve the api-registry-call node's registry id (the data dependency). */
function resolveDependencyRegistryId(row) {
  const graph = parseOrchestrationGraph(row?.orchestrationGraph || row?.orchestrationConfig);
  const apiNode = (graph?.nodes || []).find((n) => n?.type === "api-registry-call");
  return clean(apiNode?.config?.registryId || apiNode?.config?.integrationId);
}

// Friendly chip labels for the canonical readiness delta tags (no new vocab).
const DELTA_TAG_CHIP = {
  [READINESS_DELTA_TAGS.RUNTIME_LOCALITY]: "Runtime locality",
  [READINESS_DELTA_TAGS.LOCAL_AGENT_UPGRADE_REQUIRED]: "Local agent upgrade required",
  [READINESS_DELTA_TAGS.MISSING_SERVER_SECRET]: "Missing secret",
  [READINESS_DELTA_TAGS.API_REGISTRY_ENV]: "API Registry env",
  [READINESS_DELTA_TAGS.INPUT_CONTRACT]: "Input contract",
  [READINESS_DELTA_TAGS.SCHEDULED_INPUT_UNMAPPED]: "Scheduled input unmapped",
  [READINESS_DELTA_TAGS.DOWNSTREAM_NODE_INCOMPATIBLE]: "Downstream incompatible",
  [READINESS_DELTA_TAGS.PUBLISHED_GRAPH_REQUIRED]: "Published graph required",
  [READINESS_DELTA_TAGS.SERVERLESS_SCHEDULE]: "Serverless schedule",
};

// One report state per workflow row — drift takes priority over scheduled so a
// continuing contract that no longer proves out is never shown as healthy.
function classifyState({ serverless, hasSchedule, paused, readinessOk }) {
  if (serverless && hasSchedule) {
    if (paused) return "paused";
    if (!readinessOk) return "drifted";
    return "scheduled";
  }
  if (!readinessOk) return "blocked";
  return "ready"; // local + clean → ready to schedule (provider-gated in nextAction)
}

const STATE_FILTER = {
  scheduled: "scheduled",
  paused: "paused",
  ready: "ready",
  blocked: "blocked",
  drifted: "blocked",
};

function nextActionForCard({ state, hasProvider, custom }) {
  switch (state) {
    case "scheduled":
      return { kind: "manage", label: "Manage schedule" };
    case "paused":
      return { kind: "resume", label: "Resume schedule" };
    case "drifted":
      return { kind: "readiness", label: "Run readiness scan" };
    case "blocked":
      return { kind: "readiness", label: "Resolve & rescan" };
    case "ready":
    default:
      return hasProvider
        ? { kind: "schedule", label: "Upgrade to Serverless Schedule" }
        : { kind: "setup-provider", label: "Set up scheduler" };
  }
}

/**
 * Build the schedule cockpit view-model.
 *
 * @param {object}   args
 * @param {object}   args.workspaceConfig
 * @param {string[]} [args.configuredEnvRefs]  resolved credential ref slugs (env-status)
 * @param {Array}    [args.receipts]           workspace outcome receipts (optional rollup)
 * @returns {object} view-model consumed by ScheduleCockpit.jsx
 */
export function deriveScheduleCockpit({ workspaceConfig, configuredEnvRefs = [], receipts = [] } = {}) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const installedSchedulerProducts = detectSchedulerProducts(workspaceConfig);
  const hasProvider = installedSchedulerProducts.length > 0;
  const schedulerSetupState = hasProvider ? "installed" : "none";

  const cards = [];
  objects.forEach((object) => {
    if (clean(object?.objectType) !== "sandbox-environment") return;
    const objectId = clean(object?.id);
    const objectLabel = clean(object?.label || object?.name) || objectId;
    (Array.isArray(object.rows) ? object.rows : []).forEach((row, index) => {
      const name = clean(row?.Name);
      if (!name) return;
      const serverless = clean(row?.runLocality).toLowerCase() === "serverless";
      const scheduleId = clean(row?.scheduleId);
      const hasSchedule = Boolean(scheduleId);
      const paused = truthy(row?.schedulerPaused);
      const phase = serverless && hasSchedule ? "bound" : "pre-bind";
      const readiness = scanServerlessReadiness({
        row,
        workspaceConfig,
        configuredEnvRefs,
        phase,
        expected: {
          scheduleId,
          schedulerRegistryId: clean(row?.schedulerRegistryId),
          providerId: clean(row?.schedulerProviderId),
          productId: clean(row?.schedulerProductId),
        },
      });
      const state = classifyState({ serverless, hasSchedule, paused, readinessOk: readiness.ok });
      const dependencyRegistryId = resolveDependencyRegistryId(row);
      const providerId = clean(row?.schedulerProviderId);
      const productId = clean(row?.schedulerProductId);
      const product = installedSchedulerProducts.find(
        (p) => p.integrationId === clean(row?.schedulerRegistryId),
      ) || null;
      const custom = product ? product.custom : false;
      const lastRunStatus = clean(row?.lastScheduledRunStatus);
      const lastRunFailed = clean(row?.lastScheduledRunFailureReason) !== "" || (lastRunStatus && !lastRunStatus.startsWith("2"));

      // Compact, scannable tags — state + readiness deltas + provider + run signal.
      const tags = [];
      if (state === "scheduled") tags.push("Scheduled");
      if (state === "paused") tags.push("Paused");
      if (state === "ready") tags.push("Ready to schedule");
      if (state === "blocked") tags.push("Blocked");
      if (state === "drifted") tags.push("Serverless drift");
      if (!serverless && state !== "blocked") tags.push("Local-only");
      for (const tag of readiness.deltaTags || []) {
        const chip = DELTA_TAG_CHIP[tag];
        if (chip && !tags.includes(chip)) tags.push(chip);
      }
      if (product) tags.push(product.provider);
      else if (serverless && hasSchedule) tags.push("Custom scheduler");
      if (serverless && hasSchedule && lastRunFailed) tags.push("Last run failed");
      if (serverless && hasSchedule && !lastRunStatus) tags.push("No receipt yet");

      cards.push({
        cardId: `${objectId}::${clean(row?.id) || name}::${index}`,
        objectId,
        objectLabel,
        name,
        state,
        filterBucket: STATE_FILTER[state] || state,
        locality: serverless ? "serverless" : "local",
        provider: product?.provider || (serverless && hasSchedule ? "Custom" : ""),
        providerId,
        productId,
        schedulerRegistryId: clean(row?.schedulerRegistryId),
        dependencyRegistryId,
        scheduleId,
        cron: clean(row?.schedulerCron),
        region: clean(row?.schedulerRegion) || product?.region || "",
        paused,
        lastSync: clean(row?.lastScheduledRunAt) || clean(row?.schedulerInstalledAt),
        lastRunStatus,
        lastRunFailed: Boolean(serverless && hasSchedule && lastRunFailed),
        readiness: {
          ok: readiness.ok,
          status: readiness.status,
          deltaTags: readiness.deltaTags || [],
          blockingNodes: readiness.blockingNodes || [],
          warnings: readiness.warnings || [],
          helperActions: (readiness.blockingNodes || []).map((n) => n.helperAction).filter(Boolean),
        },
        tags,
        custom,
        nextAction: nextActionForCard({ state, hasProvider, custom }),
        // The governed artifact the "Open" affordance hands off to (the canvas).
        artifact: { surface: "workflow-canvas", objectId, name },
      });
    });
  });

  const countOf = (s) => cards.filter((c) => c.state === s).length;
  const counts = {
    total: cards.length,
    scheduled: countOf("scheduled"),
    paused: countOf("paused"),
    ready: countOf("ready"),
    blocked: countOf("blocked"),
    drifted: countOf("drifted"),
    localOnly: cards.filter((c) => c.locality === "local").length,
    missingSecret: cards.filter((c) => (c.readiness.deltaTags || []).includes(READINESS_DELTA_TAGS.MISSING_SERVER_SECRET)).length,
  };

  // Filters the sidecar exposes — only those with members (All always present).
  const filters = [
    { id: "all", label: "All", count: cards.length },
    { id: "scheduled", label: "Scheduled", count: counts.scheduled + counts.paused },
    { id: "ready", label: "Ready", count: counts.ready },
    { id: "blocked", label: "Blocked", count: counts.blocked + counts.drifted },
    { id: "local", label: "Local-only", count: counts.localOnly },
    { id: "missing-secret", label: "Missing secrets", count: counts.missingSecret },
    { id: "qstash", label: "Provider: QStash", count: cards.filter((c) => c.provider === "QStash").length },
    { id: "custom", label: "Provider: Custom", count: cards.filter((c) => c.provider === "Custom").length },
  ].filter((f) => f.id === "all" || f.count > 0);

  // The single highest-value next move (drift → blocked → ready), or null.
  const ATTENTION = ["drifted", "blocked", "ready"];
  let attention = null;
  for (const s of ATTENTION) {
    const hit = cards.find((c) => c.state === s);
    if (hit) { attention = hit; break; }
  }

  const safeReceipts = Array.isArray(receipts) ? receipts : [];
  const blockedAttempts = safeReceipts.filter((r) => r && r.outcomeStatus === "blocked").length;

  return {
    title: "Schedule Cockpit",
    schedulerSetupState,
    installedSchedulerProducts,
    defaultProvider: installedSchedulerProducts[0] || null,
    workflowCards: cards,
    filters,
    defaultFilter: "all",
    attention,
    counts,
    governance: { blockedAttempts },
    setupRoute: "/settings/add-ons",
    generatedFromReceipts: safeReceipts.length > 0,
  };
}

export default deriveScheduleCockpit;
