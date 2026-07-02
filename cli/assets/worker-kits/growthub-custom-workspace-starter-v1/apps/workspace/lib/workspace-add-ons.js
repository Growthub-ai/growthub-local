import { readEnvVar } from "./server-secrets.js";

const UPSTASH_QSTASH_INTEGRATION_ID = "upstash-qstash-workflow";
const UPSTASH_AUTH_REF = "QSTASH";
const UPSTASH_PROVIDER_INTEGRATION_ID = "upstash-provider";
const UPSTASH_REGION_OPTIONS = [
  { id: "us-east-1", label: "Washington, D.C., USA (East)", baseUrl: "https://qstash-us-east-1.upstash.io" },
  { id: "us-west-1", label: "San Francisco, USA (West)", baseUrl: "https://qstash-us-west-1.upstash.io" },
  { id: "eu-central-1", label: "Frankfurt, EU (Central)", baseUrl: "https://qstash-eu-central-1.upstash.io" },
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
    resourceDiscovery: {
      auth: "provider-basic",
      paths: ["/v2/qstash/users", "/v2/qstash/user"],
      emptyLabel: "No QStash workflow resources returned for this account.",
      createDividerLabel: "Or create a new QStash resource",
      envFromResource: [
        { envRef: "QSTASH_TOKEN", field: "token" },
      ],
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
    resourceDiscovery: {
      auth: "provider-basic",
      paths: ["/v2/redis/databases"],
      emptyLabel: "No Redis databases returned for this account.",
      createDividerLabel: "Or create a new Redis database",
      envFromResource: [
        { envRef: "UPSTASH_REDIS_REST_URL", fieldCandidates: ["rest_url", "restUrl", "endpoint", "url"], ensureHttps: true },
        { envRef: "UPSTASH_REDIS_REST_TOKEN", fieldCandidates: ["rest_token", "restToken", "token"] },
      ],
    },
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
    resourceDiscovery: {
      auth: "provider-basic",
      paths: ["/v2/search"],
      emptyLabel: "No Search indexes returned for this account.",
      createDividerLabel: "Or create a new Search index",
      envFromResource: [
        { envRef: "UPSTASH_SEARCH_REST_URL", fieldCandidates: ["rest_url", "restUrl", "endpoint", "url"], ensureHttps: true },
        { envRef: "UPSTASH_SEARCH_REST_TOKEN", fieldCandidates: ["rest_token", "restToken", "token"] },
      ],
    },
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
    resourceDiscovery: {
      auth: "provider-basic",
      paths: ["/v2/vector/index"],
      emptyLabel: "No Vector indexes returned for this account.",
      createDividerLabel: "Or create a new Vector index",
      envFromResource: [
        { envRef: "UPSTASH_VECTOR_REST_URL", fieldCandidates: ["rest_url", "restUrl", "endpoint", "url"], ensureHttps: true },
        { envRef: "UPSTASH_VECTOR_REST_TOKEN", fieldCandidates: ["rest_token", "restToken", "token"] },
      ],
    },
    probe: {
      baseUrlEnv: "UPSTASH_VECTOR_REST_URL",
      tokenEnv: "UPSTASH_VECTOR_REST_TOKEN",
      paths: ["/info"],
    },
    regionOptions: UPSTASH_REGION_OPTIONS,
  },
];
// Workspace-native inbound input-method products — the exact mirror of the
// QStash scheduler product for push invocation. Capability = a verified API
// Registry row (secret resolvable as an env ref); ownership = the workflow row
// (same scheduleId/schedulerRegistryId columns); node surface = the same
// trigger node with a method-specific triggerKind/inputMode. No remote
// infrastructure exists for these products, so install/uninstall skip the
// remote create/delete steps and everything else is byte-identical.
const GROWTHUB_INBOUND_PROVIDER_INTEGRATION_ID = "growthub-inbound-provider";
const GROWTHUB_WEBHOOK_TRIGGER_INTEGRATION_ID = "growthub-webhook-trigger";
const GROWTHUB_API_TRIGGER_INTEGRATION_ID = "growthub-api-trigger";
const GROWTHUB_INBOUND_PRODUCTS = [
  {
    productId: "growthub-webhook-trigger",
    integrationId: GROWTHUB_WEBHOOK_TRIGGER_INTEGRATION_ID,
    authRef: "GROWTHUB_WEBHOOK",
    label: "Growthub Webhook Trigger",
    shortLabel: "Webhook",
    icon: "W",
    iconClass: "is-webhook",
    connectorKind: "growthub-inbound-webhook",
    endpoint: "/api/workspace/workflows/growthub",
    method: "POST",
    description: "Signed inbound webhook input method for published governed workflows. External systems POST a v1 HMAC-signed request to the workspace destination route; the signing secret stays in env — this row stores only refs and routing metadata.",
    subtitle: "Signed inbound invocation",
    plans: "Included",
    entityTypes: "workflow-run,webhook",
    capabilities: "webhook,workflow,inbound-invocation",
    executionLane: "inbound-webhook",
    requiredEnv: ["GROWTHUB_WEBHOOK_SIGNING_SECRET"],
    optionalEnv: [],
  },
  {
    productId: "growthub-api-trigger",
    integrationId: GROWTHUB_API_TRIGGER_INTEGRATION_ID,
    authRef: "GROWTHUB_API",
    label: "Growthub API Trigger",
    shortLabel: "API request",
    icon: "A",
    iconClass: "is-api-trigger",
    connectorKind: "growthub-api-request",
    endpoint: "/api/workspace/workflows/growthub",
    method: "POST",
    description: "Authenticated API-request input method for published governed workflows. A bearer-authenticated POST carries the run-input values (validated against the workflow's run-input schema); the invoke token stays in env.",
    subtitle: "Authenticated API invocation",
    plans: "Included",
    entityTypes: "workflow-run,api-request",
    capabilities: "api-request,workflow,inbound-invocation",
    executionLane: "api-request",
    requiredEnv: ["GROWTHUB_API_INVOKE_TOKEN"],
    optionalEnv: [],
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
    accountSetupFields: [
      {
        id: "email",
        label: "Upstash account email",
        type: "email",
        autocomplete: "email",
        required: true,
        envRef: "UPSTASH_EMAIL",
        credentialRole: "basicAuthUsername",
      },
      {
        id: "apiKey",
        label: "Management API key",
        type: "password",
        autocomplete: "off",
        required: true,
        envRef: "UPSTASH_API_KEY",
        credentialRole: "basicAuthPassword",
      },
    ],
    consoleUrl: "https://console.upstash.com/",
    accountSetupUrl: "https://console.upstash.com/account/api",
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
  {
    providerId: "growthub",
    integrationId: GROWTHUB_INBOUND_PROVIDER_INTEGRATION_ID,
    authRef: "GROWTHUB",
    label: "Growthub Inbound Triggers",
    developer: "Growthub",
    baseUrl: "",
    endpoint: "/api/workspace/workflows/growthub",
    method: "POST",
    consoleUrl: "",
    providerProductsLabel: "Inbound invocation (Webhook, API request)",
    products: GROWTHUB_INBOUND_PRODUCTS,
    entityTypes: "provider,marketplace,workspace-native",
    connectorKind: "growthub-inbound-provider",
    capabilities: "provider-account,inbound-invocation,marketplace-products",
    executionLane: "workspace-provider",
    description: "Workspace-native inbound input methods for published governed workflows. No external account: products verify by resolving their signing/invoke env refs in this runtime.",
  },
];

function apiRegistryColumns(existing = []) {
  return Array.from(new Set([
    "Name",
    "integrationId",
    "authRef",
    "requiredEnv",
    "optionalEnv",
    "resolvedEnv",
    "selectedResourceId",
    "selectedResourceLabel",
    "selectedResourceSource",
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
    "providerAccountRequiredEnv",
    "providerAccountOptions",
    "selectedProviderAccountId",
    "selectedProviderAccountLabel",
    "providerAccountSource",
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

// One trigger grammar, three input methods. The scheduler value is the shipped
// default; the inbound values are its exact mirrors (workspace-inbound-invocation.js
// owns the verification side of each kind).
const BINDING_TRIGGER_KINDS = ["serverless-scheduler", "inbound-webhook", "api-request"];
const INPUT_MODE_BY_TRIGGER_KIND = {
  "serverless-scheduler": "serverless-schedule",
  "inbound-webhook": "webhook",
  "api-request": "api-request",
};

function normalizeTriggerKind(kind) {
  const value = String(kind == null ? "" : kind).trim();
  return BINDING_TRIGGER_KINDS.includes(value) ? value : "serverless-scheduler";
}

function scheduleTriggerConfig(meta) {
  const triggerKind = normalizeTriggerKind(meta.triggerKind);
  return {
    trigger: triggerKind,
    triggerKind,
    schedule: {
      schedulerRegistryId: meta.schedulerRegistryId || "",
      scheduleId: meta.scheduleId || "",
      cron: meta.cron || "",
      providerId: meta.schedulerProviderId || "",
      productId: meta.schedulerProductId || "",
      destinationUrl: meta.destinationUrl || "",
      callbackUrl: meta.callbackUrl || "",
      triggerInput: meta.triggerInput || "",
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
    const triggerLabels = {
      "serverless-scheduler": { label: "Schedule trigger", subtitle: "Serverless scheduler" },
      "inbound-webhook": { label: "Webhook trigger", subtitle: "Signed inbound webhook" },
      "api-request": { label: "API trigger", subtitle: "Authenticated API request" },
    };
    const kindLabels = triggerLabels[normalizeTriggerKind(meta.triggerKind)];
    const triggerNode = {
      id: CANONICAL_TRIGGER_NODE_ID,
      type: "data-trigger",
      label: kindLabels.label,
      subtitle: kindLabels.subtitle,
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
      const isInputTrigger = node?.type === "input" || node?.id === "input";
      if (clear) {
        config.trigger = "manual";
        config.triggerKind = "manual";
        if (isInputTrigger) config.inputMode = "manual";
        delete config.schedule;
        delete config.enabled;
      } else {
        Object.assign(config, scheduleTriggerConfig(meta));
        if (isInputTrigger) config.inputMode = INPUT_MODE_BY_TRIGGER_KIND[normalizeTriggerKind(meta.triggerKind)];
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
  if (!schedule || !BINDING_TRIGGER_KINDS.includes(String(node?.config?.trigger || "").trim())) return null;
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

/**
 * TRUE only when the row carries a fresh, successful, method-consistent
 * serverless invocation proof for the exact graph bytes being promoted. This
 * is the publish gate's serverless alternative to the draft-test lineage —
 * and binding alone is NEVER proof: a bound-but-never-invoked schedule,
 * webhook, or API endpoint must not publish as stable.
 *
 * Requires ALL of:
 *   - serverless binding agreement: runLocality=serverless, registry id +
 *     binding id owned by the row, published trigger node enabled and agreeing,
 *   - METHOD agreement: row.schedulerTriggerKind ↔ trigger node kind ↔
 *     lastScheduledRunTriggerKind (stale proof from one input method can never
 *     satisfy the gate for another; legacy rows default to the scheduler kind),
 *   - a SUCCESSFUL invocation: lastScheduledRunStatus is 2xx AND
 *     lastScheduledRunSucceededAt is stamped (the destination door / signed
 *     callback write these only after the whole graph ran and succeeded),
 *   - graph identity: the tested config or the live graph equals the exact
 *     draft bytes being promoted (proof freshness against this version).
 */
// Graph-content equality for proof freshness. The trigger sync, the canvas
// serializer, and hand-authored seeds each emit different JSON formatting,
// and the canvas injects derived `sandboxRecordRef` identity metadata — none
// of which changes what the user authored. The bind additionally OWNS the
// trigger-binding metadata it writes into the LIVE graph only (the draft is
// NEVER mutated by a bind): `trigger`/`triggerKind`/`schedule`/`enabled` on
// the trigger node and `writeLastResponse` on tool-result nodes. Those exact
// keys are excluded from content comparison — binding agreement is enforced
// separately and explicitly by the proof gate's binding checks. Everything
// else is user content: any node/config/edge change breaks freshness.
// Non-parseable values fall back to exact trimmed-byte equality.
const BIND_OWNED_TRIGGER_CONFIG_KEYS = ["trigger", "triggerKind", "schedule", "enabled"];
function normalizeGraphForComparison(value) {
  const graph = parseGraphValue(value);
  if (!graph) return String(value == null ? "" : value).trim();
  const stripped = {
    ...graph,
    nodes: (Array.isArray(graph.nodes) ? graph.nodes : []).map((node) => {
      if (!node || typeof node !== "object") return node;
      const config = { ...(node.config || {}) };
      const isTrigger = node.type === "data-trigger" || node.type === "input" || node.id === "input";
      if (isTrigger) for (const key of BIND_OWNED_TRIGGER_CONFIG_KEYS) delete config[key];
      if (node.type === "tool-result") delete config.writeLastResponse;
      return { ...node, config };
    }),
  };
  const stable = (v) => {
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === "object") {
      const out = {};
      for (const key of Object.keys(v).sort()) {
        if (key === "sandboxRecordRef") continue;
        out[key] = stable(v[key]);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(stable(stripped));
}

function orchestrationGraphContentEquals(a, b) {
  const left = String(a == null ? "" : a).trim();
  const right = String(b == null ? "" : b).trim();
  if (!left || !right) return left === right;
  return normalizeGraphForComparison(left) === normalizeGraphForComparison(right);
}

function rowHasSuccessfulServerlessBindingProof(row, draft) {
  const runLocality = String(row?.runLocality || "").trim().toLowerCase();
  const schedulerRegistryId = String(row?.schedulerRegistryId || "").trim();
  const scheduleId = String(row?.scheduleId || "").trim();
  const draftGraph = String(draft || "").trim();
  const testedConfig = String(row?.orchestrationDraftTestedConfig || "").trim();
  const liveGraph = String(row?.orchestrationGraph || row?.orchestrationConfig || "").trim();
  const binding = readTriggerScheduleBinding(row?.orchestrationGraph || row?.orchestrationConfig);
  const rowTriggerKind = String(row?.schedulerTriggerKind || "").trim() || "serverless-scheduler";
  const lastRunTriggerKind = String(row?.lastScheduledRunTriggerKind || "").trim();
  const methodAgrees = String(binding?.triggerKind || "").trim() === rowTriggerKind
    && (!lastRunTriggerKind || lastRunTriggerKind === rowTriggerKind);
  const lastRunStatus = String(row?.lastScheduledRunStatus || "").trim();
  // When the objectified node trace is present (inbound door writes it), every
  // downstream node must have completed — an HTTP 200 with an incomplete chain
  // is not proof. Legacy scheduler proof (signed callback, no trace column)
  // passes on 2xx + succeededAt as before.
  const nodesCompleted = String(row?.lastScheduledRunNodesCompleted || "").trim();
  const invocationSucceeded = lastRunStatus.startsWith("2")
    && Boolean(String(row?.lastScheduledRunSucceededAt || "").trim())
    && (!nodesCompleted || nodesCompleted === "true");
  return runLocality === "serverless"
    && Boolean(schedulerRegistryId)
    && Boolean(scheduleId)
    && binding?.enabled === true
    && binding?.scheduleId === scheduleId
    && binding?.schedulerRegistryId === schedulerRegistryId
    && methodAgrees
    && invocationSucceeded
    && (orchestrationGraphContentEquals(testedConfig, draftGraph) || orchestrationGraphContentEquals(liveGraph, draftGraph));
}

const SANDBOX_SCHEDULE_CLEAR_PATCH = {
  scheduleId: "",
  schedulerTriggerKind: "",
  schedulerProviderId: "",
  schedulerProductId: "",
  schedulerRegion: "",
  schedulerCron: "",
  schedulerTriggerInput: "",
  schedulerDestination: "",
  schedulerCallbackUrl: "",
  schedulerFailureCallbackUrl: "",
  schedulerInstalledAt: "",
  schedulerPaused: "",
  schedulerPausedAt: "",
  schedulerResumedAt: "",
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
        triggerKind: normalizeTriggerKind(params.triggerKind),
        schedulerRegistryId: String(schedulerRegistryId || "").trim(),
        scheduleId: params.scheduleId || "",
        cron: params.cron || "",
        schedulerProviderId: params.schedulerProviderId || "",
        schedulerProductId: params.schedulerProductId || "",
        destinationUrl: params.destinationUrl || "",
        callbackUrl: params.callbackUrl || "",
        triggerInput: params.triggerInput || "",
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
        schedulerTriggerKind: triggerMeta.triggerKind,
        schedulerRegistryId: triggerMeta.schedulerRegistryId,
        adapter: SERVERLESS_LOCAL_ADAPTERS.includes(adapterId) ? "local-process" : (adapterId || "local-process"),
        schedulerProviderId: triggerMeta.schedulerProviderId,
        schedulerProductId: triggerMeta.schedulerProductId,
        schedulerRegion: params.region || "",
        scheduleId: triggerMeta.scheduleId,
        schedulerCron: triggerMeta.cron,
        schedulerTriggerInput: triggerMeta.triggerInput,
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

/** Merge scheduler control state onto the owning sandbox row. */
function withSandboxSchedulerControlState(workspaceConfig, { objectId, rowId, patch } = {}) {
  return withSandboxScheduledRunProof(workspaceConfig, { objectId, rowId, patch });
}

function findRegistryRowByIntegrationId(workspaceConfig, integrationId) {
  const targetId = String(integrationId || "").trim();
  if (!targetId) return null;
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  for (const object of objects) {
    if (!isApiRegistryObject(object)) continue;
    for (const row of Array.isArray(object.rows) ? object.rows : []) {
      if (String(row?.integrationId || "").trim() === targetId) return row;
    }
  }
  return null;
}

function isApiRegistryObject(object) {
  const objectType = String(object?.objectType || "").trim();
  const id = String(object?.id || object?.objectId || "").trim();
  return objectType === "api-registry" || id === "api-registry";
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
  // A live account probe yields `verified`. Do not treat a console-open event
  // as a connected account; the UI must only show Manage after real provider
  // account metadata or a verified probe is persisted.
  const syncStatus = syncResult?.syncStatus || (isConnected ? "verified" : "setup-required");
  const status = syncResult?.status || (isConnected ? "connected" : "draft");
  return {
    Name: provider.label,
    integrationId: provider.integrationId,
    authRef: provider.authRef,
    requiredEnv: provider.accountProbe?.emailEnv && provider.accountProbe?.keyEnv
      ? [provider.accountProbe.emailEnv, provider.accountProbe.keyEnv].join(",")
      : "",
    optionalEnv: "",
    resolvedEnv: Array.isArray(syncResult?.resolvedEnv) ? syncResult.resolvedEnv.join(",") : "",
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
    providerAccountRequiredEnv: provider.accountProbe?.emailEnv && provider.accountProbe?.keyEnv
      ? [provider.accountProbe.emailEnv, provider.accountProbe.keyEnv].join(",")
      : "",
    providerAccountOptions: Array.isArray(syncResult?.providerAccountOptions) ? JSON.stringify(syncResult.providerAccountOptions) : "",
    selectedProviderAccountId: syncResult?.selectedProviderAccountId || "",
    selectedProviderAccountLabel: syncResult?.selectedProviderAccountLabel || "",
    providerAccountSource: syncResult?.providerAccountSource || "",
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
  const status = syncResult?.status || (isConnected ? "connected" : "draft");
  const syncStatus = syncResult?.syncStatus || (isConnected ? "verified" : "missing-env");
  return {
    Name: product.label,
    integrationId: product.integrationId,
    authRef: product.authRef,
    requiredEnv: Array.isArray(product.requiredEnv) ? product.requiredEnv.join(",") : "",
    optionalEnv: Array.isArray(product.optionalEnv) ? product.optionalEnv.join(",") : "",
    resolvedEnv: Array.isArray(syncResult?.resolvedEnv) ? syncResult.resolvedEnv.join(",") : "",
    selectedResourceId: syncResult?.selectedResourceId || "",
    selectedResourceLabel: syncResult?.selectedResourceLabel || "",
    selectedResourceSource: syncResult?.selectedResourceSource || "",
    baseUrl,
    endpoint: product.endpoint,
    method: product.method,
    status,
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
    syncStatus,
    syncCheckedAt: testedAt,
    syncProof: syncResult?.proof || "",
    missingEnv: Array.isArray(syncResult?.missingEnv) ? syncResult.missingEnv.join(",") : "",
  };
}

function makeUpstashSchedulerRow({ region, authReady }) {
  return makeUpstashProductRow({ productId: "upstash-qstash", region, authReady });
}

/**
 * Provider-agnostic product row (mirror of makeUpstashProductRow for products
 * with no region/remote-resource semantics — e.g. the workspace-native inbound
 * trigger products). Verified = the product's env refs resolve in this runtime
 * (same proof rule the scheduler product uses; secrets never persisted).
 */
function makeMarketplaceProductRow({ providerId, productId, plan = "included", syncResult = null, authReady = false } = {}) {
  if (providerId === "upstash") return makeUpstashProductRow({ productId, plan, syncResult, authReady });
  const product = getMarketplaceProduct(providerId, productId);
  if (!product) return null;
  const testedAt = syncResult?.testedAt || "";
  const isConnected = syncResult?.ok === true || authReady;
  const status = syncResult?.status || (isConnected ? "connected" : "draft");
  const syncStatus = syncResult?.syncStatus || (isConnected ? "verified" : "missing-env");
  return {
    Name: product.label,
    integrationId: product.integrationId,
    authRef: product.authRef,
    requiredEnv: Array.isArray(product.requiredEnv) ? product.requiredEnv.join(",") : "",
    optionalEnv: Array.isArray(product.optionalEnv) ? product.optionalEnv.join(",") : "",
    resolvedEnv: Array.isArray(syncResult?.resolvedEnv) ? syncResult.resolvedEnv.join(",") : "",
    selectedResourceId: "",
    selectedResourceLabel: "",
    selectedResourceSource: "",
    baseUrl: syncResult?.baseUrl || "",
    endpoint: product.endpoint,
    method: product.method,
    status,
    lastTested: testedAt || (authReady ? "env-ready" : ""),
    lastResponse: syncResult?.summary || (authReady
      ? `${product.label} env ref resolves in this runtime.`
      : `Set ${(product.requiredEnv || []).join(", ")} in this runtime, then retry sync.`),
    entityTypes: product.entityTypes,
    description: product.description,
    connectorKind: product.connectorKind,
    resolverTemplateId: "",
    schemaVersion: "growthub-marketplace-product-v1",
    capabilities: product.capabilities,
    executionLane: product.executionLane,
    region: "",
    productId: product.productId,
    plan,
    syncStatus,
    syncCheckedAt: testedAt,
    syncProof: syncResult?.proof || (authReady ? `${(product.requiredEnv || []).join(", ")} resolved in runtime env.` : ""),
    missingEnv: Array.isArray(syncResult?.missingEnv) ? syncResult.missingEnv.join(",") : "",
  };
}

/** Upsert one product row into the api-registry object (shared shape). */
function withRegistryProductRowUpsert(workspaceConfig, productRow) {
  if (!productRow) return workspaceConfig;
  const dm = workspaceConfig?.dataModel && typeof workspaceConfig.dataModel === "object" ? workspaceConfig.dataModel : {};
  const objects = Array.isArray(dm.objects) ? dm.objects : [];
  let found = false;
  const nextObjects = objects.map((object) => {
    if (!isApiRegistryObject(object) || found) return object;
    found = true;
    const rows = Array.isArray(object.rows) ? object.rows : [];
    const hasRow = rows.some((row) => String(row?.integrationId || "").trim() === productRow.integrationId);
    return {
      ...object,
      columns: apiRegistryColumns(object.columns),
      rows: hasRow
        ? rows.map((row) => String(row?.integrationId || "").trim() === productRow.integrationId ? { ...row, ...productRow } : row)
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

function withUpstashProductRegistry(workspaceConfig, { productId = "upstash-qstash", region = "us-east-1", plan = "free", syncResult = null, authReady = false } = {}) {
  const dm = workspaceConfig?.dataModel && typeof workspaceConfig.dataModel === "object" ? workspaceConfig.dataModel : {};
  const objects = Array.isArray(dm.objects) ? dm.objects : [];
  const product = getUpstashProduct(productId) || getUpstashProduct("upstash-qstash");
  const productRow = makeUpstashProductRow({ productId: product.productId, region, plan, syncResult, authReady });
  let found = false;
  const nextObjects = objects.map((object) => {
    if (!isApiRegistryObject(object) || found) return object;
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
  const productRow = makeMarketplaceProductRow({ providerId, productId, plan, syncResult, authReady });
  return withRegistryProductRowUpsert(workspaceConfig, productRow);
}

function withMarketplaceProviderRegistry(workspaceConfig, { providerId, syncResult = null } = {}) {
  const dm = workspaceConfig?.dataModel && typeof workspaceConfig.dataModel === "object" ? workspaceConfig.dataModel : {};
  const objects = Array.isArray(dm.objects) ? dm.objects : [];
  const provider = getMarketplaceProvider(providerId);
  const providerRow = makeMarketplaceProviderRow(providerId, { syncResult });
  if (!provider || !providerRow) return workspaceConfig;
  let found = false;
  const nextObjects = objects.map((object) => {
    if (!isApiRegistryObject(object) || found) return object;
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
    if (!isApiRegistryObject(object)) continue;
    for (const row of Array.isArray(object.rows) ? object.rows : []) {
      if (String(row?.integrationId || "").trim() === provider.integrationId) {
        const syncStatus = String(row?.syncStatus || "").trim();
        const status = String(row?.status || "").trim();
        const verified = Boolean(syncStatus === "verified"
          && String(row?.syncProof || "").trim()
          && String(row?.syncCheckedAt || "").trim());
        let accountOptions = [];
        if (typeof row?.providerAccountOptions === "string" && row.providerAccountOptions.trim()) {
          try {
            const parsed = JSON.parse(row.providerAccountOptions);
            if (Array.isArray(parsed)) accountOptions = parsed;
          } catch {
            accountOptions = [];
          }
        } else if (Array.isArray(row?.providerAccountOptions)) {
          accountOptions = row.providerAccountOptions;
        }
        const linked = Boolean(verified);
        const setupPending = syncStatus === "setup-pending"
          || syncStatus === "setup-opened"
          || status === "setup-pending"
          || status === "setup-opened";
        return {
          ...row,
          isConnectedProvider: linked,
          isSetupPendingProvider: setupPending,
          isVerifiedProvider: verified,
        };
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
    if (!isApiRegistryObject(object)) continue;
    for (const row of Array.isArray(object.rows) ? object.rows : []) {
      const product = products.find((item) => item.integrationId === String(row?.integrationId || "").trim());
      if (product) {
        const verified = Boolean(String(row?.syncStatus || "").trim() === "verified"
          && String(row?.syncProof || "").trim()
          && String(row?.syncCheckedAt || "").trim());
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
    if (!isApiRegistryObject(object)) continue;
    for (const row of Array.isArray(object.rows) ? object.rows : []) {
      const product = products.find((item) => item.integrationId === String(row?.integrationId || "").trim());
      if (product) {
        const verified = Boolean(String(row?.syncStatus || "").trim() === "verified"
          && String(row?.syncProof || "").trim()
          && String(row?.syncCheckedAt || "").trim());
        rows.push({ ...row, productId: product.productId, isVerifiedAddOn: verified });
      }
    }
  }
  return rows;
}

// Marketplace-agnostic inbound input methods — ANY installed + verified
// marketplace product whose executionLane is an inbound binding lane surfaces
// as a canvas input method, the exact mirror of the provider-agnostic custom
// scheduler registry rows. The packaged growthub webhook/API products are
// simply the first two such products; a third-party plugin that declares the
// same lane grammar (executionLane + requiredEnv + verified registry row)
// joins with zero canvas changes. Returns one entry per installed method:
//   { inputMode, lane, triggerKind, providerId, productId, integrationId, label, row }
function resolveInboundMethodProducts(workspaceConfig) {
  const installed = findInstalledWorkspaceAddOns(workspaceConfig);
  const products = listMarketplaceProducts();
  const methods = [];
  for (const row of installed) {
    const product = products.find((item) => item.productId === row.productId);
    const lane = String(product?.executionLane || "").trim();
    const inputMode = lane !== "serverless-scheduler" ? INPUT_MODE_BY_TRIGGER_KIND[lane] || "" : "";
    if (!inputMode) continue;
    methods.push({
      inputMode,
      lane,
      // Inbound binding trigger kinds ARE the lanes (one trigger grammar).
      triggerKind: lane,
      providerId: String(product.providerId || "").trim(),
      productId: row.productId,
      integrationId: String(row.integrationId || "").trim(),
      label: String(product.shortLabel || product.label || row.productId).trim(),
      // The env refs the caller-facing panel names (never values) — e.g. the
      // signing secret / invoke token slug the external system must hold.
      requiredEnv: Array.isArray(product.requiredEnv) ? product.requiredEnv : [],
      row,
    });
  }
  return methods;
}

function deriveWorkspaceAddOnsState(workspaceConfig) {
  const installed = findInstalledWorkspaceAddOns(workspaceConfig);
  const upstashProvider = findUpstashProviderRow(workspaceConfig);
  const qstashWorkflow = installed.find((row) => row.productId === "upstash-qstash") || null;
  // Capability = the QStash product is installed + verified (read-probe). That
  // is what lets the canvas OFFER a bind; the per-workflow schedule itself is
  // created on bind and stored on the owning sandbox row, not here.
  const qstashScheduler = qstashWorkflow;
  // Inbound input-method capabilities — same proof rule (installed + verified
  // registry row) that gates the scheduler bind in the canvas, resolved by
  // execution LANE (marketplace-agnostic), not by hardcoded product id.
  const inboundMethods = resolveInboundMethodProducts(workspaceConfig);
  const webhookMethod = inboundMethods.find((method) => method.inputMode === "webhook") || null;
  const apiMethod = inboundMethods.find((method) => method.inputMode === "api-request") || null;
  const webhookTrigger = webhookMethod?.row || null;
  const apiTrigger = apiMethod?.row || null;
  return {
    kind: "growthub-workspace-add-ons-state-v1",
    upstashProvider,
    hasUpstashProvider: Boolean(upstashProvider?.isConnectedProvider),
    installed,
    hasQstashWorkflow: Boolean(qstashWorkflow),
    qstashWorkflow,
    qstashScheduler,
    hasQstashSchedulerCapability: Boolean(qstashWorkflow),
    inboundMethods,
    webhookMethod,
    apiMethod,
    webhookTrigger,
    hasWebhookTriggerCapability: Boolean(webhookTrigger),
    apiTrigger,
    hasApiTriggerCapability: Boolean(apiTrigger),
  };
}

export {
  BINDING_TRIGGER_KINDS,
  GROWTHUB_API_TRIGGER_INTEGRATION_ID,
  GROWTHUB_INBOUND_PRODUCTS,
  GROWTHUB_INBOUND_PROVIDER_INTEGRATION_ID,
  GROWTHUB_WEBHOOK_TRIGGER_INTEGRATION_ID,
  INPUT_MODE_BY_TRIGGER_KIND,
  MARKETPLACE_PROVIDERS,
  UPSTASH_AUTH_REF,
  UPSTASH_PRODUCTS,
  UPSTASH_PROVIDER_INTEGRATION_ID,
  UPSTASH_QSTASH_INTEGRATION_ID,
  UPSTASH_REGION_OPTIONS,
  deriveWorkspaceAddOnsState,
  resolveInboundMethodProducts,
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
  withSandboxSchedulerControlState,
  syncTriggerNodeForSchedule,
  readTriggerScheduleBinding,
  rowHasSuccessfulServerlessBindingProof,
  orchestrationGraphContentEquals,
  liveGraphField,
  listAllProviderProductReadiness,
  listMarketplaceProducts,
  listProviderProductReadiness,
  listUpstashProductReadiness,
  withWorkflowServerlessBind,
  makeMarketplaceProviderRow,
  makeMarketplaceProductRow,
  normalizeTriggerKind,
  makeUpstashProductRow,
  makeUpstashProviderRow,
  makeUpstashSchedulerRow,
  withMarketplaceProductRegistry,
  withMarketplaceProviderRegistry,
  withUpstashProductRegistry,
  withUpstashProviderRegistry,
  withUpstashSchedulerRegistry,
};
