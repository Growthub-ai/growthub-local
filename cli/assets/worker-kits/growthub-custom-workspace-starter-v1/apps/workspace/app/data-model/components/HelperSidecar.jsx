"use client";

/**
 * HelperSidecar — workspace-native helper panel.
 *
 * Rendered as a fixed right-side sidecar. Slides in over the Data Model
 * page without any route change. All Playwright data-* selectors are
 * declared here; do not rename them without updating the test suite.
 *
 * Props:
 *   open            boolean  — controlled by page-level state
 *   onClose         fn       — called when sidecar should close
 *   workspaceConfig object   — live config (for Setup tab: localModel, localEndpoint)
 *   initialIntent   string   — pre-set intent based on the object that triggered open
 *   initialPrompt   string   — optional starter prompt seeded into the textarea
 *   onApplied       fn(cfg)  — called with updated workspaceConfig after apply
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckSquare, ChevronDown, Settings, Zap, X } from "lucide-react";

const HELPER_INTENTS = [
  { value: "build_dashboard", label: "Build dashboard" },
  { value: "create_widget",  label: "Create widget" },
  { value: "register_api",   label: "Register API" },
  { value: "create_object",  label: "Create object" },
  { value: "edit_view",      label: "Edit view" },
  { value: "repair",         label: "Repair workspace" },
  { value: "explain",        label: "Explain object" },
];

// 4 primary + 3 in the "More" dropdown — chosen by no-code usage frequency.
const PRIMARY_INTENT_VALUES = ["build_dashboard", "create_object", "edit_view", "repair"];
const MORE_INTENT_VALUES   = ["create_widget", "register_api", "explain"];

// Plain-language intent descriptions surfaced to no-code users.
const HELPER_INTENT_HINTS = {
  build_dashboard: "Draft a dashboard with widgets you can review before applying.",
  create_widget:   "Suggest widgets that fit the data you already have.",
  register_api:    "Draft an API Registry entry with the fields needed to connect.",
  create_object:   "Translate a plain-language description into a new business object.",
  edit_view:       "Adjust an existing dashboard or layout — review the change before saving.",
  repair:          "Find missing references or broken bindings and propose the smallest fix.",
  explain:         "Explain what a workspace object is and how it is wired up.",
};

function intentLabel(value) {
  const found = HELPER_INTENTS.find((i) => i.value === value);
  return found ? found.label : value;
}

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

// Render a tiny payload preview chip line so non-technical users see what
// will be changed without staring at raw JSON.
function summarizePayload(proposal) {
  const p = proposal?.payload || {};
  if (typeof p !== "object") return "";
  switch (proposal.type) {
    case "dashboard.create":
    case "dashboard.update":
      return p.name ? `name: ${p.name}` : (p.id ? `id: ${p.id}` : "");
    case "widgetType.bind":
      return p.kind ? `kind: ${p.kind}${p.label ? ` · label: ${p.label}` : ""}` : "";
    case "canvas.widget.add":
      return [p.kind ? `kind: ${p.kind}` : null, p.title ? `title: ${p.title}` : null].filter(Boolean).join(" · ");
    case "canvas.tab.create":
      return p.name ? `tab: ${p.name}` : "";
    case "dataModel.object.create":
      return [p.label ? `label: ${p.label}` : null, p.objectType ? `type: ${p.objectType}` : null, Array.isArray(p.columns) ? `${p.columns.length} fields` : null].filter(Boolean).join(" · ");
    case "dataModel.object.update":
      return p.id ? `id: ${p.id}` : "";
    case "dataModel.row.add":
      return p.objectId ? `into: ${p.objectId}` : "";
    case "repair.binding":
      return p.objectId ? `binding for: ${p.objectId}` : "";
    case "explain.object":
      return p.target ? `about: ${p.target}` : "informational";
    default:
      return "";
  }
}

export function HelperSidecar({ open, onClose, workspaceConfig, initialIntent, initialPrompt, initialThread, onApplied }) {
  const [activeTab, setActiveTab] = useState("assistant");
  const [intent, setIntent] = useState(initialIntent || "create_object");
  const [prompt, setPrompt] = useState(initialPrompt || "");
  const [streaming, setStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [result, setResult] = useState(null);
  const [queryError, setQueryError] = useState("");
  const [accepted, setAccepted] = useState({});
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState(null);
  // Active thread id — set when a query response carries it, or when the
  // sidecar is opened with initialThread (reopen flow). Sent on apply so
  // the same governed row records both the proposal turn and its outcome.
  const [threadId, setThreadId] = useState(null);
  // Full multi-turn message history for the active thread. Drives the
  // conversation UI and locks the pill row once the user has sent at
  // least one message in this thread.
  const [messages, setMessages] = useState([]);
  // Active intent for this thread (locked once the first user message
  // has been sent). Pills disappear after lock.
  const [activeIntent, setActiveIntent] = useState(initialIntent || "create_object");
  // "More" dropdown open state for the pill row.
  const [moreOpen, setMoreOpen] = useState(false);
  const moreMenuRef = useRef(null);

  // Setup tab state
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [pingLoading, setPingLoading] = useState(false);

  // Drag state
  const [panelWidth, setPanelWidth] = useState(persistedWidth);
  const dragRef = useRef({ dragging: false, startX: 0, startWidth: 0 });
  const sidecarRef = useRef(null);
  const promptRef = useRef(null);

  useEffect(() => {
    if (initialIntent) { setIntent(initialIntent); setActiveIntent(initialIntent); }
  }, [initialIntent]);

  // Seed the prompt textarea when the helper opens with a starter prompt
  // (empty state CTA, palette intents). Only re-seeds when opening.
  useEffect(() => {
    if (open && initialPrompt) setPrompt(initialPrompt);
  }, [open, initialPrompt]);

  // Rehydrate the sidecar from a thread row when the user clicks Reopen
  // inside the Helper Threads Data Model object. The whole prior turn —
  // intent, prompt, summary, proposals, warnings, receipts, and the
  // multi-turn message history — is restored so the user re-enters the
  // conversation exactly where they left it.
  useEffect(() => {
    if (!open || !initialThread) return;
    if (initialThread.intent) {
      setIntent(initialThread.intent);
      setActiveIntent(initialThread.intent);
    }
    if (typeof initialThread.prompt === "string") setPrompt("");
    if (initialThread.id) setThreadId(initialThread.id);
    if (Array.isArray(initialThread.messages)) {
      setMessages(initialThread.messages);
    } else {
      setMessages([]);
    }
    if (initialThread.result && typeof initialThread.result === "object") {
      setResult(initialThread.result);
      const init = {};
      (initialThread.result.proposals || []).forEach((_, i) => { init[i] = false; });
      setAccepted(init);
      setStreamBuffer(initialThread.result.summary || "");
    } else {
      setResult(null);
      setAccepted({});
      setStreamBuffer("");
    }
    setQueryError("");
    setApplyResult(null);
  }, [open, initialThread]);

  // Move focus to the prompt textarea when the sidecar opens so the keyboard
  // flow lands somewhere useful. Run after paint so the input is mounted.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      try { promptRef.current?.focus(); } catch {}
    }, 30);
    return () => clearTimeout(t);
  }, [open]);

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
      setThreadId(null);
      setMessages([]);
      setMoreOpen(false);
    }
  }, [open]);

  // Close the "More" pill dropdown on outside click.
  useEffect(() => {
    if (!moreOpen) return undefined;
    function onPointerDown(e) {
      if (!moreMenuRef.current) return;
      if (!moreMenuRef.current.contains(e.target)) setMoreOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [moreOpen]);

  // Escape key
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Cmd+Enter at the window level fires apply when there is a result with
  // accepted proposals. The textarea handler stops propagation when the
  // user is still composing a prompt, so submit and apply never collide.
  const acceptedHasAny = Object.values(accepted).some(Boolean);
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (!((e.metaKey || e.ctrlKey) && e.key === "Enter")) return;
      if (applying || !result || !acceptedHasAny) return;
      e.preventDefault();
      handleApply();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, applying, result, acceptedHasAny]);

  // Drag handlers
  const handleDragStart = useCallback((e) => {
    e.preventDefault();
    dragRef.current = { dragging: true, startX: e.clientX, startWidth: panelWidth };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";
    let currentWidth = panelWidth;
    const onMove = (me) => {
      if (!dragRef.current.dragging) return;
      const dx = dragRef.current.startX - me.clientX;
      const next = Math.min(
        Math.max(dragRef.current.startWidth + dx, MIN_WIDTH),
        window.innerWidth * MAX_WIDTH_VW
      );
      currentWidth = next;
      setPanelWidth(next);
    };
    const onUp = () => {
      dragRef.current.dragging = false;
      persistedWidth = currentWidth;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
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
    // Optimistically append the user's turn to the local message list so
    // the conversation renders immediately while we wait for the assistant.
    const userTurn = { role: "user", content: prompt.trim(), ts: new Date().toISOString() };
    setMessages((prev) => [...prev, userTurn]);
    const submittedPrompt = prompt.trim();
    setPrompt("");

    try {
      const res = await fetch("/api/workspace/helper/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intent: activeIntent, userPrompt: submittedPrompt, threadId: threadId || undefined }),
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
            setQueryError(parsed.error || "The helper could not complete this request.");
          } else {
            setResult(parsed);
            if (parsed.threadId) setThreadId(parsed.threadId);
            if (parsed.intent && parsed.intent !== activeIntent) setActiveIntent(parsed.intent);
            if (Array.isArray(parsed.messages)) setMessages(parsed.messages);
            const init = {};
            (parsed.proposals || []).forEach((_, i) => { init[i] = true; });
            setAccepted(init);
          }
        } else {
          setQueryError("The helper response could not be read. Try again or open the Setup tab.");
        }
      } else {
        // Non-streaming fallback
        const data = await res.json();
        if (!data.ok) {
          setQueryError(data.error || "The helper could not complete this request.");
        } else {
          setResult(data);
          if (data.threadId) setThreadId(data.threadId);
          if (data.intent && data.intent !== activeIntent) setActiveIntent(data.intent);
          if (Array.isArray(data.messages)) setMessages(data.messages);
          const init = {};
          (data.proposals || []).forEach((_, i) => { init[i] = true; });
          setAccepted(init);
          setStreamBuffer(data.summary || "");
        }
      }
    } catch (err) {
      setQueryError(humanizeError(err?.message));
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
        body: JSON.stringify({ proposals, reviewedBy: "user", threadId: threadId || undefined }),
      });
      const data = await res.json();
      setApplyResult(data);
      if (Array.isArray(data.messages)) setMessages(data.messages);
      if (data.workspaceConfig && onApplied) onApplied(data.workspaceConfig);
    } catch (err) {
      setApplyResult({ ok: false, error: humanizeError(err?.message), applied: [], skipped: [] });
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
      // Probe a list-models style URL. Treat any 2xx/4xx response as
      // "reachable" — the server is responding even if the path is unknown.
      const candidates = candidatePingUrls(endpoint);
      let reachable = false;
      for (const url of candidates) {
        try {
          const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(3500) });
          if (res.status > 0 && res.status < 600) { reachable = true; break; }
        } catch { /* try next candidate */ }
      }
      setConnectionStatus(reachable ? "connected" : "unreachable");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeTab]);

  const sandboxRow = resolveSandboxEnvRow(workspaceConfig);
  const localModel = sandboxRow?.localModel || process.env.NEXT_PUBLIC_OLLAMA_MODEL || "gemma3:4b (default)";
  const localEndpoint = sandboxRow?.localEndpoint || "http://127.0.0.1:11434/v1 (default)";
  const adapterMode = sandboxRow?.intelligenceAdapterMode || "ollama";
  const deploymentMode = adapterMode === "custom-openai-compatible" || adapterMode === "vllm" ? "hosted" : "local";

  const acceptedCount = Object.values(accepted).filter(Boolean).length;
  const skippedCount = applyResult?.skipped?.length || 0;
  const hasProposals = result && (result.proposals || []).length > 0;

  // Thread is "active" the moment the user has sent at least one message,
  // OR we have rehydrated a prior thread row. Pills only show on the
  // initial empty state of a brand-new thread.
  const threadActive = messages.some((m) => m?.role === "user");
  const intentHint = HELPER_INTENT_HINTS[activeIntent] || "";

  const onPickIntent = (next) => {
    setIntent(next);
    setActiveIntent(next);
    setMoreOpen(false);
    try { promptRef.current?.focus(); } catch {}
  };

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
            {/* Intent pills — only on a brand-new thread, before any user
                message has been sent. 4 primary + a "More" dropdown for
                the remaining 3 of the 7 supported intents. */}
            {!threadActive && (
              <div className="dm-helper-intent-pills" role="group" aria-label="Pick an intent">
                {PRIMARY_INTENT_VALUES.map((value) => {
                  const label = intentLabel(value);
                  const isActive = activeIntent === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      className={`dm-helper-pill${isActive ? " active" : ""}`}
                      data-helper-pill={value}
                      aria-pressed={isActive}
                      disabled={streaming}
                      onClick={() => onPickIntent(value)}
                    >
                      {label}
                    </button>
                  );
                })}
                <span className="dm-helper-pill-more-wrap" ref={moreMenuRef}>
                  <button
                    type="button"
                    className={`dm-helper-pill dm-helper-pill-more${MORE_INTENT_VALUES.includes(activeIntent) ? " active" : ""}`}
                    data-helper-pill="more"
                    aria-haspopup="listbox"
                    aria-expanded={moreOpen}
                    disabled={streaming}
                    onClick={() => setMoreOpen((v) => !v)}
                  >
                    {MORE_INTENT_VALUES.includes(activeIntent) ? intentLabel(activeIntent) : "More"}
                    <ChevronDown size={11} style={{ marginLeft: 2 }} />
                  </button>
                  {moreOpen && (
                    <div className="dm-helper-pill-menu" role="listbox" data-helper-pill-menu="">
                      {MORE_INTENT_VALUES.map((value) => (
                        <button
                          key={value}
                          type="button"
                          className={`dm-helper-pill-menu-item${activeIntent === value ? " active" : ""}`}
                          data-helper-pill={value}
                          role="option"
                          aria-selected={activeIntent === value}
                          onClick={() => onPickIntent(value)}
                        >
                          {intentLabel(value)}
                        </button>
                      ))}
                    </div>
                  )}
                </span>
              </div>
            )}
            {!threadActive && intentHint ? (
              <p className="dm-field-hint" data-helper-intent-hint="">{intentHint}</p>
            ) : null}

            {/* Active-mode indicator — shown once the thread has activated.
                Tells the user which intent is locked for this conversation. */}
            {threadActive && (
              <div className="dm-helper-mode-row" data-helper-mode="">
                <span className="dm-helper-mode-label">Mode</span>
                <span className="dm-helper-mode-value">{intentLabel(activeIntent)}</span>
              </div>
            )}

            {/* Conversation — rendered once the user has sent at least
                one message. User turns right, assistant turns left,
                system apply-receipts as compact centered tags. The
                latest assistant turn is also surfaced as the structured
                Proposals review block below. */}
            {threadActive && messages.length > 0 && (
              <div className="dm-helper-messages" data-helper-messages="">
                {messages.map((m, i) => {
                  if (m.role !== "user" && m.role !== "assistant" && m.role !== "system") return null;
                  const text = m.role === "user"
                    ? (m.content || "")
                    : (m.role === "assistant"
                      ? (m.summary || extractAssistantSummary(m.content) || "")
                      : (m.content || ""));
                  return (
                    <div
                      key={i}
                      className={`dm-helper-message role-${m.role}`}
                      data-helper-message={m.role}
                    >
                      <span className="dm-helper-message-content">{text}</span>
                    </div>
                  );
                })}
                {streaming && (
                  <div className="dm-helper-message role-assistant" data-helper-message="assistant-pending">
                    <span className="dm-helper-message-content">
                      Thinking
                      <span className="dm-stream-cursor" aria-hidden="true">|</span>
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="dm-field-group">
              <label className="dm-field-label" htmlFor="helper-prompt">{threadActive ? "Reply" : "What do you need?"}</label>
              <textarea
                id="helper-prompt"
                ref={promptRef}
                className="dm-field-textarea"
                rows={threadActive ? 2 : 4}
                placeholder={threadActive
                  ? 'Continue the conversation…'
                  : 'e.g. "A sales ops dashboard for a local agency with pipeline stages and weekly revenue chart"'}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={streaming}
                data-helper-prompt=""
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    // Stop the window-level apply handler from firing on the
                    // same keystroke while the user is still drafting.
                    e.stopPropagation();
                    runQuery();
                  }
                }}
              />
              <p className="dm-field-hint">
                ⌘+Enter in the prompt sends. ⌘+Enter outside the prompt applies your accepted proposals.
              </p>
            </div>

            <button
              type="button"
              className="dm-btn-primary"
              style={{ width: "100%" }}
              onClick={runQuery}
              disabled={streaming || !prompt.trim()}
              data-helper-submit=""
            >
              {streaming ? "Thinking…" : (threadActive ? "Send" : "Ask helper")}
            </button>

            {queryError && (
              <div className="dm-helper-error" role="alert">
                <AlertCircle size={13} />
                <span>{queryError}</span>
              </div>
            )}

            {/* Streaming surface — only used before the thread activates
                (first turn). After activation the conversation list owns
                the live-thinking affordance via its pending bubble. */}
            {!threadActive && (streaming || streamBuffer) && !result && (
              <div className="dm-helper-stream" data-helper-stream="">
                <span>{streamBuffer}</span>
                {streaming && <span className="dm-stream-cursor" aria-hidden="true">|</span>}
              </div>
            )}

            {/* Empty hint (only before any conversation exists). */}
            {!threadActive && !streaming && !result && !queryError && !streamBuffer && (
              <div className="dm-helper-empty-hint" data-helper-empty-hint="">
                <p>Pick a mode, then describe what you need. The helper drafts proposed changes — review each one before applying.</p>
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

                {hasProposals && (
                  <>
                    <div className="dm-helper-proposals-header">
                      <span className="dm-field-label">Proposals · review before applying</span>
                      <span className="dm-field-hint">{acceptedCount} of {result.proposals.length} selected</span>
                    </div>
                    <div
                      className="dm-helper-proposals"
                      role="group"
                      aria-label="Proposals"
                    >
                      {result.proposals.map((proposal, i) => {
                        const summary = summarizePayload(proposal);
                        const conf = typeof proposal.confidence === "number" ? Math.round(proposal.confidence * 100) : null;
                        return (
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
                              <div className="dm-helper-proposal-row">
                                <span className="dm-helper-proposal-type">{proposal.type}</span>
                                <span className="dm-helper-proposal-field">→ {proposal.affectedField}</span>
                                {conf !== null && (
                                  <span className="dm-helper-proposal-confidence" data-proposal-confidence={conf}>
                                    {conf}%
                                  </span>
                                )}
                              </div>
                              {summary && (
                                <p className="dm-helper-proposal-payload" data-proposal-payload="">{summary}</p>
                              )}
                              <p className="dm-helper-proposal-rationale">{proposal.rationale}</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>

                    {!applyResult && (
                      <button
                        type="button"
                        className="dm-btn-primary"
                        style={{ width: "100%", marginTop: 8 }}
                        onClick={handleApply}
                        disabled={applying || acceptedCount === 0}
                        data-helper-apply=""
                      >
                        {applying
                          ? "Applying…"
                          : `Apply ${acceptedCount} proposal${acceptedCount === 1 ? "" : "s"}`}
                      </button>
                    )}
                  </>
                )}

                {result && !hasProposals && !queryError && (
                  <div className="dm-helper-empty-hint">
                    <p>The helper did not produce any proposals for this request. Try rewording or pick a different intent.</p>
                  </div>
                )}

                {applyResult && (
                  <div
                    className={`dm-helper-apply-result${applyResult.ok ? "" : " is-error"}`}
                    data-helper-apply-result=""
                    role="status"
                  >
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

                {applyResult?.skipped?.length > 0 && (
                  <div className="dm-helper-skipped" data-helper-skipped="">
                    <span className="dm-field-label">Skipped</span>
                    {applyResult.skipped.map((s, i) => (
                      <div key={i} className="dm-helper-skipped-row">
                        <span className="dm-helper-proposal-type">{s.proposal?.type || "unknown"}</span>
                        <span className="dm-helper-skipped-reason">{s.reason || "no reason"}</span>
                      </div>
                    ))}
                  </div>
                )}

                {result.receipts && (
                  <p className="dm-field-hint" style={{ marginTop: 8 }} data-helper-receipt="">
                    Run: {result.receipts.model} · confidence{" "}
                    {typeof result.receipts.confidence === "number"
                      ? `${Math.round(result.receipts.confidence * 100)}%`
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
            <p className="dm-field-hint" style={{ margin: 0 }}>
              The helper sends your prompt to a local model. Credentials are never stored in the workspace.
            </p>

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
              <div className="dm-helper-connection-row" data-connection-status="" data-connection-state={connectionStatus || (pingLoading ? "checking" : "idle")}>
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
                    ? "Connected to your local model"
                    : connectionStatus === "unconfigured"
                    ? "No endpoint configured yet"
                    : "Could not reach your local model"}
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
              {connectionStatus === "unreachable" && (
                <p className="dm-field-hint" style={{ marginTop: 4 }}>
                  Run the setup command below in your terminal, or start your local Ollama / LM Studio model.
                </p>
              )}
            </div>

            <div className="dm-helper-setup-section">
              <p className="dm-field-label">Deployment Mode</p>
              <span className="dm-helper-setup-badge" data-deployment-mode={deploymentMode}>
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

// Produce a short, non-leaky error label from a thrown message.
function humanizeError(msg) {
  const text = String(msg || "").trim();
  if (!text) return "Request failed";
  if (text.length < 140) return text;
  return "Request failed. Try again or check the Setup tab.";
}

// Assistant turns are stored as a JSON envelope string. Pull the human
// `summary` line out for the conversation list. Falls back to the raw
// content when the envelope is unparseable.
function extractAssistantSummary(raw) {
  if (typeof raw !== "string") return "";
  const text = raw.trim();
  if (!text) return "";
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const obj = JSON.parse(text);
      if (obj && typeof obj.summary === "string" && obj.summary.trim()) return obj.summary.trim();
    } catch {
      // fall through
    }
  }
  return text;
}

// Build candidate URLs for probing a local model endpoint. We accept any
// 2xx/4xx as "reachable" because the server is alive even when the probed
// path is unknown (different vendors use different routes).
function candidatePingUrls(endpoint) {
  const base = String(endpoint || "").trim().replace(/\/+$/, "");
  if (!base) return [];
  const isV1 = /\/v1$/.test(base);
  const root = isV1 ? base.replace(/\/v1$/, "") : base;
  const urls = new Set();
  urls.add(`${base}/models`);     // OpenAI-compatible (Ollama /v1/models, LM Studio, vLLM)
  urls.add(`${root}/api/tags`);   // Ollama native
  urls.add(`${root}/`);           // generic root probe
  urls.add(`${base}/`);
  return Array.from(urls);
}
