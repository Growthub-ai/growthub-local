"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const HELPER_SANDBOX_OBJECT_ID = "workspace-helper-sandbox";
const HELPER_HANDOFF_DISMISS_FLAG = "workspaceHelperHandoffComplete";

const HELPER_AGENT_CHOICES = [
  { id: "codex_local", label: "Codex CLI (local)", body: "Recommended. Uses your local Codex CLI." },
  { id: "claude_local", label: "Claude Code (local)", body: "Uses your local Claude Code session." },
  { id: "cursor", label: "Cursor Agent (local)", body: "Uses Cursor Agent." },
  { id: "gemini_local", label: "Gemini CLI (local)", body: "Uses Gemini CLI." },
  { id: "opencode_local", label: "OpenCode (local)", body: "Uses OpenCode on this machine." },
  { id: "pi_local", label: "Pi (local)", body: "Uses Pi on this machine." },
  { id: "qwen_local", label: "Qwen Code (local)", body: "Uses Qwen Code on this machine." },
];

const HELPER_EXECUTION_ADAPTERS = [
  { id: "local-agent-host", label: "Local agent host (Paperclip thin adapter)" },
  { id: "agent-host", label: "Agent host (Paperclip)" },
  { id: "local-intelligence", label: "Local intelligence (OpenAI-compatible)" },
  { id: "local-process", label: "Local process (default)" },
];

function getHelperSandboxObject(config) {
  const objects = Array.isArray(config?.dataModel?.objects) ? config.dataModel.objects : [];
  return objects.find((o) => o?.id === HELPER_SANDBOX_OBJECT_ID && o?.objectType === "sandbox-environment") || null;
}

function getHelperSandboxRow(config) {
  const helper = getHelperSandboxObject(config);
  return Array.isArray(helper?.rows) ? helper.rows[0] : null;
}

function isHelperConfigured(config) {
  const row = getHelperSandboxRow(config);
  return Boolean(String(row?.adapter || "").trim() === "local-agent-host" && String(row?.agentHost || "").trim());
}

function readWorkspaceUiCacheFlag(config, key) {
  const objects = Array.isArray(config?.dataModel?.objects) ? config.dataModel.objects : [];
  const cache = objects.find((o) => o?.id === "workspace-ui-cache");
  const row = Array.isArray(cache?.rows) ? cache.rows.find((r) => r?.id === "activation") : null;
  return row?.[key];
}

function withWorkspaceUiCacheFlag(config, key, value) {
  const dataModel = config?.dataModel && typeof config.dataModel === "object" ? config.dataModel : {};
  const objects = Array.isArray(dataModel.objects) ? dataModel.objects : [];
  const existing = objects.find((o) => o?.id === "workspace-ui-cache");
  const cacheObject = existing || {
    id: "workspace-ui-cache",
    label: "Workspace UI Cache",
    source: "Workspace UI Cache",
    objectType: "custom",
    icon: "Settings",
    columns: ["id", key],
    rows: [],
    binding: { mode: "manual", source: "Workspace UI Cache" },
  };
  const columns = Array.from(new Set([...(Array.isArray(cacheObject.columns) ? cacheObject.columns : ["id"]), key]));
  const rows = Array.isArray(cacheObject.rows) ? cacheObject.rows : [];
  const hasRow = rows.some((r) => r?.id === "activation");
  const nextRows = hasRow
    ? rows.map((r) => (r?.id === "activation" ? { ...r, [key]: value } : r))
    : [...rows, { id: "activation", [key]: value }];
  const nextCache = { ...cacheObject, columns, rows: nextRows };
  const nextObjects = existing
    ? objects.map((o) => (o?.id === "workspace-ui-cache" ? nextCache : o))
    : [...objects, nextCache];
  return { ...config, dataModel: { ...dataModel, objects: nextObjects } };
}

function isHelperHandoffDismissed(config) {
  const value = readWorkspaceUiCacheFlag(config, HELPER_HANDOFF_DISMISS_FLAG);
  return value === true || String(value || "") === "true";
}

