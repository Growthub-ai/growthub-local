const fieldTypes = [
  "text",
  "long_text",
  "number",
  "currency",
  "percentage",
  "date",
  "datetime",
  "select",
  "multi_select",
  "boolean",
  "relation",
  "multi_relation",
  "formula",
  "rollup",
  "url",
  "email",
  "phone",
  "json",
  "file",
  "rating",
  "user"
];
const capabilitySpecs = [
  tab("dashboard", "Dashboard", "workspace-summary", ["agencyAccount", "client", "task"], ["pipelineValue", "clientHealth", "openTasks", "reportingReadiness"], ["data", "auth", "integrations"]),
  tab("clients", "Clients", "client-records", ["client", "contact", "clientKpi"], ["activeClients", "retainerValue", "healthScore", "renewalWindow"], ["data", "auth"]),
  tab("pipeline", "Pipeline", "opportunity-flow", ["opportunity", "client", "contact"], ["stageValue", "winRate", "nextFollowUp", "ownerLoad"], ["data", "integrations"]),
  tab("content", "Content", "publishing-workflow", ["contentPlan", "client", "task"], ["scheduledPosts", "channelMix", "approvalQueue", "overdueAssets"], ["data", "integrations"]),
  tab("tasks", "Tasks", "execution-queue", ["task", "client", "workflowRun"], ["openTasks", "slaRisk", "ownerLoad", "recurringTemplates"], ["data", "integrations"]),
  tab("finance", "Finance", "billing-control", ["invoice", "expense", "client"], ["mrr", "outstandingBalance", "margin", "paymentState"], ["data", "payments"]),
  tab("reports", "Reports", "reporting-adapter", ["report", "clientKpi", "dataConnector"], ["reportQueue", "connectedSources", "periodDelta", "deliveryState"], ["reporting", "integrations"]),
  tab("metrics", "Metrics", "agency-health", ["agencyMetric", "clientKpi", "opportunity"], ["mrrTrend", "churnRisk", "pipelineCoverage", "capacity"], ["data", "reporting"]),
  tab("client-results", "Client Results", "client-performance", ["clientKpi", "report", "dataConnector"], ["roas", "cac", "revenue", "sourceFreshness"], ["reporting", "data-sources"]),
  tab("operations", "Operations", "process-memory", ["sop", "workflowRun", "task"], ["sopCoverage", "runHistory", "handoffHealth", "blockedWork"], ["data", "auth"]),
  tab("settings", "Settings", "workspace-control", ["workspaceSetting", "dataConnector", "userPreference"], ["adapterState", "permissionCoverage", "auditTrail", "deploymentState"], ["auth", "payments", "integrations"])
];
const objectDefinitions = {
  agencyAccount: object("agencyAccount", "Agency account", [["name", "text"], ["domain", "url"], ["owner", "user"], ["settings", "json"], ["createdAt", "datetime"]]),
  client: object("client", "Client", [["name", "text"], ["retainer", "currency"], ["healthScore", "rating"], ["stage", "select"], ["primaryContact", "relation"], ["renewalDate", "date"], ["monthlyRevenue", "currency"], ["notes", "long_text"]]),
  contact: object("contact", "Contact", [["fullName", "text"], ["email", "email"], ["phone", "phone"], ["client", "relation"], ["role", "select"], ["lastTouchAt", "datetime"]]),
  clientKpi: object("clientKpi", "Client KPI", [["client", "relation"], ["source", "select"], ["period", "date"], ["metric", "text"], ["value", "number"], ["delta", "percentage"], ["formulaValue", "formula"]]),
  opportunity: object("opportunity", "Opportunity", [["client", "relation"], ["name", "text"], ["stage", "select"], ["value", "currency"], ["probability", "percentage"], ["owner", "user"], ["nextFollowUp", "datetime"]]),
  contentPlan: object("contentPlan", "Content plan", [["client", "relation"], ["channel", "multi_select"], ["publishAt", "datetime"], ["asset", "file"], ["status", "select"], ["approvers", "multi_relation"]]),
  task: object("task", "Task", [["title", "text"], ["client", "relation"], ["owner", "user"], ["priority", "select"], ["dueAt", "datetime"], ["done", "boolean"], ["sourcePayload", "json"]]),
  workflowRun: object("workflowRun", "Workflow run", [["name", "text"], ["status", "select"], ["startedAt", "datetime"], ["completedAt", "datetime"], ["relatedTasks", "multi_relation"], ["trace", "json"]]),
  invoice: object("invoice", "Invoice", [["client", "relation"], ["amount", "currency"], ["status", "select"], ["dueDate", "date"], ["paidAt", "datetime"], ["lineItems", "json"]]),
  expense: object("expense", "Expense", [["client", "relation"], ["amount", "currency"], ["category", "select"], ["receipt", "file"], ["billable", "boolean"]]),
  report: object("report", "Report", [["client", "relation"], ["period", "date"], ["status", "select"], ["sourceConnectors", "multi_relation"], ["snapshot", "json"], ["publishedUrl", "url"]]),
  dataConnector: object("dataConnector", "Data connector", [["provider", "text"], ["status", "select"], ["authPath", "text"], ["lastSyncedAt", "datetime"], ["metadata", "json"]]),
  agencyMetric: object("agencyMetric", "Agency metric", [["period", "date"], ["mrr", "currency"], ["churn", "percentage"], ["utilization", "percentage"], ["pipeline", "currency"], ["score", "formula"]]),
  sop: object("sop", "SOP", [["title", "text"], ["area", "select"], ["owner", "user"], ["body", "long_text"], ["relatedObjects", "multi_relation"], ["version", "number"]]),
  workspaceSetting: object("workspaceSetting", "Workspace setting", [["key", "text"], ["value", "json"], ["adapter", "select"], ["permission", "select"], ["updatedAt", "datetime"]]),
  userPreference: object("userPreference", "User preference", [["user", "user"], ["theme", "select"], ["defaultView", "text"], ["notifications", "json"]])
};
const portalCapabilities = capabilitySpecs.map(({ id, label, objectType, bindings }) => ({ id, label, objectType, bindings }));
function tab(id, label, objectType, objects, widgets, bindings) {
  return { id, label, objectType, objects, widgets, bindings };
}
function object(id, label, fields) {
  return {
    id,
    label,
    fields: fields.map(([name, type]) => ({ name, type })),
    views: ["table", "kanban", "record", "dashboard"],
    contract: "twenty-sdk/define"
  };
}
function buildPortalWorkspace({ config, adapters, integrations }) {
  const integrationRows = [...integrations.dataSources, ...integrations.workspaceIntegrations];
  const connectedRows = integrationRows.filter((item) => item.isConnected);
  const connectedDataSources = integrations.dataSources.filter((item) => item.isConnected);
  const adapterRows = [
    primitive("data", "Data", config.dataAdapter, adapters.persistence.mode, adapters.persistence.requiredEnv),
    primitive("auth", "Auth", config.authAdapter, adapters.auth.id, adapters.auth.requiredEnv),
    primitive("payments", "Payments", config.paymentAdapter, adapters.payments.enabled ? "enabled" : "disabled", adapters.payments.requiredEnv),
    primitive("integrations", "Integrations", config.integrationAdapter, adapters.integrations.authority, adapters.integrations.requiredEnv),
    primitive("reporting", "Reporting", config.reportingAdapter || "not-configured", config.dataSources.hasWindsorApiKey ? "windsor-key-present" : "adapter-selected", []),
    primitive("data-sources", "Data sources", `${connectedDataSources.length}/${integrations.dataSources.length}`, config.dataSources.hasWindsorApiKey ? "windsor-overlay" : "integration-state", [])
  ];
  return {
    identity: {
      label: "Agency Portal",
      mark: "GH",
      mode: "governed-worker-kit",
      deployTarget: config.deployTarget,
      primitiveContract: "twenty-sdk/define objects, fields, views, dashboards, widgets, permissions, CRUD, API, webhooks, and audit logs",
      fieldTypes
    },
    navigation: [
      ...portalCapabilities.map((item) => ({ href: `#${item.id}`, label: item.label })),
      { href: "/settings/integrations", label: "Integrations" }
    ],
    summary: [
      primitive("object-schema", "Object schema", `${Object.keys(objectDefinitions).length} objects`, "twenty-sdk/define", fieldTypes),
      primitive("dashboard-widgets", "Dashboard widgets", `${capabilitySpecs.reduce((total, item) => total + item.widgets.length, 0)} widgets`, "capability dashboards", ["bar", "line", "pie", "number"]),
      primitive("connection-state", "Connection state", `${connectedRows.length}/${integrationRows.length}`, config.integrationAdapter, adapters.integrations.requiredEnv)
    ],
    adapters: adapterRows,
    capabilities: capabilitySpecs.map((item) => buildCapabilityPrimitive(item, adapterRows, integrations)),
    actions: capabilitySpecs.slice(0, 5).map((item) => ({ href: `#${item.id}`, label: item.label, objectType: item.objectType })),
    api: [
      { label: "Workspace contract", href: "/api/workspace", method: "GET" },
      { label: "Integration contract", href: "/api/settings/integrations", method: "GET" }
    ]
  };
}
function primitive(id, label, value, source, env) {
  return {
    id,
    label,
    value,
    source,
    env,
    status: env.length ? "configured-by-env" : "runtime-derived"
  };
}
function buildCapabilityPrimitive(capability, adapterRows, integrations) {
  const bindings = adapterRows.filter((item) => capability.bindings.includes(item.id));
  const relatedObjects = capability.objects.map((id) => objectDefinitions[id]);
  const fieldCount = relatedObjects.reduce((count, item) => count + item.fields.length, 0);
  const dataSources = integrations.dataSources.filter((item) => capability.bindings.includes("data-sources") || capability.bindings.includes("reporting"));
  const workspaceIntegrations = integrations.workspaceIntegrations.filter((item) => capability.bindings.includes("integrations"));
  return {
    ...capability,
    status: bindings.some((item) => item.value === "not-configured") ? "needs-runtime-config" : "runtime-ready",
    fields: fieldCount,
    objects: relatedObjects,
    views: Array.from(new Set(relatedObjects.flatMap((item) => item.views))),
    widgets: capability.widgets.map((id, index) => ({
      id,
      chart: ["number", "bar", "line", "pie"][index % 4],
      sourceObject: relatedObjects[index % relatedObjects.length].id,
      filters: ["client", "period", "owner", "status"].slice(0, 2 + index % 3),
      realtime: true
    })),
    bindings,
    integrations: [...dataSources, ...workspaceIntegrations].map((item) => ({
      id: item.id,
      label: item.label,
      provider: item.provider,
      objectType: item.objectType,
      status: item.status,
      source: item.authPath
    }))
  };
}
export {
  buildPortalWorkspace,
  portalCapabilities
};
