import { readEnvVar } from "./server-secrets.js";

const UPSTASH_QSTASH_INTEGRATION_ID = "upstash-qstash-workflow";
const UPSTASH_AUTH_REF = "QSTASH";
const UPSTASH_PROVIDER_INTEGRATION_ID = "upstash-provider";
const UPSTASH_REGION_OPTIONS = [
  { id: "us-east-1", label: "Washington, D.C., USA (East)", baseUrl: "https://qstash-us-east-1.upstash.io" },
  { id: "us-west-1", label: "San Francisco, USA (West)", baseUrl: "https://qstash-us-west-1.upstash.io" },
  { id: "eu-west-1", label: "Frankfurt, EU (Central)", baseUrl: "https://qstash-eu-west-1.upstash.io" },
];
const UPSTASH_PRODUCTS = [
  {
    productId: "upstash-qstash",
    integrationId: UPSTASH_QSTASH_INTEGRATION_ID,
    authRef: UPSTASH_AUTH_REF,
    label: "Upstash QStash/Workflow",
    shortLabel: "QStash/Workflow",
    icon: "Q",
    iconClass: "is-upstash",
    iconSrc: "/integrations/upstash/qstash.png",
    connectorKind: "upstash-qstash",
    endpoint: "/v2/publish/<workspace-sandbox-run-url>",
    method: "POST",
    description: "QStash-backed scheduler for Growthub serverless workflow runs. Secrets stay in env; this row stores only refs and routing metadata.",
    subtitle: "Messaging for the Serverless",
    plans: "Free, Pay as You Go, Pro Plans",
    entityTypes: "workflow-run,scheduler",
    capabilities: "scheduler,workflow,queue",
    executionLane: "serverless-scheduler",
    // QSTASH_URL is optional: the schedule API is region-based, so the adapter
    // derives https://qstash-{region}.upstash.io from the selected region when
    // QSTASH_URL is absent. Only the token is truly required.
    requiredEnv: ["QSTASH_TOKEN"],
    optionalEnv: ["QSTASH_URL", "QSTASH_CURRENT_SIGNING_KEY", "QSTASH_NEXT_SIGNING_KEY"],
    consoleUrl: "https://console.upstash.com/qstash",
    probe: {
      baseUrlEnv: "QSTASH_URL",
      tokenEnv: "QSTASH_TOKEN",
      paths: ["/v2/schedules", "/v2/dlq"],
      fallbackRegionBaseUrl: true,
    },
    regionOptions: UPSTASH_REGION_OPTIONS,
  },
  {
    productId: "upstash-redis",
    integrationId: "upstash-redis",
    authRef: "UPSTASH_REDIS",
    label: "Upstash for Redis",
    shortLabel: "Redis",
    icon: "R",
    iconClass: "is-redis",
    iconSrc: "/integrations/upstash/redis.png",
    connectorKind: "upstash-redis",
    endpoint: "/ping",
    method: "GET",
    description: "Upstash Redis REST database connection registered for governed workspace add-ons.",
    subtitle: "Redis Compatible Database",
    plans: "Free, Pay as You Go, Fixed",
    entityTypes: "cache,kv,redis",
    capabilities: "kv,cache,rate-limit",
    executionLane: "workspace-data",
    requiredEnv: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    optionalEnv: [],
    consoleUrl: "https://console.upstash.com/redis",
    probe: {
      baseUrlEnv: "UPSTASH_REDIS_REST_URL",
      tokenEnv: "UPSTASH_REDIS_REST_TOKEN",
      paths: ["/ping"],
    },
    regionOptions: UPSTASH_REGION_OPTIONS,
  },
  {
    productId: "upstash-search",
    integrationId: "upstash-search",
    authRef: "UPSTASH_SEARCH",
    label: "Upstash Search",
    shortLabel: "Search",
    icon: "S",
    iconClass: "is-search",
    iconSrc: "/integrations/upstash/search.png",
    connectorKind: "upstash-search",
    endpoint: "/stats",
    method: "GET",
    description: "Upstash Search REST connection registered for workspace retrieval/search add-ons.",
    subtitle: "Serverless AI search at scale",
    plans: "Free, Pay as You Go",
    entityTypes: "search,index,documents",
    capabilities: "search,indexing,retrieval",
    executionLane: "workspace-retrieval",
    requiredEnv: ["UPSTASH_SEARCH_REST_URL", "UPSTASH_SEARCH_REST_TOKEN"],
    optionalEnv: [],
    consoleUrl: "https://console.upstash.com/search",
    probe: {
      baseUrlEnv: "UPSTASH_SEARCH_REST_URL",
      tokenEnv: "UPSTASH_SEARCH_REST_TOKEN",
      paths: ["/stats", "/info"],
    },
    regionOptions: UPSTASH_REGION_OPTIONS,
  },
  {
    productId: "upstash-vector",
    integrationId: "upstash-vector",
    authRef: "UPSTASH_VECTOR",
    label: "Upstash Vector",
    shortLabel: "Vector",
    icon: "V",
    iconClass: "is-vector",
    iconSrc: "/integrations/upstash/vector.png",
    connectorKind: "upstash-vector",
    endpoint: "/info",
    method: "GET",
    description: "Upstash Vector REST index registered for governed workspace retrieval add-ons.",
    subtitle: "Serverless Vector Database",
    plans: "Free, Pay as You Go, Fixed",
    entityTypes: "vector,index,embedding",
    capabilities: "vector-search,semantic-retrieval",
    executionLane: "workspace-retrieval",
    requiredEnv: ["UPSTASH_VECTOR_REST_URL", "UPSTASH_VECTOR_REST_TOKEN"],
    optionalEnv: [],
    consoleUrl: "https://console.upstash.com/vector",
    probe: {
      baseUrlEnv: "UPSTASH_VECTOR_REST_URL",
      tokenEnv: "UPSTASH_VECTOR_REST_TOKEN",
      paths: ["/info"],
    },
    regionOptions: UPSTASH_REGION_OPTIONS,
  },
];
const MARKETPLACE_PROVIDERS = [
  {
    providerId: "upstash",
    integrationId: UPSTASH_PROVIDER_INTEGRATION_ID,
    authRef: "UPSTASH",
    label: "Upstash",
    developer: "Upstash",
    iconSrc: "/integrations/upstash/provider.png",
    baseUrl: "https://api.upstash.com",
    endpoint: "/v2",
    method: "GET",
    // Provider/account-management lane (Developer API): HTTP Basic EMAIL:API_KEY.
    // Available to native Upstash accounts only; absence ⇒ account-linked, not verified.
    accountProbe: {
      emailEnv: "UPSTASH_EMAIL",
      keyEnv: "UPSTASH_API_KEY",
      paths: ["/v2/redis/databases", "/v2/teams"],
    },
    consoleUrl: "https://console.upstash.com/",
    supportUrl: "https://upstash.com/support",
    websiteUrl: "https://upstash.com",
    docsUrl: "https://upstash.com/docs",
    termsUrl: "https://upstash.com/terms",
    privacyUrl: "https://upstash.com/privacy",
    providerProductsLabel: "Serverless DB (Redis, Vector, Queue, Search)",
    products: UPSTASH_PRODUCTS,
    entityTypes: "provider,marketplace,account",
    connectorKind: "upstash-provider",
    capabilities: "provider-account,env-provisioning,marketplace-products",
    executionLane: "workspace-provider",
    description: "Provider-level Upstash account binding for workspace add-ons. Product rows are installed after this account is verified.",
  },
];

