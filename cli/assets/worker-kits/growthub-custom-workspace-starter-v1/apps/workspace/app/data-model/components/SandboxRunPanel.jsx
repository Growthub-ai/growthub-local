"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Copy, Play } from "lucide-react";
import { StatusPill } from "./StatusPill.jsx";

function parseLastReceipt(lastResponse) {
  const raw = String(lastResponse || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function SandboxRunPanel({
  status,
  sandboxRunning,
  sandboxMessage,
  onRun,
  disabled,
  canRun,
  runLocality,
  lastResponse,
  lastRunId,
  lastSourceId,
  lastTested,
  onExpandLastResponse
}) {
  const [showReceipt, setShowReceipt] = useState(false);
  const receipt = useMemo(() => parseLastReceipt(lastResponse), [lastResponse]);
  const durationMs =
    receipt && typeof receipt.durationMs === "number" && Number.isFinite(receipt.durationMs)
      ? receipt.durationMs
      : null;
  const locality = String(runLocality || receipt?.runLocality || "").trim().toLowerCase() || "local";
  const localityHelp =
    locality === "serverless"
      ? "Serverless runs delegate to the API Registry row referenced by schedulerRegistryId. Credentials resolve server-side only."
      : "Local runs execute in the workspace server process using registered sandbox adapters (for example node, local-intelligence).";

  async function copyText(text) {
    const t = String(text || "");
    if (!t || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(t);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="dm-record-testbar" style={{ flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <StatusPill value={status} />
        <button
          type="button"
          className="dm-btn-primary-sm"
          disabled={sandboxRunning || disabled || !canRun}
          onClick={onRun}
        >
          {sandboxRunning ? "Running…" : (<><Play size={13} aria-hidden /> Run sandbox</>)}
        </button>
        {sandboxMessage && <span style={{ fontSize: 12 }}>{sandboxMessage}</span>}
      </div>

      <div className="dm-cell-empty" style={{ fontSize: 11, maxWidth: 560, lineHeight: 1.45 }}>
        <strong>Run locality:</strong> {locality}. {localityHelp} Execution stays on{" "}
        <code style={{ fontSize: 10 }}>POST /api/workspace/sandbox-run</code> — this panel never runs providers directly.
      </div>

      {(lastRunId || lastSourceId || lastTested || receipt) && (
        <div style={{ width: "100%", fontSize: 11, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 8 }}>
          <p style={{ margin: "0 0 4px", fontWeight: 600 }}>Last run receipt</p>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
            {lastTested && <li><strong>lastTested:</strong> {String(lastTested)}</li>}
            {typeof durationMs === "number" && <li><strong>duration:</strong> {durationMs} ms</li>}
            <li><strong>status pill:</strong> reflects row status after the route stamps the row.</li>
            {lastRunId ? (
              <li>
                <strong>lastRunId:</strong> <code style={{ fontSize: 10 }}>{lastRunId}</code>
              </li>
            ) : null}
            {lastSourceId ? (
              <li style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <strong>lastSourceId:</strong> <code style={{ fontSize: 10 }}>{lastSourceId}</code>
                <button
                  type="button"
                  className="dm-btn-ghost"
                  style={{ fontSize: 10, padding: "2px 6px" }}
                  onClick={() => copyText(lastSourceId)}
                  title="Copy source id"
                >
                  <Copy size={12} aria-hidden /> Copy
                </button>
              </li>
            ) : null}
          </ul>
        </div>
      )}

      {String(lastResponse || "").trim() && (
        <div style={{ width: "100%" }}>
          <button
            type="button"
            className="dm-btn-ghost"
            style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}
            onClick={() => setShowReceipt((o) => !o)}
          >
            {showReceipt ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
            {showReceipt ? "Hide" : "Show"} lastResponse preview
          </button>
          {showReceipt && (
            <pre
              className="dm-source-preview"
              style={{ marginTop: 6, maxHeight: 180, overflow: "auto", fontSize: 10 }}
            >
              {String(lastResponse).length > 8000 ? `${String(lastResponse).slice(0, 8000)}…` : String(lastResponse)}
            </pre>
          )}
          {typeof onExpandLastResponse === "function" && (
            <button type="button" className="dm-btn-ghost" style={{ fontSize: 11, marginLeft: 8 }} onClick={onExpandLastResponse}>
              Expand full JSON
            </button>
          )}
        </div>
      )}
    </div>
  );
}