function upsertHelperSandbox(config, draft) {
  const dataModel = config?.dataModel && typeof config.dataModel === "object" ? config.dataModel : {};
  const objects = Array.isArray(dataModel.objects) ? dataModel.objects : [];
  const COLUMNS = [
    "Name", "lifecycleStatus", "runLocality", "runtime", "adapter", "agentHost", "intelligenceType",
    "workspaceRead", "proposalApply", "sandboxRun", "networkPolicy", "instructions", "timeoutMs", "status",
  ];
  const row = {
    Name: "workspace-helper",
    lifecycleStatus: "live",
    runLocality: draft.runLocality || "local",
    runtime: draft.runtime || "node",
    adapter: draft.adapter || "local-agent-host",
    agentHost: draft.agentHost,
    intelligenceType: "agent-host",
    workspaceRead: draft.workspaceRead ? "enabled" : "disabled",
    proposalApply: draft.proposalApply ? "approval-required" : "disabled",
    sandboxRun: draft.sandboxRun ? "enabled" : "disabled",
    networkPolicy: draft.networkPolicy || "workspace-only",
    instructions: "Use the existing Workspace Helper widget to answer with workspace context and propose safe workspace changes through the governed helper apply flow.",
    timeoutMs: String(draft.timeoutMs || "120000"),
    status: "live",
  };
  const existing = getHelperSandboxObject(config);
  const base = existing || {
    id: HELPER_SANDBOX_OBJECT_ID,
    label: "Workspace Helper Sandbox",
    source: "Workspace Helper Sandbox",
    objectType: "sandbox-environment",
    icon: "Terminal",
    columns: COLUMNS,
    rows: [],
    binding: { mode: "manual", source: "Workspace Helper Sandbox" },
  };
  const next = {
    ...base,
    columns: Array.from(new Set([...(Array.isArray(base.columns) ? base.columns : []), ...COLUMNS])),
    rows: Array.isArray(base.rows) && base.rows.length > 0
      ? base.rows.map((r, i) => (i === 0 ? { ...r, ...row } : r))
      : [row],
  };
  const nextObjects = existing
    ? objects.map((o) => (o?.id === HELPER_SANDBOX_OBJECT_ID ? next : o))
    : [...objects, next];
  return withWorkspaceUiCacheFlag(
    { ...config, dataModel: { ...dataModel, objects: nextObjects } },
    HELPER_HANDOFF_DISMISS_FLAG,
    true,
  );
}

