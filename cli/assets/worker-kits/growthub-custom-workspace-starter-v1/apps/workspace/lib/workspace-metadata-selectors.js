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

export {
  selectWidgetRequiredFields,
  selectWorkflowNodeInputSchema,
  selectObjectFilterableFields,
  selectObjectSortableFields,
  selectObjectAggregatableFields,
  selectRunLineage,
  selectStaleMetadataGroups,
  selectImpactedNodes
};
