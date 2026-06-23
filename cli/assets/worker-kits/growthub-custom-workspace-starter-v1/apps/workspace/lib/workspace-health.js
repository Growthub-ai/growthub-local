/**
 * Growthub Workspace Health & Agent Context V1 — pure derivations.
 *
 * Two read-only rollups built on top of the existing metadata store + graph
 * (`workspace-metadata-store.js`, `workspace-metadata-graph.js`):
 *
 *   1. deriveWorkspaceHealth(store, graph)
 *      A single actionable health summary — `status`, `issues[]`, `metrics`.
 *      It aggregates intelligence the metadata layer already proves:
 *      widget warnings (stale widgets), live-backed objects with empty/absent
 *      sidecars (missing sources), references that failed to resolve to a
 *      graph node (dangling edges), and pipeline run health.
 *
 *   2. deriveAgentContextPacket(store, graph, health, config)
 *      A compact, structured packet an agent can read in one shot to
 *      "understand" the workspace: summary counters, derived capabilities,
 *      the critical state slice of the health rollup, and entrypoints into
 *      the real surfaces (dashboards / workflows / Data Model / API).
 *
 * Invariants (identical to the metadata graph layer):
 *   - Pure. No React, no fetch, no mutation of the inputs.
 *   - Never throws on partial / unknown / absent input — returns a typed,
 *     empty-baseline envelope instead.
 *   - Never echoes secrets. These rollups only read already-redacted metadata
 *     items; no source rows, tokens, or auth material are surfaced.
 *   - Deterministic ordering so consumers can diff between calls.
 *
 * Authority: growthub.config.json + growthub.source-records.json remain the
 * authoritative artifacts. These are derived read models — writes still flow
 * through the governed routes (PATCH /api/workspace, sandbox-run, etc.).
 */

const HEALTH_KIND = "growthub-workspace-health-v1";
const HEALTH_VERSION = 1;
const AGENT_CONTEXT_KIND = "growthub-workspace-agent-context-v1";
const AGENT_CONTEXT_VERSION = 1;

