"use client";

/**
 * ExternalSyncHydrator — governed live hydration for an externally-bound
 * data-source object while the user is viewing it in the Data Model table.
 *
 * Power when present, governance always:
 *   - Supabase Realtime configured (publishable/anon key declared by the
 *     product contract and served by the governed GET — never the service
 *     secret) → native WebSocket postgres_changes subscription; every
 *     external change event triggers the SAME receipted pull the manual
 *     lane uses. No client-side merge, no client-held service credentials.
 *   - Realtime absent or the socket fails → watch polling against the
 *     governed GET's read-only drift lane (?watch=<objectId>), which
 *     compares the live external fingerprint with the object's stamped
 *     causation anchor (lastSyncFingerprint). Drift → the same receipted
 *     pull. Silence otherwise — no receipt spam, pulls fire only on
 *     measured change.
 *
 * Either path lands external truth through POST { action: "pull" } on the
 * one governed door, so receipts, conflict reporting, and sync stamps stay
 * identical to a manual pull.
 */

import { useEffect, useRef, useState } from "react";

const WATCH_POLL_MS = 15000;
const REALTIME_GUARD_POLL_MS = 60000;
const REALTIME_EVENT_DEBOUNCE_MS = 600;
const HEARTBEAT_MS = 25000;

// Registry-row grammar: product integrationIds are providerId-prefixed
// (supabase-postgrest, upstash-redis) — the governed door is provider-scoped.
function providerIdFromRegistryId(registryId) {
  return String(registryId || "").trim().split("-")[0] || "";
}

export function ExternalSyncHydrator({ object, onWorkspaceConfig }) {
  const objectId = String(object?.id || "").trim();
  const externalTable = String(object?.externalTable || "").trim();
  const registryId = String(object?.externalRegistryId || "").trim();
  const providerId = providerIdFromRegistryId(registryId);
  const [mode, setMode] = useState("connecting");
  const [detail, setDetail] = useState("");
  const pullingRef = useRef(false);

  useEffect(() => {
    if (!objectId || !externalTable || !providerId) return undefined;
    let stopped = false;
    let ws = null;
    let pollTimer = null;
    let heartbeatTimer = null;
    let eventDebounce = null;
    const base = `/api/workspace/add-ons/${encodeURIComponent(providerId)}/data`;

    const pullNow = async (reason) => {
      if (stopped || pullingRef.current) return;
      pullingRef.current = true;
      setMode("pulling");
      setDetail(reason);
      try {
        const response = await fetch(base, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "pull", objectId }),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.ok && payload?.workspaceConfig && typeof onWorkspaceConfig === "function") {
          onWorkspaceConfig(payload.workspaceConfig);
          setDetail(payload?.object?.lastSyncSummary || reason);
        }
      } catch {
        /* transient network failure — next drift check retries */
      } finally {
        pullingRef.current = false;
        if (!stopped) setMode(ws ? "realtime" : "watch");
      }
    };

    const checkDrift = async () => {
      if (stopped || pullingRef.current || document.visibilityState !== "visible") return;
      try {
        const response = await fetch(`${base}?watch=${encodeURIComponent(objectId)}`);
        const payload = await response.json().catch(() => ({}));
        if (payload?.watch?.drifted) {
          await pullNow("external change detected — pulling through the governed lane");
        }
      } catch {
        /* transient — next interval retries */
      }
    };

    const startPolling = (intervalMs) => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(checkDrift, intervalMs);
    };

    const startWatchMode = () => {
      if (stopped) return;
      setMode("watch");
      setDetail(`watching ${externalTable} for external changes`);
      startPolling(WATCH_POLL_MS);
    };

    const startRealtime = (realtime) => {
      try {
        ws = new WebSocket(`${realtime.endpoint}?apikey=${encodeURIComponent(realtime.publishableKey)}&vsn=1.0.0`);
      } catch {
        ws = null;
        startWatchMode();
        return;
      }
      const topic = `realtime:hydrate:${externalTable}`;
      let ref = 0;
      const send = (event, payload, overrideTopic) => {
        try {
          ref += 1;
          ws.send(JSON.stringify({ topic: overrideTopic || topic, event, payload, ref: String(ref) }));
        } catch { /* socket teardown races are fine */ }
      };
      ws.onopen = () => {
        if (stopped) { ws.close(); return; }
        send("phx_join", {
          config: {
            postgres_changes: [{ event: "*", schema: realtime.schema || "public", table: externalTable }],
          },
        });
        heartbeatTimer = setInterval(() => send("heartbeat", {}, "phoenix"), HEARTBEAT_MS);
        setMode("realtime");
        setDetail(`Supabase Realtime subscribed to ${externalTable}`);
        // Guard poll: Realtime delivery is best-effort — a slow governed
        // drift check backstops missed events without receipt spam.
        startPolling(REALTIME_GUARD_POLL_MS);
      };
      ws.onmessage = (message) => {
        if (stopped) return;
        let frame = null;
        try { frame = JSON.parse(message.data); } catch { return; }
        const event = String(frame?.event || "");
        if (event === "postgres_changes" || ["INSERT", "UPDATE", "DELETE"].includes(String(frame?.payload?.data?.type || ""))) {
          if (eventDebounce) clearTimeout(eventDebounce);
          eventDebounce = setTimeout(() => pullNow("Realtime change event — pulling through the governed lane"), REALTIME_EVENT_DEBOUNCE_MS);
        }
      };
      const fallBack = () => {
        if (stopped) return;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        ws = null;
        startWatchMode();
      };
      ws.onerror = fallBack;
      ws.onclose = fallBack;
    };

    (async () => {
      // Immediate anchor check so a stale view hydrates on open, not on the
      // first interval tick.
      await checkDrift();
      if (stopped) return;
      try {
        const response = await fetch(`${base}?realtime=1`);
        const payload = await response.json().catch(() => ({}));
        const realtime = payload?.realtime;
        if (realtime?.configured && realtime?.endpoint && realtime?.publishableKey && typeof WebSocket !== "undefined") {
          startRealtime(realtime);
          return;
        }
      } catch { /* readiness fetch failed — fall through to watch */ }
      startWatchMode();
    })();

    return () => {
      stopped = true;
      if (pollTimer) clearInterval(pollTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (eventDebounce) clearTimeout(eventDebounce);
      if (ws) { try { ws.close(); } catch { /* already closed */ } }
    };
  }, [objectId, externalTable, providerId, onWorkspaceConfig]);

  if (!objectId || !externalTable || !providerId) return null;
  const label = mode === "realtime"
    ? "Live · Realtime"
    : mode === "watch"
      ? "Live · Watch"
      : mode === "pulling"
        ? "Syncing…"
        : "Connecting…";
  return (
    <span
      className={`dm-db-status${mode === "realtime" || mode === "watch" ? " ok" : ""}`}
      data-external-sync={mode}
      title={detail || `Governed hydration for ${externalTable}`}
    >
      <span />{label}
    </span>
  );
}

export default ExternalSyncHydrator;
