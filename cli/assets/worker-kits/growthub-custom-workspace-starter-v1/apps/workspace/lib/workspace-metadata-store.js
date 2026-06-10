/**
 * Growthub Workspace Metadata Graph V1 — pure metadata store.
 *
 * Derives a typed, read-only projection of the workspace from the existing
 * authoritative artifacts. This module is the seam Twenty has between
 * `object metadata`, `field metadata`, `view metadata`, `workflow metadata`
 * and the rest of its UI — except here the authority order is preserved:
 *
 *   1. growthub.config.json              (governed workspace artifact)
 *   2. growthub.source-records.json      (live-source sidecar state)
 *   3. sandbox rows + workflow graph     (inside Data Model objects)
 *   4. integration entity metadata       (resolved server-side)
 *   5. run records                       (sandbox-run / row.lastResponse)
 *   6. derived metadata graph            (this module)
 *
 * Invariants:
 *   - No React. No fetch. No mutation of the input.
 *   - Never throws on unknown / partial config — returns warnings instead.
 *   - Never contains secrets. Provider tokens, API keys, bearer tokens,
 *     and OAuth tokens never appear in any metadata item.
 *   - Stable, deterministic IDs so dependent UI / agents can diff between
 *     calls and compute stale groups safely.
 *
 * The output shape mirrors the V1 contract:
 *
 *   {
 *     kind: "growthub-workspace-metadata-store-v1",
 *     version: 1,
 *     objects:                workspaceObjectMetadataItems
 *     fields:                 workspaceFieldMetadataItems
 *     views:                  workspaceViewMetadataItems
 *     filters:                workspaceFilterMetadataItems
 *     sorts:                  workspaceSortMetadataItems
 *     widgets:                workspaceWidgetMetadataItems
 *     dashboards:             workspaceDashboardMetadataItems
 *     workflows:              workspaceWorkflowMetadataItems
 *     workflowNodes:          workspaceWorkflowNodeMetadataItems
 *     runInputs:              workspaceRunInputMetadataItems
 *     agentHosts:             workspaceAgentHostMetadataItems
 *     sandboxes:              workspaceSandboxMetadataItems
 *     integrations:           workspaceIntegrationMetadataItems
 *     integrationEntities:    workspaceIntegrationEntityMetadataItems
 *     sourceRecords:          workspaceSourceRecordMetadataItems
 *     runs:                   workspaceRunRecordMetadataItems
 *     outputArtifacts:        workspaceOutputArtifactMetadataItems
 *     warnings:               string[]
 *   }
 */

import { parseOrchestrationGraph } from "./orchestration-graph.js";
import { discoverRunInputSchema } from "./orchestration-run-inputs.js";

const METADATA_STORE_KIND = "growthub-workspace-metadata-store-v1";
const METADATA_STORE_VERSION = 1;

const HIDDEN_SANDBOX_OBJECT_IDS = new Set(["workspace-helper-sandbox"]);

// Secret-shaped keys are stripped from any metadata item before it is
// returned. The metadata graph is a read model — it MUST NOT echo provider
// tokens, API keys, or any other auth material.
const SECRET_FIELD_NAMES = new Set([
  "accesstoken",
  "refreshtoken",
  "bearertoken",
  "apikey",
  "api_key",
  "secret",
  "password",
  "token",
  "authorization",
  "claudetoken",
  "authheadervalue"
]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeString(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

function stableId(...parts) {
  return parts
    .map((part) => safeString(part).trim())
    .filter(Boolean)
    .join(":");
}

function isSecretKey(name) {
  const key = safeString(name).trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!key) return false;
  if (SECRET_FIELD_NAMES.has(key)) return true;
  if (/(token|secret|password|apikey|bearer)$/.test(key)) return true;
  return false;
}

function inferPrimitiveType(value) {
  if (value === null || value === undefined || value === "") return "text";
  if (typeof value === "number") return Number.isFinite(value) ? "number" : "text";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) return "list";
  if (isPlainObject(value)) return "json";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "text";
    if (/^-?\d+(\.\d+)?$/.test(trimmed.replace(/,/g, ""))) return "number";
    if (/^(true|false)$/i.test(trimmed)) return "boolean";
    if (!Number.isNaN(Date.parse(trimmed)) && /\d{4}-\d{2}-\d{2}/.test(trimmed)) return "date";
    return "text";
  }
  return "text";
}

function deriveFieldType(column, rows, hints) {
  const hint = hints && typeof hints[column] === "string" ? hints[column].trim() : "";
  if (hint) return hint;
  const sample = rows.find((row) => row != null && row[column] != null && row[column] !== "");
  if (!sample) return "text";
  return inferPrimitiveType(sample[column]);
}

/**
 * Workspace OBJECT metadata items.
 *
 * Sources: workspaceConfig.dataModel.objects (governed). Hidden sandbox-helper
 * objects are excluded from the public metadata projection (they exist for
 * the multi-turn helper, not the user surface).
 */
function deriveWorkspaceObjectMetadataItems(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects)
    ? workspaceConfig.dataModel.objects
    : [];
  const items = [];
  const warnings = [];
  for (const object of objects) {
    if (!isPlainObject(object)) continue;
    const id = safeString(object.id).trim();
    if (!id) {
      warnings.push("Skipped dataModel object without id.");
      continue;
    }
    if (HIDDEN_SANDBOX_OBJECT_IDS.has(id)) continue;
    const objectType = safeString(object.objectType || "custom").trim() || "custom";
    const binding = isPlainObject(object.binding) ? object.binding : null;
    const sourceStorage = safeString(binding?.sourceStorage).trim();
    const sourceId = safeString(object.sourceId || binding?.sourceId).trim();
    const isLiveBacked = sourceStorage === "workspace-source-records" && Boolean(sourceId);
    items.push({
      kind: "workspaceObject",
      id,
      metadataId: stableId("object", id),
      label: safeString(object.label || id).trim(),
      objectType,
      isSandbox: objectType === "sandbox-environment",
      isLiveBacked,
      sourceId: isLiveBacked ? sourceId : "",
      integrationId: safeString(binding?.integrationId).trim(),
      bindingMode: safeString(binding?.mode).trim(),
      rowCount: Array.isArray(object.rows) ? object.rows.length : 0,
      columns: Array.isArray(object.columns) ? object.columns.slice() : [],
      readOnly: isLiveBacked,
      sourceAuthority: "workspace-config"
    });
  }
  return { items, warnings };
}

