"use client";

/**
 * HelperSidecar — workspace-native helper panel.
 *
 * Rendered as a fixed right-side sidecar. Slides in over the Data Model
 * page without any route change. All Playwright data-* selectors are
 * declared here; do not rename them without updating the test suite.
 *
 * Props:
 *   open           boolean  — controlled by page-level state
 *   onClose        fn       — called when sidecar should close
 *   workspaceConfig object  — live config (for Setup tab: localModel, localEndpoint)
 *   initialIntent  string   — pre-set intent based on the object that triggered open
 *   onApplied      fn(cfg)  — called with updated workspaceConfig after apply
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckSquare, Settings, Zap, X } from "lucide-react";

const HELPER_INTENTS = [
  { value: "build_dashboard", label: "Build dashboard" },
  { value: "create_widget",  label: "Create widget" },
  { value: "register_api",   label: "Register API" },
  { value: "create_object",  label: "Create object" },
  { value: "edit_view",      label: "Edit view" },
  { value: "repair",         label: "Repair workspace" },
  { value: "explain",        label: "Explain object" },
];

const MIN_WIDTH = 320;
const MAX_WIDTH_VW = 0.80;

let persistedWidth = 420;

function resolveSandboxEnvRow(workspaceConfig) {
  const objects = workspaceConfig?.dataModel?.objects || [];
  for (const obj of objects) {
    if (obj.objectType === "sandbox-environment" && Array.isArray(obj.rows) && obj.rows.length > 0) {
      return obj.rows[0];
    }
  }
  return null;
}

export function HelperSidecar({ open, onClose, workspaceConfig, initialIntent, onApplied }) {
  const [activeTab, setActiveTab] = useState("assistant");
  const [intent, setIntent] = useState(initialIntent || "create_object");
  const [prompt, setPrompt] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [result, setResult] = useState(null);
  const [queryError, setQueryError] = useState("");
  const [accepted, setAccepted] = useState({});
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState(null);

  // Setup tab state
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [pingLoading, setPingLoading] = useState(false);

  // Drag state
  const [panelWidth, setPanelWidth] = useState(persistedWidth);
  const dragRef = useRef({ dragging: false, startX: 0, startWidth: 0 });
  const sidecarRef = useRef(null);

  useEffect(() => {
    if (initialIntent) setIntent(initialIntent);
  }, [initialIntent]);

  useEffect(() => {
    if (!open) {
      setResult(null);
      setQueryError("");
      setStreamBuffer("");
      setStreaming(false);
      setAccepted({});
      setApplyResult(null);
      setActiveTab("assistant");
      setConnectionStatus(null);
    }
  }, [open]);

  // Escape key
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Cmd+Enter fires apply
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (!applying && result && Object.values(accepted).some(Boolean)) {
          handleApply();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  // Drag handlers
  const handleDragStart = useCallback((e) => {
    e.preventDefault();
    dragRef.current = { dragging: true, startX: e.clientX, startWidth: panelWidth };
    const onMove = (me) => {
      if (!dragRef.current.dragging) return;
      const dx = dragRef.current.startX - me.clientX;
      const next = Math.min(
        Math.max(dragRef.current.startWidth + dx, MIN_WIDTH),
        window.innerWidth * MAX_WIDTH_VW
      );
      setPanelWidth(next);
    };
    const onUp = () => {
      dragRef.current.dragging = false;
      persistedWidth = panelWidth;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [panelWidth]);

  // Proposal keyboard: Tab focuses next, Space toggles accept
  const handleProposalKeyDown = useCallback((e, idx) => {
    if (e.key === " ") {
      e.preventDefault();
      setAccepted((prev) => ({ ...prev, [idx]: !prev[idx] }));
    }
  }, []);

  async function runQuery() {
    if (!prompt.trim() || streaming) return;
    setResult(null);
    setQueryError("");
    setStreamBuffer("");
    setAccepted({});
    setApplyResult(null);
    setStreaming(true);

    try {
      const res = await fetch("/api/workspace/helper/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intent, userPrompt: prompt.trim() }),
      });

      // Try streaming first
      if (res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          setStreamBuffer(accumulated);
        }

        let parsed;
        try { parsed = JSON.parse(accumulated); } catch { parsed = null; }

        if (parsed && typeof parsed === "object") {
          if (!parsed.ok) {
            setQueryError(parsed.error || "Helper returned an error");
          } else {
            setResult(parsed);
            const init = {};
            (parsed.proposals || []).forEach((_, i) => { init[i] = true; });
            setAccepted(init);
          }
        } else {
          setQueryError("Could not parse helper response.");
        }
      } else {
        // Non-streaming fallback
        const data = await res.json();
        if (!data.ok) {
          setQueryError(data.error || "Helper returned an error");
        } else {
          setResult(data);
          const init = {};
          (data.proposals || []).forEach((_, i) => { init[i] = true; });
          setAccepted(init);
          setStreamBuffer(data.summary || "");
        }
      }
    } catch (err) {
      setQueryError(err.message || "Request failed");
    } finally {
      setStreaming(false);
    }
  }

  async function handleApply() {
    if (!result || applying) return;
    const proposals = (result.proposals || []).filter((_, i) => accepted[i]);
    if (!proposals.length) return;
    setApplying(true);
    setApplyResult(null);
    try {
      const res = await fetch("/api/workspace/helper/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposals, reviewedBy: "user" }),
      });
      const data = await res.json();
      setApplyResult(data);
      if (data.workspaceConfig && onApplied) onApplied(data.workspaceConfig);
    } catch (err) {
      setApplyResult({ ok: false, error: err.message, applied: [], skipped: [] });
    } finally {
      setApplying(false);
    }
  }

  async function pingConnection() {
    const row = resolveSandboxEnvRow(workspaceConfig);
    const endpoint = row?.localEndpoint || "";
    if (!endpoint) { setConnectionStatus("unconfigured"); return; }
    setPingLoading(true);
    try {
      const pingUrl = endpoint.replace(/\/+$/, "") + "/health";
      const res = await fetch(pingUrl, { method: "GET", signal: AbortSignal.timeout(4000) });
      setConnectionStatus(res.ok ? "connected" : "unreachable");
    } catch {
      setConnectionStatus("unreachable");
    } finally {
      setPingLoading(false);
    }
  }

  useEffect(() => {
    if (open && activeTab === "setup") {
      setConnectionStatus(null);
      pingConnection();
    }
  }, [open, activeTab]);

  const sandboxRow = resolveSandboxEnvRow(workspaceConfig);
  const localModel = sandboxRow?.localModel || process.env.NEXT_PUBLIC_OLLAMA_MODEL || "gemma3:4b (default)";
  const localEndpoint = sandboxRow?.localEndpoint || "http://127.0.0.1:11434/v1 (default)";
  const adapterMode = sandboxRow?.intelligenceAdapterMode || "ollama";
  const deploymentMode = adapterMode === "custom-openai-compatible" || adapterMode === "vllm" ? "hosted" : "local";

  const acceptedCount = Object.values(accepted).filter(Boolean).length;
  const skippedCount = applyResult?.skipped?.length || 0;

  if (!open) return null;

  return (
    <>
      <div className="dm-sidecar-backdrop" onClick={onClose} aria-hidden="true" />
      <aside
        ref={sidecarRef}
        className="dm-helper-sidecar"
        data-helper-sidecar=""
        role="dialog"
        aria-label="Workspace helper"
        aria-modal="true"
        style={{ width: panelWidth }}
      >
        {/* Drag handle */}
        <div
          className="dm-sidecar-drag-handle"
          data-drag-handle=""
          onMouseDown={handleDragStart}
          title="Drag to resize"
          aria-hidden="true"
        />

        {/* Header */}
        <div className="dm-sidecar-header">
          <div className="dm-sidecar-header-left">
            <Zap size={15} className="dm-sidecar-icon" />
            <span className="dm-sidecar-title">Workspace Helper</span>
          </div>
          <button
            type="button"
            className="dm-sidecar-close"
            onClick={onClose}
            aria-label="Close workspace helper"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="dm-sidecar-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "assistant"}
            className={`dm-sidecar-tab${activeTab === "assistant" ? " active" : ""}`}
            data-tab="assistant"
            onClick={() => setActiveTab("assistant")}
          >
            Assistant
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "setup"}
            className={`dm-sidecar-tab${activeTab === "setup" ? " active" : ""}`}
            data-tab="setup"
            onClick={() => setActiveTab("setup")}
          >
            <Settings size={13} style={{ marginRight: 4 }} />
            Setup
          </button>
        </div>

        {/* Assistant tab */}
        {activeTab === "assistant" && (
          <div className="dm-sidecar-body">
            <div className="dm-field-group">
              <label className="dm-field-label" htmlFor="helper-intent">Intent</label>
              <select
                id="helper-intent"
                className="dm-field-select"
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                disabled={streaming}
                data-helper-intent=""
              >
                {HELPER_INTENTS.map((i) => (
                  <option key={i.value} value={i.value}>{i.label}</option>
                ))}
              </select>
            </div>

            <div className="dm-field-group">
              <label className="dm-field-label" htmlFor="helper-prompt">What do you need?</label>
              <textarea
                id="helper-prompt"
                className="dm-field-textarea"
                rows={4}
                placeholder='e.g. "A sales ops dashboard for a local agency with pipeline stages and weekly revenue chart"'
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={streaming}
                data-helper-prompt=""
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    runQuery();
                  }
                }}
              />
              <p className="dm-field-hint">⌘+Enter to submit · ⌘+Enter again to apply</p>
            </div>

            <button
              type="button"
              className="dm-btn-primary"
              style={{ width: "100%" }}
              onClick={runQuery}
              disabled={streaming || !prompt.trim()}
              data-helper-submit=""
            >
              {streaming ? "Thinking…" : "Ask helper"}
            </button>

            {queryError && (
              <div className="dm-helper-error">
                <AlertCircle size={13} />
                <span>{queryError}</span>
              </div>
            )}

            {/* Streaming surface */}
            {(streaming || streamBuffer) && !result && (
              <div className="dm-helper-stream">
                <span>{streamBuffer}</span>
                {streaming && <span className="dm-stream-cursor" aria-hidden="true">|</span>}
              </div>
            )}

            {/* Proposals */}
            {result && (
              <div className="dm-helper-result">
                <div className="dm-helper-summary">
                  <Zap size={13} />
                  <span>{result.summary}</span>
                </div>

                {(result.warnings || []).length > 0 && (
                  <div className="dm-helper-warnings">
                    {result.warnings.map((w, i) => (
                      <div key={i} className="dm-helper-warning">
                        <AlertCircle size={12} />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                )}

                {(result.proposals || []).length > 0 && (
                  <>
                    <div className="dm-helper-proposals-header">
                      <span className="dm-field-label">Proposals ({result.proposals.length})</span>
                      <span className="dm-field-hint">{acceptedCount} selected</span>
                    </div>
                    <div
                      className="dm-helper-proposals"
                      role="group"
                      aria-label="Proposals"
                    >
                      {result.proposals.map((proposal, i) => (
                        <label
                          key={i}
                          className={`dm-helper-proposal${accepted[i] ? " accepted" : ""}`}
                          data-proposal-item=""
                          tabIndex={0}
                          onKeyDown={(e) => handleProposalKeyDown(e, i)}
                        >
                          <input
                            type="checkbox"
                            checked={!!accepted[i]}
                            onChange={(e) =>
                              setAccepted((prev) => ({ ...prev, [i]: e.target.checked }))
                            }
                            disabled={applying}
                            data-proposal-accept=""
                            tabIndex={-1}
                          />
                          <div className="dm-helper-proposal-body">
                            <span className="dm-helper-proposal-type">{proposal.type}</span>
                            <span className="dm-helper-proposal-field">→ {proposal.affectedField}</span>
                            <p className="dm-helper-proposal-rationale">{proposal.rationale}</p>
                          </div>
                        </label>
                      ))}
                    </div>

                    {!applyResult && (
                      <button
                        type="button"
                        className="dm-btn-primary"
                        style={{ width: "100%", marginTop: 8 }}
                        onClick={handleApply}
                        disabled={applying || acceptedCount === 0}
                      >
                        {applying
                          ? "Applying…"
                          : `Apply ${acceptedCount} proposal${acceptedCount === 1 ? "" : "s"}`}
                      </button>
                    )}
                  </>
                )}

                {applyResult && (
                  <div className="dm-helper-apply-result">
                    {applyResult.ok ? (
                      <>
                        <CheckSquare size={14} />
                        <span>
                          {applyResult.applied?.length || 0} applied
                          {skippedCount > 0 && (
                            <span data-skipped-count="">
                              , {skippedCount} skipped
                            </span>
                          )}
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertCircle size={14} />
                        <span>{applyResult.error || "Apply failed"}</span>
                        {skippedCount > 0 && (
                          <span data-skipped-count="">
                            {skippedCount} skipped
                          </span>
                        )}
                      </>
                    )}
                  </div>
                )}

                {result.receipts && (
                  <p className="dm-field-hint" style={{ marginTop: 8 }}>
                    model: {result.receipts.model} · confidence:{" "}
                    {typeof result.receipts.confidence === "number"
                      ? result.receipts.confidence.toFixed(2)
                      : "n/a"}{" "}
                    · {result.receipts.latencyMs}ms
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Setup tab */}
        {activeTab === "setup" && (
          <div className="dm-sidecar-body">
            <div className="dm-helper-setup-section">
              <p className="dm-field-label">Local Model</p>
              <code className="dm-helper-setup-value" data-local-model="">
                {localModel}
              </code>
            </div>

            <div className="dm-helper-setup-section">
              <p className="dm-field-label">Inference Endpoint</p>
              <code className="dm-helper-setup-value" data-local-endpoint="">
                {localEndpoint}
              </code>
            </div>

            <div className="dm-helper-setup-section">
              <p className="dm-field-label">Connection Status</p>
              <div className="dm-helper-connection-row" data-connection-status="">
                {pingLoading ? (
                  <span className="dm-connection-dot dm-connection-checking" />
                ) : connectionStatus === "connected" ? (
                  <span className="dm-connection-dot dm-connection-ok" />
                ) : connectionStatus === "unconfigured" ? (
                  <span className="dm-connection-dot dm-connection-amber" />
                ) : (
                  <span className="dm-connection-dot dm-connection-amber" />
                )}
                <span className="dm-helper-connection-label">
                  {pingLoading
                    ? "Checking…"
                    : connectionStatus === "connected"
                    ? "Connected"
                    : connectionStatus === "unconfigured"
                    ? "No endpoint configured"
                    : "Unreachable"}
                </span>
                <button
                  type="button"
                  className="dm-btn-outline dm-helper-recheck"
                  onClick={() => { setConnectionStatus(null); pingConnection(); }}
                  disabled={pingLoading}
                >
                  Re-check
                </button>
              </div>
            </div>

            <div className="dm-helper-setup-section">
              <p className="dm-field-label">Deployment Mode</p>
              <span className="dm-helper-setup-badge">
                {deploymentMode}
              </span>
            </div>

            <div className="dm-helper-setup-section">
              <p className="dm-field-label">Run Setup Guide</p>
              <pre className="dm-helper-setup-command" data-setup-command="">
                growthub workspace setup --open
              </pre>
              <button
                type="button"
                className="dm-btn-outline"
                style={{ marginTop: 6 }}
                onClick={() => {
                  try {
                    navigator.clipboard.writeText("growthub workspace setup --open");
                  } catch {}
                }}
              >
                Copy command
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
