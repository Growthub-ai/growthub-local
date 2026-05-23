/**
 * Growthub Workspace Metadata Graph V1 — graph builder.
 *
 * Converts the typed metadata store from `workspace-metadata-store.js` into
 * a uniform node + edge graph that UI and agents can traverse to ask:
 *
 *   - what does this widget depend on?
 *   - which dashboards become stale if I edit this field?
 *   - which workflows write to this object?
 *   - which run produced this output artifact?
 *
 * The graph is read-only and derived. It contains no secrets. Nodes carry
 * a compact `summary` payload — enough for an inspector chip, never enough
 * to leak source rows or auth material.
 *
 * Edge taxonomy (V1):
 *
 *   dashboard         containsWidget        widget
 *   widget            bindsToObject         dataModelObject
 *   widget            usesField             field
 *   widget            filteredByField       field
 *   widget            sortedByField         field
 *   widget            backedBySourceRecord  sourceRecord
 *   widget            scopedToEntity        integrationEntity
 *   workflow          containsNode          workflowNode
 *   workflow          usesSandbox           sandbox
 *   workflowNode      readsObject           dataModelObject
 *   workflowNode      writesObject          dataModelObject
 *   workflowNode      requiresRunInput      runInput
 *   workflowNode      callsIntegration      integration
 *   sandbox           usesAgentHost         agentHost
 *   run               executedWorkflow      workflow
 *   run               executedSandbox       sandbox
 *   run               usedAgentHost         agentHost
 *   run               producedArtifact      outputArtifact
 *   integrationEntity belongsToIntegration  integration
 *   dataModelObject   backedBySourceRecord  sourceRecord
 *   dataModelObject   scopedToEntity        integrationEntity
 *
 * Invariants:
 *   - Edge endpoints always reference real nodes — orphan edges are not
 *     emitted. (A missing endpoint becomes a warning on the store, not a
 *     dangling reference.)
 *   - Edge IDs are deterministic so consumers can diff between calls.
 */

const GRAPH_KIND = "growthub-workspace-metadata-graph-v1";
const GRAPH_VERSION = 1;

