/**
 * Data cockpit projection — the governed "/data" oversight lens over external
 * database sync (GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1, the same primitive
 * class as the CEO and Schedule cockpits).
 *
 * PURE deriver — no React, no fetch, no fs, no config writes, no CSS. It takes
 * the workspace config (+ the already-resolved `configuredEnvRefs` env-status
 * signal, never secret values) and emits a low-entropy view-model the
 * DataCockpit component renders. It introduces NO new governed object, NO new
 * API, NO new PATCH field, and NO second capability check: database capability
 * comes from the existing API Registry / marketplace rows on the
 * "workspace-data" execution lane, and sync truth is the object-level stamps
 * the governed /data route writes (lastSyncedAt / lastSyncStatus / proof).
 *
 *   workspace data cockpit =
 *     pure inventory + lane-derived capability + governed action buttons
 *     over the existing add-ons /data route
 *
 * Every "action" on a card is a hand-off to an EXISTING governed route
 * (install-object/pull/push/bind/unbind) or the Add-ons marketplace setup
 * path — the cockpit never syncs, never mutates config, never PATCHes a row.
 * Provider-agnostic by construction: any provider whose product declares
 * executionLane "workspace-data" appears here with zero cockpit changes.
 */

import { listExternalSyncObjects } from "./workspace-external-sync.js";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function isApiRegistryObject(object) {
  const objectType = clean(object?.objectType);
  const id = clean(object?.id || object?.objectId);
  return objectType === "api-registry" || id === "api-registry";
}

const WORKSPACE_DATA_LANE = "workspace-data";
// First-class default provider integration id — see workspace-add-ons.js. Kept
// as a known slug ONLY to label the Supabase setup shortcut; everything else
// is provider-agnostic via executionLane + externalRegistryId.
const SUPABASE_POSTGREST_INTEGRATION_ID = "supabase-postgrest";

/** Detect every database-capable product from existing governed state. */
function detectDataProducts(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const products = [];
  for (const object of objects) {
    if (!isApiRegistryObject(object)) continue;
    for (const row of Array.isArray(object.rows) ? object.rows : []) {
      if (clean(row?.executionLane) !== WORKSPACE_DATA_LANE) continue;
      const integrationId = clean(row?.integrationId);
      if (!integrationId) continue;
      const verified = clean(row?.syncStatus) === "verified"
        && Boolean(clean(row?.syncProof))
        && Boolean(clean(row?.syncCheckedAt));
      const isSupabase = integrationId === SUPABASE_POSTGREST_INTEGRATION_ID || clean(row?.productId) === "supabase-postgrest";
      products.push({
        integrationId,
        label: clean(row?.Name) || integrationId,
        productId: clean(row?.productId),
        providerId: clean(row?.providerId) || (isSupabase ? "supabase" : ""),
        verified,
        provider: isSupabase ? "Supabase" : "Custom",
        custom: !isSupabase,
        requiredEnv: clean(row?.requiredEnv),
        missingEnv: clean(row?.missingEnv),
      });
    }
  }
  return products;
}

// One report state per synced object — env problems outrank staleness so a
// binding that cannot execute is never shown as merely "stale".
function classifyState({ verifiedProduct, hasStamp, statusStamp }) {
  if (!verifiedProduct) return "blocked";
  if (!hasStamp) return "never-synced";
  if (statusStamp === "pulled" || statusStamp === "pushed") return "synced";
  return "never-synced";
}

function nextActionForCard({ state }) {
  switch (state) {
    case "synced":
      return { kind: "pull", label: "Pull latest" };
    case "never-synced":
      return { kind: "pull", label: "Run first sync" };
    case "blocked":
    default:
      return { kind: "setup-provider", label: "Verify database product" };
  }
}

/**
 * Build the data cockpit view-model.
 *
 * @param {object}   args
 * @param {object}   args.workspaceConfig
 * @param {string[]} [args.configuredEnvRefs]  resolved credential ref slugs (env-status)
 * @param {Array}    [args.receipts]           workspace outcome receipts (optional rollup)
 * @returns {object} view-model consumed by DataCockpit.jsx
 */