/**
 * Workspace FIELD metadata items.
 *
 * A field belongs to exactly one object and exposes the typed contract the
 * UI needs to render filter/sort/aggregation pickers without re-deriving
 * the type inside every component.
 */
function deriveWorkspaceFieldMetadataItems(workspaceConfig, objectItems) {
  const items = [];
  const warnings = [];
  const objectsById = new Map(objectItems.map((object) => [object.id, object]));
  const rawObjects = Array.isArray(workspaceConfig?.dataModel?.objects)
    ? workspaceConfig.dataModel.objects
    : [];
  for (const raw of rawObjects) {
    if (!isPlainObject(raw)) continue;
    const objectId = safeString(raw.id).trim();
    if (!objectId || !objectsById.has(objectId)) continue;
    const objectMeta = objectsById.get(objectId);
    const columns = Array.isArray(raw.columns) ? raw.columns : [];
    const rows = Array.isArray(raw.rows) ? raw.rows : [];
    const typeHints = isPlainObject(raw.fieldSettings?.types) ? raw.fieldSettings.types : null;
    for (const column of columns) {
      const fieldId = safeString(column).trim();
      if (!fieldId) continue;
      const isSecret = isSecretKey(fieldId);
      const type = deriveFieldType(fieldId, rows, typeHints);
      const isNumeric = type === "number";
      const isDate = type === "date";
      const isBoolean = type === "boolean";
      items.push({
        kind: "workspaceField",
        id: fieldId,
        metadataId: stableId("field", objectId, fieldId),
        objectId,
        objectMetadataId: objectMeta.metadataId,
        label: fieldId,
        type,
        isNumeric,
        isDate,
        isBoolean,
        isSecret,
        isFilterable: !isSecret,
        isSortable: !isSecret,
        isChartXAxis: !isSecret,
        isChartYAxis: !isSecret && (isNumeric || isBoolean),
        isAggregatable: !isSecret && isNumeric,
        isWritable: !objectMeta.readOnly && !isSecret
      });
    }
  }
  return { items, warnings };
}

/**
 * Workspace VIEW metadata items.
 *
 * Views are read from `dataModel.objects[].savedViews` (when present) and
 * folder workflow shortcuts (`nav-folders` rows of `type:"view"`). The
 * projection always points at the source object — never inlines the
 * underlying rows.
 */
function deriveWorkspaceViewMetadataItems(workspaceConfig, objectItems) {
  const items = [];
  const warnings = [];
  const objectsById = new Map(objectItems.map((object) => [object.id, object]));
  const rawObjects = Array.isArray(workspaceConfig?.dataModel?.objects)
    ? workspaceConfig.dataModel.objects
    : [];
  for (const raw of rawObjects) {
    if (!isPlainObject(raw)) continue;
    const objectId = safeString(raw.id).trim();
    if (!objectsById.has(objectId)) continue;
    const objectMeta = objectsById.get(objectId);
    const views = Array.isArray(raw.savedViews) ? raw.savedViews : [];
    for (const view of views) {
      if (!isPlainObject(view)) continue;
      const viewId = safeString(view.id || view.name).trim();
      if (!viewId) continue;
      items.push({
        kind: "workspaceView",
        id: viewId,
        metadataId: stableId("view", objectId, viewId),
        objectId,
        objectMetadataId: objectMeta.metadataId,
        label: safeString(view.name || viewId).trim(),
        columns: Array.isArray(view.columns) ? view.columns.slice() : [],
        filterCount: Array.isArray(view.filters) ? view.filters.length : 0,
        hasSort: isPlainObject(view.sort)
      });
    }
  }
  return { items, warnings };
}

function deriveWorkspaceFilterMetadataItems(widgetItems, workflowNodeItems) {
  const items = [];
  for (const widget of widgetItems) {
    for (const clause of widget.filterClauses) {
      items.push({
        kind: "workspaceFilter",
        metadataId: stableId("filter", widget.metadataId, clause.fieldId, clause.operator),
        scope: "widget",
        scopeMetadataId: widget.metadataId,
        objectId: widget.objectId,
        fieldId: clause.fieldId,
        operator: clause.operator,
        hasValue: clause.hasValue
      });
    }
  }
  for (const node of workflowNodeItems) {
    for (const clause of node.filterClauses) {
      items.push({
        kind: "workspaceFilter",
        metadataId: stableId("filter", node.metadataId, clause.fieldId, clause.operator),
        scope: "workflowNode",
        scopeMetadataId: node.metadataId,
        objectId: node.objectId,
        fieldId: clause.fieldId,
        operator: clause.operator,
        hasValue: clause.hasValue
      });
    }
  }
  return { items, warnings: [] };
}

function deriveWorkspaceSortMetadataItems(widgetItems) {
  const items = [];
  for (const widget of widgetItems) {
    if (!widget.sortField) continue;
    items.push({
      kind: "workspaceSort",
      metadataId: stableId("sort", widget.metadataId, widget.sortField),
      scope: "widget",
      scopeMetadataId: widget.metadataId,
      objectId: widget.objectId,
      fieldId: widget.sortField,
      direction: widget.sortDirection || "position"
    });
  }
  return { items, warnings: [] };
}

function collectFilterClauses(filterValue) {
  const clauses = [];
  if (!isPlainObject(filterValue)) return clauses;
  const op = filterValue.op === "or" ? "or" : "and";
  const raw = Array.isArray(filterValue.clauses) ? filterValue.clauses : [];
  for (const clause of raw) {
    if (!isPlainObject(clause)) continue;
    const fieldId = safeString(clause.fieldId).trim();
    if (!fieldId) continue;
    clauses.push({
      fieldId,
      operator: safeString(clause.operator || "eq").trim() || "eq",
      hasValue: clause.value !== undefined && clause.value !== null && clause.value !== "",
      conjunction: op
    });
  }
  return clauses;
}

