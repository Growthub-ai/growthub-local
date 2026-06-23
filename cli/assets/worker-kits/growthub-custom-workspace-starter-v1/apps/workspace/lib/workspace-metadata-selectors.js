/**
 * Growthub Workspace Metadata Graph V1 — reusable selectors.
 *
 * Pure functions that operate on the metadata store + graph envelopes.
 * Centralising selection here avoids re-deriving widget required fields,
 * workflow input schemas, or stale-group decisions inside UI components.
 *
 * Each selector is read-only and side-effect free. None of them call fetch,
 * mutate the workspace config, or read secrets.
 */

import { findDependents } from "./workspace-metadata-graph.js";

function safeString(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

function widgetById(metadataStore, widgetId) {
  const id = safeString(widgetId).trim();
  if (!id) return null;
  return (metadataStore?.widgets || []).find((widget) => widget.id === id) || null;
}

function workflowNodeByMetadataId(metadataStore, workflowNodeMetadataId) {
  const id = safeString(workflowNodeMetadataId).trim();
  if (!id) return null;
  return (metadataStore?.workflowNodes || []).find((node) => node.metadataId === id) || null;
}

function objectById(metadataStore, objectId) {
  const id = safeString(objectId).trim();
  if (!id) return null;
  return (metadataStore?.objects || []).find((object) => object.id === id) || null;
}

function fieldsForObject(metadataStore, objectId) {
  const id = safeString(objectId).trim();
  if (!id) return [];
  return (metadataStore?.fields || []).filter((field) => field.objectId === id);
}

/**
 * Required fields for a widget — the typed dependency contract the chart
 * hydration pipeline consumes (x/y axis + groupBy + sort/filter fields).
 *
 * Returns:
 *   {
 *     required:    string[]   axis fields the chart needs to compute values
 *     filter:      string[]   fields referenced by filter clauses
 *     sort:        string[]   fields used for ordering
 *     aggregation: string[]   numeric fields the operation consumes
 *     warnings:    string[]   widget-level warnings
 *   }
 */
function selectWidgetRequiredFields(metadataStore, widgetId) {
  const widget = widgetById(metadataStore, widgetId);
  if (!widget) {
    return { required: [], filter: [], sort: [], aggregation: [], warnings: ["widget not found"] };
  }
  return {
    required: widget.requiredFields.slice(),
    filter: widget.filterFields.slice(),
    sort: widget.sortFields.slice(),
    aggregation: widget.aggregationFields.slice(),
    warnings: widget.warnings.slice()
  };
}

/**
 * Input schema for a workflow node — typed, redacted, ready for sidecar
 * rendering. Returns `{ fields, requiresInput }` shaped like the manual
 * run-input contract.
 */
function selectWorkflowNodeInputSchema(metadataStore, workflowNodeMetadataId) {
  const node = workflowNodeByMetadataId(metadataStore, workflowNodeMetadataId);
  if (!node) return { fields: [], requiresInput: false };
  if (!node.requiresHumanInput) return { fields: [], requiresInput: false };
  const fields = (metadataStore.runInputs || []).filter((input) => input.workflowMetadataId === node.workflowMetadataId);
  return {
    requiresInput: fields.length > 0,
    fields: fields.map((field) => ({
      id: field.id,
      label: field.label,
      type: field.type,
      required: field.required,
      isSecret: field.isSecret,
      secretRefOnly: field.secretRefOnly
    }))
  };
}

function selectObjectFilterableFields(metadataStore, objectId) {
  return fieldsForObject(metadataStore, objectId).filter((field) => field.isFilterable);
}

function selectObjectSortableFields(metadataStore, objectId) {
  return fieldsForObject(metadataStore, objectId).filter((field) => field.isSortable);
}

function selectObjectAggregatableFields(metadataStore, objectId) {
  return fieldsForObject(metadataStore, objectId).filter((field) => field.isAggregatable);
}

/**
 * Lineage for a single run: workflow / sandbox / agent host / inputs / output
 * artifact. Returns flat IDs the UI can resolve through the metadata store.
 */
function selectRunLineage(metadataStore, runId) {
  const id = safeString(runId).trim();
  if (!id) return null;
  const run = (metadataStore?.runs || []).find((entry) => entry.runId === id || entry.id === id);
  if (!run) return null;
  const workflow = (metadataStore.workflows || []).find((entry) => entry.metadataId === run.workflowMetadataId);
  const sandbox = (metadataStore.sandboxes || []).find((entry) => entry.metadataId === run.sandboxMetadataId);
  const agentHost = (metadataStore.agentHosts || []).find((entry) => entry.id === run.agentHost);
  const artifacts = (metadataStore.outputArtifacts || []).filter((entry) => entry.runMetadataId === run.metadataId);
  return {
    run,
    workflow: workflow || null,
    sandbox: sandbox || null,
    agentHost: agentHost || null,
    artifacts,
    inputFieldCount: run.inputFieldCount
  };
}

/**
 * Compute which metadata groups become stale given a change event.
 *
 * `changeEvent` shape:
 *   { kind: "object" | "field" | "sourceRecord" | "workflow" | "agentHost" | "widget", id: string }
 *
 * The reasoning mirrors Twenty's `useLoadStaleMetadataEntities`:
 * widgets become stale when fields they read change; workflows become
 * stale when input schemas or agent hosts change; dashboards become stale
 * when their widgets do; etc.
 *
 * Returns:
 *   { groups: string[], reasons: string[] }
 */
function selectStaleMetadataGroups(metadataStore, changeEvent) {
  if (!metadataStore || !changeEvent || typeof changeEvent !== "object") {
    return { groups: [], reasons: [] };
  }
  const kind = safeString(changeEvent.kind).trim();
  const id = safeString(changeEvent.id).trim();
  if (!kind || !id) return { groups: [], reasons: [] };
  const groups = new Set();
  const reasons = [];

  const widgetsByObject = (objectId) => (metadataStore.widgets || []).filter((widget) => widget.objectId === objectId);
  const widgetsByField = (objectId, fieldId) => (metadataStore.widgets || []).filter((widget) =>
    widget.objectId === objectId && (
      widget.requiredFields.includes(fieldId) ||
      widget.filterFields.includes(fieldId) ||
      widget.sortFields.includes(fieldId)
    )
  );
  const workflowNodesByObject = (objectId) => (metadataStore.workflowNodes || []).filter((node) =>
    node.readsObjectId === objectId || node.writesObjectId === objectId
  );

  if (kind === "object") {
    const widgets = widgetsByObject(id);
    if (widgets.length) {
      groups.add("workspaceWidgetMetadataItems");
      groups.add("workspaceDashboardMetadataItems");
      groups.add("workspaceFilterMetadataItems");
      groups.add("workspaceSortMetadataItems");
      reasons.push(`${widgets.length} widget(s) bound to object "${id}"`);
    }
    const nodes = workflowNodesByObject(id);
    if (nodes.length) {
      groups.add("workspaceWorkflowMetadataItems");
      groups.add("workspaceWorkflowNodeMetadataItems");
      reasons.push(`${nodes.length} workflow node(s) reference object "${id}"`);
    }
  }

  if (kind === "field") {
    const [objectId, fieldId] = id.split("::");
    if (objectId && fieldId) {
      const widgets = widgetsByField(objectId, fieldId);
      if (widgets.length) {
        groups.add("workspaceWidgetMetadataItems");
        groups.add("workspaceDashboardMetadataItems");
        reasons.push(`${widgets.length} widget(s) reference field "${objectId}.${fieldId}"`);
      }
    }
  }

  if (kind === "sourceRecord") {
    const widgets = (metadataStore.widgets || []).filter((widget) => widget.sourceRecordKey === id);
    if (widgets.length) {
      groups.add("workspaceWidgetMetadataItems");
      groups.add("workspaceSourceRecordMetadataItems");
      reasons.push(`${widgets.length} widget(s) backed by source record "${id}"`);
    }
    const objects = (metadataStore.objects || []).filter((object) => object.sourceId === id);
    if (objects.length) {
      groups.add("workspaceObjectMetadataItems");
      reasons.push(`${objects.length} object(s) backed by source record "${id}"`);
    }
  }

  if (kind === "workflow") {
    groups.add("workspaceWorkflowMetadataItems");
    groups.add("workspaceWorkflowNodeMetadataItems");
    groups.add("workspaceRunInputMetadataItems");
    reasons.push(`workflow "${id}" graph changed — run inputs and node dependencies may be stale`);
  }

  if (kind === "agentHost") {
    groups.add("workspaceAgentHostMetadataItems");
    groups.add("workspaceSandboxMetadataItems");
    groups.add("workspaceWorkflowMetadataItems");
    reasons.push(`agent host "${id}" readiness changed — sandbox readiness may be stale`);
  }

  if (kind === "widget") {
    groups.add("workspaceWidgetMetadataItems");
    groups.add("workspaceDashboardMetadataItems");
    reasons.push(`widget "${id}" changed`);
  }

  return { groups: Array.from(groups), reasons };
}

/**
 * Convenience selector: nodes affected by removing a node from the graph.
 * Used by the inspector to warn the user before they delete a field /
 * source / widget the rest of the workspace depends on.
 */
function selectImpactedNodes(graph, nodeId) {
  if (!graph || !nodeId) return [];
  return findDependents(graph, nodeId);
}

/**
 * Project the full metadata graph down to a curated, read-only "Workspace
 * Map" view — the schema/relationship canvas that lets an operator see, at a
 * glance, how sources feed objects, and which workflows and dashboards
 * consume them.
 *
 * This is deliberately a SELECTOR (not component logic): rolling multi-hop
 * relationships up into direct edges (workflow→object via workflowNode,
 * dashboard→object via widget) is graph derivation and belongs in the pure,
 * tested layer. The canvas component only positions and renders what this
 * returns.
 *
 * Rendered node types (everything else in the graph is intentionally
 * collapsed away to keep the map legible):
 *   - dataModelObject  (centre column)
 *   - sourceRecord     (left / inputs)
 *   - integration      (left / inputs)
 *   - workflow         (right / consumers)
 *   - dashboard        (right / consumers)
 *
 * Rolled-up edges (every endpoint is one of the rendered nodes above):
 *   sourceRecord  feeds  dataModelObject   (from object backedBySourceRecord)
 *   integration   feeds  dataModelObject   (from object boundToIntegration)
 *   workflow      reads/writes  dataModelObject (via workflowNode read/write)
 *   dashboard     reads  dataModelObject   (via widget bindsToObject)
 *
 * Object cards carry up to `fieldLimit` non-secret field labels. Secret
 * fields are dropped — they never reach the map. Pure, deterministic, and
 * never throws.
 */
function projectWorkspaceMap(graph, options = {}) {
  const empty = { kind: "growthub-workspace-map-v1", version: 1, columns: [], nodes: [], edges: [], warnings: [] };
  if (!graph || typeof graph !== "object") {
    return { ...empty, warnings: ["graph missing"] };
  }
  const fieldLimit = Number.isFinite(options.fieldLimit) ? Math.max(0, options.fieldLimit) : 6;
  const rawNodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const rawEdges = Array.isArray(graph.edges) ? graph.edges : [];
  const nodesById = new Map(rawNodes.map((node) => [node.id, node]));

  // Collect up to `fieldLimit` non-secret field labels per object id.
  const fieldsByObjectId = new Map();
  for (const node of rawNodes) {
    if (node.type !== "field") continue;
    const summary = node.summary || {};
    if (summary.isSecret) continue;
    const objectId = safeString(summary.objectId).trim();
    if (!objectId) continue;
    const list = fieldsByObjectId.get(objectId) || [];
    if (list.length < fieldLimit) list.push({ label: safeString(node.label).trim(), type: safeString(summary.type).trim() });
    fieldsByObjectId.set(objectId, list);
  }
  const fieldCountByObjectId = new Map();
  for (const node of rawNodes) {
    if (node.type !== "field") continue;
    const objectId = safeString(node.summary?.objectId).trim();
    if (!objectId) continue;
    fieldCountByObjectId.set(objectId, (fieldCountByObjectId.get(objectId) || 0) + 1);
  }

  const RENDERED = {
    dataModelObject: { column: "objects" },
    sourceRecord: { column: "sources" },
    integration: { column: "sources" },
    workflow: { column: "consumers" },
    dashboard: { column: "consumers" }
  };

  const nodes = [];
  const renderedIds = new Set();
  for (const node of rawNodes) {
    const spec = RENDERED[node.type];
    if (!spec) continue;
    const summary = node.summary || {};
    let card;
    if (node.type === "dataModelObject") {
      card = {
        objectId: safeString(summary.objectId).trim(),
        objectType: safeString(summary.objectType).trim(),
        isLiveBacked: Boolean(summary.isLiveBacked),
        readOnly: Boolean(summary.readOnly),
        rowCount: Number(summary.rowCount) || 0,
        fields: fieldsByObjectId.get(safeString(summary.objectId).trim()) || [],
        fieldCount: fieldCountByObjectId.get(safeString(summary.objectId).trim()) || 0
      };
    } else if (node.type === "sourceRecord") {
      card = {
        recordCount: Number(summary.recordCount) || 0,
        fetchedAt: safeString(summary.fetchedAt).trim(),
        integrationId: safeString(summary.integrationId).trim()
      };
    } else if (node.type === "integration") {
      card = { lane: safeString(summary.lane).trim(), status: safeString(summary.status).trim() };
    } else if (node.type === "workflow") {
      card = {
        objectId: safeString(summary.objectId).trim(),
        rowId: safeString(summary.rowId).trim(),
        lifecycleStatus: safeString(summary.lifecycleStatus).trim(),
        nodeCount: Number(summary.nodeCount) || 0,
        requiresInput: Boolean(summary.requiresInput)
      };
    } else if (node.type === "dashboard") {
      card = { widgetCount: Number(summary.widgetCount) || 0 };
    } else {
      card = {};
    }
    nodes.push({ id: node.id, type: node.type, label: safeString(node.label).trim(), column: spec.column, card });
    renderedIds.add(node.id);
  }

  // ── Roll up edges to direct rendered-node → rendered-node relationships.
  const edges = [];
  const seenEdges = new Set();
  const pushEdge = (from, to, relation) => {
    if (!from || !to || from === to) return;
    if (!renderedIds.has(from) || !renderedIds.has(to)) return;
    const id = `${from}::${relation}::${to}`;
    if (seenEdges.has(id)) return;
    seenEdges.add(id);
    edges.push({ id, from, to, relation });
  };

  // workflowNode → workflow (containsNode is workflow→workflowNode), and
  // widget → dashboard (containsWidget is dashboard→widget).
  const workflowByNodeId = new Map();
  const dashboardByWidgetId = new Map();
  for (const edge of rawEdges) {
    if (edge.relation === "containsNode") workflowByNodeId.set(edge.to, edge.from);
    if (edge.relation === "containsWidget") dashboardByWidgetId.set(edge.to, edge.from);
  }

  for (const edge of rawEdges) {
    // sourceRecord feeds object / integration feeds object (object → x).
    if (edge.relation === "backedBySourceRecord" && nodesById.get(edge.from)?.type === "dataModelObject") {
      pushEdge(edge.to, edge.from, "feeds");
    } else if (edge.relation === "boundToIntegration" && nodesById.get(edge.from)?.type === "dataModelObject") {
      pushEdge(edge.to, edge.from, "feeds");
    } else if (edge.relation === "readsObject" && nodesById.get(edge.from)?.type === "workflowNode") {
      const workflowId = workflowByNodeId.get(edge.from);
      if (workflowId) pushEdge(workflowId, edge.to, "reads");
    } else if (edge.relation === "writesObject" && nodesById.get(edge.from)?.type === "workflowNode") {
      const workflowId = workflowByNodeId.get(edge.from);
      if (workflowId) pushEdge(workflowId, edge.to, "writes");
    } else if (edge.relation === "bindsToObject" && nodesById.get(edge.from)?.type === "widget") {
      const dashboardId = dashboardByWidgetId.get(edge.from);
      if (dashboardId) pushEdge(dashboardId, edge.to, "reads");
    }
  }

  const columns = [
    { key: "sources", label: "Sources", nodeIds: nodes.filter((n) => n.column === "sources").map((n) => n.id) },
    { key: "objects", label: "Objects", nodeIds: nodes.filter((n) => n.column === "objects").map((n) => n.id) },
    { key: "consumers", label: "Workflows & dashboards", nodeIds: nodes.filter((n) => n.column === "consumers").map((n) => n.id) }
  ];

  return { kind: "growthub-workspace-map-v1", version: 1, columns, nodes, edges, warnings: [] };
}

export {
  selectWidgetRequiredFields,
  selectWorkflowNodeInputSchema,
  selectObjectFilterableFields,
  selectObjectSortableFields,
  selectObjectAggregatableFields,
  selectRunLineage,
  selectStaleMetadataGroups,
  selectImpactedNodes,
  projectWorkspaceMap
};
