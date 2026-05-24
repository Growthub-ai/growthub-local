"use client";

/**
 * Growthub Workspace Metadata Graph V1 — read-only inspector panel.
 *
 * Surfaces a selected metadata node's dependencies + dependents + warnings.
 *
 * Mounting status (V1):
 *   This component SHIPS with the worker kit but is NOT yet mounted by the
 *   existing builder / workflow / data-model surfaces. Mounting is
 *   intentionally deferred to a follow-up PR so the V1 scope stays focused
 *   on the typed projection + GET route. Operators that want the inspector
 *   now can import it directly:
 *
 *     import { WorkspaceGraphInspectorPanel } from "@/app/data-model/components/WorkspaceGraphInspectorPanel.jsx";
 *
 *   Intended future entry points:
 *
 *     - Widget sidecar: View dependencies
 *     - Workflow sidecar: View dependencies
 *     - Run console: View graph lineage
 *     - Data Model row sidecar: View dependents
 *     - Workspace Settings: Metadata Graph
 *
 * V1 invariants:
 *   - Read-only. No edits. No deletes.
 *   - No fetch of provider data — only `GET /api/workspace/metadata-graph`.
 *   - No secrets rendered.
 */

import { useEffect, useMemo, useState } from "react";
import { findDependencies, findDependents } from "@/lib/workspace-metadata-graph";

const RELATION_LABELS = {
  containsWidget: "contains widget",
  bindsToObject: "binds to object",
  usesField: "uses field",
  filteredByField: "filtered by field",
  sortedByField: "sorted by field",
  backedBySourceRecord: "backed by source record",
  scopedToEntity: "scoped to entity",
  containsNode: "contains node",
  usesSandbox: "uses sandbox",
  readsObject: "reads object",
  writesObject: "writes object",
  requiresRunInput: "requires run input",
  callsIntegration: "calls integration",
  usesAgentHost: "uses agent host",
  executedWorkflow: "executed workflow",
  executedSandbox: "executed sandbox",
  usedAgentHost: "used agent host",
  producedArtifact: "produced artifact",
  belongsToIntegration: "belongs to integration",
  boundToIntegration: "bound to integration"
};

const NODE_TYPE_LABELS = {
  dashboard: "Dashboard",
  widget: "Widget",
  dataModelObject: "Data Model object",
  field: "Field",
  view: "View",
  workflow: "Workflow",
  workflowNode: "Workflow node",
  runInput: "Run input",
  sandbox: "Sandbox",
  agentHost: "Agent host",
  integration: "Integration",
  integrationEntity: "Integration entity",
  sourceRecord: "Source record",
  run: "Run",
  outputArtifact: "Output artifact"
};

function relationLabel(relation) {
  return RELATION_LABELS[relation] || relation;
}

function nodeTypeLabel(type) {
  return NODE_TYPE_LABELS[type] || type;
}

export function WorkspaceGraphInspectorPanel({ selectedNodeId, onSelectNode }) {
  const [graph, setGraph] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [internalSelectedId, setInternalSelectedId] = useState(selectedNodeId || "");

  useEffect(() => {
    let canceled = false;
    setLoading(true);
    setError(null);
    fetch("/api/workspace/metadata-graph")
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((envelope) => {
        if (canceled) return;
        setGraph(envelope?.graph || { nodes: [], edges: [] });
      })
      .catch((err) => {
        if (canceled) return;
        setError(err?.message || "Failed to load metadata graph");
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => { canceled = true; };
  }, []);

  useEffect(() => {
    if (selectedNodeId && selectedNodeId !== internalSelectedId) {
      setInternalSelectedId(selectedNodeId);
    }
  }, [selectedNodeId, internalSelectedId]);

  const nodes = graph?.nodes || [];
  const selected = useMemo(
    () => nodes.find((node) => node.id === internalSelectedId) || null,
    [nodes, internalSelectedId]
  );

  const dependencies = useMemo(
    () => (graph && selected ? findDependencies(graph, selected.id) : []),
    [graph, selected]
  );
  const dependents = useMemo(
    () => (graph && selected ? findDependents(graph, selected.id) : []),
    [graph, selected]
  );

  const handleSelect = (nodeId) => {
    setInternalSelectedId(nodeId);
    if (typeof onSelectNode === "function") onSelectNode(nodeId);
  };

  return (
    <div className="workspace-graph-inspector" aria-label="Workspace metadata graph inspector">
      <header className="workspace-graph-inspector-header">
        <h3>Workspace metadata graph</h3>
        <p className="workspace-graph-inspector-subtitle">
          Read-only projection of dashboards, widgets, workflows, sandboxes, and runs.
        </p>
      </header>

      {loading && <p className="workspace-graph-inspector-loading">Loading metadata graph…</p>}
      {error && (
        <p className="workspace-graph-inspector-error" role="alert">
          Could not load metadata graph: {error}
        </p>
      )}

      <div className="workspace-graph-inspector-body">
        <aside className="workspace-graph-inspector-list">
          <h4>Nodes ({nodes.length})</h4>
          <ul>
            {nodes.map((node) => (
              <li key={node.id}>
                <button
                  type="button"
                  className={`workspace-graph-inspector-node-button${node.id === internalSelectedId ? " is-selected" : ""}`}
                  onClick={() => handleSelect(node.id)}
                >
                  <span className="workspace-graph-inspector-node-type">{nodeTypeLabel(node.type)}</span>
                  <span className="workspace-graph-inspector-node-label">{node.label || node.id}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="workspace-graph-inspector-detail">
          {!selected && <p className="workspace-graph-inspector-empty">Select a node to view dependencies.</p>}
          {selected && (
            <>
              <h4>{nodeTypeLabel(selected.type)} · {selected.label}</h4>
              <dl className="workspace-graph-inspector-summary">
                {Object.entries(selected.summary || {}).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{Array.isArray(value) ? value.join(", ") || "—" : (value === null || value === "" ? "—" : String(value))}</dd>
                  </div>
                ))}
              </dl>

              <section className="workspace-graph-inspector-edges">
                <h5>Depends on ({dependencies.length})</h5>
                <ul>
                  {dependencies.length === 0 && <li className="workspace-graph-inspector-empty">No dependencies.</li>}
                  {dependencies.map(({ node, relation }) => (
                    <li key={`dep::${node.id}::${relation}`}>
                      <button type="button" onClick={() => handleSelect(node.id)}>
                        <span className="workspace-graph-inspector-relation">{relationLabel(relation)}</span>
                        <span className="workspace-graph-inspector-node-type">{nodeTypeLabel(node.type)}</span>
                        <span className="workspace-graph-inspector-node-label">{node.label || node.id}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="workspace-graph-inspector-edges">
                <h5>Used by ({dependents.length})</h5>
                <ul>
                  {dependents.length === 0 && <li className="workspace-graph-inspector-empty">Nothing depends on this node yet.</li>}
                  {dependents.map(({ node, relation }) => (
                    <li key={`from::${node.id}::${relation}`}>
                      <button type="button" onClick={() => handleSelect(node.id)}>
                        <span className="workspace-graph-inspector-relation">{relationLabel(relation)}</span>
                        <span className="workspace-graph-inspector-node-type">{nodeTypeLabel(node.type)}</span>
                        <span className="workspace-graph-inspector-node-label">{node.label || node.id}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export default WorkspaceGraphInspectorPanel;