function deriveWidgetEntries(workspaceConfig) {
  const entries = [];
  const seen = new Set();
  const push = (widget, location) => {
    if (!isPlainObject(widget)) return;
    const widgetId = safeString(widget.id).trim();
    if (!widgetId || seen.has(widgetId)) return;
    seen.add(widgetId);
    entries.push({ widget, location });
  };
  const dashboards = Array.isArray(workspaceConfig?.dashboards) ? workspaceConfig.dashboards : [];
  for (const dashboard of dashboards) {
    const tabs = Array.isArray(dashboard?.tabs) ? dashboard.tabs : [];
    for (const tab of tabs) {
      const widgets = Array.isArray(tab?.widgets) ? tab.widgets : [];
      for (const widget of widgets) {
        push(widget, {
          dashboardId: safeString(dashboard.id).trim(),
          dashboardName: safeString(dashboard.name).trim(),
          tabId: safeString(tab.id).trim(),
          tabName: safeString(tab.name).trim()
        });
      }
    }
  }
  const canvas = isPlainObject(workspaceConfig?.canvas) ? workspaceConfig.canvas : null;
  if (canvas) {
    const tabs = Array.isArray(canvas.tabs) ? canvas.tabs : [];
    for (const tab of tabs) {
      const widgets = Array.isArray(tab?.widgets) ? tab.widgets : [];
      for (const widget of widgets) {
        push(widget, {
          dashboardId: "",
          dashboardName: "",
          tabId: safeString(tab.id).trim(),
          tabName: safeString(tab.name).trim()
        });
      }
    }
    const widgets = Array.isArray(canvas.widgets) ? canvas.widgets : [];
    for (const widget of widgets) {
      push(widget, {
        dashboardId: "",
        dashboardName: "",
        tabId: "",
        tabName: safeString(canvas.name).trim() || "Tab 1"
      });
    }
  }
  return entries;
}

/**
 * Workspace WIDGET metadata items.
 *
 * For each chart / view widget we record the typed dependency contract the
 * Chart Hydration Inspector + Twenty-style sidecars need:
 *
 *   - bound object id (Data Model object the widget reads from)
 *   - required fields (x-axis, y-axis, groupBy)
 *   - filter / sort fields
 *   - aggregation operation
 *   - source-record key (if backed by a live source)
 *   - integration entity (if scoped to one)
 *
 * The metadata layer NEVER inlines source rows — it only points at the
 * Data Model object so consumers can hydrate through the existing
 * chart-values pipeline.
 */
function deriveWorkspaceWidgetMetadataItems(workspaceConfig, objectItems) {
  const items = [];
  const warnings = [];
  const objectsById = new Map(objectItems.map((object) => [object.id, object]));
  const entries = deriveWidgetEntries(workspaceConfig);
  for (const entry of entries) {
    const widget = entry.widget;
    const widgetId = safeString(widget.id).trim();
    const kind = safeString(widget.kind || "chart").trim() || "chart";
    const config = isPlainObject(widget.config) ? widget.config : {};
    const binding = isPlainObject(config.binding) ? config.binding : null;
    const xAxis = isPlainObject(config.xAxis) ? config.xAxis : null;
    const yAxis = isPlainObject(config.yAxis) ? config.yAxis : null;
    const objectId = safeString(binding?.objectId).trim();
    const objectMeta = objectId ? objectsById.get(objectId) : null;
    const xField = safeString(xAxis?.field).trim();
    const yField = safeString(yAxis?.field).trim();
    const groupField = safeString(yAxis?.groupBy).trim();
    const sortField = xField;
    const sortDirection = safeString(xAxis?.sort).trim();
    const operation = safeString(yAxis?.operation || yAxis?.aggregation).trim();
    const filterClauses = collectFilterClauses(config.filter);
    const requiredFields = Array.from(new Set([xField, yField, groupField].filter(Boolean)));
    const filterFields = Array.from(new Set(filterClauses.map((clause) => clause.fieldId)));
    const sortFields = sortField ? [sortField] : [];
    const aggregationFields = yField ? [yField] : [];
    const isLiveBacked = Boolean(objectMeta?.isLiveBacked);
    const sourceRecordKey = isLiveBacked ? objectMeta.sourceId : "";
    const entityId = safeString(binding?.entityId).trim();
    const entityType = safeString(binding?.entityType).trim();
    const integrationId = safeString(binding?.integrationId || objectMeta?.integrationId).trim();
    const widgetWarnings = [];
    if (objectId && !objectMeta) {
      widgetWarnings.push(`Widget "${widgetId}" binds to unknown object "${objectId}".`);
    }
    if (kind === "chart" && objectMeta && requiredFields.length === 0 && operation !== "count" && operation !== "countAll") {
      widgetWarnings.push(`Widget "${widgetId}" is bound but no axis fields are configured.`);
    }
    items.push({
      kind: "workspaceWidget",
      id: widgetId,
      metadataId: stableId("widget", widgetId),
      widgetKind: kind,
      title: safeString(widget.title).trim() || widgetId,
      objectId,
      objectMetadataId: objectMeta ? objectMeta.metadataId : "",
      sourceAuthority: "workspace-config",
      isLiveBacked,
      sourceRecordKey,
      integrationId,
      entityId,
      entityType,
      requiredFields,
      filterFields,
      sortFields,
      aggregationFields,
      sortField,
      sortDirection,
      operation: operation || "sum",
      filterClauses,
      outputShape: kind === "chart" ? "number[]" : "row[]",
      location: entry.location,
      warnings: widgetWarnings
    });
    warnings.push(...widgetWarnings);
  }
  return { items, warnings };
}

function deriveWorkspaceDashboardMetadataItems(workspaceConfig, widgetItems) {
  const items = [];
  const warnings = [];
  const widgetsByDashboard = new Map();
  for (const widget of widgetItems) {
    const key = widget.location?.dashboardId || "__canvas__";
    if (!widgetsByDashboard.has(key)) widgetsByDashboard.set(key, []);
    widgetsByDashboard.get(key).push(widget);
  }
  const dashboards = Array.isArray(workspaceConfig?.dashboards) ? workspaceConfig.dashboards : [];
  for (const dashboard of dashboards) {
    if (!isPlainObject(dashboard)) continue;
    const id = safeString(dashboard.id).trim();
    if (!id) continue;
    items.push({
      kind: "workspaceDashboard",
      id,
      metadataId: stableId("dashboard", id),
      label: safeString(dashboard.name || id).trim(),
      widgetIds: (widgetsByDashboard.get(id) || []).map((widget) => widget.id),
      widgetCount: (widgetsByDashboard.get(id) || []).length
    });
  }
  const canvas = isPlainObject(workspaceConfig?.canvas) ? workspaceConfig.canvas : null;
  if (canvas) {
    items.push({
      kind: "workspaceDashboard",
      id: "__canvas__",
      metadataId: stableId("dashboard", "__canvas__"),
      label: safeString(canvas.name).trim() || "Workspace canvas",
      widgetIds: (widgetsByDashboard.get("__canvas__") || []).map((widget) => widget.id),
      widgetCount: (widgetsByDashboard.get("__canvas__") || []).length
    });
  }
  return { items, warnings };
}