function apiRegistryColumns(existing = []) {
  return Array.from(new Set([
    "Name",
    "integrationId",
    "authRef",
    "baseUrl",
    "endpoint",
    "method",
    "status",
    "lastTested",
    "lastResponse",
    "entityTypes",
    "description",
    "connectorKind",
    "resolverTemplateId",
    "schemaVersion",
    "capabilities",
    "executionLane",
    "region",
    "productId",
    "plan",
    "syncStatus",
    "syncCheckedAt",
    "syncProof",
    "missingEnv",
    ...existing,
  ]));
}

// NOTE: per-workflow schedule state (scheduleId, cron, callback URLs, last
// scheduled-run proof) is OWNED BY THE WORKFLOW ROW (sandbox-environment), NOT
// this provider capability row — see `withWorkflowServerlessBind`. The API
// Registry row is a pure capability row: verified provider/product, token/probe
// proof (syncStatus / syncProof / syncCheckedAt). It intentionally carries no
// per-schedule columns so two scheduled workflows never collide on one row.

const SERVERLESS_LOCAL_ADAPTERS = ["local-agent-host", "local-intelligence"];

function parseGraphValue(value) {
  if (value && typeof value === "object") return value;
  if (typeof value === "string" && value.trim()) {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Sync the orchestration config's TRIGGER node (and result node) to the
 * serverless-scheduler binding so the graph's own logic matches the schedule
 * that drives it. The trigger node (a `data-trigger`, else the entry `input`
 * node) records who invokes the run; the `tool-result` node keeps
 * `writeLastResponse` on so the scheduled run's last response is recorded on
 * the row. Preserves the stored value's shape (string vs object). `clear:true`
 * reverts the trigger to manual on uninstall.
 */
const CANONICAL_TRIGGER_NODE_ID = "schedule-trigger";

function scheduleTriggerConfig(meta) {
  return {
    trigger: "serverless-scheduler",
    triggerKind: "serverless-scheduler",
    schedule: {
      schedulerRegistryId: meta.schedulerRegistryId || "",
      scheduleId: meta.scheduleId || "",
      cron: meta.cron || "",
      providerId: meta.schedulerProviderId || "",
      productId: meta.schedulerProductId || "",
      destinationUrl: meta.destinationUrl || "",
      callbackUrl: meta.callbackUrl || "",
    },
    enabled: true,
  };
}

function syncTriggerNodeForSchedule(value, meta = {}, { clear = false } = {}) {
  const graph = parseGraphValue(value);
  if (!graph || !Array.isArray(graph.nodes) || !graph.nodes.length) {
    return { value, triggerNodeId: null, changed: false };
  }
  // Pick the trigger node deterministically: a `data-trigger`, else the entry
  // `input` node. NEVER fall back to mutating an arbitrary node — if neither
  // exists, create a canonical `data-trigger` node instead.
  const byType = graph.nodes.findIndex((n) => n?.type === "data-trigger");
  const byInput = byType >= 0 ? -1 : graph.nodes.findIndex((n) => n?.type === "input" || n?.id === "input");
  const triggerIndex = byType >= 0 ? byType : byInput;

  if (triggerIndex < 0) {
    // No canonical trigger/input node — create one rather than mutate node 0.
    if (clear) return { value, triggerNodeId: null, changed: false };
    const triggerNode = {
      id: CANONICAL_TRIGGER_NODE_ID,
      type: "data-trigger",
      label: "Schedule trigger",
      subtitle: "Serverless scheduler",
      config: { action: "schedule-fired", ...scheduleTriggerConfig(meta) },
    };
    const nextNodes = graph.nodes.map((node) =>
      node?.type === "tool-result" ? { ...node, config: { ...(node.config || {}), writeLastResponse: true } } : node,
    );
    const nextGraph = { ...graph, nodes: [triggerNode, ...nextNodes] };
    return {
      value: typeof value === "string" ? JSON.stringify(nextGraph) : nextGraph,
      triggerNodeId: CANONICAL_TRIGGER_NODE_ID,
      changed: true,
    };
  }

  const triggerNodeId = String(graph.nodes[triggerIndex]?.id || "").trim() || `node-${triggerIndex}`;
  const nextNodes = graph.nodes.map((node, index) => {
    if (index === triggerIndex) {
      const config = { ...(node.config || {}) };
      if (clear) {
        config.trigger = "manual";
        config.triggerKind = "manual";
        delete config.schedule;
        delete config.enabled;
      } else {
        Object.assign(config, scheduleTriggerConfig(meta));
      }
      return { ...node, config };
    }
    if (node?.type === "tool-result") {
      return { ...node, config: { ...(node.config || {}), writeLastResponse: true } };
    }
    return node;
  });
  const nextGraph = { ...graph, nodes: nextNodes };
  return {
    value: typeof value === "string" ? JSON.stringify(nextGraph) : nextGraph,
    triggerNodeId,
    changed: true,
  };
}

/** Resolve the runtime-live graph field (precedence matches the runner). */
function liveGraphField(row) {
  return parseGraphValue(row?.orchestrationGraph) ? "orchestrationGraph" : "orchestrationConfig";
}

/** Read the schedule binding recorded on a graph's trigger node (or null). */
function readTriggerScheduleBinding(value) {
  const graph = parseGraphValue(value);
  if (!graph || !Array.isArray(graph.nodes)) return null;
  const node =
    graph.nodes.find((n) => n?.type === "data-trigger") ||
    graph.nodes.find((n) => n?.type === "input" || n?.id === "input");
  const schedule = node?.config?.schedule;
  if (!schedule || node?.config?.trigger !== "serverless-scheduler") return null;
  return {
    triggerNodeId: String(node.id || "").trim(),
    triggerKind: String(node.config.triggerKind || node.config.trigger || "").trim(),
    scheduleId: String(schedule.scheduleId || "").trim(),
    schedulerRegistryId: String(schedule.schedulerRegistryId || "").trim(),
    providerId: String(schedule.providerId || "").trim(),
    productId: String(schedule.productId || "").trim(),
    enabled: node.config.enabled !== false,
  };
}

const SANDBOX_SCHEDULE_CLEAR_PATCH = {
  scheduleId: "",
  schedulerProviderId: "",
  schedulerProductId: "",
  schedulerRegion: "",
  schedulerCron: "",
  schedulerDestination: "",
  schedulerCallbackUrl: "",
  schedulerFailureCallbackUrl: "",
  schedulerInstalledAt: "",
};

/**
 * Bind a sandbox/workflow ROW to a serverless schedule in a config object
 * (pure). Schedule state lives on the OWNING ROW (not the global provider row),
 * so multiple workflows can each own their own schedule. In ONE write it:
 *   - flips runLocality=serverless + schedulerRegistryId (+ adapter normalize),
 *   - records the row-level schedule proof (scheduleId, cron, destination, …),
 *   - syncs the orchestration trigger node so the graph logic matches.
 * `clear:true` reverts the row to local + manual trigger (uninstall path).
 * Returns { config, bound }.
 */
function withWorkflowServerlessBind(workspaceConfig, params = {}) {
  const { objectId, rowId, schedulerRegistryId, clear = false } = params;
  const targetObject = String(objectId || "").trim();
  const targetRow = String(rowId || "").trim();
  if (!targetObject || !targetRow) return { config: workspaceConfig, bound: false };
  if (!clear && !String(schedulerRegistryId || "").trim()) return { config: workspaceConfig, bound: false };
  const dm = workspaceConfig?.dataModel && typeof workspaceConfig.dataModel === "object" ? workspaceConfig.dataModel : {};
  const objects = Array.isArray(dm.objects) ? dm.objects : [];
  let bound = false;
  let liveField = "orchestrationConfig";
  let triggerNodeId = null;
  const nextObjects = objects.map((object) => {
    if (object?.id !== targetObject || object?.objectType !== "sandbox-environment") return object;
    const rows = Array.isArray(object.rows) ? object.rows : [];
    const nextRows = rows.map((row) => {
      if (String(row?.Name || "").trim() !== targetRow) return row;
      bound = true;
      const adapterId = String(row?.adapter || "").trim();
      // Mutate the RUNTIME-LIVE graph field (precedence matches the runner:
      // orchestrationGraph, else orchestrationConfig) — never the draft. We keep
      // both live fields consistent when both are present.
      liveField = liveGraphField(row);
      const triggerMeta = {
        schedulerRegistryId: String(schedulerRegistryId || "").trim(),
        scheduleId: params.scheduleId || "",
        cron: params.cron || "",
        schedulerProviderId: params.schedulerProviderId || "",
        schedulerProductId: params.schedulerProductId || "",
        destinationUrl: params.destinationUrl || "",
        callbackUrl: params.callbackUrl || "",
      };
      const graphSync = syncTriggerNodeForSchedule(row.orchestrationGraph, triggerMeta, { clear });
      const configSync = syncTriggerNodeForSchedule(row.orchestrationConfig, triggerMeta, { clear });
      triggerNodeId = (liveField === "orchestrationGraph" ? graphSync.triggerNodeId : configSync.triggerNodeId)
        || configSync.triggerNodeId || graphSync.triggerNodeId;
      const base = { ...row, orchestrationGraph: graphSync.value, orchestrationConfig: configSync.value };
      if (clear) {
        return { ...base, runLocality: "local", ...SANDBOX_SCHEDULE_CLEAR_PATCH };
      }
      return {
        ...base,
        runLocality: "serverless",
        schedulerRegistryId: triggerMeta.schedulerRegistryId,
        adapter: SERVERLESS_LOCAL_ADAPTERS.includes(adapterId) ? "local-process" : (adapterId || "local-process"),
        schedulerProviderId: triggerMeta.schedulerProviderId,
        schedulerProductId: triggerMeta.schedulerProductId,
        schedulerRegion: params.region || "",
        scheduleId: triggerMeta.scheduleId,
        schedulerCron: triggerMeta.cron,
        schedulerDestination: triggerMeta.destinationUrl,
        schedulerCallbackUrl: triggerMeta.callbackUrl,
        schedulerFailureCallbackUrl: params.failureCallbackUrl || "",
        schedulerInstalledAt: params.installedAt || "",
      };
    });
    return { ...object, rows: nextRows };
  });
  if (!bound) return { config: workspaceConfig, bound: false };
  const changedFields = clear
    ? [`${targetObject}.${targetRow}.runLocality`, `${targetObject}.${targetRow}.scheduleId`, `${targetObject}.${targetRow}.${liveField}.${triggerNodeId || "trigger"}`]
    : [`${targetObject}.${targetRow}.runLocality`, `${targetObject}.${targetRow}.scheduleId`, `${targetObject}.${targetRow}.${liveField}.${triggerNodeId || "trigger"}`];
  return { config: { ...workspaceConfig, dataModel: { ...dm, objects: nextObjects } }, bound: true, liveField, triggerNodeId, changedFields };
}

/**
 * Resolve a sandbox/workflow row eligible for serverless scheduling. Used by
 * the schedule route to validate BEFORE any remote provider call so we never
 * create remote infrastructure for a row the workspace cannot bind.
 */
function findEligibleSandboxRow(workspaceConfig, objectId, rowId) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const object = objects.find((o) => o?.id === String(objectId || "").trim());
  if (!object) return { ok: false, status: 404, error: `no object with id ${objectId}` };
  if (object.objectType !== "sandbox-environment") return { ok: false, status: 409, error: `object ${objectId} is not a sandbox-environment` };
  const row = (Array.isArray(object.rows) ? object.rows : []).find((r) => String(r?.Name || "").trim() === String(rowId || "").trim());
  if (!row) return { ok: false, status: 404, error: `no workflow row ${rowId} in object ${objectId}` };
  return { ok: true, object, row };
}

/** Find the sandbox row that owns a given scheduleId (callback → owning row). */
function findSandboxRowByScheduleId(workspaceConfig, scheduleId) {
  const target = String(scheduleId || "").trim();
  if (!target) return null;
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  for (const object of objects) {
    if (object?.objectType !== "sandbox-environment") continue;
    for (const row of Array.isArray(object.rows) ? object.rows : []) {
      if (String(row?.scheduleId || "").trim() === target) return { objectId: object.id, object, row };
    }
  }
  return null;
}

/** Merge scheduled-run proof onto the owning sandbox row (callback sync). */
function withSandboxScheduledRunProof(workspaceConfig, { objectId, rowId, patch } = {}) {
  const targetObject = String(objectId || "").trim();
  const targetRow = String(rowId || "").trim();
  if (!targetObject || !targetRow) return { config: workspaceConfig, found: false };
  const safe = patch && typeof patch === "object" ? patch : {};
  const dm = workspaceConfig?.dataModel && typeof workspaceConfig.dataModel === "object" ? workspaceConfig.dataModel : {};
  const objects = Array.isArray(dm.objects) ? dm.objects : [];
  let found = false;
  const nextObjects = objects.map((object) => {
    if (object?.id !== targetObject || object?.objectType !== "sandbox-environment") return object;
    const rows = Array.isArray(object.rows) ? object.rows : [];
    const nextRows = rows.map((row) => {
      if (String(row?.Name || "").trim() !== targetRow) return row;
      found = true;
      return { ...row, ...safe };
    });
    return { ...object, rows: nextRows };
  });
  if (!found) return { config: workspaceConfig, found: false };
  return { config: { ...workspaceConfig, dataModel: { ...dm, objects: nextObjects } }, found: true };
}

function findRegistryRowByIntegrationId(workspaceConfig, integrationId) {
  const targetId = String(integrationId || "").trim();
  if (!targetId) return null;
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  for (const object of objects) {
    if (object?.objectType !== "api-registry") continue;
    for (const row of Array.isArray(object.rows) ? object.rows : []) {
      if (String(row?.integrationId || "").trim() === targetId) return row;
    }
  }
  return null;
}

/**
 * Per-provider product readiness keyed by providerId — the exact `envSignals`
 * shape the Add-ons settings client consumes (`providerProductReadiness`).
 * Centralizing it here keeps the server page and the client contract in lockstep
 * (regression-tested) so per-product install state actually renders.
 */
function listAllProviderProductReadiness(env = process.env) {
  const out = {};
  for (const provider of MARKETPLACE_PROVIDERS) {
    out[provider.providerId] = listProviderProductReadiness(provider.providerId, env);
  }
  return out;
}

function getMarketplaceProvider(providerId) {
  return MARKETPLACE_PROVIDERS.find((provider) => provider.providerId === providerId || provider.integrationId === providerId) || null;
}

function listMarketplaceProducts() {
  return MARKETPLACE_PROVIDERS.flatMap((provider) => provider.products.map((product) => ({ ...product, providerId: provider.providerId })));
}

function getMarketplaceProduct(providerId, productId) {
  const provider = getMarketplaceProvider(providerId);
  if (!provider) return null;
  return provider.products.find((product) => product.productId === productId || product.integrationId === productId) || null;
}

function makeMarketplaceProviderRow(providerId, { syncResult = null } = {}) {
  const provider = getMarketplaceProvider(providerId);
  if (!provider) return null;
  const testedAt = syncResult?.testedAt || "";
  const isConnected = syncResult?.ok === true;
  // A live account probe yields `verified`; a configured-but-unprovable account
  // (e.g. third-party Upstash account with no Developer API) is `account-linked`,
  // a distinct weaker state that must NOT be reported as verified.
  const syncStatus = syncResult?.syncStatus || (isConnected ? "verified" : "setup-required");
  const status = syncResult?.status || (isConnected ? "connected" : "draft");
  return {
    Name: provider.label,
    integrationId: provider.integrationId,
    authRef: provider.authRef,
    baseUrl: provider.baseUrl,
    endpoint: provider.endpoint,
    method: provider.method,
    status,
    lastTested: testedAt,
    lastResponse: syncResult?.summary || `Connect a ${provider.label} provider account before installing workspace products.`,
    entityTypes: provider.entityTypes,
    description: provider.description,
    connectorKind: provider.connectorKind,
    resolverTemplateId: "",
    schemaVersion: "growthub-marketplace-provider-v1",
    capabilities: provider.capabilities,
    executionLane: provider.executionLane,
    region: "",
    productId: "",
    plan: "",
    syncStatus,
    syncCheckedAt: testedAt,
    syncProof: syncResult?.proof || "",
    missingEnv: Array.isArray(syncResult?.missingEnv) ? syncResult.missingEnv.join(",") : "",
  };
}

function makeUpstashProviderRow(options = {}) {
  return makeMarketplaceProviderRow("upstash", options);
}

function getUpstashProduct(productId) {
  return getMarketplaceProduct("upstash", productId);
}

function listProviderProductReadiness(providerId, env = process.env) {
  const provider = getMarketplaceProvider(providerId);
  if (!provider) return [];
  const source = env && typeof env === "object" ? env : {};
  return provider.products.map((product) => {
    // Use the canonical readEnvVar so product readiness and schedule-runtime
    // resolution share one env-key contract (concrete UPPER_SNAKE keys).
    const missingEnv = product.requiredEnv.filter((key) => !readEnvVar(key, source));
    const configuredOptionalEnv = product.optionalEnv.filter((key) => Boolean(readEnvVar(key, source)));
    return {
      productId: product.productId,
      integrationId: product.integrationId,
      label: product.label,
      authRef: product.authRef,
      requiredEnv: product.requiredEnv,
      optionalEnv: product.optionalEnv,
      configured: missingEnv.length === 0,
      missingEnv,
      configuredOptionalEnv,
    };
  });
}

function listUpstashProductReadiness(env = process.env) {
  return listProviderProductReadiness("upstash", env);
}

function makeUpstashProductRow({ productId, region, plan = "free", syncResult = null, authReady = false }) {
  const product = getUpstashProduct(productId) || getMarketplaceProduct("upstash", "upstash-qstash");
  const selectedRegion = UPSTASH_REGION_OPTIONS.find((option) => option.id === region) || UPSTASH_REGION_OPTIONS[0];
  const baseUrl = product.productId === "upstash-qstash" ? selectedRegion.baseUrl : syncResult?.baseUrl || "";
  const testedAt = syncResult?.testedAt || "";
  const isConnected = syncResult?.ok === true || authReady;
  return {
    Name: product.label,
    integrationId: product.integrationId,
    authRef: product.authRef,
    baseUrl,
    endpoint: product.endpoint,
    method: product.method,
    status: isConnected ? "connected" : "draft",
    lastTested: testedAt || (authReady ? "env-ready" : ""),
    lastResponse: syncResult?.summary || (authReady
      ? `${product.label} env ref resolves in this runtime.`
      : `Complete ${product.label} provider setup, then retry sync.`),
    entityTypes: product.entityTypes,
    description: product.description,
    connectorKind: product.connectorKind,
    resolverTemplateId: "",
    schemaVersion: "growthub-marketplace-upstash-v1",
    capabilities: product.capabilities,
    executionLane: product.executionLane,
    region: product.productId === "upstash-qstash" ? selectedRegion.id : "",
    productId: product.productId,
    plan,
    syncStatus: isConnected ? "verified" : "missing-env",
    syncCheckedAt: testedAt,
    syncProof: syncResult?.proof || "",
    missingEnv: Array.isArray(syncResult?.missingEnv) ? syncResult.missingEnv.join(",") : "",
  };
}

function makeUpstashSchedulerRow({ region, authReady }) {
  return makeUpstashProductRow({ productId: "upstash-qstash", region, authReady });
}

function withUpstashProductRegistry(workspaceConfig, { productId = "upstash-qstash", region = "us-east-1", plan = "free", syncResult = null, authReady = false } = {}) {
  const dm = workspaceConfig?.dataModel && typeof workspaceConfig.dataModel === "object" ? workspaceConfig.dataModel : {};
  const objects = Array.isArray(dm.objects) ? dm.objects : [];
  const product = getUpstashProduct(productId) || getUpstashProduct("upstash-qstash");
  const productRow = makeUpstashProductRow({ productId: product.productId, region, plan, syncResult, authReady });
  let found = false;
  const nextObjects = objects.map((object) => {
    if (object?.objectType !== "api-registry" || found) return object;
    found = true;
    const rows = Array.isArray(object.rows) ? object.rows : [];
    const hasRow = rows.some((row) => String(row?.integrationId || "").trim() === product.integrationId);
    return {
      ...object,
      columns: apiRegistryColumns(object.columns),
      rows: hasRow
        ? rows.map((row) => String(row?.integrationId || "").trim() === product.integrationId ? { ...row, ...productRow } : row)
        : [productRow, ...rows],
    };
  });
  if (!found) {
    nextObjects.push({
      id: "api-registry",
      label: "API Registry",
      name: "API Registry",
      source: "API Registry",
      objectType: "api-registry",
      icon: "Code2",
      columns: apiRegistryColumns(),
      rows: [productRow],
      binding: { mode: "manual", source: "API Registry" },
      relations: [],
    });
  }
  return { ...workspaceConfig, dataModel: { ...dm, objects: nextObjects } };
}

function withMarketplaceProductRegistry(workspaceConfig, { providerId, productId, region = "us-east-1", plan = "free", syncResult = null, authReady = false } = {}) {
  if (providerId === "upstash") {
    return withUpstashProductRegistry(workspaceConfig, { productId, region, plan, syncResult, authReady });
  }
  return workspaceConfig;
}

function withMarketplaceProviderRegistry(workspaceConfig, { providerId, syncResult = null } = {}) {
  const dm = workspaceConfig?.dataModel && typeof workspaceConfig.dataModel === "object" ? workspaceConfig.dataModel : {};
  const objects = Array.isArray(dm.objects) ? dm.objects : [];
  const provider = getMarketplaceProvider(providerId);
  const providerRow = makeMarketplaceProviderRow(providerId, { syncResult });
  if (!provider || !providerRow) return workspaceConfig;
  let found = false;
  const nextObjects = objects.map((object) => {
    if (object?.objectType !== "api-registry" || found) return object;
    found = true;
    const rows = Array.isArray(object.rows) ? object.rows : [];
    const hasRow = rows.some((row) => String(row?.integrationId || "").trim() === provider.integrationId);
    return {
      ...object,
      columns: apiRegistryColumns(object.columns),
      rows: hasRow
        ? rows.map((row) => String(row?.integrationId || "").trim() === provider.integrationId ? { ...row, ...providerRow } : row)
        : [providerRow, ...rows],
    };
  });
  if (!found) {
    nextObjects.push({
      id: "api-registry",
      label: "API Registry",
      name: "API Registry",
      source: "API Registry",
      objectType: "api-registry",
      icon: "Code2",
      columns: apiRegistryColumns(),
      rows: [providerRow],
      binding: { mode: "manual", source: "API Registry" },
      relations: [],
    });
  }
  return { ...workspaceConfig, dataModel: { ...dm, objects: nextObjects } };
}

function withUpstashProviderRegistry(workspaceConfig, options = {}) {
  return withMarketplaceProviderRegistry(workspaceConfig, { providerId: "upstash", ...options });
}

function withUpstashSchedulerRegistry(workspaceConfig, { region = "us-east-1", authReady = false } = {}) {
  return withUpstashProductRegistry(workspaceConfig, { productId: "upstash-qstash", region, authReady });
}

function findMarketplaceProviderRow(workspaceConfig, providerId) {
  const provider = getMarketplaceProvider(providerId);
  if (!provider) return null;
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  for (const object of objects) {
    if (object?.objectType !== "api-registry") continue;
    for (const row of Array.isArray(object.rows) ? object.rows : []) {
      if (String(row?.integrationId || "").trim() === provider.integrationId) {
        const verified = String(row?.syncStatus || "").trim() === "verified"
          && String(row?.syncProof || "").trim()
          && String(row?.syncCheckedAt || "").trim();
        return { ...row, isVerifiedProvider: verified };
      }
    }
  }
  return null;
}

function findUpstashProviderRow(workspaceConfig) {
  return findMarketplaceProviderRow(workspaceConfig, "upstash");
}

function findInstalledWorkspaceAddOns(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const products = listMarketplaceProducts();
  const rows = [];
  for (const object of objects) {
    if (object?.objectType !== "api-registry") continue;
    for (const row of Array.isArray(object.rows) ? object.rows : []) {
      const product = products.find((item) => item.integrationId === String(row?.integrationId || "").trim());
      if (product) {
        const verified = String(row?.syncStatus || "").trim() === "verified"
          && String(row?.syncProof || "").trim()
          && String(row?.syncCheckedAt || "").trim();
        if (verified) rows.push({ ...row, productId: product.productId });
      }
    }
  }
  return rows;
}

function findWorkspaceAddOnRows(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const products = listMarketplaceProducts();
  const rows = [];
  for (const object of objects) {
    if (object?.objectType !== "api-registry") continue;
    for (const row of Array.isArray(object.rows) ? object.rows : []) {
      const product = products.find((item) => item.integrationId === String(row?.integrationId || "").trim());
      if (product) {
        const verified = String(row?.syncStatus || "").trim() === "verified"
          && String(row?.syncProof || "").trim()
          && String(row?.syncCheckedAt || "").trim();
        rows.push({ ...row, productId: product.productId, isVerifiedAddOn: verified });
      }
    }
  }
  return rows;
}

function deriveWorkspaceAddOnsState(workspaceConfig) {
  const installed = findInstalledWorkspaceAddOns(workspaceConfig);
  const upstashProvider = findUpstashProviderRow(workspaceConfig);
  const qstashWorkflow = installed.find((row) => row.productId === "upstash-qstash") || null;
  // Capability = the QStash product is installed + verified (read-probe). That
  // is what lets the canvas OFFER a bind; the per-workflow schedule itself is
  // created on bind and stored on the owning sandbox row, not here.
  const qstashScheduler = qstashWorkflow;
  return {
    kind: "growthub-workspace-add-ons-state-v1",
    upstashProvider,
    hasUpstashProvider: Boolean(upstashProvider?.isVerifiedProvider),
    installed,
    hasQstashWorkflow: Boolean(qstashWorkflow),
    qstashWorkflow,
    qstashScheduler,
    hasQstashSchedulerCapability: Boolean(qstashWorkflow),
  };
}

export {
  MARKETPLACE_PROVIDERS,
  UPSTASH_AUTH_REF,
  UPSTASH_PRODUCTS,
  UPSTASH_PROVIDER_INTEGRATION_ID,
  UPSTASH_QSTASH_INTEGRATION_ID,
  UPSTASH_REGION_OPTIONS,
  deriveWorkspaceAddOnsState,
  findMarketplaceProviderRow,
  findUpstashProviderRow,
  findInstalledWorkspaceAddOns,
  findWorkspaceAddOnRows,
  getMarketplaceProvider,
  getMarketplaceProduct,
  getUpstashProduct,
  findRegistryRowByIntegrationId,
  findEligibleSandboxRow,
  findSandboxRowByScheduleId,
  withSandboxScheduledRunProof,
  syncTriggerNodeForSchedule,
  readTriggerScheduleBinding,
  liveGraphField,
  listAllProviderProductReadiness,
  listMarketplaceProducts,
  listProviderProductReadiness,
  listUpstashProductReadiness,
  withWorkflowServerlessBind,
  makeMarketplaceProviderRow,
  makeUpstashProductRow,
  makeUpstashProviderRow,
  makeUpstashSchedulerRow,
  withMarketplaceProductRegistry,
  withMarketplaceProviderRegistry,
  withUpstashProductRegistry,
  withUpstashProviderRegistry,
  withUpstashSchedulerRegistry,
};
