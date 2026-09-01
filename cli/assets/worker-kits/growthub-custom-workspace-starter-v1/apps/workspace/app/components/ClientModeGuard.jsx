"use client";

import { useEffect, useState } from "react";
import { deriveClientInterface } from "@/lib/client-interface";
import { ClientModeNotAvailable } from "./ClientModeNotAvailable.jsx";

/**
 * Client-side guard for thin "use client" operator pages (Data Model,
 * Training, Workspace Map). Reads the live workspace artifact through the
 * existing GET /api/workspace read lane, derives client-interface-v1 state,
 * and renders either the wrapped surface (operator mode) or the honest
 * not-available state (client mode).
 *
 * Fail-closed while resolving: nothing renders until the mode is known, so
 * a client-mode workspace never flashes an operator surface.
 */
export function ClientModeGuard({ surface, children }) {
  const [state, setState] = useState("resolving"); // resolving | operator | client

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/workspace");
        const body = await res.json().catch(() => ({}));
        const config = body?.workspaceConfig || body?.config || body || {};
        const derived = deriveClientInterface(config);
        if (!cancelled) setState(derived.isClient ? "client" : "operator");
      } catch {
        // Read failure: keep operator continuity — the page's own data layer
        // will surface its real error state.
        if (!cancelled) setState("operator");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "resolving") return null;
  if (state === "client") return <ClientModeNotAvailable surface={surface} />;
  return children;
}