function safeString(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function emptyMetadataStore() {
  return {
    objects: [],
    fields: [],
    widgets: [],
    dashboards: [],
    workflows: [],
    workflowNodes: [],
    sandboxes: [],
    integrations: [],
    integrationEntities: [],
    sourceRecords: [],
    runs: [],
    pipelineHealth: []
  };
}

/**
 * Source-record lookup keyed by id, carrying the resolved record count so a
 * live-backed object can be classified as backed / empty / absent without
 * re-reading the sidecar.
 */
function indexSourceRecords(store) {
  const index = new Map();
  for (const record of safeArray(store.sourceRecords)) {
    const id = safeString(record?.id).trim();
    if (!id) continue;
    index.set(id, {
      recordCount: Number.isFinite(record?.recordCount) ? Number(record.recordCount) : 0,
      fetchedAt: safeString(record?.fetchedAt).trim()
    });
  }
  return index;
}

/**
 * Detect references that did not resolve to a graph node — the "dangling
 * edge" class. The graph builder never emits orphan edges (a missing endpoint
 * becomes a store warning), so the dangling signal lives in the source side
 * of an edge that failed to materialise:
 *
 *   - a widget bound to an object id that has no metadata node
 *   - a widget backed by a source-record key that has no source-record node
 *   - a widget scoped to an integration that has no integration node
 *
 * Returns one issue per broken reference.
 */
function deriveDanglingEdges(store) {
  const issues = [];
  const objectIds = new Set(safeArray(store.objects).map((object) => safeString(object.id).trim()));
  const sourceIds = new Set(safeArray(store.sourceRecords).map((record) => safeString(record.id).trim()));
  const integrationIds = new Set(safeArray(store.integrations).map((integration) => safeString(integration.id).trim()));

  for (const widget of safeArray(store.widgets)) {
    const widgetId = safeString(widget.id).trim();
    const objectId = safeString(widget.objectId).trim();
    if (objectId && !objectIds.has(objectId)) {
      issues.push({
        type: "dangling_edge",
        severity: "error",
        widgetId,
        ref: { relation: "bindsToObject", objectId },
        reason: `widget "${widgetId}" binds to unknown object "${objectId}"`
      });
    }
    const sourceKey = safeString(widget.sourceRecordKey).trim();
    if (sourceKey && !sourceIds.has(sourceKey)) {
      issues.push({
        type: "dangling_edge",
        severity: "error",
        widgetId,
        ref: { relation: "backedBySourceRecord", sourceId: sourceKey },
        reason: `widget "${widgetId}" is backed by source record "${sourceKey}" that has no record set`
      });
    }
    const integrationId = safeString(widget.integrationId).trim();
    if (integrationId && !integrationIds.has(integrationId)) {
      issues.push({
        type: "dangling_edge",
        severity: "error",
        widgetId,
        ref: { relation: "callsIntegration", integrationId },
        reason: `widget "${widgetId}" references unregistered integration "${integrationId}"`
      });
    }
  }
  return issues;
}

/**
 * Widgets the metadata layer already flagged with warnings (bound but no axis
 * fields, unknown object, etc.) are "stale" — configured but not in a
 * computable state. We exclude the unknown-object case here because it is
 * already counted as a dangling edge.
 */
function deriveStaleWidgets(store) {
  const issues = [];
  const objectIds = new Set(safeArray(store.objects).map((object) => safeString(object.id).trim()));
  for (const widget of safeArray(store.widgets)) {
    const widgetId = safeString(widget.id).trim();
    const objectId = safeString(widget.objectId).trim();
    const unknownObject = objectId && !objectIds.has(objectId);
    for (const warning of safeArray(widget.warnings)) {
      if (unknownObject && /unknown object/i.test(warning)) continue;
      issues.push({
        type: "stale_widget",
        severity: "warning",
        widgetId,
        reason: safeString(warning)
      });
    }
  }
  return issues;
}

/**
 * Live-backed objects whose configured source either has no sidecar record
 * set (absent) or an empty one (recordCount 0). These render hollow widgets,
 * so they are surfaced as missing-source errors.
 */
function deriveMissingSources(store) {
  const issues = [];
  const sourceIndex = indexSourceRecords(store);
  for (const object of safeArray(store.objects)) {
    if (!object?.isLiveBacked) continue;
    const objectId = safeString(object.id).trim();
    const sourceId = safeString(object.sourceId).trim();
    if (!sourceId) {
      issues.push({
        type: "missing_source",
        severity: "error",
        objectId,
        reason: `live-backed object "${objectId}" has no source id configured`
      });
      continue;
    }
    const record = sourceIndex.get(sourceId);
    if (!record) {
      issues.push({
        type: "missing_source",
        severity: "error",
        objectId,
        sourceId,
        reason: `object "${objectId}" is bound to source "${sourceId}" but no source record exists (sidecar empty)`
      });
    } else if (record.recordCount === 0) {
      issues.push({
        type: "missing_source",
        severity: "warning",
        objectId,
        sourceId,
        reason: `source "${sourceId}" backing object "${objectId}" has 0 records — refresh the source`
      });
    }
  }
  return issues;
}

/**
 * Pipeline run health rolled into issues. `unhealthy` (last run failed) is an
 * error; `untested` (live but never run) is a warning.
 */
function derivePipelineIssues(store) {
  const issues = [];
  for (const pipeline of safeArray(store.pipelineHealth)) {
    const status = safeString(pipeline.status).trim();
    const label = safeString(pipeline.label).trim();
    // Thread the addressing tuple the workflows surface consumes
    // (?object=&row=&field=orchestrationConfig) so the issue deep-links to the
    // exact failing pipeline rather than the workflows index.
    const objectId = safeString(pipeline.objectId).trim();
    const rowName = safeString(pipeline.rowId).trim();
    if (status === "unhealthy") {
      issues.push({
        type: "unhealthy_pipeline",
        severity: "error",
        workflow: label,
        objectId,
        rowName,
        reason: `pipeline "${label}" last run failed (run ${safeString(pipeline.latestRunId) || "unknown"})`
      });
    } else if (status === "untested") {
      issues.push({
        type: "untested_pipeline",
        severity: "warning",
        workflow: label,
        objectId,
        rowName,
        reason: `pipeline "${label}" is live but has no recorded successful run`
      });
    }
  }
  return issues;
}

/**
 * Build the single workspace health summary.
 *
 * Returns:
 *   {
 *     kind, version,
 *     status: "healthy" | "degraded" | "unhealthy",
 *     issues: [{ type, severity, reason, ...refs }],
 *     metrics: { ...counters }
 *   }
 */
function deriveWorkspaceHealth(metadataStore, graph) {
  const store = (metadataStore && typeof metadataStore === "object") ? metadataStore : emptyMetadataStore();

  const danglingEdges = deriveDanglingEdges(store);
  const staleWidgets = deriveStaleWidgets(store);
  const missingSources = deriveMissingSources(store);
  const pipelineIssues = derivePipelineIssues(store);

  // Order: errors first, then warnings, preserving derivation order within
  // each band so the response is deterministic and the most actionable issue
  // is always at the top.
  const allIssues = [...danglingEdges, ...missingSources, ...pipelineIssues, ...staleWidgets];
  const errors = allIssues.filter((issue) => issue.severity === "error");
  const warnings = allIssues.filter((issue) => issue.severity !== "error");
  const issues = [...errors, ...warnings];

  let status = "healthy";
  if (errors.length) status = "unhealthy";
  else if (warnings.length) status = "degraded";

  const widgets = safeArray(store.widgets);
  const objects = safeArray(store.objects);
  const liveObjects = objects.filter((object) => object?.isLiveBacked);
  const staleWidgetIds = new Set(staleWidgets.map((issue) => issue.widgetId).filter(Boolean));

  const metrics = {
    status,
    totalObjects: objects.length,
    liveBackedObjects: liveObjects.length,
    totalWidgets: widgets.length,
    staleWidgets: staleWidgetIds.size,
    danglingEdges: danglingEdges.length,
    missingSources: missingSources.length,
    totalWorkflows: safeArray(store.workflows).length,
    totalDashboards: safeArray(store.dashboards).length,
    totalSourceRecords: safeArray(store.sourceRecords).length,
    unhealthyPipelines: pipelineIssues.filter((issue) => issue.type === "unhealthy_pipeline").length,
    untestedPipelines: pipelineIssues.filter((issue) => issue.type === "untested_pipeline").length,
    graphNodes: safeArray(graph?.nodes).length,
    graphEdges: safeArray(graph?.edges).length,
    issueCount: issues.length,
    errorCount: errors.length,
    warningCount: warnings.length
  };

  return {
    kind: HEALTH_KIND,
    version: HEALTH_VERSION,
    status,
    issues,
    metrics
  };
}

/**
 * Derive the capability tags an agent can rely on. Mirrors the customer-facing
 * "what can this workspace do" surface without re-reading raw config.
 */
function deriveCapabilities(store) {
  const capabilities = [];
  if (safeArray(store.dashboards).length) capabilities.push("dashboards");
  if (safeArray(store.widgets).length) capabilities.push("widgets");
  if (safeArray(store.objects).length) capabilities.push("data-model");
  if (safeArray(store.objects).some((object) => object?.isLiveBacked)) capabilities.push("live-sources");
  if (safeArray(store.sandboxes).some((sandbox) => sandbox?.hasGraph)) capabilities.push("workflows");
  if (safeArray(store.sandboxes).length) capabilities.push("sandboxes");
  if (safeArray(store.integrations).length) capabilities.push("integrations");
  return capabilities;
}

/**
 * Build the compact agent context packet. Combines the summary counters,
 * derived capabilities, the health critical-state slice, and entrypoints into
 * the real workspace surfaces — the "semantic compression" an agent reads
 * once instead of inferring workspace state from raw files.
 */
function deriveAgentContextPacket(metadataStore, graph, health, workspaceConfig) {
  const store = (metadataStore && typeof metadataStore === "object") ? metadataStore : emptyMetadataStore();
  const config = (workspaceConfig && typeof workspaceConfig === "object") ? workspaceConfig : {};
  const healthRollup = (health && typeof health === "object")
    ? health
    : deriveWorkspaceHealth(store, graph);

  const dashboards = safeArray(store.dashboards);
  const workflows = safeArray(store.workflows);

  const issues = safeArray(healthRollup.issues);
  const criticalState = {
    staleWidgets: issues.filter((issue) => issue.type === "stale_widget"),
    missingSources: issues.filter((issue) => issue.type === "missing_source"),
    danglingEdges: issues.filter((issue) => issue.type === "dangling_edge"),
    unhealthyPipelines: issues.filter((issue) => issue.type === "unhealthy_pipeline")
  };

  const entrypoints = {
    dashboards: dashboards.map((dashboard) => ({
      id: dashboard.id,
      label: dashboard.label,
      widgetCount: dashboard.widgetCount,
      href: dashboard.id === "__canvas__" ? "/" : `/?dashboard=${encodeURIComponent(dashboard.id)}`
    })),
    workflows: workflows.map((workflow) => ({
      id: workflow.id,
      label: workflow.label,
      lifecycleStatus: workflow.lifecycleStatus,
      href: "/workflows"
    })),
    dataModel: "/data-model",
    api: "/api/workspace",
    health: "/api/workspace/health"
  };

  return {
    kind: AGENT_CONTEXT_KIND,
    version: AGENT_CONTEXT_VERSION,
    summary: {
      name: safeString(config.name).trim() || "workspace",
      objects: safeArray(store.objects).length,
      widgets: safeArray(store.widgets).length,
      workflows: workflows.length,
      dashboards: dashboards.length,
      sandboxes: safeArray(store.sandboxes).length,
      sourceRecords: safeArray(store.sourceRecords).length
    },
    capabilities: deriveCapabilities(store),
    health: {
      status: healthRollup.status,
      issueCount: safeArray(healthRollup.issues).length,
      metrics: healthRollup.metrics || {}
    },
    criticalState,
    entrypoints
  };
}

export {
  HEALTH_KIND,
  HEALTH_VERSION,
  AGENT_CONTEXT_KIND,
  AGENT_CONTEXT_VERSION,
  deriveWorkspaceHealth,
  deriveAgentContextPacket,
  deriveCapabilities
};
