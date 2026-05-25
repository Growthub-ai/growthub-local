"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle, ExternalLink, Loader2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";

/**
 * NangoConnectionPanel — interactive sidecar for an api-registry row whose
 * `connectorKind === "nango"`. Surfaces three operations:
 *
 *   1. Create Connect Session → opens Nango Connect UI in a new window
 *   2. Auto-poll connection status every 3s for ~60s after a session opens
 *   3. Manual "Check Connection" verification button
 *
 * The panel reads `providerConfigKey`, `integrationId`, and `connectionIds`
 * off the row (with sensible fallbacks) and never persists secrets. It calls
 * server routes which themselves go through `@nangohq/node`. The browser
 * never sees the Nango secret key or any provider OAuth credential.
 *
 * Props:
 *   row      — the api-registry row being edited
 *   disabled — disable all controls (typically when the parent is saving)
 *   onUpdateRow(patch) — optional: parent applies patch (e.g. status:
 *     "connected", lastTested timestamp) when verification succeeds
 */

const POLL_INTERVAL_MS = 3000;
const POLL_DURATION_MS = 60000;

function deriveProviderConfigKey(row) {
  if (typeof row?.providerConfigKey === "string" && row.providerConfigKey.trim()) {
    return row.providerConfigKey.trim();
  }
  if (typeof row?.integrationId === "string" && row.integrationId.trim()) {
    return row.integrationId.trim();
  }
  return "";
}

function deriveDefaultConnectionId(row) {
  if (Array.isArray(row?.connectionIds) && row.connectionIds.length) {
    return String(row.connectionIds[0]).trim();
  }
  if (typeof row?.connectionIds === "string" && row.connectionIds.trim()) {
    return row.connectionIds.split(",").map((c) => c.trim()).filter(Boolean)[0] || "";
  }
  if (typeof row?.connectionId === "string" && row.connectionId.trim()) {
    return row.connectionId.trim();
  }
  return "";
}

function validateField(name, value) {
  if (!value) {
    return name === "providerConfigKey"
      ? "providerConfigKey is required (the Nango integration key)."
      : "connectionId is required to verify a specific tenant.";
  }
  if (name === "providerConfigKey" && !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(value)) {
    return "Use letters, digits, _, ., or - (max 64 chars, starts alphanumeric).";
  }
  if (name === "connectionId" && value.length > 256) {
    return "connectionId is too long (max 256 chars).";
  }
  return null;
}

function StatusBadge({ status, label }) {
  const map = {
    connected: { className: "dm-api-action-card-status connected", Icon: CheckCircle },
    "not-connected": { className: "dm-api-action-card-status warn", Icon: XCircle },
    error: { className: "dm-api-action-card-status error", Icon: XCircle },
    pending: { className: "dm-api-action-card-status pending", Icon: Loader2 },
    unknown: { className: "dm-api-action-card-status", Icon: ShieldCheck }
  };
  const { className, Icon } = map[status] || map.unknown;
  return (
    <span className={className} role="status" aria-live="polite">
      <Icon size={14} aria-hidden="true" />
      <span>{label || status}</span>
    </span>
  );
}