function WorkspaceHelperSetupModal({ workspaceConfig, open, onClose, onSaved }) {
  const helperRow = getHelperSandboxRow(workspaceConfig);
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState({
    agentHost: helperRow?.agentHost || "codex_local",
    runLocality: helperRow?.runLocality || "local",
    runtime: helperRow?.runtime || "node",
    adapter: helperRow?.adapter || "local-agent-host",
    timeoutMs: helperRow?.timeoutMs || "120000",
    networkPolicy: helperRow?.networkPolicy || "workspace-only",
    workspaceRead: helperRow?.workspaceRead !== "disabled",
    proposalApply: helperRow?.proposalApply !== "disabled",
    sandboxRun: helperRow?.sandboxRun !== "disabled",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setDraft({
      agentHost: helperRow?.agentHost || "codex_local",
      runLocality: helperRow?.runLocality || "local",
      runtime: helperRow?.runtime || "node",
      adapter: helperRow?.adapter || "local-agent-host",
      timeoutMs: helperRow?.timeoutMs || "120000",
      networkPolicy: helperRow?.networkPolicy || "workspace-only",
      workspaceRead: helperRow?.workspaceRead !== "disabled",
      proposalApply: helperRow?.proposalApply !== "disabled",
      sandboxRun: helperRow?.sandboxRun !== "disabled",
    });
    setSaving(false);
    setError("");
  }, [open, helperRow?.adapter, helperRow?.agentHost, helperRow?.networkPolicy, helperRow?.proposalApply, helperRow?.runLocality, helperRow?.runtime, helperRow?.sandboxRun, helperRow?.timeoutMs, helperRow?.workspaceRead]);

  if (!open) return null;

  async function saveSetup() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const next = upsertHelperSandbox(workspaceConfig || {}, draft);
      const res = await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dataModel: next.dataModel }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Could not save helper setup");
      onSaved?.(body?.workspaceConfig || next);
    } catch (err) {
      setError(err?.message || "Could not save helper setup");
      setSaving(false);
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal((
    <div className="workspace-helper-setup-modal-backdrop" role="presentation">
      <div className="workspace-helper-setup-modal" role="dialog" aria-modal="true" aria-label="Set up workspace helper">
        <button type="button" className="workspace-helper-setup-modal-close" onClick={onClose} aria-label="Close setup">
          <X size={16} aria-hidden="true" />
        </button>
        <div className="workspace-helper-setup-breadcrumbs" aria-label="Setup steps">
          <span className={step === 1 ? "active" : ""}>1. Helper</span>
          <span className={step === 2 ? "active" : ""}>2. Agent</span>
          <span className={step === 3 ? "active" : ""}>3. Start</span>
        </div>
        {step === 1 ? (
          <section className="workspace-helper-setup-step">
            <p className="workspace-helper-setup-eyebrow">Helper setup</p>
            <h2>Make the helper the workspace operator</h2>
            <p>The helper uses one sandbox config and the same widget you already use.</p>
            <div className="workspace-helper-setup-card-grid">
              <label className="workspace-helper-setup-toggle">
                <input
                  type="checkbox"
                  checked={draft.workspaceRead}
                  onChange={(e) => setDraft((d) => ({ ...d, workspaceRead: e.target.checked }))}
                />
                <span><strong>Workspace context</strong><small>Read config, lenses, objects, and receipts.</small></span>
              </label>
              <label className="workspace-helper-setup-toggle">
                <input
                  type="checkbox"
                  checked={draft.proposalApply}
                  onChange={(e) => setDraft((d) => ({ ...d, proposalApply: e.target.checked }))}
                />
                <span><strong>Approve applies</strong><small>Draft changes first; user approves writes.</small></span>
              </label>
              <label className="workspace-helper-setup-toggle">
                <input
                  type="checkbox"
                  checked={draft.sandboxRun}
                  onChange={(e) => setDraft((d) => ({ ...d, sandboxRun: e.target.checked }))}
                />
                <span><strong>Sandbox runs</strong><small>Use the governed sandbox-run surface.</small></span>
              </label>
            </div>
          </section>
        ) : step === 2 ? (
          <section className="workspace-helper-setup-step">
            <p className="workspace-helper-setup-eyebrow">Agent</p>
            <h2>Configure the helper sandbox</h2>
            <div className="workspace-helper-setup-radio-group" aria-label="Where it runs">
              <span>Where it runs</span>
              <label>
                <input
                  type="radio"
                  name="helper-run-locality"
                  checked={draft.runLocality === "local"}
                  onChange={() => setDraft((d) => ({ ...d, runLocality: "local" }))}
                />
                local
              </label>
              <label>
                <input
                  type="radio"
                  name="helper-run-locality"
                  checked={draft.runLocality === "serverless"}
                  onChange={() => setDraft((d) => ({ ...d, runLocality: "serverless" }))}
                />
                serverless
              </label>
              <small>Choose local execution or a scheduled serverless run.</small>
            </div>
            <div className="workspace-helper-setup-field-stack">
              <label>
                Execution adapter
                <select
                  value={draft.adapter}
                  onChange={(e) => setDraft((d) => ({ ...d, adapter: e.target.value }))}
                >
                  {HELPER_EXECUTION_ADAPTERS.map((adapter) => (
                    <option key={adapter.id} value={adapter.id}>{adapter.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Agent host (Paperclip)
                <select
                  value={draft.agentHost}
                  onChange={(e) => setDraft((d) => ({ ...d, agentHost: e.target.value }))}
                >
                  {HELPER_AGENT_CHOICES.map((choice) => (
                    <option key={choice.id} value={choice.id}>{choice.label}</option>
                  ))}
                </select>
              </label>
              <div className="workspace-helper-setup-two-col">
                <label>
                  Runtime
                  <select
                    value={draft.runtime}
                    onChange={(e) => setDraft((d) => ({ ...d, runtime: e.target.value }))}
                  >
                    <option value="node">node</option>
                    <option value="shell">shell</option>
                  </select>
                </label>
                <label>
                  Timeout
                  <select
                    value={draft.timeoutMs}
                    onChange={(e) => setDraft((d) => ({ ...d, timeoutMs: e.target.value }))}
                  >
                    <option value="60000">1 minute</option>
                    <option value="120000">2 minutes</option>
                    <option value="300000">5 minutes</option>
                  </select>
                </label>
                <label>
                  Network
                  <select
                    value={draft.networkPolicy}
                    onChange={(e) => setDraft((d) => ({ ...d, networkPolicy: e.target.value }))}
                  >
                    <option value="workspace-only">Workspace only</option>
                    <option value="local-network">Local network</option>
                    <option value="egress-allowed">Allow egress</option>
                  </select>
                </label>
              </div>
            </div>
          </section>
        ) : (
          <section className="workspace-helper-setup-step">
            <p className="workspace-helper-setup-eyebrow">Start</p>
            <h2>Save and open helper</h2>
            <dl className="workspace-helper-setup-review">
              <div><dt>Helper</dt><dd>Workspace Helper widget</dd></div>
              <div><dt>Sandbox</dt><dd>workspace-helper-sandbox</dd></div>
              <div><dt>Adapter</dt><dd>{draft.adapter}</dd></div>
              <div><dt>Agent host</dt><dd>{draft.agentHost}</dd></div>
              <div><dt>Access</dt><dd>{draft.workspaceRead ? "workspace context" : "no workspace context"} · {draft.proposalApply ? "approve applies" : "no applies"} · {draft.sandboxRun ? "sandbox runs" : "no runs"}</dd></div>
              <div><dt>Runtime</dt><dd>{draft.runLocality} · {draft.runtime} · {draft.networkPolicy}</dd></div>
            </dl>
            {error ? <p className="workspace-helper-setup-error" role="alert">{error}</p> : null}
          </section>
        )}
        <div className="workspace-helper-setup-actions">
          <button type="button" onClick={() => step === 1 ? onClose?.() : setStep((s) => s - 1)}>
            {step === 1 ? "Cancel" : "Back"}
          </button>
          {step < 3 ? (
            <button type="button" className="primary" onClick={() => setStep((s) => s + 1)}>Next</button>
          ) : (
            <button type="button" className="primary" onClick={saveSetup} disabled={saving || !draft.agentHost}>
              {saving ? "Saving..." : "Save & open helper"}
            </button>
          )}
        </div>
      </div>
    </div>
  ), document.body);
}

export {
  HELPER_SANDBOX_OBJECT_ID,
  HELPER_HANDOFF_DISMISS_FLAG,
  HELPER_AGENT_CHOICES,
  getHelperSandboxRow,
  isHelperHandoffDismissed,
  isHelperConfigured,
  upsertHelperSandbox,
  WorkspaceHelperSetupModal,
};
