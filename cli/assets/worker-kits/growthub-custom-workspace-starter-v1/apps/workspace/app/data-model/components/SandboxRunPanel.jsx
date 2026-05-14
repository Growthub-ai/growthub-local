"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Copy, Play } from "lucide-react";
import { StatusPill } from "./StatusPill.jsx";

function formatDuration(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n < 1000) return `${Math.round(n)} ms`;
  return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)} s`;
}

function parseLastResponse(text) {
  const raw = String(text || "").trim();
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
  lastRunId,
  lastSourceId,
  lastResponse,
  onExpandLastResponse,
}) {
  const [showReceipt, setShowReceipt] = useState(false);
  const parsed = useMemo(() => parseLastResponse(lastResponse), [lastResponse]);
  const durationMs = parsed && typeof parsed.durationMs === "number" ? parsed.durationMs : null;
  const locality =
    String(runLocality || parsed?.runLocality || "")
      .trim()
      .toLowerCase() || null;
  const durationLabel = formatDuration(durationMs);

  async function copyText(label, value) {
    const v = String(value || "").trim();
    if (!v) return;
    try {
      await navigator.clipboard.writeText(v);
    } catch {
      /* ignore — clipboard may be denied */
    }
  }

  const localityExplanation =
    locality === "serverless"
      ? "Serverless runs POST a signed payload to the API Registry row linked by schedulerRegistryId. Credentials resolve on the server only."
      : locality === "local"
        ? "Local runs execute on this workspace host through the registered sandbox adapter (for example a child process or local-intelligence HTTP call). The browser still only calls POST /api/workspace/sandbox-run."
        : "Run locality is chosen on the sandbox row (local vs serverless). The browser never executes the adapter directly.";

  return (
    <div className="dm-record-testbar" style={{ flexWrap: "wrap", alignItems: "flex-start" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <StatusPill value={status} />
        <button
          type="button"
          className="dm-btn-primary-sm"
          disabled={sandboxRunning || disabled || !canRun}
          onClick={onRun}
        >
          {sandboxRunning ? "Running…" : (
            <>
              <Play size={13} aria-hidden />
              Run sandbox
            </>
          )}
        </button>
        {sandboxMessage && <span style={{ fontSize: 11 }}>{sandboxMessage}</span>}
      </div>

      {(lastSourceId || lastRunId || durationLabel || parsed) && (
        <div className="dm-sandbox-run-meta" style={{ width: "100%", maxWidth: "100%" }}>
          <div className="dm-sandbox-run-meta-row">
            <strong style={{ fontSize: 11 }}>Last run</strong>
            <button
              type="button"
              className="dm-btn-ghost"
              style={{ fontSize: 11, padding: "2px 8px" }}
              onClick={() => setShowReceipt((v) => !v)}
            >
              {showReceipt ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
              {showReceipt ? "Hide receipt" : "Receipt detail"}
            </button>
          </div>
          <p className="dm-sandbox-locality-note">{localityExplanation}</p>
          {durationLabel && (
            <div className="dm-sandbox-run-meta-row">
              <span>Duration</span>
              <span style={{ fontWeight: 600 }}>{durationLabel}</span>
            </div>
          )}
          {locality && (
            <div className="dm-sandbox-run-meta-row">
              <span>Run locality</span>
              <span style={{ fontWeight: 600 }}>{locality}</span>
            </div>
          )}
          {lastRunId ? (
            <div className="dm-sandbox-run-meta-row">
              <span>lastRunId</span>
              <code title={lastRunId}>{lastRunId.length > 36 ? `${lastRunId.slice(0, 36)}…` : lastRunId}</code>
            </div>
          ) : null}
          {lastSourceId ? (
            <div className="dm-sandbox-run-meta-row">
              <span>lastSourceId</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <code title={lastSourceId}>{lastSourceId.length > 40 ? `${lastSourceId.slice(0, 40)}…` : lastSourceId}</code>
                <button
                  type="button"
                  className="dm-btn-ghost"
                  aria-label="Copy lastSourceId"
                  style={{ padding: 4 }}
                  onClick={() => copyText("lastSourceId", lastSourceId)}
                >
                  <Copy size={14} aria-hidden />
                </button>
              </div>
            </div>
          ) : null}
          {showReceipt && (
            <div style={{ display: "grid", gap: 8 }}>
              <p className="dm-sandbox-locality-note" style={{ margin: 0 }}>
                Full JSON lives in <strong>lastResponse</strong> below. Expand for readability when the drawer shows the Response section.
              </p>
              {onExpandLastResponse && (
                <button type="button" className="dm-btn-ghost" style={{ justifySelf: "start", fontSize: 11 }} onClick={onExpandLastResponse} disabled={!lastResponse}>
                  Expand lastResponse JSON
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
