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
    requiredEnv: ["QSTASH_URL", "QSTASH_TOKEN"],
    optionalEnv: ["QSTASH_CURRENT_SIGNING_KEY", "QSTASH_NEXT_SIGNING_KEY"],
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
    // Serverless scheduler capability proof (set by the schedule route after a
    // real provider upsert). A verified read-probe is NOT a scheduler — the
    // canvas only treats a row as a scheduler once `scheduleId` is present.
    "scheduleId",
    "scheduleDestination",
    "callbackUrl",
    "failureCallbackUrl",
    "cron",
    "lastScheduleTime",
    "nextScheduleTime",
    "lastScheduleStates",
    // Last synchronized scheduled-run response (set by the signed callback
    // route). Non-secret proof only — a short body preview, never the payload.
    "lastResponseStatus",
    "lastResponseBodyPreview",
    "lastMessageId",
    "lastAttemptedAt",
    "lastSucceededAt",
    "lastFailedAt",
    "lastFailureReason",
    ...existing,
  ]));
}

// Non-secret keys the scheduler/callback routes are allowed to merge onto a
// product registry row. Any key NOT in this set is dropped before persistence,
// so a token/signing key can never be written into the row by accident.
const SCHEDULER_METADATA_KEYS = new Set([
  "scheduleId",
  "scheduleDestination",
  "callbackUrl",
  "failureCallbackUrl",
  "cron",
  "region",
  "lastScheduleTime",
  "nextScheduleTime",
  "lastScheduleStates",
  "lastResponseStatus",
  "lastResponseBodyPreview",
  "lastMessageId",
  "lastAttemptedAt",
  "lastSucceededAt",
  "lastFailedAt",
  "lastFailureReason",
  "status",
  "syncStatus",
  "syncCheckedAt",
  "syncProof",
  "lastTested",
  "lastResponse",
]);

function sanitizeSchedulerPatch(patch) {
  const out = {};
  for (const [key, value] of Object.entries(patch && typeof patch === "object" ? patch : {})) {
    if (SCHEDULER_METADATA_KEYS.has(key)) out[key] = value;
  }
  return out;
}

/**
 * Merge a NON-SECRET scheduler/callback patch onto the api-registry row whose
 * integrationId matches. Generic across providers — the schedule and callback
 * routes both use this so secrets can never reach workspace config. Returns the
 * config unchanged when no matching row exists.
 */
function withMarketplaceSchedulerMetadata(workspaceConfig, { integrationId, patch } = {}) {
  const targetId = String(integrationId || "").trim();
  if (!targetId) return workspaceConfig;
  const safePatch = sanitizeSchedulerPatch(patch);
  const dm = workspaceConfig?.dataModel && typeof workspaceConfig.dataModel === "object" ? workspaceConfig.dataModel : {};
  const objects = Array.isArray(dm.objects) ? dm.objects : [];
  let changed = false;
  const nextObjects = objects.map((object) => {
    if (object?.objectType !== "api-registry") return object;
    const rows = Array.isArray(object.rows) ? object.rows : [];
    let rowChanged = false;
    const nextRows = rows.map((row) => {
      if (String(row?.integrationId || "").trim() !== targetId) return row;
      rowChanged = true;
      return { ...row, ...safePatch };
    });
    if (!rowChanged) return object;
    changed = true;
    return { ...object, columns: apiRegistryColumns(object.columns), rows: nextRows };
  });
  if (!changed) return workspaceConfig;
  return { ...workspaceConfig, dataModel: { ...dm, objects: nextObjects } };
}

/** A row is a usable serverless scheduler only when verified AND it carries a
 * real provider schedule id — a verified read-probe alone is not enough. */
function hasSchedulerCapability(row) {
  return Boolean(
    row &&
      String(row.syncStatus || "").trim() === "verified" &&
      String(row.scheduleId || "").trim(),
  );
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
    const missingEnv = product.requiredEnv.filter((key) => !source[key]);
    const configuredOptionalEnv = product.optionalEnv.filter((key) => Boolean(source[key]));
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
  // A scheduler the canvas can actually bind: installed (verified) AND it owns
  // a real provider schedule id, not just a passing read-probe.
  const qstashScheduler = hasSchedulerCapability(qstashWorkflow) ? qstashWorkflow : null;
  return {
    kind: "growthub-workspace-add-ons-state-v1",
    upstashProvider,
    hasUpstashProvider: Boolean(upstashProvider?.isVerifiedProvider),
    installed,
    hasQstashWorkflow: Boolean(qstashWorkflow),
    qstashWorkflow,
    qstashScheduler,
    hasQstashSchedulerCapability: Boolean(qstashScheduler),
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
  hasSchedulerCapability,
  findRegistryRowByIntegrationId,
  listAllProviderProductReadiness,
  listMarketplaceProducts,
  listProviderProductReadiness,
  listUpstashProductReadiness,
  withMarketplaceSchedulerMetadata,
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
