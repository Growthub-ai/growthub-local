"use client";

/**
 * NangoConnectionPanel — compact sidecar controls for API Registry rows that
 * delegate auth to Nango.
 *
 * Boundary invariants:
 *   - This component is SAFE-fields-only. It reads/writes:
 *       authAuthority, nangoProviderConfigKey, nangoConnectionId,
 *       nangoStatus, nangoLastCheckedAt, nangoLastError
 *   - It NEVER reads or writes:
 *       NANGO_SECRET_KEY, OAuth access_token, OAuth refresh_token,
 *       provider credentials, raw connection.credentials,
 *       Authorization headers, Bearer tokens.
 *   - It only renders for `objectType === "api-registry"` rows.
 *   - Connect Session and Connection Status requests go through the server
 *     routes at /api/workspace/nango/*. The browser never holds the Nango
 *     secret. It only displays returned tokens/links that are themselves
 *     short-lived session artefacts.
 */
import { useCallback, useState } from "react";

const AUTH_AUTHORITY_OPTIONS = [
  { value: "direct-env", label: "Direct env" },
  { value: "nango", label: "Nango" },
  { value: "none", label: "None" }
];

export function NangoConnectionPanel({
  draft,
  disabled = false,
  onDraftChange
}) {
  const [sessionState, setSessionState] = useState({ status: "idle", error: "", connectLink: "", expiresAt: "" });
  const [statusState, setStatusState] = useState({ status: "idle", error: "", connection: null });

  const authAuthority = String(draft?.authAuthority || "direct-env").trim();
  const isNango = authAuthority === "nango";
  const providerConfigKey = String(draft?.nangoProviderConfigKey || "").trim();
  const connectionId = String(draft?.nangoConnectionId || "").trim();

  const patchDraft = useCallback((patch) => {
    if (typeof onDraftChange !== "function") return;
    onDraftChange(patch);
  }, [onDraftChange]);

  const handleAuthorityChange = useCallback((event) => {
    patchDraft({ authAuthority: event.target.value });
  }, [patchDraft]);

  const createConnectSession = useCallback(async () => {
    if (!providerConfigKey) return;
    setSessionState({ status: "pending", error: "", connectLink: "", expiresAt: "" });
    try {
      const response = await fetch("/api/workspace/nango/connect-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerConfigKey,
          ...(connectionId ? { connectionId } : {})
        })
      });
      const payload = await response.json();
      if (!payload?.ok) {
        setSessionState({ status: "error", error: payload?.error || "connect session failed", connectLink: "", expiresAt: "" });
        return;
      }
      setSessionState({
        status: "ok",
        error: "",
        connectLink: String(payload.connect_link || ""),
        expiresAt: String(payload.expires_at || "")
      });
    } catch (error) {
      setSessionState({ status: "error", error: error?.message || "connect session failed", connectLink: "", expiresAt: "" });
    }
  }, [providerConfigKey, connectionId]);

  const checkConnection = useCallback(async () => {
    if (!providerConfigKey || !connectionId) return;
    setStatusState({ status: "pending", error: "", connection: null });
    try {
      const response = await fetch("/api/workspace/nango/connection-status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ providerConfigKey, connectionId })
      });
      const payload = await response.json();
      const nextStatus = payload?.ok ? "connected" : (payload?.status || "error");
      patchDraft({
        nangoStatus: nextStatus,
        nangoLastCheckedAt: payload?.checkedAt || new Date().toISOString(),
        nangoLastError: payload?.ok ? "" : String(payload?.error || "")
      });
      if (!payload?.ok) {
        setStatusState({ status: "error", error: payload?.error || "status check failed", connection: null });
        return;
      }
      setStatusState({ status: "ok", error: "", connection: payload.connection || null });
    } catch (error) {
      setStatusState({ status: "error", error: error?.message || "status check failed", connection: null });
    }
  }, [providerConfigKey, connectionId, patchDraft]);

  return (
    <section className="dm-api-action-card" aria-label="Nango connection">
      <div className="dm-api-action-card-body">
        <p className="dm-api-action-card-eyebrow">Auth authority</p>
        <h3>Nango connection</h3>
        <p className="dm-api-action-card-note">
          Nango is a row-level auth/proxy authority. No secrets are stored in this workspace — NANGO_SECRET_KEY stays server-side.
        </p>

        <label className="dm-field-label" htmlFor="nango-auth-authority">
          Auth authority
        </label>
        <select
          id="nango-auth-authority"
          className="dm-field-input"
          value={authAuthority}
          disabled={disabled}
          onChange={handleAuthorityChange}
        >
          {AUTH_AUTHORITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>

        {isNango && (
          <>
            <label className="dm-field-label" htmlFor="nango-provider-config-key">
              Provider config key
            </label>
            <input
              id="nango-provider-config-key"
              className="dm-field-input"
              type="text"
              value={providerConfigKey}
              disabled={disabled}
              placeholder="github-prod"
              onChange={(event) => patchDraft({ nangoProviderConfigKey: event.target.value })}
            />

            <label className="dm-field-label" htmlFor="nango-connection-id">
              Connection ID
            </label>
            <input
              id="nango-connection-id"
              className="dm-field-input"
              type="text"
              value={connectionId}
              disabled={disabled}
              placeholder="customer-123"
              onChange={(event) => patchDraft({ nangoConnectionId: event.target.value })}
            />

            <div className="dm-api-action-card-actions">
              <button
                type="button"
                className="dm-btn-outline dm-api-action-card-cta"
                disabled={disabled || !providerConfigKey || sessionState.status === "pending"}
                onClick={createConnectSession}
              >
                {sessionState.status === "pending" ? "Creating…" : "Create connect session"}
              </button>
              <button
                type="button"
                className="dm-btn-primary-sm dm-api-action-card-cta"
                disabled={disabled || !providerConfigKey || !connectionId || statusState.status === "pending"}
                onClick={checkConnection}
              >
                {statusState.status === "pending" ? "Checking…" : "Check connection"}
              </button>
            </div>

            {sessionState.status === "ok" && sessionState.connectLink && (
              <p className="dm-api-action-card-note">
                <a href={sessionState.connectLink} target="_blank" rel="noreferrer">Open connect link</a>
                {sessionState.expiresAt ? ` — expires ${sessionState.expiresAt}` : ""}
              </p>
            )}
            {sessionState.status === "error" && (
              <p className="dm-api-action-card-note" role="alert">Session error: {sessionState.error}</p>
            )}
            {statusState.status === "ok" && statusState.connection && (
              <p className="dm-api-action-card-note">
                Connected{statusState.connection.provider ? ` to ${statusState.connection.provider}` : ""}
                {statusState.connection.created_at ? ` · created ${statusState.connection.created_at}` : ""}
              </p>
            )}
            {statusState.status === "error" && (
              <p className="dm-api-action-card-note" role="alert">Status error: {statusState.error}</p>
            )}
            {draft?.nangoStatus && draft.nangoStatus !== "unknown" && (
              <p className="dm-api-action-card-note">
                Last status: {String(draft.nangoStatus)}
                {draft?.nangoLastCheckedAt ? ` · ${draft.nangoLastCheckedAt}` : ""}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