/**
 * Workspace WORKFLOW metadata items + workflow node metadata items.
 *
 * Each workflow corresponds to a sandbox-environment row whose
 * `orchestrationGraph` JSON parses into a node graph. The projection
 * exposes:
 *
 *   - workflow id (objectId + rowId)
 *   - declared lifecycle status (draft / live / paused)
 *   - sandbox host + adapter
 *   - per-node input / output schema
 *   - per-node source / runtime dependencies
 *   - per-node filter clauses (typed) and required permissions
 */
function deriveWorkspaceWorkflowMetadataItems(workspaceConfig, objectItems) {
  const workflows = [];
  const nodes = [];
  const runInputs = [];
  const warnings = [];
  const objectsById = new Map(objectItems.map((object) => [object.id, object]));
  const rawObjects = Array.isArray(workspaceConfig?.dataModel?.objects)
    ? workspaceConfig.dataModel.objects
    : [];
  for (const raw of rawObjects) {
    if (!isPlainObject(raw)) continue;
    if (raw.objectType !== "sandbox-environment") continue;
    const objectId = safeString(raw.id).trim();
    if (!objectId || HIDDEN_SANDBOX_OBJECT_IDS.has(objectId)) continue;
    if (!objectsById.has(objectId)) continue;
    const rows = Array.isArray(raw.rows) ? raw.rows : [];
    for (const row of rows) {
      if (!isPlainObject(row)) continue;
      const rowName = safeString(row.Name || row.name).trim();
      if (!rowName) continue;
      const graph = parseOrchestrationGraph(row.orchestrationGraph || row.orchestrationConfig);
      const graphNodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
      const graphEdges = Array.isArray(graph?.edges) ? graph.edges : [];
      const workflowMetadataId = stableId("workflow", objectId, rowName);
      const sandboxMetadataId = stableId("sandbox", objectId, rowName);
        const rowAgentHost = safeString(row.agentHost).trim();
        const rowAdapter = safeString(row.adapter).trim();
      const inputSchema = graphNodes.length ? discoverRunInputSchema(graph) : { requiresInput: false, fields: [] };
      const inputFields = Array.isArray(inputSchema?.fields) ? inputSchema.fields : [];

      workflows.push({
        kind: "workspaceWorkflow",
        id: stableId(objectId, rowName),
        metadataId: workflowMetadataId,
        objectId,
        rowId: rowName,
        label: rowName,
        lifecycleStatus: safeString(row.lifecycleStatus).trim() || "draft",
        version: safeString(row.version).trim() || "1",
        sandboxMetadataId,
        agentHost: rowAgentHost,
        adapter: rowAdapter,
        runLocality: safeString(row.runLocality).trim(),
        nodeCount: graphNodes.length,
        edgeCount: graphEdges.length,
        requiresInput: Boolean(inputSchema?.requiresInput),
        inputFieldCount: inputFields.length
      });

      for (const node of graphNodes) {
        if (!isPlainObject(node)) continue;
        const nodeId = safeString(node.id).trim();
        if (!nodeId) continue;
        const nodeType = safeString(node.type).trim();
        const config = isPlainObject(node.config) ? node.config : {};
        const sourceType = safeString(config.sourceType).trim();
        const sourceId = safeString(config.sourceId).trim();
        const integrationId = safeString(config.integrationId).trim();
        const nodeAgentHost = safeString(config.agentHost || rowAgentHost).trim();
        const nodeAdapter = safeString(config.adapter || rowAdapter).trim();
        const filterClauses = collectFilterClauses({ op: config.filterMode, clauses: config.filters });
        const writesObjectId = safeString(config.writeObjectId || config.targetObjectId).trim();
        const readsObjectId = sourceId || safeString(config.objectId).trim();
        const isHumanInput = nodeType === "human-input" || safeString(config.action).trim() === "form";

        const inputs = isHumanInput ? inputFields : [];
        nodes.push({
          kind: "workspaceWorkflowNode",
          id: nodeId,
          metadataId: stableId("workflowNode", workflowMetadataId, nodeId),
          workflowMetadataId,
          workflowObjectId: objectId,
          workflowRowId: rowName,
          nodeType: nodeType || "unknown",
          label: safeString(node.label || nodeId).trim(),
          objectId: readsObjectId || writesObjectId,
          readsObjectId,
          writesObjectId,
          sourceType,
          integrationId,
          filterClauses,
          requiresHumanInput: isHumanInput,
          inputFieldCount: inputs.length,
          inputFieldIds: inputs.map((field) => field.id),
          sandboxMetadataId,
          agentHost: nodeAgentHost,
          adapter: nodeAdapter,
          permissions: nodeType === "api-registry-call" ? ["integration:read"] : []
        });
      }

      for (const field of inputFields) {
        runInputs.push({
          kind: "workspaceRunInput",
          id: field.id,
          metadataId: stableId("runInput", workflowMetadataId, field.id),
          workflowMetadataId,
          objectId,
          rowId: rowName,
          label: safeString(field.label).trim() || field.id,
          type: safeString(field.type).trim() || "text",
          required: Boolean(field.required),
          isSecret: Boolean(field.isSecret),
          secretRefOnly: Boolean(field.isSecret),
          sourceNodeId: "human-input"
        });
      }
    }
  }
  return { workflows, nodes, runInputs, warnings };
}

