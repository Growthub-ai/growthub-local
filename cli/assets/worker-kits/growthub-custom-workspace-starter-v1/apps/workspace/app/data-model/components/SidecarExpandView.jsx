"use client";

/**
 * SidecarExpandView — full-width takeover WITHIN the existing helper sidecar
 * system (SWARM_RUN_CONTRACT_V1, Phase 5).
 *
 * Not a modal and not a route: the parent HelperSidecar widens its own aside
 * while this view is active and renders this wrapper inside the same body.
 * Back returns to the prior sidecar view; Esc collapses (handled by the
 * parent so it composes with the sidecar's existing Esc-to-close); the
 * sidecar close button keeps closing the whole sidecar.
 *
 * Reuses the existing sidecar header/body grammar — no new modal stack, no
 * new visual language.
 */

import { ArrowLeft } from "lucide-react";

export function SidecarExpandView({ title, onBack, children }) {
  return (
    <div className="dm-swarm-expand" data-sidecar-expand="">
      <div className="dm-swarm-expand-head">
        <button
          type="button"
          className="dm-sidecar-icon-btn"
          onClick={onBack}
          aria-label="Back"
          title="Back (Esc)"
        >
          <ArrowLeft size={14} />
        </button>
        <span className="dm-sidecar-title">{title}</span>
      </div>
      <div className="dm-swarm-expand-body">{children}</div>
    </div>
  );
}