export function NangoConnectionPanel({ row, disabled, onUpdateRow }) {
  const initialProviderConfigKey = useMemo(() => deriveProviderConfigKey(row), [row]);
  const initialConnectionId = useMemo(() => deriveDefaultConnectionId(row), [row]);

  const [providerConfigKey, setProviderConfigKey] = useState(initialProviderConfigKey);
  const [connectionId, setConnectionId] = useState(initialConnectionId);
  const [fieldErrors, setFieldErrors] = useState({});
  const [creatingSession, setCreatingSession] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [polling, setPolling] = useState(false);
  const [statusKind, setStatusKind] = useState("unknown");
  const [statusMessage, setStatusMessage] = useState("");
  const [connectLink, setConnectLink] = useState(null);
  const [lastSummary, setLastSummary] = useState(null);
  const [errorRecovery, setErrorRecovery] = useState(null);

  const pollTimerRef = useRef(null);
  const pollDeadlineRef = useRef(0);

  // Reset the form when a different row is selected.
  useEffect(() => {
    setProviderConfigKey(initialProviderConfigKey);
    setConnectionId(initialConnectionId);
    setFieldErrors({});
    setConnectLink(null);
    setLastSummary(null);
    setErrorRecovery(null);
    setStatusKind("unknown");
    setStatusMessage("");
    setPolling(false);
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, [row?.id, row?.integrationId, initialProviderConfigKey, initialConnectionId]);

  useEffect(() => () => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
  }, []);

  const handleBlur = useCallback((name, value) => {
    const error = validateField(name, value.trim());
    setFieldErrors((prev) => ({ ...prev, [name]: error }));
  }, []);

  const runStatusCheck = useCallback(async (silent = false) => {
    if (!silent) setCheckingConnection(true);
    setErrorRecovery(null);
    try {
      const response = await fetch("/api/workspace/integrations/nango/connection-status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerConfigKey: providerConfigKey.trim(),
          connectionId: connectionId.trim()
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        const message = payload?.error || `HTTP ${response.status}`;
        setStatusKind("error");
        setStatusMessage(message);
        setErrorRecovery({
          message,
          code: payload?.code || null,
          hint: payload?.code === "NANGO_NOT_CONFIGURED"
            ? "Set NANGO_SECRET_KEY in this runtime to enable Nango."
            : payload?.code === "NANGO_SDK_UNAVAILABLE"
              ? "Install @nangohq/node in apps/workspace."
              : null
        });
        return { ok: false };
      }
      setLastSummary(payload);
      if (payload.status === "connected") {
        setStatusKind("connected");
        setStatusMessage(`Connected · environment: ${payload.environment || "dev"}`);
        if (typeof onUpdateRow === "function") {
          onUpdateRow({
            status: "connected",
            lastTested: new Date().toISOString(),
            lastResponse: JSON.stringify({ connection: payload.connection || {} })
          });
        }
        return { ok: true, connected: true };
      }
      setStatusKind("not-connected");
      setStatusMessage(payload.reason || "Not connected yet.");
      return { ok: true, connected: false };
    } catch (error) {
      const message = error?.message || "network error";
      setStatusKind("error");
      setStatusMessage(message);
      setErrorRecovery({ message, code: null, hint: null });
      return { ok: false };
    } finally {
      if (!silent) setCheckingConnection(false);
    }
  }, [providerConfigKey, connectionId, onUpdateRow]);

  const startPolling = useCallback(() => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    pollDeadlineRef.current = Date.now() + POLL_DURATION_MS;
    setPolling(true);
    const tick = async () => {
      if (Date.now() > pollDeadlineRef.current) {
        setPolling(false);
        if (statusKind !== "connected") {
          setStatusKind("not-connected");
          setStatusMessage("Still waiting on Nango Connect — click Check Connection when you've finished OAuth.");
        }
        return;
      }
      const result = await runStatusCheck(true);
      if (result?.connected) {
        setPolling(false);
        return;
      }
      pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
    };
    pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
  }, [runStatusCheck, statusKind]);

  const handleCreateSession = useCallback(async () => {
    const errors = {
      providerConfigKey: validateField("providerConfigKey", providerConfigKey.trim()),
      connectionId: validateField("connectionId", connectionId.trim())
    };
    setFieldErrors(errors);
    if (errors.providerConfigKey || errors.connectionId) return;

    setCreatingSession(true);
    setConnectLink(null);
    setErrorRecovery(null);
    setStatusKind("pending");
    setStatusMessage("Creating Nango Connect session…");
    try {
      const response = await fetch("/api/workspace/integrations/nango/connect-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerConfigKey: providerConfigKey.trim(),
          connectionId: connectionId.trim()
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        const message = payload?.error || `HTTP ${response.status}`;
        setStatusKind("error");
        setStatusMessage(message);
        setErrorRecovery({
          message,
          code: payload?.code || null,
          hint: payload?.code === "NANGO_NOT_CONFIGURED"
            ? "Set NANGO_SECRET_KEY in this runtime to enable Nango."
            : payload?.code === "NANGO_SDK_UNAVAILABLE"
              ? "Install @nangohq/node in apps/workspace."
              : null
        });
        return;
      }
      if (!payload.connectLink) {
        setStatusKind("error");
        setStatusMessage("Nango returned a session without a connect_link. Check your Nango Cloud setup.");
        return;
      }
      setConnectLink(payload.connectLink);
      setStatusKind("pending");
      setStatusMessage("Open the Connect link to finish OAuth — we'll auto-detect when it completes.");
      // Auto-open in a new window so the user doesn't lose the workspace tab.
      try {
        const win = window.open(payload.connectLink, "_blank", "noopener,noreferrer");
        if (win) win.focus();
      } catch {
        // Some browsers block window.open silently; the manual button below
        // still works as a fallback.
      }
      startPolling();
    } catch (error) {
      const message = error?.message || "network error";
      setStatusKind("error");
      setStatusMessage(message);
      setErrorRecovery({ message, code: null, hint: null });
    } finally {
      setCreatingSession(false);
    }
  }, [providerConfigKey, connectionId, startPolling]);

  const handleDisconnect = useCallback(() => {
    setConnectLink(null);
    setLastSummary(null);
    setStatusKind("unknown");
    setStatusMessage("");
    setPolling(false);
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (typeof onUpdateRow === "function") {
      onUpdateRow({ status: "configured", lastResponse: "" });
    }
  }, [onUpdateRow]);

  const isBusy = creatingSession || checkingConnection || polling;
  const hasFieldErrors = Boolean(fieldErrors.providerConfigKey || fieldErrors.connectionId);

  return (
    <section className="dm-api-action-card" aria-label="Nango connection">
      <div className="dm-api-action-card-body">
        <p className="dm-api-action-card-eyebrow">Nango</p>
        <h3>Connect this API through Nango</h3>
        <p>
          Nango handles OAuth and API authentication for hundreds of providers. Your provider credentials stay on Nango — this workspace only sees safe connection metadata, never tokens.
        </p>

        <div className="dm-nango-fields">
          <label className="dm-field">
            <span>providerConfigKey</span>
            <input
              type="text"
              value={providerConfigKey}
              onChange={(event) => setProviderConfigKey(event.target.value)}
              onBlur={(event) => handleBlur("providerConfigKey", event.target.value)}
              placeholder="e.g. hubspot-prod"
              disabled={disabled || isBusy}
              aria-invalid={Boolean(fieldErrors.providerConfigKey)}
              aria-describedby={fieldErrors.providerConfigKey ? "nango-pck-error" : undefined}
            />
            {fieldErrors.providerConfigKey
              ? <small id="nango-pck-error" className="dm-field-error">{fieldErrors.providerConfigKey}</small>
              : <small className="dm-field-hint">Defaults to <code>integrationId</code> when blank.</small>}
          </label>

          <label className="dm-field">
            <span>connectionId</span>
            <input
              type="text"
              value={connectionId}
              onChange={(event) => setConnectionId(event.target.value)}
              onBlur={(event) => handleBlur("connectionId", event.target.value)}
              placeholder="tenant or account identifier"
              disabled={disabled || isBusy}
              aria-invalid={Boolean(fieldErrors.connectionId)}
              aria-describedby={fieldErrors.connectionId ? "nango-cid-error" : undefined}
            />
            {fieldErrors.connectionId
              ? <small id="nango-cid-error" className="dm-field-error">{fieldErrors.connectionId}</small>
              : <small className="dm-field-hint">Stored in the row's <code>connectionIds</code> set.</small>}
          </label>
        </div>

        <StatusBadge status={statusKind} label={statusMessage || statusKind} />

        {connectLink ? (
          <p className="dm-nango-connect-link">
            <a href={connectLink} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} aria-hidden="true" /> Reopen Nango Connect link
            </a>
          </p>
        ) : null}

        {errorRecovery ? (
          <div className="dm-nango-error-recovery" role="alert">
            <p>{errorRecovery.message}</p>
            {errorRecovery.hint ? <p className="dm-nango-error-hint">{errorRecovery.hint}</p> : null}
            <button
              type="button"
              className="dm-btn-outline"
              onClick={() => runStatusCheck(false)}
              disabled={disabled || isBusy || hasFieldErrors}
            >
              <RefreshCw size={14} aria-hidden="true" /> Try Again
            </button>
          </div>
        ) : null}
      </div>

      <div className="dm-api-action-card-actions">
        <button
          type="button"
          className="dm-btn-primary-sm dm-api-action-card-cta"
          onClick={handleCreateSession}
          disabled={disabled || isBusy || hasFieldErrors}
        >
          {creatingSession
            ? <><Loader2 className="dm-spinner" size={14} aria-hidden="true" /> Creating session…</>
            : "Create Connect Session"}
        </button>
        <button
          type="button"
          className="dm-btn-outline dm-api-action-card-cta"
          onClick={() => runStatusCheck(false)}
          disabled={disabled || isBusy || hasFieldErrors}
        >
          {checkingConnection
            ? <><Loader2 className="dm-spinner" size={14} aria-hidden="true" /> Checking…</>
            : polling
              ? <><Loader2 className="dm-spinner" size={14} aria-hidden="true" /> Auto-polling…</>
              : "Check Connection"}
        </button>
        {statusKind === "connected" && lastSummary ? (
          <button
            type="button"
            className="dm-btn-outline dm-api-action-card-cta"
            onClick={handleDisconnect}
            disabled={disabled || isBusy}
          >
            Reset
          </button>
        ) : null}
      </div>
    </section>
  );
}