function deriveWorkspaceSandboxMetadataItems(workspaceConfig) {
  const items = [];
  const agentHosts = new Map();
  const warnings = [];
  const rawObjects = Array.isArray(workspaceConfig?.dataModel?.objects)
    ? workspaceConfig.dataModel.objects
    : [];
  for (const raw of rawObjects) {
    if (!isPlainObject(raw)) continue;
    if (raw.objectType !== "sandbox-environment") continue;
    const objectId = safeString(raw.id).trim();
    if (HIDDEN_SANDBOX_OBJECT_IDS.has(objectId)) continue;
    const rows = Array.isArray(raw.rows) ? raw.rows : [];
    for (const row of rows) {
      if (!isPlainObject(row)) continue;
      const rowName = safeString(row.Name || row.name).trim();
      if (!rowName) continue;
      const agentHost = safeString(row.agentHost).trim();
      const adapter = safeString(row.adapter).trim();
      const runLocality = safeString(row.runLocality).trim();
      const authStatus = safeString(row.agentAuthStatus).trim();
      const authProvider = safeString(row.agentAuthProvider).trim();
      items.push({
        kind: "workspaceSandbox",
        id: stableId(objectId, rowName),
        metadataId: stableId("sandbox", objectId, rowName),
        objectId,
        rowId: rowName,
        label: rowName,
        adapter,
        agentHost,
        runLocality,
        authStatus,
        authProvider,
        lifecycleStatus: safeString(row.lifecycleStatus).trim() || "draft",
        hasGraph: Boolean(parseOrchestrationGraph(row.orchestrationGraph || row.orchestrationConfig))
      });
      if (agentHost) {
        if (!agentHosts.has(agentHost)) {
          agentHosts.set(agentHost, {
            kind: "workspaceAgentHost",
            id: agentHost,
            metadataId: stableId("agentHost", agentHost),
            label: agentHost,
            adapters: new Set(),
            sandboxMetadataIds: [],
            authStatusSummary: authStatus || "unknown"
          });
        }
        const host = agentHosts.get(agentHost);
        if (adapter) host.adapters.add(adapter);
        host.sandboxMetadataIds.push(stableId("sandbox", objectId, rowName));
        // Promote the "best" auth status: active > reachable > stale > missing > unknown.
        const order = { active: 4, reachable: 3, stale: 2, missing: 1, unknown: 0 };
        const current = order[host.authStatusSummary] ?? 0;
        const incoming = order[authStatus] ?? 0;
        if (incoming > current) host.authStatusSummary = authStatus;
      }
    }
  }
  const hostItems = Array.from(agentHosts.values()).map((host) => ({
    ...host,
    adapters: Array.from(host.adapters)
  }));
  return { items, agentHosts: hostItems, warnings };
}

function deriveWorkspaceIntegrationMetadataItems(workspaceConfig) {
  const items = [];
  const entities = [];
  const integrations = isPlainObject(workspaceConfig?.dataModel)
    ? Array.isArray(workspaceConfig.dataModel.integrations)
      ? workspaceConfig.dataModel.integrations
      : []
    : [];
  for (const integration of integrations) {
    if (!isPlainObject(integration)) continue;
    const id = safeString(integration.integrationId || integration.id).trim();
    if (!id) continue;
    items.push({
      kind: "workspaceIntegration",
      id,
      metadataId: stableId("integration", id),
      label: safeString(integration.label || integration.name || id).trim(),
      lane: safeString(integration.lane).trim(),
      status: safeString(integration.status).trim()
    });
  }
  // Also derive integrations referenced by data-model bindings / widgets so
  // an unregistered integration still appears as a graph node (with a
  // warning) rather than silently disappearing.
  const seen = new Set(items.map((item) => item.id));
  const rawObjects = Array.isArray(workspaceConfig?.dataModel?.objects)
    ? workspaceConfig.dataModel.objects
    : [];
  for (const raw of rawObjects) {
    if (!isPlainObject(raw)) continue;
    const integrationId = safeString(raw.binding?.integrationId).trim();
    if (integrationId && !seen.has(integrationId)) {
      items.push({
        kind: "workspaceIntegration",
        id: integrationId,
        metadataId: stableId("integration", integrationId),
        label: integrationId,
        lane: "",
        status: "referenced",
        sourceAuthority: "data-model-binding"
      });
      seen.add(integrationId);
    }
    const entityId = safeString(raw.binding?.entityId).trim();
    const entityType = safeString(raw.binding?.entityType).trim();
    const entityLabel = safeString(raw.binding?.entityLabel).trim();
    if (integrationId && entityId) {
      entities.push({
        kind: "workspaceIntegrationEntity",
        id: entityId,
        metadataId: stableId("integrationEntity", integrationId, entityType || "any", entityId),
        integrationId,
        entityType,
        entityId,
        label: entityLabel || entityId,
        sourceObjectId: safeString(raw.id).trim()
      });
    }
  }
  return { integrations: items, entities, warnings: [] };
}

function deriveWorkspaceSourceRecordMetadataItems(workspaceSourceRecords) {
  if (!isPlainObject(workspaceSourceRecords)) return { items: [], warnings: [] };
  const items = [];
  for (const [key, value] of Object.entries(workspaceSourceRecords)) {
    if (!isPlainObject(value)) continue;
    const records = Array.isArray(value.records) ? value.records : [];
    const id = safeString(key).trim();
    // `sandbox:<objectId>:<rowSlug>` keys are sandbox-run history sidecars
    // (already represented as workspaceRunRecord items). Tag them so the
    // inspector can distinguish them from live data-source records — but
    // never inline raw records into the metadata projection.
    const isSandboxRunHistory = id.startsWith("sandbox:");
    items.push({
      kind: "workspaceSourceRecord",
      id,
      metadataId: stableId("sourceRecord", key),
      integrationId: safeString(value.integrationId).trim(),
      recordCount: Number.isFinite(value.recordCount) ? Number(value.recordCount) : records.length,
      fetchedAt: safeString(value.fetchedAt).trim(),
      sourceKind: isSandboxRunHistory ? "sandbox-run-history" : "live-source"
    });
  }
  return { items, warnings: [] };
}

function sandboxRunSourceIdFor(objectId, rowName) {
  const slug = safeString(rowName).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!objectId || !slug) return "";
  return `sandbox:${objectId}:${slug}`;
}

