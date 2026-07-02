"use client";

import { useMemo, useState } from "react";

/**
 * InboundResponseInspector — the multi-tab last-run lens for the input-method
 * sidecar (Webhook / API request / Serverless Schedule). PURE presentation
 * over the row's EXISTING durable proof family — it reads
 * `lastScheduledRunResponse` / `lastResponse` / `lastScheduledRunNodeTrace`
 * and renders them; it never fetches, never mutates, never invents run state.
 *
 *   - Response: the real last response body as a collapsible JSON tree.
 *     Large branches are chunked (first CHUNK entries + "Show N more") so any
 *     payload stays scannable.
 *   - Trace: the per-node execution trace — failures carry their reason
 *     inline so a broken step is visible at the exact node.
 *   - Details: the compact binding/run facts (method, status, run id, when).
 *
 * Dynamic references: `refBase="input"` renders a copyable
 * `{{input.<path>}}` chip per leaf — the SAME substitution grammar the graph
 * runner already applies to downstream node endpoints and body templates
 * (lib/orchestration-graph-runner.js substituteVariables). No new grammar.
 *
 * Reuses .dm-btn-outline and the dm-inbound-* structural classes; no new
 * design system, no icons.
 */

const CHUNK = 12;

function parseMaybeJson(text) {
  const raw = String(text == null ? "" : text).trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function previewValue(value) {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value.length > 80 ? `${value.slice(0, 77)}...` : value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.length}]`;
  if (typeof value === "object") return `{${Object.keys(value).length}}`;
  return String(value);
}

function RefChip({ path }) {
  const [copied, setCopied] = useState(false);
  const token = `{{input.${path}}}`;
  return (
    <button
      type="button"
      className="dm-json-ref"
      title={`Copy ${token} — usable in downstream node endpoints and body templates`}
      onClick={() => {
        try {
          navigator.clipboard.writeText(token);
        } catch {
          /* clipboard unavailable — the title still shows the token */
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? "Copied" : token}
    </button>
  );
}

function Branch({ name, value, depth, refBase, path }) {
  const [open, setOpen] = useState(depth < 1);
  const [shown, setShown] = useState(CHUNK);
  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item])
    : Object.entries(value || {});
  const visible = entries.slice(0, shown);
  const hidden = entries.length - visible.length;
  return (
    <div className="dm-json-branch">
      <button type="button" className="dm-json-row is-branch" onClick={() => setOpen(!open)}>
        <i>{open ? "▾" : "▸"}</i>
        <span className="dm-json-key">{name}</span>
        <span className="dm-json-meta">{previewValue(value)}</span>
      </button>
      {open ? (
        <div className="dm-json-children">
          {visible.map(([key, child]) => (
            <Node key={key} name={key} value={child} depth={depth + 1} refBase={refBase} path={path ? `${path}.${key}` : key} />
          ))}
          {hidden > 0 ? (
            <button type="button" className="dm-json-more" onClick={() => setShown(shown + CHUNK * 4)}>
              Show {hidden} more
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Node({ name, value, depth, refBase, path }) {
  const isBranch = value !== null && typeof value === "object" && (Array.isArray(value) ? value.length : Object.keys(value).length);
  if (isBranch) return <Branch name={name} value={value} depth={depth} refBase={refBase} path={path} />;
  return (
    <div className="dm-json-row">
      <span className="dm-json-key">{name}</span>
      <span className="dm-json-value">{previewValue(value)}</span>
      {refBase && path ? <RefChip path={path} /> : null}
    </div>
  );
}

/** Collapsible, chunked JSON tree. `refBase="input"` adds per-leaf copyable
 * `{{input.<path>}}` reference chips (the runner's substitution grammar). */
export function JsonTree({ value, refBase = "" }) {
  if (value === null || typeof value !== "object") {
    return <p className="dm-json-scalar">{previewValue(value)}</p>;
  }
  const entries = Array.isArray(value) ? value.map((item, index) => [String(index), item]) : Object.entries(value);
  return (
    <div className="dm-json-tree">
      {entries.map(([key, child]) => (
        <Node key={key} name={key} value={child} depth={0} refBase={refBase} path={key} />
      ))}
    </div>
  );
}

const TABS = [
  { id: "response", label: "Response" },
  { id: "trace", label: "Trace" },
  { id: "details", label: "Details" },
];

export function InboundResponseInspector({ sandboxRow, methodLabel }) {
  const [tab, setTab] = useState("response");
  const lastStatus = String(sandboxRow?.lastScheduledRunStatus || "").trim();
  const ok = lastStatus.startsWith("2");

  const responseJson = useMemo(
    () => parseMaybeJson(sandboxRow?.lastResponse) ?? parseMaybeJson(sandboxRow?.lastScheduledRunResponse),
    [sandboxRow?.lastResponse, sandboxRow?.lastScheduledRunResponse],
  );
  const responseRaw = String(sandboxRow?.lastResponse || sandboxRow?.lastScheduledRunResponse || "").trim();
  const trace = useMemo(() => {
    const parsed = parseMaybeJson(sandboxRow?.lastScheduledRunNodeTrace);
    return Array.isArray(parsed) ? parsed : [];
  }, [sandboxRow?.lastScheduledRunNodeTrace]);

  if (!lastStatus && !responseRaw) return null;

  return (
    <div className="dm-inbound-inspector">
      <div className="dm-inbound-tabs" role="tablist">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={tab === entry.id ? "is-active" : ""}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div className="dm-inbound-inspector-body">
        {tab === "response" ? (
          responseJson !== null ? (
            <JsonTree value={responseJson} />
          ) : responseRaw ? (
            <pre className="dm-json-raw">{responseRaw}</pre>
          ) : (
            <p className="dm-inbound-help">No response body recorded yet.</p>
          )
        ) : null}
        {tab === "trace" ? (
          trace.length ? (
            <ul className="dm-inbound-trace">
              {trace.map((node, index) => {
                const status = String(node?.status || "").trim() || "unknown";
                return (
                  <li key={`${node?.nodeId || node?.id || index}`} className={`is-${status}`}>
                    <code>{node?.nodeId || node?.id || `node-${index + 1}`}</code>
                    <span>{status}</span>
                    {node?.failureReason || node?.error ? <em>{String(node.failureReason || node.error)}</em> : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="dm-inbound-help">No node trace recorded for the last run.</p>
          )
        ) : null}
        {tab === "details" ? (
          <div className="dm-inbound-detail-grid">
            <div><span>Method</span><code>{methodLabel || String(sandboxRow?.lastScheduledRunTriggerKind || "")}</code></div>
            <div><span>HTTP status</span><code className={ok ? "is-ok" : "is-bad"}>{lastStatus || "—"}</code></div>
            <div><span>Run</span><code>{String(sandboxRow?.lastScheduledRunId || "—")}</code></div>
            <div><span>At</span><code>{String(sandboxRow?.lastScheduledRunAt || sandboxRow?.lastTested || "—")}</code></div>
            <div><span>Nodes completed</span><code>{String(sandboxRow?.lastScheduledRunNodesCompleted || "—")}</code></div>
            {sandboxRow?.lastScheduledRunFailureReason ? (
              <div className="is-span"><span>Failure</span><em>{String(sandboxRow.lastScheduledRunFailureReason)}</em></div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
