"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, GitBranch, Play, RefreshCw, Search, Square } from "lucide-react";
import { parseSandboxRunTrace, normalizeRunRecord } from "@/lib/orchestration-run-trace";
import {
  buildRunTimeline,
  downloadRunBundle,
  filterRunLogTree,
  formatRunDuration,
  normalizeRunConsoleRecord
} from "@/lib/orchestration-run-console";
import { redactSecretsFromText } from "@/lib/orchestration-graph";

const ACTIVE_STATUSES = new Set(["executing", "queued", "testing", "running"]);
const LIVE_POLL_MS = 1500;

function formatTimestamp(iso) {
  const text = String(iso || "").trim();
  if (!text) return "—";
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return text;
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return text;
  }
}

function statusToVariant(status) {
  switch (status) {
    case "completed":
      return "ok";
    case "failed":
      return "fail";
    case "executing":
    case "queued":
    case "testing":
    case "running":
      return "active";
    case "canceled":
      return "canceled";
    default:
      return "neutral";
  }
}

function describeStatus(status) {
  switch (status) {
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "executing":
      return "Executing";
    case "queued":
      return "Queued";
    case "testing":
      return "Testing";
    case "running":
      return "Running";
    case "canceled":
      return "Canceled";
    default:
      return "Unknown";
  }
}

function previewRecordFromRow(row, rowTrace) {
  const ranAt = rowTrace.ranAt || row?.lastTested || "";
  const previewSource = {
    runId: rowTrace.runId || row?.lastRunId || "",
    ranAt,
    exitCode: rowTrace.exitCode ?? null,
    durationMs: rowTrace.durationMs ?? null,
    error: rowTrace.error || "",
    stdout: rowTrace.stdout || "",
    stderr: rowTrace.stderr || "",
    output: rowTrace.output || "",
    runtime: rowTrace.runtime || row?.runtime || "",
    adapter: rowTrace.adapter || row?.adapter || "",
    runLocality: rowTrace.runLocality || row?.runLocality || "",
    envRefsResolved: rowTrace.envRefsResolved || [],
    envRefsMissing: rowTrace.envRefsMissing || [],
    sourceId: row?.lastSourceId || "",
    version: row?.version || "",
    lifecycleStatus: row?.lifecycleStatus || ""
  };
  return normalizeRunConsoleRecord(previewSource);
}

function bundleToBlobUrl(bundle) {
  const text = JSON.stringify(bundle, null, 2);
  const blob = new Blob([text], { type: "application/json" });
  return URL.createObjectURL(blob);
}