function projectRunRecord(parsed, { objectId, rowName, fallbackAgentHost }) {
  const runId = safeString(parsed.runId).trim() || stableId("run", objectId, rowName, safeString(parsed.ranAt));
  const workflowMetadataId = stableId("workflow", objectId, rowName);
  const sandboxMetadataId = stableId("sandbox", objectId, rowName);
  const exitCode = Number.isFinite(parsed.exitCode) ? Number(parsed.exitCode) : null;
  const ok = exitCode === 0 && !safeString(parsed.error).trim();
  return {
    item: {
      kind: "workspaceRunRecord",
      id: runId,
      metadataId: stableId("run", runId),
      runId,
      workflowMetadataId,
      sandboxMetadataId,
      objectId,
      rowId: rowName,
      ranAt: safeString(parsed.ranAt).trim(),
      durationMs: Number.isFinite(parsed.durationMs) ? Number(parsed.durationMs) : null,
      exitCode,
      ok,
      adapter: safeString(parsed.adapter).trim(),
      runtime: safeString(parsed.runtime).trim(),
      runLocality: safeString(parsed.runLocality).trim(),
      agentHost: safeString(parsed.agentHost || fallbackAgentHost).trim(),
      inputFieldCount: countInputFields(parsed.input || parsed.runInputs),
      hasOutput: Boolean(parsed.output ?? parsed.normalizedOutput),
      hasStdout: Boolean(safeString(parsed.stdout).trim()),
      hasStderr: Boolean(safeString(parsed.stderr).trim())
    },
    artifact: (parsed.output != null || parsed.normalizedOutput != null) ? {
      kind: "workspaceOutputArtifact",
      id: stableId("artifact", runId, "output"),
      metadataId: stableId("artifact", runId, "output"),
      runMetadataId: stableId("run", runId),
      artifactKind: "normalized-output",
      mediaType: typeof parsed.output === "string" || typeof parsed.normalizedOutput === "string"
        ? "text/plain"
        : "application/json",
      promotable: ok
    } : null
  };
}

function deriveWorkspaceRunRecordMetadataItems(workspaceConfig, options = {}) {
  const items = [];
  const outputArtifacts = [];
  const seenRunIds = new Set();
  const sourceRecords = isPlainObject(options?.workspaceSourceRecords) ? options.workspaceSourceRecords : null;
  const rawObjects = Array.isArray(workspaceConfig?.dataModel?.objects)
    ? workspaceConfig.dataModel.objects
    : [];
  for (const raw of rawObjects) {
    if (!isPlainObject(raw)) continue;
    if (raw.objectType !== "sandbox-environment") continue;
    const objectId = safeString(raw.id).trim();
    if (HIDDEN_SANDBOX_OBJECT_IDS.has(objectId)) continue;
    const rows = Array.isArray(raw.rows) ? raw.rows : [];
    for (const row of rows) {
      if (!isPlainObject(row)) continue;
      const rowName = safeString(row.Name || row.name).trim();
      if (!rowName) continue;
      const fallbackAgentHost = safeString(row.agentHost).trim();
      const pushProjected = (projected) => {
        if (!projected || seenRunIds.has(projected.item.runId)) return;
        seenRunIds.add(projected.item.runId);
        items.push(projected.item);
        if (projected.artifact) outputArtifacts.push(projected.artifact);
      };

      // 1) Source-record history (full lineage, up to last 50 runs persisted
      //    by POST /api/workspace/sandbox-run into growthub.source-records.json).
      if (sourceRecords) {
        const sourceId = safeString(row.lastSourceId).trim() || sandboxRunSourceIdFor(objectId, rowName);
        const sidecar = sourceId ? sourceRecords[sourceId] : null;
        const records = Array.isArray(sidecar?.records) ? sidecar.records : [];
        for (const rec of records) {
          const parsed = parseLastResponse(rec);
          if (!parsed) continue;
          pushProjected(projectRunRecord(parsed, { objectId, rowName, fallbackAgentHost }));
        }
      }

      // 2) row.lastResponse (always present after the most recent run, even
      //    when source-record persistence is read-only).
      const lastResponseRaw = row.lastResponse;
      if (lastResponseRaw == null || lastResponseRaw === "") continue;
      const parsed = parseLastResponse(lastResponseRaw);
      if (!parsed) continue;
      pushProjected(projectRunRecord(parsed, { objectId, rowName, fallbackAgentHost }));
    }
  }
  return { items, outputArtifacts, warnings: [] };
}