function safeString(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

function makeNode(type, id, summary, item) {
  return {
    id: safeString(id).trim(),
    type,
    label: safeString(summary.label || id).trim(),
    summary,
    metadataId: safeString(item?.metadataId).trim() || safeString(id).trim()
  };
}

function makeEdge(from, fromType, to, toType, relation) {
  return {
    id: `${from}::${relation}::${to}`,
    from,
    fromType,
    to,
    toType,
    relation
  };
}

/**
 * Build the metadata graph envelope from a metadata store.
 *
 * Returns `{ kind, version, nodes, edges, warnings }`. Pure, deterministic,
 * never mutates the store.
 */
function buildWorkspaceMetadataGraph(metadataStore) {
  if (!metadataStore || typeof metadataStore !== "object") {
    return { kind: GRAPH_KIND, version: GRAPH_VERSION, nodes: [], edges: [], warnings: ["metadataStore missing"] };
  }
  const nodes = [];
  const edges = [];
  const warnings = [];

  const nodeIds = new Set();
  const addNode = (node) => {
    if (!node.id || nodeIds.has(node.id)) return;
    nodeIds.add(node.id);
    nodes.push(node);
  };
  const addEdge = (from, fromType, to, toType, relation) => {
    if (!from || !to) return;
    if (!nodeIds.has(from) || !nodeIds.has(to)) return;
    edges.push(makeEdge(from, fromType, to, toType, relation));
  };

  for (const object of metadataStore.objects || []) {
    addNode(makeNode("dataModelObject", object.metadataId, {
      label: object.label,
      objectId: object.id,
      objectType: object.objectType,
      isLiveBacked: object.isLiveBacked,
      readOnly: object.readOnly,
      rowCount: object.rowCount,
      sourceAuthority: object.sourceAuthority
    }, object));
  }

  for (const field of metadataStore.fields || []) {
    addNode(makeNode("field", field.metadataId, {
      label: field.label,
      objectId: field.objectId,
      type: field.type,
      isFilterable: field.isFilterable,
      isSortable: field.isSortable,
      isChartXAxis: field.isChartXAxis,
      isChartYAxis: field.isChartYAxis,
      isAggregatable: field.isAggregatable,
      isSecret: field.isSecret
    }, field));
  }

  for (const view of metadataStore.views || []) {
    addNode(makeNode("view", view.metadataId, {
      label: view.label,
      objectId: view.objectId,
      columns: view.columns,
      filterCount: view.filterCount
    }, view));
  }

  for (const dashboard of metadataStore.dashboards || []) {
    addNode(makeNode("dashboard", dashboard.metadataId, {
      label: dashboard.label,
      widgetCount: dashboard.widgetCount
    }, dashboard));
  }

  for (const filter of metadataStore.filters || []) {
    addNode(makeNode("filter", filter.metadataId, {
      label: `${filter.fieldId} ${filter.operator}`,
      scope: filter.scope,
      objectId: filter.objectId,
      fieldId: filter.fieldId,
      operator: filter.operator,
      hasValue: filter.hasValue
    }, filter));
  }

  for (const sort of metadataStore.sorts || []) {
    addNode(makeNode("sort", sort.metadataId, {
      label: `${sort.fieldId} ${sort.direction}`,
      scope: sort.scope,
      objectId: sort.objectId,
      fieldId: sort.fieldId,
      direction: sort.direction
    }, sort));
  }

  for (const widget of metadataStore.widgets || []) {
    addNode(makeNode("widget", widget.metadataId, {
      label: widget.title,
      widgetKind: widget.widgetKind,
      objectId: widget.objectId,
      requiredFields: widget.requiredFields,
      filterFields: widget.filterFields,
      sortFields: widget.sortFields,
      aggregationFields: widget.aggregationFields,
      operation: widget.operation,
      outputShape: widget.outputShape,
      isLiveBacked: widget.isLiveBacked,
      sourceRecordKey: widget.sourceRecordKey,
      integrationId: widget.integrationId,
      entityId: widget.entityId,
      warningCount: widget.warnings.length
    }, widget));
  }

  for (const workflow of metadataStore.workflows || []) {
    addNode(makeNode("workflow", workflow.metadataId, {
      label: workflow.label,
      objectId: workflow.objectId,
      rowId: workflow.rowId,
      lifecycleStatus: workflow.lifecycleStatus,
      nodeCount: workflow.nodeCount,
      requiresInput: workflow.requiresInput,
      inputFieldCount: workflow.inputFieldCount
    }, workflow));
  }

  for (const node of metadataStore.workflowNodes || []) {
    addNode(makeNode("workflowNode", node.metadataId, {
      label: node.label,
      nodeType: node.nodeType,
      objectId: node.objectId,
      readsObjectId: node.readsObjectId,
      writesObjectId: node.writesObjectId,
      sourceType: node.sourceType,
      integrationId: node.integrationId,
      requiresHumanInput: node.requiresHumanInput,
      inputFieldCount: node.inputFieldCount,
      permissions: node.permissions
    }, node));
  }

  for (const runInput of metadataStore.runInputs || []) {
    addNode(makeNode("runInput", runInput.metadataId, {
      label: runInput.label,
      type: runInput.type,
      required: runInput.required,
      isSecret: runInput.isSecret,
      secretRefOnly: runInput.secretRefOnly,
      sourceNodeId: runInput.sourceNodeId
    }, runInput));
  }

  for (const host of metadataStore.agentHosts || []) {
    addNode(makeNode("agentHost", host.metadataId, {
      label: host.label,
      adapters: host.adapters,
      authStatusSummary: host.authStatusSummary,
      sandboxCount: host.sandboxMetadataIds.length
    }, host));
  }

  for (const sandbox of metadataStore.sandboxes || []) {
    addNode(makeNode("sandbox", sandbox.metadataId, {
      label: sandbox.label,
      objectId: sandbox.objectId,
      rowId: sandbox.rowId,
      adapter: sandbox.adapter,
      agentHost: sandbox.agentHost,
      runLocality: sandbox.runLocality,
      authStatus: sandbox.authStatus,
      authProvider: sandbox.authProvider,
      lifecycleStatus: sandbox.lifecycleStatus,
      hasGraph: sandbox.hasGraph
    }, sandbox));
  }

  for (const integration of metadataStore.integrations || []) {
    addNode(makeNode("integration", integration.metadataId, {
      label: integration.label,
      lane: integration.lane,
      status: integration.status
    }, integration));
  }

  for (const entity of metadataStore.integrationEntities || []) {
    addNode(makeNode("integrationEntity", entity.metadataId, {
      label: entity.label,
      integrationId: entity.integrationId,
      entityType: entity.entityType,
      sourceObjectId: entity.sourceObjectId
    }, entity));
  }

  for (const sourceRecord of metadataStore.sourceRecords || []) {
    addNode(makeNode("sourceRecord", sourceRecord.metadataId, {
      label: sourceRecord.id,
      integrationId: sourceRecord.integrationId,
      recordCount: sourceRecord.recordCount,
      fetchedAt: sourceRecord.fetchedAt
    }, sourceRecord));
  }

  for (const run of metadataStore.runs || []) {
    addNode(makeNode("run", run.metadataId, {
      label: run.runId,
      runId: run.runId,
      objectId: run.objectId,
      rowId: run.rowId,
      ranAt: run.ranAt,
      durationMs: run.durationMs,
      exitCode: run.exitCode,
      ok: run.ok,
      adapter: run.adapter,
      agentHost: run.agentHost,
      runtime: run.runtime,
      runLocality: run.runLocality,
      hasOutput: run.hasOutput,
      inputFieldCount: run.inputFieldCount
    }, run));
  }

  for (const artifact of metadataStore.outputArtifacts || []) {
    addNode(makeNode("outputArtifact", artifact.metadataId, {
      label: artifact.artifactKind,
      artifactKind: artifact.artifactKind,
      mediaType: artifact.mediaType,
      promotable: artifact.promotable
    }, artifact));
    // runOutput is the conceptual sibling of outputArtifact — represents the
    // logical "output of a run" before it is materialised as a concrete
    // artifact. Two distinct nodes let the inspector show both the abstract
    // contract (runOutput) and the concrete payload (outputArtifact).
    const runOutputId = `${artifact.runMetadataId}::runOutput`;
    addNode(makeNode("runOutput", runOutputId, {
      label: "Run output",
      runMetadataId: artifact.runMetadataId,
      promotable: artifact.promotable,
      mediaType: artifact.mediaType
    }, { metadataId: runOutputId }));
  }

  for (const action of metadataStore.workflowActions || []) {
    addNode(makeNode("workflowAction", action.metadataId, {
      label: action.action,
      action: action.action,
      nodeType: action.nodeType,
      requiresHumanInput: action.requiresHumanInput,
      requiresAgentHost: action.requiresAgentHost,
      permissions: action.permissions
    }, action));
  }

  for (const kit of metadataStore.workerKits || []) {
    addNode(makeNode("workerKit", kit.metadataId, {
      label: kit.label,
      version: kit.version,
      family: kit.family
    }, kit));
  }

  for (const health of metadataStore.pipelineHealth || []) {
    addNode(makeNode("pipelineHealth", health.metadataId, {
      label: health.label,
      status: health.status,
      lifecycleStatus: health.lifecycleStatus,
      authStatus: health.authStatus,
      latestRunId: health.latestRunId,
      latestRanAt: health.latestRanAt,
      latestOk: health.latestOk
    }, health));
  }

  // ─── Edges ─────────────────────────────────────────────────────────────

  const objectIdToMetadata = new Map((metadataStore.objects || []).map((object) => [object.id, object.metadataId]));
  const fieldIdToMetadata = new Map();
  for (const field of metadataStore.fields || []) {
    fieldIdToMetadata.set(`${field.objectId}::${field.id}`, field.metadataId);
  }
  const sourceRecordIdToMetadata = new Map((metadataStore.sourceRecords || []).map((record) => [record.id, record.metadataId]));
  const integrationIdToMetadata = new Map((metadataStore.integrations || []).map((integration) => [integration.id, integration.metadataId]));
  const entityIdToMetadata = new Map();
  for (const entity of metadataStore.integrationEntities || []) {
    entityIdToMetadata.set(`${entity.integrationId}::${entity.entityId}`, entity.metadataId);
  }
  const agentHostIdToMetadata = new Map((metadataStore.agentHosts || []).map((host) => [host.id, host.metadataId]));

  // dashboard → widget
  for (const dashboard of metadataStore.dashboards || []) {
    for (const widgetId of dashboard.widgetIds || []) {
      const widget = (metadataStore.widgets || []).find((entry) => entry.id === widgetId);
      if (!widget) continue;
      addEdge(dashboard.metadataId, "dashboard", widget.metadataId, "widget", "containsWidget");
    }
  }

  // widget → object / field / sourceRecord / integrationEntity
  for (const widget of metadataStore.widgets || []) {
    const objectMetadataId = widget.objectId ? objectIdToMetadata.get(widget.objectId) : null;
    if (objectMetadataId) {
      addEdge(widget.metadataId, "widget", objectMetadataId, "dataModelObject", "bindsToObject");
      for (const fieldId of widget.requiredFields || []) {
        const fieldMetadataId = fieldIdToMetadata.get(`${widget.objectId}::${fieldId}`);
        if (fieldMetadataId) {
          addEdge(widget.metadataId, "widget", fieldMetadataId, "field", "usesField");
        }
      }
      for (const fieldId of widget.filterFields || []) {
        const fieldMetadataId = fieldIdToMetadata.get(`${widget.objectId}::${fieldId}`);
        if (fieldMetadataId) {
          addEdge(widget.metadataId, "widget", fieldMetadataId, "field", "filteredByField");
        }
      }
      for (const fieldId of widget.sortFields || []) {
        const fieldMetadataId = fieldIdToMetadata.get(`${widget.objectId}::${fieldId}`);
        if (fieldMetadataId) {
          addEdge(widget.metadataId, "widget", fieldMetadataId, "field", "sortedByField");
        }
      }
    }
    if (widget.sourceRecordKey) {
      const sourceMetadataId = sourceRecordIdToMetadata.get(widget.sourceRecordKey);
      if (sourceMetadataId) {
        addEdge(widget.metadataId, "widget", sourceMetadataId, "sourceRecord", "backedBySourceRecord");
      }
    }
    if (widget.entityId && widget.integrationId) {
      const entityMetadataId = entityIdToMetadata.get(`${widget.integrationId}::${widget.entityId}`);
      if (entityMetadataId) {
        addEdge(widget.metadataId, "widget", entityMetadataId, "integrationEntity", "scopedToEntity");
      }
    }
    if (widget.integrationId) {
      const integrationMetadataId = integrationIdToMetadata.get(widget.integrationId);
      if (integrationMetadataId) {
        addEdge(widget.metadataId, "widget", integrationMetadataId, "integration", "callsIntegration");
      }
    }
  }

  // object → sourceRecord / integrationEntity
  for (const object of metadataStore.objects || []) {
    if (object.isLiveBacked && object.sourceId) {
      const sourceMetadataId = sourceRecordIdToMetadata.get(object.sourceId);
      if (sourceMetadataId) {
        addEdge(object.metadataId, "dataModelObject", sourceMetadataId, "sourceRecord", "backedBySourceRecord");
      }
    }
    if (object.integrationId) {
      const integrationMetadataId = integrationIdToMetadata.get(object.integrationId);
      if (integrationMetadataId) {
        addEdge(object.metadataId, "dataModelObject", integrationMetadataId, "integration", "boundToIntegration");
      }
    }
  }

  // view → object
  for (const view of metadataStore.views || []) {
    const objectMetadataId = objectIdToMetadata.get(view.objectId);
    if (objectMetadataId) {
      addEdge(view.metadataId, "view", objectMetadataId, "dataModelObject", "readsObject");
    }
  }

  // workflow → node, sandbox
  for (const workflow of metadataStore.workflows || []) {
    if (workflow.sandboxMetadataId) {
      addEdge(workflow.metadataId, "workflow", workflow.sandboxMetadataId, "sandbox", "usesSandbox");
    }
  }
  for (const node of metadataStore.workflowNodes || []) {
    addEdge(node.workflowMetadataId, "workflow", node.metadataId, "workflowNode", "containsNode");
    if (node.readsObjectId) {
      const objectMetadataId = objectIdToMetadata.get(node.readsObjectId);
      if (objectMetadataId) {
        addEdge(node.metadataId, "workflowNode", objectMetadataId, "dataModelObject", "readsObject");
      }
    }
    if (node.writesObjectId) {
      const objectMetadataId = objectIdToMetadata.get(node.writesObjectId);
      if (objectMetadataId) {
        addEdge(node.metadataId, "workflowNode", objectMetadataId, "dataModelObject", "writesObject");
      }
    }
    if (node.integrationId) {
      const integrationMetadataId = integrationIdToMetadata.get(node.integrationId);
      if (integrationMetadataId) {
        addEdge(node.metadataId, "workflowNode", integrationMetadataId, "integration", "callsIntegration");
      }
    }
    if (node.sandboxMetadataId) {
      addEdge(node.metadataId, "workflowNode", node.sandboxMetadataId, "sandbox", "usesSandbox");
    }
  }

  // workflow → runInput (and any human-input node also directly requires it)
  for (const runInput of metadataStore.runInputs || []) {
    addEdge(runInput.workflowMetadataId, "workflow", runInput.metadataId, "runInput", "requiresRunInput");
    // Direct workflowNode → runInput edges for every human-input node in the
    // owning workflow. Sidecars rendering a single node panel can ask
    // "what inputs does THIS node need?" without scanning the whole graph.
    for (const node of metadataStore.workflowNodes || []) {
      if (node.workflowMetadataId !== runInput.workflowMetadataId) continue;
      if (!node.requiresHumanInput) continue;
      if (!Array.isArray(node.inputFieldIds) || !node.inputFieldIds.includes(runInput.id)) continue;
      addEdge(node.metadataId, "workflowNode", runInput.metadataId, "runInput", "requiresRunInput");
    }
  }

  // workflowNode → agentHost (direct, not only via sandbox)
  for (const node of metadataStore.workflowNodes || []) {
    if (!node.agentHost) continue;
    const hostMetadataId = agentHostIdToMetadata.get(node.agentHost);
    if (hostMetadataId) {
      addEdge(node.metadataId, "workflowNode", hostMetadataId, "agentHost", "usesAgentHost");
    }
  }

  // workflowNode → workflowAction (the concrete action behaviour)
  for (const action of metadataStore.workflowActions || []) {
    addEdge(action.workflowNodeMetadataId, "workflowNode", action.metadataId, "workflowAction", "configuresAction");
  }

  // sandbox → agentHost
  for (const sandbox of metadataStore.sandboxes || []) {
    if (sandbox.agentHost) {
      const hostMetadataId = agentHostIdToMetadata.get(sandbox.agentHost);
      if (hostMetadataId) {
        addEdge(sandbox.metadataId, "sandbox", hostMetadataId, "agentHost", "usesAgentHost");
      }
    }
  }

  // integrationEntity → integration
  for (const entity of metadataStore.integrationEntities || []) {
    const integrationMetadataId = integrationIdToMetadata.get(entity.integrationId);
    if (integrationMetadataId) {
      addEdge(entity.metadataId, "integrationEntity", integrationMetadataId, "integration", "belongsToIntegration");
    }
  }

  // run → workflow, sandbox, agentHost, outputArtifact
  for (const run of metadataStore.runs || []) {
    if (run.workflowMetadataId && nodeIds.has(run.workflowMetadataId)) {
      addEdge(run.metadataId, "run", run.workflowMetadataId, "workflow", "executedWorkflow");
    }
    if (run.sandboxMetadataId && nodeIds.has(run.sandboxMetadataId)) {
      addEdge(run.metadataId, "run", run.sandboxMetadataId, "sandbox", "executedSandbox");
    }
    if (run.agentHost) {
      const hostMetadataId = agentHostIdToMetadata.get(run.agentHost);
      if (hostMetadataId) {
        addEdge(run.metadataId, "run", hostMetadataId, "agentHost", "usedAgentHost");
      }
    }
  }
  for (const artifact of metadataStore.outputArtifacts || []) {
    if (artifact.runMetadataId && nodeIds.has(artifact.runMetadataId)) {
      addEdge(artifact.runMetadataId, "run", artifact.metadataId, "outputArtifact", "producedArtifact");
      const runOutputId = `${artifact.runMetadataId}::runOutput`;
      if (nodeIds.has(runOutputId)) {
        addEdge(artifact.runMetadataId, "run", runOutputId, "runOutput", "producedRunOutput");
        addEdge(runOutputId, "runOutput", artifact.metadataId, "outputArtifact", "materializedAs");
      }
    }
  }

  // run → runInput (consumedRunInput) — every input field captured on the run
  // contributes an edge so the inspector can show "this run consumed N inputs".
  for (const run of metadataStore.runs || []) {
    if (!run.inputFieldCount) continue;
    for (const runInput of metadataStore.runInputs || []) {
      if (runInput.workflowMetadataId !== run.workflowMetadataId) continue;
      addEdge(run.metadataId, "run", runInput.metadataId, "runInput", "consumedRunInput");
    }
  }

  // pipelineHealth → sandbox / workflow
  for (const health of metadataStore.pipelineHealth || []) {
    if (health.sandboxMetadataId) {
      addEdge(health.metadataId, "pipelineHealth", health.sandboxMetadataId, "sandbox", "summarisesSandbox");
    }
    if (health.workflowMetadataId && nodeIds.has(health.workflowMetadataId)) {
      addEdge(health.metadataId, "pipelineHealth", health.workflowMetadataId, "workflow", "summarisesWorkflow");
    }
  }

  // workerKit anchors every workspace artifact (single edge per top-level
  // node group). The kit is the materialisation source — read-only.
  const workerKit = (metadataStore.workerKits || [])[0];
  if (workerKit && nodeIds.has(workerKit.metadataId)) {
    for (const dashboard of metadataStore.dashboards || []) {
      addEdge(workerKit.metadataId, "workerKit", dashboard.metadataId, "dashboard", "materializes");
    }
    for (const sandbox of metadataStore.sandboxes || []) {
      addEdge(workerKit.metadataId, "workerKit", sandbox.metadataId, "sandbox", "materializes");
    }
  }

  // widget → filter / sort (concrete filter/sort metadata nodes)
  for (const filter of metadataStore.filters || []) {
    if (filter.scope === "widget") {
      addEdge(filter.scopeMetadataId, "widget", filter.metadataId, "filter", "configuresFilter");
    } else if (filter.scope === "workflowNode") {
      addEdge(filter.scopeMetadataId, "workflowNode", filter.metadataId, "filter", "configuresFilter");
    }
  }
  for (const sort of metadataStore.sorts || []) {
    if (sort.scope === "widget") {
      addEdge(sort.scopeMetadataId, "widget", sort.metadataId, "sort", "configuresSort");
    }
  }

  return {
    kind: GRAPH_KIND,
    version: GRAPH_VERSION,
    nodes,
    edges,
    warnings
  };
}

/**
 * Return the set of nodes that *depend on* nodeId (incoming edges).
 *
 * Example: passing a field's metadataId returns the widgets / workflow nodes
 * that read or filter on it.
 */
function findDependents(graph, nodeId) {
  if (!graph || !nodeId) return [];
  const id = String(nodeId);
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const nodesById = new Map((graph.nodes || []).map((node) => [node.id, node]));
  const out = [];
  for (const edge of edges) {
    if (edge.to !== id) continue;
    const node = nodesById.get(edge.from);
    if (node) out.push({ node, relation: edge.relation });
  }
  return out;
}

/**
 * Return the set of nodes that nodeId *depends on* (outgoing edges).
 */
function findDependencies(graph, nodeId) {
  if (!graph || !nodeId) return [];
  const id = String(nodeId);
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const nodesById = new Map((graph.nodes || []).map((node) => [node.id, node]));
  const out = [];
  for (const edge of edges) {
    if (edge.from !== id) continue;
    const node = nodesById.get(edge.to);
    if (node) out.push({ node, relation: edge.relation });
  }
  return out;
}

function summarizeGraphNode(node) {
  if (!node || typeof node !== "object") return null;
  return {
    id: node.id,
    type: node.type,
    label: node.label,
    metadataId: node.metadataId
  };
}

export {
  GRAPH_KIND,
  GRAPH_VERSION,
  buildWorkspaceMetadataGraph,
  findDependents,
  findDependencies,
  summarizeGraphNode
};
