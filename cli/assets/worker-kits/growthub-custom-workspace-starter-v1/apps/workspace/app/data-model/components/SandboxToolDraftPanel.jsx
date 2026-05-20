"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import {
  buildDefaultOrchestrationGraphFromRegistry,
  parseOrchestrationGraph,
  serializeOrchestrationGraph,
} from "@/lib/orchestration-graph";
import { OrchestrationGraphCanvas } from "./OrchestrationGraphCanvas.jsx";
import { ApiRegistryReviewModal } from "./ApiRegistryReviewModal.jsx";

function DrawerSection({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`dm-drawer-section${open ? " open" : ""}`}>
      <button type="button" className="dm-drawer-section-toggle" onClick={() => setOpen((v) => !v)}>
        <ChevronRight size={14} aria-hidden="true" />
        <span>{title}</span>
      </button>
      {open && <div className="dm-drawer-section-body">{children}</div>}
    </section>
  );
}

function patchGraphNode(graph, nodeId, configPatch) {
  const parsed = parseOrchestrationGraph(graph);
  if (!parsed) return graph;
  const nodes = (parsed.nodes || []).map((node) => {
    if (String(node.id) !== String(nodeId)) return node;
    return {
      ...node,
      config: { ...(node.config || {}), ...configPatch }
    };
  });
  return serializeOrchestrationGraph({ ...parsed, nodes });
}

