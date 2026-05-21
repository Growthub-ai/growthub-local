"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, GitBranch } from "lucide-react";
import { parseSandboxRunTrace, normalizeRunRecord } from "@/lib/orchestration-run-trace";
import { redactSecretsFromText } from "@/lib/orchestration-graph";

export function OrchestrationRunTracePanel({
  row,
  objectId,
  fieldName,
  selectedRunId,
  onBack,
  onOpenGraph
}) {
  const [history, setHistory] = useState([]);
  const [historyMessage, setHistoryMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeRunId, setActiveRunId] = useState(String(selectedRunId || row?.lastRunId || "").trim());

  const rowTrace = useMemo(() => parseSandboxRunTrace(row?.lastResponse), [row?.lastResponse]);

  useEffect(() => {
    setActiveRunId(String(selectedRunId || row?.lastRunId || "").trim());
  }, [selectedRunId, row?.lastRunId, row?.lastResponse]);

  useEffect(() => {
    const objectIdValue = String(objectId || "").trim();
    const name = String(row?.Name || "").trim();
    if (!objectIdValue || !name) return;
    setLoading(true);
    setHistoryMessage("");
    fetch(`/api/workspace/sandbox-run?objectId=${encodeURIComponent(objectIdValue)}&name=${encodeURIComponent(name)}`, {
      cache: "no-store"
    })
      .then((res) => res.json())
      .then((payload) => {
        if (!payload.ok) throw new Error(payload.error || "Could not load run history");
        setHistory(Array.isArray(payload.records) ? payload.records.map(normalizeRunRecord).filter(Boolean) : []);
        setHistoryMessage(`${payload.recordCount || 0} saved run${payload.recordCount === 1 ? "" : "s"}`);
      })
      .catch((err) => {
        setHistory([]);
        setHistoryMessage(err.message || "Could not load run history");
      })
      .finally(() => setLoading(false));
  }, [objectId, row?.Name]);

  const activeRecord = useMemo(() => {
    if (activeRunId && history.length) {
      const match = history.find((r) => r.runId === activeRunId);
      if (match) return match;
    }
    if (fieldName === "lastResponse" || !activeRunId) {
      return {
        runId: rowTrace.runId || row?.lastRunId || "",
        ranAt: rowTrace.ranAt || row?.lastTested || "",
        exitCode: rowTrace.exitCode,
        durationMs: rowTrace.durationMs,
        error: rowTrace.error,
        stdout: rowTrace.stdout,
        stderr: rowTrace.stderr,
        output: rowTrace.output
      };
    }
    return history[0] || null;
  }, [activeRunId, history, rowTrace, fieldName, row?.lastRunId, row?.lastTested]);

  const summary = fieldName === "lastSourceId"
    ? `Source ${String(row?.lastSourceId || "").trim()}`
    : fieldName === "lastRunId"
      ? `Run ${String(row?.lastRunId || activeRunId || "").trim()}`
      : "Latest sandbox run";

  return (
    <section className="dm-orchestration-trace" aria-label="Run trace viewer">
      <header className="dm-orchestration-trace__head">
        <button type="button" className="dm-orchestration-header__back" onClick={onBack} aria-label="Back to record">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h2>Run trace</h2>
          <p>{summary} · {row?.Name || "Sandbox tool"}</p>
        </div>
        {onOpenGraph && (
          <button type="button" className="dm-btn-outline" onClick={onOpenGraph}>
            <GitBranch size={14} aria-hidden="true" />
            Edit graph
          </button>
        )}
      </header>

      <div className="dm-orchestration-trace__body">
        <aside className="dm-orchestration-trace__list">
          <p className="dm-orchestration-trace__list-title">Run history</p>
          {loading && <p className="dm-orchestration-config__hint">Loading…</p>}
          {!loading && historyMessage && <p className="dm-orchestration-config__hint">{historyMessage}</p>}
          <button
            type="button"
            className={`dm-orchestration-trace__run${!activeRunId ? " is-active" : ""}`}
            onClick={() => setActiveRunId("")}
          >
            <span>Row preview</span>
            <span>{row?.status || rowTrace.status || "—"} · {row?.lastTested || rowTrace.ranAt || "—"}</span>
          </button>
          {history.map((record) => (
            <button
              key={record.runId || record.ranAt}
              type="button"
              className={`dm-orchestration-trace__run${activeRunId === record.runId ? " is-active" : ""}`}
              onClick={() => setActiveRunId(record.runId)}
            >
              <span>{record.runId || "run"}</span>
              <span>
                {record.exitCode === 0 && !record.error ? "success" : "failed"}
                {record.ranAt ? ` · ${record.ranAt}` : ""}
              </span>
            </button>
          ))}
        </aside>

        <div className="dm-orchestration-trace__detail">
          <dl className="dm-orchestration-trace__meta">
            <div><dt>Status</dt><dd>{row?.status || rowTrace.status || (activeRecord?.exitCode === 0 ? "connected" : "—")}</dd></div>
            <div><dt>Run ID</dt><dd>{activeRecord?.runId || row?.lastRunId || "—"}</dd></div>
            <div><dt>Exit code</dt><dd>{activeRecord?.exitCode ?? rowTrace.exitCode ?? "—"}</dd></div>
            <div><dt>Duration</dt><dd>{activeRecord?.durationMs ?? rowTrace.durationMs ?? "—"} ms</dd></div>
            <div><dt>Runtime</dt><dd>{rowTrace.runtime || row?.runtime || "—"}</dd></div>
            <div><dt>Adapter</dt><dd>{rowTrace.adapter || row?.adapter || "—"}</dd></div>
            <div><dt>Run locality</dt><dd>{rowTrace.runLocality || row?.runLocality || "—"}</dd></div>
            <div><dt>Tested</dt><dd>{activeRecord?.ranAt || row?.lastTested || rowTrace.ranAt || "—"}</dd></div>
          </dl>

          {(activeRecord?.error || rowTrace.error) && (
            <div className="dm-orchestration-trace__error">
              <span>Error</span>
              <pre>{redactSecretsFromText(activeRecord?.error || rowTrace.error)}</pre>
            </div>
          )}

          <div className="dm-orchestration-trace__output">
            <span>Stdout</span>
            <pre>{redactSecretsFromText(activeRecord?.stdout || rowTrace.stdout || "—")}</pre>
          </div>

          {(activeRecord?.output || rowTrace.output) && (
            <div className="dm-orchestration-trace__output">
              <span>Normalized output</span>
              <pre>{redactSecretsFromText(activeRecord?.output || rowTrace.output)}</pre>
            </div>
          )}

          {(activeRecord?.stderr || rowTrace.stderr) && (
            <div className="dm-orchestration-trace__output">
              <span>Stderr</span>
              <pre>{redactSecretsFromText(activeRecord?.stderr || rowTrace.stderr)}</pre>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
