"use client";

import { useMemo, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { OrchestrationGraphCanvas } from "./OrchestrationGraphCanvas.jsx";
import { SegmentedToggle } from "./ToggleField.jsx";
import {
  buildDefaultOrchestrationGraphFromRegistry,
  findApiRegistryNode,
  parseOrchestrationGraph
} from "@/lib/orchestration-graph";

function CollapsibleSection({ title, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="dm-sandbox-draft-section">
      <button type="button" className="dm-sandbox-draft-section-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>{title}</span>
        <ChevronDown size={14} className={open ? "is-open" : ""} aria-hidden="true" />
      </button>
      {open && <div className="dm-sandbox-draft-section-body">{children}</div>}
    </section>
  );
}

export function SandboxToolDraftPanel({
  registryRow,
  draft,
  onDraftChange,
  onCancel,
  onRequestCreate,
  disabled
}) {
  const graph = useMemo(
    () => draft.orchestrationGraph || buildDefaultOrchestrationGraphFromRegistry(registryRow, draft),
    [draft, registryRow]
  );

  const [selectedNode, setSelectedNode] = useState(null);

  function patch(partial) {
    const next = { ...draft, ...partial };
    if (partial.runLocality || partial.adapter || partial.outputRootPath) {
      const parsed = parseOrchestrationGraph(next.orchestrationGraph) || buildDefaultOrchestrationGraphFromRegistry(registryRow, next);
      const nodes = parsed.nodes.map((node) => {
        if (node.type === "sandbox-adapter") {
          return {
            ...node,
            config: {
              ...node.config,
              runLocality: next.runLocality,
              adapter: next.adapter
            }
          };
        }
        if (node.type === "normalize-output" && partial.outputRootPath !== undefined) {
          return { ...node, config: { ...node.config, rootPath: next.outputRootPath } };
        }
        if (node.type === "api-registry-call") {
          return {
            ...node,
            label: next.name || node.label,
            config: {
              ...node.config,
              authRef: next.authRef,
              endpoint: registryRow?.endpoint,
              method: registryRow?.method
            }
          };
        }
        return node;
      });
      next.orchestrationGraph = { ...parsed, nodes };
    }
    onDraftChange(next);
  }

  function syncGraphFromRegistry() {
    onDraftChange({
      ...draft,
      orchestrationGraph: buildDefaultOrchestrationGraphFromRegistry(registryRow, draft)
    });
  }

  const apiNode = findApiRegistryNode(graph);
  const activeNode = selectedNode || apiNode;

  return (
    <div className="dm-sandbox-tool-draft">
      <header className="dm-sandbox-tool-draft-head">
        <div>
          <p>Sandbox draft</p>
          <h3>API → Sandbox → Output</h3>
        </div>
        <button type="button" className="dm-sidebar-close" onClick={onCancel} aria-label="Close draft">
          <X size={16} />
        </button>
      </header>

      <div className="dm-sandbox-tool-draft-layout">
        <OrchestrationGraphCanvas
          graph={graph}
          selectedNodeId={activeNode?.id}
          onSelectNode={setSelectedNode}
        />

        <div className="dm-sandbox-tool-draft-fields">
          <CollapsibleSection title="Basic" defaultOpen>
            <label className="dm-record-field">
              <span>Tool name</span>
              <input
                value={draft.name || ""}
                disabled={disabled}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </label>
            <label className="dm-record-field">
              <span>Description</span>
              <textarea
                rows={3}
                value={draft.description || ""}
                disabled={disabled}
                onChange={(e) => patch({ description: e.target.value })}
              />
            </label>
            <label className="dm-record-field">
              <span>Registry</span>
              <input readOnly value={registryRow?.integrationId || ""} />
            </label>
            <label className="dm-record-field">
              <span>Test command</span>
              <input readOnly value={`${registryRow?.method || "GET"} ${registryRow?.endpoint || ""}`} />
            </label>
          </CollapsibleSection>

          <CollapsibleSection title="Security" defaultOpen={false}>
            <label className="dm-record-field">
              <span>Auth ref</span>
              <input
                value={draft.authRef || ""}
                disabled={disabled}
                onChange={(e) => patch({ authRef: e.target.value })}
              />
            </label>
            <label className="dm-record-field">
              <span>Env refs (comma-separated slugs)</span>
              <input
                value={draft.envRefs || ""}
                disabled={disabled}
                onChange={(e) => patch({ envRefs: e.target.value })}
              />
            </label>
            <SegmentedToggle
              name="sandbox-tool-network"
              label="Network allowed"
              value={draft.networkAllow ? "on" : "off"}
              options={["off", "on"]}
              disabled={disabled}
              onChange={(v) => patch({ networkAllow: v === "on" })}
            />
            <label className="dm-record-field">
              <span>Timeout (ms)</span>
              <input
                type="number"
                min={1000}
                value={draft.timeoutMs || "120000"}
                disabled={disabled}
                onChange={(e) => patch({ timeoutMs: e.target.value })}
              />
            </label>
          </CollapsibleSection>

          <CollapsibleSection title="Output" defaultOpen={false}>
            <label className="dm-record-field">
              <span>Output root path</span>
              <input
                value={draft.outputRootPath || "data"}
                disabled={disabled}
                onChange={(e) => patch({ outputRootPath: e.target.value })}
              />
            </label>
            <p className="dm-cell-empty">lastResponse and source records are written on successful sandbox test only.</p>
          </CollapsibleSection>

          <CollapsibleSection title="Agent instructions" defaultOpen={false}>
            <label className="dm-record-field">
              <span>Natural-language usage guide</span>
              <textarea
                rows={4}
                value={draft.instructions || ""}
                disabled={disabled}
                onChange={(e) => patch({ instructions: e.target.value })}
              />
            </label>
          </CollapsibleSection>

          <CollapsibleSection title="Execution" defaultOpen>
            <SegmentedToggle
              name="sandbox-tool-locality"
              label="Run locality"
              value={draft.runLocality === "serverless" ? "serverless" : "local"}
              options={["local", "serverless"]}
              disabled={disabled}
              onChange={(v) => patch({
                runLocality: v,
                schedulerRegistryId: v === "serverless" ? String(registryRow?.integrationId || "").trim() : ""
              })}
            />
            <label className="dm-record-field">
              <span>Adapter</span>
              <input
                value={draft.adapter || "local-process"}
                disabled={disabled}
                onChange={(e) => patch({ adapter: e.target.value })}
              />
            </label>
            {draft.runLocality === "serverless" && (
              <label className="dm-record-field">
                <span>Scheduler registry id</span>
                <input
                  value={draft.schedulerRegistryId || registryRow?.integrationId || ""}
                  disabled={disabled}
                  onChange={(e) => patch({ schedulerRegistryId: e.target.value })}
                />
              </label>
            )}
            <button type="button" className="dm-btn-ghost" disabled={disabled} onClick={syncGraphFromRegistry}>
              Reset graph from registry
            </button>
          </CollapsibleSection>

          {activeNode && (
            <div className="dm-sandbox-draft-node-detail">
              <span className="dm-sandbox-draft-node-detail-label">Selected node</span>
              <pre>{JSON.stringify(activeNode, null, 2)}</pre>
            </div>
          )}
        </div>
      </div>

      <footer className="dm-sandbox-tool-draft-foot">
        <button type="button" className="dm-btn-outline" onClick={onCancel} disabled={disabled}>Cancel</button>
        <button
          type="button"
          className="dm-btn-primary-sm"
          disabled={disabled || !String(draft.name || "").trim()}
          onClick={() => onRequestCreate({ ...draft, orchestrationGraph: graph })}
        >
          Review &amp; create
        </button>
      </footer>
    </div>
  );
}
