"use client";

import { useState } from "react";

export function OrchestrationGraphEmptyCanvas({
  onStartFromRegistry,
  onStartBlank,
  onPasteGraph,
  disabled
}) {
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");

  return (
    <div className="dm-orchestration-canvas dm-orchestration-canvas--empty-state" aria-label="Empty orchestration graph">
      <div className="dm-orchestration-canvas__empty-card">
        <h3>Start orchestration graph</h3>
        <p>Create a governed run plan for this sandbox tool. Nothing executes until Run sandbox.</p>
        <div className="dm-orchestration-canvas__empty-actions">
          <button type="button" className="dm-btn-primary-sm" disabled={disabled} onClick={onStartFromRegistry}>
            Start from API Registry
          </button>
          <button type="button" className="dm-btn-outline" disabled={disabled} onClick={onStartBlank}>
            Start blank
          </button>
        </div>
        <details
          className="dm-orchestration-canvas__paste"
          open={showPaste}
          onToggle={(e) => setShowPaste(e.target.open)}
        >
          <summary>Paste graph JSON</summary>
          <textarea
            rows={6}
            value={pasteText}
            disabled={disabled}
            placeholder='{"version":1,"provider":"growthub-native","nodes":[],"edges":[]}'
            onChange={(e) => setPasteText(e.target.value)}
          />
          <button
            type="button"
            className="dm-btn-outline"
            disabled={disabled || !pasteText.trim()}
            onClick={() => onPasteGraph?.(pasteText)}
          >
            Apply pasted graph
          </button>
        </details>
      </div>
    </div>
  );
}