export function deriveDataCockpit({ workspaceConfig, configuredEnvRefs = [], receipts = [] } = {}) {
  const installedDataProducts = detectDataProducts(workspaceConfig);
  const hasProvider = installedDataProducts.some((product) => product.verified);
  const dataSetupState = hasProvider ? "installed" : "none";
  const envRefs = Array.isArray(configuredEnvRefs) ? configuredEnvRefs.map(clean) : [];

  const cards = listExternalSyncObjects(workspaceConfig).map((object) => {
    const objectId = clean(object.id);
    const registryId = clean(object.externalRegistryId);
    const product = installedDataProducts.find((item) => item.integrationId === registryId) || null;
    const verifiedProduct = Boolean(product?.verified);
    const statusStamp = clean(object.lastSyncStatus);
    const hasStamp = Boolean(clean(object.lastSyncedAt));
    const state = classifyState({ verifiedProduct, hasStamp, statusStamp });
    const missingEnv = clean(product?.missingEnv)
      ? clean(product.missingEnv).split(",").map(clean).filter(Boolean)
      : (product?.requiredEnv || "").split(",").map(clean).filter((key) => key && !envRefs.includes(key));

    const tags = [];
    if (state === "synced") tags.push(statusStamp === "pushed" ? "Pushed" : "Pulled");
    if (state === "never-synced") tags.push("Never synced");
    if (state === "blocked") tags.push("Blocked");
    if (product) tags.push(product.provider);
    const conflictCount = /(\d+) field conflicts/.exec(clean(object.lastSyncSummary))?.[1];
    if (conflictCount) tags.push(`${conflictCount} conflicts`);

    return {
      cardId: objectId,
      objectId,
      name: clean(object.label || object.name) || objectId,
      externalTable: clean(object.externalTable),
      correlationKey: clean(object.externalCorrelationKey) || "id",
      registryId,
      providerId: product?.providerId || "",
      provider: product?.provider || "Custom",
      rowCount: Array.isArray(object.rows) ? object.rows.length : 0,
      state,
      filterBucket: state,
      lastSyncedAt: clean(object.lastSyncedAt),
      lastSyncStatus: statusStamp,
      lastSyncSummary: clean(object.lastSyncSummary),
      lastSyncReceiptId: clean(object.lastSyncReceiptId),
      missingEnv,
      tags,
      custom: product ? product.custom : true,
      nextAction: nextActionForCard({ state }),
      // The governed artifact the "Open" affordance hands off to (Data Model).
      artifact: { surface: "data-model", objectId },
    };
  });

  const countOf = (state) => cards.filter((card) => card.state === state).length;
  const counts = {
    total: cards.length,
    synced: countOf("synced"),
    neverSynced: countOf("never-synced"),
    blocked: countOf("blocked"),
    conflicts: cards.filter((card) => card.tags.some((tag) => tag.endsWith("conflicts"))).length,
  };

  const filters = [
    { id: "all", label: "All", count: cards.length },
    { id: "synced", label: "Synced", count: counts.synced },
    { id: "never-synced", label: "Never synced", count: counts.neverSynced },
    { id: "blocked", label: "Blocked", count: counts.blocked },
  ].filter((filter) => filter.id === "all" || filter.count > 0);

  // The single highest-value next move (blocked → never-synced → conflicts).
  let attention = cards.find((card) => card.state === "blocked")
    || cards.find((card) => card.state === "never-synced")
    || cards.find((card) => card.tags.some((tag) => tag.endsWith("conflicts")))
    || null;

  // Objects an operator could bind next (apps registry first — managing the
  // deployed app fleet in an external table is the primary bind target).
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const boundIds = new Set(cards.map((card) => card.objectId));
  const bindableObjects = objects
    .filter((object) => {
      const objectType = clean(object?.objectType);
      return !boundIds.has(clean(object?.id))
        && ["app-surface", "custom", "people", "tasks", "data-source"].includes(objectType);
    })
    .map((object) => ({
      objectId: clean(object.id),
      label: clean(object.label || object.name) || clean(object.id),
      objectType: clean(object.objectType),
      rowCount: Array.isArray(object.rows) ? object.rows.length : 0,
    }))
    .sort((a, b) => (a.objectType === "app-surface" ? -1 : 0) - (b.objectType === "app-surface" ? -1 : 0))
    .slice(0, 50);

  const safeReceipts = Array.isArray(receipts) ? receipts : [];
  const syncReceipts = safeReceipts.filter((receipt) => receipt && receipt.kind === "workspace-add-on-data-sync");
  const blockedAttempts = syncReceipts.filter((receipt) => receipt.outcomeStatus === "blocked").length;

  return {
    title: "Data Cockpit",
    dataSetupState,
    installedDataProducts,
    defaultProvider: installedDataProducts.find((product) => product.verified) || installedDataProducts[0] || null,
    syncCards: cards,
    bindableObjects,
    filters,
    defaultFilter: "all",
    attention,
    counts,
    governance: { blockedAttempts, syncReceipts: syncReceipts.length },
    setupRoute: "/settings/add-ons",
    generatedFromReceipts: syncReceipts.length > 0,
  };
}

export default deriveDataCockpit;