function parseLastResponse(value) {
  if (isPlainObject(value)) return value;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function countInputFields(value) {
  if (!isPlainObject(value)) return 0;
  const values = isPlainObject(value.values) ? value.values : {};
  return Object.keys(values).length;
}

/**
 * Workflow ACTION metadata items.
 *
 * A workflow action is the concrete behaviour configured on a workflow node
 * (e.g. `human-input → form`, `api-registry-call → request`, `transform → filter`).
 * It is the unit Twenty-style workflow sidecars render forms against.
 */
function deriveWorkspaceWorkflowActionMetadataItems(workflowNodeItems) {
  const items = [];
  for (const node of workflowNodeItems || []) {
    if (!node || typeof node !== "object") continue;
    const baseAction = node.requiresHumanInput
      ? "form"
      : node.nodeType === "api-registry-call"
        ? "request"
        : node.nodeType === "transform-filter"
          ? "filter"
          : node.nodeType === "tool-result"
            ? "result"
            : node.nodeType || "action";
    items.push({
      kind: "workspaceWorkflowAction",
      id: `${node.workflowMetadataId}::${node.id}`,
      metadataId: stableId("workflowAction", node.metadataId),
      workflowNodeMetadataId: node.metadataId,
      workflowMetadataId: node.workflowMetadataId,
      action: baseAction,
      nodeType: node.nodeType,
      requiresHumanInput: node.requiresHumanInput,
      requiresAgentHost: Boolean(node.agentHost),
      agentHost: node.agentHost,
      adapter: node.adapter,
      permissions: Array.isArray(node.permissions) ? node.permissions.slice() : []
    });
  }
  return { items, warnings: [] };
}

/**
 * Workspace PROVENANCE metadata.
 *
 * Surfaces the `provenance` block of a seeded workspace template (e.g.
 * the Project Management seed) as safe booleans + strings so the customer
 * activation layer can derive setup state without re-parsing the config.
 * The block intentionally only echoes non-secret descriptors:
 *
 *   - template slug (e.g. "project-management")
 *   - template kind (e.g. "workspace-template")
 *   - privacy descriptor (e.g. "sanitized-no-secrets-no-provider-data")
 *   - booleans: has provider api-registry row, has any configured
 *     connectionId, has any persisted source records, has at least one
 *     seeded workflow row, has at least one seeded dashboard.
 *
 * Returns a single-item list so the metadata store can stay shape-stable
 * even when no provenance block exists.
 */
function deriveWorkspaceProvenanceMetadataItems(workspaceConfig, workspaceSourceRecords) {
  const safeConfig = isPlainObject(workspaceConfig) ? workspaceConfig : {};
  const provenance = isPlainObject(safeConfig.provenance) ? safeConfig.provenance : null;
  const objects = Array.isArray(safeConfig.dataModel?.objects) ? safeConfig.dataModel.objects : [];
  let apiRegistryRows = 0;
  let nangoRows = 0;
  let connectionsConfigured = 0;
  let sandboxRows = 0;
  for (const object of objects) {
    if (!isPlainObject(object)) continue;
    const rows = Array.isArray(object.rows) ? object.rows : [];
    if (object.objectType === "api-registry") {
      apiRegistryRows += rows.length;
      for (const row of rows) {
        if (!isPlainObject(row)) continue;
        if (safeString(row.connectorKind).trim().toLowerCase() === "nango") nangoRows += 1;
        const raw = row.connectionIds ?? row.connectionId;
        if (Array.isArray(raw)) {
          if (raw.some((entry) => safeString(entry).trim())) connectionsConfigured += 1;
        } else if (safeString(raw).trim()) {
          connectionsConfigured += 1;
        }
      }
    }
    if (object.objectType === "sandbox-environment") {
      sandboxRows += rows.length;
    }
  }
  let sourceRecordKeys = 0;
  if (isPlainObject(workspaceSourceRecords)) {
    for (const value of Object.values(workspaceSourceRecords)) {
      if (!isPlainObject(value)) continue;
      const count = Number.isFinite(value.recordCount)
        ? Number(value.recordCount)
        : Array.isArray(value.records) ? value.records.length : 0;
      if (count > 0) sourceRecordKeys += 1;
    }
  }
  return {
    items: [{
      kind: "workspaceProvenance",
      id: safeString(provenance?.template).trim() || "blank",
      metadataId: stableId("provenance", safeString(provenance?.template).trim() || "blank"),
      template: safeString(provenance?.template).trim() || "blank",
      templateKind: safeString(provenance?.templateKind).trim(),
      privacy: safeString(provenance?.privacy).trim(),
      mirrors: safeString(provenance?.mirrors).trim(),
      hasProvenance: Boolean(provenance),
      apiRegistryRows,
      nangoRows,
      connectionsConfigured,
      sandboxRows,
      hydratedSourceRecordKeys: sourceRecordKeys,
      hasSeededDashboard: Array.isArray(safeConfig.dashboards) && safeConfig.dashboards.length > 0
    }],
    warnings: []
  };
}

/**
 * Worker kit metadata.
 *
 * The metadata graph is scoped to a single workspace; the worker kit it
 * runs inside is exposed as a single anchor node so the inspector can show
 * "this workspace is materialized from kit X". Worker kit drift, fork
 * authority, and remote sync still belong to the existing CLI/fork
 * authority surfaces — this is read-only.
 */
function deriveWorkspaceWorkerKitMetadataItems(workspaceConfig) {
  const id = safeString(workspaceConfig?.kit?.id || "growthub-custom-workspace-starter-v1").trim();
  const label = safeString(workspaceConfig?.kit?.name || "Growthub Custom Workspace Starter Kit").trim();
  return {
    items: [{
      kind: "workspaceWorkerKit",
      id,
      metadataId: stableId("workerKit", id),
      label,
      version: safeString(workspaceConfig?.kit?.version || "").trim(),
      family: "studio"
    }],
    warnings: []
  };
}

/**
 * Pipeline health — derived from the sandbox + run set.
 *
 * Aggregates "executable pipelines" (sandboxes with a graph) and their
 * most recent observed status. A pipeline is healthy when its latest run
 * exited 0 within the last 24h; unhealthy when the latest run failed;
 * unknown when no run has been recorded yet. This is intentionally a
 * coarse summary — finer signals (retries, queue depth) are out of scope
 * for V1.
 */
function deriveWorkspacePipelineHealthMetadataItems(sandboxItems, runItems) {
  const items = [];
  const latestByWorkflow = new Map();
  for (const run of runItems || []) {
    const key = run.workflowMetadataId;
    const existing = latestByWorkflow.get(key);
    const ranAtMs = Date.parse(run.ranAt || "");
    const existingMs = existing ? Date.parse(existing.ranAt || "") : -Infinity;
    if (!existing || (Number.isFinite(ranAtMs) && ranAtMs > existingMs)) {
      latestByWorkflow.set(key, run);
    }
  }
  for (const sandbox of sandboxItems || []) {
    if (!sandbox || typeof sandbox !== "object") continue;
    if (!sandbox.hasGraph) continue;
    const workflowMetadataId = stableId("workflow", sandbox.objectId, sandbox.rowId);
    const latest = latestByWorkflow.get(workflowMetadataId) || null;
    let status = "unknown";
    if (latest) {
      status = latest.ok ? "healthy" : "unhealthy";
    } else if (sandbox.lifecycleStatus === "live") {
      status = "untested";
    }
    items.push({
      kind: "workspacePipelineHealth",
      id: stableId(sandbox.objectId, sandbox.rowId),
      metadataId: stableId("pipelineHealth", sandbox.objectId, sandbox.rowId),
      sandboxMetadataId: sandbox.metadataId,
      workflowMetadataId,
      label: sandbox.label,
      lifecycleStatus: sandbox.lifecycleStatus,
      authStatus: sandbox.authStatus,
      status,
      latestRunId: latest ? latest.runId : "",
      latestRanAt: latest ? latest.ranAt : "",
      latestOk: latest ? latest.ok : null
    });
  }
  return { items, warnings: [] };
}

/**
 * Build the workspace metadata store from authoritative inputs.
 *
 * Inputs:
 *   - workspaceConfig:           parsed growthub.config.json (governed)
 *   - workspaceSourceRecords:    parsed growthub.source-records.json (sidecar)
 *
 * Returns a typed envelope. Never throws. Unknown shapes contribute warnings.
 */
function buildWorkspaceMetadataStore({
  workspaceConfig,
  workspaceSourceRecords
} = {}) {
  const warnings = [];
  const safeConfig = isPlainObject(workspaceConfig) ? workspaceConfig : {};
  const safeSourceRecords = isPlainObject(workspaceSourceRecords) ? workspaceSourceRecords : {};

  const objects = deriveWorkspaceObjectMetadataItems(safeConfig);
  warnings.push(...objects.warnings);

  const fields = deriveWorkspaceFieldMetadataItems(safeConfig, objects.items);
  warnings.push(...fields.warnings);

  const views = deriveWorkspaceViewMetadataItems(safeConfig, objects.items);
  warnings.push(...views.warnings);

  const widgets = deriveWorkspaceWidgetMetadataItems(safeConfig, objects.items);
  warnings.push(...widgets.warnings);

  const dashboards = deriveWorkspaceDashboardMetadataItems(safeConfig, widgets.items);
  warnings.push(...dashboards.warnings);

  const workflows = deriveWorkspaceWorkflowMetadataItems(safeConfig, objects.items);
  warnings.push(...workflows.warnings);

  const filters = deriveWorkspaceFilterMetadataItems(widgets.items, workflows.nodes);
  const sorts = deriveWorkspaceSortMetadataItems(widgets.items);

  const sandboxes = deriveWorkspaceSandboxMetadataItems(safeConfig);
  warnings.push(...sandboxes.warnings);

  const integrations = deriveWorkspaceIntegrationMetadataItems(safeConfig);
  warnings.push(...integrations.warnings);

  const sourceRecords = deriveWorkspaceSourceRecordMetadataItems(safeSourceRecords);
  warnings.push(...sourceRecords.warnings);

  const runs = deriveWorkspaceRunRecordMetadataItems(safeConfig, { workspaceSourceRecords: safeSourceRecords });
  warnings.push(...runs.warnings);

  const actions = deriveWorkspaceWorkflowActionMetadataItems(workflows.nodes);
  warnings.push(...actions.warnings);

  const workerKits = deriveWorkspaceWorkerKitMetadataItems(safeConfig);
  warnings.push(...workerKits.warnings);

  const provenance = deriveWorkspaceProvenanceMetadataItems(safeConfig, safeSourceRecords);
  warnings.push(...provenance.warnings);

  const pipelineHealth = deriveWorkspacePipelineHealthMetadataItems(sandboxes.items, runs.items);
  warnings.push(...pipelineHealth.warnings);

  return {
    kind: METADATA_STORE_KIND,
    version: METADATA_STORE_VERSION,
    objects: objects.items,
    fields: fields.items,
    views: views.items,
    filters: filters.items,
    sorts: sorts.items,
    widgets: widgets.items,
    dashboards: dashboards.items,
    workflows: workflows.workflows,
    workflowNodes: workflows.nodes,
    workflowActions: actions.items,
    runInputs: workflows.runInputs,
    agentHosts: sandboxes.agentHosts,
    sandboxes: sandboxes.items,
    integrations: integrations.integrations,
    integrationEntities: integrations.entities,
    sourceRecords: sourceRecords.items,
    runs: runs.items,
    outputArtifacts: runs.outputArtifacts,
    workerKits: workerKits.items,
    provenance: provenance.items,
    pipelineHealth: pipelineHealth.items,
    warnings
  };
}

// Spec alias: `deriveWorkspaceRunMetadataItems(sourceRecords)` — exposes the
// same per-run projection but resolved from the run-records sidecar key
// space (sandbox runs are persisted both in `growthub.source-records.json`
// and `row.lastResponse`; this helper accepts either).
function deriveWorkspaceRunMetadataItems(input) {
  if (isPlainObject(input) && Array.isArray(input?.dataModel?.objects)) {
    return deriveWorkspaceRunRecordMetadataItems(input);
  }
  // Treat the input as a sourceRecords-shaped sidecar: each value is a
  // run-record envelope.
  const items = [];
  const outputArtifacts = [];
  const safe = isPlainObject(input) ? input : {};
  for (const [key, value] of Object.entries(safe)) {
    const parsed = parseLastResponse(value);
    if (!parsed) continue;
    const runId = safeString(parsed.runId).trim() || stableId("run", key);
    const exitCode = Number.isFinite(parsed.exitCode) ? Number(parsed.exitCode) : null;
    const ok = exitCode === 0 && !safeString(parsed.error).trim();
    items.push({
      kind: "workspaceRunRecord",
      id: runId,
      metadataId: stableId("run", runId),
      runId,
      workflowMetadataId: "",
      sandboxMetadataId: "",
      objectId: "",
      rowId: "",
      ranAt: safeString(parsed.ranAt).trim(),
      durationMs: Number.isFinite(parsed.durationMs) ? Number(parsed.durationMs) : null,
      exitCode,
      ok,
      adapter: safeString(parsed.adapter).trim(),
      runtime: safeString(parsed.runtime).trim(),
      runLocality: safeString(parsed.runLocality).trim(),
      agentHost: safeString(parsed.agentHost).trim(),
      inputFieldCount: countInputFields(parsed.input || parsed.runInputs),
      hasOutput: Boolean(parsed.output ?? parsed.normalizedOutput),
      hasStdout: Boolean(safeString(parsed.stdout).trim()),
      hasStderr: Boolean(safeString(parsed.stderr).trim())
    });
    if (parsed.output != null || parsed.normalizedOutput != null) {
      outputArtifacts.push({
        kind: "workspaceOutputArtifact",
        id: stableId("artifact", runId, "output"),
        metadataId: stableId("artifact", runId, "output"),
        runMetadataId: stableId("run", runId),
        artifactKind: "normalized-output",
        mediaType: typeof parsed.output === "string" || typeof parsed.normalizedOutput === "string"
          ? "text/plain"
          : "application/json",
        promotable: ok
      });
    }
  }
  return { items, outputArtifacts, warnings: [] };
}

export {
  METADATA_STORE_KIND,
  METADATA_STORE_VERSION,
  HIDDEN_SANDBOX_OBJECT_IDS,
  buildWorkspaceMetadataStore,
  deriveWorkspaceObjectMetadataItems,
  deriveWorkspaceFieldMetadataItems,
  deriveWorkspaceViewMetadataItems,
  deriveWorkspaceFilterMetadataItems,
  deriveWorkspaceSortMetadataItems,
  deriveWorkspaceWidgetMetadataItems,
  deriveWorkspaceDashboardMetadataItems,
  deriveWorkspaceWorkflowMetadataItems,
  deriveWorkspaceWorkflowActionMetadataItems,
  deriveWorkspaceSandboxMetadataItems,
  deriveWorkspaceIntegrationMetadataItems,
  deriveWorkspaceSourceRecordMetadataItems,
  deriveWorkspaceRunRecordMetadataItems,
  deriveWorkspaceRunMetadataItems,
  deriveWorkspaceWorkerKitMetadataItems,
  deriveWorkspaceProvenanceMetadataItems,
  deriveWorkspacePipelineHealthMetadataItems,
  isSecretKey
};
