"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  buildDefaultOrchestrationGraphFromRegistry,
  buildSandboxRowFromApiRegistry,
  serializeOrchestrationGraph,
  validateOrchestrationGraph
} from "@/lib/orchestration-graph";
import { SandboxToolDraftPanel } from "./SandboxToolDraftPanel.jsx";
import { SandboxToolConfirmModal } from "./SandboxToolConfirmModal.jsx";

function initialDraft(registryRow) {
  const name = `${String(registryRow?.Name || registryRow?.integrationId || "API").trim()} Tool`;
  const graph = buildDefaultOrchestrationGraphFromRegistry(registryRow, {});
  return {
    name,
    description: String(registryRow?.description || "").trim(),
    runLocality: "local",
    adapter: "local-process",
    authRef: String(registryRow?.authRef || registryRow?.integrationId || "").trim(),
    envRefs: "",
    networkAllow: "",
    timeoutMs: "",
    command: "",
    instructions: `Use this tool to call ${registryRow?.integrationId || "the API"} safely. Auth resolves server-side via authRef.`,
    outputRootPath: "data",
    orchestrationGraph: serializeOrchestrationGraph(graph)
  };
}

export function ApiRegistryReviewModal({
  open,
  registryRow,
  savedEnvRefs,
  onClose,
  onConfirmCreate,
  saving
}) {
  const [draft, setDraft] = useState(() => initialDraft(registryRow || {}));
  const [selectedNodeId, setSelectedNodeId] = useState("api-registry-call");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && registryRow) {
      const nextDraft = initialDraft(registryRow);
      setDraft(nextDraft);
      try {
        const graph = JSON.parse(nextDraft.orchestrationGraph);
        const apiNode = (graph?.nodes || []).find((n) => n.type === "api-registry-call");
        setSelectedNodeId(apiNode?.id || "input");
      } catch {
        setSelectedNodeId("input");
      }
      setConfirmOpen(false);
      setError("");
    }
  }, [open, registryRow]);

  const graph = useMemo(() => {
    try {
      return typeof draft.orchestrationGraph === "string"
        ? JSON.parse(draft.orchestrationGraph)
        : draft.orchestrationGraph;
    } catch {
      return null;
    }
  }, [draft.orchestrationGraph]);

  function handleGraphChange(nextGraph) {
    const validation = validateOrchestrationGraph(nextGraph);
    if (!validation.ok) {
      setError(validation.errors[0] || "Invalid graph");
      return;
    }
    setError("");
    setDraft((current) => ({
      ...current,
      orchestrationGraph: serializeOrchestrationGraph(nextGraph),
      runLocality: nextGraph.nodes?.find((n) => n.type === "sandbox-adapter")?.config?.runLocality || current.runLocality,
      adapter: nextGraph.nodes?.find((n) => n.type === "sandbox-adapter")?.config?.adapter || current.adapter
    }));
  }

  function handleRequestCreate() {
    const built = buildSandboxRowFromApiRegistry(registryRow, {
      name: draft.name,
      description: draft.description,
      runLocality: draft.runLocality,
      adapter: draft.adapter,
      authRef: draft.authRef,
      envRefs: draft.envRefs,
      networkAllow: draft.networkAllow,
      instructions: draft.instructions,
      command: draft.command,
      timeoutMs: draft.timeoutMs,
      orchestrationGraph: graph,
      outputRootPath: draft.outputRootPath
    });
    const validation = validateOrchestrationGraph(built.orchestrationGraph);
    if (!validation.ok) {
      setError(validation.errors[0] || "Invalid orchestration graph");
      return;
    }
    if (!String(draft.name || "").trim()) {
      setError("Tool name is required");
      return;
    }
    setError("");
    setConfirmOpen(true);
  }

  function handleConfirm() {
    const built = buildSandboxRowFromApiRegistry(registryRow, {
      name: draft.name,
      description: draft.description,
      runLocality: draft.runLocality,
      adapter: draft.adapter,
      authRef: draft.authRef,
      envRefs: draft.envRefs,
      networkAllow: draft.networkAllow,
      instructions: draft.instructions,
      command: draft.command,
      timeoutMs: draft.timeoutMs,
      orchestrationGraph: graph,
      outputRootPath: draft.outputRootPath
    });
    onConfirmCreate?.(built.row);
    setConfirmOpen(false);
  }

  if (!open) return null;

  return (
    <div className="dm-orch-modal-backdrop" onClick={onClose}>
      <div className="dm-dialog dm-api-registry-review" role="dialog" aria-labelledby="api-registry-review-title" onClick={(e) => e.stopPropagation()}>
        <header className="dm-dialog-head dm-api-registry-review-head">
          <div>
            <p className="dm-api-action-card-eyebrow">Sandbox tool draft</p>
            <h2 id="api-registry-review-title">Orchestration composer</h2>
            <p className="dm-api-registry-review-sub">
              Configure how <strong>{registryRow?.integrationId}</strong> becomes a governed sandbox tool.
            </p>
          </div>
          <button type="button" className="dm-sidebar-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="dm-dialog-body dm-api-registry-review-body">
          <SandboxToolDraftPanel
            registryRow={registryRow}
            draft={draft}
            onDraftChange={setDraft}
            onGraphChange={handleGraphChange}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            savedEnvRefs={savedEnvRefs}
            disabled={saving}
          />
          {error && <p className="dm-field-error">{error}</p>}
        </div>
        <footer className="dm-dialog-actions">
          <button type="button" className="dm-btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="dm-btn-primary-sm" onClick={handleRequestCreate} disabled={saving}>
            Review & create
          </button>
        </footer>
      </div>
      <SandboxToolConfirmModal
        open={confirmOpen}
        draftName={draft.name}
        authRef={draft.authRef}
        runLocality={draft.runLocality}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
        saving={saving}
      />
    </div>
  );
}
