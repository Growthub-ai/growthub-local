"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle, ChevronRight, ExternalLink, Loader2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";

/**
 * NangoConnectionPanel — interactive sidecar for an api-registry row whose
 * `connectorKind === "nango"`. Aligns with Nango's documented OAuth
 * lifecycle:
 *
 *   1. Create Connect Session — needs `providerConfigKey` only. Nango
 *      mints a session token + connect_link. The user opens the link and
 *      completes OAuth on the provider.
 *   2. Nango generates the `connectionId` server-side and delivers it via
 *      the auth webhook (which an operator can persist into the row's
 *      `connectionIds` later — webhook persistence is a follow-up).
 *   3. The user pastes the `connectionId` shown in Nango Cloud / received
 *      via webhook into the panel; "Check Connection" then verifies it.
 *   4. Reconnect uses the existing `connectionId` as input and produces a
 *      fresh authorization session for the same connection.
 *
 * The panel reads `providerConfigKey`, `integrationId`, and `connectionIds`
 * off the row (with sensible fallbacks) and never persists secrets. It
 * calls server routes which themselves go through `@nangohq/node`. The
 * browser never sees the Nango secret key or any provider OAuth credential.
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

function deriveInitialStatus(row) {
  const status = typeof row?.status === "string" ? row.status.trim().toLowerCase() : "";
  if (status === "connected") {
    return {
      kind: "connected",
      message: row?.lastTested
        ? `Connected · last verified ${formatRelativeTime(row.lastTested)}`
        : "Connected"
    };
  }
  if (status === "failed" || status === "error") {
    return { kind: "error", message: "Last verification failed. Re-check the connection." };
  }
  return { kind: "unknown", message: "" };
}

function formatRelativeTime(isoString) {
  const ts = new Date(isoString);
  if (Number.isNaN(ts.getTime())) return "recently";
  const diffMs = Date.now() - ts.getTime();
  if (diffMs < 60_000) return "just now";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return `${Math.floor(diffMs / 86_400_000)}d ago`;
}

function validateProviderConfigKey(value) {
  if (!value) return "providerConfigKey is required (the Nango integration key).";
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(value)) {
    return "Use letters, digits, _, ., or - (max 64 chars, starts alphanumeric).";
  }
  return null;
}

function validateConnectionIdField(value, { required }) {
  if (!value) return required ? "connectionId is required to verify or reconnect." : null;
  if (value.length > 256) return "connectionId is too long (max 256 chars).";
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

export function NangoConnectionPanel({ row, disabled, onUpdateRow, templateContext }) {
  const initialProviderConfigKey = useMemo(() => deriveProviderConfigKey(row), [row]);
  const initialConnectionId = useMemo(() => deriveDefaultConnectionId(row), [row]);
  const initialStatus = useMemo(() => deriveInitialStatus(row), [row]);
  const lastTested = typeof row?.lastTested === "string" ? row.lastTested : "";
  const persistedStatus = typeof row?.status === "string" ? row.status.trim().toLowerCase() : "";

  const [providerConfigKey, setProviderConfigKey] = useState(initialProviderConfigKey);
  const [connectionId, setConnectionId] = useState(initialConnectionId);
  const [fieldErrors, setFieldErrors] = useState({});
  const [creatingSession, setCreatingSession] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [polling, setPolling] = useState(false);
  const [statusKind, setStatusKind] = useState(initialStatus.kind);
  const [statusMessage, setStatusMessage] = useState(initialStatus.message);
  const [connectLink, setConnectLink] = useState(null);
  const [sessionMode, setSessionMode] = useState(null);
  const [lastSummary, setLastSummary] = useState(null);
  const [errorRecovery, setErrorRecovery] = useState(null);

  const pollTimerRef = useRef(null);
  const pollDeadlineRef = useRef(0);

  useEffect(() => {
    setProviderConfigKey(initialProviderConfigKey);
    setConnectionId(initialConnectionId);
    setFieldErrors({});
    setConnectLink(null);
    setSessionMode(null);
    setLastSummary(null);
    setErrorRecovery(null);
    setStatusKind(initialStatus.kind);
    setStatusMessage(initialStatus.message);
    setPolling(false);
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, [row?.id, row?.integrationId, initialProviderConfigKey, initialConnectionId, initialStatus.kind, initialStatus.message]);

  useEffect(() => () => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
  }, []);

  const handleProviderConfigKeyBlur = useCallback((value) => {
    setFieldErrors((prev) => ({ ...prev, providerConfigKey: validateProviderConfigKey(value.trim()) }));
  }, []);

  const handleConnectionIdBlur = useCallback((value) => {
    setFieldErrors((prev) => ({ ...prev, connectionId: validateConnectionIdField(value.trim(), { required: false }) }));
  }, []);

  const runStatusCheck = useCallback(async (silent = false) => {
    const connectionIdValue = connectionId.trim();
    const connectionIdError = validateConnectionIdField(connectionIdValue, { required: true });
    if (connectionIdError) {
      setFieldErrors((prev) => ({ ...prev, connectionId: connectionIdError }));
      return { ok: false, missingConnectionId: true };
    }
    if (!silent) setCheckingConnection(true);
    setErrorRecovery(null);
    try {
      const response = await fetch("/api/workspace/integrations/nango/connection-status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerConfigKey: providerConfigKey.trim(),
          connectionId: connectionIdValue
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
    if (!connectionId.trim()) {
      // Without a connectionId we can't poll — the user must paste it once
      // Nango delivers it (via Connect UI or the auth webhook).
      return;
    }
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
  }, [runStatusCheck, statusKind, connectionId]);

  const createSession = useCallback(async ({ reconnect }) => {
    const providerError = validateProviderConfigKey(providerConfigKey.trim());
    const connectionIdError = reconnect
      ? validateConnectionIdField(connectionId.trim(), { required: true })
      : null;
    setFieldErrors((prev) => ({ ...prev, providerConfigKey: providerError, connectionId: connectionIdError }));
    if (providerError || connectionIdError) return;

    setCreatingSession(true);
    setConnectLink(null);
    setSessionMode(null);
    setErrorRecovery(null);
    setStatusKind("pending");
    setStatusMessage(reconnect ? "Creating Nango Reconnect session…" : "Creating Nango Connect session…");

    // Build correlation tags so the auth webhook can identify which row
    // asked for OAuth. No secrets — only stable identifiers.
    const tags = {};
    if (typeof row?.id === "string" && row.id.trim()) tags.row_id = row.id.trim();
    if (typeof row?.integrationId === "string" && row.integrationId.trim()) tags.integration_id = row.integrationId.trim();
    if (typeof row?.objectId === "string" && row.objectId.trim()) tags.object_id = row.objectId.trim();

    try {
      const response = await fetch("/api/workspace/integrations/nango/connect-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerConfigKey: providerConfigKey.trim(),
          ...(reconnect ? { connectionId: connectionId.trim(), reconnect: true } : {}),
          tags
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
      setSessionMode(payload.mode || (reconnect ? "reconnect" : "connect"));
      setStatusKind("pending");
      setStatusMessage(
        reconnect
          ? "Reconnect link ready — complete OAuth, then we'll re-verify automatically."
          : "Open the Connect link to finish OAuth. Nango will return a connectionId — paste it below or wait for the auth webhook to persist it."
      );
      try {
        const win = window.open(payload.connectLink, "_blank", "noopener,noreferrer");
        if (win) win.focus();
      } catch {
        // window.open may be blocked silently — the visible link below still works.
      }
      // Auto-poll only when we already have a connectionId (reconnect flow,
      // or the user pre-filled it for a known existing connection).
      if (connectionId.trim()) {
        startPolling();
      }
    } catch (error) {
      const message = error?.message || "network error";
      setStatusKind("error");
      setStatusMessage(message);
      setErrorRecovery({ message, code: null, hint: null });
    } finally {
      setCreatingSession(false);
    }
  }, [providerConfigKey, connectionId, row, startPolling]);

  const handleCreateSession = useCallback(() => createSession({ reconnect: false }), [createSession]);
  const handleReconnect = useCallback(() => createSession({ reconnect: true }), [createSession]);

  const handleDisconnect = useCallback(() => {
    setConnectLink(null);
    setSessionMode(null);
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
  const hasProviderError = Boolean(fieldErrors.providerConfigKey);
  const hasConnectionIdError = Boolean(fieldErrors.connectionId);
  const hasConnectionId = Boolean(connectionId.trim());

  return (
    <section className="dm-api-action-card" aria-label="Nango connection">
      <div className="dm-api-action-card-body">
        <p className="dm-api-action-card-eyebrow">Nango</p>
        <h3>Connect this API through Nango</h3>
        <p>
          Nango handles OAuth and API authentication for hundreds of providers. Your provider credentials stay on Nango — this workspace only sees safe connection metadata, never tokens.
        </p>

        <ol className="dm-nango-steps">
          <li>Enter the <strong>providerConfigKey</strong> (the Nango integration key).</li>
          <li>Click <strong>Create Connect Session</strong> and complete OAuth in the new tab.</li>
          <li>Paste the <strong>connectionId</strong> Nango shows you (or wait for the auth webhook to persist it), then click <strong>Check Connection</strong>.</li>
        </ol>

        <div className="dm-nango-fields">
          <label className="dm-field">
            <span>providerConfigKey</span>
            <input
              type="text"
              value={providerConfigKey}
              onChange={(event) => setProviderConfigKey(event.target.value)}
              onBlur={(event) => handleProviderConfigKeyBlur(event.target.value)}
              placeholder="e.g. hubspot-prod"
              disabled={disabled || isBusy}
              aria-invalid={hasProviderError}
              aria-describedby={hasProviderError ? "nango-pck-error" : undefined}
            />
            {hasProviderError
              ? <small id="nango-pck-error" className="dm-field-error">{fieldErrors.providerConfigKey}</small>
              : <small className="dm-field-hint">Defaults to <code>integrationId</code> when blank.</small>}
          </label>

          <label className="dm-field">
            <span>connectionId <small>(required to verify or reconnect)</small></span>
            <input
              type="text"
              value={connectionId}
              onChange={(event) => setConnectionId(event.target.value)}
              onBlur={(event) => handleConnectionIdBlur(event.target.value)}
              placeholder="Nango returns this after OAuth"
              disabled={disabled || isBusy}
              aria-invalid={hasConnectionIdError}
              aria-describedby={hasConnectionIdError ? "nango-cid-error" : undefined}
            />
            {hasConnectionIdError
              ? <small id="nango-cid-error" className="dm-field-error">{fieldErrors.connectionId}</small>
              : <small className="dm-field-hint">Nango generates this during OAuth and delivers it via auth webhook.</small>}
          </label>
        </div>

        <StatusBadge status={statusKind} label={statusMessage || statusKind} />

        {persistedStatus === "connected" && lastTested ? (
          <p className="dm-nango-last-tested" aria-label="Last connection verification">
            Last verified <time dateTime={lastTested}>{formatRelativeTime(lastTested)}</time>
          </p>
        ) : null}

        {connectLink ? (
          <p className="dm-nango-connect-link">
            <a href={connectLink} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} aria-hidden="true" />
              {sessionMode === "reconnect" ? " Reopen Nango Reconnect link" : " Reopen Nango Connect link"}
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
              disabled={disabled || isBusy || hasProviderError}
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
          disabled={disabled || isBusy || hasProviderError}
        >
          {creatingSession && sessionMode !== "reconnect"
            ? <><Loader2 className="dm-spinner" size={14} aria-hidden="true" /> Creating session…</>
            : "Create Connect Session"}
        </button>
        {hasConnectionId ? (
          <button
            type="button"
            className="dm-btn-outline dm-api-action-card-cta"
            onClick={handleReconnect}
            disabled={disabled || isBusy || hasProviderError || hasConnectionIdError}
          >
            {creatingSession && sessionMode === "reconnect"
              ? <><Loader2 className="dm-spinner" size={14} aria-hidden="true" /> Reconnecting…</>
              : "Reconnect"}
          </button>
        ) : null}
        <button
          type="button"
          className="dm-btn-outline dm-api-action-card-cta"
          onClick={() => runStatusCheck(false)}
          disabled={disabled || isBusy || hasProviderError}
        >
          {checkingConnection
            ? <><Loader2 className="dm-spinner" size={14} aria-hidden="true" /> Checking…</>
            : polling
              ? <><Loader2 className="dm-spinner" size={14} aria-hidden="true" /> Auto-polling…</>
              : "Check Connection"}
        </button>
        {(statusKind === "connected" || persistedStatus === "connected") ? (
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

      {/* Template activation footer — shown only when the parent passes a
          `templateContext` prop. Non-invasive: with no context the panel
          renders exactly as before. Used by the project-management
          template to nudge the user forward to the next setup step
          (typically "Run Active Tasks workflow") after they verify the
          connection. */}
      {templateContext && templateContext.nextStepHref ? (
        <div className="dm-api-action-card-template-footer">
          {templateContext.backHref ? (
            <a href={templateContext.backHref} className="dm-api-action-card-template-link is-back">
              ← {templateContext.backLabel || "Back to setup checklist"}
            </a>
          ) : null}
          <a href={templateContext.nextStepHref} className="dm-api-action-card-template-link is-next">
            {templateContext.nextStepLabel || "Next step"} <ChevronRight size={13} aria-hidden="true" />
          </a>
        </div>
      ) : null}
    </section>
  );
}