function downloadFile(filename, bundle) {
  if (typeof window === "undefined") return;
  const url = bundleToBlobUrl(bundle);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function LogTreeNode({ node, depth, selectedId, onSelect, timelineMax }) {
  const isSelected = String(selectedId) === String(node.id);
  const ratio = timelineMax > 0 && node.durationMs > 0
    ? Math.min(1, node.durationMs / timelineMax)
    : 0;
  const variant = statusToVariant(node.status);
  return (
    <div className="dm-run-console__tree-block" data-depth={depth}>
      <button
        type="button"
        className={`dm-run-console__tree-row${isSelected ? " is-active" : ""}`}
        data-variant={variant}
        onClick={() => onSelect(node)}
        title={node.label}
      >
        <span className="dm-run-console__tree-indent" aria-hidden="true" style={{ width: `${depth * 12}px` }} />
        <span className="dm-run-console__tree-dot" data-variant={variant} aria-hidden="true" />
        <span className="dm-run-console__tree-label">{node.label}</span>
        <span className="dm-run-console__tree-meta">{formatRunDuration(node.durationMs)}</span>
        <span className="dm-run-console__tree-bar" aria-hidden="true">
          <span style={{ width: `${Math.round(ratio * 100)}%` }} data-variant={variant} />
        </span>
      </button>
      {Array.isArray(node.children) && node.children.length > 0 ? (
        <div className="dm-run-console__tree-children">
          {node.children.map((child) => (
            <LogTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              timelineMax={timelineMax}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LifecycleBlock({ lifecycle }) {
  if (!Array.isArray(lifecycle) || lifecycle.length === 0) {
    return <p className="dm-run-console__hint">Lifecycle timestamps not available.</p>;
  }
  return (
    <ol className="dm-run-console__lifecycle">
      {lifecycle.map((step) => (
        <li key={step.label}>
          <span className="dm-run-console__lifecycle-label">{step.label}</span>
          <span className="dm-run-console__lifecycle-at">{formatTimestamp(step.at)}</span>
          {step.durationMs > 0 ? (
            <span className="dm-run-console__lifecycle-dur">{formatRunDuration(step.durationMs)}</span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function KeyValueBlock({ entries }) {
  const list = entries.filter(([, value]) => value !== "" && value != null);
  if (!list.length) return null;
  return (
    <dl className="dm-run-console__kv">
      {list.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CodeBlock({ label, body }) {
  if (!body) return null;
  return (
    <div className="dm-run-console__code">
      <span>{label}</span>
      <pre>{body}</pre>
    </div>
  );
}

export function OrchestrationRunTracePanel({
  row,
  objectId,
  fieldName,
  selectedRunId,
  onBack,
  onOpenGraph,
  onReplay,
  running
}) {
  const [history, setHistory] = useState([]);
  const [historyMessage, setHistoryMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeRunId, setActiveRunId] = useState(String(selectedRunId || row?.lastRunId || "").trim());
  const [query, setQuery] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [showQueueTime, setShowQueueTime] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState("overview");
  const [selectedLogId, setSelectedLogId] = useState("root");
  const [replayPending, setReplayPending] = useState(false);
  const abortRef = useRef(null);

  const rowTrace = useMemo(() => parseSandboxRunTrace(row?.lastResponse), [row?.lastResponse]);

  useEffect(() => {
    setActiveRunId(String(selectedRunId || row?.lastRunId || "").trim());
  }, [selectedRunId, row?.lastRunId, row?.lastResponse]);

  const loadHistory = useCallback(async (signal) => {
    const objectIdValue = String(objectId || "").trim();
    const name = String(row?.Name || "").trim();
    if (!objectIdValue || !name) return;
    setLoading(true);
    setHistoryMessage("");
    try {
      const res = await fetch(
        `/api/workspace/sandbox-run?objectId=${encodeURIComponent(objectIdValue)}&name=${encodeURIComponent(name)}`,
        { cache: "no-store", signal }
      );
      const payload = await res.json();
      if (!payload.ok) throw new Error(payload.error || "Could not load run history");
      const normalized = Array.isArray(payload.records)
        ? payload.records.map(normalizeRunRecord).filter(Boolean)
        : [];
      setHistory(normalized);
      setHistoryMessage(`${payload.recordCount || normalized.length} saved run${(payload.recordCount || normalized.length) === 1 ? "" : "s"}`);
    } catch (err) {
      if (err?.name === "AbortError") return;
      setHistory([]);
      setHistoryMessage(err.message || "Could not load run history");
    } finally {
      setLoading(false);
    }
  }, [objectId, row?.Name]);

  useEffect(() => {
    const controller = new AbortController();
    loadHistory(controller.signal);
    return () => controller.abort();
  }, [loadHistory]);

  const isClientRunning = Boolean(running) || replayPending;
  const liveReloading = isClientRunning;

  useEffect(() => {
    if (!liveReloading) return undefined;
    const id = setInterval(() => {
      loadHistory();
    }, LIVE_POLL_MS);
    return () => clearInterval(id);
  }, [liveReloading, loadHistory]);

  const activeRawRecord = useMemo(() => {
    if (activeRunId && history.length) {
      const match = history.find((r) => r.runId === activeRunId);
      if (match) return match;
    }
    if (fieldName === "lastResponse" || !activeRunId) {
      return null;
    }
    return history[0] || null;
  }, [activeRunId, history, fieldName]);

  const activeConsoleRecord = useMemo(() => {
    if (activeRawRecord) return normalizeRunConsoleRecord(activeRawRecord);
    return previewRecordFromRow(row, rowTrace);
  }, [activeRawRecord, row, rowTrace]);

  const timeline = useMemo(() => buildRunTimeline(history), [history]);
  const timelineMax = timeline.reduce((m, item) => Math.max(m, item.durationMs || 0), 0);

  const filteredTree = useMemo(() => (
    filterRunLogTree(activeConsoleRecord?.logTree || [], { query, errorsOnly })
  ), [activeConsoleRecord, query, errorsOnly]);

  const selectedLogNode = useMemo(() => {
    const tree = activeConsoleRecord?.logTree || [];
    const stack = [...tree];
    while (stack.length) {
      const node = stack.pop();
      if (!node) continue;
      if (String(node.id) === String(selectedLogId)) return node;
      if (Array.isArray(node.children)) stack.push(...node.children);
    }
    return tree[0] || null;
  }, [activeConsoleRecord, selectedLogId]);

  useEffect(() => {
    setSelectedLogId("root");
  }, [activeRunId]);

  const summaryText = fieldName === "lastSourceId"
    ? `Source ${String(row?.lastSourceId || "").trim()}`
    : fieldName === "lastRunId"
      ? `Run ${String(row?.lastRunId || activeRunId || "").trim()}`
      : "Latest sandbox run";

  const statusVariant = statusToVariant(activeConsoleRecord?.status);
  const statusLabel = describeStatus(activeConsoleRecord?.status);

  const canReplay = typeof onReplay === "function";

  function handleReplay() {
    if (!canReplay) return;
    setReplayPending(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = onReplay({ signal: controller.signal });
      Promise.resolve(result)
        .catch(() => {})
        .finally(() => {
          setReplayPending(false);
          abortRef.current = null;
          loadHistory();
        });
    } catch {
      setReplayPending(false);
      abortRef.current = null;
    }
  }

  function handleCancel() {
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch { /* noop */ }
    }
    setReplayPending(false);
  }

  function handleDownload() {
    if (!activeConsoleRecord) return;
    const bundle = downloadRunBundle({
      record: activeRawRecord || activeConsoleRecord,
      runId: activeConsoleRecord.runId,
      sourceId: activeConsoleRecord.sourceId || row?.lastSourceId || ""
    });
    const runLabel = String(bundle.runId || "run").replace(/[^a-zA-Z0-9_-]+/g, "-") || "run";
    downloadFile(`growthub-run-${runLabel}.json`, bundle);
  }

  const lifecycleEntries = activeConsoleRecord?.lifecycle || [];
  const payload = activeConsoleRecord?.payload || {};
  const output = activeConsoleRecord?.output || {};
  const context = activeConsoleRecord?.context || {};

  return (
    <section className="dm-run-console" aria-label="Live runs console">
      <header className="dm-run-console__head">
        {onBack && (
          <button type="button" className="dm-orchestration-header__back" onClick={onBack} aria-label="Back to record">
            <ArrowLeft size={16} />
          </button>
        )}
        <div className="dm-run-console__head-titles">
          <span className="dm-run-console__crumbs">
            Runs <span aria-hidden="true">/</span> <code>{activeConsoleRecord?.runId || "preview"}</code>
          </span>
          <h2>Run console</h2>
          <p>{summaryText} · {row?.Name || "Sandbox tool"}</p>
        </div>
        <div className="dm-run-console__head-actions">
          {canReplay && (
            <button
              type="button"
              className="dm-btn-outline"
              onClick={handleReplay}
              disabled={isClientRunning}
              title="Replay current saved config"
            >
              <Play size={13} aria-hidden="true" />
              {replayPending ? "Replaying" : "Replay current config"}
            </button>
          )}
          {isClientRunning && (
            <button
              type="button"
              className="dm-btn-outline dm-run-console__cancel"
              onClick={handleCancel}
              title="Cancel the in-flight client request"
            >
              <Square size={13} aria-hidden="true" />
              Cancel request
            </button>
          )}
          <button
            type="button"
            className="dm-btn-outline"
            onClick={handleDownload}
            disabled={!activeConsoleRecord}
            title="Download redacted JSON log for this run"
          >
            <Download size={13} aria-hidden="true" />
            Download logs
          </button>
          {onOpenGraph && (
            <button type="button" className="dm-btn-outline" onClick={onOpenGraph}>
              <GitBranch size={13} aria-hidden="true" />
              Edit graph
            </button>
          )}
        </div>
      </header>

      <div className="dm-run-console__split">
        <aside className="dm-run-console__left">
          <div className="dm-run-console__toolbar">
            <label className="dm-run-console__search">
              <Search size={12} aria-hidden="true" />
              <input
                type="search"
                placeholder="Search log"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search log"
              />
            </label>
            <label className="dm-run-console__toggle">
              <input
                type="checkbox"
                checked={showQueueTime}
                onChange={(e) => setShowQueueTime(e.target.checked)}
              />
              <span>Queue time</span>
            </label>
            <label className="dm-run-console__toggle">
              <input
                type="checkbox"
                checked={errorsOnly}
                onChange={(e) => setErrorsOnly(e.target.checked)}
              />
              <span>Errors only</span>
            </label>
            <span
              className={`dm-run-console__live${liveReloading ? " is-on" : ""}`}
              aria-live="polite"
            >
              <span className="dm-run-console__live-dot" aria-hidden="true" />
              {liveReloading ? "Live reloading" : "Idle"}
            </span>
          </div>

          <div className="dm-run-console__history">
            <p className="dm-run-console__history-title">Run history</p>
            {loading && <p className="dm-run-console__hint">Loading…</p>}
            {!loading && historyMessage && <p className="dm-run-console__hint">{historyMessage}</p>}
            <button
              type="button"
              className={`dm-run-console__history-row${!activeRunId ? " is-active" : ""}`}
              onClick={() => setActiveRunId("")}
            >
              <span className="dm-run-console__history-label">Row preview</span>
              <span className="dm-run-console__history-meta">
                {row?.status || rowTrace.status || "—"} · {formatTimestamp(row?.lastTested || rowTrace.ranAt)}
              </span>
            </button>
            {history.map((record) => {
              const isActive = activeRunId === record.runId;
              const variant = statusToVariant(normalizeRunConsoleRecord(record)?.status);
              return (
                <button
                  key={record.runId || record.ranAt}
                  type="button"
                  className={`dm-run-console__history-row${isActive ? " is-active" : ""}`}
                  data-variant={variant}
                  onClick={() => setActiveRunId(record.runId)}
                >
                  <span className="dm-run-console__history-label">
                    <span className="dm-run-console__tree-dot" data-variant={variant} aria-hidden="true" />
                    {record.runId || "run"}
                  </span>
                  <span className="dm-run-console__history-meta">
                    {record.exitCode === 0 && !record.error ? "completed" : "failed"} · {formatTimestamp(record.ranAt)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="dm-run-console__tree">
            <p className="dm-run-console__history-title">Log tree</p>
            {filteredTree.length === 0 && (
              <p className="dm-run-console__hint">
                {errorsOnly ? "No error entries in this run." : "No log entries yet."}
              </p>
            )}
            {filteredTree.map((node) => (
              <LogTreeNode
                key={node.id}
                node={node}
                depth={0}
                selectedId={selectedLogNode?.id}
                onSelect={(n) => setSelectedLogId(n.id)}
                timelineMax={timelineMax}
              />
            ))}
          </div>

          {showQueueTime && timeline.length > 0 && (
            <div className="dm-run-console__timeline">
              <p className="dm-run-console__history-title">Timeline</p>
              {timeline.map((item) => {
                const variant = statusToVariant(item.status);
                return (
                  <div key={item.runId || item.ranAt} className="dm-run-console__timeline-row" data-variant={variant}>
                    <span className="dm-run-console__timeline-label" title={item.runId}>{item.runId || "run"}</span>
                    <span className="dm-run-console__timeline-bar" aria-hidden="true">
                      <span style={{ width: `${Math.round((item.barRatio || 0) * 100)}%` }} data-variant={variant} />
                    </span>
                    <span className="dm-run-console__timeline-dur">{formatRunDuration(item.durationMs)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </aside>

        <div className="dm-run-console__right">
          <div className="dm-run-console__detail-head">
            <div className="dm-run-console__detail-title">
              <span className={`dm-run-console__status-pill is-${statusVariant}`}>{statusLabel}</span>
              <strong>{selectedLogNode?.label || "agent-run"}</strong>
              <small>{activeConsoleRecord?.runId || "—"}</small>
            </div>
            <div className="dm-run-console__detail-tabs" role="tablist">
              {["overview", "detail", "context"].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  className={`dm-run-console__detail-tab${activeDetailTab === tab ? " is-active" : ""}`}
                  onClick={() => setActiveDetailTab(tab)}
                >
                  {tab === "overview" ? "Overview" : tab === "detail" ? "Detail" : "Context"}
                </button>
              ))}
            </div>
          </div>

          {activeDetailTab === "overview" && (
            <div className="dm-run-console__detail-body">
              <section className="dm-run-console__section">
                <h3>Lifecycle</h3>
                <LifecycleBlock lifecycle={lifecycleEntries} />
              </section>
              <section className="dm-run-console__section">
                <h3>Summary</h3>
                <KeyValueBlock
                  entries={[
                    ["Status", statusLabel],
                    ["Run ID", activeConsoleRecord?.runId || "—"],
                    ["Exit code", activeConsoleRecord?.exitCode == null ? "—" : String(activeConsoleRecord.exitCode)],
                    ["Duration", formatRunDuration(activeConsoleRecord?.durationMs)],
                    ["Runtime", activeConsoleRecord?.runtime || "—"],
                    ["Adapter", activeConsoleRecord?.adapter || "—"],
                    ["Run locality", activeConsoleRecord?.runLocality || "—"],
                    ["Tested", formatTimestamp(activeConsoleRecord?.ranAt)],
                    ["Finished", formatTimestamp(activeConsoleRecord?.finishedAt)]
                  ]}
                />
              </section>
              <section className="dm-run-console__section">
                <h3>Payload</h3>
                <KeyValueBlock
                  entries={[
                    ["Object", payload.objectId || "—"],
                    ["Name", payload.name || row?.Name || "—"],
                    ["Runtime", payload.runtime || "—"],
                    ["Adapter", payload.adapter || "—"],
                    ["Version", payload.version || "—"],
                    ["Agent host", payload.agentHost || "—"],
                    ["Scheduler", payload.schedulerRegistryId || "—"],
                    ["Timeout", payload.timeoutMs ? `${payload.timeoutMs} ms` : "—"]
                  ]}
                />
                <CodeBlock label="Command" body={payload.command} />
                <CodeBlock label="Instructions" body={payload.instructions} />
              </section>
            </div>
          )}

          {activeDetailTab === "detail" && (
            <div className="dm-run-console__detail-body">
              <section className="dm-run-console__section">
                <h3>Output</h3>
                <CodeBlock label="Error" body={output.error} />
                <CodeBlock label="Stdout" body={output.stdout || "—"} />
                {output.normalizedOutput && output.normalizedOutput !== output.stdout && (
                  <CodeBlock label="Normalized output" body={output.normalizedOutput} />
                )}
                <CodeBlock label="Stderr" body={output.stderr} />
              </section>
              {selectedLogNode?.text ? (
                <section className="dm-run-console__section">
                  <h3>{selectedLogNode.label}</h3>
                  <CodeBlock label={selectedLogNode.type || "log"} body={selectedLogNode.text} />
                </section>
              ) : null}
            </div>
          )}

          {activeDetailTab === "context" && (
            <div className="dm-run-console__detail-body">
              <section className="dm-run-console__section">
                <h3>Environment</h3>
                <KeyValueBlock
                  entries={[
                    ["Network allow", context.networkAllow ? "true" : "false"],
                    ["Allow list", context.allowList?.join(", ") || "—"],
                    ["Env refs resolved", context.envRefsResolved?.join(", ") || "—"],
                    ["Env refs missing", context.envRefsMissing?.join(", ") || "—"],
                    ["Source ID", activeConsoleRecord?.sourceId || row?.lastSourceId || "—"]
                  ]}
                />
              </section>
              {context.adapterMeta && (
                <section className="dm-run-console__section">
                  <h3>Adapter metadata</h3>
                  <CodeBlock
                    label="adapterMeta"
                    body={redactSecretsFromText(JSON.stringify(context.adapterMeta, null, 2))}
                  />
                </section>
              )}
              {context.templateTrace && (
                <section className="dm-run-console__section">
                  <h3>Template trace</h3>
                  <CodeBlock
                    label="templateTrace"
                    body={redactSecretsFromText(JSON.stringify(context.templateTrace, null, 2))}
                  />
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
