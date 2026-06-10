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
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  Box,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Database,
  HelpCircle,
  LayoutDashboard,
  ListPlus,
  Paperclip,
  Plug,
  Plus,
  Settings,
  SquareDashedMousePointer,
  SquarePen,
  Wrench,
  Wrench as RepairIcon,
  X,
} from "lucide-react";
import {
  HELPER_SANDBOX_OBJECT_ID,
  isHelperConfigured,
  WorkspaceHelperSetupModal,
} from "../../components/WorkspaceHelperSetupModal.jsx";
import { SwarmRunCockpit, SwarmAgentTranscript } from "./SwarmRunCockpit.jsx";
import { SidecarExpandView } from "./SidecarExpandView.jsx";
import { parseSlashInput } from "./helper-commands.js";
import { summarizeSwarmRunProposal, SWARM_WORKFLOWS_OBJECT_ID } from "@/lib/workspace-swarm-proposal";

// Generic "Tool Call Output" title matches the reference grammar — the
// user already sees the prompt + assistant response in the chat above,
// so the tool-call card just needs a clean, neutral header that reads
// as a metadata accordion. The wrench icon is used for every type.

// Thin, agnostic tool-call card. One per applied proposal. Renders the
// success confirmation the user needs to close the no-code loop. The
// chevron accordion exposes raw payload JSON for inspection; the Open
// button navigates to the created artifact (via onOpenArtifact, owned
// by the page-level shell). Pure presentational — no state above an
// expanded/collapsed flag.
function ToolCallCard({ proposal, content, onOpenArtifact }) {
  const [open, setOpen] = useState(false);
  const canNavigate = typeof onOpenArtifact === "function" && resolveArtifactTarget(proposal) != null;
  const meta = {
    type: proposal?.type,
    affectedField: proposal?.affectedField,
    payload: proposal?.payload,
    rationale: proposal?.rationale,
    confidence: proposal?.confidence,
  };
  const showJson = meta.payload != null || meta.affectedField || meta.rationale;
  return (
    <div className="dm-helper-toolcall" data-toolcall-type={proposal?.type}>
      <button
        type="button"
        className="dm-helper-toolcall-row"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${open ? "Hide" : "Show"} tool call output`}
      >
        <Wrench size={14} className="dm-helper-toolcall-icon" aria-hidden="true" />
        <span className="dm-helper-toolcall-title">Tool Call Output</span>
        <ChevronDown
          size={14}
          className={`dm-helper-toolcall-chevron${open ? " is-open" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="dm-helper-toolcall-body">
          {content && <div className="dm-helper-toolcall-content">{content}</div>}
          {showJson && (
            <pre className="dm-helper-toolcall-json">
              {JSON.stringify(meta, null, 2)}
            </pre>
          )}
        </div>
      )}
      {canNavigate && (
        <button
          type="button"
          className="dm-helper-toolcall-open"
          onClick={() => onOpenArtifact(proposal)}
        >
          Open
          <ArrowUpRight size={12} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function formatRunDuration(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return "";
  const totalSeconds = Math.max(0, Math.round(value / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function ProposalReviewCard({ proposal, checked, disabled, onCheckedChange, onKeyDown }) {
  const [open, setOpen] = useState(false);
  const summary = summarizePayload(proposal);
  return (
    <div className="dm-helper-toolcall" data-proposal-item="" tabIndex={0} onKeyDown={onKeyDown}>
      <div className="dm-helper-toolcall-row dm-helper-proposal-card-row">
        <input
          type="checkbox"
          checked={!!checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          disabled={disabled}
          data-proposal-accept=""
          aria-label={`Select ${proposal.type}`}
        />
        <button
          type="button"
          className="dm-helper-proposal-card-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className="dm-helper-toolcall-title">{proposal.type}</span>
          <span className="dm-helper-proposal-field">→ {proposal.affectedField}</span>
          <ChevronDown
            size={14}
            className={`dm-helper-toolcall-chevron${open ? " is-open" : ""}`}
            aria-hidden="true"
          />
        </button>
      </div>
      {open && (
        <div className="dm-helper-toolcall-body">
          {summary && <p className="dm-helper-proposal-payload" data-proposal-payload="">{summary}</p>}
          {proposal.rationale && <p className="dm-helper-proposal-rationale">{proposal.rationale}</p>}
        </div>
      )}
    </div>
  );
}

// Pair a system apply-receipt message with the actual proposal payload
// it confirms. The applyResult (rehydrated from row.lastApplied at thread
// load time) carries the typed payloads keyed in order — we walk the
// system messages in order and pop the matching applied entry. Falls
// back to a content-only render when no payload is available.
function resolveSystemReceipt(message, applyResult) {
  if (!message || message.role !== "system") return null;
  // Direct attachment (when the message itself carries proposal data).
  if (message.proposal) return message.proposal;
  if (message.payload) {
    return { type: message.kind || "system", payload: message.payload };
  }
  // Pull from rehydrated applyResult.applied[] — first non-consumed entry.
  const applied = applyResult && Array.isArray(applyResult.applied) ? applyResult.applied : [];
  // Heuristic match: the system message content contains the proposal
  // type when the apply receipt is "Applied N: <type> → <field>".
  for (const a of applied) {
    const p = a?.proposal || a;
    if (!p?.type) continue;
    if (typeof message.content === "string" && message.content.includes(p.type)) {
      return p;
    }
  }
  // Otherwise return the first applied as a best-effort.
  if (applied.length > 0) return applied[0].proposal || applied[0];
  return { type: message.kind || "apply-receipt", payload: null };
}

// Resolve where the Open button should navigate based on the proposal
// shape. Returns null when no navigation makes sense (e.g. explain.object).
function resolveArtifactTarget(proposal) {
  // Apply receipts in the swarm lane carry an explicit artifact target.
  if (proposal?.artifact?.surface === "swarm-run") return proposal.artifact;
  const pl = proposal?.payload || {};
  switch (proposal?.type) {
    case "swarm.run.propose":
    case "swarm.workflow.save":
    case "swarm.run.resume":
      return pl.name
        ? { surface: "swarm-run", objectId: SWARM_WORKFLOWS_OBJECT_ID, name: pl.name }
        : null;
    case "dataModel.object.create":
    case "dataModel.object.update":
      return pl.label || pl.id ? { surface: "data-model", source: pl.label || pl.id } : null;
    case "dataModel.row.add":
      return pl.objectId ? { surface: "data-model", source: pl.objectId } : null;
    case "dashboard.create":
    case "dashboard.update":
      return pl.id ? { surface: "dashboard", dashboardId: pl.id } : null;
    case "canvas.widget.add":
      return pl.sourceObjectId ? { surface: "data-model", source: pl.sourceObjectId } : null;
    case "repair.binding":
      return pl.objectId ? { surface: "data-model", source: pl.objectId } : null;
    default:
      return null;
  }
}

// Derive a short, human title for a thread row using the same fallback
// chain as the rail's chat tab (title → first summary clause → intent →
// generic label). Keeps the sidecar header title aligned with what the
// user sees in the rail thread list.
function deriveThreadDisplayTitle(threadOrRow, fallback = "Workspace Helper") {
  if (!threadOrRow) return fallback;
  const title = typeof threadOrRow.title === "string" ? threadOrRow.title.trim() : "";
  if (title) return title;
  const summary = typeof threadOrRow.summary === "string" ? threadOrRow.summary.trim() : "";
  if (summary) {
    const firstClause = summary.split(/[\n\.]/)[0].trim();
    if (firstClause) return firstClause.length > 56 ? `${firstClause.slice(0, 55)}…` : firstClause;
  }
  return fallback;
}

// Lucide-react icon per intent. Used by the empty-state chip stack to give
// each governance lane a recognizable mark matching the Twenty/Ask AI
// reference grammar (icon-left, plain label).
const INTENT_ICON = {
  build_dashboard: LayoutDashboard,
  create_object:   Plus,
  edit_view:       SquarePen,
  repair:          Wrench,
  create_widget:   SquareDashedMousePointer,
  register_api:    Plug,
  explain:         HelpCircle,
};

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

// Quick-swap suggestions surfaced under the Local Model input in the Setup
// tab. Click → swaps the draft value; user still needs to hit Save & connect.
const SETUP_QUICK_MODELS = [
  "gemma3:4b",
  "llama3.1:8b",
  "qwen2.5:7b",
  "mistral:7b",
  "phi3:14b",
];

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
  const helper = objects.find((obj) => obj?.id === HELPER_SANDBOX_OBJECT_ID && obj?.objectType === "sandbox-environment");
  if (Array.isArray(helper?.rows) && helper.rows.length > 0) return helper.rows[0];
  for (const obj of objects) {
    if (obj.id !== HELPER_SANDBOX_OBJECT_ID && obj.objectType === "sandbox-environment" && Array.isArray(obj.rows) && obj.rows.length > 0) {
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
    case "swarm.run.propose":
    case "swarm.workflow.save":
    case "swarm.run.resume":
      return summarizeSwarmRunProposal(proposal);
    default:
      return "";
  }
}

export function HelperSidecar({ open, onClose, workspaceConfig, initialIntent, initialPrompt, initialThread, onApplied, onOpenArtifact }) {
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

  // Sidecar internal view (SWARM_RUN_CONTRACT_V1) — the swarm cockpit lives
  // INSIDE the helper sidecar, no new route. "chat" is the existing
  // conversation surface; swarm views render the governed run cockpit;
  // "tool-output" is the expanded transcript frame.
  const [activeView, setActiveView] = useState("chat");
  // Focused workflow row when opened from an apply receipt's Open button.
  const [swarmFocus, setSwarmFocus] = useState(null);
  // Expanded transcript agent (tool-output view) + full-width takeover flag.
  const [expandedAgent, setExpandedAgent] = useState(null);
  const [expandActive, setExpandActive] = useState(false);
  const priorViewRef = useRef("swarm-list");
  // Slash menu — active index; "dismissed" suppresses the menu until the
  // prompt changes again (Esc behavior).
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);

  // Setup tab state
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [pingLoading, setPingLoading] = useState(false);
  // Editable draft for local-model / endpoint / adapter mode. Seeded from
  // the live sandbox-environment row whenever the sidecar opens; writes
  // back via PATCH /api/workspace { dataModel } and re-pings on save.
  const [modelDraft, setModelDraft] = useState("");
  const [endpointDraft, setEndpointDraft] = useState("");
  const [adapterDraft, setAdapterDraft] = useState("ollama");
  const [savingSetup, setSavingSetup] = useState(false);
  const [setupSaveError, setSetupSaveError] = useState("");
  const [setupSaveOk, setSetupSaveOk] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [agentSetupOpen, setAgentSetupOpen] = useState(false);

  // Drag state
  const [panelWidth, setPanelWidth] = useState(persistedWidth);
  const dragRef = useRef({ dragging: false, startX: 0, startWidth: 0 });
  const sidecarRef = useRef(null);
  const promptRef = useRef(null);

  // Auto-anchor the conversation to the latest turn whenever a new
  // message arrives or the assistant starts streaming. ChatGPT pattern —
  // no scroll-to-bottom affordance, browser scroll behaviour is enough.
  const conversationRef = useRef(null);
  useEffect(() => {
    const el = conversationRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, streaming]);

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
    // Rehydrate the last apply outcome from the governed thread row so
    // ToolCallCard rows render after page refresh / Reopen, not just
    // inside the live session. The apply route persists lastApplied[]
    // with full payload, confidence, rationale per receipt.
    const lastApplied = Array.isArray(initialThread.lastApplied) ? initialThread.lastApplied : [];
    const lastSkipped = Array.isArray(initialThread.lastSkipped) ? initialThread.lastSkipped : [];
    if (lastApplied.length > 0 || lastSkipped.length > 0) {
      setApplyResult({
        ok: true,
        rehydrated: true,
        applied: lastApplied.map((r) => ({ proposal: { ...r }, ...r })),
        skipped: lastSkipped.map((s) => ({ proposal: { type: s.type, affectedField: s.affectedField, payload: s.payload || null }, reason: s.reason })),
      });
    } else {
      setApplyResult(null);
    }
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
      setActiveView("chat");
      setSwarmFocus(null);
      setExpandedAgent(null);
      setExpandActive(false);
      setSlashIndex(0);
      setSlashDismissed(false);
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

  // Escape key — expand mode collapses back to the prior sidecar view first;
  // a second Escape (or Escape outside expand mode) closes the sidecar as
  // before. Predictable, no scroll trap.
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (e.key !== "Escape") return;
      if (expandActive) {
        e.preventDefault();
        setExpandActive(false);
        if (activeView === "tool-output") {
          setActiveView(priorViewRef.current || "swarm-list");
          setExpandedAgent(null);
        }
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, expandActive, activeView]);

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
  const helperAgentConfigured = isHelperConfigured(workspaceConfig);
  const liveModel = sandboxRow?.localModel || "";
  const liveEndpoint = sandboxRow?.localEndpoint || "";
  const liveAdapter = sandboxRow?.intelligenceAdapterMode || "ollama";
  const deploymentMode = liveAdapter === "custom-openai-compatible" || liveAdapter === "vllm" ? "hosted" : "local";
  const isUnconfigured = !liveEndpoint;
  const setupIsDirty =
    modelDraft.trim() !== liveModel ||
    endpointDraft.trim() !== liveEndpoint ||
    adapterDraft !== liveAdapter;
  const setupStatusState = pingLoading
    ? "checking"
    : connectionStatus === "connected"
      ? "connected"
      : isUnconfigured
        ? "unconfigured"
        : "unreachable";
  const setupStatusLabel = {
    checking: "Checking connection…",
    connected: "Connected to your local model",
    unconfigured: "No local model configured yet",
    unreachable: "Could not reach your local model",
  }[setupStatusState];
  const setupStatusMeta = {
    checking: "",
    connected: liveModel && liveEndpoint ? `${liveModel} · ${liveEndpoint}` : "",
    unconfigured: "Configure your local model below to start using the helper.",
    unreachable: "Start your local Ollama / LM Studio server, or verify the endpoint URL.",
  }[setupStatusState];

  // Seed setup-tab drafts whenever the sidecar opens or the underlying
  // sandbox row changes. Drafts mirror the live row on open and diverge
  // only after the user edits a field.
  useEffect(() => {
    if (!open) return;
    setModelDraft(liveModel);
    setEndpointDraft(liveEndpoint);
    setAdapterDraft(liveAdapter || "ollama");
    setSetupSaveError("");
    setSetupSaveOk(false);
  }, [open, liveModel, liveEndpoint, liveAdapter]);

  async function saveSetup() {
    if (savingSetup) return;
    setSavingSetup(true);
    setSetupSaveError("");
    setSetupSaveOk(false);
    try {
      const dm = workspaceConfig?.dataModel || {};
      const objects = Array.isArray(dm.objects) ? dm.objects.slice() : [];
      const sbIdx = objects.findIndex(
        (o) => o?.objectType === "sandbox-environment" && Array.isArray(o?.rows) && o.rows.length > 0,
      );
      let nextObjects;
      if (sbIdx >= 0) {
        const obj = objects[sbIdx];
        const rows = obj.rows.slice();
        rows[0] = {
          ...rows[0],
          localModel: modelDraft.trim(),
          localEndpoint: endpointDraft.trim(),
          intelligenceAdapterMode: adapterDraft,
        };
        objects[sbIdx] = { ...obj, rows };
        nextObjects = objects;
      } else {
        // First-time setup: seed a minimal sandbox-environment object so the
        // helper has a row to read at request time.
        objects.push({
          id: "workspace-helper-sandbox",
          label: "Workspace Helper Sandbox",
          source: "Workspace Helper Sandbox",
          objectType: "sandbox-environment",
          icon: "Terminal",
          columns: [
            "Name", "lifecycleStatus", "runLocality", "runtime",
            "intelligenceType", "localModel", "localEndpoint", "intelligenceAdapterMode",
          ],
          rows: [{
            Name: "workspace-helper",
            lifecycleStatus: "live",
            runLocality: "local",
            runtime: "node",
            intelligenceType: "local-intelligence",
            localModel: modelDraft.trim(),
            localEndpoint: endpointDraft.trim(),
            intelligenceAdapterMode: adapterDraft,
          }],
          binding: { mode: "manual", source: "Workspace Helper Sandbox" },
        });
        nextObjects = objects;
      }
      const res = await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dataModel: { ...dm, objects: nextObjects } }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSetupSaveError(body?.error || "Could not save. Try again or check the workspace persistence mode.");
        return;
      }
      if (body?.workspaceConfig && onApplied) {
        onApplied(body.workspaceConfig);
      }
      setSetupSaveOk(true);
      setConnectionStatus(null);
      await pingConnection();
    } catch (err) {
      setSetupSaveError(err?.message || "Save failed");
    } finally {
      setSavingSetup(false);
    }
  }

  function copyCommand() {
    try {
      navigator.clipboard.writeText("growthub workspace setup --open");
      setCopiedCommand(true);
      window.setTimeout(() => setCopiedCommand(false), 1200);
    } catch {
      // Clipboard API unavailable — surface no feedback; users can copy by hand.
    }
  }

  const acceptedCount = Object.values(accepted).filter(Boolean).length;
  const skippedCount = applyResult?.skipped?.length || 0;
  const hasProposals = result && (result.proposals || []).length > 0;
  const visibleWarnings = (result?.warnings || []).filter((warning) => {
    const text = String(warning || "");
    return !/transcript does not include the actual registry row id or lastResponse payload/i.test(text)
      && !/No credentials or env values should be stored/i.test(text);
  });

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

  // Slash menu state derives from the live prompt. The menu only engages
  // when "/" is the first character (parseSlashInput), never mid-sentence.
  const slash = slashDismissed ? { active: false, query: "", matches: [] } : parseSlashInput(prompt);
  const slashActive = slash.active && slash.matches.length > 0 && !streaming && activeView === "chat";

  // Selecting a command never mutates config: read-only commands switch the
  // sidecar view or seed a prompt; mutating commands seed a governed
  // proposal request (intent + template) that still travels query → review
  // → apply. No command calls sandbox-run or PATCH directly.
  const selectSlashCommand = (cmd) => {
    setSlashDismissed(false);
    setSlashIndex(0);
    if (cmd.view) {
      setPrompt("");
      setSwarmFocus(null);
      setActiveView(cmd.view);
      return;
    }
    if (cmd.intent) onPickIntent(cmd.intent);
    setPrompt(cmd.promptTemplate ? `${cmd.promptTemplate} ` : "");
    try { promptRef.current?.focus(); } catch {}
  };

  const handleSlashKeyDown = (e) => {
    if (!slashActive) return false;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSlashIndex((i) => (i + 1) % slash.matches.length);
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSlashIndex((i) => (i - 1 + slash.matches.length) % slash.matches.length);
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      selectSlashCommand(slash.matches[Math.min(slashIndex, slash.matches.length - 1)]);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setSlashDismissed(true);
      return true;
    }
    return false;
  };

  // Refresh the page-level workspace config after a sandbox-run stamps run
  // state onto a row — same onApplied channel the apply flow already uses.
  const refreshWorkspaceConfig = async () => {
    try {
      const res = await fetch("/api/workspace");
      const data = await res.json();
      if (data?.workspaceConfig && onApplied) onApplied(data.workspaceConfig);
    } catch {
      // Non-fatal — the cockpit's own history polling still reflects the run.
    }
  };

  // Open a swarm artifact (apply receipt → Open) inside the sidecar cockpit;
  // every other artifact surface keeps routing through the page-level handler.
  const handleOpenArtifact = (target, proposal) => {
    if (target?.surface === "swarm-run") {
      setSwarmFocus({ objectId: target.objectId, name: target.name });
      setActiveView("swarm-detail");
      return;
    }
    if (typeof onOpenArtifact === "function") onOpenArtifact(target, proposal);
  };

  const handleExpandTranscript = (agent) => {
    priorViewRef.current = activeView === "tool-output" ? priorViewRef.current : activeView;
    setExpandedAgent(agent);
    setActiveView("tool-output");
    setExpandActive(true);
  };

  const collapseExpand = () => {
    setExpandActive(false);
    setActiveView(priorViewRef.current || "swarm-list");
    setExpandedAgent(null);
  };

  const inSwarmView = activeView === "swarm-list" || activeView === "swarm-detail" || activeView === "tool-output";

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
        style={{ width: expandActive ? "80vw" : panelWidth }}
      >
        {/* Drag handle */}
        <div
          className="dm-sidecar-drag-handle"
          data-drag-handle=""
          onMouseDown={handleDragStart}
          title="Drag to resize"
          aria-hidden="true"
        />

        {/* Header — title left; gear toggles Assistant ↔ Setup, then close. */}
        <div className="dm-sidecar-header">
          <div className="dm-sidecar-header-left">
            {inSwarmView && (
              <button
                type="button"
                className="dm-sidecar-icon-btn"
                onClick={() => {
                  if (activeView === "tool-output") { collapseExpand(); return; }
                  setActiveView("chat");
                  setSwarmFocus(null);
                }}
                aria-label="Back to chat"
                title="Back to chat"
                data-swarm-back=""
              >
                <ArrowLeft size={14} />
              </button>
            )}
            <span className="dm-sidecar-title" data-helper-title="">
              {inSwarmView
                ? "Background tasks"
                : threadActive
                  ? deriveThreadDisplayTitle(initialThread, "Workspace Helper")
                  : "Workspace Helper"}
            </span>
          </div>
          <div className="dm-sidecar-header-right">
            <button
              type="button"
              className="dm-sidecar-icon-btn"
              onClick={() => setActiveTab((current) => (current === "setup" ? "assistant" : "setup"))}
              aria-label={activeTab === "setup" ? "Back" : "Setup"}
              title={activeTab === "setup" ? "Back" : "Setup"}
              data-tab={activeTab === "setup" ? "assistant" : "setup"}
            >
              {activeTab === "setup" ? <ArrowLeft size={14} /> : <Settings size={14} />}
            </button>
            <button
              type="button"
              className="dm-sidecar-icon-btn"
              onClick={onClose}
              aria-label="Close workspace helper"
              title="Close"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Swarm cockpit views — Background tasks list / detail / expanded
            transcript. Same sidecar shell, no route change; chat state stays
            mounted-adjacent and untouched while the user inspects runs. */}
        {activeTab === "assistant" && inSwarmView && (
          <div className="dm-sidecar-body dm-swarm-body" data-swarm-view={activeView}>
            {activeView === "tool-output" && expandedAgent ? (
              <SidecarExpandView title={expandedAgent.label || "Transcript"} onBack={collapseExpand}>
                <SwarmAgentTranscript agent={expandedAgent} />
              </SidecarExpandView>
            ) : (
              <SwarmRunCockpit
                workspaceConfig={workspaceConfig}
                focus={activeView === "swarm-detail" ? swarmFocus : null}
                onConfigRefresh={refreshWorkspaceConfig}
                onExpandTranscript={handleExpandTranscript}
              />
            )}
          </div>
        )}

        {/* Assistant tab — composer-at-bottom layout (Twenty Ask AI parity):
            conversation/result area on top (flex:1), bottom-anchored composer
            holds chip stack (empty state) → mode row (active thread) →
            textarea with attach + mode + send-arrow action row. */}
        {activeTab === "assistant" && !inSwarmView && (
          <div className="dm-sidecar-body dm-helper-body">
            <div className="dm-helper-conversation" ref={conversationRef}>
              {/* Conversation — ChatGPT-grade multi-turn. User bubble
                  right (grey, fits-content), assistant turn left (no
                  chip, full-width markdown via react-markdown + GFM).
                  Subtle dividers between turns. */}
              {threadActive && messages.length > 0 && (
                <div className="dm-helper-messages" data-helper-messages="">
                  {messages.map((m, i) => {
                    if (m.role !== "user" && m.role !== "assistant" && m.role !== "system") return null;
                    const userText = m.role === "user" ? (m.content || "") : "";
                    const assistantMarkdown = m.role === "assistant"
                      ? (m.summary || extractAssistantSummary(m.content) || "")
                      : "";
                    // System turns are governed apply-receipts emitted by
                    // /api/workspace/helper/apply. We render them as a
                    // ToolCallCard sitting BELOW the preceding assistant
                    // reply (OpenAI tool-call grammar) — the chevron
                    // accordion exposes the receipt's full payload so the
                    // user can audit what was actually applied. The
                    // matching proposal payload comes from the row's
                    // `lastApplied[]` we rehydrated into applyResult.
                    if (m.role === "system") {
                      const receipt = resolveSystemReceipt(m, applyResult);
                      return (
                        <div
                          key={i}
                          className="dm-helper-turn role-system"
                          data-helper-message="system"
                        >
                          <ToolCallCard
                            proposal={receipt}
                            content={m.content || ""}
                            onOpenArtifact={(p) => handleOpenArtifact(resolveArtifactTarget(p), p)}
                          />
                        </div>
                      );
                    }
                    return (
                      <div
                        key={i}
                        className={`dm-helper-turn role-${m.role}`}
                        data-helper-message={m.role}
                      >
                        {m.role === "user" && (
                          <div className="dm-helper-bubble dm-helper-bubble-user">{userText}</div>
                        )}
                        {m.role === "assistant" && (
                          <div className="dm-helper-bubble dm-helper-bubble-assistant">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {assistantMarkdown || "_(no response)_"}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {streaming && (
                    <div className="dm-helper-turn role-assistant" data-helper-message="assistant-pending">
                      <div className="dm-helper-bubble dm-helper-bubble-assistant dm-helper-bubble-pending">
                        <span className="dm-helper-typing" aria-label="Assistant is thinking">
                          <span className="dm-helper-typing-dot" />
                          <span className="dm-helper-typing-dot" />
                          <span className="dm-helper-typing-dot" />
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

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

              {/* Proposals */}
              {result && (
                <div className="dm-helper-result">
                {!threadActive && result.summary && (
                  <div className="dm-helper-summary">
                    <span>{result.summary}</span>
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
                        return (
                          <ProposalReviewCard
                            key={i}
                            proposal={proposal}
                            checked={accepted[i]}
                            disabled={applying}
                            onCheckedChange={(checked) =>
                              setAccepted((prev) => ({ ...prev, [i]: checked }))
                            }
                            onKeyDown={(e) => handleProposalKeyDown(e, i)}
                          />
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

                {/* No separate tool-call stack — each apply receipt is a
                    `system` message in the conversation above and renders
                    as a ToolCallCard inline (OpenAI tool-call grammar). */}

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
                  <div className="dm-helper-run-meta" data-helper-receipt="">
                    <span>{result.receipts.model || "run"}</span>
                    <span>{formatRunDuration(result.receipts.latencyMs)}</span>
                  </div>
                )}
              </div>
              )}
            </div>

            {/* Composer — pinned at the bottom of the sidecar body. Empty
                state surfaces a chip stack of intents (Twenty Ask AI
                grammar); active thread shows the locked mode + a textarea
                with attach (left) + mode + send (right). */}
            <div className="dm-helper-composer" data-helper-composer="">
              {!threadActive ? (
                <>
                  <p className="dm-helper-composer-prompt">What can I help you with?</p>
                  <div className="dm-helper-chip-stack" role="group" aria-label="Pick an intent">
                    {PRIMARY_INTENT_VALUES.map((value) => {
                      const Icon = INTENT_ICON[value] || Plus;
                      const isActive = activeIntent === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          className={`dm-helper-chip${isActive ? " active" : ""}`}
                          data-helper-pill={value}
                          aria-pressed={isActive}
                          disabled={streaming}
                          onClick={() => onPickIntent(value)}
                        >
                          <Icon size={15} aria-hidden="true" />
                          <span>{intentLabel(value)}</span>
                        </button>
                      );
                    })}
                    <span className="dm-helper-chip-more-wrap" ref={moreMenuRef}>
                      <button
                        type="button"
                        className={`dm-helper-chip dm-helper-chip-more${MORE_INTENT_VALUES.includes(activeIntent) ? " active" : ""}`}
                        data-helper-pill="more"
                        aria-haspopup="listbox"
                        aria-expanded={moreOpen}
                        disabled={streaming}
                        onClick={() => setMoreOpen((v) => !v)}
                      >
                        <span>{MORE_INTENT_VALUES.includes(activeIntent) ? intentLabel(activeIntent) : "More"}</span>
                        <ChevronDown size={12} aria-hidden="true" />
                      </button>
                      {moreOpen && (
                        <div className="dm-helper-pill-menu" role="listbox" data-helper-pill-menu="">
                          {MORE_INTENT_VALUES.map((value) => {
                            const Icon = INTENT_ICON[value] || Plus;
                            return (
                              <button
                                key={value}
                                type="button"
                                className={`dm-helper-pill-menu-item${activeIntent === value ? " active" : ""}`}
                                data-helper-pill={value}
                                role="option"
                                aria-selected={activeIntent === value}
                                onClick={() => onPickIntent(value)}
                              >
                                <Icon size={13} aria-hidden="true" />
                                {intentLabel(value)}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </span>
                  </div>
                </>
              ) : null}

              <div className="dm-helper-composer-input">
                {slashActive && (
                  <div className="dm-helper-pill-menu dm-helper-slash-menu" role="listbox" data-helper-slash-menu="">
                    {slash.matches.map((cmd, i) => (
                      <button
                        key={cmd.name}
                        type="button"
                        className={`dm-helper-pill-menu-item${i === Math.min(slashIndex, slash.matches.length - 1) ? " active" : ""}`}
                        role="option"
                        aria-selected={i === slashIndex}
                        data-helper-slash-item={cmd.name}
                        onClick={() => selectSlashCommand(cmd)}
                        onMouseEnter={() => setSlashIndex(i)}
                      >
                        <span className="dm-helper-slash-name">{cmd.name}</span>
                        <span className="dm-field-hint">{cmd.description || cmd.label}</span>
                      </button>
                    ))}
                  </div>
                )}
                <textarea
                  id="helper-prompt"
                  ref={promptRef}
                  className="dm-helper-composer-textarea"
                  rows={threadActive ? 2 : 3}
                  placeholder={threadActive
                    ? 'Continue, or type / for commands…'
                    : 'Type / for commands, or ask anything…'}
                  value={prompt}
                  onChange={(e) => {
                    setPrompt(e.target.value);
                    setSlashDismissed(false);
                    setSlashIndex(0);
                  }}
                  disabled={streaming}
                  data-helper-prompt=""
                  aria-label="Helper prompt"
                  onKeyDown={(e) => {
                    // Slash menu intercepts navigation/selection keys while
                    // open; Cmd+Enter submission below stays intact.
                    if (handleSlashKeyDown(e)) return;
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      // Stop the window-level apply handler from firing on the
                      // same keystroke while the user is still drafting.
                      e.stopPropagation();
                      runQuery();
                    }
                  }}
                />
                <div className="dm-helper-composer-actions">
                  <button
                    type="button"
                    className="dm-helper-composer-attach"
                    aria-label="Attach files (coming soon)"
                    title="Attach files — coming soon"
                    disabled
                  >
                    <Paperclip size={14} aria-hidden="true" />
                  </button>
                  <div className="dm-helper-composer-actions-right">
                    <button
                      type="button"
                      className="dm-helper-composer-send"
                      onClick={runQuery}
                      disabled={streaming || !prompt.trim()}
                      data-helper-submit=""
                      aria-label={streaming ? "Sending" : "Send (⌘+Enter)"}
                      title={streaming ? "Sending…" : `Send · ${intentLabel(activeIntent)} (⌘+Enter)`}
                    >
                      {streaming ? (
                        <span className="dm-stream-cursor" aria-hidden="true">…</span>
                      ) : (
                        <ArrowUp size={14} aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {!threadActive && intentHint && (
                <p className="dm-helper-composer-hint" data-helper-intent-hint="">
                  {intentHint}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Setup tab — state-driven status hero + editable form + quick
            model swap + reconnect-on-save. Matches the Assistant tab's
            ChatGPT-clean rhythm; no bloat, no novelty. */}
        {activeTab === "setup" && (
          <div className="dm-sidecar-body dm-helper-setup-body">
            <p className="dm-helper-setup-intro">
              Connect the helper to Codex, Claude, or another local agent. Advanced local model setup stays below.
            </p>

            <div className={`dm-helper-setup-status state-${helperAgentConfigured ? "connected" : "unconfigured"}`}>
              <div className="dm-helper-setup-status-row">
                <span className={`dm-connection-dot dm-connection-${helperAgentConfigured ? "ok" : "amber"}`} />
                <span className="dm-helper-setup-status-label">
                  {helperAgentConfigured ? `Agent connected: ${sandboxRow?.agentHost}` : "No helper agent configured yet"}
                </span>
                <button type="button" className="dm-helper-setup-recheck" onClick={() => setAgentSetupOpen(true)}>
                  {helperAgentConfigured ? "Change agent" : "Set up agent"}
                </button>
              </div>
              <span className="dm-helper-setup-status-meta">
                Uses workspace-helper-sandbox for the same helper widget.
              </span>
            </div>

            <p className="dm-helper-setup-intro">Advanced local model fallback.</p>

            <div
              className={`dm-helper-setup-status state-${setupStatusState}`}
              data-connection-status=""
              data-connection-state={setupStatusState}
            >
              <div className="dm-helper-setup-status-row">
                <span className={`dm-connection-dot dm-connection-${
                  setupStatusState === "connected"
                    ? "ok"
                    : setupStatusState === "checking"
                      ? "checking"
                      : "amber"
                }`} />
                <span className="dm-helper-setup-status-label">{setupStatusLabel}</span>
                <button
                  type="button"
                  className="dm-helper-setup-recheck"
                  onClick={() => { setConnectionStatus(null); pingConnection(); }}
                  disabled={pingLoading}
                  aria-label="Re-check connection"
                >
                  {pingLoading ? "Checking…" : "Re-check"}
                </button>
              </div>
              {setupStatusMeta && (
                <span className="dm-helper-setup-status-meta">{setupStatusMeta}</span>
              )}
            </div>

            <div className="dm-helper-setup-section">
              <label className="dm-helper-setup-label" htmlFor="setup-model">Local Model</label>
              <input
                id="setup-model"
                type="text"
                className="dm-helper-setup-input"
                value={modelDraft}
                onChange={(e) => setModelDraft(e.target.value)}
                placeholder="e.g. gemma3:4b"
                autoComplete="off"
                spellCheck={false}
                data-local-model=""
              />
              <div className="dm-helper-setup-quick-row" role="group" aria-label="Quick model swap">
                <span className="dm-helper-setup-quick-label">Quick swap</span>
                {SETUP_QUICK_MODELS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`dm-helper-setup-quick-pill${modelDraft === m ? " active" : ""}`}
                    onClick={() => setModelDraft(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="dm-helper-setup-section">
              <label className="dm-helper-setup-label" htmlFor="setup-endpoint">Inference Endpoint</label>
              <input
                id="setup-endpoint"
                type="text"
                className="dm-helper-setup-input"
                value={endpointDraft}
                onChange={(e) => setEndpointDraft(e.target.value)}
                placeholder="http://127.0.0.1:11434/v1"
                autoComplete="off"
                spellCheck={false}
                data-local-endpoint=""
              />
            </div>

            <div className="dm-helper-setup-section">
              <label className="dm-helper-setup-label" htmlFor="setup-adapter">Adapter Mode</label>
              <select
                id="setup-adapter"
                className="dm-helper-setup-select"
                value={adapterDraft}
                onChange={(e) => setAdapterDraft(e.target.value)}
                data-adapter-mode={adapterDraft}
              >
                <option value="ollama">Ollama</option>
                <option value="lmstudio">LM Studio</option>
                <option value="vllm">vLLM</option>
                <option value="custom-openai-compatible">Custom OpenAI-compatible</option>
              </select>
              <span className="dm-helper-setup-helper-text" data-deployment-mode={deploymentMode}>
                Deployment: <strong>{deploymentMode}</strong>
              </span>
            </div>

            <div className="dm-helper-setup-actions">
              <button
                type="button"
                className="dm-helper-setup-save"
                onClick={saveSetup}
                disabled={savingSetup || !setupIsDirty || (!modelDraft.trim() || !endpointDraft.trim())}
                data-setup-save=""
              >
                {savingSetup
                  ? "Saving…"
                  : isUnconfigured
                    ? "Save & connect"
                    : "Save changes"}
              </button>
              {setupSaveOk && !setupIsDirty && (
                <span className="dm-helper-setup-save-ok">Saved</span>
              )}
              {setupSaveError && (
                <span className="dm-helper-setup-save-error" role="alert">{setupSaveError}</span>
              )}
            </div>

            <div className="dm-helper-setup-guide">
              <p className="dm-helper-setup-label">Need help getting set up?</p>
              <pre className="dm-helper-setup-command" data-setup-command="">growthub workspace setup --open</pre>
              <button
                type="button"
                className="dm-helper-setup-copy"
                onClick={copyCommand}
                aria-label="Copy setup command"
              >
                {copiedCommand ? "Copied" : "Copy command"}
              </button>
            </div>
            <WorkspaceHelperSetupModal
              workspaceConfig={workspaceConfig}
              open={agentSetupOpen}
              onClose={() => setAgentSetupOpen(false)}
              onSaved={(nextConfig) => {
                setAgentSetupOpen(false);
                if (onApplied) onApplied(nextConfig);
              }}
            />
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