export function SandboxToolDraftPanel({
  registryRow,
  draft,
  onDraftChange,
  onBack,
  onRequestConfirm,
  disabled,
}) {
  const [showReview, setShowReview] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  const graph = useMemo(
    () => parseOrchestrationGraph(draft?.orchestrationGraph)
      || buildDefaultOrchestrationGraphFromRegistry(registryRow, {
        runLocality: draft?.runLocality,
        adapter: draft?.adapter,
        authRef: draft?.authRef,
        outputRootPath: draft?.outputRootPath,
        name: draft?.Name,
      }),
    [draft, registryRow],
  );

  const selectedNode = useMemo(
    () => (graph?.nodes || []).find((n) => String(n.id) === String(selectedNodeId)) || null,
    [graph, selectedNodeId],
  );

  function patchDraft(fields) {
    onDraftChange({ ...draft, ...fields });
  }

  function syncGraphFromDraft(nextDraft) {
    const nextGraph = buildDefaultOrchestrationGraphFromRegistry(registryRow, {
      runLocality: nextDraft.runLocality,
      adapter: nextDraft.adapter,
      authRef: nextDraft.authRef,
      outputRootPath: nextDraft.outputRootPath,
      name: nextDraft.Name,
      registryId: registryRow?.integrationId,
      endpoint: registryRow?.endpoint,
      method: registryRow?.method,
    });
    return serializeOrchestrationGraph(nextGraph);
  }

  function setRunLocality(next) {
    const schedulerRegistryId = next === "serverless"
      ? String(registryRow?.integrationId || "").trim()
      : "";
    const nextDraft = {
      ...draft,
      runLocality: next,
      schedulerRegistryId,
      orchestrationGraph: syncGraphFromDraft({ ...draft, runLocality: next, schedulerRegistryId }),
    };
    onDraftChange(nextDraft);
  }

  return (
    <div className="dm-sandbox-tool-draft" data-testid="sandbox-tool-draft-panel">
      <div className="dm-sandbox-tool-draft-toolbar">
        <button type="button" className="dm-btn-ghost dm-sandbox-tool-back" onClick={onBack} disabled={disabled}>
          <ArrowLeft size={14} aria-hidden="true" />
          Back to record
        </button>
        <button type="button" className="dm-btn-ghost" onClick={() => setShowReview(true)} disabled={disabled}>
          Review API
        </button>
      </div>

      <div className="dm-sandbox-tool-draft-layout">
        <OrchestrationGraphCanvas
          graph={graph}
          selectedNodeId={selectedNodeId}
          onSelectNode={(node) => setSelectedNodeId(String(node?.id || ""))}
        />

        <div className="dm-sandbox-tool-draft-fields">
          <DrawerSection title="Basic">
            <label className="dm-record-field">
              <span>Tool name</span>
              <input
                value={draft?.Name ?? ""}
                disabled={disabled}
                onChange={(event) => {
                  const Name = event.target.value;
                  patchDraft({
                    Name,
                    orchestrationGraph: syncGraphFromDraft({ ...draft, Name }),
                  });
                }}
              />
            </label>
            <label className="dm-record-field">
              <span>Description</span>
              <textarea
                rows={3}
                value={draft?.toolDescription ?? ""}
                disabled={disabled}
                onChange={(event) => patchDraft({ toolDescription: event.target.value })}
              />
            </label>
            <label className="dm-record-field">
              <span>Registry</span>
              <input
                readOnly
                value={String(registryRow?.integrationId || registryRow?.Name || "")}
              />
            </label>
            <label className="dm-record-field">
              <span>Test command</span>
              <input
                readOnly
                value={`${String(registryRow?.method || "GET").toUpperCase()} ${registryRow?.endpoint || ""}`}
              />
            </label>
            <label className="dm-record-field">
              <span>Run locality</span>
              <select
                value={String(draft?.runLocality || "serverless")}
                disabled={disabled}
                onChange={(event) => setRunLocality(event.target.value)}
              >
                <option value="serverless">serverless (API Registry scheduler)</option>
                <option value="local">local (process sandbox)</option>
              </select>
            </label>
            <label className="dm-record-field">
              <span>Adapter</span>
              <select
                value={String(draft?.adapter || "local-process")}
                disabled={disabled}
                onChange={(event) => {
                  const adapter = event.target.value;
                  patchDraft({
                    adapter,
                    orchestrationGraph: syncGraphFromDraft({ ...draft, adapter }),
                  });
                }}
              >
                <option value="local-process">local-process</option>
                <option value="local-agent-host">local-agent-host</option>
                <option value="local-intelligence">local-intelligence</option>
              </select>
            </label>
          </DrawerSection>

          <DrawerSection title="Security" defaultOpen={false}>
            <label className="dm-record-field">
              <span>Auth ref</span>
              <input
                value={draft?.authRef ?? registryRow?.authRef ?? ""}
                disabled={disabled}
                onChange={(event) => {
                  const authRef = event.target.value;
                  patchDraft({
                    authRef,
                    envRefs: authRef,
                    orchestrationGraph: patchGraphNode(
                      draft?.orchestrationGraph,
                      (graph?.nodes || []).find((n) => n.type === "api-registry-call")?.id,
                      { authRef },
                    ),
                  });
                }}
              />
            </label>
            <label className="dm-record-field">
              <span>Env refs</span>
              <input
                value={draft?.envRefs ?? ""}
                disabled={disabled}
                onChange={(event) => patchDraft({ envRefs: event.target.value })}
              />
            </label>
            <label className="dm-record-field">
              <span>Network allowed</span>
              <select
                value={String(draft?.networkAllow ?? "true")}
                disabled={disabled}
                onChange={(event) => patchDraft({ networkAllow: event.target.value })}
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </label>
            <label className="dm-record-field">
              <span>Timeout (ms)</span>
              <input
                value={draft?.timeoutMs ?? "30000"}
                disabled={disabled}
                onChange={(event) => patchDraft({ timeoutMs: event.target.value })}
              />
            </label>
          </DrawerSection>

          <DrawerSection title="Output" defaultOpen={false}>
            <label className="dm-record-field">
              <span>Output root path</span>
              <input
                value={draft?.outputRootPath ?? "data"}
                disabled={disabled}
                onChange={(event) => {
                  const outputRootPath = event.target.value;
                  patchDraft({
                    outputRootPath,
                    orchestrationGraph: patchGraphNode(
                      draft?.orchestrationGraph,
                      "normalize",
                      { rootPath: outputRootPath },
                    ),
                  });
                }}
              />
            </label>
          </DrawerSection>

          <DrawerSection title="Agent instructions" defaultOpen={false}>
            <label className="dm-record-field">
              <span>Usage guide</span>
              <textarea
                rows={4}
                value={draft?.instructions ?? ""}
                disabled={disabled}
                onChange={(event) => patchDraft({ instructions: event.target.value })}
              />
            </label>
          </DrawerSection>

          {selectedNode && (
            <DrawerSection title={`Node: ${selectedNode.label || selectedNode.type}`} defaultOpen>
              <pre className="dm-orch-node-config-preview">
                {JSON.stringify(selectedNode.config || {}, null, 2)}
              </pre>
            </DrawerSection>
          )}
        </div>
      </div>

      <footer className="dm-sandbox-tool-draft-foot">
        <button type="button" className="dm-btn-outline" onClick={onBack} disabled={disabled}>
          Cancel
        </button>
        <button
          type="button"
          className="dm-btn-primary-sm"
          disabled={disabled || !String(draft?.Name || "").trim()}
          onClick={onRequestConfirm}
        >
          Continue
        </button>
      </footer>

      {showReview && (
        <ApiRegistryReviewModal registryRow={registryRow} onClose={() => setShowReview(false)} />
      )}
    </div>
  );
}
